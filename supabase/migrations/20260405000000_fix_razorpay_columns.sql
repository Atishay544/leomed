-- ============================================================
-- Fix Razorpay columns, add missing order/product columns,
-- and update reserve_stock RPC to track sold_count
-- ============================================================

-- ------------------------------------------------------------
-- 1. Orders table: drop Stripe column, add Razorpay + breakdown columns
-- ------------------------------------------------------------

-- Drop the Stripe column that was never used by this project
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS stripe_payment_intent_id;

-- Drop the old index on stripe column if it exists (Postgres drops it with the column,
-- but be explicit for environments where it may have been created separately)
DROP INDEX IF EXISTS public.orders_stripe_payment_intent_id_idx;

-- Add Razorpay payment columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id   text UNIQUE,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text UNIQUE;

-- Add order amount breakdown columns (referenced by order detail page)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_amount  numeric(10,2) NOT NULL DEFAULT 0;

-- Add convenience columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS coupon_code     text;

-- Index for webhook lookups by razorpay IDs
CREATE INDEX IF NOT EXISTS orders_razorpay_order_id_idx   ON public.orders (razorpay_order_id);
CREATE INDEX IF NOT EXISTS orders_razorpay_payment_id_idx ON public.orders (razorpay_payment_id);

-- ------------------------------------------------------------
-- 2. Products table: add sold_count for "best sellers" sorting
-- ------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS products_sold_count_idx ON public.products (sold_count DESC);

-- ------------------------------------------------------------
-- 3. reserve_stock: replace with version that updates sold_count
--    and handles NULL stock gracefully (atomic, prevents overselling)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_product_id uuid,
  p_quantity   integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock integer;
BEGIN
  -- Lock the row to prevent concurrent oversells
  SELECT stock INTO v_stock
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  -- NULL means product not found; also reject insufficient stock
  IF v_stock IS NULL OR v_stock < p_quantity THEN
    RETURN false;
  END IF;

  UPDATE public.products
  SET
    stock      = stock      - p_quantity,
    sold_count = sold_count + p_quantity,
    updated_at = now()
  WHERE id = p_product_id;

  RETURN true;
END;
$$;
