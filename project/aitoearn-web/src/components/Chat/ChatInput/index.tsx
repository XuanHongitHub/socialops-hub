/**
 * ChatInput - 聊天输入组件
 * 功能：文本输入、媒体上传、发送消息
 * 支持首页大尺寸和对话详情页固定底部两种模式
 */

'use client'

import type { ClipboardEvent, KeyboardEvent } from 'react'
import type { ChatModel } from '@/api/types/ai'
import type { IUploadedMedia } from '../MediaUpload'
import { ArrowUp, Check, ChevronsUpDown, Loader2, Search, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MediaUpload } from '../MediaUpload'

export interface IChatInputProps {
  /** 输入内容 */
  value: string
  /** 内容变更回调 */
  onChange: (value: string) => void
  /** 发送回调 */
  onSend: () => void
  /** 停止生成回调 */
  onStop?: () => void
  /** 已上传的媒体 */
  medias?: IUploadedMedia[]
  /** 媒体文件变更回调 */
  onMediasChange?: (files: FileList) => void
  /** 移除媒体回调 */
  onMediaRemove?: (index: number) => void
  /** 更新媒体回调（编辑后替换） */
  onMediaUpdate?: (index: number, newUrl: string) => void
  /** 最大媒体上传数量 */
  maxMediaCount?: number
  /** 最大输入字符数 */
  maxLength?: number
  /** 是否正在生成 */
  isGenerating?: boolean
  /** 是否正在上传 */
  isUploading?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 占位文本 */
  placeholder?: string
  /** 显示模式：large-首页大尺寸，compact-对话详情页 */
  mode?: 'large' | 'compact'
  /** 自定义类名 */
  className?: string
  /** 是否允许空输入发送（用于首页使用 placeholder 作为默认值的场景） */
  allowEmptySubmit?: boolean
  models?: ChatModel[]
  selectedModel?: string
  onModelChange?: (model: string) => void
}

