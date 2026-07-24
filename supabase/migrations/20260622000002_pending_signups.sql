-- Temporary holding table for unverified signups.
-- Rows are inserted when a user requests signup, deleted on successful OTP verification.
-- Cron or TTL-based cleanup removes stale rows (expires_at < now()).
create table if not exists public.pending_signups (
  email      text        primary key,
  otp_hash   text        not null,        -- sha256 hex of the 6-digit OTP
  full_name  text        not null default '',
  expires_at timestamptz not null
);

-- Only service_role (server) reads/writes this table — no client access
alter table public.pending_signups enable row level security;
-- No permissive policies; service_role bypasses RLS by default

-- Auto-clean expired rows (runs via pg_cron if available; otherwise cleaned lazily)
create or replace function public.cleanup_pending_signups()
returns void language sql security definer as $$
  delete from public.pending_signups where expires_at < now();
$$;
