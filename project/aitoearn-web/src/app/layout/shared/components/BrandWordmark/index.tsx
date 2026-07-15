/**
 * BrandWordmark - 布局区域复用的品牌字标
 */

import { cn } from '@/utils/className'

export const BRAND_TITLE = 'Socials Hub'

type BrandWordmarkTag = 'h1' | 'span'
type BrandWordmarkSize = 'sidebar' | 'mobile'

export interface BrandWordmarkProps {
  as?: BrandWordmarkTag
  size?: BrandWordmarkSize
  className?: string
}

const WORDMARK_SIZE_CLASSNAME: Record<BrandWordmarkSize, string> = {
  sidebar: 'text-[1.05rem] tracking-[-0.025em]',
  mobile: 'text-base tracking-[-0.02em]',
}

export function BrandWordmark({
  as = 'span',
  size = 'sidebar',
  className,
}: BrandWordmarkProps) {
  const Component = as

  return (
    <Component
      className={cn(
        'm-0 select-none whitespace-nowrap bg-gradient-back bg-clip-text font-bold leading-none text-transparent',
        WORDMARK_SIZE_CLASSNAME[size],
        className,
      )}
      aria-label={BRAND_TITLE}
    >
      {BRAND_TITLE}
    </Component>
  )
}
