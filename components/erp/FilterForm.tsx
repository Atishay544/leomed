import Link from 'next/link'
import { Filter, X } from 'lucide-react'

/**
 * Filters as a plain GET form: no client JavaScript, every filtered view is a
 * shareable URL, and it still works if the bundle hasn't loaded on a weak
 * connection. Filtering itself happens in PostgreSQL (spec §55).
 */
export function FilterForm({
  action, children, hasFilters,
}: {
  action: string
  children: React.ReactNode
  hasFilters?: boolean
}) {
  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end gap-2.5 border-b border-gray-100 px-4 py-3"
    >
      {children}
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2
                   text-[12.5px] font-semibold text-white transition hover:bg-gray-800"
      >
        <Filter size={13} /> Apply
      </button>
      {hasFilters && (
        <Link
          href={action}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white
                     px-3 py-2 text-[12.5px] font-medium text-gray-600 transition hover:bg-gray-50"
        >
          <X size={13} /> Clear
        </Link>
      )}
    </form>
  )
}

const controlClass =
  'rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-[12.5px] text-gray-900 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 focus:outline-none'

export function FilterDate({
  name, label, defaultValue,
}: {
  name: string
  label: string
  defaultValue?: string
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="mb-1 block text-[11px] font-medium text-gray-500">
        {label}
      </label>
      <input id={`f-${name}`} type="date" name={name} defaultValue={defaultValue ?? ''} className={controlClass} />
    </div>
  )
}

export function FilterSelect({
  name, label, defaultValue, options, allLabel = 'All',
}: {
  name: string
  label: string
  defaultValue?: string
  options: { value: string; label: string }[]
  allLabel?: string
}) {
  return (
    <div>
      <label htmlFor={`f-${name}`} className="mb-1 block text-[11px] font-medium text-gray-500">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue ?? ''} className={controlClass}>
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
