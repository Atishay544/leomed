-- Doctors/chemists gain a structured area_id, and territory/area-wise
-- reporting is rebuilt on top of it.
--
-- Design note (why customer area, not MR area):
-- erp_territory_performance() has always grouped by the MR's OWN territory
-- string, on the assumption that one MR belongs to one territory. That
-- assumption breaks under the new Territory/Area model: an MR can now be
-- the effective MR for several areas that are not all in the same
-- territory (e.g. the territory's default MR, plus an override on one area
-- of a different territory). Attributing that MR's whole activity to a
-- single territory would then be wrong, and there is no per-visit/per-order
-- area tag to split it correctly.
--
-- The doctor/chemist being visited does not have that problem — each one
-- sits in exactly one place. So area/territory-wise performance is
-- attributed via the visited doctor's/chemist's own area_id, while MR-wise
-- performance (erp_mr_performance, unchanged) stays exactly as accurate as
-- it already was, grouped by mr_id directly. These are three independent
-- dimensions on purpose, not three views of the same join.
--
-- Additive and backward compatible: area_id is nullable, existing doctors/
-- chemists keep working unmapped, and erp_territory_performance() falls
-- back to the legacy free-text `territory` column (then 'Unassigned') for
-- anyone not yet tagged with an area — nothing already relying on that
-- function's output shape breaks.

alter table public.erp_doctors
  add column if not exists area_id uuid references public.erp_areas(id) on delete set null;
alter table public.erp_chemists
  add column if not exists area_id uuid references public.erp_areas(id) on delete set null;

create index if not exists erp_doctors_area_id_idx  on public.erp_doctors  (area_id);
create index if not exists erp_chemists_area_id_idx on public.erp_chemists (area_id);

-- ─── Territory-wise performance, re-based on customer geography ────────────
-- Same return shape as before (see 20260904000007 / 20260909000001) so every
-- existing caller (lib/erp/data/dashboard.ts's TerritoryPerformanceRow, the
-- Reports page) keeps working unchanged.

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
  with doctor_territory as (
    select d.id as doctor_id, coalesce(t.name, d.territory, 'Unassigned') as territory
      from public.erp_doctors d
      left join public.erp_areas a on a.id = d.area_id
      left join public.erp_territories t on t.id = a.territory_id
  ),
  chemist_territory as (
    select c.id as chemist_id, coalesce(t.name, c.territory, 'Unassigned') as territory
      from public.erp_chemists c
      left join public.erp_areas a on a.id = c.area_id
      left join public.erp_territories t on t.id = a.territory_id
  ),
  dv as (
    select dt.territory, v.mr_id, v.doctor_status
      from public.erp_doctor_visits v
      join doctor_territory dt on dt.doctor_id = v.doctor_id
     where v.visit_date between p_from and p_to
  ),
  cv as (
    select ct.territory, v.mr_id
      from public.erp_chemist_visits v
      join chemist_territory ct on ct.chemist_id = v.chemist_id
     where v.visit_date between p_from and p_to
  ),
  fo as (
    select coalesce(dt.territory, ct.territory) as territory, o.reported_invoice_amount, o.invoice_status
      from public.erp_field_orders o
      left join doctor_territory dt on dt.doctor_id = o.doctor_id
      left join chemist_territory ct on ct.chemist_id = o.chemist_id
     where o.order_date between p_from and p_to
  ),
  territories as (
    select territory from dv
    union
    select territory from cv
    union
    select territory from fo
  )
  select
    ter.territory,
    (select count(distinct mr_id) from (
       select mr_id from dv where dv.territory = ter.territory
       union all
       select mr_id from cv where cv.territory = ter.territory
     ) x),
    (select count(*) from dv where dv.territory = ter.territory),
    (select count(*) from cv where cv.territory = ter.territory),
    (select count(*) from dv where dv.territory = ter.territory and dv.doctor_status = 'NEW'),
    (select count(*) from fo where fo.territory = ter.territory),
    (select coalesce(sum(reported_invoice_amount) filter (where invoice_status = 'SUBMITTED'), 0)
       from fo where fo.territory = ter.territory)
    from territories ter
   order by 7 desc;   -- order_value
$$;

-- ─── Area-wise performance — new, one level more granular than territory ───

create or replace function public.erp_area_performance(
  p_from date,
  p_to   date
)
returns table (
  area_id        uuid,
  area_name      text,
  territory_id   uuid,
  territory_name text,
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
  select
    a.id, a.name, a.territory_id, t.name,
    (select count(distinct mr_id) from (
       select v.mr_id from public.erp_doctor_visits v join public.erp_doctors d on d.id = v.doctor_id
        where d.area_id = a.id and v.visit_date between p_from and p_to
       union all
       select v.mr_id from public.erp_chemist_visits v join public.erp_chemists c on c.id = v.chemist_id
        where c.area_id = a.id and v.visit_date between p_from and p_to
     ) mrs),
    (select count(*) from public.erp_doctor_visits v join public.erp_doctors d on d.id = v.doctor_id
      where d.area_id = a.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_chemist_visits v join public.erp_chemists c on c.id = v.chemist_id
      where c.area_id = a.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_doctor_visits v join public.erp_doctors d on d.id = v.doctor_id
      where d.area_id = a.id and v.visit_date between p_from and p_to and v.doctor_status = 'NEW'),
    (select count(*) from public.erp_field_orders o
      left join public.erp_doctors d on d.id = o.doctor_id
      left join public.erp_chemists c on c.id = o.chemist_id
      where coalesce(d.area_id, c.area_id) = a.id and o.order_date between p_from and p_to),
    (select coalesce(sum(o.reported_invoice_amount) filter (where o.invoice_status = 'SUBMITTED'), 0)
      from public.erp_field_orders o
      left join public.erp_doctors d on d.id = o.doctor_id
      left join public.erp_chemists c on c.id = o.chemist_id
      where coalesce(d.area_id, c.area_id) = a.id and o.order_date between p_from and p_to)
    from public.erp_areas a
    join public.erp_territories t on t.id = a.territory_id
   where a.active
   order by 10 desc;   -- order_value
$$;

revoke all on function public.erp_area_performance(date, date) from public;
grant execute on function public.erp_area_performance(date, date) to authenticated;
