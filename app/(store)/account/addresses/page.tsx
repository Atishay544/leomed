import { requireUser } from '@/lib/user-auth'
import AddressList from './AddressList'

export default async function AddressesPage() {
  const { user, supabase } = await requireUser('/account/addresses')

  const { data: addresses } = await supabase
    .from('addresses')
    .select('id,full_name,phone,line1,line2,city,state,pincode,is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Saved Addresses</h1>
      <AddressList
        addresses={addresses ?? []}
        userId={user.id}
      />
    </div>
  )
}
