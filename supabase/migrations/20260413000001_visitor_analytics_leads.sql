-- ─────────────────────────────────────────────
-- Visitor Analytics + Lead Capture
-- ─────────────────────────────────────────────

-- 1. Page views — one row per page visited per session
create table if not exists page_views (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null,          -- client-generated UUID (sessionStorage), deduplicates per tab
  path        text not null,
  referrer    text,
  created_at  timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on page_views (created_at desc);
create index if not exists page_views_session_idx    on page_views (session_id);

-- 2. Leads — email / phone captured from welcome popup
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  email       text,
  phone       text,
  source      text not null default 'welcome_popup',
  created_at  timestamptz not null default now(),
  constraint  leads_contact_check check (email is not null or phone is not null)
);

create index if not exists leads_created_at_idx on leads (created_at desc);

-- 3. RLS — inserts from API routes use service-role (bypasses RLS).
--    Enable RLS but only restrict direct client access.
alter table page_views enable row level security;
alter table leads       enable row level security;

-- Admins (authenticated service-role calls) can read all rows
create policy "admin_read_page_views" on page_views
  for select using (auth.role() = 'authenticated');

create policy "admin_read_leads" on leads
  for select using (auth.role() = 'authenticated');

-- No direct anon insert — all writes go through our API routes with the admin client
