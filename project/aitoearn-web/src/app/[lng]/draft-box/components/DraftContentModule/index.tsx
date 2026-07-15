/**
 * DraftContentModule - 内容管理核心模块
 * 可复用的草稿管理区域，包含 AI生成栏、草稿列表、相关弹框
 * 在 brand-promotion 页面和独立 draft-box 页面中复用
 */

'use client'

import type { DraftListSectionTab } from '../DraftListSection'
import type { IPubParams } from '@/components/PublishDialog/publishDialog.type'
import type { DraftGenerationTask } from '@/api/draftGeneration'
import { ImagePlus, Loader2, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePlanDetailStore } from '@/app/[lng]/brand-promotion/planDetailStore'
import { useTransClient } from '@/app/i18n/client'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import { PubType } from '@/app/config/publishConfig'
import { PhotoPostPanel } from '@/components/PhotoPost/PhotoPostPanel'
import PublishDialog from '@/components/PublishDialog'
import { VideoGrabFrame } from '@/components/PublishDialog/PublishDialog.util'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAccountStore } from '@/store/account'
import { generateUUID } from '@/utils'
import { useGenerationPolling } from '../../hooks/useGenerationPolling'
import AiBatchGenerateBar from '../AiBatchGenerateBar'
import { useMediaTabStore } from '../ContentTabs/mediaTabStore'
import { CreateMaterialModal } from '../CreateMaterialModal'
import { DraftDetailDialog } from '../DraftDetailDialog'
import { DraftListSection } from '../DraftListSection'
import { GenerationDetailDialog } from '../GenerationDetailDialog'
import { TransferDraftDialog } from '../TransferDraftDialog'
import { VideoCreateDraftTaskWidget } from '../VideoCreateDraftTaskWidget'

interface DraftContentModuleProps {
  /** 外部指定草稿箱 ID，不依赖当前推广计划 */
  groupId?: string
  /** 草稿列表可见 Tab */
  draftListTabs?: DraftListSectionTab[]
  /** 草稿列表默认 Tab */
  draftListDefaultTab?: DraftListSectionTab
  /** 是否强制使用草稿生成模式 */
  forceDraftMode?: boolean
  /** 是否允许转移草稿 */
  allowTransfer?: boolean
  /** 是否显示视频生成草稿长任务悬浮窗 */
  showVideoCreateDraftTaskWidget?: boolean
  /** 内容区域外层样式 */
  contentClassName?: string
}

