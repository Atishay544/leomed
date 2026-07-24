-- ============================================================
-- Distributed rate limiting via Supabase
-- Replaces the in-memory Map that reset on every serverless cold start.
-- All Vercel function instances share this single table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key        text        PRIMARY KEY,
  count      integer     NOT NULL DEFAULT 1,
  reset_at   timestamptz NOT NULL
);

-- No RLS needed — only service role (admin client) touches this table
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Periodic cleanup: delete expired rows (called inside the RPC below)
-- Index speeds up the reset_at check on every upsert
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON public.rate_limits (reset_at);

-- ── Atomic rate-limit check + increment ──────────────────────────────────────
-- Returns: allowed (bool), current count, window reset_at
-- Single round-trip: upsert + read in one SQL call, no race conditions.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key            text,
  p_max            integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, req_count integer, window_reset timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      timestamptz := now();
  v_reset_at timestamptz := v_now + (p_window_seconds * interval '1 second');
  v_count    integer;
  v_reset    timestamptz;
BEGIN
  -- Upsert: insert new window or increment existing window
  -- If the stored reset_at is in the past the window expired — reset to 1
  INSERT INTO public.rate_limits (key, count, reset_at)
  VALUES (p_key, 1, v_reset_at)
  ON CONFLICT (key) DO UPDATE
    SET count    = CASE
                     WHEN rate_limits.reset_at < v_now THEN 1
                     ELSE rate_limits.count + 1
                   END,
        reset_at = CASE
                     WHEN rate_limits.reset_at < v_now THEN v_reset_at
                     ELSE rate_limits.reset_at
                   END
  RETURNING rate_limits.count, rate_limits.reset_at
  INTO v_count, v_reset;

  RETURN QUERY SELECT (v_count <= p_max), v_count, v_reset;
END;
$$;

-- Cleanup job: remove rows expired more than 1 hour ago (keeps table small)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits WHERE reset_at < now() - interval '1 hour';
$$;

-- Grant execute to service role only
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits TO service_role;
GRANT ALL ON TABLE public.rate_limits TO service_role;
