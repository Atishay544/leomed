-- ============================================================================
-- Admin insight reporting: gross margin, receivables/payables aging,
-- order-to-invoice conversion, expired-sale and scheme-discount cost, GST
-- summary, expense-period summary, doctor/chemist performance, slow-moving
-- stock, and MR performance extended with order-submission and attendance
-- figures.
--
-- Nothing here duplicates a stored figure — every function is a fresh
-- aggregate over the same tables every other screen already reads, so there
-- is exactly one source of truth for each number, same discipline as every
-- other reporting function in this project.
-- ============================================================================

-- ─── Gross margin (admin-only: reveals landing cost) ────────────────────────

create or replace function public.erp_gross_margin_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales_value numeric;
  v_cogs        numeric;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may view gross margin'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(i.taxable_amount), 0), coalesce(sum(i.quantity * b.purchase_rate), 0)
    into v_sales_value, v_cogs
    from public.erp_sales_invoice_items i
    join public.erp_sales_invoices inv on inv.id = i.sales_invoice_id
    join public.erp_product_batches b   on b.id = i.batch_id
   where inv.invoice_date between p_from and p_to;

  return jsonb_build_object(
    'sales_value',  v_sales_value,
    'cogs',         v_cogs,
    'gross_margin', v_sales_value - v_cogs,
    'margin_pct',   case when v_sales_value > 0
                         then round((v_sales_value - v_cogs) / v_sales_value * 100, 2)
                         else 0 end
  );
end;
$$;

-- ─── Receivables / payables aging ───────────────────────────────────────────
-- Always "as of today", not date-ranged: aging describes what's outstanding
-- right now, not activity in a period.

