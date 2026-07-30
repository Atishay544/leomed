import Link from 'next/link'
import { requireUser } from '@/lib/user-auth'
import AccountForm from './AccountForm'

export default async function AccountPage() {
  const { user, supabase } = await requireUser('/account')

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name,phone,avatar_url')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_memberships')
      .select('expires_at, discount_pct_snapshot, membership_plans(name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>

      {membership ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6">
          <p className="font-semibold text-emerald-900 text-sm">
            {(membership.membership_plans as any)?.name ?? 'Care Plan'} — Active
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            {membership.discount_pct_snapshot}% off every order · valid until{' '}
            {new Date(membership.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      ) : (
        <Link href="/care-plan"
          className="block bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-6 hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
          <p className="font-semibold text-gray-900 text-sm">Join Care Plan</p>
          <p className="text-xs text-gray-500 mt-0.5">Get member-only discounts on every order →</p>
        </Link>
      )}

      <AccountForm
        userId={user.id}
        email={user.email ?? ''}
        defaultName={profile?.full_name ?? ''}
        defaultPhone={profile?.phone ?? ''}
      />
    </div>
  )
}
