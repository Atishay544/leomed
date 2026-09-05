-- ============================================================================
-- LEOMED PHARMA ERP — 5/6 · TRANSACTIONAL BUSINESS LOGIC
--
-- SECURITY MODEL — two deliberate categories:
--
--   SECURITY INVOKER (visits, field orders): the caller's own RLS policies
--   apply, so an MR physically cannot write a row they could not write
--   directly. Preferred wherever it works.
--
--   SECURITY DEFINER (billing, inventory): required because INSERT on
--   erp_inventory_transactions is granted to nobody — the ledger has exactly
--   one writer, these functions. Each therefore performs its OWN role check on
--   the first line, because DEFINER bypasses RLS.
--
-- Every money figure is computed here from quantity / rate / discount / GST.
-- Totals arriving from the client are ignored (spec §52, §62).
-- ============================================================================

-- ─── Duplicate detection (spec §44) ─────────────────────────────────────────
-- Called before an MR creates a new doctor/chemist so the master doesn't fill
-- up with "Dr. Rajesh Kumar" five times. Trigram similarity, not exact match.

create or replace function public.erp_find_similar_doctors(
  p_name  text,
  p_phone text default null,
  p_area  text default null
)
returns table (
  id uuid, doctor_code text, doctor_name text, specialization text,
  area text, city text, phone text, clinic_name text, match_score real
)
language sql
stable
set search_path = public
as $$
  select d.id, d.doctor_code, d.doctor_name, d.specialization,
         d.area, d.city, d.phone, d.clinic_name,
         least(1.0,
           greatest(
             similarity(d.doctor_name, coalesce(p_name, '')),
             -- Same phone number is as good as certain.
             case when p_phone is not null and d.phone = p_phone then 1.0 else 0 end
           )
           -- Same area nudges a near-match up the list; it never filters, since
           -- the same doctor may well be recorded under a different area.
           + case when p_area is not null and d.area ilike p_area then 0.15 else 0 end
         )::real as match_score
    from public.erp_doctors d
   where d.active
     and (
       (p_phone is not null and d.phone = p_phone)
       or similarity(d.doctor_name, coalesce(p_name, '')) > 0.3
     )
   order by match_score desc
   limit 8;
$$;

create or replace function public.erp_find_similar_chemists(
  p_name  text,
  p_phone text default null
)
returns table (
  id uuid, chemist_code text, chemist_name text, owner_name text,
  area text, city text, phone text, match_score real
)
language sql
stable
set search_path = public
as $$
  select c.id, c.chemist_code, c.chemist_name, c.owner_name,
         c.area, c.city, c.phone,
         greatest(
           similarity(c.chemist_name, coalesce(p_name, '')),
           case when p_phone is not null and c.phone = p_phone then 1.0 else 0 end
         )::real as match_score
    from public.erp_chemists c
   where c.active
     and (
       (p_phone is not null and c.phone = p_phone)
       or similarity(c.chemist_name, coalesce(p_name, '')) > 0.3
     )
   order by match_score desc
   limit 8;
$$;

-- ─── Closing the new-customer back-reference (D6) ───────────────────────────
-- A doctor created inside a visit points back at that visit, but the row must
-- exist before the visit does, so the link is set immediately afterwards.
--
-- These are SECURITY DEFINER for one narrow reason: the master UPDATE policy
-- allows a creator to edit only within the MR edit window, and an
-- administrator may legitimately set that window to zero — which would make
-- this final step of an atomic create silently write nothing, leaving a "new"
-- doctor with no originating visit. The whole surface of each function is one
-- column, on a row the caller just created, from a visit the caller owns, and
-- only while it is still unset.

