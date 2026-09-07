import { CalendarOff, Target } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { getAttendanceRules, listHolidays, listMrAttendanceTargets } from '@/lib/erp/data/attendance'
import { listMrs } from '@/lib/erp/data/users'
import { deleteHoliday, deleteMrAttendanceTarget, saveHoliday, saveMrAttendanceTarget } from '@/lib/erp/actions/attendance'
import { HOLIDAY_FIELDS, mrTargetFields } from '@/components/erp/master-fields'
import { formatDate } from '@/lib/erp/format'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import DeleteRowButton from '@/components/erp/DeleteRowButton'
import { Card, CardHeader, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'
import AttendanceRulesForm from './AttendanceRulesForm'

export const metadata = { title: 'Attendance Rules' }

export default async function AttendanceRulesPage() {
  await requireCapability('attendance.manage')

  const [rules, targets, holidays, mrs] = await Promise.all([
    getAttendanceRules(),
    listMrAttendanceTargets(),
    listHolidays(),
    listMrs(),
  ])

  const mrOptions = mrs.map(m => ({ value: m.id, label: `${m.mr_code ?? ''} ${m.name}`.trim() }))
  const overriddenIds = new Set(targets.map(t => t.mr_id))
  const availableMrOptions = mrOptions.filter(o => !overriddenIds.has(o.value))

  return (
    <>
      <PageHeader title="Attendance Rules" description="Configurable, company-wide attendance policy — nothing here is hard-coded." />

      <div className="max-w-3xl">
        <AttendanceRulesForm rules={rules} />
      </div>

      <div className="mt-8 max-w-3xl">
        <Card padded={false}>
          <CardHeader
            title="Per-MR visit targets"
            action={availableMrOptions.length > 0 && (
              <MasterFormDialog
                action={saveMrAttendanceTarget}
                fields={mrTargetFields(availableMrOptions)}
                title="Set an MR's visit target"
                triggerLabel="Add override"
                submitLabel="Save"
              />
            )}
          />
          <p className="border-b border-gray-100 px-5 py-2.5 text-[12px] text-gray-500">
            Overrides the global defaults above for one MR. Never applies to non-MR employees.
          </p>
          {targets.length === 0 ? (
            <EmptyState icon={Target} title="No individual overrides" description="Every MR uses the global default targets." />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[520px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>MR</Th>
                    <Th align="right">Doctor visits</Th>
                    <Th align="right">Chemist visits</Th>
                    <Th align="right">Remove</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {targets.map(t => (
                    <tr key={t.mr_id}>
                      <Td>
                        <span className="font-medium text-gray-900">{t.erp_users?.name ?? '—'}</span>
                        {t.erp_users?.mr_code && <span className="ml-1.5 font-mono text-[11px] text-gray-400">{t.erp_users.mr_code}</span>}
                      </Td>
                      <Td align="right" className="tabular-nums">{t.required_doctor_visits}</Td>
                      <Td align="right" className="tabular-nums">{t.required_chemist_visits}</Td>
                      <Td align="right">
                        <DeleteRowButton
                          id={t.mr_id}
                          action={deleteMrAttendanceTarget}
                          confirmText="Remove this MR's individual target? They will fall back to the global default."
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="mt-8 max-w-3xl">
        <Card padded={false}>
          <CardHeader
            title="Holidays"
            action={
              <MasterFormDialog
                action={saveHoliday}
                fields={HOLIDAY_FIELDS}
                title="Add a holiday"
                triggerLabel="Add holiday"
                submitLabel="Save"
              />
            }
          />
          {holidays.length === 0 ? (
            <EmptyState icon={CalendarOff} title="No holidays configured" />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[420px]">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Date</Th>
                    <Th>Name</Th>
                    <Th align="right">Remove</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holidays.map(h => (
                    <tr key={h.id}>
                      <Td>{formatDate(h.holiday_date)}</Td>
                      <Td>{h.name}</Td>
                      <Td align="right">
                        <DeleteRowButton id={h.id} action={deleteHoliday} confirmText={`Remove "${h.name}"?`} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
