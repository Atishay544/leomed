import { ACTIVITY_STEP_LABELS, formatDateTime } from '@/lib/erp/format'
import type { ErpActivityRequestStep } from '@/lib/erp/types'

const DOT: Record<ErpActivityRequestStep['action'], string> = {
  SUBMITTED: 'bg-gray-400',
  APPROVED:  'bg-emerald-500',
  REJECTED:  'bg-red-500',
  CANCELLED: 'bg-gray-400',
}

/** The approval history of one request, oldest first. Server component. */
export default function ApprovalTrail({ steps }: { steps: ErpActivityRequestStep[] }) {
  if (steps.length === 0) return null
  return (
    <ol className="space-y-1">
      {steps.map(s => (
        <li key={s.id} className="flex items-start gap-2 text-[11.5px] leading-snug text-gray-600">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.action]}`} />
          <span>
            <span className="font-medium text-gray-800">{ACTIVITY_STEP_LABELS[s.action]}</span>
            {' by '}{s.actor_name}
            <span className="text-gray-400"> · {formatDateTime(s.created_at)}</span>
            {s.remarks && <span className="block italic text-gray-500">&ldquo;{s.remarks}&rdquo;</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
