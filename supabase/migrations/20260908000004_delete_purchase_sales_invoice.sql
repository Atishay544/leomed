-- ============================================================================
-- Admin-only deletion of a purchase or sales invoice, with stock reversed
-- through the ledger rather than the cache being edited directly.
--
-- erp_inventory_transactions is deliberately append-only (see
-- erp_block_ledger_mutation() — "post a reversing transaction instead of
-- editing history"). Deleting an invoice keeps that promise: each line
-- posts a PURCHASE_RETURN (purchase deletion) or SALE_RETURN (sales
-- deletion) entry — both existing erp_inventory_txn_type values, not new
-- ones — before the invoice itself is removed. That reuses
-- erp_apply_inventory_txn()'s existing trigger and its existing guard
-- against a negative balance for free: deleting a purchase whose stock has
-- already been sold on refuses with "insufficient stock", exactly like any
-- other ledger entry that would overdraw a batch, rather than silently
-- pushing it negative.
--
-- Payments/receipts are NOT cascaded away silently even though the FK
-- allows it (erp_purchase_payments/erp_sales_receipts both cascade on
-- their invoice) — deleting real money movements should be the explicit,
-- separate, already-audited act deletePayment() already is, so both
-- functions below refuse outright if any exist.
--
-- erp_purchase_invoice_items/erp_sales_invoice_items cascade on their
-- invoice, so nothing further to delete there by hand. The existing audit
-- triggers on erp_purchase_invoices/erp_sales_invoices already capture
-- INSERT/UPDATE/DELETE, so the deleted invoice's full contents remain in
-- erp_audit_logs.
-- ============================================================================

create or replace function public.erp_delete_purchase_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.erp_purchase_invoices%rowtype;
  v_item    record;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may delete a purchase invoice'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_invoice from public.erp_purchase_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Purchase invoice not found';
  end if;

  if exists (select 1 from public.erp_purchase_payments where purchase_invoice_id = p_invoice_id) then
    raise exception 'Remove every payment recorded against this invoice before deleting it'
      using errcode = 'check_violation';
  end if;

  for v_item in
    select product_id, batch_id, quantity, free_quantity, purchase_rate
      from public.erp_purchase_invoice_items
     where purchase_invoice_id = p_invoice_id
  loop
    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      v_item.product_id, v_item.batch_id, 'PURCHASE_RETURN', 'PURCHASE_INVOICE', p_invoice_id,
      -(v_item.quantity + v_item.free_quantity), v_item.purchase_rate, current_date,
      'Reversal: purchase invoice ' || v_invoice.invoice_number || ' deleted',
      public.erp_current_user_id()
    );
  end loop;

  delete from public.erp_purchase_invoices where id = p_invoice_id;

  return jsonb_build_object('deleted', true, 'invoice_number', v_invoice.invoice_number);
end;
$$;

create or replace function public.erp_delete_sales_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.erp_sales_invoices%rowtype;
  v_item    record;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may delete a sales invoice'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_invoice from public.erp_sales_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Sales invoice not found';
  end if;

  if exists (select 1 from public.erp_sales_receipts where sales_invoice_id = p_invoice_id) then
    raise exception 'Remove every receipt recorded against this invoice before deleting it'
      using errcode = 'check_violation';
  end if;

  for v_item in
    select product_id, batch_id, quantity, free_quantity, sale_rate
      from public.erp_sales_invoice_items
     where sales_invoice_id = p_invoice_id
  loop
    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      v_item.product_id, v_item.batch_id, 'SALE_RETURN', 'SALES_INVOICE', p_invoice_id,
      v_item.quantity + v_item.free_quantity, v_item.sale_rate, current_date,
      'Reversal: sales invoice ' || v_invoice.invoice_number || ' deleted',
      public.erp_current_user_id()
    );
  end loop;

  delete from public.erp_sales_invoices where id = p_invoice_id;

  return jsonb_build_object('deleted', true, 'invoice_number', v_invoice.invoice_number);
end;
$$;

revoke all on function public.erp_delete_purchase_invoice(uuid) from public;
revoke all on function public.erp_delete_sales_invoice(uuid) from public;
grant execute on function public.erp_delete_purchase_invoice(uuid) to authenticated;
grant execute on function public.erp_delete_sales_invoice(uuid) to authenticated;
