'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { removeCompanyLogo } from '@/lib/erp/actions/admin'

/** Uploads (or replaces) the logo shown on the printed sales invoice
 *  header. Uploading writes straight to erp_settings.company_logo_url —
 *  there's no separate "save" step, matching how order-invoice photos and
 *  expense receipts already work in this app. */
export default function CompanyLogoUploader({ currentUrl }: { currentUrl: string | null }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/erp/upload-company-logo', { method: 'POST', body })
      const json = await res.json()
      if (res.ok) {
        setUrl(json.url as string)
        router.refresh()
      } else {
        setError(json.error ?? 'Could not upload the logo.')
      }
    } finally {
      setUploading(false)
    }
  }

  function onRemove() {
    if (!confirm('Remove the company logo from invoices?')) return
    setError(null)
    startTransition(async () => {
      const result = await removeCompanyLogo()
      if (result.ok) { setUrl(null); router.refresh() }
      else setError(result.error ?? 'Could not remove the logo.')
    })
  }

  return (
    <div className="sm:col-span-2">
      <label className="mb-1 block text-[12px] font-medium text-gray-700">Logo</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
          {url ? (
            <Image src={url} alt="Company logo" width={64} height={64} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-gray-300">No logo</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5
                         text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Uploading…' : url ? 'Replace logo' : 'Upload logo'}
            </button>
            {url && (
              <button
                type="button"
                onClick={onRemove}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5
                           text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400">PNG or JPG, up to 2 MB. Shown at the top of every printed invoice.</p>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      </div>
      <input
        ref={inputRef} type="file" accept="image/png,image/jpeg"
        onChange={onFileChange} className="hidden"
      />
    </div>
  )
}
