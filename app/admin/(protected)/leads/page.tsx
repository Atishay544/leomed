import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'

export const metadata = { title: 'Leads' }

type Lead = { id: string; email: string | null; phone: string | null; source: string; created_at: string }

export default async function LeadsPage() {
  await requireAdmin()
  const supabase = createAdminClient()

  const { data: leads } = await (supabase as any)
    .from('leads')
    .select('id, email, phone, source, created_at')
    .order('created_at', { ascending: false })
    .limit(200) as { data: Lead[] | null }

  const rows = leads ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <span className="text-sm text-gray-500">{rows.length} total</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400 text-sm">
          No leads yet. They appear here after visitors submit the welcome popup.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">#</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Source</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Captured</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lead, i) => (
                  <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {lead.email
                        ? <a href={`mailto:${lead.email}`} className="hover:underline text-blue-600">{lead.email}</a>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {lead.phone
                        ? <a href={`tel:${lead.phone}`} className="hover:underline text-blue-600">{lead.phone}</a>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(lead.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
