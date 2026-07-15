/**
 * PlatformSelector - 目标平台选择器
 * Popover 形式的平台多选组件，用于 AI 批量生成工具栏
 */

'use client'

import type { EffectiveLimitsDetailed } from '../platformLimits'
import type { PlatType } from '@/app/config/platConfig'
import { Globe, TriangleAlert } from 'lucide-react'
import Image from 'next/image'
import { memo, useCallback, useMemo, useState } from 'react'
import { AccountPlatInfoMap, DraftTargetPlatInfoArr } from '@/app/config/platConfig'
import { useTransClient } from '@/app/i18n/client'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import PlatformLimitsInfo from '../PlatformLimitsInfo'

export type PlatformPreset = 'connected' | 'all' | 'custom'

interface PlatformSelectorProps {
  selectedPlatforms: PlatType[]
  onPlatformsChange: (platforms: PlatType[]) => void
  pillClass: string
  /** 不兼容平台 Map：key 为平台类型，value 为不兼容原因列表 */
  disabledPlatforms?: Map<PlatType, string[]>
  /** 参数限制详情，传入后在 pill 内显示 ⓘ 按钮 */
  effectiveLimitsDetailed?: EffectiveLimitsDetailed
  /** Selection preset — Connected uses live social accounts */
  platformPreset?: PlatformPreset
  onPlatformPresetChange?: (preset: PlatformPreset) => void
  connectedCount?: number
}

/** 获取可用的平台列表（含 Pinterest / LinkedIn — draft publish targets） */
function getAvailablePlatforms(): [PlatType, { icon: string, name: string }][] {
  return DraftTargetPlatInfoArr.map(([plat, info]) => [plat, { icon: info.icon, name: info.name }])
}

