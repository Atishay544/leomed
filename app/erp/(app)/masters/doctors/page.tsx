import { UserRound } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listDoctors, PAGE_SIZE } from '@/lib/erp/data/masters'
import { getErpSettings, withinEditWindow } from '@/lib/erp/data/settings'
import { parsePage } from '@/lib/erp/data/query'
import { saveDoctor, setDoctorActive } from '@/lib/erp/actions/masters'
import { DOCTOR_FIELDS } from '@/components/erp/master-fields'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import {
  Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th,
} from '@/components/erp/ui'

export const metadata = { title: 'Doctors' }

interface Props {
  searchParams: Promise<{ q?: string; page?: string; territory?: string; inactive?: string }>
}

export default async function DoctorsPage({ searchParams }: Props) {
  const session = await requireCapability('masters.read')
  const params = await searchParams
  const page = parsePage(params.page)

  const [{ rows, total, pageCount }, settings] = await Promise.all([
    listDoctors({
      q: params.q,
      page,
      territory: params.territory,
      includeInactive: params.inactive === '1',
    }),
    getErpSettings(),
  ])

  const isAdmin = session.role === 'ADMIN'
  const canAdd = session.role === 'ADMIN' || session.role === 'MR'

  return (
    <>
      <PageHeader
        title="Doctors"
        description="Shared company master. Any MR can visit any doctor — there is no permanent assignment."
        action={canAdd && (
          <MasterFormDialog
            action={saveDoctor}
            fields={DOCTOR_FIELDS}
            title="Add doctor"
            triggerLabel="Add doctor"
            submitLabel="Save doctor"
          />
        )}
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Name, phone, clinic, area…" />
          <p className="text-[12px] text-gray-500">
            {total} {total === 1 ? 'doctor' : 'doctors'}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={params.q ? 'No doctors match that search' : 'No doctors yet'}
            description={
              params.q
                ? 'Try a shorter search — part of a name, a phone number, or an area.'
                : 'Doctors are added here, or automatically when an MR records a visit to someone new.'
            }
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[880px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Doctor</Th>
                  <Th>Specialisation</Th>
                  <Th>Clinic</Th>
                  <Th>Area / City</Th>
                  <Th>Phone</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(doctor => {
                  const canEdit = isAdmin || (
                    doctor.created_by === session.id &&
                    withinEditWindow(doctor.created_at, settings.mr_edit_window_hours)
                  )
                  return (
                    <tr key={doctor.id} className="hover:bg-gray-50/60">
                      <Td className="font-mono text-[11.5px] text-gray-500">{doctor.doctor_code}</Td>
                      <Td>
                        <span className="font-medium text-gray-900">{doctor.doctor_name}</span>
                        {!doctor.active && <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>}
                        {doctor.created_from_visit_id && (
                          <Badge className="ml-2 bg-blue-50 text-blue-700 ring-blue-600/20">From visit</Badge>
                        )}
                        {doctor.qualification && (
                          <p className="mt-0.5 text-[11.5px] text-gray-400">{doctor.qualification}</p>
                        )}
                      </Td>
                      <Td>{doctor.specialization ?? '—'}</Td>
                      <Td>{doctor.clinic_name ?? '—'}</Td>
                      <Td>
                        {[doctor.area, doctor.city].filter(Boolean).join(', ') || '—'}
                        {doctor.territory && (
                          <p className="mt-0.5 text-[11.5px] text-gray-400">{doctor.territory}</p>
                        )}
                      </Td>
                      <Td className="tabular-nums">{doctor.phone ?? '—'}</Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit && (
                            <MasterFormDialog
                              action={saveDoctor}
                              fields={DOCTOR_FIELDS}
                              title={`Edit ${doctor.doctor_name}`}
                              submitLabel="Save changes"
                              initial={doctor as unknown as Record<string, unknown>}
                              trigger={
                                <button
                                  type="button"
                                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1
                                             text-[12px] font-medium text-gray-700 transition hover:bg-gray-50"
                                >
                                  Edit
                                </button>
                              }
                            />
                          )}
                          {isAdmin && (
                            <ToggleActiveButton
                              id={doctor.id}
                              active={doctor.active}
                              action={setDoctorActive}
                              noun="doctor"
                            />
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={PAGE_SIZE}
          searchParams={params}
          basePath="/erp/masters/doctors"
        />
      </Card>
    </>
  )
}
