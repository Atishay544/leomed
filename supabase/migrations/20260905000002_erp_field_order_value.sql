-- ============================================================================
-- LEOMED PHARMA ERP — 9 · FIELD ORDER VALUE (Q2) + AUDIT COMPLETENESS (Q3)
--
-- Q2 confirmed: a field order carries an ESTIMATED monetary value — product,
-- quantity, rate, discount, estimated line value, estimated order total.
--
-- What that value is NOT, and what this migration takes care to keep true:
--   · it does not reduce inventory
--   · it does not create a sale
--   · it does not create a receivable
--   · it does not touch financial accounting
--
-- It exists for MR performance, demand tracking and field analysis. The
-- absence of any link from erp_field_orders to erp_sales_invoices,
-- erp_inventory_transactions or erp_sales_receipts is the guarantee, and
-- supabase/tests/erp_business_rules.sql asserts it.
-- ============================================================================

-- ─── Discount on a field order line ─────────────────────────────────────────
-- Percent rather than a rupee amount, matching how discounts are already
-- expressed on purchase and sales invoice lines — one mental model across the
-- system, and it survives a rate change without being recalculated.

alter table public.erp_field_order_items
  add column if not exists discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100);

-- line_value is a generated column, so changing its formula means replacing
-- it. Nothing is lost: every value is derived from columns that remain.
alter table public.erp_field_order_items drop column if exists line_value;

alter table public.erp_field_order_items
  add column line_value numeric(14,2)
  generated always as (
    round(quantity * unit_rate * (1 - discount_percent / 100), 2)
  ) stored;

-- Existing orders were totalled before discounts existed; the item trigger
-- only fires on item changes, so the parents are recomputed once here.
update public.erp_field_orders o
   set estimated_value = coalesce((
         select sum(i.line_value)
           from public.erp_field_order_items i
          where i.field_order_id = o.id
       ), 0);

comment on column public.erp_field_order_items.line_value is
  'Estimated value of this line: quantity x rate less discount. Indicative demand only — never a sale, a receivable, or a stock movement.';

comment on column public.erp_field_orders.estimated_value is
  'Estimated field order value, summed from its lines. Used for MR performance and demand tracking. Not revenue.';

-- ─── One place that builds field order lines ────────────────────────────────
-- Extracted so the doctor and chemist visit workflows cannot drift apart, and
-- so a future change to how a line is priced happens once.

