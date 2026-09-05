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

  const { id } = await params
  const admin = createAdminClient()

  const [{ data: product }, { data: categories }, { data: healthConcerns }, { data: hcLinks }] = await Promise.all([
    admin.from('products')
      .select('id, name, slug, description, composition, category_id, is_active, images, video_url, merchandising_tag')
      .eq('id', id).single(),
    admin.from('categories').select('id, name').eq('taxonomy', 'product').order('name'),
    admin.from('categories').select('id, name').eq('taxonomy', 'health_concern').order('name'),
    admin.from('product_health_concerns').select('category_id').eq('product_id', id),
  ])

  if (!product) notFound()

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/products" className="text-sm text-gray-500 hover:text-gray-700">Products</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold text-gray-900 truncate">{product.name}</h1>
      </div>
      <ProductForm
        product={{
          ...product,
          description:  product.description ?? null,
          composition:  product.composition ?? null,
          images:       product.images ?? [],
          video_url:    product.video_url ?? null,
        }}
        categories={categories ?? []}
        healthConcerns={healthConcerns ?? []}
        initialHealthConcernIds={(hcLinks ?? []).map((l: any) => l.category_id)}
      />
    </div>
  )
}
