'use client'
import { useEffect, useRef, useState } from 'react'

export interface SkuRow {
  attributes: Record<string, string>  // e.g. { Color: 'Red', Size: 'S' }
  stock: number
}

interface VariantOption { value: string; images: string[] }
interface Variant { name: string; options: VariantOption[] }

interface Props {
  variants: Variant[]
  value: SkuRow[]
  onChange: (skus: SkuRow[]) => void
}

// Cartesian product of all variant option values
function cartesian(variants: Variant[]): Record<string, string>[] {
  const filled = variants.filter(v => v.name.trim() && v.options.length > 0)
  if (filled.length === 0) return []
  return filled.reduce<Record<string, string>[]>(
    (acc, v) =>
      acc.flatMap(combo =>
        v.options.map(opt => ({ ...combo, [v.name]: opt.value }))
      ),
    [{}]
  )
}

function comboKey(attrs: Record<string, string>) {
  return Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|')
}

export default function SkuMatrix({ variants, value, onChange }: Props) {
  const combos = cartesian(variants)

  // Merge incoming value (preserves stock when variants re-typed)
  const [rows, setRows] = useState<SkuRow[]>(() => {
    const map = new Map(value.map(r => [comboKey(r.attributes), r.stock]))
    return combos.map(attrs => ({ attributes: attrs, stock: map.get(comboKey(attrs)) ?? 0 }))
  })

  // Always keep a ref to the latest rows so the effect below never reads a stale closure
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  // Re-sync when variants change (new combo set)
  useEffect(() => {
    const newCombos = cartesian(variants)
    const map = new Map(rowsRef.current.map(r => [comboKey(r.attributes), r.stock]))
    const next = newCombos.map(attrs => ({ attributes: attrs, stock: map.get(comboKey(attrs)) ?? 0 }))
    setRows(next)
    onChange(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(variants.map(v => ({ name: v.name, opts: v.options.map(o => o.value) })))])

  if (combos.length === 0) return null

  function updateStock(key: string, stock: number) {
    const next = rows.map(r => comboKey(r.attributes) === key ? { ...r, stock } : r)
    setRows(next)
    onChange(next)
  }

  const variantNames = variants.filter(v => v.name.trim() && v.options.length > 0).map(v => v.name)
  const totalStock = rows.reduce((s, r) => s + r.stock, 0)

  return (
    <div className="space-y-3">
      {/* Total badge */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {variantNames.length === 1
            ? `Enter pieces available for each ${variantNames[0]}`
            : `Enter pieces available per ${variantNames.join(' + ')} combination`}
        </p>
        <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
          {totalStock} pcs total
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {variantNames.map(name => (
                <th key={name} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">
                  {name}
                </th>
              ))}
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 w-32">
                Pieces in stock
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => {
              const key = comboKey(row.attributes)
              return (
                <tr key={key} className={`hover:bg-gray-50 transition-colors ${row.stock === 0 ? 'bg-red-50/30' : ''}`}>
                  {variantNames.map(name => (
                    <td key={name} className="px-4 py-2.5">
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {row.attributes[name]}
                      </span>
                    </td>
                  ))}
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={row.stock === 0 ? '' : row.stock}
                        placeholder="0"
                        onChange={e => updateStock(key, Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className={`w-28 text-right border rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                          row.stock === 0 ? 'border-red-200 bg-red-50 placeholder-red-300' : 'border-gray-300'
                        }`}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.some(r => r.stock === 0) && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ Options with 0 pieces will show as &ldquo;Out of Stock&rdquo; on the product page.
        </p>
      )}
    </div>
  )
}