/**
 * ChatInput - 聊天输入组件
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  medias = [],
  onMediasChange,
  onMediaRemove,
  onMediaUpdate,
  maxMediaCount = 5,
  maxLength = 4000,
  isGenerating = false,
  isUploading = false,
  disabled = false,
  placeholder = '输入你想创作的内容...',
  mode = 'large',
  className,
  allowEmptySubmit = false,
  models = [],
  selectedModel,
  onModelChange,
}: IChatInputProps) {
  const { t } = useTransClient('chat')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')

  const currentModel = useMemo(
    () => models.find(model => model.name === selectedModel),
    [models, selectedModel],
  )
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase()
    if (!query)
      return models
    return models.filter(model =>
      [model.name, model.description, model.channel, ...(model.tags || [])]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query)),
    )
  }, [modelSearch, models])

  /** 当前字符数 */
  const currentLength = value.length
  /** 是否超出限制 */
  const isOverLimit = currentLength > maxLength

  /**
   * 自动调整高度
   * - large 模式：根据内容自适应高度（最多 200px）
   * - compact 模式：保持单行起步，允许根据内容适度增高
   */
  useEffect(() => {
    if (!textareaRef.current)
      return

    if (mode === 'large') {
      textareaRef.current.style.height = 'auto'
      const maxHeight = 200
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
    }
    else {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, mode])

  /**
   * 处理粘贴事件
   * 支持从剪贴板粘贴图片，受 maxMediaCount 限制
   */
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items || !onMediasChange)
      return

    // 收集剪贴板中的图片文件
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      // 检查是否为图片类型
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    // 如果有图片，阻止默认粘贴行为并上传
    if (imageFiles.length > 0) {
      e.preventDefault()

      // 计算剩余可上传数量
      const remaining = Math.max(0, maxMediaCount - medias.length)
      if (remaining <= 0)
        return

      // 将 File[] 转换为 FileList 格式传递给 onMediasChange
      const dataTransfer = new DataTransfer()
      // 只取剩余可上传数量的图片
      const filesToUpload = imageFiles.slice(0, remaining)
      filesToUpload.forEach(file => dataTransfer.items.add(file))
      onMediasChange(dataTransfer.files)
    }
  }

  /** 处理键盘事件 */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && !isGenerating && !isUploading && (allowEmptySubmit || value.trim())) {
        onSend()
      }
    }
  }

  /** 处理发送/停止按钮点击 */
  const handleButtonClick = () => {
    if (isGenerating) {
      onStop?.()
    }
    else if (canSend) {
      onSend()
    }
  }

  // 是否可以发送（仅当没有在生成时才检查内容）
  const canSend = !disabled && !isUploading && !isGenerating && (allowEmptySubmit || value.trim())

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 2,
      }}
      className={cn(
        'w-full border bg-card transition-[border-color,box-shadow] duration-150',
        isFocused ? 'border-primary/40 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]' : 'border-border shadow-sm',
        mode === 'large' ? 'rounded-xl p-4' : 'rounded-xl px-3 py-2.5',
        // 详情页（compact 模式）允许输入区域根据父容器拉伸
        mode === 'compact' && 'h-full flex flex-col',
        className,
      )}
    >
      {/* 第一层：媒体预览区域（只有有媒体时展示） */}
      {medias.length > 0 && (
        <div className="mb-3">
          <MediaUpload
            medias={medias}
            isUploading={isUploading}
            disabled={disabled || isGenerating}
            onFilesChange={onMediasChange}
            onRemove={onMediaRemove}
            onMediaUpdate={onMediaUpdate}
            maxCount={maxMediaCount}
            showUploadButton={false}
          />
        </div>
      )}

      {/* 第二层：文本输入区域 */}
      <div className={cn('flex-1', mode === 'compact' && 'w-full')}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled || isGenerating}
          rows={mode === 'large' ? 3 : 1}
          className={cn(
            'w-full resize-none border-none outline-none focus:outline-none bg-transparent text-foreground placeholder:text-muted-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            mode === 'large' ? 'text-base min-h-[80px]' : 'text-sm min-h-[40px]',
          )}
        />
      </div>

      {/* 第三层：操作栏（左侧其他操作，右侧发送按钮） */}
      <div className="mt-3 flex items-center justify-between gap-2">
        {/* 左侧：其它操作（上传按钮 + 字数提示） */}
        <div className="flex items-center gap-2">
          {/* 上传按钮（包裹 Tooltip） */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <MediaUpload
                    medias={medias}
                    isUploading={isUploading}
                    disabled={disabled || isGenerating}
                    onFilesChange={onMediasChange}
                    onRemove={onMediaRemove}
                    maxCount={maxMediaCount}
                    showList={false}
                    buttonVariant="icon"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('input.upload')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {models.length > 0 && selectedModel && onModelChange && (
            <Popover open={modelOpen} onOpenChange={(open) => { setModelOpen(open); if (!open) setModelSearch('') }}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={disabled || isGenerating}
                  className="flex h-8 max-w-[260px] items-center gap-2 rounded-md border border-border bg-background px-2.5 text-left text-xs transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Select AI model"
                >
                  {currentModel?.logo ? (
                    <img src={currentModel.logo} alt="" className="h-4 w-4 rounded-sm object-contain" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-foreground text-[8px] font-semibold text-background">AI</span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {currentModel?.description || currentModel?.name || selectedModel}
                  </span>
                  {currentModel?.channel && (
                    <span className="hidden shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                      {currentModel.channel}
                    </span>
                  )}
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-[340px] max-w-[calc(100vw-32px)] p-0">
                <div className="flex items-center gap-2 border-b px-3">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={modelSearch}
                    onChange={event => setModelSearch(event.target.value)}
                    placeholder="Search models..."
                    className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-72 overflow-y-auto p-1.5">
                  {filteredModels.map(model => (
                    <button
                      key={model.name}
                      type="button"
                      onClick={() => { onModelChange(model.name); setModelOpen(false); setModelSearch('') }}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                        model.name === selectedModel ? 'bg-primary/8' : 'hover:bg-muted/70',
                      )}
                    >
                      {model.logo ? (
                        <img src={model.logo} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded object-contain" />
                      ) : (
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-foreground text-[9px] font-semibold text-background">AI</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-foreground">{model.description || model.name}</span>
                          {model.channel && <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{model.channel}</span>}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">{model.name}</span>
                        {model.tags?.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {model.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{tag}</span>)}
                          </span>
                        ) : null}
                      </span>
                      <Check className={cn('mt-1 h-3.5 w-3.5 shrink-0 text-primary', model.name === selectedModel ? 'opacity-100' : 'opacity-0')} />
                    </button>
                  ))}
                  {filteredModels.length === 0 && (
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">No models found</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {/* 字数限制提示：只在超出时显示并标红 */}
          {isOverLimit && (
            <div className="text-xs text-destructive">
              {currentLength}
              /
              {maxLength}
            </div>
          )}
        </div>

        {/* 右侧：发送/停止按钮 */}
        <button
          onClick={handleButtonClick}
          disabled={!isGenerating && !canSend}
          className={cn(
            'shrink-0 flex items-center justify-center rounded-full transition-all',
            mode === 'large' ? 'w-10 h-10' : 'w-8 h-8',
            // 生成中或无法发送时都显示灰色
            !isGenerating && !canSend
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground',
          )}
        >
          {isGenerating ? (
            <Square className={cn(mode === 'large' ? 'w-4 h-4' : 'w-3 h-3')} fill="currentColor" />
          ) : isUploading ? (
            <Loader2 className={cn('animate-spin', mode === 'large' ? 'w-5 h-5' : 'w-4 h-4')} />
          ) : (
            <ArrowUp className={cn(mode === 'large' ? 'w-5 h-5' : 'w-4 h-4')} />
          )}
        </button>
      </div>
    </div>
  )
}

export default ChatInput
