-- Grant write access for authenticated users on tables that admins manage.
-- RLS policies already restrict actual mutations to role='admin' only.
-- Without this GRANT, Postgres rejects at ACL layer before RLS runs → 403 Forbidden.

grant insert, update, delete on public.coupons       to authenticated;
grant insert, update, delete on public.announcements to authenticated;
-- categories already granted in migration 20260405000003
-- products already granted in migration 20260405000003
