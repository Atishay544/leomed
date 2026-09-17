-- Adding an enum value must not share a transaction with anything that uses
-- it (Postgres forbids reading a new enum value in the transaction that
-- added it) — so this is its own migration, with every policy/function
-- change that references 'HR' following in 20260918000006_hr_role.sql.

alter type public.erp_role add value if not exists 'HR';
