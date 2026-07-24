-- Add video_url to products for product demo videos
alter table public.products
  add column if not exists video_url text;
