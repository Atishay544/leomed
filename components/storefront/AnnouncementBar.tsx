'use client'
import Link from 'next/link'

const SEPARATOR = '✦'

function MarqueeContent({ message, linkText, linkUrl }: {
  message: string
  linkText?: string | null
  linkUrl?: string | null
}) {
  const inner = (
    <span className="inline-flex items-center gap-3">
      <span>{message}</span>
      {linkText && (
        <span className="font-semibold underline underline-offset-2">{linkText}</span>
      )}
      <span className="opacity-40 mx-4">{SEPARATOR}</span>
    </span>
  )

  // Duplicate enough times to fill any screen width seamlessly
  const copies = Array.from({ length: 6 }, (_, i) => (
    <span key={i} aria-hidden={i > 0}>{inner}</span>
  ))

  return <>{copies}</>
}

export default function AnnouncementBar({ data }: { data: any }) {
  const content = (
    <div
      className="overflow-hidden py-2 text-sm font-medium select-none"
      style={{ backgroundColor: data.bg_color, color: data.text_color }}
    >
      <div className="flex whitespace-nowrap animate-marquee">
        <MarqueeContent
          message={data.message}
          linkText={data.link_text}
          linkUrl={data.link_url}
        />
      </div>
    </div>
  )

  if (data.link_url) {
    return (
      <Link href={data.link_url} className="block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    )
  }

  return content
}
