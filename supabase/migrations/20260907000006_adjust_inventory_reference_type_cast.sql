-- ============================================================================
-- LEOMED PHARMA ERP — FIX: erp_adjust_inventory() reference_type type
-- mismatch that made every call fail, for every role, since the function's
-- original introduction.
--
-- erp_inventory_transactions.reference_type is the enum erp_reference_type,
-- but the INSERT built it as:
--
--   case when p_type = 'OPENING' then 'OPENING' else 'ADJUSTMENT' end
--
-- Both branches are bare string literals with no type context, so Postgres
-- resolves the whole CASE expression as plain text — which then fails to
-- insert into an enum column:
--
--   ERROR: column "reference_type" is of type erp_reference_type but
--   expression is of type text
--
-- This is unconditional: it fails for OPENING, DAMAGE, EXPIRY,
-- ADJUSTMENT_IN/OUT, SALE_RETURN and PURCHASE_RETURN alike, since the CASE's
-- type resolution doesn't depend on which branch actually runs. Found by
-- actually calling this RPC for the first time (via
-- supabase/tests/erp_role_capability_matrix.sql) — it had never been
-- exercised end-to-end before.
--
-- Fix: cast each branch explicitly. Every other line (verified against the
-- complete current function body first) is byte-for-byte unchanged.
-- ============================================================================

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
    case when p_type = 'OPENING' then 'OPENING'::public.erp_reference_type else 'ADJUSTMENT'::public.erp_reference_type end,
    null, v_signed, p_date, trim(p_remarks), v_actor
  )
  returning id into v_txn;

  return v_txn;
end;
$$;
