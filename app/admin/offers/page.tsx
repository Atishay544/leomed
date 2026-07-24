import { requireAdmin } from '@/lib/admin-auth'
import { getAdminOffers } from '@/lib/admin-data'
import OfferForm from './OfferForm'
import OfferActions from './OfferActions'

export const metadata = { title: 'Offers' }

export default async function OffersPage() {
  await requireAdmin()
  const offers = await getAdminOffers()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
      <p className="text-sm text-gray-500 -mt-6">Offers appear on the product page and checkout. COD Upfront offers show an auto-calculated payment breakdown.</p>

      <OfferForm />

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
          Existing Offers ({offers?.length ?? 0})
        </h2>
        {(!offers || offers.length === 0) ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 py-12 text-center text-gray-400 text-sm">
            No offers yet. Create one above.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Title</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Details</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map(offer => (
                    <tr key={offer.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {offer.title}
                        {offer.description && <p className="text-xs text-gray-400 mt-0.5">{offer.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs capitalize">{offer.type}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {offer.type === 'cod_upfront'
                          ? `Pay ${offer.upfront_pct}% upfront → ${offer.discount_pct}% off rest`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          offer.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {offer.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <OfferActions offerId={offer.id} isActive={offer.is_active} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
