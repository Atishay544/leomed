-- ============================================================================
-- Field order business value now comes from a self-reported real invoice,
-- not from product/quantity/rate lines typed in during the visit.
--
-- Rationale (recorded here since it changes what "field order value" means
-- everywhere it's used): the old estimated_value was always a guess — an MR
-- picking a product, quantity and rate with no real pricing knowledge and
-- nothing checking it. It gave a false sense of precision. The MR still
-- takes an order in the field and logs only the order book number; once the
-- real invoice exists (raised by the distributor, or by Leomed directly —
-- both handled identically), the MR comes back and submits its invoice
-- number, amount and a photo. That is rougher on its face, but it is tied
-- to real evidence an admin can actually check, which the old system never
-- had at all.
--
-- Two states an admin acts on: SUBMITTED (default the moment an MR
-- submits — counts toward business-generated figures) and REJECTED (admin
-- says this one is wrong — strictly excluded). PENDING is simply "nothing
-- submitted yet".
-- ============================================================================

do $$ begin
  create type public.erp_order_invoice_status as enum ('PENDING', 'SUBMITTED', 'REJECTED');
exception when duplicate_object then null; end $$;

alter table public.erp_field_orders
  add column if not exists invoice_status              public.erp_order_invoice_status not null default 'PENDING',
  add column if not exists reported_invoice_number      text,
  add column if not exists reported_invoice_amount      numeric(14,2) check (reported_invoice_amount is null or reported_invoice_amount > 0),
  add column if not exists reported_invoice_photo_url   text,
  add column if not exists reported_by                  uuid references public.erp_users(id) on delete set null,
  add column if not exists reported_at                  timestamptz,
  add column if not exists reviewed_by                  uuid references public.erp_users(id) on delete set null,
  add column if not exists reviewed_at                  timestamptz,
  add column if not exists rejection_reason             text;

create index if not exists erp_field_orders_invoice_status_idx on public.erp_field_orders (invoice_status);

comment on column public.erp_field_orders.reported_invoice_amount is
  'MR self-reported invoice amount — a rough figure for business-generated tracking until an admin cross-checks it against reported_invoice_photo_url. Never a source for accounting.';

-- ─── Visit creation: drop product-line order entry ──────────────────────────
-- Full bodies from 20260906001_visit_photo_gps.sql (the latest prior
-- redefinition, confirmed by reading it completely first), with the
-- product-line item loop and its "no product lines" exception removed —
-- an order received during a visit now needs only order_book_number.

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
    photo_url, client_request_id, created_by, updated_by
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
    nullif(p_payload->>'photo_url', ''),
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

  -- An order taken during the visit is a FIELD ORDER: a demand signal, not
  -- an invoice. It carries only the order book number now — its business
  -- value comes later, from erp_submit_order_invoice() against the real
  -- invoice, not from product lines typed in here.
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
    photo_url, client_request_id, created_by, updated_by
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
    nullif(p_payload->>'photo_url', ''),
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
    'duplicate',    false
  );
end;
$$;

-- ─── MR self-reports the real invoice against their own order ──────────────
-- Always overwrites, including after a REJECTED review — "fix it and
-- resubmit" is the expected correction path, which resets the row to a
-- fresh SUBMITTED review cycle.

