'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Loader2, Search, UserPlus, X, AlertTriangle } from 'lucide-react'
import { Field, type FieldSpec } from '../form/Field'

/**
 * Choose an existing doctor/chemist, or create one right here.
 *
 * This component carries the "new vs existing" requirement (spec §18). The
 * distinction is not inferred later from a creation date — the mode the MR was
 * in when they saved is what the server records, which is why the form reports
 * `mode` rather than just an id.
 *
 * Before a new record is created it warns about likely duplicates (spec §44),
 * because five copies of "Dr. Rajesh Kumar" make every report about him wrong.
 */

export interface PickerOption {
  id: string
  name: string
  code: string
  /** "Paediatrics · Apollo Clinic" — whatever helps tell two people apart. */
  detail: string | null
  area: string | null
  phone: string | null
}

export interface DuplicateMatch extends PickerOption {
  score: number
}

export type PickerValue =
  | { mode: 'existing'; id: string; label: string }
  | { mode: 'new'; values: Record<string, string> }
  | { mode: 'none' }

export default function CustomerPicker({
  noun,
  newFields,
  nameFieldName,
  search,
  findDuplicates,
  value,
  onChange,
  error,
  canCreate = true,
}: {
  noun: string
  newFields: FieldSpec[]
  /** Which field in newFields holds the name — drives duplicate checking. */
  nameFieldName: string
  search: (term: string) => Promise<PickerOption[]>
  findDuplicates: (name: string, phone?: string, area?: string) => Promise<DuplicateMatch[]>
  value: PickerValue
  onChange: (value: PickerValue) => void
  error?: string
  canCreate?: boolean
}) {
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PickerOption[]>([])
  const [searching, startSearch] = useTransition()
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const [dupDismissed, setDupDismissed] = useState(false)
  // State rather than a ref: these values are rendered as the inputs' defaults
  // when the MR switches back from the search tab, and a ref read during render
  // is not tracked by React.
  const [newValues, setNewValues] = useState<Record<string, string>>({})

  // Debounced search — one query when typing pauses, not one per keystroke.
  useEffect(() => {
    if (mode !== 'search') return
    const timer = setTimeout(() => {
      startSearch(async () => setResults(await search(term)))
    }, 300)
    return () => clearTimeout(timer)
  }, [term, mode, search])

  const readNewValues = () => {
    const form = document.getElementById(`new-${noun}-fields`)
    if (!form) return {}
    const out: Record<string, string> = {}
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[name]')
      .forEach(el => { if (el.value.trim()) out[el.name] = el.value.trim() })
    return out
  }

  const syncNew = () => {
    const values = readNewValues()
    setNewValues(values)
    onChange(values[nameFieldName] ? { mode: 'new', values } : { mode: 'none' })
  }

  const checkDuplicates = () => {
    const values = readNewValues()
    const name = values[nameFieldName]
    if (!name || name.length < 3) { setDuplicates([]); return }
    startSearch(async () => {
      setDuplicates(await findDuplicates(name, values.phone, values.area))
      setDupDismissed(false)
    })
  }

  const selectExisting = (option: PickerOption) => {
    onChange({ mode: 'existing', id: option.id, label: option.name })
    setMode('search')
    setDuplicates([])
  }

  // ── An existing record is chosen ──
  if (value.mode === 'existing') {
    return (
      <div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check size={16} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-emerald-900">{value.label}</p>
            <p className="text-[11.5px] text-emerald-700">Existing {noun}</p>
          </div>
          <button
            type="button"
            onClick={() => { onChange({ mode: 'none' }); setTerm(''); }}
            className="rounded-lg p-1.5 text-emerald-700 transition hover:bg-emerald-100"
            aria-label={`Choose a different ${noun}`}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex gap-1.5 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => { setMode('search'); onChange({ mode: 'none' }) }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2
                        text-[13px] font-semibold transition ${
              mode === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <Search size={14} /> Existing
          </button>
          <button
            type="button"
            onClick={() => { setMode('new'); setDuplicates([]); syncNew() }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2
                        text-[13px] font-semibold transition ${
              mode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            <UserPlus size={14} /> New {noun}
          </button>
        </div>
      )}

      {mode === 'search' ? (
        <>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </span>
            <input
              type="search"
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder={`Search ${noun}s by name, phone or area…`}
              aria-label={`Search ${noun}s`}
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-base
                         text-gray-900 placeholder:text-gray-400 focus:border-emerald-600
                         focus:ring-2 focus:ring-emerald-600/20 focus:outline-none"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {results.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-gray-500">
                {term.length > 0 && !searching
                  ? `No ${noun} found. ${canCreate ? `Switch to "New ${noun}" to add them.` : ''}`
                  : `Start typing to find a ${noun}.`}
              </p>
            ) : (
              results.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectExisting(option)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-emerald-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-gray-900">{option.name}</p>
                    <p className="truncate text-[11.5px] text-gray-500">
                      {[option.detail, option.area, option.phone].filter(Boolean).join(' · ') || option.code}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {duplicates.length > 0 && !dupDismissed && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-amber-900">
                    A {noun} with a similar name already exists
                  </p>
                  <p className="mt-0.5 text-[12px] text-amber-800">
                    Pick the existing record instead of adding a duplicate.
                  </p>
                  <ul className="mt-2.5 space-y-1.5">
                    {duplicates.map(d => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => selectExisting(d)}
                          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2
                                     text-left transition hover:border-emerald-400 hover:bg-emerald-50"
                        >
                          <p className="text-[13px] font-medium text-gray-900">{d.name}</p>
                          <p className="text-[11.5px] text-gray-500">
                            {[d.detail, d.area, d.phone].filter(Boolean).join(' · ') || d.code}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setDupDismissed(true)}
                    className="mt-2.5 text-[12px] font-semibold text-amber-800 underline"
                  >
                    None of these — this is a different {noun}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            id={`new-${noun}-fields`}
            onInput={syncNew}
            onBlur={checkDuplicates}
            className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2"
          >
            {newFields.map(spec => (
              <Field key={spec.name} spec={spec} defaultValue={newValues[spec.name] ?? ''} />
            ))}
          </div>

          <p className="text-[11.5px] text-gray-500">
            This {noun} will be added to the company master and marked as new for today&apos;s report.
          </p>
        </div>
      )}

      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  )
}
