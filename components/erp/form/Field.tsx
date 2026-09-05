'use client'

export interface FieldSpec {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox'
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
  /** Column span inside the two-column form grid. */
  span?: 1 | 2
  step?: string
  min?: string
  hint?: string
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900 ' +
  'placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 ' +
  'focus:outline-none disabled:bg-gray-50 disabled:text-gray-500'

export function Field({
  spec, defaultValue, errors,
}: {
  spec: FieldSpec
  defaultValue?: string | number | boolean | null
  errors?: string[]
}) {
  const { name, label, type = 'text', required, placeholder, options, span = 1, step, min, hint } = spec
  const invalid = !!errors?.length
  const describedBy = invalid ? `${name}-error` : hint ? `${name}-hint` : undefined

  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <label htmlFor={name} className="mb-1 block text-[12px] font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {type === 'textarea' ? (
        <textarea
          id={name}
          name={name}
          rows={3}
          required={required}
          placeholder={placeholder}
          defaultValue={(defaultValue as string) ?? ''}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
        />
      ) : type === 'select' ? (
        <select
          id={name}
          name={name}
          required={required}
          defaultValue={(defaultValue as string) ?? ''}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
        >
          {!required && <option value="">—</option>}
          {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <label className="flex items-center gap-2 py-1.5 text-[13px] text-gray-700">
          <input
            id={name}
            name={name}
            type="checkbox"
            defaultChecked={!!defaultValue}
            className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600/30"
          />
          {placeholder ?? 'Yes'}
        </label>
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          step={step}
          min={min}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue == null ? '' : String(defaultValue)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          // 16px on mobile stops iOS Safari zooming in on focus, which on a
          // visit form throws the whole layout off mid-entry.
          className={`${inputClass} text-base sm:text-[13px]`}
        />
      )}

      {invalid ? (
        <p id={`${name}-error`} className="mt-1 text-[11.5px] text-red-600">{errors![0]}</p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1 text-[11.5px] text-gray-400">{hint}</p>
      ) : null}
    </div>
  )
}

export { inputClass }
