'use client'
import { motion } from 'framer-motion'
import { staggerContainer, fadeUp } from '@/lib/animations/variants'

/** Wraps children in a staggered fade-up reveal on scroll entry. */
export function AnimatedGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Single animated item — must be a direct child of AnimatedGrid. */
export function AnimatedItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  )
}
