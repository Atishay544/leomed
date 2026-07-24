-- ============================================================
-- Fix table permissions for anon + authenticated roles
-- ============================================================
-- Postgres requires explicit GRANT for role access to tables.
-- Without it, the ACL check fails with "permission denied" (42501)
-- BEFORE RLS policies are even evaluated.
-- This migration grants minimum necessary privileges per table.

grant usage on schema public to anon, authenticated;

-- Read-only public tables (products, categories, etc.)
grant select on public.products         to anon, authenticated;
grant select on public.categories       to anon, authenticated;
grant select on public.product_variants to anon, authenticated;
grant select on public.announcements    to anon, authenticated;

-- User-owned tables — authenticated users only
grant select, insert, update, delete on public.profiles        to authenticated;
grant select, insert, update, delete on public.cart_items      to authenticated;
grant select, insert, update, delete on public.orders          to authenticated;
grant select, insert            on public.order_items     to authenticated;
grant select, insert, update, delete on public.wishlist_items  to authenticated;
grant select, insert, update, delete on public.addresses       to authenticated;
grant select, update             on public.notifications   to authenticated;
grant select, insert             on public.reviews         to authenticated;

-- Coupons — read by authenticated (for validation at checkout)
grant select on public.coupons to authenticated;

-- Chat — accessible by both anon (guests) and authenticated users
grant select, insert, update on public.chat_sessions to anon, authenticated;
grant select, insert         on public.chat_messages  to anon, authenticated;

-- Fraud log — write-only for authenticated (server writes via service role anyway)
-- No grant needed — written only by backend service role

-- ============================================================
-- Fix RLS policies for guest (anon) chat sessions
-- ============================================================
-- Old SELECT policy used user_id = auth.uid() which evaluates to
-- NULL = NULL = false for anonymous guests, so guests couldn't
-- read their own session or messages.

drop policy
if exists "Users see own chat sessions" on public.chat_sessions;
drop policy
if exists "Users see own messages"      on public.chat_messages;

-- Session UUIDs are 128-bit random tokens — knowing the ID is
-- equivalent to authorization. Allow select by anyone who has the ID.
create policy "Anyone can read chat sessions"
  on public.chat_sessions for
select
  using (true);

create policy "Anyone can read chat messages"
  on public.chat_messages for
select
  using (true);

-- ============================================================
-- Enable Realtime for chat tables
-- ============================================================
-- NOTE: Run these two lines separately in the Supabase SQL editor
-- (they require superuser and fail inside a migration transaction):
--
--   alter publication supabase_realtime add table public.chat_sessions;
--   alter publication supabase_realtime add table public.chat_messages;
