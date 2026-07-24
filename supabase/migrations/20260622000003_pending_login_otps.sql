-- Temporary 6-digit OTP store for passwordless email login.
-- Rows live for 10 minutes; deleted on successful verification.
create table if not exists public.pending_login_otps (
  email      text        primary key,
  otp_hash   text        not null,   -- sha256 hex of the 6-digit code
  expires_at timestamptz not null
);

alter table public.pending_login_otps enable row level security;
-- No permissive policies — service_role bypasses RLS
