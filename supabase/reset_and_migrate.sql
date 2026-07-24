-- ============================================================
-- FULL RESET + ECOM MIGRATION
-- Run this in Supabase SQL Editor (single execution)
-- WARNING: This drops ALL existing tables irreversibly
-- ============================================================

-- Step 1: Drop entire public schema and recreate clean
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;

-- ============================================================
-- MIGRATION 001 — CORE ECOM SCHEMA
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name   TEXT,
  avatar_url  TEXT,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  parent_id   UUID REFERENCES public.categories(id),
  image_url   TEXT,
  sort_order  INTEGER DEFAULT 0
);

-- Products
CREATE TABLE public.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  compare_price NUMERIC(10,2),
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sold_count    INTEGER NOT NULL DEFAULT 0,
  video_url     TEXT,
  images        TEXT[] DEFAULT '{}',
  category_id   UUID REFERENCES public.categories(id),
  is_active     BOOLEAN DEFAULT TRUE,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Product Variants
CREATE TABLE public.product_variants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  options     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Persistent cart
CREATE TABLE public.cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Orders
CREATE TABLE public.orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id),
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  subtotal              NUMERIC(10,2) NOT NULL,
  tax                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping              NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(10,2) NOT NULL,
  subtotal_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  razorpay_order_id     TEXT UNIQUE,
  razorpay_payment_id   TEXT UNIQUE,
  tracking_number       TEXT,
  tracking_url          TEXT,
  coupon_code           TEXT,
  shipping_address      JSONB NOT NULL,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Order line items
CREATE TABLE public.order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id  UUID REFERENCES public.products(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL,
  total       NUMERIC(10,2) NOT NULL,
  snapshot    JSONB NOT NULL
);

-- Fraud log
CREATE TABLE public.fraud_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  ip         TEXT,
  reason     TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  reviewed   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MIGRATION 002 — COUPONS, ANNOUNCEMENTS, REVIEWS, CHAT, ETC.
-- ============================================================

-- Coupons
CREATE TABLE public.coupons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('percentage', 'flat')),
  value       NUMERIC(10,2) NOT NULL CHECK (value > 0),
  min_order   NUMERIC(10,2) DEFAULT 0,
  max_uses    INTEGER,
  uses_count  INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Announcements
CREATE TABLE public.announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message     TEXT NOT NULL,
  link_url    TEXT,
  link_text   TEXT,
  bg_color    TEXT DEFAULT '#000000',
  text_color  TEXT DEFAULT '#ffffff',
  is_active   BOOLEAN DEFAULT FALSE,
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Banners (homepage hero)
CREATE TABLE public.banners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT,
  subtitle      TEXT,
  image_url     TEXT,
  link_url      TEXT,
  link_text     TEXT DEFAULT 'Shop Now',
  bg_color      TEXT DEFAULT '#111827',
  text_color    TEXT DEFAULT '#ffffff',
  is_active     BOOLEAN DEFAULT TRUE,
  sort_order    INTEGER DEFAULT 0,
  display_style TEXT NOT NULL DEFAULT 'overlay',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews
CREATE TABLE public.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, user_id)
);

-- Wishlist
CREATE TABLE public.wishlist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id  UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Saved Addresses
CREATE TABLE public.addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label       TEXT,
  full_name   TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'IN',
  phone       TEXT,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Live Chat
CREATE TABLE public.chat_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id),
  guest_name   TEXT,
  guest_email  TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','closed')),
  assigned_to  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  sender_id   UUID REFERENCES auth.users(id),
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer','agent','bot')),
  body        TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON public.products(slug);
