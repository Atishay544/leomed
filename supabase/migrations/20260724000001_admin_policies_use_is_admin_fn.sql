-- Replace every "Admins manage X" policy's inline profiles subquery with a single
-- SECURITY DEFINER helper function. The inline pattern
--   exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
-- has two separate bugs:
--   1. On public.profiles itself it recurses infinitely (fixed in the previous migration
--      by dropping "Admins manage profiles").
--   2. On every OTHER table, evaluating that subquery requires the CALLING role (often
--      `anon` — e.g. a guest browsing products) to have SELECT on public.profiles, which
--      was never granted. Postgres can sometimes fold this away when the sibling
--      public-read policy is a constant `true` (categories), but fails with
--      "permission denied for table profiles" when it can't be folded (e.g. products'
--      `is_active = true`, or any other non-constant public-read policy).
--
-- A SECURITY DEFINER function runs with the privileges of its owner, so callers need no
-- grant on profiles at all, and it doesn't re-trigger RLS on profiles.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "Admins manage categories"    on public.categories;
create policy "Admins manage categories"    on public.categories       for all using (public.is_admin());

drop policy if exists "Admins manage products"      on public.products;
create policy "Admins manage products"      on public.products         for all using (public.is_admin());

drop policy if exists "Admins manage all orders"    on public.orders;
create policy "Admins manage all orders"    on public.orders           for all using (public.is_admin());

drop policy if exists "Admins manage order items"   on public.order_items;
create policy "Admins manage order items"   on public.order_items      for all using (public.is_admin());

drop policy if exists "Admins only fraud log"       on public.fraud_log;
create policy "Admins only fraud log"       on public.fraud_log        for all using (public.is_admin());

drop policy if exists "Admins manage coupons"       on public.coupons;
create policy "Admins manage coupons"       on public.coupons          for all using (public.is_admin());

drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements" on public.announcements    for all using (public.is_admin());

drop policy if exists "Admins manage reviews"       on public.reviews;
create policy "Admins manage reviews"       on public.reviews          for all using (public.is_admin());

drop policy if exists "Admins manage chat sessions" on public.chat_sessions;
create policy "Admins manage chat sessions" on public.chat_sessions    for all using (public.is_admin());

drop policy if exists "Admins manage chat messages" on public.chat_messages;
create policy "Admins manage chat messages" on public.chat_messages    for all using (public.is_admin());

drop policy if exists "Admins manage variants"      on public.product_variants;
create policy "Admins manage variants"      on public.product_variants for all using (public.is_admin());

drop policy if exists "Admins manage banners"       on public.banners;
create policy "Admins manage banners"       on public.banners          for all using (public.is_admin());
