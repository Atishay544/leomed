-- ============================================================================
-- Pricing resolution uses the SOLD BATCH's own MRP, not the product master's.
--
-- erp_product_batches already carries its own mrp/purchase_rate/sale_rate —
-- a batch is a real, physical lot with a printed MRP that can legitimately
-- differ from whatever erp_products.mrp says today (MRP gets revised between
-- purchase runs; the product master reflects the CURRENT reference price,
-- not what's printed on every pack still on the shelf). Despite that,
-- erp_resolve_selling_price() has always read MRP from erp_products only,
-- even when a specific batch (with its own possibly-different mrp) is being
-- sold. A "10% off MRP" negotiated rule or scheme should apply to the MRP
-- actually printed on the batch leaving the shelf, not a stale product-level
-- number.
--
-- Fix: erp_resolve_selling_price() and erp_explain_price() both gain an
-- optional p_batch_id, and when it's given, the batch's own mrp (if set)
-- overrides the product master's mrp for that one resolution — nowhere
-- else. erp_default_ptr() gains an optional MRP override so a PTR-basis
-- rule is computed against the same (possibly batch-specific) MRP, not a
-- second, inconsistent lookup. erp_save_sales_invoice() now passes the
-- batch actually being sold, so real invoices get this automatically.
--
-- Each of the three functions below is being given a new trailing default
-- parameter, so the old N-arg signature is explicitly dropped first —
-- otherwise Postgres keeps BOTH the old and new signatures side by side
-- (they're different arities) and every existing N-arg call site keeps
-- resolving to the old, unfixed version instead of the new default-filled
-- one.
-- ============================================================================

drop function if exists public.erp_default_ptr(uuid, date);
drop function if exists public.erp_resolve_selling_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, numeric);
drop function if exists public.erp_explain_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, integer);

-- Full body from 20260907000002_pricing_engine_functions.sql, plus
-- p_mrp_override.
create or replace function public.erp_default_ptr(p_product_id uuid, p_invoice_date date, p_mrp_override numeric default null)
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
  if p_mrp_override is not null and p_mrp_override > 0 then
    v_mrp := p_mrp_override;
  else
    select mrp into v_mrp from public.erp_products where id = p_product_id;
    if v_mrp is null then
      raise exception 'Product not found';
    end if;
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

-- Full body from 20260907000002_pricing_engine_functions.sql, plus
-- p_batch_id: when given, its own mrp (if set) overrides the product
-- master's for this resolution only.
create or replace function public.erp_resolve_selling_price(
  p_product_id     uuid,
  p_customer_type  public.erp_billing_customer_type,
  p_distributor_id uuid,
  p_chemist_id     uuid,
  p_doctor_id      uuid,
  p_invoice_date   date,
  p_cost           numeric default null,
  p_batch_id       uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mrp    numeric;
  v_batch_mrp numeric;
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

  if p_batch_id is not null then
    select b.mrp into v_batch_mrp
      from public.erp_product_batches b
     where b.id = p_batch_id and b.product_id = p_product_id;
    if v_batch_mrp is not null and v_batch_mrp > 0 then
      v_mrp := v_batch_mrp;
    end if;
  end if;

  v_ptr := public.erp_default_ptr(p_product_id, p_invoice_date, v_mrp);

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

-- Full body from 20260907000002_pricing_engine_functions.sql, plus
-- p_batch_id passed straight through to erp_resolve_selling_price().
create or replace function public.erp_explain_price(
  p_product_id     uuid,
  p_customer_type  public.erp_billing_customer_type,
  p_distributor_id uuid,
  p_chemist_id     uuid,
  p_doctor_id      uuid,
  p_invoice_date   date,
  p_paid_qty       integer default 0,
  p_batch_id       uuid default null
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

  v_price := public.erp_resolve_selling_price(p_product_id, p_customer_type, p_distributor_id, p_chemist_id, p_doctor_id, p_invoice_date, null, p_batch_id);
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

revoke all on function public.erp_default_ptr(uuid, date, numeric) from public;
revoke all on function public.erp_resolve_selling_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, numeric, uuid) from public;
revoke all on function public.erp_explain_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, integer, uuid) from public;

-- erp_default_ptr and erp_resolve_selling_price stay internal-only, called
-- solely from inside other SECURITY DEFINER functions — no grant to
-- authenticated, unchanged from their original intent.
grant execute on function public.erp_explain_price(uuid, public.erp_billing_customer_type, uuid, uuid, uuid, date, integer, uuid) to authenticated;

