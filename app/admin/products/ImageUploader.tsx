'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { Upload, X, GripVertical, Loader2 } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (urls: string[]) => void
  maxImages?: number
}

export default function ImageUploader({ value, onChange, maxImages = 5 }: Props) {
  const [draggingOver, setDraggingOver] = useState(false)
  const [uploading, setUploading] = useState<string[]>([]) // file names being uploaded
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  // For drag-to-reorder
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  async function uploadFile(file: File): Promise<string | null> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/admin/upload-image', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Upload failed')
    return data.url
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const remaining = maxImages - value.length
    if (remaining <= 0) {
      setErrors([`Maximum ${maxImages} images allowed.`])
      return
    }
    const toUpload = arr.slice(0, remaining)
    setErrors([])
    setUploading(toUpload.map(f => f.name))

    const results = await Promise.allSettled(toUpload.map(uploadFile))
    const newUrls: string[] = []
    const newErrors: string[] = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) newUrls.push(r.value)
      else newErrors.push(`${toUpload[i].name}: ${(r as PromiseRejectedResult).reason?.message ?? 'Failed'}`)
    })

    setUploading([])
    setErrors(newErrors)
    if (newUrls.length) onChange([...value, ...newUrls])
  }, [value, onChange, maxImages])

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  function removeImage(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  // Drag-to-reorder
  function onDragStart(index: number) { dragItem.current = index }
  function onDragEnterReorder(index: number) { dragOver.current = index }
  function onDragEndReorder() {
    if (dragItem.current === null || dragOver.current === null) return
    const arr = [...value]
    const [moved] = arr.splice(dragItem.current, 1)
    arr.splice(dragOver.current, 0, moved)
    onChange(arr)
    dragItem.current = null
    dragOver.current = null
  }

  const canAdd = value.length < maxImages && uploading.length === 0

  return (
    <div className="space-y-3">
      {/* Image previews */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url, i) => (
            <div
              key={url + i}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragEnter={() => onDragEnterReorder(i)}
              onDragEnd={onDragEndReorder}
              onDragOver={e => e.preventDefault()}
              className="relative group w-24 h-24 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-grab active:cursor-grabbing"
            >
              <Image src={url} alt={`Product image ${i + 1}`} fill className="object-cover" />
              {/* Reorder handle */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded p-0.5">
                <GripVertical size={12} className="text-white" />
              </div>
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-red-600 rounded-full p-0.5"
              >
                <X size={12} className="text-white" />
              </button>
              {/* Primary badge */}
              {i === 0 && (
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
                  Main
                </span>
              )}
            </div>
          ))}

          {/* Uploading placeholders */}
          {uploading.map(name => (
            <div key={name} className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1">
              <Loader2 size={18} className="text-gray-400 animate-spin" />
              <span className="text-[10px] text-gray-400 text-center px-1 truncate w-full text-center">{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {canAdd && (
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
          onDragLeave={() => setDraggingOver(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            draggingOver
              ? 'border-gray-900 bg-gray-50'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
        >
          <Upload size={24} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm font-medium text-gray-700">
            Drop images here or <span className="text-gray-900 underline">browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            JPG, PNG, WebP or GIF · Max 5 MB each · Up to {maxImages} images
          </p>
          <p className="text-xs text-gray-400">
            {value.length}/{maxImages} uploaded · Drag to reorder
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
        </div>
      )}

      {uploading.length > 0 && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Uploading {uploading.length} file{uploading.length > 1 ? 's' : ''}…
        </p>
      )}

      {errors.map((e, i) => (
        <p key={i} className="text-xs text-red-600">{e}</p>
      ))}
    </div>
  )
}
