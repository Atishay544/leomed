-- ============================================================================
-- LEOMED PHARMA ERP — 6/6 · GRANTS & ROW LEVEL SECURITY
--
-- Two independent layers, both required:
--   GRANTS decide which VERBS a role may attempt, and on which COLUMNS.
--   POLICIES decide which ROWS those verbs may touch.
-- A missing grant produces "permission denied"; a missing policy silently
-- returns nothing. Both are spelled out below for every table.
--
-- Hiding a menu item is not security (spec §36). Every rule here holds even if
-- a request is made straight against PostgREST with a stolen anon key.
-- ============================================================================

alter table public.erp_users                  enable row level security;
alter table public.erp_settings               enable row level security;
alter table public.erp_audit_logs             enable row level security;
alter table public.erp_document_counters      enable row level security;
alter table public.erp_doctors                enable row level security;
alter table public.erp_chemists               enable row level security;
alter table public.erp_distributors           enable row level security;
alter table public.erp_suppliers              enable row level security;
alter table public.erp_products               enable row level security;
alter table public.erp_product_batches        enable row level security;
alter table public.erp_doctor_visits          enable row level security;
alter table public.erp_chemist_visits         enable row level security;
alter table public.erp_doctor_visit_products  enable row level security;
alter table public.erp_field_orders           enable row level security;
alter table public.erp_field_order_items      enable row level security;
alter table public.erp_followups              enable row level security;
alter table public.erp_targets                enable row level security;
alter table public.erp_purchase_invoices      enable row level security;
alter table public.erp_purchase_invoice_items enable row level security;
alter table public.erp_sales_invoices         enable row level security;
alter table public.erp_sales_invoice_items    enable row level security;
alter table public.erp_inventory_transactions enable row level security;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Nothing in the ERP is public. anon gets no access at all.
revoke all on public.erp_users, public.erp_settings, public.erp_audit_logs,
              public.erp_document_counters, public.erp_doctors, public.erp_chemists,
              public.erp_distributors, public.erp_suppliers, public.erp_products,
              public.erp_product_batches, public.erp_doctor_visits, public.erp_chemist_visits,
              public.erp_doctor_visit_products, public.erp_field_orders,
              public.erp_field_order_items, public.erp_followups, public.erp_targets,
              public.erp_purchase_invoices, public.erp_purchase_invoice_items,
              public.erp_sales_invoices, public.erp_sales_invoice_items,
              public.erp_inventory_transactions
  from anon;

grant select on public.erp_settings to authenticated;
grant update on public.erp_settings to authenticated;

grant select, insert, update on public.erp_users        to authenticated;
grant select                 on public.erp_audit_logs   to authenticated;

-- No DELETE anywhere in the master data: records with visit history are
-- deactivated, not removed (spec §34).
grant select, insert, update         on public.erp_doctors      to authenticated;
grant select, insert, update         on public.erp_chemists     to authenticated;
grant select, insert, update         on public.erp_distributors to authenticated;
grant select, insert, update         on public.erp_suppliers    to authenticated;
grant select, insert, update         on public.erp_products      to authenticated;

-- Column-scoped on purpose: current_quantity and opening_quantity are owned by
-- the ledger trigger. No app role can write a stock number by any route (D5).
grant select on public.erp_product_batches to authenticated;
grant insert (product_id, batch_number, manufacturing_date, expiry_date,
              mrp, purchase_rate, sale_rate, created_by)
  on public.erp_product_batches to authenticated;
grant update (batch_number, manufacturing_date, expiry_date,
              mrp, purchase_rate, sale_rate)
  on public.erp_product_batches to authenticated;

grant select, insert, update, delete on public.erp_doctor_visits         to authenticated;
grant select, insert, update, delete on public.erp_chemist_visits        to authenticated;
grant select, insert, update, delete on public.erp_doctor_visit_products to authenticated;
grant select, insert, update, delete on public.erp_field_orders          to authenticated;
grant select, insert, update, delete on public.erp_field_order_items     to authenticated;
grant select, insert, update, delete on public.erp_followups             to authenticated;
grant select, insert, update, delete on public.erp_targets               to authenticated;

-- Invoices are created by erp_save_*_invoice(), which runs as the table owner.
-- Direct UPDATE exists only to record a payment or fix a note — never to
-- restate a total, so the money columns are not grantable (spec §52).
grant select on public.erp_purchase_invoices to authenticated;
grant select on public.erp_sales_invoices    to authenticated;
grant update (amount_paid, remarks, updated_by) on public.erp_purchase_invoices to authenticated;
grant update (amount_paid, remarks, updated_by) on public.erp_sales_invoices    to authenticated;
grant select on public.erp_purchase_invoice_items to authenticated;
grant select on public.erp_sales_invoice_items    to authenticated;

