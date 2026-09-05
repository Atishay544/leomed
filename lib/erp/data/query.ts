import { createServerClient } from '@/lib/supabase/server'

/**
 * Shared query plumbing for ERP reads.
 *
 * Two rules the spec is firm about (§55, §36):
 *   1. Never fetch a whole table. Every list is paginated and filtered
 *      server-side; there could be thousands of doctors.
 *   2. Read through the caller's own session, so RLS filters the rows. The
 *      service-role client bypasses RLS and is deliberately not used here.
 */

export const PAGE_SIZE = 25

export interface PageResult<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export async function erpDb() {
  return createServerClient()
}

export function emptyPage<T>(page = 1, pageSize = PAGE_SIZE): PageResult<T> {
  return { rows: [], total: 0, page, pageSize, pageCount: 0 }
}

export function toPage<T>(
  rows: T[] | null,
  count: number | null,
  page: number,
  pageSize = PAGE_SIZE,
): PageResult<T> {
  const total = count ?? 0
  return {
    rows: rows ?? [],
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** Zero-based [from, to] bounds for PostgREST's inclusive .range(). */
export function rangeFor(page: number, pageSize = PAGE_SIZE): [number, number] {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const from = (safePage - 1) * pageSize
  return [from, from + pageSize - 1]
}

export function parsePage(value: string | undefined): number {
  const n = parseInt(value ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Escapes a user's search text for a PostgREST `.or()` filter.
 *
 * `.or()` takes one comma-separated string, so an unescaped comma or paren in
 * the search box would be parsed as filter syntax rather than as text — at
 * best no results, at worst a filter the user didn't write. Percent and
 * underscore are LIKE wildcards and are stripped for the same reason.
 */
export function safeSearch(term: string | undefined | null): string | null {
  const cleaned = (term ?? '').trim().replace(/[,()%_*\\"']/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length >= 2 ? cleaned : null
}

/** Builds `col.ilike.%term%,col2.ilike.%term%` for a PostgREST .or() filter. */
export function ilikeAny(columns: string[], term: string): string {
  return columns.map(c => `${c}.ilike.%${term}%`).join(',')
}
