/**
 * ChatHeader - 对话页面顶部导航栏
 * 显示返回按钮、标题、生成状态
 */
'use client'

import { ArrowLeft, Heart, Loader2, Pencil, Share2, Star } from 'lucide-react'
import React, { useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import RatingModal from '@/components/Chat/Rating'
import ShareModal from '@/components/Share/ShareModal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
export interface IChatHeaderProps {
  /** 任务标题 */
  title?: string
  /** 默认标题（任务标题为空时显示） */
  defaultTitle: string
  /** 是否正在生成 */
  isGenerating: boolean
  /** 生成进度（0-100） */
  progress: number
  /** 思考中文案 */
  thinkingText: string
  /** 任务ID（用于评分） */
  taskId?: string
  /** 任务评分（用于显示实星） */
  rating?: number | null
  /** 是否已收藏 */
  isFavorited?: boolean
  /** 收藏加载中 */
  isFavoriteLoading?: boolean
  /** 收藏切换回调 */
  onFavoriteToggle?: () => void | Promise<void>
  /** 编辑标题回调 */
  onEditTitle?: () => void
  /** 返回按钮点击 */
  onBack: () => void
}

export function ChatHeader({
  title,
  defaultTitle,
  isGenerating,
  progress,
  thinkingText,
  onBack,
  taskId,
  rating,
  isFavorited = false,
  isFavoriteLoading = false,
  onFavoriteToggle,
  onEditTitle,
}: IChatHeaderProps) {
  const { t } = useTransClient('chat')
  const [ratingOpen, setRatingOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background px-4" id="chatHeader">
      {/* 返回按钮 */}
      <Button variant="ghost" size="icon" onClick={onBack} className="w-8 h-8">
        <ArrowLeft className="w-5 h-5" />
      </Button>

      {/* 标题 + 编辑 icon */}
      <button
        onClick={onEditTitle}
        className="flex items-center gap-1.5 group cursor-pointer hover:opacity-80 transition-opacity"
        aria-label={t('task.editTitle')}
      >
        <h1 className="line-clamp-1 text-sm font-semibold text-foreground">
          {title || defaultTitle}
        </h1>
        <Pencil className="w-4 h-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>


      {/* 右侧区域：生成状态 + 收藏 + 分享 + 评分 */}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2.5">
          {/* 收藏按钮 */}
          <Button
            variant="ghost"
            onClick={onFavoriteToggle}
            disabled={isFavoriteLoading}
            className="ml-1 text-sm text-muted-foreground flex items-center gap-1 h-8 px-2 cursor-pointer"
            aria-label={isFavorited ? t('task.unfavorite') : t('task.favorite')}
          >
            {isFavoriteLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Heart
                className={cn(
                  'h-4 w-4 transition-colors',
                  isFavorited && 'text-red-500 fill-red-500',
                )}
              />
            )}
            <span>{isFavorited ? t('task.unfavorite') : t('task.favorite')}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShareOpen(true)}
            className="ml-1 text-sm text-muted-foreground flex items-center gap-1 h-8 px-2 cursor-pointer"
          >
            <Share2 className="h-4 w-4" />
            <span>{t('task.share')}</span>
          </Button>
          {/* 文本提示，移动端隐藏以节省空间 */}
          <Button
            variant="ghost"
            onClick={() => setRatingOpen(true)}
            className="ml-1 text-sm text-muted-foreground flex items-center gap-1 h-8 px-2 cursor-pointer"
            aria-label={t('task.rate')}
          >
            <Star
              className={`h-4 w-4 ${rating ? 'text-amber-400' : 'text-muted-foreground'}`}
              {...(rating ? { fill: 'currentColor' } : {})}
            />
            <span>{t('task.rate') || '评分'}</span>
          </Button>
        </div>
      </div>
      <ShareModal taskId={taskId ?? ''} open={shareOpen} onOpenChange={v => setShareOpen(v)} />
      <RatingModal
        taskId={taskId ?? ''}
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        onSaved={() => {
          setRatingOpen(false)
        }}
      />
    </header>
  )
}
