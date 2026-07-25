-- service_role has no grants on the public schema at all in this project.
-- Every admin API route (lib/supabase/admin.ts -> createAdminClient()) uses the
-- service-role key specifically to bypass RLS for admin reads/writes — but RLS
-- bypass does not imply table-level privileges. Without this, the entire admin
-- backend (dashboard, product/order management, etc.) fails with
-- "permission denied for table X" on every query. Supabase normally grants this
-- automatically on project creation; it appears to be missing here.

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
