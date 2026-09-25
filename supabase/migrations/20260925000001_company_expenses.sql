-- ============================================================================
-- Company-level expenses, recorded directly by admin/HR — rent, utilities,
-- subscriptions, and the like, as opposed to the field-force-oriented
-- categories (Travel, Fuel, Doctor Meeting, Samples...) this table was
-- originally built around.
--
-- No new table and no new column: erp_expenses already supports this shape
-- exactly as designed (see its own migration's comment — "the person who
-- recorded it: an MR's own travel, or an accountant logging a company-level
-- marketing spend under their own name"). What's missing is:
--   (a) categories that actually describe a company overhead cost, and
--   (b) a way for admin/HR to record one already-decided, rather than
--       filing a claim against themselves and then approving it — see the
--       new recordCompanyExpense() action (app layer, no migration needed
--       for that part): it inserts straight to status APPROVED, employee_id
--       = the admin/HR who logged it, approved_by = the same.
--
-- ALTER TYPE ... ADD VALUE is safe in the same file as later statements
-- that merely reference these values inside function/RLS text — the
-- same-transaction restriction only bites actual DML, and this migration
-- performs none (same reasoning as 20260907000011_payroll_bonus_item_type).
-- ============================================================================

alter type public.erp_expense_category add value if not exists 'RENT';
alter type public.erp_expense_category add value if not exists 'UTILITIES';
alter type public.erp_expense_category add value if not exists 'SUBSCRIPTION';
alter type public.erp_expense_category add value if not exists 'MAINTENANCE';
alter type public.erp_expense_category add value if not exists 'INSURANCE';
alter type public.erp_expense_category add value if not exists 'PROFESSIONAL_FEES';
alter type public.erp_expense_category add value if not exists 'BANK_CHARGES';
