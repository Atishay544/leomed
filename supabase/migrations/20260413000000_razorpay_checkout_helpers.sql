-- ============================================================
-- Razorpay checkout helpers
-- ============================================================

-- Safely increment coupon usage count (called after payment verified)
CREATE OR REPLACE FUNCTION public.increment_coupon_uses(p_code text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.coupons
  SET uses_count = uses_count + 1
  WHERE code = p_code;
$$;

-- Add total_amount as a regular column (storefront order detail page uses it)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_amount numeric(10,2);

-- Backfill total_amount from total for existing orders
UPDATE public.orders SET total_amount = total WHERE total_amount IS NULL;