function DraftContentModule({
  groupId,
  draftListTabs,
  draftListDefaultTab,
  forceDraftMode = false,
  allowTransfer = true,
  showVideoCreateDraftTaskWidget = true,
  contentClassName = 'space-y-6 p-4 md:p-6',
}: DraftContentModuleProps) {
  const { t } = useTransClient('brandPromotion')
  const toastedFailedIdsRef = useRef(new Set<string>())

  const {
    currentPlan,
    createMaterialModalOpen,
    editingMaterial,
    generationTasks,
    publishDialogOpen,
    publishingDraft,
    closeMaterialModal,
    fetchMaterials,
    closePublishDialog,
    syncGenerationTasks,
    updateGeneratingCount,
  } = usePlanDetailStore(
    useShallow(state => ({
      currentPlan: state.currentPlan,
      createMaterialModalOpen: state.createMaterialModalOpen,
      editingMaterial: state.editingMaterial,
      generationTasks: state.generationTasks,
      publishDialogOpen: state.publishDialogOpen,
      publishingDraft: state.publishingDraft,
      closeMaterialModal: state.closeMaterialModal,
      fetchMaterials: state.fetchMaterials,
      closePublishDialog: state.closePublishDialog,
      syncGenerationTasks: state.syncGenerationTasks,
      updateGeneratingCount: state.updateGeneratingCount,
    })),
  )

  const selectedPlanId = groupId || currentPlan?.id || null
  const pollingTaskIds = useMemo(
    () => generationTasks.filter(task => task.status === 'generating').map(task => task.id),
    [generationTasks],
  )

  const accountList = useAccountStore(state => state.accountList)

  const handleTasksUpdate = useCallback((tasks: DraftGenerationTask[]) => {
    const knownIds = new Set(usePlanDetailStore.getState().generationTasks.map(task => task.id))
    syncGenerationTasks(tasks)

    for (const task of tasks) {
      if (task.status !== 'failed' || toastedFailedIdsRef.current.has(task.id))
        continue
      // Only toast tasks we were already tracking (or just received) — avoid spam on cold load.
      if (!knownIds.has(task.id) && !pollingTaskIds.includes(task.id))
        continue
      toastedFailedIdsRef.current.add(task.id)
      const model = task.request?.model || task.request?.imageModel
      const detail = task.errorMessage?.trim() || t('detail.generationFailedFallback')
      toast.error(model ? `${model}: ${detail}` : detail)
    }
  }, [pollingTaskIds, syncGenerationTasks, t])

  // Plan 切换时重置媒体 Tab，并强制重拉 All（避免 empty list + total>0）
  useEffect(() => {
    useMediaTabStore.getState().reset()
    if (selectedPlanId) {
      // Defer so reset commits before fetch
      queueMicrotask(() => {
        void useMediaTabStore.getState().fetchAllList(selectedPlanId, selectedPlanId, true)
      })
    }
  }, [selectedPlanId])

  // AI 批量生成轮询
  useGenerationPolling({
    enabled: pollingTaskIds.length > 0,
    taskIds: pollingTaskIds,
    interval: 2000,
    onTasksUpdate: handleTasksUpdate,
    onTaskCompleted: () => {
      if (selectedPlanId) {
        // silentRefreshAll 内部已同步草稿数据到 planDetailStore，无需单独调用 silentRefreshMaterials
        useMediaTabStore.getState().silentRefresh(selectedPlanId)
        useMediaTabStore.getState().silentRefreshAll(selectedPlanId, selectedPlanId)
      }
    },
    onCountUpdate: updateGeneratingCount,
  })

  // 根据草稿类型计算默认选中的账户
  const defaultAccountIds = useMemo(() => {
    if (!publishingDraft)
      return undefined
    const isVideo = publishingDraft.mediaList?.some(m => m.type === 'video')
    const targetPubType = isVideo ? PubType.VIDEO : PubType.ImageText

    return accountList
      .filter((acc) => {
        const platConfig = AccountPlatInfoMap.get(acc.type)
        return platConfig?.pubTypes.has(targetPubType) && acc.status !== 0
      })
      .map(acc => acc.id)
  }, [publishingDraft, accountList])

  // 发布弹框打开后预填草稿数据（wait for account selection; always set video + expand preview）
  useEffect(() => {
    if (!publishDialogOpen || !publishingDraft)
      return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 20

    const runPrefill = async () => {
      const store = usePublishDialog.getState()
      const chosen = store.pubListChoosed?.length ? store.pubListChoosed : store.pubList
      if (!chosen?.length) {
        attempts += 1
        if (attempts < maxAttempts && !cancelled)
          setTimeout(() => { void runPrefill() }, 250)
        return
      }

      store.setPrefillLoading(true)

      try {
        const { normalizeHashtagToken, normalizeTopicsForPlat } = await import(
          '@/components/PublishDialog/platformSeoRules'
        )
        const { PlatType } = await import('@/app/config/platConfig')
        const { getOssUrl } = await import('@/utils/oss')

        // Cap topics early; force single-token hashtags (no spaces)
        const rawTopics = Array.isArray(publishingDraft.topics) ? publishingDraft.topics : []
        const topics = normalizeTopicsForPlat(
          rawTopics.map(t => normalizeHashtagToken(String(t))),
          PlatType.Tiktok,
        )
        const bareDes = String(publishingDraft.desc || '')
          .replace(/#[\p{L}\p{N}_]+(?:\s+[\p{L}\p{N}_]+)*/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        const params: Partial<IPubParams> = {
          des: bareDes,
          title: publishingDraft.title || '',
          topics,
        }

        // Show tags in des; keep topics[] for APIs that read topics
        if (topics.length)
          params.des = `${bareDes}\n${topics.map(t => `#${t}`).join(' ')}`.trim()

        const videoMedia = publishingDraft.mediaList?.find(m => m.type === 'video')
        if (videoMedia) {
          const videoUrl = getOssUrl(videoMedia.url) || videoMedia.url
          const coverUrl = publishingDraft.coverUrl
            ? (getOssUrl(publishingDraft.coverUrl) || publishingDraft.coverUrl)
            : ''
          const genAspect = String(
            (publishingDraft.generationParams as any)?.aspectRatio || '9:16',
          )
          const { dimensionsFromAspectLabel } = await import(
            '@/components/PublishDialog/PublishDialog.util'
          )
          const fallbackDims = dimensionsFromAspectLabel(genAspect)
          const genDuration = Number((publishingDraft.generationParams as any)?.duration) || 15

          try {
            const videoInfo = await VideoGrabFrame(videoUrl, 0)
            const width = videoInfo.width > 0 ? videoInfo.width : fallbackDims.width
            const height = videoInfo.height > 0 ? videoInfo.height : fallbackDims.height
            const duration = videoInfo.duration > 0 ? videoInfo.duration : genDuration
            const cover = coverUrl
              ? {
                  id: generateUUID(),
                  size: 0,
                  file: new File([], ''),
                  imgUrl: coverUrl,
                  ossUrl: coverUrl,
                  filename: '',
                  imgPath: '',
                  width,
                  height,
                }
              : videoInfo.cover
            params.video = {
              size: Number(videoInfo.duration > 0 ? 0 : 0),
              file: new Blob(),
              videoUrl,
              ossUrl: videoUrl,
              filename: videoUrl.split('/').pop() || 'draft-video.mp4',
              width,
              height,
              duration,
              cover,
            }
          }
          catch {
            params.video = {
              size: 0,
              file: new Blob(),
              videoUrl,
              ossUrl: videoUrl,
              filename: videoUrl.split('/').pop() || 'draft-video.mp4',
              width: fallbackDims.width,
              height: fallbackDims.height,
              duration: genDuration,
              cover: {
                id: generateUUID(),
                size: 0,
                file: new File([], ''),
                imgUrl: coverUrl || '',
                ossUrl: coverUrl || undefined,
                filename: '',
                imgPath: '',
                width: fallbackDims.width,
                height: fallbackDims.height,
              },
            }
          }
          params.images = []
        }
        else {
          const imgFallback = { width: 1080, height: 1080 }
          params.images = publishingDraft.mediaList
            ?.filter(m => m.type === 'img')
            .map((m, i) => {
              const imgUrl = getOssUrl(m.url) || m.url
              return {
                id: `draft-img-${i}`,
                size: 0,
                file: new File([], ''),
                imgUrl,
                filename: '',
                imgPath: '',
                width: imgFallback.width,
                height: imgFallback.height,
                ossUrl: imgUrl,
              }
            }) || []
        }

        if (cancelled)
          return

        store.setAccountAllParams(params)

        // Ensure right-hand Preview has an expanded account with media
        const afterAll = usePublishDialog.getState()
        const list = afterAll.pubListChoosed?.length ? afterAll.pubListChoosed : afterAll.pubList
        const expandTarget = list.find(i => i.params.video || (i.params.images?.length ?? 0) > 0) || list[0]
        if (expandTarget)
          afterAll.setExpandedPubItem(expandTarget)

        // Per-account smart defaults — preserve video/images (only title/des/topics/option)
        try {
          const { buildPrefillParamsForAccount } = await import(
            '@/components/PublishDialog/smartPublishPrefill'
          )
          for (const item of list) {
            const smart = buildPrefillParamsForAccount(
              {
                title: params.title,
                des: params.des,
                topics: params.topics,
                video: params.video,
                images: params.images,
                option: item.params.option,
              },
              item.account,
            )
            store.setOnePubParams(
              {
                title: smart.title,
                des: smart.des,
                topics: smart.topics,
                option: smart.option,
                // Re-assert media so platform merge cannot drop preview
                ...(params.video ? { video: params.video } : {}),
                ...(params.images ? { images: params.images } : {}),
              },
              item.account.id,
            )
          }

          const { ensureAllAccountsPublishReady } = await import(
            '@/components/PublishDialog/ensurePublishReady'
          )
          const genAspect = String(
            (publishingDraft.generationParams as any)?.aspectRatio || '9:16',
          )
          const latest = usePublishDialog.getState().pubListChoosed
          await ensureAllAccountsPublishReady(
            latest.length ? latest : list,
            store.setOnePubParams,
            genAspect,
          )

          // Re-expand after ensure (refs may have been replaced)
          const final = usePublishDialog.getState()
          const finalList = final.pubListChoosed?.length ? final.pubListChoosed : final.pubList
          const withMedia = finalList.find(i => i.params.video || (i.params.images?.length ?? 0) > 0)
          if (withMedia)
            final.setExpandedPubItem(withMedia)
        }
        catch {
          // smart prefill optional
        }
      }
      finally {
        if (!cancelled)
          usePublishDialog.getState().setPrefillLoading(false)
      }
    }

    const timer = setTimeout(() => { void runPrefill() }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
      usePublishDialog.getState().setPrefillLoading(false)
    }
  }, [publishDialogOpen, publishingDraft])

  // 创建草稿成功回调
  const handleMaterialSuccess = useCallback(() => {
    if (selectedPlanId) {
      fetchMaterials(selectedPlanId, 1)
      void useMediaTabStore.getState().silentRefreshAll(selectedPlanId, selectedPlanId)
    }
  }, [fetchMaterials, selectedPlanId])

  const [workspaceMode, setWorkspaceMode] = useState<'generate' | 'photo-post'>('generate')

  return (
    <>
      <div className={contentClassName}>
        {/* Mode switch — same pill language as generate toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <div
            className={cn(
              'inline-flex rounded-full border border-border/80 bg-card p-1',
              'shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
            )}
            role="tablist"
            aria-label="Workspace mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === 'generate'}
              data-testid="cm-mode-generate"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors',
                workspaceMode === 'generate'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
              onClick={() => setWorkspaceMode('generate')}
            >
              <Video className="h-3.5 w-3.5" />
              Generate
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === 'photo-post'}
              data-testid="cm-mode-photo-post"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors',
                workspaceMode === 'photo-post'
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
              onClick={() => setWorkspaceMode('photo-post')}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Đăng ảnh
            </button>
          </div>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {workspaceMode === 'photo-post'
              ? 'Product photo · multi-platform captions · publish'
              : 'AI video / image / draft'}
          </span>
        </div>

        {workspaceMode === 'generate'
          ? <AiBatchGenerateBar groupId={selectedPlanId || undefined} forceDraftMode={forceDraftMode} />
          : (
              <PhotoPostPanel
                groupId={selectedPlanId || undefined}
                onSaved={handleMaterialSuccess}
              />
            )}

        {/* 内容 Tabs：草稿箱 / 视频 / 图片 */}
        {selectedPlanId
          ? (
              <DraftListSection
                materialGroupId={selectedPlanId}
                tabs={draftListTabs}
                defaultTab={draftListDefaultTab}
                allowTransfer={allowTransfer}
              />
            )
          : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
      </div>

      {/* 创建草稿弹窗 */}
      <CreateMaterialModal
        open={createMaterialModalOpen}
        groupId={selectedPlanId}
        editingMaterial={editingMaterial}
        onClose={closeMaterialModal}
        onSuccess={handleMaterialSuccess}
      />

      {/* 草稿详情弹窗 */}
      <DraftDetailDialog allowTransfer={allowTransfer} />

      {/* 移动到草稿箱弹窗 */}
      {allowTransfer && <TransferDraftDialog />}

      {/* 生成任务详情弹框 */}
      <GenerationDetailDialog />

      {/* 发布弹框 */}
      <PublishDialog
        open={publishDialogOpen}
        onClose={closePublishDialog}
        accounts={accountList}
        defaultAccountIds={defaultAccountIds}
        onPubSuccess={closePublishDialog}
      />

      {/* 视频生成草稿长任务悬浮窗 */}
      {showVideoCreateDraftTaskWidget && <VideoCreateDraftTaskWidget />}
    </>
  )
}

export default DraftContentModule
