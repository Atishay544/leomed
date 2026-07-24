-- Add sort_order to announcements table
-- 0 = top sticky bar (above navbar)
-- 1 = below navbar bar (scrolls with page)
alter table public.announcements
  add column if not exists sort_order integer not null default 0;

create index if not exists announcements_sort_order_idx on public.announcements (sort_order);