create or replace function public.erp_link_doctor_to_visit(p_doctor uuid, p_visit uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.erp_doctor_visits v
     where v.id = p_visit
       and (v.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ) then
    raise exception 'That visit does not belong to you'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_doctors
     set created_from_visit_id = p_visit
   where id = p_doctor
     and created_from_visit_id is null;
end;
$$;

create or replace function public.erp_link_chemist_to_visit(p_chemist uuid, p_visit uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.erp_chemist_visits v
     where v.id = p_visit
       and (v.mr_id = public.erp_current_user_id() or public.erp_is_admin())
  ) then
    raise exception 'That visit does not belong to you'
      using errcode = 'insufficient_privilege';
  end if;

  update public.erp_chemists
     set created_from_visit_id = p_visit
   where id = p_chemist
     and created_from_visit_id is null;
end;
$$;

-- ─── Doctor visit (one transaction, spec §18 §19 §20 §23) ───────────────────
-- Creates, atomically: an optional brand-new doctor, the visit, every product
-- discussed, an optional field order with its items, and an optional follow-up.
-- Either all of it lands or none of it does.

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

  -- An MR always files under their own name. Only an admin may file on behalf
  -- of someone else; RLS would reject anything else anyway.
  v_mr := v_actor;
  if (p_payload ? 'mr_id') and public.erp_is_admin() then
    v_mr := nullif(p_payload->>'mr_id', '')::uuid;
  end if;

  -- Idempotency (D11): a retried save returns the original visit untouched.
  v_client_req := nullif(p_payload->>'client_request_id', '')::uuid;
  if v_client_req is not null then
    select id into v_visit from public.erp_doctor_visits where client_request_id = v_client_req;
    if v_visit is not null then
      return jsonb_build_object('visit_id', v_visit, 'duplicate', true);
    end if;
  end if;

  -- 1. New doctor, or an existing one?
  v_new_doc := p_payload -> 'new_doctor';
  if v_new_doc is not null and jsonb_typeof(v_new_doc) = 'object' then
    -- doctor_code is left to its column default (erp_next_code) so there is
    -- one place that decides what a doctor code looks like.
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

  -- 2. The visit. doctor_status is stamped now, not derived later from
  --    created_at — the spec is explicit that it must reflect the workflow.
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

  -- 3. Close the loop on the new doctor (D6).
  if v_is_new then
    perform public.erp_link_doctor_to_visit(v_doctor, v_visit);
  end if;

  -- 4. Products discussed — many per visit.
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

  -- 5. Order received during the visit? This is a FIELD ORDER: a demand
  --    signal. It creates no sales invoice and moves no stock (spec §29).
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

    for v_item in select * from jsonb_array_elements(coalesce(v_order_json->'items', '[]'::jsonb))
    loop
      insert into public.erp_field_order_items (
        field_order_id, product_id, quantity, unit, unit_rate, remarks
      )
      select v_order,
             p.id,
             (v_item->>'quantity')::integer,
             coalesce(nullif(v_item->>'unit', ''), p.unit),
             -- Snapshot of today's list rate. Indicative only (Q2).
             coalesce(nullif(v_item->>'unit_rate', '')::numeric, p.sale_rate),
             nullif(v_item->>'remarks', '')
        from public.erp_products p
       where p.id = (v_item->>'product_id')::uuid;
    end loop;

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  -- 6. Follow-up.
  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, doctor_id, doctor_visit_id, followup_date,
      description, priority, created_by
    ) values (
      v_mr, 'DOCTOR', v_doctor, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor
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

-- ─── Chemist visit (spec §24, §25) ──────────────────────────────────────────

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

    for v_item in select * from jsonb_array_elements(coalesce(v_order_json->'items', '[]'::jsonb))
    loop
      insert into public.erp_field_order_items (
        field_order_id, product_id, quantity, unit, unit_rate, remarks
      )
      select v_order, p.id,
             (v_item->>'quantity')::integer,
             coalesce(nullif(v_item->>'unit', ''), p.unit),
             coalesce(nullif(v_item->>'unit_rate', '')::numeric, p.sale_rate),
             nullif(v_item->>'remarks', '')
        from public.erp_products p
       where p.id = (v_item->>'product_id')::uuid;
    end loop;

    if not exists (select 1 from public.erp_field_order_items where field_order_id = v_order) then
      raise exception 'An order was marked as received but has no product lines';
    end if;
  end if;

  if coalesce((p_payload->>'follow_up_required')::boolean, false) then
    insert into public.erp_followups (
      mr_id, customer_type, chemist_id, chemist_visit_id, followup_date,
      description, priority, created_by
    ) values (
      v_mr, 'CHEMIST', v_chemist, v_visit,
      (p_payload->>'follow_up_date')::date,
      nullif(p_payload->>'follow_up_description', ''),
      coalesce(nullif(p_payload->>'follow_up_priority', '')::public.erp_followup_priority, 'MEDIUM'),
      v_actor
    );
  end if;

  return jsonb_build_object(
    'visit_id',   v_visit,
    'chemist_id', v_chemist,
    'is_new',     v_is_new,
    'order_id',   v_order,
    'order_number', v_order_no,
    'duplicate',  false
  );
end;
$$;

-- ─── Purchase invoice → inventory IN (spec §27, §53) ────────────────────────

create or replace function public.erp_save_purchase_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_invoice  uuid;
  v_item     jsonb;
  v_batch    uuid;
  v_date     date;
  v_gross    numeric(14,2);
  v_disc     numeric(14,2);
  v_taxable  numeric(14,2);
  v_tax      numeric(14,2);
  v_line     numeric(14,2);
  v_sum_gross numeric(14,2) := 0;
  v_sum_disc  numeric(14,2) := 0;
  v_sum_tax   numeric(14,2) := 0;
  v_sum_total numeric(14,2) := 0;
  v_qty      integer;
  v_free     integer;
begin
  -- DEFINER bypasses RLS, so authorisation is checked explicitly here.
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may record purchases'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A purchase invoice needs at least one product line';
  end if;

  insert into public.erp_purchase_invoices (
    invoice_number, supplier_id, invoice_date, is_interstate, remarks,
    amount_paid, created_by, updated_by
  ) values (
    trim(p_payload->>'invoice_number'),
    (p_payload->>'supplier_id')::uuid,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    coalesce(nullif(p_payload->>'amount_paid', '')::numeric, 0),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    -- Batch: reuse the supplier's batch number for this product, or open it.
    select id into v_batch
      from public.erp_product_batches
     where product_id = (v_item->>'product_id')::uuid
       and batch_number = trim(v_item->>'batch_number');

    if v_batch is null then
      insert into public.erp_product_batches (
        product_id, batch_number, manufacturing_date, expiry_date,
        mrp, purchase_rate, sale_rate, created_by
      ) values (
        (v_item->>'product_id')::uuid,
        trim(v_item->>'batch_number'),
        nullif(v_item->>'manufacturing_date', '')::date,
        (v_item->>'expiry_date')::date,
        coalesce(nullif(v_item->>'mrp', '')::numeric, 0),
        (v_item->>'purchase_rate')::numeric,
        coalesce(nullif(v_item->>'sale_rate', '')::numeric, 0),
        v_actor
      )
      returning id into v_batch;
    else
      -- Refresh commercial terms on a restock; quantity is never touched here.
      update public.erp_product_batches
         set mrp           = coalesce(nullif(v_item->>'mrp', '')::numeric, mrp),
             purchase_rate = (v_item->>'purchase_rate')::numeric,
             sale_rate     = coalesce(nullif(v_item->>'sale_rate', '')::numeric, sale_rate)
       where id = v_batch;
    end if;

    -- Money, computed here — never taken from the request.
    v_gross   := round(v_qty * (v_item->>'purchase_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_purchase_invoice_items (
      purchase_invoice_id, product_id, batch_id, quantity, free_quantity,
      purchase_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch, v_qty, v_free,
      (v_item->>'purchase_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    -- Stock in — free quantity is real stock even though it costs nothing.
    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch, 'PURCHASE', 'PURCHASE_INVOICE', v_invoice,
      v_qty + v_free, (v_item->>'purchase_rate')::numeric, v_date,
      'Purchase invoice ' || trim(p_payload->>'invoice_number'), v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_purchase_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total
   where id = v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice,
    'grand_total', v_sum_total,
    'subtotal', v_sum_gross,
    'tax', v_sum_tax
  );
end;
$$;

-- ─── Sales invoice → inventory OUT (spec §28, §53, §54) ─────────────────────

create or replace function public.erp_save_sales_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid;
  v_invoice  uuid;
  v_number   text;
  v_item     jsonb;
  v_date     date;
  v_batch    record;
  v_gross    numeric(14,2);
  v_disc     numeric(14,2);
  v_taxable  numeric(14,2);
  v_tax      numeric(14,2);
  v_line     numeric(14,2);
  v_sum_gross numeric(14,2) := 0;
  v_sum_disc  numeric(14,2) := 0;
  v_sum_tax   numeric(14,2) := 0;
  v_sum_total numeric(14,2) := 0;
  v_qty      integer;
  v_free     integer;
  v_allow_expired boolean;
begin
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may raise sales invoices'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);

  select allow_expired_sale into v_allow_expired from public.erp_settings where id = 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A sales invoice needs at least one product line';
  end if;

  v_number := coalesce(
    nullif(p_payload->>'invoice_number', ''),
    public.erp_next_document_number('sales_invoice', 'INV', v_date)
  );

  insert into public.erp_sales_invoices (
    invoice_number, distributor_id, invoice_date, is_interstate, remarks,
    amount_paid, created_by, updated_by
  ) values (
    v_number,
    (p_payload->>'distributor_id')::uuid,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    coalesce(nullif(p_payload->>'amount_paid', '')::numeric, 0),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    -- Lock the batch for the rest of the transaction so two concurrent
    -- invoices cannot both pass the availability check on the same stock.
    select b.id, b.batch_number, b.current_quantity, b.expiry_date, p.product_name
      into v_batch
      from public.erp_product_batches b
      join public.erp_products p on p.id = b.product_id
     where b.id = (v_item->>'batch_id')::uuid
     for update of b;

    if not found then
      raise exception 'Batch % not found', v_item->>'batch_id';
    end if;

    if v_batch.expiry_date < v_date and not coalesce(v_allow_expired, false) then
      raise exception 'Batch % of % expired on % and cannot be sold',
        v_batch.batch_number, v_batch.product_name, to_char(v_batch.expiry_date, 'DD Mon YYYY')
        using errcode = 'check_violation';
    end if;

    if v_batch.current_quantity < (v_qty + v_free) then
      raise exception 'Only % units of % (batch %) in stock — % requested',
        v_batch.current_quantity, v_batch.product_name, v_batch.batch_number, v_qty + v_free
        using errcode = 'check_violation';
    end if;

    v_gross   := round(v_qty * (v_item->>'sale_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_sales_invoice_items (
      sales_invoice_id, product_id, batch_id, quantity, free_quantity,
      sale_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch.id, v_qty, v_free,
      (v_item->>'sale_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch.id, 'SALE', 'SALES_INVOICE', v_invoice,
      -(v_qty + v_free), (v_item->>'sale_rate')::numeric, v_date,
      'Sales invoice ' || v_number, v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_sales_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total
   where id = v_invoice;

  return jsonb_build_object(
    'invoice_id', v_invoice,
    'invoice_number', v_number,
    'grand_total', v_sum_total,
    'subtotal', v_sum_gross,
    'tax', v_sum_tax
  );
end;
$$;

-- ─── Manual inventory adjustment (spec §16) ─────────────────────────────────
-- The only other writer of the ledger. Quantity is a magnitude; direction comes
-- from the transaction type, so an "IN" can never silently remove stock.

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
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may adjust inventory'
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

-- ─── Field order status (spec §26) ──────────────────────────────────────────
-- Status is a demand-tracking label. Marking one FULFILLED records that the
-- distributor network served it — it never creates a Leomed sales invoice.

create or replace function public.erp_set_field_order_status(
  p_order_id uuid,
  p_status   public.erp_field_order_status,
  p_remarks  text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.erp_field_orders
     set status     = p_status,
         remarks    = coalesce(nullif(trim(coalesce(p_remarks, '')), ''), remarks),
         updated_by = public.erp_current_user_id()
   where id = p_order_id;

  if not found then
    raise exception 'Field order not found, or you do not have access to it';
  end if;
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on function public.erp_create_doctor_visit(jsonb)   from public;
revoke all on function public.erp_create_chemist_visit(jsonb)  from public;
revoke all on function public.erp_save_purchase_invoice(jsonb) from public;
revoke all on function public.erp_save_sales_invoice(jsonb)    from public;
revoke all on function public.erp_adjust_inventory(uuid, public.erp_inventory_txn_type, integer, text, date) from public;
revoke all on function public.erp_set_field_order_status(uuid, public.erp_field_order_status, text) from public;
revoke all on function public.erp_find_similar_doctors(text, text, text) from public;
revoke all on function public.erp_find_similar_chemists(text, text)      from public;
revoke all on function public.erp_link_doctor_to_visit(uuid, uuid)       from public;
revoke all on function public.erp_link_chemist_to_visit(uuid, uuid)      from public;

grant execute on function public.erp_create_doctor_visit(jsonb)   to authenticated;
grant execute on function public.erp_create_chemist_visit(jsonb)  to authenticated;
grant execute on function public.erp_save_purchase_invoice(jsonb) to authenticated;
grant execute on function public.erp_save_sales_invoice(jsonb)    to authenticated;
grant execute on function public.erp_adjust_inventory(uuid, public.erp_inventory_txn_type, integer, text, date) to authenticated;
grant execute on function public.erp_set_field_order_status(uuid, public.erp_field_order_status, text) to authenticated;
grant execute on function public.erp_find_similar_doctors(text, text, text) to authenticated;
grant execute on function public.erp_find_similar_chemists(text, text)      to authenticated;
grant execute on function public.erp_link_doctor_to_visit(uuid, uuid)       to authenticated;
grant execute on function public.erp_link_chemist_to_visit(uuid, uuid)      to authenticated;

-- Needed by the SECURITY INVOKER visit functions above.
grant execute on function public.erp_next_document_number(text, text, date) to authenticated;
grant execute on function public.erp_next_code(text, text)                  to authenticated;
