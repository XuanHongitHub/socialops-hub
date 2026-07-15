/**
 * Shared SocialOps operator shell tokens.
 * Generate (AiBatchGenerateBar) and Photo Post must stay pixel-aligned.
 */

/** Pill control used by ToolBarInline, PlatformSelector, Photo Post toolbar */
export const SOCIAL_OPS_PILL_CLASS
  = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer border border-transparent hover:border-border'

/** Outer generate / photo-post card shell (mirror AiBatchGenerateBar.module.scss) */
export const SOCIAL_OPS_CARD_CLASS
  = 'relative mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.08)]'

/** BugSell product chip strip inside generate / photo shells */
export const SOCIAL_OPS_PRODUCT_CHIP_CLASS
  = 'mx-4 mt-3 flex items-center gap-3 rounded-xl border border-border/80 bg-background/80 px-3 py-2.5 shadow-sm'

export const SOCIAL_OPS_PRODUCT_THUMB_CLASS
  = 'h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted'

/** List empty / soft empty states */
export const SOCIAL_OPS_EMPTY_WRAP_CLASS
  = 'flex flex-col items-center justify-center px-4 py-14 text-center'

export const SOCIAL_OPS_EMPTY_ICON_CLASS
  = 'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground ring-1 ring-border/60'

export const SOCIAL_OPS_EMPTY_TITLE_CLASS
  = 'mb-1 text-[13px] font-semibold tracking-tight text-foreground'

export const SOCIAL_OPS_EMPTY_DESC_CLASS
  = 'max-w-[280px] text-[12px] leading-relaxed text-muted-foreground'
