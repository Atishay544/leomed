'use client'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function WishlistRemoveButton({ wishlistItemId }: { wishlistItemId: string }) {
  const router = useRouter()

  async function remove() {
    const supabase = createClient()
    await supabase.from('wishlist_items').delete().eq('id', wishlistItemId)
    router.refresh()
  }

  return (
    <button onClick={remove}
      className="absolute top-2 right-2 z-10 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center text-gray-500 hover:text-red-500 transition">
      <X size={14} />
    </button>
  )
}
