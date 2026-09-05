'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { saveSettings } from '@/lib/erp/actions/admin'
import { IDLE } from '@/lib/erp/actions/shared'
import type { ErpSettings } from '@/lib/erp/types'

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px]
                 font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Saving…' : 'Save settings'}
    </button>
  )
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function SettingsForm({ settings }: { settings: ErpSettings }) {
  const [state, formAction] = useActionState(saveSettings, IDLE)

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-800">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
          Settings saved.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">Company</h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="company_name" className="mb-1 block text-[12px] font-medium text-gray-700">
              Company name
            </label>
            <input id="company_name" name="company_name" required
                   defaultValue={settings.company_name} className={inputClass} />
          </div>
          <div>
            <label htmlFor="company_gst_number" className="mb-1 block text-[12px] font-medium text-gray-700">
              GST number
            </label>
            <input id="company_gst_number" name="company_gst_number"
                   defaultValue={settings.company_gst_number ?? ''} className={inputClass} />
          </div>
          <div>
            <label htmlFor="company_drug_license" className="mb-1 block text-[12px] font-medium text-gray-700">
              Drug licence number
            </label>
            <input id="company_drug_license" name="company_drug_license"
                   defaultValue={settings.company_drug_license ?? ''} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="company_address" className="mb-1 block text-[12px] font-medium text-gray-700">
              Address
            </label>
            <textarea id="company_address" name="company_address" rows={2}
                      defaultValue={settings.company_address ?? ''} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">Stock &amp; expiry</h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="expiry_warning_days" className="mb-1 block text-[12px] font-medium text-gray-700">
              Flag batches expiring within (days)
            </label>
            <input id="expiry_warning_days" name="expiry_warning_days" type="number" min={1} max={730}
                   defaultValue={settings.expiry_warning_days} className={inputClass} />
            <p className="mt-1 text-[11.5px] text-gray-400">
              Drives the &quot;expiring soon&quot; counts on the dashboard and batch screens.
            </p>
          </div>
          <div>
            <label htmlFor="financial_year_start_month" className="mb-1 block text-[12px] font-medium text-gray-700">
              Financial year starts in
            </label>
            <select id="financial_year_start_month" name="financial_year_start_month"
                    defaultValue={String(settings.financial_year_start_month)} className={inputClass}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <p className="mt-1 text-[11.5px] text-gray-400">
              Used in invoice and order numbers, e.g. INV/2026-27/00001.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
              <input type="checkbox" name="allow_expired_sale" defaultChecked={settings.allow_expired_sale}
                     className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/30" />
              <span>
                <span className="block text-[13px] font-medium text-amber-900">
                  Allow expired stock to be sold
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-amber-800">
                  Off by default. While off, any sales invoice line using an expired batch is
                  refused by the database. Turn this on only for a deliberate exception.
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-[14px] font-semibold text-gray-900">Field force</h2>
        <div>
          <label htmlFor="mr_edit_window_hours" className="mb-1 block text-[12px] font-medium text-gray-700">
            MRs can edit their own records for (hours)
          </label>
          <input id="mr_edit_window_hours" name="mr_edit_window_hours" type="number" min={0} max={720}
                 defaultValue={settings.mr_edit_window_hours}
                 className={`${inputClass} sm:max-w-xs`} />
          <p className="mt-1 text-[11.5px] leading-relaxed text-gray-400">
            After this window a visit, order or customer record an MR created becomes read-only to
            them; administrators are never restricted. Set to 0 to make records read-only
            immediately. Enforced by the database, not just the interface.
          </p>
        </div>
      </section>

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  )
}