CREATE INDEX ON public.products(category_id);
CREATE INDEX ON public.products(is_active);
CREATE INDEX ON public.cart_items(user_id);
CREATE INDEX ON public.orders(user_id);
CREATE INDEX ON public.orders(status);
CREATE INDEX ON public.orders(razorpay_order_id);
CREATE INDEX ON public.order_items(order_id);
CREATE INDEX ON public.reviews(product_id, status);
CREATE INDEX ON public.wishlist_items(user_id);
CREATE INDEX ON public.addresses(user_id);
CREATE INDEX ON public.notifications(user_id, is_read);
CREATE INDEX ON public.chat_sessions(status);
CREATE INDEX ON public.chat_messages(session_id);
CREATE INDEX ON public.coupons(code);
CREATE INDEX ON public.fraud_log(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages    ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users view own profile"    ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile"  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins manage profiles"    ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- categories: public read
CREATE POLICY "Public read categories"    ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage categories"  ON public.categories FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- products
CREATE POLICY "Public read active products" ON public.products FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Admins manage products"      ON public.products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- variants
CREATE POLICY "Public read variants"    ON public.product_variants FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage variants"  ON public.product_variants FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- cart
CREATE POLICY "Users manage own cart" ON public.cart_items FOR ALL USING (auth.uid() = user_id);

-- orders
CREATE POLICY "Users view own orders"     ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create orders"       ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all orders"  ON public.orders FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- order_items
CREATE POLICY "Users view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
);
CREATE POLICY "Admins manage order items"  ON public.order_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- fraud_log: admins only
CREATE POLICY "Admins only fraud log" ON public.fraud_log FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- coupons
CREATE POLICY "Admins manage coupons"    ON public.coupons FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Users validate coupons"   ON public.coupons FOR SELECT USING (
  is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())
);

-- announcements
CREATE POLICY "Public read active announcements" ON public.announcements FOR SELECT USING (
  is_active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())
);
CREATE POLICY "Admins manage announcements" ON public.announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- banners
CREATE POLICY "Public read banners"   ON public.banners FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage banners" ON public.banners FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- reviews
CREATE POLICY "Public read approved reviews" ON public.reviews FOR SELECT USING (status = 'approved');
CREATE POLICY "Users create own review"      ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own review"        ON public.reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins manage reviews"        ON public.reviews FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- wishlist, addresses, notifications: user owns
CREATE POLICY "Users manage own wishlist"       ON public.wishlist_items FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own addresses"      ON public.addresses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own notifications"  ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- chat
CREATE POLICY "Users see own sessions"      ON public.chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone create chat session"  ON public.chat_sessions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Admins manage chat sessions" ON public.chat_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Users see own messages"      ON public.chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
);
CREATE POLICY "Anyone can send messages"    ON public.chat_messages FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Admins manage chat messages" ON public.chat_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Atomic stock reservation (prevents overselling race conditions)
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

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', TRUE) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars',  'avatars',  TRUE) ON CONFLICT DO NOTHING;

CREATE POLICY "Public read product images"   ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "Admins upload product images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'products' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins delete product images" ON storage.objects FOR DELETE USING (
  bucket_id = 'products' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Public read avatars"          ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users upload own avatar"      ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO public.categories (id, name, slug, sort_order) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Men',         'men',         1),
  ('11111111-0000-0000-0000-000000000002', 'Women',       'women',       2),
  ('11111111-0000-0000-0000-000000000003', 'Kids',        'kids',        3),
  ('11111111-0000-0000-0000-000000000004', 'Electronics', 'electronics', 4);

INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
  ('T-Shirts',    'men-tshirts',   '11111111-0000-0000-0000-000000000001', 1),
  ('Shoes',       'men-shoes',     '11111111-0000-0000-0000-000000000001', 2),
  ('Dresses',     'women-dresses', '11111111-0000-0000-0000-000000000002', 1),
  ('Accessories', 'women-acc',     '11111111-0000-0000-0000-000000000002', 2);

INSERT INTO public.products (name, slug, description, price, compare_price, stock, category_id, is_active) VALUES
  ('Classic White T-Shirt', 'classic-white-tshirt', 'Premium 100% cotton tee',           499.00, 799.00,  100, (SELECT id FROM public.categories WHERE slug='men-tshirts'),   TRUE),
  ('Running Shoes Pro',     'running-shoes-pro',    'Lightweight performance runners',   2999.00, 3999.00,  50, (SELECT id FROM public.categories WHERE slug='men-shoes'),     TRUE),
  ('Floral Summer Dress',   'floral-summer-dress',  'Breezy floral print midi dress',    1499.00, 1999.00,  75, (SELECT id FROM public.categories WHERE slug='women-dresses'), TRUE);

INSERT INTO public.coupons (code, type, value, min_order, max_uses, is_active) VALUES
  ('WELCOME10', 'percentage', 10.00, 500.00,  1000, TRUE),
  ('FLAT100',   'flat',      100.00, 999.00,   500, TRUE);

INSERT INTO public.announcements (message, bg_color, text_color, is_active) VALUES
  ('Free shipping on orders above ₹999! Use code FREESHIP', '#000000', '#ffffff', TRUE);

-- ============================================================
-- DONE — verify with: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- ============================================================
