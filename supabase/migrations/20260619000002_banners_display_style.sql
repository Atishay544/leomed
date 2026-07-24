alter table public.banners
  add column if not exists display_style text not null default 'overlay';