create or replace function public.erp_insert_field_order_items(
  p_order uuid,
  p_items jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item  jsonb;
  v_count integer := 0;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.erp_field_order_items (
      field_order_id, product_id, quantity, unit, unit_rate, discount_percent, remarks
    )
    select p_order,
           p.id,
           (v_item->>'quantity')::integer,
           coalesce(nullif(v_item->>'unit', ''), p.unit),
           -- Snapshot of today's list rate unless the MR was quoted another.
           coalesce(nullif(v_item->>'unit_rate', '')::numeric, p.sale_rate),
           coalesce(nullif(v_item->>'discount_percent', '')::numeric, 0),
           nullif(v_item->>'remarks', '')
      from public.erp_products p
     where p.id = (v_item->>'product_id')::uuid;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.erp_insert_field_order_items(uuid, jsonb) from public;
grant execute on function public.erp_insert_field_order_items(uuid, jsonb) to authenticated;

-- ─── Visit workflows, updated to carry the discount through ─────────────────
-- Re-declared in full because a function body cannot be patched in place.
-- Behaviour is unchanged except that order lines now accept discount_percent
-- and are built by the shared helper above.

create or replace function public.erp_create_doctor_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor      uuid;
  v_mr         uuid;
  v_doctor     uuid;
  v_visit      uuid;
  v_is_new     boolean := false;
  v_order      uuid;
  v_order_no   text;
  v_client_req uuid;
  v_new_doc    jsonb;
  v_item       jsonb;
  v_order_json jsonb;
begin
  v_actor := public.erp_current_user_id();
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_doctor_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  v_new_doc := p_payload -> 'new_doctor';
  if v_new_doc is not null and jsonb_typeof(v_new_doc) = 'object' then
    insert into public.erp_doctors (
      doctor_name, specialization, qualification, phone, email,
      address, city, area, territory, clinic_name, created_by, updated_by
    ) values (
      trim(v_new_doc->>'doctor_name'),
      nullif(v_new_doc->>'specialization', ''),
      nullif(v_new_doc->>'qualification', ''),
      nullif(v_new_doc->>'phone', ''),
      nullif(v_new_doc->>'email', ''),
      nullif(v_new_doc->>'address', ''),
      nullif(v_new_doc->>'city', ''),
      nullif(v_new_doc->>'area', ''),
      nullif(v_new_doc->>'territory', ''),
      nullif(v_new_doc->>'clinic_name', ''),
      v_actor, v_actor
    )
    returning id into v_doctor;
    v_is_new := true;
  else
    v_doctor := nullif(p_payload->>'doctor_id', '')::uuid;
    if v_doctor is null then
      raise exception 'Select an existing doctor or fill in the new-doctor details';
    end if;
  end if;

  insert into public.erp_doctor_visits (
    doctor_id, mr_id, visit_date, visit_time, purpose, discussion, remarks,
    doctor_status, follow_up_required, follow_up_date, latitude, longitude,
    client_request_id, created_by, updated_by
  ) values (
    v_doctor, v_mr,
    coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
    nullif(p_payload->>'visit_time', '')::time,
    coalesce(nullif(p_payload->>'purpose', '')::public.erp_visit_purpose, 'PRODUCT_DETAILING'),
    nullif(p_payload->>'discussion', ''),
    nullif(p_payload->>'remarks', ''),
    case when v_is_new then 'NEW' else 'EXISTING' end::public.erp_doctor_status,
    coalesce((p_payload->>'follow_up_required')::boolean, false),
    nullif(p_payload->>'follow_up_date', '')::date,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_client_req, v_actor, v_actor
  )
  returning id into v_visit;

  if v_is_new then
    perform public.erp_link_doctor_to_visit(v_doctor, v_visit);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'products', '[]'::jsonb))
  loop
    insert into public.erp_doctor_visit_products (
      visit_id, product_id, discussion_type, sample_quantity, remarks
    ) values (
      v_visit,
      (v_item->>'product_id')::uuid,
      coalesce(nullif(v_item->>'discussion_type', '')::public.erp_discussion_type, 'DETAILED'),
      coalesce((v_item->>'sample_quantity')::integer, 0),
      nullif(v_item->>'remarks', '')
    )
    on conflict (visit_id, product_id) do nothing;
  end loop;

  -- An order taken during the visit is a FIELD ORDER: a priced demand signal.
  -- It creates no sales invoice, no receivable and no stock movement (Q2).
  v_order_json := p_payload -> 'order';
  if v_order_json is not null and jsonb_typeof(v_order_json) = 'object'
     and coalesce((v_order_json->>'received')::boolean, false) then

    v_order_no := public.erp_next_document_number('field_order', 'FO');

    insert into public.erp_field_orders (
      order_number, customer_type, doctor_id, mr_id, doctor_visit_id,
      order_date, order_book_number, remarks, created_by, updated_by
    ) values (
      v_order_no, 'DOCTOR', v_doctor, v_mr, v_visit,
      coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
      nullif(v_order_json->>'order_book_number', ''),
      nullif(v_order_json->>'remarks', ''),
      v_actor, v_actor
    )
    returning id into v_order;

    perform public.erp_insert_field_order_items(v_order, v_order_json->'items');

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, doctor_id, doctor_visit_id, followup_date,
      description, priority, created_by, updated_by
    ) values (
      v_mr, 'DOCTOR', v_doctor, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor, v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',      v_visit,
    'doctor_id',     v_doctor,
    'doctor_status', case when v_is_new then 'NEW' else 'EXISTING' end,
    'order_id',      v_order,
    'order_number',  v_order_no,
    'order_value',   (select estimated_value from public.erp_field_orders where id = v_order),
    'duplicate',     false
  );
end;
$$;

create or replace function public.erp_create_chemist_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor      uuid;
  v_mr         uuid;
  v_chemist    uuid;
  v_visit      uuid;
  v_is_new     boolean := false;
  v_order      uuid;
  v_order_no   text;
  v_client_req uuid;
  v_new_chem   jsonb;
  v_order_json jsonb;
