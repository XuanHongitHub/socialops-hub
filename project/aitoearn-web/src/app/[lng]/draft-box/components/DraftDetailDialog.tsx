/**
 * 草稿详情弹框组件
 * 展示草稿的完整信息，支持编辑和删除操作
 * PC端左右布局：左侧媒体资源，右侧信息
 */

'use client'

import type { PromotionMaterial } from '@/app/[lng]/brand-promotion/brandPromotionStore/types'
import type { PlatType } from '@/app/config/platConfig'
import { ArrowRightLeft, Calendar, Edit, FolderOpen, Image as ImageIcon, Loader2, RefreshCw, Send, Sparkles, Trash2, Video } from 'lucide-react'
import NextImage from 'next/image'
import { memo, useCallback, useState } from 'react'
import { apiUpdateMaterial } from '@/api/material'
import { Navigation, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { useShallow } from 'zustand/react/shallow'
import { usePlanDetailStore } from '@/app/[lng]/brand-promotion/planDetailStore'

import { AccountPlatInfoMap } from '@/app/config/platConfig'
import { useTransClient } from '@/app/i18n/client'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { formatDate } from '@/utils/format'
import { useTransferDraftDialogStore } from '../transferDraftDialogStore'
import styles from './DraftDetailDialog.module.scss'
import { GenerationParamsCard } from './GenerationParamsCard'
import { LazyImage } from './LazyImage'
import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'

// 带 loading 状态的图片组件
function MediaImage({ src, alt }: { src: string, alt: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* Loading 骨架 - 增强效果 */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-primary" />
        </div>
      )}
      <NextImage
        src={src}
        alt={alt}
        width={800}
        height={600}
        className={cn(
          'max-w-full max-h-full object-contain transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={() => setLoaded(true)}
        unoptimized
      />
    </div>
  )
}

// 媒体预览组件 - 使用 Swiper 轮播
const MediaPreview = memo(({ material }: { material: PromotionMaterial }) => {
  /** Prefer local archive routes; rewrite legacy /api/ai/assets/:id/file and drop expired Grok CDN. */
  const durableMediaUrl = (url: string | undefined | null) => {
    const u = String(url || '').trim()
    if (!u)
      return ''
    if (/\/api\/ai\/assets\/local-file/i.test(u))
      return u
    const byPath = u.match(/\/api\/ai\/assets\/([^/?#]+)\/file\/?$/i)
    if (byPath?.[1])
      return `/api/ai/assets/local-file?id=${encodeURIComponent(byPath[1])}`
    const byFile = u.match(/\/api\/ai\/assets\/file\/([^/?#]+)/i)
    if (byFile?.[1])
      return `/api/ai/assets/local-file?id=${encodeURIComponent(byFile[1])}`
    if (/vidgen\.x\.ai|xai-vidgen|xai-video/i.test(u))
      return ''
    return u
  }
  const mediaList = (material.mediaList || [])
    .map(m => ({ ...m, url: durableMediaUrl(m.url) }))
    .filter(m => Boolean(m.url))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  // 检查是否全是图片（非视频）
  const isAllImages = mediaList.length > 0 && !mediaList.some(m => m.type === 'video')

  // 无媒体但有封面
  if (mediaList.length === 0 && material.coverUrl) {
    return (
      <div className="relative w-full h-full rounded-lg overflow-hidden bg-muted">
        <LazyImage
          src={material.coverUrl}
          alt={material.title || '草稿封面'}
          fill
          className="object-cover"
          skeletonClassName="rounded-lg"
        />
      </div>
    )
  }

  // 无媒体无封面
  if (mediaList.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full rounded-lg bg-muted">
        <ImageIcon className="h-12 w-12 text-muted-foreground" />
      </div>
    )
  }

  // 有媒体 - 使用 Swiper
  return (
    <div
      className={cn(
        'w-full h-full min-h-[300px] rounded-lg overflow-hidden bg-muted relative',
        styles.draftMediaSwiper,
        isHovered ? styles.swiperVisible : styles.swiperHidden,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Swiper
        data-testid="draftbox-detail-swiper"
        modules={[Navigation, Pagination]}
        navigation={mediaList.length > 1}
        pagination={{ clickable: true }}
        loop={mediaList.length > 1}
        observer={true}
        observeParents={true}
        onSlideChange={swiper => setCurrentIndex(swiper.realIndex)}
        className="h-full w-full"
      >
        {mediaList.map((media, index) => (
          <SwiperSlide key={index} className="!flex items-center justify-center">
            {media.type === 'video'
              ? (
                  <video
                    src={media.url}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-contain bg-white"
                    poster={material.coverUrl}
                  />
                )
              : (
                  <MediaImage
                    src={media.url}
                    alt={material.title || `媒体 ${index + 1}`}
                  />
                )}
          </SwiperSlide>
        ))}
      </Swiper>

      {/* 右上角页码指示器 - 仅图片且多于1张时显示 */}
      {isAllImages && mediaList.length > 1 && (
        <div className={cn(
          'absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-xs font-medium',
          'bg-black/50 text-white backdrop-blur-sm',
          'transition-opacity duration-200',
          isHovered ? 'opacity-100' : 'opacity-0',
        )}
        >
          {currentIndex + 1}
          {' '}
          /
          {mediaList.length}
        </div>
      )}
    </div>
  )
})

MediaPreview.displayName = 'MediaPreview'

// 详情弹框内容组件
interface DraftDetailContentProps {
  allowTransfer?: boolean
}

const DraftDetailContent = memo(({ allowTransfer = true }: DraftDetailContentProps) => {
  const { t } = useTransClient('brandPromotion')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)

  const {
    selectedDraft,
    isSubmitting,
    openEditMaterialModal,
    closeDraftDetailDialog,
    deleteMaterial,
    openPublishDialog,
  } = usePlanDetailStore(
    useShallow(state => ({
      selectedDraft: state.selectedDraft,
      isSubmitting: state.isSubmitting,
      openEditMaterialModal: state.openEditMaterialModal,
      closeDraftDetailDialog: state.closeDraftDetailDialog,
      deleteMaterial: state.deleteMaterial,
      openPublishDialog: state.openPublishDialog,
    })),
  )

  const openTransferDialog = useTransferDraftDialogStore(state => state.openDialog)

  const localVideoAssetId = selectedDraft?.mediaList
    ?.map(media => /^\/api\/ai\/assets\/([^/]+)\/file(?:\?|$)/.exec(media.url)?.[1])
    .find(Boolean)

  const handleOpenLocalFolder = useCallback(async () => {
    if (!localVideoAssetId)
      return
    const response = await fetch('/api/ai/assets/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: localVideoAssetId }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok) {
      toast.error(result?.message || 'Unable to open local folder')
      return
    }
    toast.success('Opened local video folder')
  }, [localVideoAssetId])
  // 处理编辑
  const handleEdit = useCallback(() => {
    if (selectedDraft) {
      closeDraftDetailDialog()
      openEditMaterialModal(selectedDraft)
    }
  }, [selectedDraft, closeDraftDetailDialog, openEditMaterialModal])

  // 处理发布
  const handlePublish = useCallback(() => {
    if (selectedDraft) {
      closeDraftDetailDialog()
      openPublishDialog(selectedDraft)
    }
  }, [selectedDraft, closeDraftDetailDialog, openPublishDialog])

  const handleTransfer = useCallback(() => {
    if (!selectedDraft) {
      return
    }

    closeDraftDetailDialog()
    openTransferDialog({
      currentPlanId: selectedDraft.groupId,
      draftIds: [selectedDraft.id],
      mediaIds: [],
    })
  }, [closeDraftDetailDialog, openTransferDialog, selectedDraft])

  // 处理删除
  const handleDelete = useCallback(async () => {
    if (!selectedDraft)
      return

    const success = await deleteMaterial(selectedDraft.id)
    if (success) {
      toast.success(t('plan.deleteSuccess'))
      closeDraftDetailDialog()
    }
    else {
      toast.error(t('plan.deleteFailed'))
    }
    setDeleteConfirmOpen(false)
  }, [selectedDraft, deleteMaterial, closeDraftDetailDialog, t])

  /**
   * Regen caption/title/tags only (keeps video/media).
   * BugSell brand SEO — strips seller-shop CTAs like "Shop now at City Cats".
   * Agents: same entry as Publish SEO auto-fill, scoped to this draft.
   */
  const handleRegenCopy = useCallback(async () => {
    if (!selectedDraft || regenBusy)
      return
    setRegenBusy(true)
    try {
      const gp = (selectedDraft.generationParams || {}) as Record<string, any>
      const platforms = Array.isArray(selectedDraft.accountTypes) && selectedDraft.accountTypes.length
        ? selectedDraft.accountTypes
        : (Array.isArray(gp.platforms) ? gp.platforms : ['tiktok', 'instagram', 'facebook', 'youtube', 'pinterest'])

      const res = await fetch('/api/ai/publish-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'auto',
          platforms,
          productTitle: gp.productTitle || selectedDraft.title || '',
          productUrl: gp.productUrl || '',
          productNotes: gp.productNotes || '',
          title: selectedDraft.title || '',
          des: selectedDraft.desc || '',
          topics: selectedDraft.topics || [],
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || body?.code !== 0) {
        throw new Error(body?.message || `SEO regen failed (${res.status})`)
      }

      const packs = body?.data?.packs || body?.data || {}
      const firstPlat = platforms.map(String)[0]
      const pack = packs[firstPlat]
        || packs[String(firstPlat).toLowerCase()]
        || Object.values(packs).find((p: any) => p && (p.title || p.des)) as any
        || null

      // Prefer first connected platform pack; merge topics unique across packs lightly
      const title = String(pack?.title || selectedDraft.title || '').trim()
      const desc = String(pack?.des || pack?.caption || selectedDraft.desc || '').trim()
      let topics: string[] = Array.isArray(pack?.topics)
        ? pack.topics.map(String)
        : (selectedDraft.topics || [])
      // Collect a few topics from other packs for multi-platform drafts
      if (Object.keys(packs).length > 1) {
        const extra = Object.values(packs).flatMap((p: any) => Array.isArray(p?.topics) ? p.topics.map(String) : [])
        topics = [...new Set([...topics, ...extra])].slice(0, 8)
      }

      const updateRes = await apiUpdateMaterial(selectedDraft.id, {
        title,
        desc,
        topics,
        generationParams: {
          ...gp,
          lastCopyRegenAt: new Date().toISOString(),
          lastCopyRegenProvider: body?.data?.provider || body?.provider || 'auto',
          platformSeoPacks: packs,
        },
      })
      if (updateRes?.code !== 0 && updateRes?.code !== '0') {
        // Local PUT may still return data on success
        if (!updateRes?.data)
          throw new Error(updateRes?.message || 'Failed to save regenerated copy')
      }

      const saved = (updateRes?.data || {
        ...selectedDraft,
        title,
        desc,
        topics,
      }) as PromotionMaterial

      // Refresh open dialog + list row without full reload
      usePlanDetailStore.setState((state) => {
        const materials = state.materials.map(m =>
          m.id === selectedDraft.id
            ? { ...m, title: saved.title || title, desc: saved.desc || desc, topics: saved.topics || topics }
            : m,
        )
        return {
          materials,
          selectedDraft: state.selectedDraft?.id === selectedDraft.id
            ? {
                ...state.selectedDraft,
                title: saved.title || title,
                desc: saved.desc || desc,
                topics: saved.topics || topics,
                generationParams: {
                  ...(state.selectedDraft.generationParams || {}),
                  lastCopyRegenAt: new Date().toISOString(),
                  platformSeoPacks: packs,
                },
              }
            : state.selectedDraft,
        }
      })

      toast.success('Copy regenerated · BugSell brand (video kept)')
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
    finally {
      setRegenBusy(false)
    }
  }, [selectedDraft, regenBusy])

  if (!selectedDraft)
    return null

  return (
    <>
      {/* 无障碍：隐藏的标题 */}
      <DialogTitle className="sr-only">{t('draft.detailTitle')}</DialogTitle>

      {/* PC: wider split; mobile stacks — footer always outside scroll so Regen stays visible */}
      <div className="flex min-h-0 max-h-[min(86vh,860px)] flex-col md:flex-row md:gap-6">
        {/* 左侧：媒体区域 */}
        <div className="h-[38vh] min-w-0 shrink-0 md:h-auto md:max-h-[min(86vh,860px)] md:w-[55%] md:min-w-0">
          <MediaPreview material={selectedDraft} />
        </div>

        {/* 右侧：info scroll + sticky actions */}
        <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col md:mt-0 md:min-w-[22rem]">
          {/* 可滚动内容 — leaves room for footer */}
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="space-y-3 pb-2 pr-2">
              {/* 标题 */}
              <div>
                <h3 className="text-lg font-medium leading-snug">
                  {selectedDraft.title || t('material.untitled')}
                </h3>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                {selectedDraft.desc && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedDraft.desc}
                  </p>
                )}
                {selectedDraft.topics && selectedDraft.topics.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-1">
                    {selectedDraft.topics.map((topic, index) => (
                      <span key={index} className="text-sm text-primary">
                        #
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI 生成参数 */}
              {selectedDraft.generationParams && (
                <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                  <GenerationParamsCard
                    params={selectedDraft.generationParams}
                    t={t}
                    showPlatforms={false}
                    applyTargetGroupId={selectedDraft.groupId}
                    onApplied={closeDraftDetailDialog}
                  />
                </div>
              )}

              {/* 统计信息 */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {t('material.useCount', { count: selectedDraft.useCount || 0 })}
                </Badge>
                {selectedDraft.mediaList && selectedDraft.mediaList.length > 0 && (
                  <Badge variant="outline">
                    {selectedDraft.mediaList.some(m => m.type === 'video')
                      ? (
                          <>
                            <Video className="h-3 w-3 mr-1" />
                            {t('planType.video')}
                          </>
                        )
                      : (
                          <>
                            <ImageIcon className="h-3 w-3 mr-1" />
                            {t('planType.article')}
                            {selectedDraft.mediaList.length > 1 && (
                              <span className="ml-1">
                                (
                                {selectedDraft.mediaList.length}
                                )
                              </span>
                            )}
                          </>
                        )}
                  </Badge>
                )}
              </div>

              {/* 平台图标 */}
              {selectedDraft.accountTypes && selectedDraft.accountTypes.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedDraft.accountTypes.map((type) => {
                    const platInfo = AccountPlatInfoMap.get(type as PlatType)
                    if (!platInfo)
                      return null
                    return (
                      <NextImage
                        key={type}
                        src={platInfo.icon}
                        alt={platInfo.name}
                        width={20}
                        height={20}
                        className="w-5 h-5"
                        unoptimized
                      />
                    )
                  })}
                </div>
              )}

              {/* 创建时间 */}
              {selectedDraft.createdAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {t('draft.createdAt')}
                    :
                    {' '}
                    {formatDate(selectedDraft.createdAt)}
                  </span>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Sticky footer — always visible (not inside ScrollArea) */}
          <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-border/70 bg-background pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                data-testid="draftbox-detail-publish-btn"
                className="h-10 cursor-pointer gap-2 px-4 text-sm font-semibold shadow-sm"
                onClick={handlePublish}
              >
                <Send className="h-4 w-4 shrink-0" />
                {t('draft.publish')}
              </Button>
              <Button
                type="button"
                data-testid="draftbox-detail-regen-copy-btn"
                variant="secondary"
                className="h-10 cursor-pointer gap-2 border border-primary/20 bg-primary/10 px-4 text-sm font-semibold text-foreground hover:bg-primary/15"
                disabled={regenBusy || isSubmitting}
                onClick={() => void handleRegenCopy()}
                title="Rewrite title, caption & tags for BugSell SEO — keeps video"
              >
                {regenBusy
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  : <RefreshCw className="h-4 w-4 shrink-0" />}
                {regenBusy ? 'Rewriting…' : 'Regen copy'}
                {!regenBusy && <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-80" />}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr]">
              {localVideoAssetId
                ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 shrink-0 cursor-pointer px-0"
                      title="Open local video folder"
                      aria-label="Open local video folder"
                      onClick={handleOpenLocalFolder}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  )
                : <span className="hidden sm:block" />}
              <Button
                data-testid="draftbox-detail-edit-btn"
                variant="outline"
                className="h-9 cursor-pointer gap-1.5 px-3 text-[13px]"
                onClick={handleEdit}
              >
                <Edit className="h-3.5 w-3.5 shrink-0" />
                {t('draft.edit')}
              </Button>
              {allowTransfer
                ? (
                    <Button
                      variant="outline"
                      className="h-9 cursor-pointer gap-1.5 px-3 text-[13px]"
                      onClick={handleTransfer}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
                      {t('draftManage.transfer')}
                    </Button>
                  )
                : <span />}
              <Button
                data-testid="draftbox-detail-delete-btn"
                variant="outline"
                className="h-9 cursor-pointer gap-1.5 px-3 text-[13px] text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                {t('draft.delete')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('plan.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('plan.deleteConfirmDesc', { name: selectedDraft.title || t('material.untitled') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{t('common.cancel')}</AlertDialogCancel>
            <Button
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

DraftDetailContent.displayName = 'DraftDetailContent'

// 主组件
interface DraftDetailDialogProps {
  allowTransfer?: boolean
}

export const DraftDetailDialog = memo(({ allowTransfer = true }: DraftDetailDialogProps) => {
  const { draftDetailDialogOpen } = usePlanDetailStore(
    useShallow(state => ({
      draftDetailDialogOpen: state.draftDetailDialogOpen,
    })),
  )

  const closeDraftDetailDialog = usePlanDetailStore(state => state.closeDraftDetailDialog)

  // 根据疑难杂症记录 #2，拆成两层组件避免闪烁
  if (!draftDetailDialogOpen)
    return null

  return (
    <Dialog open onOpenChange={closeDraftDetailDialog}>
      <DialogContent
        data-testid="draftbox-detail-dialog"
        className={cn(
          // Override Dialog default sm:w-[min(1100px,95vw)] — need room for 2-row actions + Regen
          'gap-0 p-3 sm:p-5',
          'w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)]',
          'sm:w-[min(80rem,96vw)] sm:max-w-[min(80rem,96vw)]',
          'max-h-[min(92vh,920px)] overflow-hidden',
        )}
      >
        <DraftDetailContent allowTransfer={allowTransfer} />
      </DialogContent>
    </Dialog>
  )
})

DraftDetailDialog.displayName = 'DraftDetailDialog'
