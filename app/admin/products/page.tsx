import Link from 'next/link'
import Image from 'next/image'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminProducts } from '@/lib/admin-data'
import ProductActions from './ProductActions'

export const metadata = { title: 'Products' }

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}

export default async function ProductsPage({ searchParams }: PageProps) {
  await requireAdmin()

  const params         = await searchParams
  const q              = params.q?.trim() ?? ''
  const categoryFilter = params.category ?? ''
  const page           = Math.max(1, parseInt(params.page ?? '1', 10))
  const from           = (page - 1) * PAGE_SIZE

  const { categories, products, count } = await getAdminProducts(q, categoryFilter, page)

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <Link
          href="/admin/products/new"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          + New Product
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by name..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-45 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <select
          name="category"
          defaultValue={categoryFilter}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Categories</option>
          {categories?.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Filter
        </button>
        {(q || categoryFilter) && (
          <Link
            href="/admin/products"
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Desktop table (md+) */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Product</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Category</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Price</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Stock</th>
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products?.map(product => (
                <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/products/${product.id}`} className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                        {(product as any).images?.[0] ? (
                          <Image
                            src={(product as any).images[0]}
                            alt={product.name}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg text-gray-300">📦</div>
                        )}
                      </div>
                      <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                        {product.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {(product.categories as any)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ₹{Number(product.price).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const skus = (product as any).product_skus as { stock: number }[] | null
                      const effectiveStock = skus && skus.length > 0
                        ? skus.reduce((sum, s) => sum + s.stock, 0)
                        : product.stock
                      return (
                        <span className={effectiveStock < 10 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                          {effectiveStock}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {product.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ProductActions
                      productId={product.id}
                      isActive={product.is_active}
                      productName={product.name}
                    />
                  </td>
                </tr>
              ))}
              {(!products || products.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {from + 1}–{Math.min(from + PAGE_SIZE, count ?? 0)} of {count} products
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/products?q=${q}&category=${categoryFilter}&page=${page - 1}`}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/products?q=${q}&category=${categoryFilter}&page=${page + 1}`}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile card list (< md) */}
      <div className="md:hidden space-y-3">
        {(!products || products.length === 0) && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
            No products found.
          </div>
        )}
        {products?.map(product => {
          const skus = (product as any).product_skus as { stock: number }[] | null
          const effectiveStock = skus && skus.length > 0
            ? skus.reduce((sum: number, s: { stock: number }) => sum + s.stock, 0)
            : product.stock
          return (
            <div key={product.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                  {(product as any).images?.[0] ? (
                    <Image
                      src={(product as any).images[0]}
                      alt={product.name}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg text-gray-300">📦</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/admin/products/${product.id}`} className="font-semibold text-gray-900 hover:text-blue-600 text-sm line-clamp-2">
                    {product.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">{(product.categories as any)?.name ?? 'No category'}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {product.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Price</p>
                    <p className="text-sm font-bold text-gray-900">₹{Number(product.price).toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Stock</p>
                    <p className={`text-sm font-semibold ${effectiveStock < 10 ? 'text-red-600' : 'text-gray-700'}`}>{effectiveStock}</p>
                  </div>
                </div>
                <ProductActions
                  productId={product.id}
                  isActive={product.is_active}
                  productName={product.name}
                />
              </div>
            </div>
          )
        })}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-gray-500">
              Showing {from + 1}–{Math.min(from + PAGE_SIZE, count ?? 0)} of {count}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/admin/products?q=${q}&category=${categoryFilter}&page=${page - 1}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Previous</Link>
              )}
              {page < totalPages && (
                <Link href={`/admin/products?q=${q}&category=${categoryFilter}&page=${page + 1}`} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Next</Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
