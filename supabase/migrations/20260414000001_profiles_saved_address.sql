-- Add saved_address column to profiles for checkout pre-fill
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS saved_address JSONB;
