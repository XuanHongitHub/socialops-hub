/**
 * PublishDialogSkeleton — loading shell matching desktop publish layout.
 * Preview column is height-capped so it never overflows the modal.
 */

import { Skeleton } from '@/components/ui/skeleton'

interface PublishDialogSkeletonProps {
  isMobile: boolean
}

export function PublishDialogSkeleton({ isMobile }: PublishDialogSkeletonProps) {
  if (isMobile) {
    return (
      <div
        className="absolute inset-0 z-50 flex max-h-[100dvh] flex-col overflow-hidden bg-background p-4"
        aria-hidden="true"
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>

        <div className="mb-4 flex shrink-0 gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex shrink-0 flex-col items-center gap-2">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-24 w-full max-h-[30%]" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="aspect-square w-full rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="absolute inset-0 z-50 overflow-hidden rounded-lg bg-background p-4 sm:p-5"
      aria-hidden="true"
      data-testid="publish-dialog-skeleton"
    >
      {/* Constrain to parent modal; no absolute height blow-out on preview */}
      <div className="flex h-full max-h-[min(88vh,820px)] min-h-0 gap-4 overflow-hidden">
        {/* Main editor column */}
        <div className="flex min-h-0 min-w-0 w-[min(720px,58vw)] flex-col overflow-hidden rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-8 w-32 shrink-0 rounded-md" />
          </div>

          <div className="mb-4 flex shrink-0 gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex shrink-0 flex-col items-center gap-2">
                <Skeleton className="h-11 w-11 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-hidden rounded-xl border border-border/80 bg-background p-4">
            <Skeleton className="h-5 w-2/5 max-w-[200px]" />
            <Skeleton className="h-32 w-full max-h-[40%]" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square max-h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>

          <div className="mt-4 flex shrink-0 justify-end gap-2">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>

        {/* Preview column — height capped; phone frame uses max-height not pure aspect grow */}
        <div className="flex min-h-0 w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card p-4">
          <Skeleton className="mb-3 h-5 w-20 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-hidden">
            {/* Fixed max height for “phone” so it never spills past modal bottom */}
            <Skeleton className="h-full max-h-[min(420px,52vh)] w-full max-w-[220px] rounded-xl" />
            <div className="mt-3 w-full max-w-[220px] shrink-0 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
