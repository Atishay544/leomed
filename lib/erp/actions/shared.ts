import { z } from 'zod'
// From ../errors, not ../auth: client components import ActionState and IDLE
// from this file, and ../auth reaches next/headers.
import { ErpAuthError } from '../errors'

/**
 * Shared result shape and error translation for every ERP server action.
 *
 * Spec §49: a user sees "Unable to save the visit — please check your
 * connection and try again", never a Postgres error code or a stack trace.
 * The technical detail is logged server-side instead, where it is useful.
 */

export interface ActionState {
  ok?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
  /** Set by actions whose result the form needs (new id, invoice number…). */
  data?: Record<string, unknown>
}

export const IDLE: ActionState = {}

export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}

export function invalid(error: z.ZodError): ActionState {
  const fieldErrors = fieldErrorsOf(error)
  return {
    ok: false,
    error: fieldErrors._form?.[0] ?? 'Please correct the highlighted fields and try again.',
    fieldErrors,
  }
}

/** Postgres/PostgREST codes that carry a meaning worth showing the user. */
const PG_MESSAGES: Record<string, string> = {
  '23505': 'That record already exists. Check for a duplicate code or number.',
  '23503': 'A linked record is missing or has been removed. Refresh and try again.',
  '23502': 'A required field was left empty.',
  '23514': 'That value is not allowed by the business rules.',
  '42501': 'You do not have permission to do that.',
  '42P01': 'The ERP tables are not installed yet. Run the database migrations.',
  P0001:   '', // raise exception — the message is already written for humans
}

interface DbError {
  code?: string
  message?: string
  details?: string
  hint?: string
}

/**
 * Turns a Supabase/Postgres error into something a non-technical user can act
 * on. Messages raised deliberately by our own RPCs (P0001) are already written
 * for humans — "Only 12 units of Amoxiclav 625 (batch B-1183) in stock" — so
 * they pass through unchanged.
 */
export function friendlyDbError(error: DbError | null | undefined, fallback: string): ActionState {
  if (!error) return { ok: false, error: fallback }

  // Server-side detail for the operator; never sent to the browser.
  console.error('[erp]', error.code, error.message, error.details ?? '', error.hint ?? '')

  if (error.code === 'P0001' && error.message) {
    return { ok: false, error: error.message }
  }

  const known = error.code ? PG_MESSAGES[error.code] : undefined
  if (known) return { ok: false, error: known }

  // Unique-violation text still reaches us for some PostgREST paths.
  if (error.message?.includes('duplicate key')) {
    return { ok: false, error: PG_MESSAGES['23505'] }
  }

  return { ok: false, error: fallback }
}

/** Wraps an action body so auth failures and crashes become form errors
 *  instead of an unhandled 500 in the middle of a half-filled screen. */
export async function runAction(
  fallback: string,
  body: () => Promise<ActionState>,
): Promise<ActionState> {
  try {
    return await body()
  } catch (err) {
    // redirect() and notFound() signal control flow by throwing — let them.
    if (err && typeof err === 'object' && 'digest' in err &&
        typeof (err as { digest?: unknown }).digest === 'string' &&
        ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
         (err as { digest: string }).digest === 'NEXT_NOT_FOUND')) {
      throw err
    }
    if (err instanceof ErpAuthError) return { ok: false, error: err.message }
    console.error('[erp] unhandled action error', err)
    return { ok: false, error: fallback }
  }
}