-- The ledger has exactly one writer: the SECURITY DEFINER functions. No INSERT,
-- UPDATE or DELETE grant is issued to anybody (spec §15).
grant select on public.erp_inventory_transactions to authenticated;

-- erp_document_counters gets no grants at all — number issuing is a DB concern.

-- ============================================================================
-- POLICIES — staff directory
-- ============================================================================

drop policy if exists erp_users_select on public.erp_users;
create policy erp_users_select on public.erp_users
  for select to authenticated
  using (auth_user_id = auth.uid() or public.erp_is_admin() or public.erp_can_read_all_field());

drop policy if exists erp_users_insert on public.erp_users;
create policy erp_users_insert on public.erp_users
  for insert to authenticated
  with check (public.erp_is_admin());

drop policy if exists erp_users_update on public.erp_users;
create policy erp_users_update on public.erp_users
  for update to authenticated
  using (public.erp_is_admin() or auth_user_id = auth.uid())
  with check (public.erp_is_admin() or auth_user_id = auth.uid());
-- No DELETE policy: staff are deactivated, never deleted, so history survives.

-- Belt to the policy's braces: without this a non-admin could edit their own
-- row and promote themselves to ADMIN, since the policy above lets them write it.
create or replace function public.erp_guard_user_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.erp_is_admin() then
    return new;
  end if;

  if new.role         is distinct from old.role
     or new.active       is distinct from old.active
     or new.mr_code      is distinct from old.mr_code
     or new.territory    is distinct from old.territory
     or new.reports_to   is distinct from old.reports_to
     or new.auth_user_id is distinct from old.auth_user_id
     or new.email        is distinct from old.email
  then
    raise exception 'Only an administrator can change role, MR code, territory, email or account status'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_users_self_update_guard on public.erp_users;
create trigger erp_users_self_update_guard
  before update on public.erp_users
  for each row execute function public.erp_guard_user_self_update();

-- ============================================================================
-- POLICIES — settings & audit
-- ============================================================================

drop policy if exists erp_settings_select on public.erp_settings;
create policy erp_settings_select on public.erp_settings
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_settings_update on public.erp_settings;
create policy erp_settings_update on public.erp_settings
  for update to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_audit_select on public.erp_audit_logs;
create policy erp_audit_select on public.erp_audit_logs
  for select to authenticated using (public.erp_is_admin());
-- Writes come only from the audit trigger, which runs as the table owner.

-- ============================================================================
-- POLICIES — customer masters
-- Shared company records. Any staff member may read and search them; MRs may
-- add new ones (that is the whole point of the visit workflow) but may not
-- rewrite records other people created (spec §10, §11, §34).
-- ============================================================================

drop policy if exists erp_doctors_select on public.erp_doctors;
create policy erp_doctors_select on public.erp_doctors
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_doctors_insert on public.erp_doctors;
create policy erp_doctors_insert on public.erp_doctors
  for insert to authenticated
  with check (public.erp_is_admin() or public.erp_current_role() = 'MR');

drop policy if exists erp_doctors_update on public.erp_doctors;
create policy erp_doctors_update on public.erp_doctors
  for update to authenticated
  using (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );
-- No DELETE policy: deactivate instead, so visit history keeps its subject.

drop policy if exists erp_chemists_select on public.erp_chemists;
create policy erp_chemists_select on public.erp_chemists
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_chemists_insert on public.erp_chemists;
create policy erp_chemists_insert on public.erp_chemists
  for insert to authenticated
  with check (public.erp_is_admin() or public.erp_current_role() = 'MR');

