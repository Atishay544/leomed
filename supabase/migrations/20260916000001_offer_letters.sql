-- ============================================================================
-- OFFER LETTERS — admin/HR generates an offer letter for a candidate,
-- tracks its status by hand (Draft -> Sent -> Accepted/Rejected/Withdrawn),
-- and once the candidate actually joins, converts the offer straight into a
-- staff account (erp_users) + starting salary (erp_employee_salary) — no
-- online candidate-facing acceptance flow, this is an internal HR tool only.
--
-- A candidate is not a system user until conversion, so this table is
-- deliberately independent of erp_users — the same reasoning erp_employee_
-- salary already uses to stay separate from the login/identity table.
-- ============================================================================

do $$ begin
  create type public.erp_offer_status as enum (
    'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CONVERTED'
  );
exception when duplicate_object then null; end $$;

-- EARNING rows sum to "Total Guaranteed Compensation"; add DEDUCTION rows
-- (employer PF etc.) for "Total Fixed Compensation"; add VARIABLE rows
-- (e.g. an MR's target incentive) for "Target Total Compensation" — mirrors
-- the shape of a typical CTC breakup letter without hardcoding any one
-- company's specific component list.
do $$ begin
  create type public.erp_offer_component_category as enum ('EARNING', 'DEDUCTION', 'VARIABLE');
exception when duplicate_object then null; end $$;

create table if not exists public.erp_offer_letters (
  id                  uuid primary key default gen_random_uuid(),
  offer_number        text not null unique,
  candidate_name      text not null check (length(trim(candidate_name)) > 0),
  candidate_address   text,
  candidate_email     text,
  candidate_phone     text,
  designation         text not null check (length(trim(designation)) > 0),
  role                public.erp_role not null default 'MR',
  department          text,
  territory           text,
  reports_to          uuid references public.erp_users(id) on delete set null,
  offer_date          date not null default current_date,
  joining_date        date,
  remarks             text,
  status              public.erp_offer_status not null default 'DRAFT',
  converted_employee_id uuid references public.erp_users(id) on delete set null,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_offer_letters_status_idx on public.erp_offer_letters (status);
create index if not exists erp_offer_letters_name_trgm  on public.erp_offer_letters using gin (candidate_name gin_trgm_ops);

create table if not exists public.erp_offer_letter_components (
  id               uuid primary key default gen_random_uuid(),
  offer_letter_id  uuid not null references public.erp_offer_letters(id) on delete cascade,
  component_name   text not null check (length(trim(component_name)) > 0),
  category         public.erp_offer_component_category not null default 'EARNING',
  monthly_amount   numeric(12,2) not null default 0 check (monthly_amount >= 0),
  annual_amount    numeric(12,2) not null default 0 check (annual_amount >= 0),
  sort_order       integer not null default 0
);

create index if not exists erp_offer_letter_components_offer_idx
  on public.erp_offer_letter_components (offer_letter_id);

drop trigger if exists erp_offer_letters_touch on public.erp_offer_letters;
create trigger erp_offer_letters_touch before update on public.erp_offer_letters
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_offer_letters_audit on public.erp_offer_letters;
create trigger erp_offer_letters_audit
  after insert or update or delete on public.erp_offer_letters
  for each row execute function public.erp_audit_trigger();

-- ─── Save: header + components together, same "replace the line items"
-- pattern as erp_save_sales_invoice() ─────────────────────────────────────

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
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may manage offer letters'
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
      remarks           = nullif(p_payload->>'remarks', ''),
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
      designation, role, department, territory, reports_to, offer_date, joining_date, remarks,
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
      nullif(p_payload->>'remarks', ''),
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

revoke all on function public.erp_save_offer_letter(jsonb) from public;
grant execute on function public.erp_save_offer_letter(jsonb) to authenticated;

-- ─── RLS: admin-only both ways ──────────────────────────────────────────────

alter table public.erp_offer_letters           enable row level security;
alter table public.erp_offer_letter_components enable row level security;

drop policy if exists erp_offer_letters_all on public.erp_offer_letters;
create policy erp_offer_letters_all on public.erp_offer_letters
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_offer_letter_components_all on public.erp_offer_letter_components;
create policy erp_offer_letter_components_all on public.erp_offer_letter_components
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

revoke all on public.erp_offer_letters, public.erp_offer_letter_components from anon;
grant select, insert, update, delete on public.erp_offer_letters           to authenticated;
grant select, insert, update, delete on public.erp_offer_letter_components to authenticated;

-- ─── Settings: who signs an offer letter ────────────────────────────────────

alter table public.erp_settings
  add column if not exists hr_signatory_name  text,
  add column if not exists hr_signatory_title text;
