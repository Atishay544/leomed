/**
 * Minimal CSV writer for report exports. No library — a report row is a flat
 * set of strings/numbers, and CSV's only real complexity (quoting a value
 * that contains a comma, quote or newline) is a few lines.
 */

function escapeCsvField(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[],
): string {
  const header = columns.map(c => escapeCsvField(c.label)).join(',')
  const lines = rows.map(row => columns.map(c => escapeCsvField(row[c.key])).join(','))
  // Leading BOM so Excel opens UTF-8 (₹, names with diacritics) correctly.
  return '﻿' + [header, ...lines].join('\r\n')
}