drop policy if exists erp_chemists_update on public.erp_chemists;
create policy erp_chemists_update on public.erp_chemists
  for update to authenticated
  using (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (
    public.erp_is_admin()
    or (created_by = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );

-- ============================================================================
-- POLICIES — trade partners
-- Distributors are visible to the whole field force (an MR may need to know who
-- serves an area). Suppliers are a purchasing concern only.
-- ============================================================================

drop policy if exists erp_distributors_select on public.erp_distributors;
create policy erp_distributors_select on public.erp_distributors
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_distributors_write on public.erp_distributors;
create policy erp_distributors_write on public.erp_distributors
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_distributors_update on public.erp_distributors;
create policy erp_distributors_update on public.erp_distributors
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

drop policy if exists erp_suppliers_select on public.erp_suppliers;
create policy erp_suppliers_select on public.erp_suppliers
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_suppliers_write on public.erp_suppliers;
create policy erp_suppliers_write on public.erp_suppliers
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_suppliers_update on public.erp_suppliers;
create policy erp_suppliers_update on public.erp_suppliers
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

-- ============================================================================
-- POLICIES — product master & batches
-- MRs must be able to pick products; only admins may define them (spec §13).
-- ============================================================================

drop policy if exists erp_products_select on public.erp_products;
create policy erp_products_select on public.erp_products
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_products_insert on public.erp_products;
create policy erp_products_insert on public.erp_products
  for insert to authenticated with check (public.erp_is_admin());

drop policy if exists erp_products_update on public.erp_products;
create policy erp_products_update on public.erp_products
  for update to authenticated
  using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_batches_select on public.erp_product_batches;
create policy erp_batches_select on public.erp_product_batches
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_batches_insert on public.erp_product_batches;
create policy erp_batches_insert on public.erp_product_batches
  for insert to authenticated with check (public.erp_can_write_billing());

drop policy if exists erp_batches_update on public.erp_product_batches;
create policy erp_batches_update on public.erp_product_batches
  for update to authenticated
  using (public.erp_can_write_billing()) with check (public.erp_can_write_billing());

-- ============================================================================
-- POLICIES — visits
-- An MR sees and files their own work. The WITH CHECK on insert is what makes
-- MR identity unforgeable: crafting a request with someone else's mr_id is
-- rejected by the database, not merely by the form (spec §36).
-- ============================================================================

drop policy if exists erp_doctor_visits_select on public.erp_doctor_visits;
create policy erp_doctor_visits_select on public.erp_doctor_visits
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_doctor_visits_insert on public.erp_doctor_visits;
create policy erp_doctor_visits_insert on public.erp_doctor_visits
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_doctor_visits_update on public.erp_doctor_visits;
create policy erp_doctor_visits_update on public.erp_doctor_visits
  for update to authenticated
  using (
    public.erp_is_admin()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_doctor_visits_delete on public.erp_doctor_visits;
create policy erp_doctor_visits_delete on public.erp_doctor_visits
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_chemist_visits_select on public.erp_chemist_visits;
create policy erp_chemist_visits_select on public.erp_chemist_visits
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_chemist_visits_insert on public.erp_chemist_visits;
create policy erp_chemist_visits_insert on public.erp_chemist_visits
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_chemist_visits_update on public.erp_chemist_visits;
create policy erp_chemist_visits_update on public.erp_chemist_visits
  for update to authenticated
  using (
    public.erp_is_admin()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  )
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_chemist_visits_delete on public.erp_chemist_visits;
create policy erp_chemist_visits_delete on public.erp_chemist_visits
  for delete to authenticated using (public.erp_is_admin());

-- Visit line items inherit their parent's visibility exactly.
drop policy if exists erp_visit_products_select on public.erp_doctor_visit_products;
create policy erp_visit_products_select on public.erp_doctor_visit_products
  for select to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (v.mr_id = public.erp_current_user_id() or public.erp_can_read_all_field())
  ));

drop policy if exists erp_visit_products_write on public.erp_doctor_visit_products;
create policy erp_visit_products_write on public.erp_doctor_visit_products
  for insert to authenticated
  with check (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (v.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ));

drop policy if exists erp_visit_products_update on public.erp_doctor_visit_products;
create policy erp_visit_products_update on public.erp_doctor_visit_products
  for update to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (public.erp_is_admin()
            or (v.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(v.created_at)))
  ));

drop policy if exists erp_visit_products_delete on public.erp_doctor_visit_products;
create policy erp_visit_products_delete on public.erp_doctor_visit_products
  for delete to authenticated
  using (exists (
    select 1 from public.erp_doctor_visits v
     where v.id = visit_id
       and (public.erp_is_admin()
            or (v.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(v.created_at)))
  ));

-- ============================================================================
-- POLICIES — field orders
-- ============================================================================

drop policy if exists erp_field_orders_select on public.erp_field_orders;
create policy erp_field_orders_select on public.erp_field_orders
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_field_orders_insert on public.erp_field_orders;
create policy erp_field_orders_insert on public.erp_field_orders
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

-- Admins and managers move orders through the fulfilment statuses; an MR may
-- still correct their own paperwork inside the edit window.
drop policy if exists erp_field_orders_update on public.erp_field_orders;
create policy erp_field_orders_update on public.erp_field_orders
  for update to authenticated
  using (
    public.erp_can_read_all_field()
    or (mr_id = public.erp_current_user_id() and public.erp_within_edit_window(created_at))
  );

