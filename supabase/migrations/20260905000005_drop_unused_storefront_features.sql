-- ============================================================
-- Drop unused storefront features: cart/checkout/orders (removed from the
-- app in an earlier pass and kept only for a data-preservation grace period),
-- wishlist, visitor tracking, and the Care Plan / membership subscription
-- feature. None of these have any surviving application code — see the
-- companion app-code removal in this same change.
--
-- This is a destructive, irreversible migration. Take a database backup
-- before applying it in any environment with real data.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Orphaned functions (only ever called by the removed checkout /
--    cart / coupon / visitor-tracking / membership code paths)
-- ------------------------------------------------------------
drop function if exists public.reserve_stock(uuid, integer);
drop function if exists public.decrement_sku_stock(uuid, integer);
drop function if exists public.restore_stock(uuid, integer);
drop function if exists public.restore_sku_stock(uuid, integer);
drop function if exists public.increment_coupon_uses(text);
drop function if exists public.sync_order_items_count() cascade;
drop function if exists public.count_unique_visitors(timestamptz);

-- ------------------------------------------------------------
-- 2. Cart / checkout / orders (admin screens + API routes already removed;
--    tables were deliberately preserved at that time, now confirmed unused)
-- ------------------------------------------------------------
drop table if exists public.order_items      cascade;
drop table if exists public.orders           cascade;
drop table if exists public.cart_items       cascade;
drop table if exists public.coupons          cascade;
drop table if exists public.delivery_partners cascade;
drop table if exists public.fraud_log        cascade;

-- ------------------------------------------------------------
-- 3. Wishlist
-- ------------------------------------------------------------
drop table if exists public.wishlist_items cascade;

-- ------------------------------------------------------------
-- 4. Visitor tracking (page view logging; live-visitor presence used the
--    Supabase Realtime "site-visitors" channel directly, no table for that)
-- ------------------------------------------------------------
drop table if exists public.page_views cascade;

-- ------------------------------------------------------------
-- 5. Care Plan / membership subscriptions
-- ------------------------------------------------------------
drop table if exists public.user_memberships cascade;
drop table if exists public.membership_plans cascade;
