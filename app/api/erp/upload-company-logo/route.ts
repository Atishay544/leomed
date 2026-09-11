import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSameOrigin } from '@/lib/security/csrf'
import { getErpSession } from '@/lib/erp/auth'
import { can } from '@/lib/erp/permissions'
import { erpDb } from '@/lib/erp/data/query'

/**
 * Upload (or replace) the company logo shown on the printed sales invoice
 * header. Same pattern as /api/erp/upload-order-invoice, but admin-only
 * (settings.manage) — this is a company-wide document asset, not something
 * any MR submits. On success the uploaded file's public URL is written
 * straight to erp_settings.company_logo_url, so there is no separate "save"
 * step: uploading a new logo replaces the old one immediately.
 */

const BUCKET = 'company-assets'
// PNG/JPEG only — pdfkit (the invoice PDF renderer) can't decode WebP, and a
// format it silently can't draw would make the logo just as silently vanish
// off the printed invoice.
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB — a logo, not a photo

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
  if (!can(session.role, 'settings.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Invalid file type. Use PNG or JPG.' }, { status: 400 })
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'File too large. Max 2 MB.' }, { status: 400 })

  const admin = createAdminClient()

  let buffer: Uint8Array
  try {
    const [arrayBuffer] = await Promise.all([file.arrayBuffer(), ensureBucket(admin)])
    buffer = new Uint8Array(arrayBuffer)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload failed' }, { status: 500 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? 'png'
  const safeExt = ['png', 'jpg', 'jpeg'].includes(ext) ? ext : 'png'
  const fileName = `logo/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(fileName)

  const db = await erpDb()
  const { error: settingsError } = await db
    .from('erp_settings')
    .update({ company_logo_url: publicUrl })
    .eq('id', 1)
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 })

  return NextResponse.json({ url: publicUrl })
}
