'use client'
import { createContext, useContext, useState, useMemo } from 'react'
import ProductGallery from './ProductGallery'

interface ImageCtx {
  activeImages: string[]
  defaultImages: string[]
  setActiveImages: (imgs: string[]) => void
}

const Ctx = createContext<ImageCtx>({
  activeImages: [],
  defaultImages: [],
  setActiveImages: () => {},
})

export function ProductImageProvider({
  defaultImages,
  initialImages,
  children,
}: {
  defaultImages: string[]
  initialImages?: string[]
  children: React.ReactNode
}) {
  const [activeImages, setActiveImages] = useState(
    initialImages && initialImages.length > 0 ? initialImages : defaultImages
  )
  const value = useMemo(
    () => ({ activeImages, defaultImages, setActiveImages }),
    [activeImages, defaultImages]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Gallery connected to context — replaces direct <ProductGallery> in page.tsx
export function ConnectedGallery({
  name,
  videoUrl,
}: {
  name: string
  videoUrl?: string | null
}) {
  const { activeImages } = useContext(Ctx)
  return <ProductGallery images={activeImages} name={name} videoUrl={videoUrl} />
}

export function useProductImages() {
  return useContext(Ctx)
}
