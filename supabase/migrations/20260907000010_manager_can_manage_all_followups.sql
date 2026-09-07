-- ============================================================================
-- LEOMED PHARMA ERP — FIX: MANAGER holds followups.manage but could not
-- actually update anyone's follow-up but their own.
--
-- Found via a full systematic audit cross-checking every RLS policy against
-- permissions.ts (requested directly, after the earlier round of role-
-- capability bugs). Unlike the other fixes this session, this is not a
-- security leak — it's the opposite: the app already correctly renders the
-- follow-up "Action" control for a MANAGER on every MR's row (they hold
-- visits.read.all too), and app/erp/(app)/mr/followups/page.tsx +
-- lib/erp/actions/visits.ts already handle an RLS-silent-filtered update
-- gracefully ("That follow-up could not be found, or you cannot change
-- it.") — but that message fires for every follow-up a Manager doesn't own,
-- which defeats the point of granting them followups.manage at all.
--
-- erp_followups' SELECT policy already lets ADMIN+MANAGER see every row
-- (erp_can_read_all_field()); the UPDATE policy never matched it — only the
-- owning MR or an admin. This widens UPDATE to the same scope as SELECT,
-- matching what followups.manage in permissions.ts already promises. The
-- column-scoped grant (followup_date, description, priority, status,
-- completed_at, updated_by) from 20260905000004 is unchanged — a manager
-- still cannot touch who/what a follow-up is about, only its workflow
-- fields, exactly like the owning MR.
-- ============================================================================

drop policy if exists erp_followups_update on public.erp_followups;
create policy erp_followups_update on public.erp_followups
  for update to authenticated
  using (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field())
  with check (mr_id = public.erp_current_user_id() or public.erp_can_read_all_field());
