'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { Field, type FieldSpec } from './form/Field'
import { IDLE, type ActionState } from '@/lib/erp/actions/shared'

/**
 * One dialog shared by every master-data screen (doctors, chemists,
 * distributors, suppliers, products, batches). The fields are data, so adding
 * an entity means describing its fields — not writing another form.
 */

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px]
                 font-semibold text-white transition hover:bg-emerald-800
                 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Saving…' : label}
    </button>
  )
}

export default function MasterFormDialog({
  action,
  fields,
  title,
  triggerLabel = 'Add',
  trigger,
  initial,
  submitLabel = 'Save',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  fields: FieldSpec[]
  title: string
  triggerLabel?: string
  /** Custom trigger, e.g. a row-level "Edit" link. */
  trigger?: React.ReactNode
  /** Existing row values when editing; its `id` switches the action to update. */
  initial?: Record<string, unknown>
  submitLabel?: string
}) {
  const [open, setOpen] = useState(false)

  // Closing happens inside the action rather than in an effect watching the
  // result: an effect would run a second render pass just to hide the dialog,
  // and React flags that as a cascading render. A failed save leaves the
  // dialog open with the user's typing intact.
  const [state, formAction] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await action(previous, formData)
      if (result.ok) setOpen(false)
      return result
    },
    IDLE,
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <span onClick={() => setOpen(true)}>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2
                       text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-800"
          >
            <Plus size={15} /> {triggerLabel}
          </button>
        )}
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl
                       bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-gray-900">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            <form action={formAction} className="flex min-h-0 flex-1 flex-col">
              {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {state.error && (
                  <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50
                                               px-3.5 py-2.5 text-[12.5px] text-red-800">
                    {state.error}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
                  {fields.map(spec => (
                    <Field
                      key={spec.name}
                      spec={spec}
                      defaultValue={initial?.[spec.name] as string | number | boolean | null}
                      errors={state.fieldErrors?.[spec.name]}
                      initial={initial}
                      fieldErrors={state.fieldErrors}
                    />
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100
                              bg-gray-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-[13px]
                             font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <SaveButton label={submitLabel} />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
