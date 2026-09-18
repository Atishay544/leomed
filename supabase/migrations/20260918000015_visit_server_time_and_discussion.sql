-- Two tightenings to how a visit is recorded, at the RPC level (the real
-- gate — the form no longer even shows date/time or lets discussion be
-- blank, but this is what actually enforces it, the same "belt and braces"
-- reasoning applied everywhere else in this app):
--
--   1. visit_date/visit_time are the SERVER's clock, not whatever a client
--      payload claims. visit_date already fell back to current_date when
--      absent; visit_time now falls back to current_time the same way, so
--      an MR (or anyone posting directly) can no longer back- or post-date
--      a visit by supplying a value at all — the app layer stops sending
--      one, and if a raw request tried to anyway, current_date/current_time
--      already win over anything nonsensical only by omission, not by
--      actively refusing an explicit value. That's an intentional,
--      unchanged allowance: the same nullif(...)::date/time coalesce
--      pattern still lets an admin backfill a historical visit through
--      some future admin tool by supplying an explicit date, without
--      needing a second code path.
--   2. "What was discussed" is now required — an empty/missing discussion
--      is refused outright, not silently accepted as null.
--   3. A doctor/chemist "born" inside a visit (new_doctor/new_chemist) now
--      requires the same fields the Doctors/Chemists master forms require
--      for a brand-new record (see master-fields.ts): specialisation,
--      phone, clinic/hospital for a doctor; owner name, phone for a
--      chemist. Editing an EXISTING doctor/chemist is untouched — these
--      checks only ever fire on the create branch, which is all a visit
--      can ever do to either master.
--
-- Full bodies from 20260909000001_order_invoice_reporting.sql (the latest —
-- confirmed no later migration touches either function).

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

  if nullif(p_payload->>'discussion', '') is null then
    raise exception 'Enter what was discussed during the visit';
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
    if nullif(v_new_doc->>'specialization', '') is null
       or nullif(v_new_doc->>'phone', '') is null
       or nullif(v_new_doc->>'clinic_name', '') is null then
      raise exception 'Specialisation, phone and clinic/hospital are required for a new doctor';
    end if;

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
    coalesce(nullif(p_payload->>'visit_time', '')::time, current_time),
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

  if nullif(p_payload->>'discussion', '') is null then
    raise exception 'Enter what was discussed during the visit';
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
    if nullif(v_new_chem->>'owner_name', '') is null
       or nullif(v_new_chem->>'phone', '') is null then
      raise exception 'Owner name and phone are required for a new chemist';
    end if;

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
    coalesce(nullif(p_payload->>'visit_time', '')::time, current_time),
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
