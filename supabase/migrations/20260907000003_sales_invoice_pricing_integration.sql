-- ============================================================================
-- LEOMED PHARMA ERP — PRICING ENGINE, PART 3: SALES INVOICE INTEGRATION
--
-- erp_save_sales_invoice() below is identical to the version in
-- 20260906000005_sales_invoice_doctor_buyer.sql (verified by reading the
-- complete current function before editing, per the standing discipline for
-- this function) EXCEPT:
--   - the batch lookup now also selects purchase_rate, needed as the COST
--     basis input to the pricing resolver
--   - a customer_type is derived from which buyer id is set
--   - selling_rate and (only when a scheme actually governs it) free_quantity
--     are now resolved server-side via erp_resolve_selling_price() /
--     erp_resolve_free_quantity() and the client-submitted sale_rate is
--     IGNORED — this is the "never trust client-provided selling_rate /
--     free_quantity" requirement
--   - each item snapshots which pricing rule / scheme produced its numbers
-- Every other line (FEFO row-locking, expired-stock authorisation + audit
-- log, overpayment check, receipt insert, exact return JSON shape) is
-- byte-for-byte unchanged.
--
-- discount_percent is deliberately left alone: it is a genuine ad-hoc
-- discretionary discount an accountant can still apply on top of the
-- engine-computed rate (spec §56/§57 — "discount" and "margin" are
-- different concepts; only the margin/scheme system is centralized here).
-- ============================================================================

alter table public.erp_sales_invoice_items
  add column if not exists pricing_rule_id      uuid references public.erp_pricing_rules(id) on delete set null,
  add column if not exists pricing_rule_version  integer,
  add column if not exists margin_scheme_id      uuid references public.erp_schemes(id) on delete set null,
  add column if not exists margin_scheme_version integer,
  add column if not exists free_scheme_id        uuid references public.erp_schemes(id) on delete set null,
  add column if not exists free_scheme_version    integer,
  add column if not exists margin_amount         numeric(14,2);

create index if not exists erp_sales_items_pricing_rule_idx on public.erp_sales_invoice_items (pricing_rule_id) where pricing_rule_id is not null;

