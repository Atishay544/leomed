import { adminGuard } from '@/lib/security/admin-guard'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, revalidatePath } from 'next/cache'

export async function PATCH(req: NextRequest) {
  const guard = await adminGuard(req)
  if (guard instanceof NextResponse) return guard
  const { admin } = guard

  const body = await req.json()
  const { error } = await admin.from('about_content').update({
    title:      body.title?.trim(),
    body:       body.body ?? '',
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  revalidateTag('about')
  revalidateTag('admin-about')
  revalidatePath('/about')
  return NextResponse.json({ success: true })
}
