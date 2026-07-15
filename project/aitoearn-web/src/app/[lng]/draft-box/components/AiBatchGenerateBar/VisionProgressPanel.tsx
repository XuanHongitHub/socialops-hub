/**
 * Minimal vision status: one line + spinner. No wizard strip, no purple chrome.
 */
'use client'

import { Loader2, X } from 'lucide-react'
import { memo } from 'react'
import { cn } from '@/lib/utils'

export type VisionStepId = 'collect' | 'resolve' | 'vision' | 'compose' | 'done' | 'error'

export type VisionRunState = {
  active: boolean
  percent: number
  stage: string
  step: VisionStepId
  detail?: string
  refCount?: number
  resolvedCount?: number
  provider?: string
  error?: string
  previewUrls?: string[]
  resultTitle?: string
  resultScene?: string
  resultSource?: string
  /** storyboard_commercial | catalog_brief */
  mode?: string
}

interface VisionProgressPanelProps {
  state: VisionRunState
  onDismiss?: () => void
  onCancel?: () => void
  className?: string
}

const VisionProgressPanel = memo(function VisionProgressPanel({
  state,
  onDismiss,
  onCancel,
  className,
}: VisionProgressPanelProps) {
  const isError = state.step === 'error' || Boolean(state.error)
  const isDone = state.step === 'done' && !isError
  const isRunning = state.active && !isDone && !isError
  const percent = Math.max(0, Math.min(100, Math.round(state.percent || 0)))

  if (!state.active && !isDone && !isError)
    return null

  const status = isError
    ? (state.error || state.stage || 'Vision failed')
    : isDone
      ? (state.stage || 'Ready')
      : (state.stage || 'Working…')

  return (
    <div
      data-testid="draftbox-vision-progress-panel"
      role="status"
      aria-live="polite"
      aria-busy={isRunning}
      className={cn(
        'flex w-fit max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5',
        isError && 'border-destructive/40 bg-destructive/5',
        className,
      )}
    >
      {isRunning
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        : isError
          ? <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
          : (
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50" />
            )}

      <p
        className={cn(
          'min-w-0 max-w-[420px] truncate text-[12px] leading-none',
          isError ? 'text-destructive' : 'text-muted-foreground',
        )}
        title={status}
      >
        {status}
        {isRunning && percent > 0
          ? (
              <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground/80">
                {percent}
                %
              </span>
            )
          : null}
      </p>

      {isRunning && onCancel && (
        <button
          type="button"
          data-testid="draftbox-vision-cancel-btn"
          onClick={onCancel}
          className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      )}
      {(isDone || isError) && onDismiss && (
        <button
          type="button"
          data-testid="draftbox-vision-dismiss-btn"
          onClick={onDismiss}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
})

export default VisionProgressPanel

export const IDLE_VISION_STATE: VisionRunState = {
  active: false,
  percent: 0,
  stage: '',
  step: 'collect',
}
