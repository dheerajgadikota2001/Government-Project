import * as React from 'react'
import { cn } from '@/lib/utils'

// The hero's soft entrance (fade, lift and un-blur), done in CSS. It replaces the motion
// library's BlurFade on the first screen only: that library is about 48 KB gzipped, and the
// first screen should not wait for it just to fade in a heading. The keyframes are in
// index.css; readers who ask for less motion see the text at once.

export function FadeIn({ children, className, delay = 0, duration = 0.4 }: { children: React.ReactNode; className?: string; delay?: number; duration?: number }) {
  return (
    <div className={cn('apfc-fade-in', className)} style={{ '--fade-delay': `${0.04 + delay}s`, '--fade-dur': `${duration}s` } as React.CSSProperties}>
      {children}
    </div>
  )
}