create or replace function public.erp_submit_order_invoice(
  p_order_id      uuid,
  p_invoice_number text,
  p_invoice_amount numeric,
  p_photo_url      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mr_id uuid;
begin
  select mr_id into v_mr_id from public.erp_field_orders where id = p_order_id for update;
  if v_mr_id is null then
    raise exception 'Field order not found';
  end if;
  if v_mr_id <> public.erp_current_user_id() then
    raise exception 'You may only submit invoice proof for your own orders'
      using errcode = 'insufficient_privilege';
  end if;

  if p_invoice_number is null or trim(p_invoice_number) = '' then
    raise exception 'Enter the invoice number';
  end if;
  if p_invoice_amount is null or p_invoice_amount <= 0 then
    raise exception 'Enter the invoice amount';
  end if;

  update public.erp_field_orders
     set reported_invoice_number    = trim(p_invoice_number),
         reported_invoice_amount    = p_invoice_amount,
         reported_invoice_photo_url = nullif(p_photo_url, ''),
         invoice_status             = 'SUBMITTED',
         reported_by                = public.erp_current_user_id(),
         reported_at                = now(),
         reviewed_by                = null,
         reviewed_at                = null,
         rejection_reason           = null,
         updated_by                 = public.erp_current_user_id()
   where id = p_order_id;

  return (select to_jsonb(o) from public.erp_field_orders o where o.id = p_order_id);
end;
$$;

-- ─── Admin review of a submitted invoice ────────────────────────────────────

create or replace function public.erp_review_order_invoice(
  p_order_id uuid,
  p_status   public.erp_order_invoice_status,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may review a submitted invoice'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('SUBMITTED', 'REJECTED') then
    raise exception 'Invalid review status';
  end if;
  if p_status = 'REJECTED' and (p_reason is null or trim(p_reason) = '') then
    raise exception 'Enter a reason for rejecting this submission';
  end if;

  update public.erp_field_orders
     set invoice_status   = p_status,
         rejection_reason = case when p_status = 'REJECTED' then trim(p_reason) else null end,
         reviewed_by      = public.erp_current_user_id(),
         reviewed_at      = now(),
         updated_by       = public.erp_current_user_id()
   where id = p_order_id
     and invoice_status <> 'PENDING';

  if not found then
    raise exception 'This order has no submitted invoice to review';
  end if;

  return (select to_jsonb(o) from public.erp_field_orders o where o.id = p_order_id);
end;
$$;

revoke all on function public.erp_submit_order_invoice(uuid, text, numeric, text) from public;
revoke all on function public.erp_review_order_invoice(uuid, public.erp_order_invoice_status, text) from public;
grant execute on function public.erp_submit_order_invoice(uuid, text, numeric, text) to authenticated;
grant execute on function public.erp_review_order_invoice(uuid, public.erp_order_invoice_status, text) to authenticated;

-- ─── Reporting: business-generated value now reads the submitted invoice ───
-- Full bodies from 20260904000007_erp_reporting.sql, with
-- sum(o.estimated_value) replaced by
-- sum(o.reported_invoice_amount) filter (where o.invoice_status = 'SUBMITTED').
-- REJECTED and still-PENDING orders contribute zero, exactly as intended.

create or replace function public.erp_dashboard_summary(
  p_from      date,
  p_to        date,
  p_mr        uuid default null,
  p_territory text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with doctor_visits as (
    select v.id, v.doctor_status
      from public.erp_doctor_visits v
      join public.erp_users u on u.id = v.mr_id
     where v.visit_date between p_from and p_to
       and (p_mr is null or v.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  chemist_visits as (
    select v.id
      from public.erp_chemist_visits v
      join public.erp_users u on u.id = v.mr_id
     where v.visit_date between p_from and p_to
       and (p_mr is null or v.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  field_orders as (
    select o.id, o.reported_invoice_amount, o.invoice_status, o.customer_type
      from public.erp_field_orders o
      join public.erp_users u on u.id = o.mr_id
     where o.order_date between p_from and p_to
       and (p_mr is null or o.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  sales as (
    select grand_total, amount_paid
      from public.erp_sales_invoices
     where invoice_date between p_from and p_to
  ),
  purchases as (
    select grand_total
      from public.erp_purchase_invoices
     where invoice_date between p_from and p_to
  )
  select jsonb_build_object(
    'doctor_visits',      (select count(*) from doctor_visits),
    'new_doctors',        (select count(*) from doctor_visits where doctor_status = 'NEW'),
    'existing_doctors',   (select count(*) from doctor_visits where doctor_status = 'EXISTING'),
    'chemist_visits',     (select count(*) from chemist_visits),
    'field_orders',       (select count(*) from field_orders),
    'field_order_value',  (select coalesce(sum(reported_invoice_amount) filter (where invoice_status = 'SUBMITTED'), 0) from field_orders),
    'doctor_orders',      (select count(*) from field_orders where customer_type = 'DOCTOR'),
    'chemist_orders',     (select count(*) from field_orders where customer_type = 'CHEMIST'),
    'sales_count',        (select count(*) from sales),
    'sales_value',        (select coalesce(sum(grand_total), 0) from sales),
    'sales_outstanding',  (select coalesce(sum(grand_total - amount_paid), 0) from sales),
    'purchase_count',     (select count(*) from purchases),
    'purchase_value',     (select coalesce(sum(grand_total), 0) from purchases)
  );
$$;

create or replace function public.erp_mr_performance(
  p_from date,
  p_to   date
)
returns table (
  mr_id            uuid,
  mr_name          text,
  mr_code          text,
  territory        text,
  doctor_visits    bigint,
  chemist_visits   bigint,
  new_doctors      bigint,
  doctors_covered  bigint,
  chemists_covered bigint,
  field_orders     bigint,
  order_value      numeric,
  followups_open   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    u.id,
    u.name,
    u.mr_code,
    u.territory,
    (select count(*) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_chemist_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to and v.doctor_status = 'NEW'),
    (select count(distinct v.doctor_id) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(distinct v.chemist_id) from public.erp_chemist_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to),
    (select coalesce(sum(o.reported_invoice_amount) filter (where o.invoice_status = 'SUBMITTED'), 0)
      from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to),
    (select count(*) from public.erp_followups f
      where f.mr_id = u.id and f.status = 'PENDING')
    from public.erp_users u
   where u.role = 'MR' and u.active
   order by 5 desc, 10 desc;   -- doctor_visits, then field_orders
$$;

create or replace function public.erp_territory_performance(
  p_from date,
  p_to   date
)
returns table (
  territory      text,
  mr_count       bigint,
  doctor_visits  bigint,
  chemist_visits bigint,
  new_doctors    bigint,
  field_orders   bigint,
  order_value    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with mr_stats as (
    select
      u.id,
      coalesce(u.territory, 'Unassigned') as territory,
      (select count(*) from public.erp_doctor_visits v
        where v.mr_id = u.id and v.visit_date between p_from and p_to) as doctor_visits,
      (select count(*) from public.erp_chemist_visits v
        where v.mr_id = u.id and v.visit_date between p_from and p_to) as chemist_visits,
      (select count(*) from public.erp_doctor_visits v
        where v.mr_id = u.id and v.visit_date between p_from and p_to
          and v.doctor_status = 'NEW') as new_doctors,
      (select count(*) from public.erp_field_orders o
        where o.mr_id = u.id and o.order_date between p_from and p_to) as field_orders,
      (select coalesce(sum(o.reported_invoice_amount) filter (where o.invoice_status = 'SUBMITTED'), 0)
        from public.erp_field_orders o
        where o.mr_id = u.id and o.order_date between p_from and p_to) as order_value
      from public.erp_users u
     where u.role = 'MR' and u.active
  )
  select
    territory,
    count(*)::bigint,
    sum(doctor_visits)::bigint,
    sum(chemist_visits)::bigint,
    sum(new_doctors)::bigint,
    sum(field_orders)::bigint,
    sum(order_value)
    from mr_stats
   group by territory
   order by 7 desc;   -- order_value
$$;
