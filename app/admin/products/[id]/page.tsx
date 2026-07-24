import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin-auth'
import ProductForm from '../ProductForm'

export const metadata = { title: 'Edit Product' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: PageProps) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { id } = await params
  const admin = createAdminClient()

  const [{ data: product }, { data: categories }, { data: variantRows }, { data: skuRows }] = await Promise.all([
    admin.from('products')
      .select('id, name, slug, description, price, compare_price, stock, weight_grams, category_id, is_active, images, video_url')
      .eq('id', id).single(),
    admin.from('categories').select('id, name').order('name'),
    admin.from('product_variants').select('id, name, options').eq('product_id', id),
    admin.from('product_skus').select('attributes, stock').eq('product_id', id),
  ])

  if (!product) notFound()

  const initialVariants = (variantRows ?? []).map((v: any) => ({
    name:        v.name,
    optionInput: '',
    options:     (Array.isArray(v.options) ? v.options : []).map((o: any) =>
      typeof o === 'string'
        ? { value: o, images: [] }
        : { value: String(o.value ?? ''), images: Array.isArray(o.images) ? o.images : [] }
    ),
  }))

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/products" className="text-sm text-gray-500 hover:text-gray-700">Products</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900 truncate">{product.name}</h1>
      </div>
      <ProductForm
        initialSkus={(skuRows ?? []).map((s: any) => ({ attributes: s.attributes, stock: Number(s.stock) }))}
        product={{
          ...product,
          description:   product.description ?? null,
          compare_price: product.compare_price ? Number(product.compare_price) : null,
          price:         Number(product.price),
          weight_grams:  product.weight_grams ? Number(product.weight_grams) : 500,
          images:        product.images ?? [],
          video_url:     product.video_url ?? null,
        }}
        categories={categories ?? []}
        initialVariants={initialVariants}
      />
    </div>
  )
}
