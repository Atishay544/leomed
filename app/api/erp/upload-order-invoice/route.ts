import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from '@/lib/security/csrf'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'

/**
 * Upload a photo of the real invoice an MR received for a field order. Same
 * pattern as /api/erp/upload-expense-receipt — gated by orders.create (any
 * MR who can take an order can submit proof of its invoice later).
 */

const BUCKET = 'order-invoices'
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

let bucketReady = false

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  if (bucketReady) return
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.some(b => b.id === BUCKET)) {
    const { error } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE,
      allowedMimeTypes: ALLOWED_TYPES,
    })
    if (error && !error.message.includes('already exists')) {
      throw new Error(`Failed to create bucket: ${error.message}`)
    }
  }
  bucketReady = true
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  const session = await getErpSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(session.role, 'orders.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, WebP or PDF.' }, { status: 400 })
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'File too large. Max 5 MB.' }, { status: 400 })

  const admin = createAdminClient()

  let buffer: Uint8Array
  try {
    const [arrayBuffer] = await Promise.all([file.arrayBuffer(), ensureBucket(admin)])
    buffer = new Uint8Array(arrayBuffer)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext) ? ext : 'jpg'
  const fileName = `${session.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(fileName)
  return NextResponse.json({ url: publicUrl })
}
