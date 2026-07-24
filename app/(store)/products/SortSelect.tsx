'use client'
import { useRouter, useSearchParams } from 'next/navigation'

const options = [
  { value: 'newest',     label: 'Newest' },
  { value: 'popular',    label: 'Popular' },
  { value: 'price_asc',  label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
]

export default function SortSelect({ current }: { current: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('sort', e.target.value)
    sp.delete('page')
    router.push(`/products?${sp.toString()}`)
  }

  return (
    <select
      defaultValue={current}
      onChange={handleChange}
      className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