drop policy if exists erp_field_orders_delete on public.erp_field_orders;
create policy erp_field_orders_delete on public.erp_field_orders
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_field_order_items_select on public.erp_field_order_items;
create policy erp_field_order_items_select on public.erp_field_order_items
  for select to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (o.mr_id = public.erp_current_user_id() or public.erp_can_read_all_field())
  ));

drop policy if exists erp_field_order_items_insert on public.erp_field_order_items;
create policy erp_field_order_items_insert on public.erp_field_order_items
  for insert to authenticated
  with check (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (o.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ));

drop policy if exists erp_field_order_items_update on public.erp_field_order_items;
create policy erp_field_order_items_update on public.erp_field_order_items
  for update to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (public.erp_is_admin()
            or (o.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(o.created_at)))
  ));

drop policy if exists erp_field_order_items_delete on public.erp_field_order_items;
create policy erp_field_order_items_delete on public.erp_field_order_items
  for delete to authenticated
  using (exists (
    select 1 from public.erp_field_orders o
     where o.id = field_order_id
       and (public.erp_is_admin()
            or (o.mr_id = public.erp_current_user_id() and public.erp_within_edit_window(o.created_at)))
  ));

-- ============================================================================
-- POLICIES — follow-ups & targets
-- ============================================================================

drop policy if exists erp_followups_select on public.erp_followups;
create policy erp_followups_select on public.erp_followups
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_followups_insert on public.erp_followups;
create policy erp_followups_insert on public.erp_followups
  for insert to authenticated
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

-- No edit window here: closing a follow-up weeks later is the normal workflow.
drop policy if exists erp_followups_update on public.erp_followups;
create policy erp_followups_update on public.erp_followups
  for update to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_is_admin())
  with check (mr_id = public.erp_current_user_id() or public.erp_is_admin());

drop policy if exists erp_followups_delete on public.erp_followups;
create policy erp_followups_delete on public.erp_followups
  for delete to authenticated using (public.erp_is_admin());

drop policy if exists erp_targets_select on public.erp_targets;
create policy erp_targets_select on public.erp_targets
  for select to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());

drop policy if exists erp_targets_insert on public.erp_targets;
create policy erp_targets_insert on public.erp_targets
  for insert to authenticated with check (public.erp_is_admin());

drop policy if exists erp_targets_update on public.erp_targets;
create policy erp_targets_update on public.erp_targets
  for update to authenticated
  using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_targets_delete on public.erp_targets;
create policy erp_targets_delete on public.erp_targets
  for delete to authenticated using (public.erp_is_admin());

-- ============================================================================
-- POLICIES — billing
-- MRs are absent from every policy here by design: field staff have no business
-- reading company invoices or margins (spec §5).
-- ============================================================================

drop policy if exists erp_purchase_invoices_select on public.erp_purchase_invoices;
create policy erp_purchase_invoices_select on public.erp_purchase_invoices
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_purchase_invoices_update on public.erp_purchase_invoices;
create policy erp_purchase_invoices_update on public.erp_purchase_invoices
  for update to authenticated
  using (public.erp_is_admin() or (public.erp_can_write_billing() and payment_status <> 'PAID'))
  with check (public.erp_can_write_billing());

drop policy if exists erp_purchase_items_select on public.erp_purchase_invoice_items;
create policy erp_purchase_items_select on public.erp_purchase_invoice_items
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_sales_invoices_select on public.erp_sales_invoices;
create policy erp_sales_invoices_select on public.erp_sales_invoices
  for select to authenticated using (public.erp_can_read_billing());

drop policy if exists erp_sales_invoices_update on public.erp_sales_invoices;
create policy erp_sales_invoices_update on public.erp_sales_invoices
  for update to authenticated
  using (public.erp_is_admin() or (public.erp_can_write_billing() and payment_status <> 'PAID'))
  with check (public.erp_can_write_billing());

drop policy if exists erp_sales_items_select on public.erp_sales_invoice_items;
create policy erp_sales_items_select on public.erp_sales_invoice_items
  for select to authenticated using (public.erp_can_read_billing());

-- ============================================================================
-- POLICIES — inventory ledger
-- Readable by the money roles; writable through erp_save_*_invoice() and
-- erp_adjust_inventory() alone. There is deliberately no INSERT policy: even
-- with a grant, no direct write would pass.
-- ============================================================================

drop policy if exists erp_inventory_select on public.erp_inventory_transactions;
create policy erp_inventory_select on public.erp_inventory_transactions
  for select to authenticated using (public.erp_can_read_billing());

-- ============================================================================
-- Service role — mirrors 20260724000002 so ERP admin tooling keeps working.
-- ============================================================================

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
