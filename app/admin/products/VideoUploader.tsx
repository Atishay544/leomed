'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, X, Loader2, Video } from 'lucide-react'

interface Props {
  value: string | null
  onChange: (url: string | null) => void
}

export default function VideoUploader({ value, onChange }: Props) {
  const [draggingOver, setDraggingOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setError('')
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/admin/upload-video', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      onChange(data.url)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }, [onChange])

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-sm">
          <video
            src={value}
            controls
            className="w-full h-full object-contain"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-black/60 hover:bg-red-600 rounded-full p-1 transition-colors"
          >
            <X size={14} className="text-white" />
          </button>
        </div>
        <p className="text-xs text-gray-400">Click × to remove and upload a different video</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
        onDragLeave={() => setDraggingOver(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          uploading ? 'border-gray-300 bg-gray-50 cursor-wait'
          : draggingOver ? 'border-gray-900 bg-gray-50 cursor-copy'
          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 cursor-pointer'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="text-gray-400 animate-spin" />
            <p className="text-sm text-gray-500">Uploading video…</p>
          </div>
        ) : (
          <>
            <Video size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">
              Drop video here or <span className="text-gray-900 underline">browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">MP4, WebM or MOV · Max 100 MB</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
        className="hidden"
        onChange={onFileChange}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
