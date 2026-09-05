-- ============================================================
-- D2C -> B2B informational catalogue conversion.
--
-- No public accounts, no reviews, no purchase signals (price/stock) on the
-- public site. Sales happen through distributors (ERP), not online. The
-- storefront admin panel (product catalogue, banners, announcements, news,
-- upcoming launches, about page) is now gated by the SAME staff identity as
-- the ERP: erp_users.role = 'ADMIN'. There is no longer a separate
-- "customer" identity at all.
--
-- This is a destructive, irreversible migration. Take a database backup
-- before applying it in any environment with real data.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Unify admin authorization: is_admin() now delegates to the ERP's own
--    erp_is_admin() (erp_users.role = 'ADMIN' and active), instead of
--    checking the profiles table that this migration goes on to drop.
--    Every "Admins manage X" RLS policy already calls public.is_admin(),
--    so this one change re-points all of them at once — no policy rewrites
--    needed on categories / products / announcements / chat_sessions /
--    chat_messages / banners / product_health_concerns.
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.erp_is_admin();
$$;

-- ------------------------------------------------------------
-- 2. Product catalogue: add composition, drop what's now purely internal
--    (variant/SKU selection was a purchase-flow feature).
-- ------------------------------------------------------------
alter table public.products
  add column if not exists composition text;

drop table if exists public.product_skus     cascade;
drop table if exists public.product_variants cascade;

-- ------------------------------------------------------------
-- 3. Remove public identity entirely: no signup, no accounts, no reviews.
--    Admin writes already go through the service-role client, so nothing
--    depends on the profiles table for actual functionality.
-- ------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.reviews       cascade;
drop table if exists public.notifications cascade;
drop table if exists public.addresses     cascade;
drop table if exists public.profiles      cascade;

-- ------------------------------------------------------------
-- 4. New admin-managed content: News & Articles, Upcoming Product
--    Launches, About page. Same pattern as banners/announcements —
--    public can read published/active rows, only admins (is_admin()) write.
-- ------------------------------------------------------------
create table public.news_articles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text unique not null,
  excerpt       text,
  body          text not null,
  cover_image_url text,
  is_published  boolean not null default false,
  published_at  timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index news_articles_published_idx on public.news_articles (is_published, published_at desc);

alter table public.news_articles enable row level security;
create policy "Public read published news" on public.news_articles
  for select using (is_published = true);
create policy "Admins manage news" on public.news_articles
  for all using (public.is_admin());

grant select on public.news_articles to anon, authenticated;
grant insert, update, delete on public.news_articles to authenticated;

create table public.upcoming_launches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  image_url     text,
  expected_date date,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index upcoming_launches_active_idx on public.upcoming_launches (is_active, sort_order);

alter table public.upcoming_launches enable row level security;
create policy "Public read active launches" on public.upcoming_launches
  for select using (is_active = true);
create policy "Admins manage launches" on public.upcoming_launches
  for all using (public.is_admin());

grant select on public.upcoming_launches to anon, authenticated;
grant insert, update, delete on public.upcoming_launches to authenticated;

-- Singleton content row for the About page — one editable record.
create table public.about_content (
  id          integer primary key default 1,
  title       text not null default 'About Leomed Pharma',
  body        text not null default '',
  updated_at  timestamptz not null default now(),
  constraint about_content_singleton check (id = 1)
);

insert into public.about_content (id, title, body) values (1, 'About Leomed Pharma', '')
  on conflict (id) do nothing;

alter table public.about_content enable row level security;
create policy "Public read about" on public.about_content
  for select using (true);
create policy "Admins manage about" on public.about_content
  for all using (public.is_admin());

grant select on public.about_content to anon, authenticated;
grant update on public.about_content to authenticated;
