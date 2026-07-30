-- Fixes from the orchestrated review of migrations 20260726000001/000002:

-- 1. Indexes on the actual hot query paths (matches this project's convention of
--    indexing every FK/frequently-filtered column).
create index if not exists idx_product_health_concerns_category_id on public.product_health_concerns(category_id);
create index if not exists idx_user_memberships_user_id_status     on public.user_memberships(user_id, status);
create index if not exists idx_categories_taxonomy                 on public.categories(taxonomy);

-- 2. Audit trail on the join table, consistent with product_skus etc.
alter table public.product_health_concerns add column if not exists created_at timestamptz default now();

-- 3. Explicit on delete behavior for plan_id (was relying on the implicit
--    Postgres default of NO ACTION). RESTRICT documents intent: a plan with
--    membership history can't be deleted out from under it.
alter table public.user_memberships drop constraint if exists user_memberships_plan_id_fkey;
alter table public.user_memberships
  add constraint user_memberships_plan_id_fkey
  foreign key (plan_id) references public.membership_plans(id) on delete restrict;

-- 4. Bounds checks — an admin typo could otherwise set e.g. discount_pct = 150.
alter table public.membership_plans add constraint membership_plans_price_check           check (price >= 0);
alter table public.membership_plans add constraint membership_plans_discount_pct_check    check (discount_pct >= 0 and discount_pct <= 100);
alter table public.membership_plans add constraint membership_plans_duration_months_check check (duration_months > 0);

-- 5. Prevent duplicate pending/active memberships per user (race condition:
--    two near-simultaneous /api/membership/subscribe calls could otherwise both
--    pass the "no active membership" check and both create a chargeable order).
create unique index if not exists uq_user_memberships_one_open_per_user
  on public.user_memberships(user_id)
  where status in ('pending', 'active');

-- 6. Snapshot the plan's discount/shipping perk at purchase time, so a later
--    admin price/perk edit doesn't retroactively change what an existing
--    paying member is entitled to.
alter table public.user_memberships add column if not exists discount_pct_snapshot numeric;
alter table public.user_memberships add column if not exists free_shipping_snapshot boolean;
