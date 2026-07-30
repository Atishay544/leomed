-- Phase 2 of the medical-platform plan: Care Plan membership.
-- Implemented as a one-time payment for a fixed-duration membership (reusing the
-- existing Razorpay Orders + signature-verification flow already used at checkout),
-- rather than Razorpay's separate Subscriptions/auto-renew API — same customer
-- value, far less payment-integration risk. Renewal is "buy again"; true
-- auto-renewal can be layered on later once there's real usage data.

create table public.membership_plans (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  price            numeric not null,
  duration_months  int not null,
  free_shipping    boolean not null default true,
  discount_pct     numeric not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz default now()
);

create table public.user_memberships (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade not null,
  plan_id               uuid references public.membership_plans(id) not null,
  razorpay_order_id     text,
  razorpay_payment_id   text,
  status                text not null default 'pending' check (status in ('pending', 'active', 'expired')),
  started_at            timestamptz,
  expires_at            timestamptz,
  created_at            timestamptz default now()
);

alter table public.membership_plans  enable row level security;
alter table public.user_memberships  enable row level security;

create policy "Public read active plans" on public.membership_plans
  for select using (is_active = true);
create policy "Admins manage plans" on public.membership_plans
  for all using (public.is_admin());

create policy "Users view own memberships" on public.user_memberships
  for select using (auth.uid() = user_id);
create policy "Admins manage memberships" on public.user_memberships
  for all using (public.is_admin());

grant select on public.membership_plans to anon, authenticated;
grant insert, update, delete on public.membership_plans to authenticated;
grant select on public.user_memberships to authenticated;
grant insert, update on public.user_memberships to authenticated;

-- Seed the initial Care Plan (admin can edit price/perks later)
insert into public.membership_plans (name, price, duration_months, free_shipping, discount_pct)
values ('Leomed Care Plan', 165, 3, true, 5);