-- Full body from 20260907000003_sales_invoice_pricing_integration.sql,
-- except the pricing call now passes the batch actually being sold.
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
  v_reason        text;
  v_used_expired  boolean := false;
  v_expired_list  text := '';
  v_initial  numeric(14,2);
  v_distributor_id uuid;
  v_chemist_id     uuid;
  v_doctor_id      uuid;
  v_customer_type  public.erp_billing_customer_type;
  v_price          jsonb;
  v_free_info      jsonb;
  v_rate           numeric(12,2);
  v_margin_amount  numeric(14,2);
  v_pricing_rule_id      uuid;
  v_pricing_rule_version integer;
  v_margin_scheme_id      uuid;
  v_margin_scheme_version integer;
  v_free_scheme_id        uuid;
  v_free_scheme_version   integer;
begin
  if not public.erp_can_write_billing() then
    raise exception 'Only an administrator or accountant may raise sales invoices'
      using errcode = 'insufficient_privilege';
  end if;
  v_actor := public.erp_current_user_id();
  v_date  := coalesce(nullif(p_payload->>'invoice_date', '')::date, current_date);
  v_reason := nullif(trim(coalesce(p_payload->>'expired_sale_reason', '')), '');

  v_distributor_id := nullif(p_payload->>'distributor_id', '')::uuid;
  v_chemist_id     := nullif(p_payload->>'chemist_id', '')::uuid;
  v_doctor_id      := nullif(p_payload->>'doctor_id', '')::uuid;
  if (
    (case when v_distributor_id is not null then 1 else 0 end)
    + (case when v_chemist_id is not null then 1 else 0 end)
    + (case when v_doctor_id is not null then 1 else 0 end)
  ) <> 1 then
    raise exception 'Choose exactly one of a distributor, a chemist or a doctor to bill'
      using errcode = 'check_violation';
  end if;

  v_customer_type := case
    when v_distributor_id is not null then 'DISTRIBUTOR'
    when v_chemist_id is not null then 'CHEMIST'
    else 'DOCTOR'
  end;

  select allow_expired_sale into v_allow_expired from public.erp_settings where id = 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A sales invoice needs at least one product line';
  end if;

  v_number := coalesce(
    nullif(p_payload->>'invoice_number', ''),
    public.erp_next_document_number('sales_invoice', 'INV', v_date)
  );

  insert into public.erp_sales_invoices (
    invoice_number, distributor_id, chemist_id, doctor_id, invoice_date, is_interstate, remarks,
    created_by, updated_by
  ) values (
    v_number,
    v_distributor_id,
    v_chemist_id,
    v_doctor_id,
    v_date,
    coalesce((p_payload->>'is_interstate')::boolean, false),
    nullif(p_payload->>'remarks', ''),
    v_actor, v_actor
  )
  returning id into v_invoice;

  for v_item in select * from jsonb_array_elements(p_payload->'items')
  loop
    v_qty  := (v_item->>'quantity')::integer;
    v_free := coalesce((v_item->>'free_quantity')::integer, 0);

    select b.id, b.batch_number, b.current_quantity, b.expiry_date, b.purchase_rate, p.product_name
      into v_batch
      from public.erp_product_batches b
      join public.erp_products p on p.id = b.product_id
     where b.id = (v_item->>'batch_id')::uuid
     for update of b;

    if not found then
      raise exception 'Batch % not found', v_item->>'batch_id';
    end if;

    -- Server-side pricing (spec §33): the client's sale_rate is never
    -- trusted. free_quantity is overridden only when an active scheme
    -- actually governs this product/customer — otherwise a manual
    -- goodwill freebie the accountant typed in is left as they entered it.
    -- The batch actually being sold is now passed through, so an MRP-basis
    -- rule or scheme applies to what's printed on THIS batch, not whatever
    -- the product master's mrp happens to say today.
    v_price := public.erp_resolve_selling_price(
      (v_item->>'product_id')::uuid, v_customer_type,
      v_distributor_id, v_chemist_id, v_doctor_id,
      v_date, v_batch.purchase_rate, v_batch.id
    );
    v_rate          := (v_price->>'selling_rate')::numeric;
    v_margin_amount := (v_price->>'mrp')::numeric - v_rate;
    v_pricing_rule_id      := nullif(v_price->>'pricing_rule_id', '')::uuid;
    v_pricing_rule_version := nullif(v_price->>'pricing_rule_version', '')::integer;
    v_margin_scheme_id      := nullif(v_price->>'scheme_id', '')::uuid;
    v_margin_scheme_version := nullif(v_price->>'scheme_version', '')::integer;

    v_free_info := public.erp_resolve_free_quantity(
      (v_item->>'product_id')::uuid, v_customer_type,
      v_distributor_id, v_chemist_id, v_doctor_id,
      v_qty, v_date
    );
    v_free_scheme_id      := nullif(v_free_info->>'scheme_id', '')::uuid;
    v_free_scheme_version := nullif(v_free_info->>'scheme_version', '')::integer;
    if v_free_scheme_id is not null then
      v_free := (v_free_info->>'free_quantity')::integer;
    end if;

    -- ── Q9: expired stock is unavailable for normal sale ──
    if v_batch.expiry_date < v_date then
      if not coalesce(v_allow_expired, false) then
        raise exception
          'Batch % of % expired on % and cannot be sold. Selling expired stock is switched off in Settings.',
          v_batch.batch_number, v_batch.product_name,
          to_char(v_batch.expiry_date, 'DD Mon YYYY')
          using errcode = 'check_violation';
      end if;

      if not public.erp_is_admin() then
        raise exception
          'Batch % of % expired on %. Only an administrator may authorise selling expired stock.',
          v_batch.batch_number, v_batch.product_name,
          to_char(v_batch.expiry_date, 'DD Mon YYYY')
          using errcode = 'insufficient_privilege';
      end if;

      if v_reason is null then
        raise exception
          'Batch % of % expired on %. A written reason is required to authorise this sale.',
          v_batch.batch_number, v_batch.product_name,
          to_char(v_batch.expiry_date, 'DD Mon YYYY')
          using errcode = 'check_violation';
      end if;

      v_used_expired := true;
      v_expired_list := v_expired_list
        || case when v_expired_list = '' then '' else ', ' end
        || v_batch.product_name || ' (batch ' || v_batch.batch_number
        || ', expired ' || to_char(v_batch.expiry_date, 'DD Mon YYYY') || ')';
    end if;

    if v_batch.current_quantity < (v_qty + v_free) then
      raise exception 'Only % units of % (batch %) in stock — % requested',
        v_batch.current_quantity, v_batch.product_name, v_batch.batch_number, v_qty + v_free
        using errcode = 'check_violation';
    end if;

    v_gross   := round(v_qty * v_rate, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_sales_invoice_items (
      sales_invoice_id, product_id, batch_id, quantity, free_quantity,
      sale_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total,
      pricing_rule_id, pricing_rule_version, margin_scheme_id, margin_scheme_version,
      free_scheme_id, free_scheme_version, margin_amount
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch.id, v_qty, v_free,
      v_rate,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line,
      v_pricing_rule_id, v_pricing_rule_version, v_margin_scheme_id, v_margin_scheme_version,
      v_free_scheme_id, v_free_scheme_version, v_margin_amount
    );

    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch.id, 'SALE', 'SALES_INVOICE', v_invoice,
      -(v_qty + v_free), v_rate, v_date,
      'Sales invoice ' || v_number, v_actor
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_disc  := v_sum_disc  + v_disc;
    v_sum_tax   := v_sum_tax   + v_tax;
    v_sum_total := v_sum_total + v_line;
  end loop;

  update public.erp_sales_invoices
     set subtotal = v_sum_gross, discount = v_sum_disc,
         tax = v_sum_tax, grand_total = v_sum_total,
         expired_sale_override    = v_used_expired,
         expired_sale_reason      = case when v_used_expired then v_reason end,
         expired_sale_approved_by = case when v_used_expired then v_actor end,
         expired_sale_approved_at = case when v_used_expired then now() end
   where id = v_invoice;

  -- Selling expired medicine gets its own audit entry, not just the invoice
  -- row, so it is findable without knowing which invoice to look at.
  if v_used_expired then
    insert into public.erp_audit_logs (user_id, action, table_name, record_id, new_data)
    values (
      v_actor, 'EXPIRED_SALE_OVERRIDE', 'erp_sales_invoices', v_invoice,
      jsonb_build_object(
        'invoice_number', v_number,
        'reason',         v_reason,
        'batches',        v_expired_list,
        'approved_at',    now()
      )
    );
  end if;

  v_initial := coalesce(nullif(p_payload->>'initial_payment', '')::numeric, 0);
  if v_initial > 0 then
    if v_initial > v_sum_total then
      raise exception 'Receipt of % is more than the invoice total of %',
        to_char(v_initial, 'FM999999990.00'), to_char(v_sum_total, 'FM999999990.00')
        using errcode = 'check_violation';
    end if;

    insert into public.erp_sales_receipts (
      sales_invoice_id, receipt_date, amount, payment_method,
      reference_number, remarks, created_by
    ) values (
      v_invoice, v_date, v_initial,
      coalesce(nullif(p_payload->>'payment_method', '')::public.erp_payment_method, 'BANK_TRANSFER'),
      nullif(p_payload->>'payment_reference', ''),
      'Received when the invoice was raised', v_actor
    );
  end if;

  return jsonb_build_object(
    'invoice_id',       v_invoice,
    'invoice_number',   v_number,
    'grand_total',      v_sum_total,
    'subtotal',         v_sum_gross,
    'tax',              v_sum_tax,
    'amount_paid',      v_initial,
    'balance',          v_sum_total - v_initial,
    'expired_override', v_used_expired
  );
end;
$$;