create or replace function public.erp_sales_aging_summary()
returns table (bucket text, invoice_count bigint, outstanding numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with o as (
    select grand_total - amount_paid as balance, current_date - invoice_date as age_days
      from public.erp_sales_invoices
     where grand_total > amount_paid
  )
  select
    case when age_days <= 30 then '0-30' when age_days <= 60 then '31-60' else '60+' end,
    count(*)::bigint,
    coalesce(sum(balance), 0)
    from o
   group by 1
   order by case when min(age_days) <= 30 then 1 when min(age_days) <= 60 then 2 else 3 end;
$$;

create or replace function public.erp_purchase_aging_summary()
returns table (bucket text, invoice_count bigint, outstanding numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with o as (
    select grand_total - amount_paid as balance, current_date - invoice_date as age_days
      from public.erp_purchase_invoices
     where grand_total > amount_paid
  )
  select
    case when age_days <= 30 then '0-30' when age_days <= 60 then '31-60' else '60+' end,
    count(*)::bigint,
    coalesce(sum(balance), 0)
    from o
   group by 1
   order by case when min(age_days) <= 30 then 1 when min(age_days) <= 60 then 2 else 3 end;
$$;

-- ─── Field order → invoice conversion ───────────────────────────────────────
-- How much of the demand MRs record actually turns into a billed order.

create or replace function public.erp_order_invoice_conversion(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'pending',          count(*) filter (where invoice_status = 'PENDING'),
    'submitted',        count(*) filter (where invoice_status = 'SUBMITTED'),
    'rejected',         count(*) filter (where invoice_status = 'REJECTED'),
    'submitted_value',  coalesce(sum(reported_invoice_amount) filter (where invoice_status = 'SUBMITTED'), 0),
    'conversion_rate',  case when count(*) > 0
                              then round(count(*) filter (where invoice_status = 'SUBMITTED')::numeric / count(*) * 100, 1)
                              else 0 end
  )
  from public.erp_field_orders
  where order_date between p_from and p_to;
$$;

-- ─── Expired-stock sales — a compliance figure, not just a per-invoice flag ─

create or replace function public.erp_expired_sale_summary(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'count', count(*),
    'value', coalesce(sum(grand_total), 0)
  )
  from public.erp_sales_invoices
  where invoice_date between p_from and p_to and expired_sale_override;
$$;

-- ─── Scheme/discount cost (admin-only: pricing.manage territory) ────────────

create or replace function public.erp_scheme_discount_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may view scheme discount cost'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'margin_scheme_lines', count(*) filter (where i.margin_scheme_id is not null),
    'margin_scheme_value', coalesce(sum(i.line_total) filter (where i.margin_scheme_id is not null), 0),
    'free_scheme_lines',   count(*) filter (where i.free_scheme_id is not null),
    'free_units_given',    coalesce(sum(i.free_quantity) filter (where i.free_scheme_id is not null), 0),
    'free_units_value',    coalesce(sum(i.free_quantity * i.sale_rate) filter (where i.free_scheme_id is not null), 0)
  )
    into v_result
    from public.erp_sales_invoice_items i
    join public.erp_sales_invoices inv on inv.id = i.sales_invoice_id
   where inv.invoice_date between p_from and p_to;

  return v_result;
end;
$$;

-- ─── GST: output tax vs input tax credit ────────────────────────────────────

create or replace function public.erp_gst_summary(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'output_tax',  coalesce((select sum(tax) from public.erp_sales_invoices    where invoice_date between p_from and p_to), 0),
    'input_tax',   coalesce((select sum(tax) from public.erp_purchase_invoices where invoice_date between p_from and p_to), 0),
    'net_payable', coalesce((select sum(tax) from public.erp_sales_invoices    where invoice_date between p_from and p_to), 0)
                 - coalesce((select sum(tax) from public.erp_purchase_invoices where invoice_date between p_from and p_to), 0)
  );
$$;

-- ─── Expenses for an arbitrary period (payroll totals are period-keyed;
-- this lets the dashboard roll up HR cost for the same from/to it already
-- filters everything else by) ────────────────────────────────────────────

create or replace function public.erp_expense_period_summary(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'approved_value', coalesce(sum(amount) filter (where status in ('APPROVED', 'PAID')), 0),
    'pending_value',  coalesce(sum(amount) filter (where status = 'SUBMITTED'), 0)
  )
  from public.erp_expenses
  where expense_date between p_from and p_to;
$$;

-- ─── Doctor / chemist performance — mirrors erp_distributor_performance() ──
-- Business value per customer, from the same reported_invoice_amount the
-- dashboard and MR performance now use.

create or replace function public.erp_doctor_performance(p_from date, p_to date)
returns table (
  doctor_id       uuid,
  doctor_name     text,
  doctor_code     text,
  city            text,
  order_count     bigint,
  submitted_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.id, d.doctor_name, d.doctor_code, d.city,
    count(o.id),
    coalesce(sum(o.reported_invoice_amount) filter (where o.invoice_status = 'SUBMITTED'), 0)
    from public.erp_doctors d
    join public.erp_field_orders o on o.doctor_id = d.id and o.order_date between p_from and p_to
   group by d.id, d.doctor_name, d.doctor_code, d.city
   order by 6 desc
   limit 50;
$$;

create or replace function public.erp_chemist_performance(p_from date, p_to date)
returns table (
  chemist_id      uuid,
  chemist_name    text,
  chemist_code    text,
  city            text,
  order_count     bigint,
  submitted_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.chemist_name, c.chemist_code, c.city,
    count(o.id),
    coalesce(sum(o.reported_invoice_amount) filter (where o.invoice_status = 'SUBMITTED'), 0)
    from public.erp_chemists c
    join public.erp_field_orders o on o.chemist_id = c.id and o.order_date between p_from and p_to
   group by c.id, c.chemist_name, c.chemist_code, c.city
   order by 6 desc
   limit 50;
$$;

-- New-vs-repeat has no status column on chemists the way doctor_visits does
-- (doctor_status NEW/EXISTING) — created_at is the next best proxy: a
-- chemist created inside the period was necessarily new to it.
create or replace function public.erp_chemist_new_vs_repeat(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'new_chemists',    count(*) filter (where c.created_at::date between p_from and p_to),
    'repeat_chemists', count(*) filter (where c.created_at::date < p_from)
  )
  from (select distinct v.chemist_id from public.erp_chemist_visits v
         where v.visit_date between p_from and p_to) visited
  join public.erp_chemists c on c.id = visited.chemist_id;
$$;

-- ─── Slow-moving stock: in stock, but nothing sold in p_days ────────────────

create or replace function public.erp_slow_moving_products(p_days integer default 90)
returns table (
  product_id     uuid,
  product_name   text,
  product_code   text,
  stock_on_hand  bigint,
  last_sold_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  with stock as (
    select product_id, sum(current_quantity)::bigint as qty
      from public.erp_product_batches
     group by product_id
    having sum(current_quantity) > 0
  ),
  last_sale as (
    select i.product_id, max(inv.invoice_date) as last_sold
      from public.erp_sales_invoice_items i
      join public.erp_sales_invoices inv on inv.id = i.sales_invoice_id
     group by i.product_id
  )
  select p.id, p.product_name, p.product_code, s.qty, ls.last_sold
    from public.erp_products p
    join stock s on s.product_id = p.id
    left join last_sale ls on ls.product_id = p.id
   where p.active
     and (ls.last_sold is null or ls.last_sold < current_date - p_days)
   order by ls.last_sold nulls first
   limit 100;
$$;

-- ─── MR performance, extended with order-submission and attendance figures ─
-- Return type is changing (new output columns), so the old signature is
-- dropped first — CREATE OR REPLACE cannot alter a function's RETURNS TABLE
-- column list.

drop function if exists public.erp_mr_performance(date, date);

create or replace function public.erp_mr_performance(
  p_from date,
  p_to   date
)
returns table (
  mr_id               uuid,
  mr_name             text,
  mr_code             text,
  territory           text,
  doctor_visits       bigint,
  chemist_visits      bigint,
  new_doctors         bigint,
  doctors_covered     bigint,
  chemists_covered    bigint,
  field_orders        bigint,
  order_value         numeric,
  followups_open      bigint,
  orders_submitted    bigint,
  orders_pending      bigint,
  orders_rejected     bigint,
  attendance_present  numeric,
  attendance_days     bigint
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
      where f.mr_id = u.id and f.status = 'PENDING'),
    (select count(*) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to and o.invoice_status = 'SUBMITTED'),
    (select count(*) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to and o.invoice_status = 'PENDING'),
    (select count(*) from public.erp_field_orders o
      where o.mr_id = u.id and o.order_date between p_from and p_to and o.invoice_status = 'REJECTED'),
    -- Present days: full credit for PRESENT/PRESENT_WITH_EXCEPTION, half for
    -- HALF_DAY. Week-offs and holidays are excluded from both this and the
    -- denominator below — you cannot be "present" on a day nobody expected
    -- you to work.
    (select coalesce(
        count(*) filter (where a.attendance_status in ('PRESENT', 'PRESENT_WITH_EXCEPTION'))
        + count(*) filter (where a.attendance_status = 'HALF_DAY') * 0.5
      , 0)
      from public.erp_attendance a
      where a.employee_id = u.id and a.date between p_from and p_to),
    (select count(*) from public.erp_attendance a
      where a.employee_id = u.id and a.date between p_from and p_to
        and a.attendance_status not in ('WEEK_OFF', 'HOLIDAY'))
    from public.erp_users u
   where u.role = 'MR' and u.active
   order by 5 desc, 10 desc;   -- doctor_visits, then field_orders
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke all on function public.erp_gross_margin_summary(date, date)      from public;
revoke all on function public.erp_sales_aging_summary()                 from public;
revoke all on function public.erp_purchase_aging_summary()              from public;
revoke all on function public.erp_order_invoice_conversion(date, date)  from public;
revoke all on function public.erp_expired_sale_summary(date, date)      from public;
revoke all on function public.erp_scheme_discount_summary(date, date)   from public;
revoke all on function public.erp_gst_summary(date, date)               from public;
revoke all on function public.erp_expense_period_summary(date, date)    from public;
revoke all on function public.erp_doctor_performance(date, date)        from public;
revoke all on function public.erp_chemist_performance(date, date)       from public;
revoke all on function public.erp_chemist_new_vs_repeat(date, date)     from public;
revoke all on function public.erp_slow_moving_products(integer)         from public;
revoke all on function public.erp_mr_performance(date, date)            from public;

grant execute on function public.erp_gross_margin_summary(date, date)      to authenticated;
grant execute on function public.erp_sales_aging_summary()                 to authenticated;
grant execute on function public.erp_purchase_aging_summary()              to authenticated;
grant execute on function public.erp_order_invoice_conversion(date, date)  to authenticated;
grant execute on function public.erp_expired_sale_summary(date, date)      to authenticated;
grant execute on function public.erp_scheme_discount_summary(date, date)   to authenticated;
grant execute on function public.erp_gst_summary(date, date)               to authenticated;
grant execute on function public.erp_expense_period_summary(date, date)    to authenticated;
grant execute on function public.erp_doctor_performance(date, date)        to authenticated;
grant execute on function public.erp_chemist_performance(date, date)       to authenticated;
grant execute on function public.erp_chemist_new_vs_repeat(date, date)     to authenticated;
grant execute on function public.erp_slow_moving_products(integer)         to authenticated;
grant execute on function public.erp_mr_performance(date, date)            to authenticated;
