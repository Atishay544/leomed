-- Offer letters gain the same EL/SL/CL entitlement HR sets for an existing
-- employee on Leave -> Leave Balances, so it can be promised in writing at
-- hiring time and then actually seeded onto the employee's leave balance
-- the moment the offer is converted (see convertOfferToEmployee in
-- lib/erp/actions/offers.ts).

alter table public.erp_offer_letters
  add column if not exists annual_el_days numeric(5,1) not null default 0 check (annual_el_days >= 0),
  add column if not exists annual_sl_days numeric(5,1) not null default 0 check (annual_sl_days >= 0),
  add column if not exists annual_cl_days numeric(5,1) not null default 0 check (annual_cl_days >= 0);

-- Full body from 20260918000006_hr_role.sql (the latest — HR-aware,
-- revision-tracking), with the three leave fields added to both branches.
create or replace function public.erp_save_offer_letter(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid;
  v_offer_id    uuid;
  v_offer_number text;
  v_component   jsonb;
  v_id          uuid;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR may manage offer letters'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_id := nullif(p_payload->>'id', '')::uuid;

  if v_id is not null then
    update public.erp_offer_letters set
      candidate_name    = p_payload->>'candidate_name',
      candidate_address = nullif(p_payload->>'candidate_address', ''),
      candidate_email   = nullif(p_payload->>'candidate_email', ''),
      candidate_phone   = nullif(p_payload->>'candidate_phone', ''),
      designation       = p_payload->>'designation',
      role              = (p_payload->>'role')::public.erp_role,
      department        = nullif(p_payload->>'department', ''),
      territory         = nullif(p_payload->>'territory', ''),
      reports_to        = nullif(p_payload->>'reports_to', '')::uuid,
      offer_date        = coalesce(nullif(p_payload->>'offer_date', '')::date, offer_date),
      joining_date      = nullif(p_payload->>'joining_date', '')::date,
      incentive_terms   = nullif(p_payload->>'incentive_terms', ''),
      remarks           = nullif(p_payload->>'remarks', ''),
      annual_el_days    = coalesce((p_payload->>'annual_el_days')::numeric, 0),
      annual_sl_days    = coalesce((p_payload->>'annual_sl_days')::numeric, 0),
      annual_cl_days    = coalesce((p_payload->>'annual_cl_days')::numeric, 0),
      revision          = revision + 1,
      status            = 'DRAFT',
      updated_by        = v_actor
    where id = v_id and status <> 'CONVERTED'
    returning id, offer_number into v_offer_id, v_offer_number;

    if not found then
      raise exception 'Offer letter not found, or it has already been converted to an employee and can no longer be edited';
    end if;

    delete from public.erp_offer_letter_components where offer_letter_id = v_offer_id;
  else
    v_offer_number := public.erp_next_document_number(
      'offer_letter', 'OFR', coalesce(nullif(p_payload->>'offer_date', '')::date, current_date)
    );

    insert into public.erp_offer_letters (
      offer_number, candidate_name, candidate_address, candidate_email, candidate_phone,
      designation, role, department, territory, reports_to, offer_date, joining_date,
      incentive_terms, remarks, annual_el_days, annual_sl_days, annual_cl_days,
      created_by, updated_by
    ) values (
      v_offer_number,
      p_payload->>'candidate_name',
      nullif(p_payload->>'candidate_address', ''),
      nullif(p_payload->>'candidate_email', ''),
      nullif(p_payload->>'candidate_phone', ''),
      p_payload->>'designation',
      (p_payload->>'role')::public.erp_role,
      nullif(p_payload->>'department', ''),
      nullif(p_payload->>'territory', ''),
      nullif(p_payload->>'reports_to', '')::uuid,
      coalesce(nullif(p_payload->>'offer_date', '')::date, current_date),
      nullif(p_payload->>'joining_date', '')::date,
      nullif(p_payload->>'incentive_terms', ''),
      nullif(p_payload->>'remarks', ''),
      coalesce((p_payload->>'annual_el_days')::numeric, 0),
      coalesce((p_payload->>'annual_sl_days')::numeric, 0),
      coalesce((p_payload->>'annual_cl_days')::numeric, 0),
      v_actor, v_actor
    )
    returning id into v_offer_id;
  end if;

  for v_component in select * from jsonb_array_elements(coalesce(p_payload->'components', '[]'::jsonb))
  loop
    insert into public.erp_offer_letter_components (
      offer_letter_id, component_name, category, monthly_amount, annual_amount, sort_order
    ) values (
      v_offer_id,
      v_component->>'component_name',
      coalesce((v_component->>'category')::public.erp_offer_component_category, 'EARNING'),
      coalesce((v_component->>'monthly_amount')::numeric, 0),
      coalesce((v_component->>'annual_amount')::numeric, 0),
      coalesce((v_component->>'sort_order')::integer, 0)
    );
  end loop;

  return jsonb_build_object('id', v_offer_id, 'offer_number', v_offer_number);
end;
$$;
