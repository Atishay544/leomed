import { requireUser } from '@/lib/user-auth'
import AccountForm from './AccountForm'

export default async function AccountPage() {
  const { user, supabase } = await requireUser('/account')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name,phone,avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
      <AccountForm
        userId={user.id}
        email={user.email ?? ''}
        defaultName={profile?.full_name ?? ''}
        defaultPhone={profile?.phone ?? ''}
      />
    </div>
  )
}
