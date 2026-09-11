-- ============================================================================
-- Company phone/email (for the invoice letterhead), and bank accounts —
-- admin can keep several on file and picks one to actually appear on
-- printed sales invoices.
-- ============================================================================

alter table public.erp_settings
  add column if not exists company_phone text,
  add column if not exists company_email text;

create table if not exists public.erp_bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  bank_name           text not null check (length(trim(bank_name)) > 0),
  account_holder_name text not null check (length(trim(account_holder_name)) > 0),
  account_number      text not null check (length(trim(account_number)) > 0),
  ifsc_code           text not null check (length(trim(ifsc_code)) > 0),
  branch              text,
  upi_id              text,
  active     boolean not null default true,
  created_by uuid references public.erp_users(id) on delete set null,
  updated_by uuid references public.erp_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists erp_bank_accounts_touch on public.erp_bank_accounts;
create trigger erp_bank_accounts_touch before update on public.erp_bank_accounts
  for each row execute function public.erp_touch_updated_at();

drop trigger if exists erp_bank_accounts_audit on public.erp_bank_accounts;
create trigger erp_bank_accounts_audit
  after insert or update or delete on public.erp_bank_accounts
  for each row execute function public.erp_audit_trigger();

-- Which one (if any) is currently printed on sales invoices. on delete set
-- null so removing a bank account never breaks erp_settings' single row.
alter table public.erp_settings
  add column if not exists selected_bank_account_id uuid references public.erp_bank_accounts(id) on delete set null;

-- ─── RLS: any staff member can read (they print invoices); only admin
-- manages the list and picks which one is selected ─────────────────────────

alter table public.erp_bank_accounts enable row level security;

drop policy if exists erp_bank_accounts_select on public.erp_bank_accounts;
create policy erp_bank_accounts_select on public.erp_bank_accounts
  for select to authenticated using (public.erp_is_staff());

drop policy if exists erp_bank_accounts_write on public.erp_bank_accounts;
create policy erp_bank_accounts_write on public.erp_bank_accounts
  for insert to authenticated with check (public.erp_is_admin());

drop policy if exists erp_bank_accounts_update on public.erp_bank_accounts;
create policy erp_bank_accounts_update on public.erp_bank_accounts
  for update to authenticated using (public.erp_is_admin()) with check (public.erp_is_admin());

drop policy if exists erp_bank_accounts_delete on public.erp_bank_accounts;
create policy erp_bank_accounts_delete on public.erp_bank_accounts
  for delete to authenticated using (public.erp_is_admin());

revoke all on public.erp_bank_accounts from anon;
grant select, insert, update, delete on public.erp_bank_accounts to authenticated;

-- One-time seed of the phone/email actually in use — only where not already
-- set, so a value the admin later changes here is never clobbered by a
-- re-run of this file.
update public.erp_settings
set company_phone = coalesce(company_phone, '+91 63986 97503'),
    company_email = coalesce(company_email, 'leomedpharma1@gmail.com')
where id = 1;