begin
  v_actor := public.erp_current_user_id();
  if v_actor is null then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_chemist_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  v_new_chem := p_payload -> 'new_chemist';
  if v_new_chem is not null and jsonb_typeof(v_new_chem) = 'object' then
    insert into public.erp_chemists (
      chemist_name, owner_name, phone, email, address, city,
      area, territory, gst_number, drug_license_number, created_by, updated_by
    ) values (
      trim(v_new_chem->>'chemist_name'),
      nullif(v_new_chem->>'owner_name', ''),
      nullif(v_new_chem->>'phone', ''),
      nullif(v_new_chem->>'email', ''),
      nullif(v_new_chem->>'address', ''),
      nullif(v_new_chem->>'city', ''),
      nullif(v_new_chem->>'area', ''),
      nullif(v_new_chem->>'territory', ''),
      nullif(v_new_chem->>'gst_number', ''),
      nullif(v_new_chem->>'drug_license_number', ''),
      v_actor, v_actor
    )
    returning id into v_chemist;
    v_is_new := true;
  else
    v_chemist := nullif(p_payload->>'chemist_id', '')::uuid;
    if v_chemist is null then
      raise exception 'Select an existing chemist or fill in the new-chemist details';
    end if;
  end if;

  insert into public.erp_chemist_visits (
    chemist_id, mr_id, visit_date, visit_time, purpose, discussion, remarks,
    follow_up_required, follow_up_date, latitude, longitude,
    client_request_id, created_by, updated_by
  ) values (
    v_chemist, v_mr,
    coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
    nullif(p_payload->>'visit_time', '')::time,
    coalesce(nullif(p_payload->>'purpose', '')::public.erp_visit_purpose, 'ORDER_COLLECTION'),
    nullif(p_payload->>'discussion', ''),
    nullif(p_payload->>'remarks', ''),
    coalesce((p_payload->>'follow_up_required')::boolean, false),
    nullif(p_payload->>'follow_up_date', '')::date,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_client_req, v_actor, v_actor
  )
  returning id into v_visit;

  if v_is_new then
    perform public.erp_link_chemist_to_visit(v_chemist, v_visit);
  end if;

  v_order_json := p_payload -> 'order';
  if v_order_json is not null and jsonb_typeof(v_order_json) = 'object'
     and coalesce((v_order_json->>'received')::boolean, false) then

    v_order_no := public.erp_next_document_number('field_order', 'FO');

    insert into public.erp_field_orders (
      order_number, customer_type, chemist_id, mr_id, chemist_visit_id,
      order_date, order_book_number, remarks, created_by, updated_by
    ) values (
      v_order_no, 'CHEMIST', v_chemist, v_mr, v_visit,
      coalesce(nullif(p_payload->>'visit_date', '')::date, current_date),
      nullif(v_order_json->>'order_book_number', ''),
      nullif(v_order_json->>'remarks', ''),
      v_actor, v_actor
    )
    returning id into v_order;

    perform public.erp_insert_field_order_items(v_order, v_order_json->'items');

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, chemist_id, chemist_visit_id, followup_date,
      description, priority, created_by, updated_by
    ) values (
      v_mr, 'CHEMIST', v_chemist, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor, v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',     v_visit,
    'chemist_id',   v_chemist,
    'is_new',       v_is_new,
    'order_id',     v_order,
    'order_number', v_order_no,
    'order_value',  (select estimated_value from public.erp_field_orders where id = v_order),
    'duplicate',    false
  );
end;
$$;

-- ============================================================================
-- Q3 · AUDIT COMPLETENESS
-- The 24-hour MR edit window and its server-side enforcement already exist
-- (erp_settings.mr_edit_window_hours, erp_within_edit_window(), and the RLS
-- policies on visits, orders and customer masters). These fill the two gaps in
-- "maintain created_at / created_by / updated_at / updated_by, and an audit
-- trail of important changes".
-- ============================================================================

alter table public.erp_followups
  add column if not exists updated_by uuid references public.erp_users(id) on delete set null;

-- Field orders carry a monetary value and a fulfilment status that management
-- can change, so who changed what is worth keeping.
drop trigger if exists erp_field_orders_audit on public.erp_field_orders;
create trigger erp_field_orders_audit
  after insert or update or delete on public.erp_field_orders
  for each row execute function public.erp_audit_trigger();
