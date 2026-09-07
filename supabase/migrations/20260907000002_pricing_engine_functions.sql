-- ============================================================================
-- LEOMED PHARMA ERP — PRICING ENGINE, PART 2: RESOLUTION FUNCTIONS
--
-- One authoritative calculation, same discipline as
-- erp_calculate_attendance()/erp_recalculate_payroll_record(): every price
-- and every scheme-driven free quantity used anywhere in the system comes
-- from exactly these functions, never recomputed independently elsewhere.
-- ============================================================================

-- Turns (basis, method, percentage/fixed_amount) into a rupee rate. Pure
-- function — no table access — so both the resolver below and any future
-- caller share one calculation with zero chance of drifting apart.
create or replace function public.erp_apply_pricing(
  p_basis        public.erp_calculation_basis,
  p_method       public.erp_calculation_method,
  p_percentage   numeric,
  p_fixed_amount numeric,
  p_mrp          numeric,
  p_ptr          numeric,
  p_cost         numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_base numeric;
begin
  if p_method = 'FIXED_PRICE' then
    return round(coalesce(p_fixed_amount, 0), 2);
  end if;

  v_base := case p_basis
    when 'MRP'   then p_mrp
    when 'PTR'   then p_ptr
    when 'PTS'   then p_ptr
    when 'COST'  then p_cost
    when 'FIXED' then p_fixed_amount
  end;

  if v_base is null then
    raise exception 'This pricing rule needs a % basis value that is not available for this product', p_basis
      using errcode = 'check_violation';
  end if;

  return round(
    case when p_method = 'MARKUP'
         then v_base * (1 + coalesce(p_percentage, 0) / 100)
         else v_base * (1 - coalesce(p_percentage, 0) / 100)  -- MARGIN, DISCOUNT: same arithmetic, different business meaning
    end
  , 2);
end;
$$;

-- The company-wide "Price to Retailer" reference: the product's DEFAULT
-- chemist (retailer) rule applied to MRP. This is what "distributor margin
-- is a % of PTR" means — a standard anchor price, not any one retailer's
-- negotiated figure. If no default retailer rule is configured at all, MRP
-- itself is the fallback anchor rather than failing every distributor quote.
create or replace function public.erp_default_ptr(p_product_id uuid, p_invoice_date date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mrp  numeric;
  v_rule record;
begin
  select mrp into v_mrp from public.erp_products where id = p_product_id;
  if v_mrp is null then
    raise exception 'Product not found';
  end if;

  select * into v_rule from public.erp_pricing_rules
   where product_id = p_product_id and customer_type = 'CHEMIST'
     and distributor_id is null and chemist_id is null and doctor_id is null
     and status = 'ACTIVE'
     and effective_from <= p_invoice_date
     and (effective_to is null or effective_to >= p_invoice_date)
   order by version desc
   limit 1;

  if not found then
    return v_mrp;
  end if;

  return public.erp_apply_pricing(
    v_rule.calculation_basis, v_rule.calculation_method, v_rule.percentage, v_rule.fixed_amount,
    v_mrp, null, null
  );
end;
$$;

-- The centralized pricing resolution (spec §27): negotiated customer+product
-- rule, else an active percentage-margin scheme, else the product default —
-- exactly one winner, never stacked. Returns full internal detail (rule/
-- scheme id + version + percentage) — this is the AUTHORITATIVE calculation
-- used by erp_save_sales_invoice() to snapshot what was actually applied.
-- It is intentionally NOT the function a non-admin UI calls to display a
-- price explanation — see erp_explain_price() below for the role-filtered
-- version of the same answer.
create or replace function public.erp_resolve_selling_price(
  p_product_id     uuid,
  p_customer_type  public.erp_billing_customer_type,
  p_distributor_id uuid,
  p_chemist_id     uuid,
  p_doctor_id      uuid,
  p_invoice_date   date,
  p_cost           numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mrp    numeric;
  v_ptr    numeric;
  v_rule   record;
  v_scheme record;
  v_found_negotiated boolean := false;
  v_found_scheme     boolean := false;
  v_source text;
  v_rate   numeric;
begin
  select mrp into v_mrp from public.erp_products where id = p_product_id;
  if v_mrp is null then
    raise exception 'Product not found';
  end if;

  v_ptr := public.erp_default_ptr(p_product_id, p_invoice_date);

  -- Priority 1: active customer-specific negotiated rule.
  if p_distributor_id is not null or p_chemist_id is not null or p_doctor_id is not null then
    select * into v_rule from public.erp_pricing_rules
     where product_id = p_product_id and customer_type = p_customer_type
       and status = 'ACTIVE'
       and effective_from <= p_invoice_date
       and (effective_to is null or effective_to >= p_invoice_date)
       and distributor_id is not distinct from p_distributor_id
       and chemist_id     is not distinct from p_chemist_id
       and doctor_id      is not distinct from p_doctor_id
     order by version desc
     limit 1;
    v_found_negotiated := found;
  end if;

  -- Priority 2: active percentage-margin scheme (customer-specific first,
  -- then company-wide for this customer type).
  if not v_found_negotiated then
    select s.* into v_scheme
      from public.erp_schemes s
     where s.product_id = p_product_id
       and s.scheme_type = 'PERCENTAGE_MARGIN'
       and s.status = 'ACTIVE'
       and s.effective_from <= p_invoice_date
       and (s.effective_to is null or s.effective_to >= p_invoice_date)
       and (s.customer_type is null or s.customer_type = p_customer_type)
       and (
         exists (
           select 1 from public.erp_scheme_customers sc
            where sc.scheme_id = s.id
              and sc.distributor_id is not distinct from p_distributor_id
              and sc.chemist_id     is not distinct from p_chemist_id
              and sc.doctor_id      is not distinct from p_doctor_id
              and (p_distributor_id is not null or p_chemist_id is not null or p_doctor_id is not null)
         )
         or not exists (select 1 from public.erp_scheme_customers sc2 where sc2.scheme_id = s.id)
       )
     order by
       -- A scheme aimed at this exact customer wins over a company-wide one
       -- at the same priority number.
       (exists (select 1 from public.erp_scheme_customers sc3 where sc3.scheme_id = s.id)) desc,
       s.priority asc, s.version desc
     limit 1;
    v_found_scheme := found;
  end if;

  if v_found_scheme then
    v_source := 'SCHEME';
    v_rate := public.erp_apply_pricing(
      v_scheme.calculation_basis, v_scheme.calculation_method, v_scheme.percentage, null,
      v_mrp, v_ptr, p_cost
    );
    return jsonb_build_object(
      'source', v_source, 'selling_rate', v_rate, 'mrp', v_mrp,
      'calculation_basis', v_scheme.calculation_basis, 'calculation_method', v_scheme.calculation_method,
      'percentage', v_scheme.percentage,
      'pricing_rule_id', null, 'pricing_rule_version', null,
      'scheme_id', v_scheme.id, 'scheme_version', v_scheme.version, 'scheme_name', v_scheme.scheme_name
    );
  end if;

  if not v_found_negotiated then
    -- Priority 3: product default for this customer type.
    select * into v_rule from public.erp_pricing_rules
     where product_id = p_product_id and customer_type = p_customer_type
       and distributor_id is null and chemist_id is null and doctor_id is null
       and status = 'ACTIVE'
       and effective_from <= p_invoice_date
       and (effective_to is null or effective_to >= p_invoice_date)
     order by version desc
     limit 1;

    if not found then
      -- No default rule configured yet for this product/customer type —
      -- fall back to the flat price still carried on erp_products, so a
      -- brand-new product stays sellable the moment its prices are set,
      -- exactly as before this migration (saving a product also keeps a
      -- matching default rule in sync going forward — see saveProduct() in
      -- lib/erp/actions/masters.ts — this is a safety net, not the primary
      -- path). Only reached for a product nobody has priced at all yet.
      declare
        v_fallback numeric;
      begin
        select case when p_customer_type = 'DISTRIBUTOR' then distributor_price else retailer_price end
          into v_fallback
          from public.erp_products where id = p_product_id;

        if v_fallback is null or v_fallback <= 0 then
          raise exception 'No pricing is configured for this product and customer type. An administrator must set a default price before it can be sold.'
            using errcode = 'check_violation';
        end if;

        return jsonb_build_object(
          'source', 'DEFAULT', 'selling_rate', round(v_fallback, 2), 'mrp', v_mrp,
          'calculation_basis', 'FIXED', 'calculation_method', 'FIXED_PRICE', 'percentage', null,
          'pricing_rule_id', null, 'pricing_rule_version', null,
          'scheme_id', null, 'scheme_version', null, 'scheme_name', null
        );
      end;
    end if;
    v_source := 'DEFAULT';
  else
    v_source := 'NEGOTIATED';
  end if;

  v_rate := public.erp_apply_pricing(
    v_rule.calculation_basis, v_rule.calculation_method, v_rule.percentage, v_rule.fixed_amount,
    v_mrp, v_ptr, p_cost
  );

  return jsonb_build_object(
    'source', v_source, 'selling_rate', v_rate, 'mrp', v_mrp,
    'calculation_basis', v_rule.calculation_basis, 'calculation_method', v_rule.calculation_method,
    'percentage', v_rule.percentage,
    'pricing_rule_id', v_rule.id, 'pricing_rule_version', v_rule.version,
    'scheme_id', null, 'scheme_version', null, 'scheme_name', null
  );
end;
$$;

-- Buy-X-Get-Y resolution (spec §19, §23, §26). Free quantity is ALWAYS its
-- own separate figure — never folded into the margin calculation above.
create or replace function public.erp_resolve_free_quantity(
  p_product_id     uuid,
  p_customer_type  public.erp_billing_customer_type,
  p_distributor_id uuid,
  p_chemist_id     uuid,
  p_doctor_id      uuid,
  p_paid_qty       integer,
  p_invoice_date   date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scheme record;
  v_free   integer := 0;
begin
  select s.* into v_scheme
    from public.erp_schemes s
   where s.product_id = p_product_id
     and s.scheme_type = 'FREE_QUANTITY'
     and s.status = 'ACTIVE'
     and s.effective_from <= p_invoice_date
     and (s.effective_to is null or s.effective_to >= p_invoice_date)
     and (s.customer_type is null or s.customer_type = p_customer_type)
     and (
       exists (
         select 1 from public.erp_scheme_customers sc
          where sc.scheme_id = s.id
            and sc.distributor_id is not distinct from p_distributor_id
            and sc.chemist_id     is not distinct from p_chemist_id
            and sc.doctor_id      is not distinct from p_doctor_id
            and (p_distributor_id is not null or p_chemist_id is not null or p_doctor_id is not null)
       )
       or not exists (select 1 from public.erp_scheme_customers sc2 where sc2.scheme_id = s.id)
     )
   order by
     (exists (select 1 from public.erp_scheme_customers sc3 where sc3.scheme_id = s.id)) desc,
     s.priority asc, s.version desc
   limit 1;

  if found and p_paid_qty > 0 then
    v_free := floor(p_paid_qty::numeric / v_scheme.buy_quantity) * v_scheme.free_quantity;
  end if;

  return jsonb_build_object(
    'free_quantity',  coalesce(v_free, 0),
    'scheme_id',      case when found then v_scheme.id else null end,
    'scheme_version', case when found then v_scheme.version else null end,
    'scheme_name',    case when found then v_scheme.scheme_name else null end
  );
end;
$$;

-- The "why did this price apply" answer (spec §28), shaped by who's asking
-- (spec §30): an admin gets the full explanation; anyone else gets the
-- rupee figures only — never the underlying percentage, rule id or scheme
-- name, which is exactly the commercial detail an Accountant must not see.
create or replace function public.erp_explain_price(
  p_product_id     uuid,
  p_customer_type  public.erp_billing_customer_type,
  p_distributor_id uuid,
  p_chemist_id     uuid,
  p_doctor_id      uuid,
  p_invoice_date   date,
  p_paid_qty       integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price jsonb;
  v_free  jsonb;
  v_gst   numeric;
begin
  if not public.erp_is_staff() then
    raise exception 'Your account is not an active Leomed staff account'
      using errcode = 'insufficient_privilege';
  end if;

  select gst_rate into v_gst from public.erp_products where id = p_product_id;

  v_price := public.erp_resolve_selling_price(p_product_id, p_customer_type, p_distributor_id, p_chemist_id, p_doctor_id, p_invoice_date);
  v_free  := public.erp_resolve_free_quantity(p_product_id, p_customer_type, p_distributor_id, p_chemist_id, p_doctor_id, coalesce(p_paid_qty, 0), p_invoice_date);

  if public.erp_is_admin() then
    return v_price || jsonb_build_object('gst_rate', v_gst) || jsonb_build_object('free', v_free);
  end if;

  -- Accountant/Manager/MR view: the number to bill, nothing about how it
  -- was derived.
  return jsonb_build_object(
    'selling_rate', v_price->'selling_rate',
    'mrp',          v_price->'mrp',
    'gst_rate',     v_gst,
    'free',         jsonb_build_object('free_quantity', v_free->'free_quantity')
  );
end;
$$;

revoke all on function public.erp_apply_pricing(public.erp_calculation_basis, public.erp_calculation_method, numeric, numeric, numeric, numeric, numeric) from public;
revoke all on function public.erp_default_ptr(uuid, date) from public;
revoke all on function public.erp_resolve_selling_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, numeric) from public;
revoke all on function public.erp_resolve_free_quantity(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, integer, date) from public;
revoke all on function public.erp_explain_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, integer) from public;

grant execute on function public.erp_explain_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, integer) to authenticated;
-- The lower-level resolvers are called only from inside other SECURITY
-- DEFINER functions (erp_explain_price, and erp_save_sales_invoice in part
-- 3) — no direct grant to authenticated, so a client can never call them to
-- probe pricing_rule internals directly.
