-- The "Admins manage profiles" policy on public.profiles subqueries public.profiles
-- itself to check role = 'admin'. That subquery re-triggers RLS on profiles, whose
-- own policy set includes this same policy again — infinite recursion on every query
-- that needs to evaluate admin status (which is most tables, since their own "Admins
-- manage X" policies also subquery profiles).
--
-- Admin writes to profiles already go through the server-side service-role client
-- (lib/supabase/admin.ts), which bypasses RLS entirely, so this policy is not needed
-- for the app to function — only its absence is needed to stop the recursion.
drop policy if exists "Admins manage profiles" on public.profiles;
