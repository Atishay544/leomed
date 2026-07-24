'use client'
import dynamic from 'next/dynamic'

export const AnimatedGrid = dynamic(
  () => import('./AnimatedSection').then(m => ({ default: m.AnimatedGrid })),
  { ssr: false, loading: () => <div /> }
)

export const AnimatedItem = dynamic(
  () => import('./AnimatedSection').then(m => ({ default: m.AnimatedItem })),
  { ssr: false, loading: () => <div /> }
)
