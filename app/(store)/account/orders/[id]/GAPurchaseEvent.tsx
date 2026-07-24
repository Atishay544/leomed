'use client'
import { useEffect } from 'react'

interface Item {
  id: string
  name: string
  quantity: number
  unit_price: number
}

interface Props {
  orderId: string
  total: number
  shipping: number
  tax: number
  items: Item[]
}

export default function GAPurchaseEvent({ orderId, total, shipping, tax, items }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any).gtag !== 'function') return
    ;(window as any).gtag('event', 'purchase', {
      transaction_id: orderId,
      value: total,
      tax,
      shipping,
      currency: 'INR',
      items: items.map(item => ({
        item_id: item.id,
        item_name: item.name,
        quantity: item.quantity,
        price: item.unit_price,
      })),
    })
  }, [orderId, total, shipping, tax, items])

  return null
}
