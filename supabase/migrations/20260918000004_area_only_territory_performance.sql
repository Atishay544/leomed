-- Drop the legacy free-text fallback from territory-wise reporting.
--
-- erp_territory_performance() (20260918000003) still fell back to the
-- doctor's/chemist's own free-text `territory` column when they had no
-- mapped area, so a legacy string like "West Muzaffarnagar" and the real
-- Territory of the same name could both appear as separate-looking rows if
-- they ever drifted apart — exactly the ambiguity this feature exists to
-- remove. Doctors/chemists are now mapped to a structured area on every new
-- or edited record (area_id is required — see DoctorSchema/ChemistSchema),
-- so the fallback is retired: unmapped customers (pre-existing records only,
-- pending an admin edit) bucket cleanly under 'Unassigned' instead of
-- resurrecting old free text.
--
-- Same return shape as before — no caller needs to change.

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
    select d.id as doctor_id, coalesce(t.name, 'Unassigned') as territory
      from public.erp_doctors d
      left join public.erp_areas a on a.id = d.area_id
      left join public.erp_territories t on t.id = a.territory_id
  ),
  chemist_territory as (
    select c.id as chemist_id, coalesce(t.name, 'Unassigned') as territory
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
