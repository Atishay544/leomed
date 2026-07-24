-- Page views table for visitor tracking
create table if not exists public.page_views (
  id         uuid        primary key default gen_random_uuid(),
  session_id text        not null,
  path       text        not null,
  referrer   text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx  on public.page_views (created_at);
create index if not exists page_views_session_id_idx  on public.page_views (session_id);

alter table public.page_views enable row level security;

-- Storefront (anon + authenticated) can insert; reads only via service_role
create policy "pv_insert" on public.page_views
  for insert to anon, authenticated with check (true);

-- Count distinct visitors since a given timestamp
create or replace function public.count_unique_visitors(since_ts timestamptz)
returns bigint
language sql security definer
as $$
  select count(distinct session_id)
  from   public.page_views
  where  created_at >= since_ts;
$$;

grant execute on function public.count_unique_visitors(timestamptz) to service_role;
