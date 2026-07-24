-- Delivery partners table (Delhivery, DTDC, etc.)
CREATE TABLE IF NOT EXISTS public.delivery_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- slug: 'delhivery', 'dtdc'
  display_name TEXT NOT NULL,
  api_key TEXT,
  api_secret TEXT,
  account_code TEXT,
  pickup_location_name TEXT,
  pickup_pincode TEXT,
  is_active BOOLEAN DEFAULT true,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add delivery columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_partner TEXT,
  ADD COLUMN IF NOT EXISTS delivery_awb TEXT,
  ADD COLUMN IF NOT EXISTS delivery_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS delivery_service TEXT;

-- RLS
ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.delivery_partners USING (true) WITH CHECK (true);
