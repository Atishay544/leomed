-- ============================================================================
-- Permanent product deletion — admin-only, and only when nothing depends on
-- it. Every table that records an actual historical event against a product
-- (batches, purchase/sales invoice items, inventory transactions, visit
-- products, field order items) references it with ON DELETE RESTRICT, so
-- Postgres itself refuses the delete the moment any of that history exists —
-- this function only needs to catch that refusal and explain it, not
-- reimplement the checks. Pricing rules and schemes reference it with ON
-- DELETE CASCADE (they can't mean anything without the product, so removing
-- them alongside it is correct, not a gap).
--
-- The existing active/inactive toggle (setProductActive) remains the normal
-- way to retire a product that has ever actually been used — this is only
-- for a product that was added by mistake or never used at all.
-- ============================================================================

create or replace function public.erp_delete_product_permanently(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a product'
      using errcode = 'insufficient_privilege';
  end if;

  select product_name into v_name from public.erp_products where id = p_product_id;
  if v_name is null then
    raise exception 'Product not found';
  end if;

  delete from public.erp_products where id = p_product_id;

  return jsonb_build_object('deleted', true, 'product_name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This product cannot be permanently deleted — it has batches, invoices or visits recorded against it. Use the active/inactive toggle instead to hide it without losing that history.'
      using errcode = 'foreign_key_violation';
end;
$$;

revoke all on function public.erp_delete_product_permanently(uuid) from public;
grant execute on function public.erp_delete_product_permanently(uuid) to authenticated;
