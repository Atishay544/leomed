-- ============================================================
-- Sales invoices could only be raised against a distributor. Some sales
-- are made directly to a chemist, bypassing the distributor tier — this
-- adds that as a second, mutually-exclusive buyer option on the same
-- invoice table (not a separate invoice type), so every existing billing,
-- payment-tracking, and inventory-deduction rule is shared unchanged.
--
-- erp_save_sales_invoice() below is otherwise byte-for-byte identical to
-- the version in 20260905000003_erp_expiry_override.sql — only the buyer
-- id handling changed (see v_distributor_id / v_chemist_id and the insert
-- into erp_sales_invoices).
-- ============================================================

alter table public.erp_sales_invoices
  alter column distributor_id drop not null,
  add column if not exists chemist_id uuid references public.erp_chemists(id) on delete restrict;

alter table public.erp_sales_invoices
  add constraint erp_sales_invoice_buyer_xor
    check ((distributor_id is not null) <> (chemist_id is not null));

create index if not exists erp_sales_invoices_chemist_idx
  on public.erp_sales_invoices (chemist_id, invoice_date desc);

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
  if (v_distributor_id is not null) = (v_chemist_id is not null) then
    raise exception 'Choose either a distributor or a chemist to bill — not both, not neither'
      using errcode = 'check_violation';
  end if;

  select allow_expired_sale into v_allow_expired from public.erp_settings where id = 1;

  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'A sales invoice needs at least one product line';
  end if;

  v_number := coalesce(
    nullif(p_payload->>'invoice_number', ''),
    public.erp_next_document_number('sales_invoice', 'INV', v_date)
  );

  insert into public.erp_sales_invoices (
    invoice_number, distributor_id, chemist_id, invoice_date, is_interstate, remarks,
    created_by, updated_by
  ) values (
    v_number,
    v_distributor_id,
    v_chemist_id,
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

    select b.id, b.batch_number, b.current_quantity, b.expiry_date, p.product_name
      into v_batch
      from public.erp_product_batches b
      join public.erp_products p on p.id = b.product_id
     where b.id = (v_item->>'batch_id')::uuid
     for update of b;

    if not found then
      raise exception 'Batch % not found', v_item->>'batch_id';
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

    v_gross   := round(v_qty * (v_item->>'sale_rate')::numeric, 2);
    v_disc    := round(v_gross * coalesce((v_item->>'discount_percent')::numeric, 0) / 100, 2);
    v_taxable := v_gross - v_disc;
    v_tax     := round(v_taxable * coalesce((v_item->>'gst_rate')::numeric, 0) / 100, 2);
    v_line    := v_taxable + v_tax;

    insert into public.erp_sales_invoice_items (
      sales_invoice_id, product_id, batch_id, quantity, free_quantity,
      sale_rate, discount_percent, gst_rate, taxable_amount, tax_amount, line_total
    ) values (
      v_invoice, (v_item->>'product_id')::uuid, v_batch.id, v_qty, v_free,
      (v_item->>'sale_rate')::numeric,
      coalesce((v_item->>'discount_percent')::numeric, 0),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      v_taxable, v_tax, v_line
    );

    insert into public.erp_inventory_transactions (
      product_id, batch_id, transaction_type, reference_type, reference_id,
      quantity, unit_rate, transaction_date, remarks, created_by
    ) values (
      (v_item->>'product_id')::uuid, v_batch.id, 'SALE', 'SALES_INVOICE', v_invoice,
      -(v_qty + v_free), (v_item->>'sale_rate')::numeric, v_date,
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
