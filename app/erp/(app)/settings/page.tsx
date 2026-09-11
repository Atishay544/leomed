import { requireCapability } from '@/lib/erp/auth'
import { getErpSettings } from '@/lib/erp/data/settings'
import { PageHeader } from '@/components/erp/ui'
import SettingsForm from './SettingsForm'
import BankAccountsSection from './BankAccountsSection'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  await requireCapability('settings.manage')
  const settings = await getErpSettings()

  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details and the business rules the system enforces."
      />
      <div className="max-w-3xl space-y-5">
        <SettingsForm settings={settings} />
        <BankAccountsSection selectedBankAccountId={settings.selected_bank_account_id} />
      </div>
    </>
  )
}
