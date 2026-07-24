import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'


export async function POST(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { variants, skus, defaultVariantRef, ...productData } = body

  // Mark isDefault on the matching option + build processed variants
  const processedVariants = (variants ?? []).map((v: any) => ({
    ...v,
    options: (v.options ?? []).map((o: any) => ({
      ...o,
      isDefault: !!(defaultVariantRef &&
        v.name?.trim() === defaultVariantRef.variantName &&
        o.value === defaultVariantRef.optionValue),
    })),
  }))

  // Auto cover image: if no product images, use default option's first image
  let finalImages: string[] = productData.images ?? []
  if (finalImages.length === 0 && defaultVariantRef) {
    const defV = processedVariants.find((v: any) => v.name?.trim() === defaultVariantRef.variantName)
    const defO = defV?.options?.find((o: any) => o.value === defaultVariantRef.optionValue)
    if (Array.isArray(defO?.images) && defO.images.length > 0) finalImages = [defO.images[0]]
  }

  const { data: product, error } = await admin
    .from('products')
    .insert({
      name:          productData.name?.trim(),
      slug:          productData.slug?.trim(),
      description:   productData.description?.trim() || null,
      price:         parseFloat(productData.price),
      compare_price: productData.compare_price ? parseFloat(productData.compare_price) : null,
      stock:         parseInt(productData.stock, 10),
      weight_grams:  parseInt(productData.weight_grams, 10) || 500,
      category_id:   productData.category_id || null,
      is_active:     productData.is_active ?? true,
      images:        finalImages,
      video_url:     productData.video_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Save variants (needs product.id — must be sequential)
  if (processedVariants.length > 0 && product) {
    const rows = processedVariants
      .filter((v: any) => v.name?.trim() && v.options?.length > 0)
      .map((v: any) => ({
        product_id: product.id,
        name:       v.name.trim(),
        options:    v.options,
      }))
    if (rows.length > 0) {
      await admin.from('product_variants').insert(rows)
    }
  }

  // Save SKU combinations (stock per variant combo)
  if (skus && skus.length > 0 && product) {
    const skuRows = (skus as any[])
      .filter(s => s.attributes && typeof s.stock === 'number')
      .map(s => ({ product_id: product.id, attributes: s.attributes, stock: s.stock }))
    if (skuRows.length > 0) {
      await admin.from('product_skus').insert(skuRows)
    }
  }

  revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
  return NextResponse.json({ data: product })
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { id, variants, skus, defaultVariantRef, ...fields } = body

  // Mark isDefault + process variants for PATCH
  const processedVariants = variants !== undefined
    ? (variants as any[]).map((v: any) => ({
        ...v,
        options: (v.options ?? []).map((o: any) => ({
          ...o,
          isDefault: !!(defaultVariantRef &&
            v.name?.trim() === defaultVariantRef.variantName &&
            o.value === defaultVariantRef.optionValue),
        })),
      }))
    : undefined

  // Auto cover image on PATCH: if images array is empty, use default option's first image
  if (fields.images !== undefined && fields.images.length === 0 && defaultVariantRef && processedVariants) {
    const defV = processedVariants.find((v: any) => v.name?.trim() === defaultVariantRef.variantName)
    const defO = defV?.options?.find((o: any) => o.value === defaultVariantRef.optionValue)
    if (Array.isArray(defO?.images) && defO.images.length > 0) fields.images = [defO.images[0]]
  }

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const payload: Record<string, any> = {}
  if (fields.name          !== undefined) payload.name          = fields.name.trim()
  if (fields.slug          !== undefined) payload.slug          = fields.slug.trim()
  if (fields.description   !== undefined) payload.description   = fields.description?.trim() || null
  if (fields.price         !== undefined) payload.price         = parseFloat(fields.price)
  if (fields.compare_price !== undefined) payload.compare_price = fields.compare_price ? parseFloat(fields.compare_price) : null
  if (fields.stock         !== undefined) payload.stock         = parseInt(fields.stock, 10)
  if (fields.weight_grams  !== undefined) payload.weight_grams  = parseInt(fields.weight_grams, 10) || 500
  if (fields.category_id   !== undefined) payload.category_id   = fields.category_id || null
  if (fields.is_active     !== undefined) payload.is_active     = fields.is_active
  if (fields.images        !== undefined) payload.images        = fields.images
  if (fields.video_url     !== undefined) payload.video_url     = fields.video_url || null
  payload.updated_at = new Date().toISOString()

  // Precompute variant rows before parallel execution
  const variantRows = processedVariants !== undefined
    ? processedVariants
        .filter((v: any) => v.name?.trim() && v.options?.length > 0)
        .map((v: any) => ({ product_id: id, name: v.name.trim(), options: v.options }))
    : []

  // Parallel: update product fields + delete old variants + delete old skus
  const [{ error }, deleteVariants, deleteSkus] = await Promise.all([
    admin.from('products').update(payload).eq('id', id),
    processedVariants !== undefined
      ? admin.from('product_variants').delete().eq('product_id', id)
      : Promise.resolve({ error: null }),
    skus !== undefined
      ? admin.from('product_skus').delete().eq('product_id', id)
      : Promise.resolve({ error: null }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (deleteVariants?.error) return NextResponse.json({ error: deleteVariants.error.message }, { status: 400 })
  if (deleteSkus?.error) return NextResponse.json({ error: deleteSkus.error.message }, { status: 400 })

  // Insert new variants after delete completes
  if (processedVariants !== undefined && variantRows.length > 0) {
    await admin.from('product_variants').insert(variantRows)
  }

  // Insert new SKUs after delete completes
  if (skus !== undefined && skus.length > 0) {
    const skuRows = (skus as any[])
      .filter(s => s.attributes && typeof s.stock === 'number')
      .map(s => ({ product_id: id, attributes: s.attributes, stock: s.stock }))
    if (skuRows.length > 0) {
      await admin.from('product_skus').insert(skuRows)
    }
  }

  revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const { id } = await req.json()
  const { error } = await admin.from('products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('products'); revalidateTag('admin-products'); revalidateTag('admin-dashboard')
  return NextResponse.json({ success: true })
}
