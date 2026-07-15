/**
 * 生成中卡片
 * 显示在瀑布流中，展示正在生成的草稿数量，带 shimmer 渐变动画
 */

'use client'

import type { DraftGenerationResponse, DraftGenerationTask } from '@/api/draftGeneration'
import { AlertCircle, ImageIcon, Loader2, Play, RefreshCw, X } from 'lucide-react'
import Image from 'next/image'
import { memo } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { MorphingIcon } from '@/components/common/MorphingIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getOssUrl } from '@/utils/oss'
import styles from './GeneratingCard.module.scss'

interface GeneratingCardProps {
  count: number
  onClick: () => void
}

interface GeneratingTaskCardProps {
  task: DraftGenerationTask
  onClick: () => void
  /** Dismiss failed — or cancel stuck generating */
  onDismiss?: (taskId: string) => void
  /** Cancel generating task (server mark failed) */
  onCancel?: (taskId: string) => void
  /** Retry failed task with same params */
  onRetry?: (taskId: string) => void
}

function getResponseObject(task: DraftGenerationTask): DraftGenerationResponse | undefined {
  return task.response && typeof task.response === 'object' ? task.response : undefined
}

function getStringValue(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getTaskTitle(task: DraftGenerationTask) {
  const response = getResponseObject(task)
  const plan = response?.plan
  return response?.title || getStringValue(plan, 'title')
}

function getTaskDescription(task: DraftGenerationTask) {
  const response = getResponseObject(task)
  const plan = response?.plan
  return response?.description || getStringValue(plan, 'description')
}

function getTaskTopics(task: DraftGenerationTask) {
  const response = getResponseObject(task)
  const topics = response?.topics ?? response?.plan?.topics
  if (!Array.isArray(topics))
    return []
  return topics.filter((topic): topic is string => typeof topic === 'string' && topic.trim().length > 0)
}

export function getDraftGenerationTaskTarget(task: DraftGenerationTask): 'draft' | 'video' | 'img' {
  if (task.request?.draftType === 'video')
    return 'video'
  if (task.request?.draftType === 'image')
    return 'img'
  return 'draft'
}

export function hasDraftGenerationTaskPartialResult(task: DraftGenerationTask) {
  const response = getResponseObject(task)
  return Boolean(
    response?.imageUrls?.length
    || response?.videoUrl
    || response?.coverUrl
    || response?.title
    || response?.description
    || response?.plan,
  )
}

export { shouldShowDraftGenerationTaskCard } from '../../utils/generationTaskVisibility'

export const GeneratingCard = memo(({ count, onClick }: GeneratingCardProps) => {
  const { t } = useTransClient('brandPromotion')

  if (count <= 0)
    return null

  return (
    <div
      data-testid="draftbox-generating-card"
      className={cn(
        'mb-4 h-[160px] rounded-lg border border-primary/20 bg-primary/5 overflow-hidden cursor-pointer transition-all duration-300 hover:border-primary/40',
        styles.generatingCard,
      )}
      onClick={onClick}
    >
      <div className="flex flex-col items-center justify-center h-full gap-4 relative z-10">
        <MorphingIcon size={32} />
        <span className="text-sm text-muted-foreground">
          {t('detail.generatingDrafts', { count })}
        </span>
      </div>
    </div>
  )
})

GeneratingCard.displayName = 'GeneratingCard'

export const GeneratingTaskCard = memo(({ task, onClick, onDismiss, onCancel, onRetry }: GeneratingTaskCardProps) => {
  const { t } = useTransClient('brandPromotion')
  const response = getResponseObject(task)
  const imageUrls = response?.imageUrls?.filter(Boolean) ?? []
  const coverUrl = response?.coverUrl || imageUrls[0]
  const generatedCount = response?.generatedImageCount ?? imageUrls.length
  const requestedCount = response?.requestedImageCount ?? task.request?.imageCount
  const title = getTaskTitle(task)
    || (task.status === 'failed' ? t('detail.generationFailedTitle') : t('detail.generatingTaskTitle'))
  const description = getTaskDescription(task)
  const topics = getTaskTopics(task)
  const modelName = task.request?.model || task.request?.imageModel
  const isFailed = task.status === 'failed'
  const isGenerating = task.status === 'generating'
  const showImageGrid = imageUrls.length > 0
  const showVideoCover = !showImageGrid && (coverUrl || response?.videoUrl)
  const errorText = task.errorMessage?.trim() || t('detail.generationFailedFallback')
  const progress = response?.progress
  const progressPercent = typeof progress?.percent === 'number'
    ? Math.max(0, Math.min(100, Math.round(progress.percent)))
    : isGenerating ? 8 : isFailed ? 0 : 100
  const progressStage = progress?.stage
    || (isGenerating ? t('detail.generatingDraft') : isFailed ? t('detail.taskStatus.failed') : t('detail.taskStatus.success'))
  // Stuck early (caption pack etc.): surface cancel even while still "generating"
  const looksStuckEarly = isGenerating && progressPercent > 0 && progressPercent < 8
  const canCancel = isGenerating && onCancel
  const canDismiss = isFailed && onDismiss

  return (
    <div
      data-testid="draftbox-generating-task-card"
      data-status={task.status}
      className={cn(
        'mb-4 cursor-pointer overflow-hidden rounded-xl border bg-card transition-all duration-300 hover:border-primary/50',
        isFailed ? 'border-destructive/40' : 'border-primary/20',
      )}
      onClick={onClick}
    >
      <div className="relative min-h-[132px] overflow-hidden bg-muted">
        {showImageGrid
          ? (
              <div className={cn('grid gap-1 p-1', imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                {imageUrls.slice(0, 4).map((url, index) => (
                  <div key={`${url}-${index}`} className="relative aspect-square overflow-hidden rounded-lg bg-background">
                    <Image
                      src={getOssUrl(url)}
                      alt={t('detail.generatedImageAlt', { index: index + 1 })}
                      fill
                      className="object-cover"
                      sizes="160px"
                    />
                    {index === 3 && imageUrls.length > 4 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-sm font-medium text-background">
                        {t('detail.moreGeneratedImages', { count: imageUrls.length - 4 })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          : showVideoCover
            ? (
                <div className="relative h-[160px]">
                  {coverUrl
                    ? (
                        <Image
                          src={getOssUrl(coverUrl)}
                          alt={title}
                          fill
                          className="object-cover"
                          sizes="240px"
                        />
                      )
                    : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                  {response?.videoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/60">
                        <Play className="ml-0.5 h-5 w-5 fill-background text-background" />
                      </div>
                    </div>
                  )}
                </div>
              )
            : isFailed
              ? (
                  <div className="flex h-[160px] flex-col items-center justify-center gap-2 bg-destructive/5 px-4">
                    <AlertCircle className="h-8 w-8 text-destructive/80" />
                    <span className="text-center text-sm font-medium text-destructive">
                      {t('detail.taskStatus.failed')}
                    </span>
                  </div>
                )
              : (
                  <div className={cn('relative flex h-[160px] flex-col items-center justify-center gap-3 px-4', styles.generatingCard)}>
                    <MorphingIcon size={32} />
                    <div className="w-full max-w-[180px] space-y-1.5 text-center">
                      <div className="text-sm font-medium text-foreground tabular-nums">
                        {progressPercent}
                        %
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-background/70">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                          style={{ width: `${progressPercent}%` }}
                          data-testid="draftbox-generation-progress-bar"
                        />
                      </div>
                      <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {progressStage}
                      </div>
                    </div>
                  </div>
                )}

        <Badge
          variant={isFailed ? 'destructive' : 'outline'}
          className={cn(
            'absolute left-2 top-2 gap-1 shadow-none',
            isGenerating && 'border-border/60 bg-background/90 font-medium text-muted-foreground backdrop-blur-sm',
          )}
        >
          {isGenerating
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <AlertCircle className="h-3 w-3" />}
          {isGenerating && progressPercent > 0
            ? `${progressPercent}%`
            : t(`detail.taskStatus.${task.status}`)}
        </Badge>

        {(canDismiss || canCancel) && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            data-testid={canCancel ? 'draftbox-generation-cancel-btn' : 'draftbox-generation-dismiss-btn'}
            className="absolute right-2 top-2 h-7 w-7 rounded-full bg-background/90 shadow-sm backdrop-blur-sm"
            aria-label={canCancel ? 'Cancel generation' : t('detail.dismissFailedTask')}
            title={canCancel ? (looksStuckEarly ? 'Cancel stuck job' : 'Cancel') : t('detail.dismissFailedTask')}
            onClick={(e) => {
              e.stopPropagation()
              if (canCancel)
                onCancel!(task.id)
              else
                onDismiss?.(task.id)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div>
          <p className="line-clamp-2 text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          )}
        </div>

        {requestedCount && requestedCount > 0 && (
          <div className="text-xs text-muted-foreground">
            {t('detail.generatedImageProgress', {
              generated: generatedCount,
              requested: requestedCount,
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {modelName && (
            <Badge variant="secondary" className="rounded-full text-[11px] font-normal">
              {modelName}
            </Badge>
          )}
          {isGenerating && progressStage && (
            <span className="text-[11px] text-muted-foreground">{progressStage}</span>
          )}
        </div>

        {isGenerating && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>xAI job progress</span>
              <span>
                {progressPercent}
                %
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/80 transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(progressPercent, 4)}%` }}
              />
            </div>
            {looksStuckEarly && (
              <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-400">
                Preparing can take ~1 min. If stuck here, cancel and retry.
              </p>
            )}
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full text-[11px]"
                data-testid="draftbox-generation-cancel-text-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onCancel!(task.id)
                }}
              >
                Cancel job
              </Button>
            )}
          </div>
        )}

        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topics.slice(0, 4).map(topic => (
              <span key={topic} className="text-xs text-primary">
                #
                {topic}
              </span>
            ))}
          </div>
        )}

        {isFailed && (
          <div className="space-y-2">
            <p className="line-clamp-3 text-xs leading-relaxed text-destructive" data-testid="draftbox-generation-error">
              {errorText}
            </p>
            <div className="flex gap-2">
              {onRetry && task.request && (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-[12px]"
                  data-testid="draftbox-generation-retry-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetry(task.id)
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              )}
              {onDismiss && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-[12px]"
                  data-testid="draftbox-generation-dismiss-text-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDismiss(task.id)
                  }}
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

GeneratingTaskCard.displayName = 'GeneratingTaskCard'
