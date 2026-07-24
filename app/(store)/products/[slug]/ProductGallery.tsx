'use client'
import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'

interface Props {
  images: string[]
  name: string
  videoUrl?: string | null
}

export default function ProductGallery({ images, name, videoUrl }: Props) {
  // Slides: video first (if present), then images
  type Slide = { kind: 'image'; src: string } | { kind: 'video'; src: string }
  const slides: Slide[] = [
    ...(videoUrl ? [{ kind: 'video' as const, src: videoUrl }] : []),
    ...images.map(src => ({ kind: 'image' as const, src })),
  ]

  const [active, setActive] = useState(0)

  if (slides.length === 0) {
    return (
      <div className="aspect-3/4 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300 text-8xl select-none">
        📦
      </div>
    )
  }

  const prev = () => setActive(i => (i - 1 + slides.length) % slides.length)
  const next = () => setActive(i => (i + 1) % slides.length)
  const current = slides[active]

  return (
    <div className="flex gap-3">
      {/* Thumbnail strip — left side */}
      {slides.length > 1 && (
        <div className="hidden sm:flex flex-col gap-2 w-18 shrink-0">
          {slides.map((slide, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`aspect-square rounded-xl overflow-hidden border-2 transition-all relative ${
                active === i ? 'border-gray-900 shadow-sm' : 'border-transparent hover:border-gray-300'
              }`}
            >
              {slide.kind === 'video' ? (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                  <Play size={20} className="text-white fill-white" />
                </div>
              ) : (
                <Image
                  src={slide.src}
                  alt={`${name} ${i + 1}`}
                  width={72}
                  height={72}
                  className="object-cover w-full h-full"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Main panel */}
      <div className="flex-1 relative">
        <div className="aspect-3/4 relative rounded-2xl overflow-hidden bg-gray-100 select-none">
          {current.kind === 'video' ? (
            <video
              key={current.src}
              src={current.src}
              controls
              autoPlay={false}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          ) : (
            <Image
              src={current.src}
              alt={`${name} — ${active + 1}`}
              fill
              className="object-cover"
              priority={active === 0}
            />
          )}

          {/* Nav arrows (mobile) */}
          {slides.length > 1 && (
            <>
              <button
                onClick={prev}
                className="sm:hidden absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={next}
                className="sm:hidden absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Dot indicators (mobile) */}
          {slides.length > 1 && (
            <div className="sm:hidden absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    active === i ? 'bg-white w-4' : 'bg-white/50 w-1.5'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Counter */}
        {slides.length > 1 && (
          <p className="text-center text-xs text-gray-400 mt-2">
            {active + 1} / {slides.length}
            {current.kind === 'video' && <span className="ml-1 text-gray-500">· Video</span>}
          </p>
        )}
      </div>
    </div>
  )
}
