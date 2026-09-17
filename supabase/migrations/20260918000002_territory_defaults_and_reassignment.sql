-- ============================================================================
-- Two follow-ups to territories/areas (20260918000001):
--
-- 1. An MR can now be assigned at the WHOLE-TERRITORY level too, not only
--    per-area. An area's own mr_id, when set, overrides its territory's;
--    when null, it follows the territory's default. Same override
--    relationship is added for distributor_id on Area, so "change the
--    distributor for some areas" (an area-level override) and "...or a
--    whole territory" (just editing the territory) are both possible —
--    symmetric with how MR assignment already works.
--
-- 2. Bulk reassignment — an MR leaving the company, or a distributor being
--    replaced for everything currently pointing at them — without hand-
--    editing every territory and area one at a time.
-- ============================================================================

alter table public.erp_territories
  add column if not exists mr_id uuid references public.erp_users(id) on delete set null;

alter table public.erp_areas
  add column if not exists distributor_id uuid references public.erp_distributors(id) on delete set null;

create index if not exists erp_territories_mr_idx    on public.erp_territories (mr_id);
create index if not exists erp_areas_distributor_idx on public.erp_areas (distributor_id);

-- ─── Bulk reassignment ──────────────────────────────────────────────────────

create or replace function public.erp_reassign_mr(p_from_mr uuid, p_to_mr uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_territories integer;
  v_areas       integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may reassign areas' using errcode = 'insufficient_privilege';
  end if;
  if p_from_mr is null or p_to_mr is null then
    raise exception 'Choose both an MR to reassign from and an MR to reassign to';
  end if;
  if p_from_mr = p_to_mr then
    raise exception 'Choose a different MR to reassign to';
  end if;

  update public.erp_territories set mr_id = p_to_mr where mr_id = p_from_mr;
  get diagnostics v_territories = row_count;

  update public.erp_areas set mr_id = p_to_mr where mr_id = p_from_mr;
  get diagnostics v_areas = row_count;

  return jsonb_build_object('territories_reassigned', v_territories, 'areas_reassigned', v_areas);
end;
$$;

create or replace function public.erp_reassign_distributor(p_from_distributor uuid, p_to_distributor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_territories integer;
  v_areas       integer;
begin
  if not public.erp_is_admin() then
    raise exception 'Only an administrator may reassign territories' using errcode = 'insufficient_privilege';
  end if;
  if p_from_distributor is null or p_to_distributor is null then
    raise exception 'Choose both a distributor to reassign from and a distributor to reassign to';
  end if;
  if p_from_distributor = p_to_distributor then
    raise exception 'Choose a different distributor to reassign to';
  end if;

  update public.erp_territories set distributor_id = p_to_distributor where distributor_id = p_from_distributor;
  get diagnostics v_territories = row_count;

  update public.erp_areas set distributor_id = p_to_distributor where distributor_id = p_from_distributor;
  get diagnostics v_areas = row_count;

  return jsonb_build_object('territories_reassigned', v_territories, 'areas_reassigned', v_areas);
end;
$$;

revoke all on function public.erp_reassign_mr(uuid, uuid) from public;
grant execute on function public.erp_reassign_mr(uuid, uuid) to authenticated;

revoke all on function public.erp_reassign_distributor(uuid, uuid) from public;
grant execute on function public.erp_reassign_distributor(uuid, uuid) to authenticated;
