-- Grant write permissions on products to authenticated users.
-- RLS policies already restrict actual writes to admins only —
-- the GRANT just lets Postgres reach the RLS check instead of
-- failing at the ACL layer with "permission denied".

grant insert, update, delete on public.products to authenticated;

-- Same fix for categories (admin manages these too)
grant insert, update, delete on public.categories to authenticated;

-- Reviews — admin needs to update (approve/reject) and delete
grant update, delete on public.reviews to authenticated;

-- order_items — authenticated can read their own
grant select on public.order_items to authenticated;

-- orders — admin needs full access; customer needs select+update(status read)
grant update on public.orders to authenticated;

-- Supabase Storage bucket for product images (run this too)
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
-- on conflict (id) do nothing;
