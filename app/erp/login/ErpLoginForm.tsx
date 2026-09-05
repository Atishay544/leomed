'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2, LogIn } from 'lucide-react'
import { erpLogin } from './actions'
import { IDLE } from '@/lib/erp/actions/shared'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3
                 text-sm font-semibold text-white shadow-sm transition
                 hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2
                 focus-visible:outline-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending
        ? <><Loader2 size={16} className="animate-spin" /> Signing in…</>
        : <><LogIn size={16} /> Sign in</>}
    </button>
  )
}

export default function ErpLoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState(erpLogin, IDLE)

  return (
    <form action={formAction} className="space-y-4">
      {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}

      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-800"
        >
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-[13px] font-medium text-gray-700 mb-1.5">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!state.fieldErrors?.email}
          className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900
                     placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2
                     focus:ring-emerald-600/20 focus:outline-none"
          placeholder="you@leomedpharma.com"
        />
        {state.fieldErrors?.email && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-[13px] font-medium text-gray-700 mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state.fieldErrors?.password}
          className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900
                     placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2
                     focus:ring-emerald-600/20 focus:outline-none"
          placeholder="••••••••"
        />
        {state.fieldErrors?.password && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <SubmitButton />
    </form>
  )
}
