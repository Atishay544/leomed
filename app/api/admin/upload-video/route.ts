import { NextRequest, NextResponse } from 'next/server'
import { adminGuard } from '@/lib/security/admin-guard'

const BUCKET = 'product-videos'
const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
const MAX_SIZE = 100 * 1024 * 1024 // 100 MB

let bucketReady = false

async function ensureBucket(admin: any) {
  if (bucketReady) return
  const { data: buckets } = await admin.storage.listBuckets()
  if (!buckets?.some((b: any) => b.id === BUCKET)) {
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
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: 'Invalid file type. Use MP4, WebM, MOV or AVI.' }, { status: 400 })
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: 'File too large. Max 100 MB.' }, { status: 400 })

  let buffer: Uint8Array
  try {
    const [arrayBuffer] = await Promise.all([file.arrayBuffer(), ensureBucket(admin)])
    buffer = new Uint8Array(arrayBuffer)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const ext = file.type === 'video/quicktime' ? 'mov'
    : file.type === 'video/webm' ? 'webm'
    : file.type === 'video/x-msvideo' ? 'avi'
    : 'mp4'

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(`products/${fileName}`, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(`products/${fileName}`)
  return NextResponse.json({ url: publicUrl })
}
