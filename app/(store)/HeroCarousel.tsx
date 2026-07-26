'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Banner {
  id: string
  display_style: string | null
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_url: string | null
  link_text: string | null
  bg_color: string | null
  text_color: string | null
}

export default function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)
  // Hero height auto-matches the real banner artwork ratio (set from the first
  // image that loads) so it hugs the banner exactly — no top/bottom bars, no crop.
  const [ratio, setRatio] = useState('2048 / 1143')
  const count = banners.length

  const next = useCallback(() => {
    setDirection(1)
    setCurrent(c => (c + 1) % count)
  }, [count])

  const prev = () => {
    setDirection(-1)
    setCurrent(c => (c - 1 + count) % count)
  }

  const goTo = (i: number) => {
    setDirection(i > current ? 1 : -1)
    setCurrent(i)
  }

  useEffect(() => {
    if (count <= 1) return
    const t = setInterval(next, 5000)
    return () => clearInterval(t)
  }, [count, next])

  // ── Fallback (no banners) ─────────────────────────────────────────────────
  if (count === 0) {
    return (
      <section className="relative w-full overflow-hidden text-white max-h-[88vh] min-h-60" style={{ aspectRatio: '2048 / 1143' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #1f6b46 0%, #145c3a 55%, #0a1f14 100%)' }} />
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] mb-4 opacity-60">Trusted Online Pharmacy</p>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold mb-4 leading-tight tracking-tight">OTC Medicines &amp; Wellness</h1>
          <p className="text-base md:text-lg mb-8 opacity-70 max-w-lg mx-auto">Genuine products, fast delivery across India</p>
          <Link href="/products"
            className="inline-flex items-center gap-2 border-2 border-white/80 text-white px-8 py-3.5 rounded-full font-semibold hover:bg-white hover:text-emerald-800 transition-all duration-300 active:scale-95">
            Shop Now
          </Link>
        </div>
      </section>
    )
  }

  const slide = banners[current]
  const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]
  const variants = {
    enter:  (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { duration: 0.55, ease } },
    exit:   (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0, transition: { duration: 0.45, ease } }),
  }

  return (
    // Full-bleed; the container ratio is set from the real banner image so the
    // hero hugs the artwork exactly on every device — no side crop, no bars.
    <section className="relative w-full overflow-hidden max-h-[88vh]" style={{ aspectRatio: ratio }}>

      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={slide.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0"
        >
          <SlideRenderer slide={slide} onRatio={setRatio} />
        </motion.div>
      </AnimatePresence>

      {/* ── Arrows ── */}
      {count > 1 && (
        <>
          <button onClick={prev} aria-label="Previous banner"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/25 hover:bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-all duration-200 hover:scale-110 active:scale-95">
            <ChevronLeft size={20} />
          </button>
          <button onClick={next} aria-label="Next banner"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/25 hover:bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-all duration-200 hover:scale-110 active:scale-95">
            <ChevronRight size={20} />
          </button>

          {/* ── Dots ── */}
          <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
            {banners.map((b, i) => (
              <button key={b.id} onClick={() => goTo(i)} aria-label={`Go to slide ${i + 1}`}
                className={`rounded-full transition-all duration-300 ${
                  i === current
                    ? 'w-6 h-2 sm:w-7 sm:h-2.5 bg-white shadow-sm'
                    : 'w-2 h-2 sm:w-2.5 sm:h-2.5 bg-white/40 hover:bg-white/70'
                }`} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ── Slide renderer ─────────────────────────────────────────────────────────────
function SlideRenderer({ slide, onRatio }: { slide: Banner; onRatio?: (r: string) => void }) {
  const style = slide.display_style ?? 'overlay'
  const bg    = slide.bg_color   ?? '#145c3a'
  const color = slide.text_color ?? '#ffffff'
  const link  = slide.link_url   ?? '/products'

  // Report the natural W/H of the banner so the hero can hug it exactly
  const reportRatio = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget
    if (t.naturalWidth && t.naturalHeight) onRatio?.(`${t.naturalWidth} / ${t.naturalHeight}`)
  }

  // ── Image Only ──────────────────────────────────────────────────────────────
  if (style === 'image_only') {
    return (
      <Link href={link} className="block relative w-full h-full group">
        {slide.image_url
          ? <Image src={slide.image_url} alt="banner" fill
              sizes="100vw"
              onLoad={reportRatio}
              className="object-cover"
              priority />
          : <div className="w-full h-full bg-gray-200" />}
      </Link>
    )
  }

  // ── Solid Color ──────────────────────────────────────────────────────────────
  if (style === 'solid') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 sm:px-12"
        style={{ backgroundColor: bg, color }}>
        {slide.title && (
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold mb-3 sm:mb-4 leading-tight tracking-tight">
            {slide.title}
          </h1>
        )}
        {slide.subtitle && (
          <p className="text-sm sm:text-base md:text-xl mb-6 sm:mb-8 opacity-80 max-w-xl">{slide.subtitle}</p>
        )}
        {slide.link_text && (
          <Link href={link}
            className="inline-flex items-center gap-2 border-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full font-semibold hover:opacity-80 transition-all duration-200 active:scale-95 text-sm sm:text-base"
            style={{ borderColor: color, color }}>
            {slide.link_text}
          </Link>
        )}
      </div>
    )
  }

  // ── Smoky Overlay (default) ──────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center text-center px-6 sm:px-12 overflow-hidden"
      style={{ backgroundColor: bg, color }}>
      {slide.image_url && (
        <Image src={slide.image_url} alt={slide.title ?? 'banner'} fill
          sizes="100vw"
          onLoad={reportRatio}
          className="object-cover opacity-40"
          priority />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent" />
      <div className="relative z-10 max-w-3xl mx-auto">
        {slide.title && (
          <h1 className="text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold mb-3 sm:mb-4 leading-tight tracking-tight drop-shadow-lg"
            style={{ color }}>
            {slide.title}
          </h1>
        )}
        {slide.subtitle && (
          <p className="text-sm sm:text-base md:text-xl mb-6 sm:mb-8 opacity-90 max-w-xl mx-auto drop-shadow"
            style={{ color }}>
            {slide.subtitle}
          </p>
        )}
        {slide.link_text && (
          <Link href={link}
            className="inline-flex items-center gap-2 border-2 px-6 sm:px-8 py-3 sm:py-3.5 rounded-full font-semibold text-sm sm:text-base backdrop-blur-sm hover:bg-white hover:text-gray-900 transition-all duration-300 active:scale-95"
            style={{ borderColor: color, color }}>
            {slide.link_text}
          </Link>
        )}
      </div>
    </div>
  )
}
