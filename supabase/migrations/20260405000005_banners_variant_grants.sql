-- Banners table for homepage hero management
create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  subtitle    text,
  image_url   text,
  link_url    text,
  link_text   text default 'Shop Now',
  bg_color    text default '#111827',
  text_color  text default '#ffffff',
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

alter table public.banners enable row level security;

create policy "Public read banners"
  on public.banners for select using (true);

create policy "Admins manage banners"
  on public.banners for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;

-- Write grants for product_variants (admin needs to create/update/delete variants)
grant insert, update, delete on public.product_variants to authenticated;
