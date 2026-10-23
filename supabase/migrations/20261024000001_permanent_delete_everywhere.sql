-- ============================================================================
-- "Permanently delete" alongside "deactivate" — everywhere ToggleActiveButton
-- already exists, except for the field-force trio (doctors/chemists/
-- staff are covered below too) where deactivation was the ONLY option.
--
-- Same rule everywhere, matching the one entity that already had both
-- (erp_products, 20260909000004): delete only ever succeeds for a record
-- that was added by mistake and never actually used — anything with real
-- history (a visit, an order, an invoice, a leave request against it, ...)
-- makes Postgres itself refuse via the existing ON DELETE RESTRICT
-- constraints, and the function turns that into a specific, friendly
-- message pointing back at the existing deactivate toggle. Deactivation
-- remains completely unchanged everywhere.
--
-- Every function below is admin-only (erp_is_admin()), regardless of which
-- broader capability (masters.write, territories.manage, leave.manage, ...)
-- already lets a role edit or deactivate that same record — matches how
-- erp_delete_purchase_invoice/erp_delete_sales_invoice were already
-- admin-only even though HR/Accountant hold the write capability on
-- invoices. The app layer gates the button itself on a new capability,
-- masters.delete, held by ADMIN only, so the button is simply never shown
-- to a role for whom it would always fail.
--
-- Bug fix in passing: erp_delete_product_permanently's own friendly message
-- was raised `using errcode = 'foreign_key_violation'` (23503) — but
-- friendlyDbError() (lib/erp/actions/shared.ts) only reads the RAISE
-- EXCEPTION's actual message text for errcode P0001 (Postgres's own default
-- when no errcode is given at all); for any other code it looks up a
-- generic PG_MESSAGES table instead and ignores the specific message. So
-- the carefully-written "has batches/invoices/visits, use the toggle
-- instead" text was never actually reaching the screen — the generic "A
-- linked record is missing..." showed instead. Every function below (and
-- the redefinition of the product one) just omits the errcode, which
-- defaults to P0001 and is exactly what friendlyDbError() already
-- special-cases.
-- ============================================================================

