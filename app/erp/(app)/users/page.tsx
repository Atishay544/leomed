import { Users } from 'lucide-react'
import { requireCapability } from '@/lib/erp/auth'
import { listErpUsers } from '@/lib/erp/data/users'
import { PAGE_SIZE, parsePage } from '@/lib/erp/data/query'
import { createErpUser, setErpUserActive, updateErpUser } from '@/lib/erp/actions/admin'
import { ROLE_LABELS } from '@/lib/erp/permissions'
import { ERP_ROLES } from '@/lib/erp/types'
import { formatDate } from '@/lib/erp/format'
import type { FieldSpec } from '@/components/erp/form/Field'
import MasterFormDialog from '@/components/erp/MasterFormDialog'
import ToggleActiveButton from '@/components/erp/ToggleActiveButton'
import SearchBar from '@/components/erp/SearchBar'
import Pagination from '@/components/erp/Pagination'
import { FilterForm, FilterSelect } from '@/components/erp/FilterForm'
import { Badge, Card, EmptyState, PageHeader, TableWrap, Td, Th } from '@/components/erp/ui'

export const metadata = { title: 'Staff' }

const ROLE_OPTIONS = ERP_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))

const CREATE_FIELDS: FieldSpec[] = [
  { name: 'name',      label: 'Full name', required: true, span: 2 },
  { name: 'email',     label: 'Email (used to sign in)', type: 'email', required: true, span: 2 },
  {
    name: 'password', label: 'Temporary password', type: 'text', required: true, span: 2,
    hint: 'At least 8 characters. Share it securely and ask them to change it.',
  },
  { name: 'role',      label: 'Role', type: 'select', options: ROLE_OPTIONS, required: true },
  { name: 'mr_code',   label: 'MR code', hint: 'Required for medical representatives, e.g. MR001' },
  { name: 'phone',     label: 'Phone', type: 'tel' },
  { name: 'territory', label: 'Territory' },
]

const EDIT_FIELDS: FieldSpec[] = [
  { name: 'name',      label: 'Full name', required: true, span: 2 },
  { name: 'email',     label: 'Email', type: 'email', required: true, span: 2,
    hint: 'Changing this here does not change their sign-in address.' },
  { name: 'role',      label: 'Role', type: 'select', options: ROLE_OPTIONS, required: true },
  { name: 'mr_code',   label: 'MR code' },
  { name: 'phone',     label: 'Phone', type: 'tel' },
  { name: 'territory', label: 'Territory' },
  { name: 'active',    label: 'Account active', type: 'checkbox', placeholder: 'Can sign in', span: 2 },
]

const ROLE_STYLES: Record<string, string> = {
  ADMIN:      'bg-violet-50 text-violet-700 ring-violet-600/20',
  MR:         'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ACCOUNTANT: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  MANAGER:    'bg-amber-50 text-amber-700 ring-amber-600/20',
  VIEWER:     'bg-gray-100 text-gray-600 ring-gray-500/20',
}

interface Props {
  searchParams: Promise<{ q?: string; page?: string; role?: string; inactive?: string }>
}

export default async function StaffPage({ searchParams }: Props) {
  await requireCapability('users.manage')
  const params = await searchParams
  const page = parsePage(params.page)

  const { rows, total, pageCount } = await listErpUsers({
    q: params.q, page, role: params.role, includeInactive: true,
  })

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can sign in to the business portal, and what each of them may do."
        action={
          <MasterFormDialog
            action={createErpUser}
            fields={CREATE_FIELDS}
            title="Add a staff account"
            triggerLabel="Add staff"
            submitLabel="Create account"
          />
        }
      />

      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-gray-600">
          Staff accounts are created here only — there is no public sign-up for the portal.
          Accounts are deactivated rather than deleted, so past visits and invoices keep their author.
        </p>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <SearchBar placeholder="Name, email, MR code…" />
          <p className="text-[12px] text-gray-500">{total} {total === 1 ? 'account' : 'accounts'}</p>
        </div>
        <FilterForm action="/erp/users" hasFilters={!!params.role}>
          <FilterSelect name="role" label="Role" defaultValue={params.role}
                        options={ROLE_OPTIONS} allLabel="All roles" />
        </FilterForm>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No staff accounts match"
            description="Add an account to give someone access to the portal."
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>MR code</Th>
                  <Th>Territory</Th>
                  <Th>Added</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(user => (
                  <tr key={user.id} className={user.active ? 'hover:bg-gray-50/60' : 'bg-gray-50/50'}>
                    <Td>
                      <span className="font-medium text-gray-900">{user.name}</span>
                      {!user.active && (
                        <Badge className="ml-2 bg-gray-100 text-gray-500 ring-gray-400/20">Inactive</Badge>
                      )}
                    </Td>
                    <Td className="text-[12.5px] text-gray-600">{user.email}</Td>
                    <Td>
                      <Badge className={ROLE_STYLES[user.role] ?? ROLE_STYLES.VIEWER}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-[12px]">{user.mr_code ?? '—'}</Td>
                    <Td>{user.territory ?? '—'}</Td>
                    <Td className="text-[12px] text-gray-500">{formatDate(user.created_at)}</Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <MasterFormDialog
                          action={updateErpUser}
                          fields={EDIT_FIELDS}
                          title={`Edit ${user.name}`}
                          submitLabel="Save changes"
                          initial={user as unknown as Record<string, unknown>}
                          trigger={
                            <button type="button" className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50">
                              Edit
                            </button>
                          }
                        />
                        <ToggleActiveButton
                          id={user.id} active={user.active}
                          action={setErpUserActive} noun="account"
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}

        <Pagination
          page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE}
          searchParams={params} basePath="/erp/users"
        />
      </Card>
    </>
  )
}
