'use client'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useState } from 'react'

export default function SearchInput({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)

  return (
    <form onSubmit={e => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(value)}`) }}
      className="flex items-center gap-3 border-2 border-gray-900 rounded-2xl px-4 py-3 max-w-xl mx-auto">
      <Search size={20} className="text-gray-400 shrink-0" />
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search products, categories…"
        className="flex-1 outline-none text-base bg-transparent"
      />
      <button type="submit"
        className="bg-black text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
        Search
      </button>
    </form>
  )
}
