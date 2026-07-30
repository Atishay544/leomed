import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import MembershipPlanForm from './MembershipPlanForm'

export const metadata = { title: 'Care Plan Membership' }

export default async function MembershipPage() {
  await requireAdmin()
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('membership_plans')
    .select('id, name, price, duration_months, free_shipping, discount_pct, is_active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { count: activeMembers } = await admin
    .from('user_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Care Plan Membership</h1>
      <p className="text-sm text-gray-500 mb-6">{activeMembers ?? 0} active member{activeMembers === 1 ? '' : 's'}</p>

      <div className="max-w-md">
        {plan ? (
          <MembershipPlanForm plan={{ ...plan, price: Number(plan.price), discount_pct: Number(plan.discount_pct) }} />
        ) : (
          <p className="text-gray-400">No membership plan found — run the membership migration first.</p>
        )}
      </div>
    </div>
  )
}
