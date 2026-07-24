'use client'
import dynamic from 'next/dynamic'

const ChatWidget = dynamic(() => import('./ChatWidget'), { ssr: false, loading: () => null })

export default function ChatWidgetLoader() {
  return <ChatWidget />
}