-- Keeps a product's DEFAULT pricing rule in sync when Admin edits its
-- Distributor/Retailer price on the existing Product Master form — so that
-- form stays the single place admin edits default prices, while every edit
-- still becomes a new, audited, versioned rule underneath (spec §17) rather
-- than an overwrite. The old version is retired (INACTIVE), never deleted —
-- any sales invoice already snapshotted against it keeps pointing at it.
create or replace function public.erp_set_product_default_price(
  p_product_id      uuid,
  p_customer_type   public.erp_billing_customer_type,
  p_basis           public.erp_calculation_basis,
  p_method          public.erp_calculation_method,
  p_percentage      numeric,
  p_fixed_amount    numeric default null,
  p_effective_from  date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor        uuid := public.erp_current_user_id();
  v_current      record;
  v_next_version integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can set product pricing'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_current from public.erp_pricing_rules
   where product_id = p_product_id and customer_type = p_customer_type
     and distributor_id is null and chemist_id is null and doctor_id is null
     and status = 'ACTIVE'
   order by version desc
   limit 1;

  if found
     and v_current.calculation_basis = p_basis
     and v_current.calculation_method = p_method
     and v_current.percentage is not distinct from p_percentage
     and v_current.fixed_amount is not distinct from p_fixed_amount then
    return; -- nothing actually changed — no pointless new version
  end if;

  v_next_version := coalesce(v_current.version, 0) + 1;

  if found then
    update public.erp_pricing_rules set status = 'INACTIVE' where id = v_current.id;
  end if;

  insert into public.erp_pricing_rules (
    product_id, customer_type, calculation_basis, calculation_method, percentage, fixed_amount,
    effective_from, status, version, created_by, updated_by
  ) values (
    p_product_id, p_customer_type, p_basis, p_method, p_percentage, p_fixed_amount,
    p_effective_from, 'ACTIVE', v_next_version, v_actor, v_actor
  );
end;
$$;

revoke all on function public.erp_set_product_default_price(uuid, public.erp_billing_customer_type, public.erp_calculation_basis, public.erp_calculation_method, numeric, numeric, date) from public;
grant execute on function public.erp_set_product_default_price(uuid, public.erp_billing_customer_type, public.erp_calculation_basis, public.erp_calculation_method, numeric, numeric, date) to authenticated;

-- Saves a scheme and replaces its customer-target list in one transaction —
-- an empty target list means "company-wide for this customer type", a
-- non-empty one means "these customers only" (spec §23).
create or replace function public.erp_save_scheme(p_scheme jsonb, p_customers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.erp_current_user_id();
  v_id    uuid;
  v_ref   jsonb;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator can manage schemes'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := nullif(p_scheme->>'id', '')::uuid;

  if v_id is null then
    insert into public.erp_schemes (
      scheme_name, scheme_type, product_id, customer_type,
      calculation_basis, calculation_method, percentage,
      buy_quantity, free_quantity,
      effective_from, effective_to, priority, status, notes,
      created_by, updated_by
    ) values (
      p_scheme->>'scheme_name', (p_scheme->>'scheme_type')::public.erp_scheme_type,
      (p_scheme->>'product_id')::uuid,
      nullif(p_scheme->>'customer_type', '')::public.erp_billing_customer_type,
      nullif(p_scheme->>'calculation_basis', '')::public.erp_calculation_basis,
      nullif(p_scheme->>'calculation_method', '')::public.erp_calculation_method,
      nullif(p_scheme->>'percentage', '')::numeric,
      nullif(p_scheme->>'buy_quantity', '')::integer,
      nullif(p_scheme->>'free_quantity', '')::integer,
      (p_scheme->>'effective_from')::date, nullif(p_scheme->>'effective_to', '')::date,
      coalesce((p_scheme->>'priority')::integer, 100),
      coalesce(nullif(p_scheme->>'status', '')::public.erp_pricing_status, 'DRAFT'),
      nullif(p_scheme->>'notes', ''),
      v_actor, v_actor
    )
    returning id into v_id;
  else
    update public.erp_schemes set
      scheme_name = p_scheme->>'scheme_name',
      customer_type = nullif(p_scheme->>'customer_type', '')::public.erp_billing_customer_type,
      calculation_basis = nullif(p_scheme->>'calculation_basis', '')::public.erp_calculation_basis,
      calculation_method = nullif(p_scheme->>'calculation_method', '')::public.erp_calculation_method,
      percentage = nullif(p_scheme->>'percentage', '')::numeric,
      buy_quantity = nullif(p_scheme->>'buy_quantity', '')::integer,
      free_quantity = nullif(p_scheme->>'free_quantity', '')::integer,
      effective_from = (p_scheme->>'effective_from')::date,
      effective_to = nullif(p_scheme->>'effective_to', '')::date,
      priority = coalesce((p_scheme->>'priority')::integer, 100),
      status = coalesce(nullif(p_scheme->>'status', '')::public.erp_pricing_status, status),
      notes = nullif(p_scheme->>'notes', ''),
      updated_by = v_actor
    where id = v_id;
  end if;

  delete from public.erp_scheme_customers where scheme_id = v_id;
  for v_ref in select * from jsonb_array_elements(coalesce(p_customers, '[]'::jsonb))
  loop
    insert into public.erp_scheme_customers (scheme_id, distributor_id, chemist_id, doctor_id)
    values (
      v_id,
      nullif(v_ref->>'distributor_id', '')::uuid,
      nullif(v_ref->>'chemist_id', '')::uuid,
      nullif(v_ref->>'doctor_id', '')::uuid
    );
  end loop;

  return jsonb_build_object('scheme_id', v_id);
end;
$$;

revoke all on function public.erp_save_scheme(jsonb, jsonb) from public;
grant execute on function public.erp_save_scheme(jsonb, jsonb) to authenticated;

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
    v_price := public.erp_resolve_selling_price(
      (v_item->>'product_id')::uuid, v_customer_type,
      v_distributor_id, v_chemist_id, v_doctor_id,
      v_date, v_batch.purchase_rate
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
