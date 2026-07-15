/**
 * 生成任务详情弹框
 * 展示 AI 批量生成任务的列表，支持无限滚动加载
 */

'use client'

import type { DraftGenerationResponse, DraftGenerationTask } from '@/api/draftGeneration'
import { AlertCircle, CheckCircle2, Loader2, Play, RefreshCw, X } from 'lucide-react'
import Image from 'next/image'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { apiGetDraftGenerationList } from '@/api/draftGeneration'
import { usePlanDetailStore } from '@/app/[lng]/brand-promotion/planDetailStore'
import { useTransClient } from '@/app/i18n/client'
import { MediaPreview } from '@/components/common/MediaPreview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatRelativeTime } from '@/lib/utils'
import { getOssUrl } from '@/utils/oss'
import { GenerationParamsCard } from '../GenerationParamsCard'
import { LOAD_MORE_OBSERVER_OPTIONS } from '../loadMoreObserver'

function getTaskResponse(task: DraftGenerationTask): DraftGenerationResponse | undefined {
  return task.response && typeof task.response === 'object' ? task.response : undefined
}

function getStringValue(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getResponseTitle(response: DraftGenerationResponse) {
  return response.title || getStringValue(response.plan, 'title')
}

function getResponseDescription(response: DraftGenerationResponse) {
  return response.description || getStringValue(response.plan, 'description')
}

function getResponseTopics(response: DraftGenerationResponse) {
  const topics = response.topics ?? response.plan?.topics
  if (!Array.isArray(topics))
    return []
  return topics.filter((topic): topic is string => typeof topic === 'string' && topic.trim().length > 0)
}

function mergeTaskList(current: DraftGenerationTask[], incoming: DraftGenerationTask[]) {
  const taskMap = new Map<string, DraftGenerationTask>()
  current.forEach(task => taskMap.set(task.id, task))
  incoming.forEach((task) => {
    const currentTask = taskMap.get(task.id)
    taskMap.set(task.id, currentTask ? { ...currentTask, ...task } : task)
  })
  return Array.from(taskMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

// 状态图标映射
function StatusIcon({ status }: { status: DraftGenerationTask['status'] }) {
  switch (status) {
    case 'generating':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-destructive" />
  }
}

// 状态 Badge 变体映射
function getStatusVariant(status: DraftGenerationTask['status']): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'generating':
      return 'default'
    case 'success':
      return 'secondary'
    case 'failed':
      return 'destructive'
  }
}

function getStatusClassName(status: DraftGenerationTask['status']) {
  if (status === 'generating')
    return 'border-primary/20 bg-primary/10 text-primary shadow-none'
}

// 任务条目
const TaskItem = memo(({
  task,
  t,
  applyTargetGroupId,
  onApplied,
  onRetry,
  onDismiss,
  onCancel,
  retrying,
  cancelling,
}: {
  task: DraftGenerationTask
  t: (key: string, options?: Record<string, unknown>) => string
  applyTargetGroupId?: string | null
  onApplied?: () => void
  onRetry?: (task: DraftGenerationTask) => void
  onDismiss?: (taskId: string) => void
  onCancel?: (taskId: string) => void
  retrying?: boolean
  cancelling?: boolean
}) => {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const response = getTaskResponse(task)
  // Normalize status — API may send mixed case
  const status = String(task.status || '').toLowerCase() as DraftGenerationTask['status']
  const isFailed = status === 'failed'
  const isGenerating = status === 'generating'
  // Always allow retry UI for failed tasks when handler exists; store validates request.
  const showFailedActions = isFailed && Boolean(onRetry || onDismiss)
  const canRetry = isFailed && Boolean(onRetry) && Boolean(task.request && (task.request.model || task.request.imageModel || task.request.prompt))
  const canCancel = isGenerating && Boolean(onCancel)
  const progressStage = response?.progress?.stage
  const progressPercent = typeof response?.progress?.percent === 'number'
    ? Math.max(0, Math.min(100, Math.round(response.progress.percent)))
    : undefined

  // 构建预览项列表和封面
  const hasVideo = !!response?.videoUrl
  const hasImages = (response?.imageUrls?.length ?? 0) > 0
  const coverSrc = response?.coverUrl
    ? getOssUrl(response.coverUrl)
    : response?.imageUrls?.[0]
      ? getOssUrl(response.imageUrls[0])
      : undefined
  const title = response ? getResponseTitle(response) : ''
  const description = response ? getResponseDescription(response) : ''
  const topics = response ? getResponseTopics(response) : []

  // 预览项：视频任务只预览视频，图片任务预览所有图片
  const previewItems = response
    ? hasVideo && response.videoUrl
      ? [{ type: 'video' as const, src: getOssUrl(response.videoUrl), title }]
      : (response.imageUrls || []).map(url => ({ type: 'image' as const, src: getOssUrl(url), title }))
    : []

  const failedActions = showFailedActions
    ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-2"
          data-testid="draftbox-generation-detail-failed-actions"
        >
          {canRetry && (
            <Button
              type="button"
              size="sm"
              className="h-8 min-w-[5.5rem] gap-1.5 text-[12px] font-medium"
              data-testid="draftbox-generation-detail-retry-btn"
              disabled={retrying}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRetry?.(task)
              }}
            >
              {retrying
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[12px]"
              data-testid="draftbox-generation-detail-dismiss-btn"
              disabled={retrying}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDismiss(task.id)
              }}
            >
              Dismiss
            </Button>
          )}
          {!canRetry && onRetry && (
            <span className="text-[11px] text-muted-foreground">
              Missing params — use “Use This Setup” above
            </span>
          )}
        </div>
      )
    : null

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border bg-muted/20',
        isFailed ? 'border-destructive/40' : 'border-border/50',
      )}
      data-testid="draftbox-generation-detail-task"
      data-status={status}
    >
      <div className="mt-0.5">
        <StatusIcon status={status === 'generating' || status === 'success' || status === 'failed' ? status : task.status} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={getStatusVariant(status === 'generating' || status === 'success' || status === 'failed' ? status : task.status)} className={cn('text-xs', getStatusClassName(status === 'generating' || status === 'success' || status === 'failed' ? status : task.status))}>
            {t(`detail.taskStatus.${status === 'generating' || status === 'success' || status === 'failed' ? status : task.status}`)}
          </Badge>
          {task.points > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('detail.pointsConsumed', { points: task.points })}
            </span>
          )}
        </div>

        {/* Retry/Dismiss right under Failed badge — always visible without scroll past params */}
        {failedActions}

        {/* Cancel generating (browser bridge / API jobs stuck in queue) */}
        {canCancel && (
          <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="draftbox-generation-detail-cancel-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 min-w-[5.5rem] gap-1.5 text-[12px] font-medium"
              data-testid="draftbox-generation-detail-cancel-btn"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCancel?.(task.id)
              }}
            >
              {cancelling
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <X className="h-3.5 w-3.5" />}
              Cancel
            </Button>
            {progressStage && (
              <span className="text-[11px] text-muted-foreground line-clamp-2">
                {progressPercent != null ? `${progressPercent}% · ` : ''}
                {progressStage}
              </span>
            )}
          </div>
        )}

        {/* 请求参数 */}
        {task.request && (
          <GenerationParamsCard
            params={task.request}
            t={t}
            className="mt-2"
            compact
            applyTargetGroupId={applyTargetGroupId}
            onApplied={onApplied}
          />
        )}

        {/* 已生成的部分结果 */}
        {response && (
          <div className="mt-2">
            {response.requestedImageCount && response.requestedImageCount > 0 && (
              <p className="mb-2 text-xs text-muted-foreground">
                {t('detail.generatedImageProgress', {
                  generated: response.generatedImageCount ?? response.imageUrls?.length ?? 0,
                  requested: response.requestedImageCount,
                })}
              </p>
            )}

            {/* 视频任务：封面 + 文字信息 */}
            {hasVideo && coverSrc && (
              <div className="flex gap-3">
                <div
                  className="relative shrink-0 w-20 h-20 rounded-md overflow-hidden bg-muted cursor-pointer"
                  onClick={() => { setPreviewIndex(0); setPreviewOpen(true) }}
                >
                  <Image
                    src={coverSrc}
                    alt={title || ''}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-5 w-5 text-white fill-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  {title && (
                    <p className="text-sm font-medium line-clamp-1">{title}</p>
                  )}
                  {description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{description}</p>
                  )}
                  {topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {topics.map(topic => (
                        <span key={topic} className="text-xs text-primary">
                          #
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 图片任务：展示所有生成图片 */}
            {!hasVideo && hasImages && (
              <div className="overflow-x-auto max-w-full">
                <div className="flex gap-1.5">
                  {response.imageUrls!.map((url, i) => (
                    <div
                      key={i}
                      className="relative w-20 h-20 rounded-md overflow-hidden bg-muted cursor-pointer"
                      onClick={() => { setPreviewIndex(i); setPreviewOpen(true) }}
                    >
                      <Image
                        src={getOssUrl(url)}
                        alt={`result-${i + 1}`}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 预览 */}
            {previewItems.length > 0 && (
              <MediaPreview
                open={previewOpen}
                items={previewItems}
                initialIndex={previewIndex}
                onClose={() => setPreviewOpen(false)}
              />
            )}
          </div>
        )}

        {isFailed && task.errorMessage && (
          <p className="text-xs text-destructive mt-2 break-all" data-testid="draftbox-generation-detail-error">
            {task.errorMessage}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          {formatRelativeTime(new Date(task.createdAt))}
        </p>
      </div>
    </div>
  )
})

TaskItem.displayName = 'TaskItem'

// 弹框内容
const GenerationDetailContent = memo(({
  onClose,
  applyTargetGroupId,
}: {
  onClose: () => void
  applyTargetGroupId?: string | null
}) => {
  const { t } = useTransClient('brandPromotion')
  const [tasks, setTasks] = useState<DraftGenerationTask[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const pageSize = 20
  const liveGenerationTasks = usePlanDetailStore(state => state.generationTasks)
  const retryGenerationTask = usePlanDetailStore(state => state.retryGenerationTask)
  const dismissGenerationTasks = usePlanDetailStore(state => state.dismissGenerationTasks)
  const cancelGenerationTask = usePlanDetailStore(state => state.cancelGenerationTask)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const fetchTasks = useCallback(async (pageNum: number) => {
    setLoading(true)
    try {
      const res = await apiGetDraftGenerationList(pageNum, pageSize)
      if (res?.data) {
        const list = res.data.list || []
        setTasks(prev => pageNum === 1 ? list : [...prev, ...list])
        setHasMore(list.length === pageSize)
      }
    }
    catch {
      // 静默失败
    }
    finally {
      setLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    fetchTasks(1)
  }, [fetchTasks])

  useEffect(() => {
    if (liveGenerationTasks.length === 0)
      return
    setTasks(prev => mergeTaskList(prev, liveGenerationTasks))
  }, [liveGenerationTasks])

  const handleRetry = useCallback(async (task: DraftGenerationTask) => {
    if (!task.request || retryingId)
      return
    setRetryingId(task.id)
    try {
      const ok = await retryGenerationTask(task.id, task)
      if (ok) {
        // Keep history row, but mark as superseded; live queue shows the new generating job.
        setTasks(prev => prev.filter(item => item.id !== task.id))
      }
    }
    finally {
      setRetryingId(null)
    }
  }, [retryGenerationTask, retryingId])

  const handleDismiss = useCallback((taskId: string) => {
    dismissGenerationTasks([taskId])
    setTasks(prev => prev.filter(item => item.id !== taskId))
  }, [dismissGenerationTasks])

  const handleCancel = useCallback(async (taskId: string) => {
    if (!taskId || cancellingId)
      return
    setCancellingId(taskId)
    try {
      await cancelGenerationTask(taskId)
      // Reflect cancel in history list (server marks failed / Cancelled)
      setTasks(prev => prev.map(item => item.id === taskId
        ? {
            ...item,
            status: 'failed' as const,
            errorMessage: 'Cancelled by user',
            response: {
              ...(typeof item.response === 'object' ? item.response : {}),
              progress: {
                ...((item.response as any)?.progress || {}),
                stage: 'Cancelled',
                providerStatus: 'cancelled',
                updatedAt: new Date().toISOString(),
              },
            },
          }
        : item))
    }
    finally {
      setCancellingId(null)
    }
  }, [cancelGenerationTask, cancellingId])

  // IntersectionObserver 无限滚动
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el)
      return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1
          setPage(nextPage)
          fetchTasks(nextPage)
        }
      },
      LOAD_MORE_OBSERVER_OPTIONS,
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, page, fetchTasks])

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('detail.generationDetailTitle')}</DialogTitle>
      </DialogHeader>

      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-2 pr-2">
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              t={t}
              applyTargetGroupId={applyTargetGroupId}
              onApplied={onClose}
              onCancel={id => void handleCancel(id)}
              cancelling={cancellingId === task.id}
              onRetry={String(task.status).toLowerCase() === 'failed' ? handleRetry : undefined}
              onDismiss={String(task.status).toLowerCase() === 'failed' ? handleDismiss : undefined}
              retrying={retryingId === task.id}
            />
          ))}

          {/* 加载触发器 */}
          <div ref={loadMoreRef} className="h-px" />

          {/* 加载中 */}
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* 空状态 */}
          {!loading && tasks.length === 0 && (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">
              {t('detail.noGenerationTasks')}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  )
})

GenerationDetailContent.displayName = 'GenerationDetailContent'

export const GenerationDetailDialog = memo(() => {
  const { generationDetailDialogOpen, closeGenerationDetailDialog, currentPlanId } = usePlanDetailStore(
    useShallow(state => ({
      generationDetailDialogOpen: state.generationDetailDialogOpen,
      closeGenerationDetailDialog: state.closeGenerationDetailDialog,
      currentPlanId: state.currentPlan?.id ?? null,
    })),
  )

  // 两层组件模式
  if (!generationDetailDialogOpen)
    return null

  return (
    <Dialog open onOpenChange={closeGenerationDetailDialog}>
      <DialogContent data-testid="draftbox-generation-detail-dialog" className="sm:max-w-2xl">
        <GenerationDetailContent
          onClose={closeGenerationDetailDialog}
          applyTargetGroupId={currentPlanId}
        />
      </DialogContent>
    </Dialog>
  )
})

GenerationDetailDialog.displayName = 'GenerationDetailDialog'
