'use client'

import { cn } from '@/utils/className'

type Props = {
  size?: number
  className?: string
  alt?: string
}

/** Local BugSell brand mark (downloaded from bugsell.com apple-touch-icon). */
export function BugSellMark({ size = 16, className, alt = 'BugSell' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brands/bugsell-mark.png"
      alt={alt}
      width={size}
      height={size}
      className={cn('shrink-0 rounded object-cover', className)}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}
