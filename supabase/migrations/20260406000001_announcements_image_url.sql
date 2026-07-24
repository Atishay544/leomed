-- Add image_url to announcements (optional background image for the bar)
alter table public.announcements
  add column if not exists image_url text;