const PlatformSelector = memo(
  ({
    selectedPlatforms,
    onPlatformsChange,
    pillClass,
    disabledPlatforms,
    effectiveLimitsDetailed,
    platformPreset = 'connected',
    onPlatformPresetChange,
    connectedCount = 0,
  }: PlatformSelectorProps) => {
    const { t } = useTransClient('brandPromotion')
    const [open, setOpen] = useState(false)
    const isMobile = useIsMobile()

    const availablePlatforms = useMemo(() => getAvailablePlatforms(), [])

    const handleToggle = useCallback(
      (plat: PlatType) => {
        // 禁用平台不可点击
        if (disabledPlatforms?.has(plat))
          return

        onPlatformPresetChange?.('custom')
        if (selectedPlatforms.includes(plat)) {
          onPlatformsChange(selectedPlatforms.filter(p => p !== plat))
        }
        else {
          onPlatformsChange([...selectedPlatforms, plat])
        }
      },
      [selectedPlatforms, onPlatformsChange, disabledPlatforms, onPlatformPresetChange],
    )

    const handleSelectAll = useCallback(() => {
      // 全选时只选兼容平台
      const compatiblePlatforms = availablePlatforms
        .filter(([plat]) => !disabledPlatforms?.has(plat))
        .map(([plat]) => plat)
      onPlatformPresetChange?.('all')
      onPlatformsChange(compatiblePlatforms)
    }, [availablePlatforms, onPlatformsChange, disabledPlatforms, onPlatformPresetChange])

    const handleDeselectAll = useCallback(() => {
      onPlatformPresetChange?.('custom')
      onPlatformsChange([])
    }, [onPlatformsChange, onPlatformPresetChange])

    const compatibleCount = useMemo(
      () => availablePlatforms.filter(([plat]) => !disabledPlatforms?.has(plat)).length,
      [availablePlatforms, disabledPlatforms],
    )

    const isAllSelected = selectedPlatforms.length === compatibleCount && compatibleCount > 0

    // 选中平台中不兼容的数量
    const disabledSelectedCount = useMemo(
      () => selectedPlatforms.filter(p => disabledPlatforms?.has(p)).length,
      [selectedPlatforms, disabledPlatforms],
    )

    // 不兼容平台名称列表（用于 Tooltip）
    const disabledSelectedNames = useMemo(() => {
      if (!disabledSelectedCount)
        return []
      return selectedPlatforms
        .filter(p => disabledPlatforms?.has(p))
        .map(p => AccountPlatInfoMap.get(p)?.name)
        .filter(Boolean) as string[]
    }, [selectedPlatforms, disabledPlatforms, disabledSelectedCount])

    // pill 展示内容
    const pillContent = useMemo(() => {
      if (selectedPlatforms.length === 0) {
        return (
          <>
            <Globe className="h-3.5 w-3.5" />
            {t('detail.selectPlatforms')}
          </>
        )
      }

      // 展示所有选中平台图标 + 数量
      return (
        <>
          <span className="flex items-center -space-x-1">
            {selectedPlatforms.map((plat) => {
              const info = AccountPlatInfoMap.get(plat)
              if (!info)
                return null
              return (
                <Image
                  key={plat}
                  src={info.icon}
                  alt={info.name}
                  width={14}
                  height={14}
                  className={cn(
                    'rounded-full ring-1 ring-background',
                    disabledPlatforms?.has(plat) && 'opacity-40 grayscale',
                  )}
                />
              )
            })}
          </span>
          {t('detail.platformsSelected', { count: selectedPlatforms.length })}
          {disabledSelectedCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-amber-500">
              <TriangleAlert className="h-3 w-3" />
              <span className="text-[10px]">{disabledSelectedCount}</span>
            </span>
          )}
        </>
      )
    }, [selectedPlatforms, t, disabledPlatforms, disabledSelectedCount])

    return (
      <div className={cn(pillClass, 'gap-0 p-0')}>
        <Popover open={open} onOpenChange={setOpen}>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 pl-3 py-1.5 cursor-pointer',
                      effectiveLimitsDetailed ? 'pr-1.5' : 'pr-3',
                    )}
                  >
                    {pillContent}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              {disabledSelectedCount > 0 && (
                <TooltipContent side="top" className="max-w-60 text-xs">
                  <div>
                    {t('detail.platformIncompatibleCount', { count: disabledSelectedCount })}
                  </div>
                  <div className="text-muted-foreground">{disabledSelectedNames.join(', ')}</div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <PopoverContent
            className="w-[min(22rem,calc(100vw-2rem))] min-w-[20rem] p-3.5"
            side="top"
            align="start"
            sideOffset={8}
          >
            {/* 不兼容警告 banner */}
            {disabledSelectedCount > 0 && (
              <div className="mb-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div>
                    {t('detail.platformIncompatibleCount', { count: disabledSelectedCount })}
                  </div>
                  <div className="break-words text-amber-600/70 dark:text-amber-400/70">
                    {disabledSelectedNames.join(', ')}
                  </div>
                </div>
              </div>
            )}

            {/* 标题 + 全选/取消 */}
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="shrink-0 text-[13px] font-semibold text-foreground">
                {t('detail.targetPlatforms')}
              </span>
              <button
                type="button"
                className="shrink-0 whitespace-nowrap text-xs text-primary hover:underline cursor-pointer"
                onClick={isAllSelected ? handleDeselectAll : handleSelectAll}
              >
                {isAllSelected ? t('detail.deselectAll') : t('detail.selectAll')}
              </button>
            </div>

            {/* Presets: Connected (default) · All · Custom — no wrap squeeze */}
            {onPlatformPresetChange && (
              <div className="mb-2.5 flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
                {([
                  ['connected', connectedCount ? `Connected (${connectedCount})` : 'Connected'],
                  ['all', 'All'],
                  ['custom', 'Custom'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      'min-w-0 flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-center text-[11px] font-medium transition-colors',
                      platformPreset === key
                        ? 'bg-foreground text-background shadow-sm'
                        : 'text-muted-foreground hover:bg-background/80 hover:text-foreground',
                    )}
                    onClick={() => onPlatformPresetChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {platformPreset === 'connected' && (
              <p className="mb-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Defaults to platforms with connected accounts. Falls back to all when none are linked.
              </p>
            )}

            {/* 平台网格 — wider cells, single-line labels */}
            <div className="grid grid-cols-2 gap-1.5">
              <TooltipProvider delayDuration={200}>
                {availablePlatforms.map(([plat, info]) => {
                  const isSelected = selectedPlatforms.includes(plat)
                  const disabledReasons = disabledPlatforms?.get(plat)
                  const isDisabled = !!disabledReasons

                  const button = (
                    <div
                      key={plat}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'flex min-h-[36px] items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] transition-colors select-none',
                        isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                        !isDisabled && isSelected
                          ? 'bg-primary/10 text-foreground ring-1 ring-primary/15'
                          : !isDisabled
                              ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              : 'text-muted-foreground',
                      )}
                      onClick={() => handleToggle(plat)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleToggle(plat)
                        }
                      }}
                    >
                      {isDisabled ? (
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <Checkbox
                          checked={isSelected}
                          className="h-3.5 w-3.5 shrink-0 pointer-events-none data-[state=checked]:border-brand-purple/35 data-[state=checked]:bg-brand-purple/15 data-[state=checked]:text-brand-purple"
                          tabIndex={-1}
                        />
                      )}
                      <Image
                        src={info.icon}
                        alt={info.name}
                        width={18}
                        height={18}
                        className={cn('h-[18px] w-[18px] shrink-0 rounded-sm', isDisabled && 'grayscale')}
                      />
                      <span className={cn('min-w-0 flex-1 truncate font-medium', isDisabled && 'line-through')}>
                        {info.name}
                      </span>
                    </div>
                  )

                  if (isDisabled) {
                    if (isMobile) {
                      return (
                        <div key={plat} className="col-span-2">
                          {button}
                          <div className="px-2.5 pb-1.5 text-[10px] leading-tight text-amber-600/80 dark:text-amber-400/70">
                            {disabledReasons.map((reason, i) => (
                              <div key={i}>{reason}</div>
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <Tooltip key={plat}>
                        <TooltipTrigger asChild>{button}</TooltipTrigger>
                        <TooltipContent side="top" className="max-w-60 text-xs">
                          {disabledReasons.map((reason, i) => (
                            <div key={i}>{reason}</div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return button
                })}
              </TooltipProvider>
            </div>
          </PopoverContent>
        </Popover>
        {/* ⓘ 参数限制按钮 */}
        {effectiveLimitsDetailed && (
          <div
            className="border-l border-border flex items-center"
            onClick={e => e.stopPropagation()}
          >
            <PlatformLimitsInfo
              selectedPlatforms={selectedPlatforms}
              limitsDetailed={effectiveLimitsDetailed}
            />
          </div>
        )}
      </div>
    )
  },
)

PlatformSelector.displayName = 'PlatformSelector'

export default PlatformSelector
