-- ============================================================================
-- Tiered/flat incentive rates on secondary sales (submitted field-order
-- invoices), admin-configurable — defaulting company-wide, overridable per
-- MR with either that MR's own bracket ladder or a single flat rate that
-- bypasses tiers entirely.
--
-- Bracket calculation is NOT slab-wise/marginal: whichever bracket the
-- TOTAL secondary sales falls into sets the rate for the WHOLE amount, not
-- just the portion inside that bracket (confirmed as the intended design).
--
-- Resolution order for one MR's period:
--   1. flat_percentage on erp_mr_incentive_settings, if set — bypasses
--      tiers entirely.
--   2. that MR's own rows in erp_incentive_tiers (mr_id = the MR).
--   3. the company-wide default rows (mr_id is null).
--   4. nothing configured for that bracket at all → 0%, source NONE.
--
-- This only ever produces a SUGGESTION (erp_incentive_suggestion()) for the
-- existing Incentives & Bonus screen to show — admin still reviews and
-- clicks Save there, exactly like every other secondary-sales-derived
-- figure in this system, which is deliberately rough until someone checks
-- it (spec: MR-submitted invoice proof is itself unverified until review).
-- ============================================================================

create extension if not exists btree_gist;

create table if not exists public.erp_incentive_tiers (
  id           uuid primary key default gen_random_uuid(),
  -- null = a company-wide default bracket; set = overrides the default for
  -- that one MR only.
  mr_id        uuid references public.erp_users(id) on delete cascade,
  min_amount   numeric(14,2) not null check (min_amount >= 0),
  -- null = no upper bound ("above ₹200,000").
  max_amount   numeric(14,2),
  percentage   numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  -- '[)': min inclusive, max exclusive — so "50,000 to 100,000" and
  -- "100,000 to 150,000" meet exactly at 100,000 with no gap or overlap,
  -- matching how the brackets were specified (from X, less than Y).
  range        numrange generated always as (numrange(min_amount, max_amount, '[)')) stored,
  created_by   uuid references public.erp_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.erp_users(id) on delete set null,
  updated_at   timestamptz not null default now(),

  constraint erp_incentive_tiers_range_valid check (max_amount is null or max_amount > min_amount),
  -- No two brackets in the same scope (same MR, or both company-wide) may
  -- overlap — enforced at the database, not just careful admin data entry.
  exclude using gist (
    coalesce(mr_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    range with &&
  )
);

create index if not exists erp_incentive_tiers_mr_idx on public.erp_incentive_tiers (mr_id);

drop trigger if exists erp_incentive_tiers_touch on public.erp_incentive_tiers;
create trigger erp_incentive_tiers_touch before update on public.erp_incentive_tiers
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_incentive_tiers_audit on public.erp_incentive_tiers;
create trigger erp_incentive_tiers_audit
  after insert or update or delete on public.erp_incentive_tiers
  for each row execute function public.erp_audit_trigger();

-- ─── Per-MR flat-rate override — bypasses tiers entirely when set ──────────

create table if not exists public.erp_mr_incentive_settings (
  mr_id           uuid primary key references public.erp_users(id) on delete cascade,
  flat_percentage numeric(5,2) check (flat_percentage is null or (flat_percentage >= 0 and flat_percentage <= 100)),
  updated_by      uuid references public.erp_users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

drop trigger if exists erp_mr_incentive_settings_touch on public.erp_mr_incentive_settings;
create trigger erp_mr_incentive_settings_touch before update on public.erp_mr_incentive_settings
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_mr_incentive_settings_audit on public.erp_mr_incentive_settings;
create trigger erp_mr_incentive_settings_audit
  after insert or update or delete on public.erp_mr_incentive_settings
  for each row execute function public.erp_audit_trigger();

-- ─── RLS: admin-only both ways — same boundary as payroll.manage ───────────

alter table public.erp_incentive_tiers       enable row level security;
alter table public.erp_mr_incentive_settings enable row level security;

drop policy if exists erp_incentive_tiers_all on public.erp_incentive_tiers;
create policy erp_incentive_tiers_all on public.erp_incentive_tiers
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_mr_incentive_settings_all on public.erp_mr_incentive_settings;
create policy erp_mr_incentive_settings_all on public.erp_mr_incentive_settings
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

revoke all on public.erp_incentive_tiers       from anon;
revoke all on public.erp_mr_incentive_settings from anon;
grant select, insert, update, delete on public.erp_incentive_tiers       to authenticated;
grant select, insert, update, delete on public.erp_mr_incentive_settings to authenticated;

-- ─── Suggestion calculation ─────────────────────────────────────────────────

create or replace function public.erp_incentive_suggestion(
  p_mr_id uuid,
  p_from  date,
  p_to    date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_flat       numeric;
  v_percentage numeric := 0;
  v_source     text := 'NONE';
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may view incentive suggestions'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(reported_invoice_amount), 0) into v_sales
    from public.erp_field_orders
   where mr_id = p_mr_id and invoice_status = 'SUBMITTED'
     and order_date between p_from and p_to;

  select flat_percentage into v_flat
    from public.erp_mr_incentive_settings
   where mr_id = p_mr_id;

  if v_flat is not null then
    v_percentage := v_flat;
    v_source := 'FLAT';
  else
    select percentage into v_percentage
      from public.erp_incentive_tiers
     where mr_id = p_mr_id and range @> v_sales
     limit 1;

    if found then
      v_source := 'MR_TIER';
    else
      select percentage into v_percentage
        from public.erp_incentive_tiers
       where mr_id is null and range @> v_sales
       limit 1;

      if found then
        v_source := 'DEFAULT_TIER';
      else
        v_percentage := 0;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'secondary_sales',  v_sales,
    'percentage',       v_percentage,
    'incentive_amount', round(v_sales * v_percentage / 100, 2),
    'source',           v_source
  );
end;
$$;

revoke all on function public.erp_incentive_suggestion(uuid, date, date) from public;
grant execute on function public.erp_incentive_suggestion(uuid, date, date) to authenticated;
