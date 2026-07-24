'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { useCartStore } from '@/lib/store/cart'

export function useAuth() {
  const supabase      = createClient()
  const [user, setUser]   = useState<User | null>(null)
  const [role, setRole]   = useState<string>('customer')
  const [loading, setLoading] = useState(true)
  // Prevent duplicate DB calls when both getUser + onAuthStateChange fire for the same user
  const roleResolvedRef = useRef<string | null>(null)
  // Track active user ID to detect account switches and clear the shared cart
  const activeUserIdRef = useRef<string | null>(null)

  async function resolveRole(u: User) {
    // Deduplicate: skip if already resolved for this user id
    if (roleResolvedRef.current === u.id) return
    roleResolvedRef.current = u.id

    // Fast path: read role from JWT claims — zero DB round-trip
    const jwtRole = u.app_metadata?.role ?? (u as any).user_metadata?.role
    if (jwtRole) { setRole(jwtRole); return }

    // Fallback: one DB query if JWT doesn't carry the role
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.id)
        .single()
      if (!error && data?.role) setRole(data.role)
    } catch {
      // Silently fall back to 'customer'
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user ?? null
      setUser(u)
      if (u) resolveRole(u)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      // Only clear cart when switching FROM an existing user TO a different one (or to logged-out).
      // Guard: activeUserIdRef.current === null means this is the initial mount — don't clear.
      if (activeUserIdRef.current !== null && u?.id !== activeUserIdRef.current) {
        useCartStore.getState().clearCart()
      }
      activeUserIdRef.current = u?.id ?? null
      setUser(u)
      if (u) resolveRole(u)
      else {
        roleResolvedRef.current = null
        setRole('customer')
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    useCartStore.getState().clearCart()
    roleResolvedRef.current = null
    activeUserIdRef.current = null
    setUser(null)
    setRole('customer')
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  return { user, role, isAdmin: role === 'admin', loading, signOut, getToken }
}