-- ─── Fix: erp_delete_product_permanently (full body from 20260909000004,
-- the only version — just the errcode removed) ─────────────────────────────

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
    raise exception 'Only an administrator may permanently delete a product';
  end if;

  select product_name into v_name from public.erp_products where id = p_product_id;
  if v_name is null then
    raise exception 'Product not found';
  end if;

  delete from public.erp_products where id = p_product_id;

  return jsonb_build_object('deleted', true, 'product_name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This product cannot be permanently deleted — it has batches, invoices or visits recorded against it. Use the active/inactive toggle instead to hide it without losing that history.';
end;
$$;

-- ─── Staff ───────────────────────────────────────────────────────────────
-- Deletes via auth.users (which erp_users.auth_user_id cascades from) so the
-- login goes with the staff record, rather than leaving an orphaned account
-- that can still authenticate but has no profile — same reasoning as
-- clear_test_data.sql. Two extra guards beyond the history check: can't
-- delete the account you're currently signed in as, and can't delete the
-- last remaining admin.

create or replace function public.erp_delete_user_permanently(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name              text;
  v_role              public.erp_role;
  v_auth_user_id      uuid;
  v_other_admin_count integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a staff account';
  end if;

  select name, role, auth_user_id into v_name, v_role, v_auth_user_id
    from public.erp_users where id = p_user_id;
  if v_name is null then
    raise exception 'Staff account not found';
  end if;

  if v_auth_user_id = auth.uid() then
    raise exception 'You cannot permanently delete your own account while signed in as it — ask another administrator, or deactivate it instead';
  end if;

  if v_role = 'ADMIN' then
    select count(*) into v_other_admin_count
      from public.erp_users where role = 'ADMIN' and id <> p_user_id;
    if v_other_admin_count = 0 then
      raise exception 'Cannot delete the only remaining administrator account';
    end if;
  end if;

  delete from auth.users where id = v_auth_user_id;

  return jsonb_build_object('deleted', true, 'name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This person cannot be permanently deleted — they have recorded visits, orders, follow-ups, attendance or other history. Deactivate their account instead.';
end;
$$;

-- ─── Doctors / Chemists / Distributors / Suppliers ─────────────────────────

create or replace function public.erp_delete_doctor_permanently(p_doctor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a doctor';
  end if;

  select doctor_name into v_name from public.erp_doctors where id = p_doctor_id;
  if v_name is null then
    raise exception 'Doctor not found';
  end if;

  delete from public.erp_doctors where id = p_doctor_id;

  return jsonb_build_object('deleted', true, 'doctor_name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This doctor cannot be permanently deleted — they have recorded visits, orders or invoices. Use the active/inactive toggle instead.';
end;
$$;

create or replace function public.erp_delete_chemist_permanently(p_chemist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a chemist';
  end if;

  select chemist_name into v_name from public.erp_chemists where id = p_chemist_id;
  if v_name is null then
    raise exception 'Chemist not found';
  end if;

  delete from public.erp_chemists where id = p_chemist_id;

  return jsonb_build_object('deleted', true, 'chemist_name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This chemist cannot be permanently deleted — they have recorded visits, orders or invoices. Use the active/inactive toggle instead.';
end;
$$;

create or replace function public.erp_delete_distributor_permanently(p_distributor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a distributor';
  end if;

  select distributor_name into v_name from public.erp_distributors where id = p_distributor_id;
  if v_name is null then
    raise exception 'Distributor not found';
  end if;

  delete from public.erp_distributors where id = p_distributor_id;

  return jsonb_build_object('deleted', true, 'distributor_name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This distributor cannot be permanently deleted — invoices are recorded against it. Use the active/inactive toggle instead.';
end;
$$;

create or replace function public.erp_delete_supplier_permanently(p_supplier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a supplier';
  end if;

  select supplier_name into v_name from public.erp_suppliers where id = p_supplier_id;
  if v_name is null then
    raise exception 'Supplier not found';
  end if;

  delete from public.erp_suppliers where id = p_supplier_id;

  return jsonb_build_object('deleted', true, 'supplier_name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This supplier cannot be permanently deleted — purchase invoices are recorded against it. Use the active/inactive toggle instead.';
end;
$$;

-- ─── Territories / Areas ────────────────────────────────────────────────────
-- Neither has a RESTRICT FK protecting it (areas cascade off a deleted
-- territory; doctors/chemists just go null on a deleted area) — so "zero
-- history" is enforced by hand here rather than relying on Postgres to
-- refuse, to keep the same "only an empty, unused record" rule as
-- everywhere else instead of silently cascading/orphaning real data.

create or replace function public.erp_delete_territory_permanently(p_territory_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name       text;
  v_area_count integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a territory';
  end if;

  select name into v_name from public.erp_territories where id = p_territory_id;
  if v_name is null then
    raise exception 'Territory not found';
  end if;

  select count(*) into v_area_count from public.erp_areas where territory_id = p_territory_id;
  if v_area_count > 0 then
    raise exception 'This territory cannot be permanently deleted — it still has % area(s) under it. Remove or reassign those first.', v_area_count;
  end if;

  delete from public.erp_territories where id = p_territory_id;

  return jsonb_build_object('deleted', true, 'name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This territory cannot be permanently deleted — it still has history tied to it. Use the active/inactive toggle instead.';
end;
$$;

create or replace function public.erp_delete_area_permanently(p_area_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name          text;
  v_doctor_count  integer;
  v_chemist_count integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete an area';
  end if;

  select name into v_name from public.erp_areas where id = p_area_id;
  if v_name is null then
    raise exception 'Area not found';
  end if;

  select count(*) into v_doctor_count  from public.erp_doctors  where area_id = p_area_id;
  select count(*) into v_chemist_count from public.erp_chemists where area_id = p_area_id;
  if v_doctor_count > 0 or v_chemist_count > 0 then
    raise exception 'This area cannot be permanently deleted — % doctor(s) and % chemist(s) are still assigned to it. Reassign them first.', v_doctor_count, v_chemist_count;
  end if;

  delete from public.erp_areas where id = p_area_id;

  return jsonb_build_object('deleted', true, 'name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This area cannot be permanently deleted — it still has history tied to it. Use the active/inactive toggle instead.';
end;
$$;

-- ─── Bank accounts ───────────────────────────────────────────────────────
-- No RESTRICT dependents at all (erp_settings.selected_bank_account_id just
-- goes null) — nothing to catch, so no exception handler pretending there is.

create or replace function public.erp_delete_bank_account_permanently(p_bank_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a bank account';
  end if;

  select bank_name into v_name from public.erp_bank_accounts where id = p_bank_account_id;
  if v_name is null then
    raise exception 'Bank account not found';
  end if;

  delete from public.erp_bank_accounts where id = p_bank_account_id;

  return jsonb_build_object('deleted', true, 'bank_name', v_name);
end;
$$;

-- ─── Pricing rules / Schemes ────────────────────────────────────────────────
-- erp_sales_invoice_items.pricing_rule_id/margin_scheme_id/free_scheme_id are
-- all ON DELETE SET NULL, not RESTRICT — the original design (20260907000003)
-- deliberately wanted a past invoice to keep pointing at the rule/scheme
-- that priced it. Deleting here would silently sever that, so "zero
-- history" is enforced by hand, same reasoning as territories/areas above.

create or replace function public.erp_delete_pricing_rule_permanently(p_pricing_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_usage_count integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a pricing rule';
  end if;

  select id into v_id from public.erp_pricing_rules where id = p_pricing_rule_id;
  if v_id is null then
    raise exception 'Pricing rule not found';
  end if;

  select count(*) into v_usage_count
    from public.erp_sales_invoice_items where pricing_rule_id = p_pricing_rule_id;
  if v_usage_count > 0 then
    raise exception 'This pricing rule cannot be permanently deleted — % sales invoice line(s) were priced using it and must keep that reference. Mark it inactive instead.', v_usage_count;
  end if;

  delete from public.erp_pricing_rules where id = p_pricing_rule_id;

  return jsonb_build_object('deleted', true);
end;
$$;

create or replace function public.erp_delete_scheme_permanently(p_scheme_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id          uuid;
  v_usage_count integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a scheme';
  end if;

  select id into v_id from public.erp_schemes where id = p_scheme_id;
  if v_id is null then
    raise exception 'Scheme not found';
  end if;

  select count(*) into v_usage_count
    from public.erp_sales_invoice_items
   where margin_scheme_id = p_scheme_id or free_scheme_id = p_scheme_id;
  if v_usage_count > 0 then
    raise exception 'This scheme cannot be permanently deleted — % sales invoice line(s) used it and must keep that reference. Mark it inactive instead.', v_usage_count;
  end if;

  delete from public.erp_schemes where id = p_scheme_id;

  return jsonb_build_object('deleted', true);
exception
  when foreign_key_violation then
    raise exception 'This scheme cannot be permanently deleted — it still has history tied to it (e.g. customer assignments). Mark it inactive instead.';
end;
$$;

-- ─── Leave types ─────────────────────────────────────────────────────────
-- No DELETE grant exists on erp_leave_types at all today (insert/update
-- only) — unneeded here regardless, since this SECURITY DEFINER function
-- doesn't go through the table's own grants/RLS.

create or replace function public.erp_delete_leave_type_permanently(p_leave_type_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may permanently delete a leave type';
  end if;

  select name into v_name from public.erp_leave_types where id = p_leave_type_id;
  if v_name is null then
    raise exception 'Leave type not found';
  end if;

  delete from public.erp_leave_types where id = p_leave_type_id;

  return jsonb_build_object('deleted', true, 'name', v_name);
exception
  when foreign_key_violation then
    raise exception 'This leave type cannot be permanently deleted — leave requests already reference it. Mark it inactive instead.';
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────

revoke all on function public.erp_delete_user_permanently(uuid) from public;
revoke all on function public.erp_delete_doctor_permanently(uuid) from public;
revoke all on function public.erp_delete_chemist_permanently(uuid) from public;
revoke all on function public.erp_delete_distributor_permanently(uuid) from public;
revoke all on function public.erp_delete_supplier_permanently(uuid) from public;
revoke all on function public.erp_delete_territory_permanently(uuid) from public;
revoke all on function public.erp_delete_area_permanently(uuid) from public;
revoke all on function public.erp_delete_bank_account_permanently(uuid) from public;
revoke all on function public.erp_delete_pricing_rule_permanently(uuid) from public;
revoke all on function public.erp_delete_scheme_permanently(uuid) from public;
revoke all on function public.erp_delete_leave_type_permanently(uuid) from public;

grant execute on function public.erp_delete_user_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_doctor_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_chemist_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_distributor_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_supplier_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_territory_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_area_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_bank_account_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_pricing_rule_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_scheme_permanently(uuid) to authenticated;
grant execute on function public.erp_delete_leave_type_permanently(uuid) to authenticated;
