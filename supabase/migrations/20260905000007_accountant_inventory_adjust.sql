-- ============================================================
-- Let ACCOUNTANT manually adjust inventory, not just ADMIN.
--
-- Purchase and sales invoices already move stock through the accountant's
-- hands (erp_save_purchase_invoice / erp_save_sales_invoice, both gated on
-- erp_can_write_billing() = ADMIN or ACCOUNTANT). Manual corrections
-- (damage, expiry write-off, opening balance) are the same job — so
-- erp_adjust_inventory() now checks erp_can_write_billing() instead of
-- erp_is_admin() alone. lib/erp/permissions.ts ACCOUNTANT_CAPABILITIES was
-- updated to match in the same change.
-- ============================================================

create or replace function public.erp_adjust_inventory(
  p_batch_id uuid,
  p_type     public.erp_inventory_txn_type,
  p_quantity integer,
  p_remarks  text,
  p_date     date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid;
  v_product uuid;
  v_signed  integer;
  v_txn     uuid;
begin
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may adjust inventory'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();

  if p_type not in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'OPENING',
                    'SALE_RETURN', 'PURCHASE_RETURN') then
    raise exception 'Transaction type % is produced by billing, not by manual adjustment', p_type;
  end if;

  if p_quantity <= 0 then
    raise exception 'Enter the number of units to adjust as a positive figure';
  end if;

  if p_remarks is null or length(trim(p_remarks)) = 0 then
    raise exception 'A reason is required for every stock adjustment';
  end if;

  select product_id into v_product from public.erp_product_batches where id = p_batch_id;
  if v_product is null then
    raise exception 'Batch % not found', p_batch_id;
  end if;

  v_signed := case
    when p_type in ('ADJUSTMENT_IN', 'OPENING', 'SALE_RETURN') then  p_quantity
    else -p_quantity
  end;

  insert into public.erp_inventory_transactions (
    product_id, batch_id, transaction_type, reference_type, reference_id,
    quantity, transaction_date, remarks, created_by
  ) values (
    v_product, p_batch_id, p_type,
    case when p_type = 'OPENING' then 'OPENING' else 'ADJUSTMENT' end,
    null, v_signed, p_date, trim(p_remarks), v_actor
  )
  returning id into v_txn;

  return v_txn;
end;
$$;
