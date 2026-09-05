-- ============================================================================
-- LEOMED PHARMA ERP — 7 · REPORTING
--
-- Dashboards and reports are aggregate questions, so they are answered in
-- PostgreSQL and return one small row set each. The alternative — pulling
-- visits, orders and invoices into Node to count them — is exactly what spec
-- §55 rules out.
--
-- Every function here is SECURITY INVOKER: RLS applies to the caller, so the
-- same function returns company-wide numbers to an admin and only their own to
-- an MR, with no role checks written into the SQL.
-- ============================================================================

-- ─── Owner / admin dashboard ────────────────────────────────────────────────

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
    select o.id, o.estimated_value, o.customer_type
      from public.erp_field_orders o
      join public.erp_users u on u.id = o.mr_id
     where o.order_date between p_from and p_to
       and (p_mr is null or o.mr_id = p_mr)
       and (p_territory is null or u.territory = p_territory)
  ),
  -- Company sales and purchases are not attributable to an MR or a territory,
  -- so those filters deliberately do not apply to them.
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
    'field_order_value',  (select coalesce(sum(estimated_value), 0) from field_orders),
    'doctor_orders',      (select count(*) from field_orders where customer_type = 'DOCTOR'),
    'chemist_orders',     (select count(*) from field_orders where customer_type = 'CHEMIST'),
    'sales_count',        (select count(*) from sales),
    'sales_value',        (select coalesce(sum(grand_total), 0) from sales),
    'sales_outstanding',  (select coalesce(sum(grand_total - amount_paid), 0) from sales),
    'purchase_count',     (select count(*) from purchases),
    'purchase_value',     (select coalesce(sum(grand_total), 0) from purchases)
  );
$$;

-- ─── MR performance (spec §30, §40) ─────────────────────────────────────────
-- One row per MR. Counts are computed as correlated subqueries rather than
-- joins so that an MR with visits but no orders still appears, with zeroes.

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
    -- Distinct doctors reached, not visit count: five calls on one doctor is
    -- one doctor covered.
    (select count(distinct v.doctor_id) from public.erp_doctor_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(distinct v.chemist_id) from public.erp_chemist_visits v
      where v.mr_id = u.id and v.visit_date between p_from and p_to),
    (select count(*) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to),
    (select coalesce(sum(o.estimated_value), 0) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to),
    (select count(*) from public.erp_followups f
      where f.mr_id = u.id and f.status = 'PENDING')
    from public.erp_users u
   where u.role = 'MR' and u.active
   order by 5 desc, 10 desc;   -- doctor_visits, then field_orders
$$;

-- ─── Product performance: field demand vs actual sales (spec §40) ───────────
-- The two columns are deliberately side by side: what doctors and chemists
-- asked MRs for, against what Leomed actually invoiced. They are different
-- numbers and are supposed to be.

