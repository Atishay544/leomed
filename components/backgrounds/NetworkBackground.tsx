'use client'
import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'

interface Node {
  x: number; y: number; vx: number; vy: number; radius: number
}

const NODE_COUNT   = 60
const LINK_DIST    = 140
const MOUSE_RADIUS = 180
const MOUSE_FORCE  = 0.012

export function NetworkBackground() {
  const { resolvedTheme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse     = useRef({ x: -9999, y: -9999 })
  const rafId     = useRef<number>(0)

  useEffect(() => {
    if (resolvedTheme !== 'dark') return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    function resize() {
      canvas!.width  = window.innerWidth
      canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Init nodes
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x:      Math.random() * canvas!.width,
      y:      Math.random() * canvas!.height,
      vx:     (Math.random() - 0.5) * 0.5,
      vy:     (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 1.5 + 0.5,
    }))

    function onMouseMove(e: MouseEvent) {
      mouse.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMouseMove)

    function draw() {
      const w = canvas!.width, h = canvas!.height
      ctx.clearRect(0, 0, w, h)

      // Update + bounce
      for (const n of nodes) {
        // Mouse attraction
        const dx = mouse.current.x - n.x
        const dy = mouse.current.y - n.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOUSE_RADIUS) {
          n.vx += dx * MOUSE_FORCE * (1 - dist / MOUSE_RADIUS)
          n.vy += dy * MOUSE_FORCE * (1 - dist / MOUSE_RADIUS)
        }

        // Damping
        n.vx *= 0.98; n.vy *= 0.98

        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
        n.x = Math.max(0, Math.min(w, n.x))
        n.y = Math.max(0, Math.min(h, n.y))
      }

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < LINK_DIST) {
            const opacity = (1 - d / LINK_DIST) * 0.25
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      for (const n of nodes) {
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 4)
        grad.addColorStop(0, 'rgba(167, 139, 250, 0.8)')
        grad.addColorStop(1, 'rgba(139, 92, 246, 0)')
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius * 4, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      rafId.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(rafId.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [resolvedTheme])

  if (resolvedTheme !== 'dark') return null

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
      aria-hidden
    />
  )
}
