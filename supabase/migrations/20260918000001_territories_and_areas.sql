-- ============================================================================
-- TERRITORIES & AREAS — a real geography hierarchy, additive to (not a
-- replacement of) the existing free-text erp_users.territory /
-- erp_distributors.territory columns, which 20+ existing screens, reports
-- and target-scoping already depend on as plain strings. Rewriting all of
-- that to a foreign key is a much bigger, riskier change than what was
-- actually asked for here — this ships the new structure standalone; the
-- old free-text fields keep working exactly as before.
--
-- Model (from the actual request):
--   Territory  (e.g. "West Muzaffarnagar") -- one assigned Distributor.
--     -> a distributor can cover many territories (plain FK, many-to-one);
--        nothing here needs two distributors sharing one territory.
--   Area       (e.g. a locality within that territory) -- one assigned MR.
--     -> "few areas... assigned to MR Sagar" means the MR is assigned at
--        AREA granularity, not the whole territory at once, so one
--        territory's areas CAN be split across more than one MR if needed,
--        even though the example only ever shows one MR per territory.
-- ============================================================================

create table if not exists public.erp_territories (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  distributor_id uuid references public.erp_distributors(id) on delete set null,
  active         boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_territories_unique_name unique (name)
);

create index if not exists erp_territories_distributor_idx on public.erp_territories (distributor_id);

create table if not exists public.erp_areas (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  territory_id uuid not null references public.erp_territories(id) on delete cascade,
  mr_id        uuid references public.erp_users(id) on delete set null,
  active       boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint erp_areas_unique_name_per_territory unique (territory_id, name)
);

create index if not exists erp_areas_territory_idx on public.erp_areas (territory_id);
create index if not exists erp_areas_mr_idx        on public.erp_areas (mr_id);

drop trigger if exists erp_territories_touch on public.erp_territories;
create trigger erp_territories_touch before update on public.erp_territories
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_territories_audit on public.erp_territories;
create trigger erp_territories_audit
  after insert or update or delete on public.erp_territories
  for each row execute function public.erp_audit_trigger();

drop trigger if exists erp_areas_touch on public.erp_areas;
create trigger erp_areas_touch before update on public.erp_areas
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_areas_audit on public.erp_areas;
create trigger erp_areas_audit
  after insert or update or delete on public.erp_areas
  for each row execute function public.erp_audit_trigger();

-- ─── RLS: any staff member can read (visit/order screens will want to show
-- "your areas"); only admin defines the structure and assigns MRs/
-- distributors to it ─────────────────────────────────────────────────────

alter table public.erp_territories enable row level security;
alter table public.erp_areas       enable row level security;

drop policy if exists erp_territories_select on public.erp_territories;
create policy erp_territories_select on public.erp_territories
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_territories_write on public.erp_territories;
create policy erp_territories_write on public.erp_territories
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_areas_select on public.erp_areas;
create policy erp_areas_select on public.erp_areas
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_areas_write on public.erp_areas;
create policy erp_areas_write on public.erp_areas
  for all to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

revoke all on public.erp_territories, public.erp_areas from anon;
grant select, insert, update, delete on public.erp_territories to authenticated;
grant select, insert, update, delete on public.erp_areas       to authenticated;
