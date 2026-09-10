import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import ProductForm from '../ProductForm'

export const metadata = { title: 'New Product' }

export default async function NewProductPage() {
  await requireAdmin()
  const supabase = createAdminClient()

  const [{ data: categories }, { data: healthConcerns }, { data: erpProducts }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('taxonomy', 'product').order('name'),
    supabase.from('categories').select('id, name').eq('taxonomy', 'health_concern').order('name'),
    supabase.from('erp_products')
      .select('id, product_name, product_code, generic_name, category, composition, uses, mrp, pack_size, unit')
      .eq('active', true).order('product_name'),
  ])

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/products" className="text-sm text-gray-500 hover:text-gray-700">Products</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
      </div>
      <ProductForm categories={categories ?? []} healthConcerns={healthConcerns ?? []} erpProducts={erpProducts ?? []} />
    </div>
  )
}
