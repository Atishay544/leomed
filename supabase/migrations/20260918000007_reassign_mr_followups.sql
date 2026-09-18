-- Reassigning an MR's territories/areas (20260918000002) moves geography,
-- but a departing MR's pending follow-ups stay tied to them by mr_id and
-- don't move on their own — a real gap once someone actually leaves. This
-- adds an optional third step to the same action: move that MR's still-
-- PENDING follow-ups over too. Completed/cancelled ones are history and
-- correctly stay attributed to whoever actually did the work.
--
-- Drop first: adding a parameter changes the function's identity — without
-- this, CREATE OR REPLACE would add a second, ambiguous overload rather
-- than replacing the two-argument original.

drop function if exists public.erp_reassign_mr(uuid, uuid);

create or replace function public.erp_reassign_mr(
  p_from_mr uuid,
  p_to_mr   uuid,
  p_move_pending_followups boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_territories integer;
  v_areas       integer;
  v_followups   integer := 0;
begin
  if not (public.erp_is_admin() or public.erp_is_hr()) then
    raise exception 'Only an administrator or HR may reassign areas' using errcode = 'insufficient_privilege';
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

  if p_move_pending_followups then
    update public.erp_followups set mr_id = p_to_mr
     where mr_id = p_from_mr and status = 'PENDING';
    get diagnostics v_followups = row_count;
  end if;

  return jsonb_build_object(
    'territories_reassigned', v_territories,
    'areas_reassigned', v_areas,
    'followups_reassigned', v_followups
  );
end;
$$;

revoke all on function public.erp_reassign_mr(uuid, uuid, boolean) from public;
grant execute on function public.erp_reassign_mr(uuid, uuid, boolean) to authenticated;
