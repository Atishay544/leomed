'use client'
import { motion } from 'framer-motion'

const ORB_VARIANTS = [
  // [x%, y%, size, duration, delay]
  ['15%',  '10%', '45vw', 10, 0],
  ['70%',  '60%', '40vw', 10, 5],
  ['80%',  '5%',  '35vw', 10, 3],
  ['10%',  '70%', '38vw', 10, 7],
] as const

const ORB_VARIANTS_2 = [
  ['50%',  '30%', '50vw', 15, 0],
  ['20%',  '80%', '42vw', 15, 4],
  ['85%',  '40%', '36vw', 15, 8],
  ['40%',  '5%',  '44vw', 15, 2],
] as const

export function AnimatedGradient() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Layer 1 */}
      {ORB_VARIANTS.map(([x, y, size, dur, delay], i) => (
        <motion.div
          key={`orb1-${i}`}
          className="absolute rounded-full"
          style={{
            left: x,
            top: y,
            width: size,
            height: size,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, hsl(250 84% 54% / 0.18) 0%, hsl(250 84% 54% / 0) 70%)',
          }}
          animate={{ x: ['0%', '8%', '-5%', '3%', '0%'], y: ['0%', '-6%', '8%', '-3%', '0%'] }}
          transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Layer 2 — slower, offset colors */}
      {ORB_VARIANTS_2.map(([x, y, size, dur, delay], i) => (
        <motion.div
          key={`orb2-${i}`}
          className="absolute rounded-full"
          style={{
            left: x,
            top: y,
            width: size,
            height: size,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, hsl(270 84% 64% / 0.1) 0%, hsl(200 84% 60% / 0) 70%)',
          }}
          animate={{ x: ['-4%', '6%', '0%', '-8%', '-4%'], y: ['5%', '0%', '-7%', '4%', '5%'] }}
          transition={{ duration: dur, delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}
