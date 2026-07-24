'use client'
import { useState, useEffect, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  productId: string
  size?: 'sm' | 'md'
  className?: string
}

export default function WishlistButton({ productId, size = 'md', className = '' }: Props) {
  const [inWishlist, setInWishlist]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [animating, setAnimating]     = useState(false)
  const router = useRouter()

  const iconSize = size === 'sm' ? 15 : 18

  const check = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('wishlist_items')
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .maybeSingle()
    setInWishlist(!!data)
    setLoading(false)
  }, [productId])

  useEffect(() => { check() }, [check])

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?next=' + encodeURIComponent(window.location.pathname))
      return
    }

    setAnimating(true)
    setTimeout(() => setAnimating(false), 300)

    if (inWishlist) {
      await supabase
        .from('wishlist_items')
        .delete()
        .eq('product_id', productId)
        .eq('user_id', user.id)
      setInWishlist(false)
    } else {
      await supabase
        .from('wishlist_items')
        .insert({ product_id: productId, user_id: user.id })
      setInWishlist(true)
    }
  }

  if (loading) {
    return (
      <button className={`flex items-center justify-center rounded-full ${size === 'sm' ? 'w-7 h-7' : 'w-10 h-10'} ${className}`} disabled>
        <Heart size={iconSize} className="text-gray-300" />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      className={`flex items-center justify-center rounded-full transition-all duration-200 ${
        size === 'sm' ? 'w-7 h-7' : 'w-10 h-10'
      } ${
        inWishlist
          ? 'bg-red-50 text-red-500 hover:bg-red-100'
          : 'bg-white text-gray-400 hover:text-red-400 hover:bg-red-50 shadow-sm border border-gray-100'
      } ${animating ? 'scale-125' : 'scale-100'} ${className}`}
    >
      <Heart
        size={iconSize}
        className="transition-all duration-200"
        fill={inWishlist ? 'currentColor' : 'none'}
        strokeWidth={2}
      />
    </button>
  )
}
