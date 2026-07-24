-- ============================================================
-- Performance: Denormalize items_count on orders
-- Eliminates the expensive correlated subquery order_items(count)
-- that was causing 2+ second load times on the My Orders page.
-- ============================================================

-- 1. Add column (safe to re-run)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS items_count integer NOT NULL DEFAULT 0;

-- 2. Backfill existing rows
UPDATE public.orders o
SET items_count = (
  SELECT count(*)::integer
  FROM public.order_items oi
  WHERE oi.order_id = o.id
);

-- 3. Trigger function — keeps items_count in sync on INSERT/DELETE
CREATE OR REPLACE FUNCTION public.sync_order_items_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.orders
    SET items_count = items_count + 1
    WHERE id = NEW.order_id;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.orders
    SET items_count = GREATEST(items_count - 1, 0)
    WHERE id = OLD.order_id;
  END IF;
  RETURN NULL;
END;
$$;

-- 4. Attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_sync_order_items_count ON public.order_items;
CREATE TRIGGER trg_sync_order_items_count
  AFTER INSERT OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_items_count();

-- 5. Index for fast user orders list (covers the most common query pattern)
CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);