create or replace function public.erp_product_performance(
  p_from date,
  p_to   date
)
returns table (
  product_id       uuid,
  product_name     text,
  product_code     text,
  demand_quantity  bigint,
  demand_value     numeric,
  sold_quantity    bigint,
  sold_value       numeric,
  stock_on_hand    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.product_name,
    p.product_code,
    coalesce(d.qty, 0),
    coalesce(d.value, 0),
    coalesce(s.qty, 0),
    coalesce(s.value, 0),
    coalesce(b.qty, 0)
    from public.erp_products p
    left join (
      select i.product_id, sum(i.quantity)::bigint as qty, sum(i.line_value) as value
        from public.erp_field_order_items i
        join public.erp_field_orders o on o.id = i.field_order_id
       where o.order_date between p_from and p_to
       group by i.product_id
    ) d on d.product_id = p.id
    left join (
      select i.product_id, sum(i.quantity)::bigint as qty, sum(i.line_total) as value
        from public.erp_sales_invoice_items i
        join public.erp_sales_invoices inv on inv.id = i.sales_invoice_id
       where inv.invoice_date between p_from and p_to
       group by i.product_id
    ) s on s.product_id = p.id
    left join (
      select product_id, sum(current_quantity)::bigint as qty
        from public.erp_product_batches
       group by product_id
    ) b on b.product_id = p.id
   where p.active
     and (coalesce(d.qty, 0) > 0 or coalesce(s.qty, 0) > 0 or coalesce(b.qty, 0) > 0)
   order by coalesce(s.value, 0) desc, coalesce(d.value, 0) desc
   limit 200;
$$;

-- ─── Distributor sales and outstanding ──────────────────────────────────────

create or replace function public.erp_distributor_performance(
  p_from date,
  p_to   date
)
returns table (
  distributor_id   uuid,
  distributor_name text,
  distributor_code text,
  city             text,
  invoice_count    bigint,
  sales_value      numeric,
  outstanding      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    d.id, d.distributor_name, d.distributor_code, d.city,
    count(i.id),
    coalesce(sum(i.grand_total), 0),
    coalesce(sum(i.grand_total - i.amount_paid), 0)
    from public.erp_distributors d
    join public.erp_sales_invoices i
      on i.distributor_id = d.id and i.invoice_date between p_from and p_to
   group by d.id, d.distributor_name, d.distributor_code, d.city
   order by 6 desc
   limit 100;
$$;

-- ─── Territory activity ─────────────────────────────────────────────────────
-- Territory is free text on the MR record (plan Q8), so rows are grouped by
-- the MR's territory rather than by a territory master.

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
  -- Per-MR figures first, then rolled up. Computing them inside the grouped
  -- query would mean referencing an aggregate from a correlated subquery,
  -- which PostgreSQL does not allow.
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
      (select coalesce(sum(o.estimated_value), 0) from public.erp_field_orders o
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

-- ─── Target progress ────────────────────────────────────────────────────────
-- Achievement is counted from the live tables for the target's own period, so
-- it is always current and never needs a nightly job to stay honest.

create or replace function public.erp_target_progress()
returns table (
  target_id    uuid,
  mr_id        uuid,
  mr_name      text,
  mr_code      text,
  territory    text,
  target_type  public.erp_target_type,
  target_value numeric,
  achieved     numeric,
  period_start date,
  period_end   date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id, t.mr_id, u.name, u.mr_code, t.territory, t.target_type, t.target_value,
    case t.target_type
      when 'DOCTOR_VISITS' then (
        select count(*)::numeric from public.erp_doctor_visits v
         where v.visit_date between t.period_start and t.period_end
           and (t.mr_id is null or v.mr_id = t.mr_id))
      when 'CHEMIST_VISITS' then (
        select count(*)::numeric from public.erp_chemist_visits v
         where v.visit_date between t.period_start and t.period_end
           and (t.mr_id is null or v.mr_id = t.mr_id))
      when 'NEW_DOCTORS' then (
        select count(*)::numeric from public.erp_doctor_visits v
         where v.visit_date between t.period_start and t.period_end
           and v.doctor_status = 'NEW'
           and (t.mr_id is null or v.mr_id = t.mr_id))
      when 'FIELD_ORDERS' then (
        select count(*)::numeric from public.erp_field_orders o
         where o.order_date between t.period_start and t.period_end
           and (t.mr_id is null or o.mr_id = t.mr_id))
      -- SALES means company invoice value, which no single MR owns, so an
      -- MR-scoped sales target is measured against total sales for the period.
      when 'SALES' then (
        select coalesce(sum(i.grand_total), 0) from public.erp_sales_invoices i
         where i.invoice_date between t.period_start and t.period_end)
    end,
    t.period_start, t.period_end
    from public.erp_targets t
    left join public.erp_users u on u.id = t.mr_id
   order by t.period_end desc, u.mr_code nulls last;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on function public.erp_dashboard_summary(date, date, uuid, text) from public;
revoke all on function public.erp_mr_performance(date, date)                from public;
revoke all on function public.erp_product_performance(date, date)           from public;
revoke all on function public.erp_distributor_performance(date, date)       from public;
revoke all on function public.erp_territory_performance(date, date)         from public;
revoke all on function public.erp_target_progress()                         from public;

grant execute on function public.erp_dashboard_summary(date, date, uuid, text) to authenticated;
grant execute on function public.erp_mr_performance(date, date)                to authenticated;
grant execute on function public.erp_product_performance(date, date)           to authenticated;
grant execute on function public.erp_distributor_performance(date, date)       to authenticated;
grant execute on function public.erp_territory_performance(date, date)         to authenticated;
grant execute on function public.erp_target_progress()                         to authenticated;
