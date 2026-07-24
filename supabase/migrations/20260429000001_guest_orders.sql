-- Allow guest orders: user_id is no longer required
-- FK is preserved so linked orders still resolve to auth.users when present
alter table public.orders alter column user_id drop not null;
