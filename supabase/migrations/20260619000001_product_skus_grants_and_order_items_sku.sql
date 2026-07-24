-- Add sku_id to order_items so checkout can record which variant combination was purchased
alter table public.order_items
  add column if not exists sku_id uuid references public.product_skus(id) on delete set null;

-- Grants for product_skus: anon + authenticated can read (RLS policy controls row-level access)
grant select on public.product_skus to anon, authenticated;

-- Service role needs full access for admin writes and checkout stock deduction
grant select, insert, update, delete on public.product_skus to service_role;

-- Allow authenticated users to execute the stock decrement RPC (called server-side, but explicit grant is safe)
grant execute on function public.decrement_sku_stock(uuid, integer) to service_role;
