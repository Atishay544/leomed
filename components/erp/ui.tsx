import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

/**
 * Shared presentation primitives for the ERP.
 * Server components by default — none of these hold state, so they add no
 * client JavaScript to the pages that use them.
 */

export function PageHeader({
  title, description, action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-gray-500">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export function Card({
  children, className = '', padded = true,
}: {
  children: React.ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${padded ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
      <h2 className="text-[13.5px] font-semibold text-gray-800">{title}</h2>
      {action}
    </div>
  )
}

export function StatCard({
  label, value, hint, icon: Icon, tone = 'default', href,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: 'default' | 'positive' | 'warning' | 'critical'
  href?: string
}) {
  const tones = {
    default:  'text-gray-900',
    positive: 'text-emerald-700',
    warning:  'text-amber-700',
    critical: 'text-red-700',
  } as const
  const iconTones = {
    default:  'bg-gray-100 text-gray-500',
    positive: 'bg-emerald-50 text-emerald-600',
    warning:  'bg-amber-50 text-amber-600',
    critical: 'bg-red-50 text-red-600',
  } as const

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        {Icon && (
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconTones[tone]}`}>
            <Icon size={14} />
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11.5px] text-gray-400">{hint}</p>}
    </>
  )

  const className =
    'rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition' +
    (href ? ' hover:border-emerald-300 hover:shadow' : '')

  return href
    ? <Link href={href} className={`block ${className}`}>{body}</Link>
    : <div className={className}>{body}</div>
}

export function Badge({
  children, className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px]
                  font-medium ring-1 ring-inset ${className || 'bg-gray-100 text-gray-600 ring-gray-500/20'}`}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          <Icon size={20} />
        </span>
      )}
      <p className="text-[14px] font-semibold text-gray-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-[13.5px] font-semibold text-amber-900">{title}</p>
      {description && <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">{description}</p>}
    </div>
  )
}

export function ButtonLink({
  href, children, variant = 'primary', className = '',
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}) {
  const styles = {
    primary:   'bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
  } as const
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2
                  text-[13px] font-semibold transition ${styles[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}

/** Wraps a wide table so the page body never scrolls sideways on a phone. */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

// Spelled out rather than interpolated: Tailwind scans source text for whole
// class names, so `text-${align}` would produce classes it never generates.
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const
type Align = keyof typeof ALIGN

export function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: Align }) {
  return (
    <th className={`whitespace-nowrap px-4 py-2.5 ${ALIGN[align]} text-[11px]
                    font-semibold uppercase tracking-wide text-gray-500`}>
      {children}
    </th>
  )
}

export function Td({
  children, align = 'left', className = '',
}: {
  children?: React.ReactNode
  align?: Align
  className?: string
}) {
  return <td className={`px-4 py-2.5 ${ALIGN[align]} text-[13px] text-gray-700 ${className}`}>{children}</td>
}
