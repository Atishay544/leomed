-- Add contact form fields to chat_sessions
-- source: tracks where the session originated (widget, contact form, admin)
-- subject: short subject line from contact form

alter table public.chat_sessions
  add column if not exists source  text default 'widget'
    check (source in ('widget', 'contact_form', 'admin')),
  add column if not exists subject text;

-- Note: announcements already has starts_at and ends_at columns from the
-- initial migration. No schema change needed here.

-- Index for efficient date-range queries on announcements
create index if not exists announcements_schedule_idx
  on public.announcements (is_active, starts_at, ends_at);
