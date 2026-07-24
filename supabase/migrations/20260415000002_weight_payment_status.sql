-- Product weight for shipping rate calculation (grams)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams INTEGER DEFAULT 500;

-- Order payment status: prepaid | cod | partial
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'prepaid';

-- Backfill existing orders from metadata.payment_method
UPDATE public.orders SET payment_status =
  CASE
    WHEN metadata->>'payment_method' = 'cod'         THEN 'cod'
    WHEN metadata->>'payment_method' = 'cod_upfront' THEN 'partial'
    ELSE 'prepaid'
  END
WHERE payment_status IS NULL OR payment_status = 'prepaid';
