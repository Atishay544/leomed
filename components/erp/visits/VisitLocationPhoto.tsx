'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { Camera, Loader2, MapPin, X } from 'lucide-react'

/**
 * Proof-of-visit capture: a camera photo and the device's current GPS fix,
 * both taken by the MR on the spot rather than typed in later. Optional —
 * a weak signal or a locked-down phone must not block saving the visit.
 */

export interface LocationPhotoValue {
  photoUrl: string | null
  latitude: number | null
  longitude: number | null
}

interface Props {
  value: LocationPhotoValue
  onChange: (value: LocationPhotoValue) => void
}

export default function VisitLocationPhoto({ value, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/erp/upload-visit-photo', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not upload the photo.')
      onChange({ ...value, photoUrl: json.url as string })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload the photo.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function captureLocation() {
    setError(null)
    if (!('geolocation' in navigator)) {
      setError('Location is not available on this device.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        onChange({
          ...value,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
        setLocating(false)
      },
      err => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied. Enable it in your browser settings to attach a location.'
            : 'Could not get your current location.',
        )
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-[12px] text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />

        {value.photoUrl ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200">
            <Image src={value.photoUrl} alt="Visit photo" fill sizes="80px" className="object-cover" />
            <button
              type="button"
              onClick={() => onChange({ ...value, photoUrl: null })}
              aria-label="Remove photo"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5
                       text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
            {uploading ? 'Uploading…' : 'Add photo'}
          </button>
        )}

        <button
          type="button"
          onClick={captureLocation}
          disabled={locating}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] font-medium
                      disabled:opacity-60 ${
                        value.latitude != null
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
        >
          {locating ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
          {locating
            ? 'Getting location…'
            : value.latitude != null
              ? 'Location captured'
              : 'Capture current location'}
        </button>
      </div>

      {value.latitude != null && value.longitude != null && (
        <p className="text-[11.5px] text-gray-500">
          {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
        </p>
      )}
    </div>
  )
}
