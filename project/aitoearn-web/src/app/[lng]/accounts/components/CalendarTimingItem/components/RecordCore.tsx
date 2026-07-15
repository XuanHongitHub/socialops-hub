/**
 * RecordCore 组件
 *
 * 功能描述: 发布记录详情组件
 * - 桌面端：使用 Popover 显示详情
 * - 移动端：使用全屏 Dialog 显示详情
 */

import type { ForwardedRef } from 'react'
import type { PublishRecordItem } from '@/api/plat/types/publish.types'
import dayjs from 'dayjs'
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  MoreVertical,
  Send,
  Share2,
  XCircle,
} from 'lucide-react'
import Image from 'next/image'
import { forwardRef, memo, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { deletePlatWorkApi, deletePublishRecordApi, nowPubTaskApi } from '@/api/plat/publish'
import { PublishStatus } from '@/api/plat/types/publish.types'
import { ClientType } from '@/app/[lng]/accounts/accounts.enums'
import { getDays } from '@/app/[lng]/accounts/components/CalendarTiming/calendarTiming.utils'
import { useCalendarTiming } from '@/app/[lng]/accounts/components/CalendarTiming/useCalendarTiming'
import { AccountPlatInfoMap, PlatType } from '@/app/config/platConfig'
import { useTransClient } from '@/app/i18n/client'
import AvatarPlat from '@/components/AvatarPlat'
import { MediaPreview } from '@/components/common/MediaPreview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import { useAccountStore } from '@/store/account'
import { useSystemStore } from '@/store/system'
import { getOssUrl } from '@/utils/oss'

export interface IRecordCoreRef {}

export interface IRecordCoreProps {
  publishRecord: PublishRecordItem
}

// 发布状态组件
function PubStatus({ record }: { record: PublishRecordItem }) {
  const { t } = useTransClient('publish')
  const status = record.status

  if (status === PublishStatus.RELEASED && record.accountType === PlatType.Tiktok) {
    const tikTokStatus = record.linkMeta?.tiktokPublishStatus
    if (record.platformWorkId || record.dataId) {
      return (
        <div className="inline-flex items-center">
          <Badge
            variant="secondary"
            className="gap-1.5 bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:border-purple-700"
            title={typeof tikTokStatus === 'string' ? tikTokStatus : 'Sent to TikTok inbox'}
          >
            TikTok draft
            <Send className="h-3 w-3" />
          </Badge>
        </div>
      )
    }

    return (
      <div className="inline-flex items-center">
        <Badge
          variant="secondary"
          className="gap-1.5 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700"
          title="Saved in Socials Hub only. Not confirmed by TikTok."
        >
          Local record
          <Clock className="h-3 w-3" />
        </Badge>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center">
      {status === PublishStatus.FAIL ? (
        <Badge variant="destructive" className="gap-1.5">
          {t('status.publishFailed')}
          <XCircle className="h-3 w-3" />
        </Badge>
      ) : status === PublishStatus.PUB_LOADING ? (
        <Badge
          variant="secondary"
          className="gap-1.5 bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900 dark:text-cyan-200 dark:border-cyan-700"
        >
          {t('status.publishing')}
          <Loader2 className="h-3 w-3 animate-spin" />
        </Badge>
      ) : status === PublishStatus.RELEASED ? (
        <Badge
          variant="secondary"
          className="gap-1.5 bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700"
        >
          {t('status.publishSuccess')}
          <CheckCircle2 className="h-3 w-3" />
        </Badge>
      ) : status === PublishStatus.UNPUBLISH ? (
        <Badge
          variant="secondary"
          className="gap-1.5 bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700"
        >
          {t('status.waitingPublish')}
          <Clock className="h-3 w-3" />
        </Badge>
      ) : (
        <></>
      )}
    </div>
  )
}

const RecordCore = memo(
  forwardRef(({ publishRecord }: IRecordCoreProps, ref: ForwardedRef<IRecordCoreRef>) => {
    const isMobile = useIsMobile()
    const { calendarCallWidth, setListLoading, getPubRecord } = useCalendarTiming(
      useShallow(state => ({
        calendarCallWidth: state.calendarCallWidth,
        setListLoading: state.setListLoading,
        getPubRecord: state.getPubRecord,
      })),
    )
    const { calendarViewType } = useSystemStore(
      useShallow(state => ({
        calendarViewType: state.calendarViewType,
      })),
    )
    const { accountMap } = useAccountStore(
      useShallow(state => ({
        accountMap: state.accountMap,
      })),
    )
    const [popoverOpen, setPopoverOpen] = useState(false)
    const { t } = useTransClient('publish')
    const [nowPubLoading, setNowPubLoading] = useState(false)
    const [mediaPreviewOpen, setMediaPreviewOpen] = useState(false)
    const [mediaPreviewIndex, setMediaPreviewIndex] = useState(0)

    /**
     * 删除按钮显示逻辑
     */
    const shouldShowDelete = useMemo(() => {
      if (
        publishRecord.status === PublishStatus.UNPUBLISH
        || publishRecord.status === PublishStatus.FAIL
      ) {
        return true
      }

      if (publishRecord.status === PublishStatus.RELEASED) {
        const noDeletablePlats = [
          PlatType.Xhs,
          PlatType.Douyin,
          PlatType.WxSph,
          PlatType.Instagram,
          PlatType.Tiktok,
        ]

        if (noDeletablePlats.includes(publishRecord.accountType)) {
          return false
        }

        if (publishRecord.accountType === PlatType.Facebook) {
          return publishRecord.option?.facebook?.content_category === 'post'
        }

        return true
      }

      return false
    }, [publishRecord])

    const days = useMemo(() => {
      return getDays(publishRecord.publishTime)
    }, [publishRecord])

    const account = useMemo(() => {
      return accountMap.get(publishRecord?.accountId ?? '')
    }, [accountMap, publishRecord.accountId])

    const platIcon = useMemo(() => {
      return AccountPlatInfoMap.get(publishRecord?.accountType ?? PlatType.Xhs)?.icon
    }, [publishRecord])

    const isWxSphRecord = publishRecord.accountType === PlatType.WxSph

    const statusSummary = useMemo(() => {
      if (publishRecord.status === PublishStatus.FAIL)
        return { label: 'Failed', tone: 'bg-destructive' }
      if (publishRecord.status === PublishStatus.PUB_LOADING)
        return { label: 'Sending', tone: 'bg-cyan-500' }
      if (publishRecord.status === PublishStatus.UNPUBLISH)
        return { label: 'Queued', tone: 'bg-blue-500' }
      if (publishRecord.status === PublishStatus.RELEASED && publishRecord.accountType === PlatType.Tiktok) {
        return publishRecord.platformWorkId || publishRecord.dataId
          ? { label: 'Draft', tone: 'bg-violet-500' }
          : { label: 'Local', tone: 'bg-amber-500' }
      }
      if (publishRecord.status === PublishStatus.RELEASED)
        return { label: 'Live', tone: 'bg-emerald-500' }
      return null
    }, [publishRecord.accountType, publishRecord.dataId, publishRecord.platformWorkId, publishRecord.status])

    const getClientTypeLabel = (clientType?: ClientType) => {
      if (!clientType)
        return null
      if (clientType === ClientType.WEB) {
        return t('clientType.web')
      }
      if (clientType === ClientType.APP) {
        return t('clientType.app')
      }
      return null
    }

    const recordInfo = useMemo(() => {
      return [
        {
          label: t('record.metrics.views'),
          icon: <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />,
          key: 'viewCount',
        },
        {
          label: t('record.metrics.comments'),
          icon: <MessageCircle className="h-3.5 w-3.5 md:h-4 md:w-4" />,
          key: 'commentCount',
        },
        {
          label: t('record.metrics.likes'),
          icon: <Heart className="h-3.5 w-3.5 md:h-4 md:w-4" />,
          key: 'likeCount',
        },
        {
          label: t('record.metrics.shares'),
          icon: <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4" />,
          key: 'shareCount',
        },
      ]
    }, [t])

    const desc = useMemo(() => {
      return `${publishRecord.desc} ${publishRecord.topics ? publishRecord.topics?.map(v => `#${v}`).join(' ') : ''}`
    }, [publishRecord])

    const mediaPreviewItems = useMemo(() => {
      const items: Array<{ type: 'image' | 'video', src: string }> = []

      if (publishRecord.videoUrl) {
        items.push({
          type: 'video',
          src: getOssUrl(publishRecord.videoUrl),
        })
      }

      if (publishRecord.imgUrlList && publishRecord.imgUrlList.length > 0) {
        publishRecord.imgUrlList.forEach((imgUrl) => {
          items.push({
            type: 'image',
            src: getOssUrl(imgUrl),
          })
        })
      }

      if (items.length === 0 && publishRecord.coverUrl) {
        items.push({
          type: 'image',
          src: getOssUrl(publishRecord.coverUrl),
        })
      }

      return items
    }, [publishRecord])
    const primaryMediaPreview = mediaPreviewItems[0]

    const handleCoverClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (mediaPreviewItems.length > 0) {
        setMediaPreviewIndex(0)
        setMediaPreviewOpen(true)
      }
    }

    const handleCoverMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation()
    }

    const handleViewWork = () => {
      if (!publishRecord.workLink)
        return

      window.open(publishRecord.workLink, '_blank')
    }

    const handleCopyWorkLink = async () => {
      if (!publishRecord.workLink)
        return

      await navigator.clipboard.writeText(publishRecord.workLink)
    }

    const isTikTokDraftRecord
      = publishRecord.accountType === PlatType.Tiktok
        && publishRecord.status === PublishStatus.RELEASED
    const shouldShowViewWork = !!publishRecord.workLink && !isTikTokDraftRecord
    const shouldShowWxSphReviewPending
      = isWxSphRecord && publishRecord.status === PublishStatus.RELEASED && !publishRecord.workLink
    const wxSphReviewPendingTooltip = publishRecord.linkError || t('record.wxSphReviewPendingDesc')
    const shouldShowRecordMetrics = !isWxSphRecord && !!publishRecord.engagement

    // 日历事件：状态直接可见，已发布内容可一键打开
    const TriggerButton = (
      <div className="group/record relative w-full">
        <Button
          data-testid="record-trigger"
          variant="outline"
          className={cn(
            'flex h-8 w-full items-center justify-between border-border bg-card px-1.5 py-1 font-normal text-foreground shadow-none transition-colors hover:bg-accent',
            isMobile && 'h-10 px-2.5',
          )}
          style={{
            width: isMobile || calendarViewType === 'week' ? '100%' : `${calendarCallWidth}px`,
          }}
        >
          <div className={cn('flex min-w-0 items-center', isMobile ? 'gap-2.5' : 'gap-1.5')}>
            <Image
              src={platIcon || ''}
              width={24}
              height={24}
              className={cn('shrink-0', isMobile ? 'h-6 w-6' : 'h-5 w-5')}
              alt="platform"
              unoptimized
            />
            <span className={cn('shrink-0 font-semibold tabular-nums', isMobile ? 'text-sm' : 'text-xs')}>
              {days.format('HH:mm')}
            </span>
            {statusSummary && (
              <span className="flex min-w-0 items-center gap-1" title={statusSummary.label}>
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusSummary.tone)} />
                <span className="truncate text-[10px] font-medium text-muted-foreground">{statusSummary.label}</span>
              </span>
            )}
          </div>
          {publishRecord.coverUrl && (
            <Image
              src={getOssUrl(publishRecord.coverUrl)}
              width={24}
              height={24}
              className={cn('shrink-0 rounded-sm object-cover', isMobile ? 'h-6 w-6' : 'h-5 w-5', shouldShowViewWork && 'mr-6')}
              alt="cover"
              unoptimized
            />
          )}
        </Button>
        {shouldShowViewWork && (
          <button
            type="button"
            title={t('record.viewWork')}
            aria-label={t('record.viewWork')}
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-70 transition-colors hover:bg-background hover:text-foreground group-hover/record:opacity-100"
            onMouseDown={event => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); handleViewWork() }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )

    // 详情内容（复用于 Popover 和 Dialog）
    const RecordContent = ({ inDialog = false }: { inDialog?: boolean }) => (
      <div
        className={cn('w-full box-border overflow-hidden', inDialog && 'flex flex-col')}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* 顶部：时间 */}
        <div
          className={cn(
            'flex items-center justify-between border-b border-border px-3 py-2',
            inDialog && 'shrink-0 pt-4 pr-10',
          )}
        >
          <div className="flex flex-col gap-1">
            {/* 发布时间 */}
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {days.format('YYYY-MM-DD HH:mm')}
              <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </div>
            {/* 更新时间 */}
            {publishRecord.updatedAt && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                {t('record.updatedAt')}
                ：
                {dayjs(publishRecord.updatedAt).format('YYYY-MM-DD HH:mm')}
              </div>
            )}
          </div>
        </div>

        {/* 中间：用户信息和内容 */}
        <div
          className={cn(
            'flex flex-col justify-between gap-2.5 border-b border-border p-3 md:flex-row overflow-hidden',
            inDialog && 'overflow-y-auto',
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex items-center">
              <AvatarPlat account={account} size="default" />
              <span className="ml-2 inline-block text-sm font-semibold">
                {account?.nickname}
              </span>
              {account?.clientType && (
                <span
                  className={cn(
                    'inline-block px-1.5 py-0.5 rounded text-[10px] md:text-[11px] font-medium ml-2',
                    account.clientType === 'web'
                      ? 'bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700'
                      : 'bg-green-50 text-green-600 border border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700',
                  )}
                >
                  {getClientTypeLabel(account.clientType)}
                </span>
              )}
            </div>
            <div
              title={desc}
              className="line-clamp-2 overflow-hidden text-ellipsis pr-0 text-sm leading-5 md:pr-2"
            >
              {desc}
            </div>
            <div className="mt-2">
              {publishRecord && <span data-testid="record-status-badge"><PubStatus record={publishRecord} /></span>}
            </div>
            {publishRecord.errorMsg && (
              <div title={publishRecord.errorMsg} className="mt-1 text-xs text-destructive">
                {publishRecord.errorMsg}
              </div>
            )}
          </div>

          {/* 媒体预览 */}
          {mediaPreviewItems.length > 0 && (
            <div
              className={cn('shrink-0', isMobile ? 'w-full' : '')}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            >
              <div
                data-cover-preview
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  handleCoverClick(e)
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  handleCoverMouseDown(e)
                }}
                className={cn(
                  'rounded-md overflow-hidden cursor-pointer hover:opacity-90 transition-opacity border border-border',
                  isMobile ? 'w-full aspect-video' : 'h-28 w-28',
                )}
              >
                {primaryMediaPreview?.type === 'video'
                  ? (
                      <video
                        src={primaryMediaPreview.src}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        playsInline
                        preload="metadata"
                        aria-label="Video preview"
                      />
                    )
                  : primaryMediaPreview
                    ? (
                        <Image
                          src={primaryMediaPreview.src}
                          width={290}
                          height={290}
                          className="w-full h-full object-cover pointer-events-none"
                          alt="cover"
                          unoptimized
                        />
                      )
                    : null}
              </div>
            </div>
          )}
        </div>

        {/* Engagement：仅显示平台返回的真实数据 */}
        {shouldShowRecordMetrics && (
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            {recordInfo.map((metric) => {
              const value = publishRecord.engagement?.[metric.key as 'viewCount'] ?? 0
              return (
                <div
                  key={metric.label}
                  title={metric.label}
                  className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-muted/45 px-2 py-1 text-xs text-muted-foreground"
                >
                  {metric.icon}
                  <span className="font-medium tabular-nums text-foreground">{value}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* 底部：操作按钮 */}
        <div
          className={cn(
            'flex gap-2 p-2',
            isMobile ? 'flex-col' : 'flex-row justify-end',
            inDialog && 'shrink-0',
          )}
        >
          {/* 移动端：查看作品 + 更多操作 同一排 */}
          {isMobile && (shouldShowViewWork || shouldShowDelete) ? (
            <div className="flex gap-2 w-full">
              {shouldShowViewWork && (
                <Button
                  data-testid="record-view-work-btn"
                  className="cursor-pointer flex-1"
                  onClick={handleViewWork}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('record.viewWork')}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="record-more-btn" variant="outline" size="icon" className="cursor-pointer shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {shouldShowViewWork && (
                    <DropdownMenuItem onClick={handleCopyWorkLink}>
                      {t('buttons.copyLink')}
                    </DropdownMenuItem>
                  )}
                  {shouldShowDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        setPopoverOpen(false)
                        setListLoading(true)
                        if (publishRecord.status === PublishStatus.RELEASED) {
                          const res = await deletePlatWorkApi(
                            publishRecord.accountId!,
                            publishRecord.dataId,
                          )
                          if (!res) {
                            setListLoading(false)
                            return
                          }
                        }
                        await deletePublishRecordApi(publishRecord.id)
                        getPubRecord()
                      }}
                    >
                      {t('buttons.delete')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            // 桌面端或移动端无更多操作时
            <>
              {shouldShowViewWork && (
                <Button
                  data-testid="record-view-work-btn"
                  className={cn('cursor-pointer', isMobile && 'w-full')}
                  onClick={handleViewWork}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('record.viewWork')}
                </Button>
              )}

              {!isMobile && (shouldShowViewWork || shouldShowDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="record-more-btn" variant="outline" size="icon" className="cursor-pointer">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {shouldShowViewWork && (
                      <DropdownMenuItem onClick={handleCopyWorkLink}>
                        {t('buttons.copyLink')}
                      </DropdownMenuItem>
                    )}
                    {shouldShowDelete && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={async () => {
                          setPopoverOpen(false)
                          setListLoading(true)
                          if (publishRecord.status === PublishStatus.RELEASED) {
                            const res = await deletePlatWorkApi(
                              publishRecord.accountId!,
                              publishRecord.dataId,
                            )
                            if (!res) {
                              setListLoading(false)
                              return
                            }
                          }
                          await deletePublishRecordApi(publishRecord.id)
                          getPubRecord()
                        }}
                      >
                        {t('buttons.delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}

          {shouldShowWxSphReviewPending && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn('inline-flex', isMobile && 'w-full')}>
                    <Button
                      data-testid="record-wx-sph-review-pending-btn"
                      variant="outline"
                      className={cn(
                        'cursor-not-allowed border-primary/30 bg-primary/5 text-primary',
                        isMobile && 'w-full',
                      )}
                      disabled
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      {t('record.wxSphReviewPendingShort')}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align={isMobile ? 'center' : 'end'} className="max-w-72">
                  {wxSphReviewPendingTooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {publishRecord.status !== PublishStatus.RELEASED
            && publishRecord.status !== PublishStatus.PUB_LOADING ? (
                <Button
                  data-testid="record-publish-now-btn"
                  className={cn('cursor-pointer', isMobile && 'w-full')}
                  disabled={nowPubLoading}
                  onClick={async () => {
                    setNowPubLoading(true)
                    await nowPubTaskApi(publishRecord.id)
                    getPubRecord()
                    setNowPubLoading(false)
                  }}
                >
                  {nowPubLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {t('buttons.publishNow')}
                </Button>
              ) : null}
        </div>
      </div>
    )

    return (
      <>
        {isMobile ? (
          // 移动端：全屏 Dialog
          <>
            <div onClick={() => setPopoverOpen(true)}>{TriggerButton}</div>
            <Dialog open={popoverOpen} onOpenChange={setPopoverOpen}>
              <DialogContent
                data-testid="record-detail-dialog"
                className="w-[calc(100%-24px)] max-h-[85vh] max-w-full p-0 flex flex-col overflow-hidden"
                onInteractOutside={(e) => {
                  if (mediaPreviewOpen) {
                    e.preventDefault()
                  }
                }}
              >
                <DialogTitle className="sr-only">{days.format('YYYY-MM-DD HH:mm')}</DialogTitle>
                <RecordContent inDialog />
              </DialogContent>
            </Dialog>
          </>
        ) : (
          // 桌面端：Popover
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
            <PopoverContent
              data-testid="record-detail-popover"
              side="right"
              className="w-[400px] p-0"
              align="start"
              onInteractOutside={(e) => {
                if (mediaPreviewOpen) {
                  e.preventDefault()
                  return
                }
                const target = e.target as HTMLElement
                if (target.closest('[data-cover-preview]')) {
                  e.preventDefault()
                }
              }}
              onPointerDownOutside={(e) => {
                if (mediaPreviewOpen) {
                  e.preventDefault()
                  return
                }
                const target = e.target as HTMLElement
                if (target.closest('[data-cover-preview]')) {
                  e.preventDefault()
                }
              }}
            >
              <RecordContent />
            </PopoverContent>
          </Popover>
        )}

        {/* 媒体预览 */}
        <MediaPreview
          open={mediaPreviewOpen}
          items={mediaPreviewItems}
          initialIndex={mediaPreviewIndex}
          onClose={() => setMediaPreviewOpen(false)}
        />
      </>
    )
  }),
)

export default RecordCore
