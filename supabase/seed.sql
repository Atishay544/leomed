-- ============================================================
-- Dev seed data — run after migrations
-- ============================================================

-- Categories
insert into public.categories (id, name, slug, sort_order) values
  ('11111111-0000-0000-0000-000000000001', 'Men',        'men',        1),
  ('11111111-0000-0000-0000-000000000002', 'Women',      'women',      2),
  ('11111111-0000-0000-0000-000000000003', 'Kids',       'kids',       3),
  ('11111111-0000-0000-0000-000000000004', 'Electronics','electronics',4);

-- Sub-categories
insert into public.categories (name, slug, parent_id, sort_order) values
  ('T-Shirts',    'men-tshirts',    '11111111-0000-0000-0000-000000000001', 1),
  ('Shoes',       'men-shoes',      '11111111-0000-0000-0000-000000000001', 2),
  ('Dresses',     'women-dresses',  '11111111-0000-0000-0000-000000000002', 1),
  ('Accessories', 'women-acc',      '11111111-0000-0000-0000-000000000002', 2);

-- Sample products
insert into public.products (name, slug, description, price, compare_price, stock, category_id, is_active) values
  ('Classic White T-Shirt', 'classic-white-tshirt', 'Premium 100% cotton tee', 499.00, 799.00, 100,
    (select id from public.categories where slug = 'men-tshirts'), true),
  ('Running Shoes Pro',     'running-shoes-pro',    'Lightweight performance runners', 2999.00, 3999.00, 50,
    (select id from public.categories where slug = 'men-shoes'), true),
  ('Floral Summer Dress',   'floral-summer-dress',  'Breezy floral print midi dress', 1499.00, 1999.00, 75,
    (select id from public.categories where slug = 'women-dresses'), true);

-- Sample coupon
insert into public.coupons (code, type, value, min_order, max_uses, is_active) values
  ('WELCOME10', 'percentage', 10.00, 500.00, 1000, true),
  ('FLAT100',   'flat',       100.00, 999.00, 500,  true);

-- Sample announcement
insert into public.announcements (message, bg_color, text_color, is_active) values
  ('🎉 Free shipping on orders above ₹999! Use code FREESHIP', '#000000', '#ffffff', true);
