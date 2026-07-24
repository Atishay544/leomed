-- Restore product-level stock (called on order cancellation / refund)
create or replace function public.restore_stock(p_product_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.products
  set stock = stock + p_quantity
  where id = p_product_id;
end;
$$;

-- Restore SKU-level stock (called on order cancellation / refund for variant products)
create or replace function public.restore_sku_stock(p_sku_id uuid, p_quantity integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.product_skus
  set stock = stock + p_quantity
  where id = p_sku_id;
end;
$$;

grant execute on function public.restore_stock(uuid, integer) to service_role;
grant execute on function public.restore_sku_stock(uuid, integer) to service_role;
