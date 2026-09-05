/**
 * Error types shared by server actions and the client components that render
 * their results.
 *
 * This file deliberately imports nothing. It used to live in lib/erp/auth.ts,
 * which pulls in lib/supabase/server.ts and therefore `next/headers` — so a
 * client component importing the error type dragged a server-only API into the
 * browser bundle and broke the build. Keeping the type here severs that chain.
 */

export class ErpAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErpAuthError'
  }
}
