import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export const MERCHANDISING_LABELS: Record<string, { label: string; className: string }> = {
  best_seller: { label: 'Best Seller', className: 'bg-amber-500' },
  new:         { label: 'New',         className: 'bg-blue-500' },
  trending:    { label: 'Trending',    className: 'bg-emerald-600' },
  must_have:   { label: 'Must Have',   className: 'bg-rose-500' },
}
