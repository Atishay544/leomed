import { requireUser } from '@/lib/user-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AddressList from './AddressList'

export default async function AddressesPage() {
  const { user, supabase } = await requireUser('/account/addresses')

  // Fetch both in parallel — no waterfall
  const admin = createAdminClient()
  const [{ data: addresses }, { data: recentOrders }] = await Promise.all([
    supabase
      .from('addresses')
      .select('id,full_name,phone,line1,line2,city,state,pincode,is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),

    // Pull last 5 orders' shipping addresses for auto-suggest
    admin
      .from('orders')
      .select('id,shipping_address,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Deduplicate order addresses by phone number (most unique field)
  const seenPhones = new Set<string>()
  const savedPhones = new Set((addresses ?? []).map(a => a.phone?.replace(/\D/g, '')))

  const orderAddresses = (recentOrders ?? [])
    .map(o => o.shipping_address as Record<string, string> | null)
    .filter((addr): addr is Record<string, string> => !!addr && !!addr.phone)
    .filter(addr => {
      const phone = addr.phone.replace(/\D/g, '')
      // Skip if already saved in addresses table or duplicate in this list
      if (seenPhones.has(phone) || savedPhones.has(phone)) return false
      seenPhones.add(phone)
      return true
    })
    .map(addr => ({
      full_name: addr.name ?? addr.full_name ?? '',
      phone:     addr.phone ?? '',
      line1:     addr.line1 ?? '',
      line2:     addr.line2 ?? null,
      city:      addr.city ?? '',
      state:     addr.state ?? '',
      pincode:   addr.pincode ?? addr.zip ?? '',
    }))

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Saved Addresses</h1>
      <AddressList
        addresses={addresses ?? []}
        orderAddresses={orderAddresses}
        userId={user.id}
      />
    </div>
  )
}
