'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  id: string                                      // product_id
  name: string
  price: number
  image: string
  quantity: number
  variantAttributes: Record<string, string> | null  // e.g. { Color: 'Red', Size: 'S' }
  variantLabel: string | null                       // e.g. 'Red / S'
}

// Unique key per product+variant combo so Red/S and Blue/S are separate cart lines
function itemKey(id: string, attrs: Record<string, string> | null | undefined) {
  if (!attrs || Object.keys(attrs).length === 0) return id
  const attrStr = Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|')
  return `${id}::${attrStr}`
}

interface CartStore {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  clearCart: () => void
  total: () => number
  itemCount: () => number
  getKey: (item: Pick<CartItem, 'id' | 'variantAttributes'>) => string
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      getKey: (item) => itemKey(item.id, item.variantAttributes),

      addItem: (item) => set(state => {
        const key = itemKey(item.id, item.variantAttributes)
        const existing = state.items.find(i => itemKey(i.id, i.variantAttributes) === key)
        if (existing) {
          return {
            items: state.items.map(i =>
              itemKey(i.id, i.variantAttributes) === key
                ? { ...i, quantity: Math.min(3, i.quantity + item.quantity) }
                : i
            ),
          }
        }
        return { items: [...state.items, { ...item, quantity: Math.min(3, item.quantity) }] }
      }),

      removeItem: (key) => set(state => ({
        items: state.items.filter(i => itemKey(i.id, i.variantAttributes) !== key),
      })),

      updateQuantity: (key, quantity) => set(state => {
        if (quantity <= 0) {
          return { items: state.items.filter(i => itemKey(i.id, i.variantAttributes) !== key) }
        }
        return {
          items: state.items.map(i =>
            itemKey(i.id, i.variantAttributes) === key ? { ...i, quantity: Math.min(3, quantity) } : i
          ),
        }
      }),

      clearCart: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: 'ecom-cart' }
  )
)
