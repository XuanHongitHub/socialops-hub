'use client'

/**
 * Photo Post — same shell / rhythm as AiBatchGenerateBar:
 * single border card · product chip · media + copy · pill toolbar · primary submit.
 */

import type { ProductPickerSelection } from '@/components/BugSell/ProductPicker'
import type { PlatType } from '@/app/config/platConfig'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  ArrowUp,
  CalendarClock,
  ImagePlus,
  Loader2,
  Rocket,
  Sparkles,
  X,
} from 'lucide-react'
import PlatformSelector from '@/app/[lng]/draft-box/components/AiBatchGenerateBar/PlatformSelector'
import { getConnectedPlatforms, resolvePlatformsByPreset } from '@/app/[lng]/draft-box/utils/connectedPlatforms'
import { usePlanDetailStore } from '@/app/[lng]/brand-promotion/planDetailStore'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import { BugSellMark } from '@/components/BugSell/BugSellMark'
import { BugSellProductPicker } from '@/components/BugSell/ProductPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  SOCIAL_OPS_CARD_CLASS,
  SOCIAL_OPS_PILL_CLASS,
  SOCIAL_OPS_PRODUCT_CHIP_CLASS,
  SOCIAL_OPS_PRODUCT_THUMB_CLASS,
} from '@/lib/socialOps/socialOpsShell'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAccountStore } from '@/store/account'

type PlatformPack = { title: string, caption: string, hashtags: string[] }

type Props = {
  groupId?: string
  onSaved?: () => void
}

const pillClass = SOCIAL_OPS_PILL_CLASS

export function PhotoPostPanel({ groupId, onSaved }: Props) {
  const accountList = useAccountStore(s => s.accountList)
  const openPublishDialog = usePlanDetailStore(s => s.openPublishDialog)
  const connected = useMemo(() => getConnectedPlatforms(accountList), [accountList])
  const [platforms, setPlatforms] = useState<PlatType[]>(() => resolvePlatformsByPreset('connected', accountList))
  const [preset, setPreset] = useState<'connected' | 'all' | 'custom'>('connected')
  const [product, setProduct] = useState<ProductPickerSelection | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [genImage, setGenImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [masterTitle, setMasterTitle] = useState('')
  const [masterCaption, setMasterCaption] = useState('')
  const [packs, setPacks] = useState<Record<string, PlatformPack>>({})
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [scheduleAt, setScheduleAt] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)

  useEffect(() => {
    if (preset !== 'connected')
      return
    setPlatforms(resolvePlatformsByPreset('connected', accountList))
  }, [accountList, preset])

  const applyProduct = useCallback((selection: ProductPickerSelection) => {
    setProduct(selection)
    setImageUrls(selection.thumbnailUrl ? [selection.thumbnailUrl] : [])
    setMasterTitle(selection.productTitle)
    setMasterCaption('')
    setPacks({})
    setMaterialId(null)
    setPickerOpen(false)
    toast.success('Product ready for photo post')
  }, [])

  const clearProduct = useCallback(() => {
    setProduct(null)
    setImageUrls([])
    setMasterTitle('')
    setMasterCaption('')
    setPacks({})
    setMaterialId(null)
  }, [])

  const runGenerate = async () => {
    if (!groupId) {
      toast.error('Select a content plan first')
      return
    }
    if (!product && imageUrls.length === 0) {
      toast.warning('Product photo required — pick BugSell product')
      return
    }
    if (platforms.length === 0) {
      toast.warning('Select at least one platform')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/ai/draft-generation/photo-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          productTitle: product?.productTitle || masterTitle,
          productUrl: product?.productUrl,
          productNotes: product?.productNotes,
          productImageUrl: product?.thumbnailUrl || imageUrls[0],
          imageUrls,
          platforms,
          genImage,
        }),
      })
      const body = await res.json()
      if (body.code !== 0)
        throw new Error(body.message || 'Photo post failed')
      const data = body.data || {}
      setImageUrls(Array.isArray(data.imageUrls) ? data.imageUrls : imageUrls)
      setMasterTitle(data.master?.title || masterTitle)
      setMasterCaption(data.master?.caption || '')
      setPacks(data.platforms || {})
      setMaterialId(data.materialId || data.material?.id || null)
      toast.success('Captions generated · draft saved')
      onSaved?.()
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
    finally {
      setBusy(false)
    }
  }

  const publishNow = () => {
    if (!materialId) {
      toast.warning('Generate draft first')
      return
    }
    const firstPack = packs[platforms[0]] || { title: masterTitle, caption: masterCaption, hashtags: [] as string[] }
    openPublishDialog({
      id: materialId,
      groupId: groupId || '',
      title: firstPack.title || masterTitle,
      desc: [
        firstPack.caption || masterCaption,
        ...(firstPack.hashtags || []).map(h => (h.startsWith('#') ? h : `#${h}`)),
        product?.productUrl,
      ].filter(Boolean).join('\n'),
      coverUrl: imageUrls[0],
      mediaList: imageUrls.map(url => ({ url, type: 'img' as const })),
      status: 1,
      topics: firstPack.hashtags || [],
      type: 'article' as any,
    })
  }

  const canSubmit = Boolean(groupId && (product || imageUrls.length > 0) && platforms.length > 0)

  return (
    <div
      data-testid="photo-post-panel"
      className={SOCIAL_OPS_CARD_CLASS}
    >
      {/* Product chip — same strip as generate BugSell chip */}
      {product
        ? (
            <div
              data-testid="photo-post-product-chip"
              className={SOCIAL_OPS_PRODUCT_CHIP_CLASS}
            >
              <div className={SOCIAL_OPS_PRODUCT_THUMB_CLASS}>
                {product.thumbnailUrl
                  ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    )
                  : (
                      <div className="grid h-full place-items-center text-[10px] text-muted-foreground">SKU</div>
                    )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <BugSellMark size={14} className="rounded-sm" />
                  BugSell · photo post
                </div>
                <div className="truncate text-[13px] font-semibold tracking-tight">{product.productTitle}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {product.productNotes || product.productUrl}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 rounded-lg text-[12px] text-muted-foreground"
                onClick={() => setPickerOpen(true)}
              >
                Change
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Clear product"
                onClick={clearProduct}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        : null}

      {/* Main composition row: photos + copy (mirrors ImageStack + prompt) */}
      <div className="flex flex-col items-stretch gap-3 p-4 pb-2 sm:flex-row sm:items-start">
        {/* Photo stack */}
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          <div className="flex items-start gap-2 pt-0.5">
            {imageUrls.length > 0
              ? (
                  <div className="flex flex-wrap gap-2">
                    {imageUrls.map((url, i) => (
                      <div
                        key={`${url}-${i}`}
                        className={cn(
                          'relative overflow-hidden rounded-xl border border-border/80 bg-muted shadow-sm',
                          i === 0 ? 'h-[104px] w-[78px]' : 'h-[72px] w-[54px] opacity-90',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-px text-[9px] font-medium text-white">
                            Photo
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={cn(
                      'flex h-[104px] w-[78px] flex-col items-center justify-center gap-1.5',
                      'rounded-xl border border-dashed border-border/90 bg-muted/20',
                      'text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-muted/40 hover:text-foreground',
                    )}
                    title="Pick product photo"
                  >
                    <ImagePlus className="h-5 w-5 opacity-70" />
                    <span className="text-[10px] font-medium">Add</span>
                  </button>
                )}
          </div>
        </div>

        {/* Title + caption — primary edit surface */}
        <div className="relative min-w-0 flex-1 space-y-2">
          <Input
            data-testid="photo-post-title"
            value={masterTitle}
            onChange={e => setMasterTitle(e.target.value)}
            placeholder="Title"
            className="h-9 border-0 bg-transparent px-0 text-[14px] font-semibold shadow-none focus-visible:ring-0"
          />
          <Textarea
            data-testid="photo-post-caption"
            value={masterCaption}
            onChange={e => setMasterCaption(e.target.value)}
            placeholder={product ? 'Caption for social platforms…' : 'Pick a BugSell product, then generate multi-platform captions'}
            className={cn(
              'min-h-[100px] max-h-[160px] resize-none border-0 bg-transparent px-0 py-0',
              'text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0',
            )}
            rows={4}
          />
        </div>
      </div>

      {/* Empty product CTA when no chip */}
      {!product && (
        <div className="px-4 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="photo-post-bugsell-pick"
              onClick={() => setPickerOpen(true)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border/80',
                'bg-transparent px-2.5 text-[12px] font-medium text-muted-foreground',
                'transition-colors hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground',
              )}
            >
              <BugSellMark size={18} className="rounded-md shadow-sm" />
              BugSell
              <span className="text-[10px] font-normal text-muted-foreground/80">product photo</span>
            </button>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Prefill image + title from catalog
            </span>
          </div>
        </div>
      )}

      {/* Platform caption packs — flat list, no nested card soup */}
      {Object.keys(packs).length > 0 && (
        <div className="mx-4 mb-2 space-y-1.5 border-t border-border/60 pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Platform packs
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {platforms.map((p) => {
              const pack = packs[p]
              if (!pack)
                return null
              const info = AccountPlatInfoMap.get(p)
              return (
                <div
                  key={p}
                  className="rounded-xl border border-border/80 bg-muted/15 px-3 py-2.5"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                    {info?.icon && (
                      <Image src={info.icon} alt="" width={14} height={14} className="rounded-full" />
                    )}
                    {info?.name || p}
                  </div>
                  <div className="line-clamp-1 text-[12px] font-medium leading-snug">{pack.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {pack.caption}
                  </div>
                  {(pack.hashtags?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pack.hashtags.slice(0, 6).map(h => (
                        <span
                          key={h}
                          className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] text-primary"
                        >
                          #
                          {h.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Toolbar — same language as generate ToolBarInline */}
      <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className={cn(pillClass, 'pointer-events-none opacity-90')}>
            <ImagePlus className="h-3.5 w-3.5" />
            Photo post
          </span>

          <PlatformSelector
            selectedPlatforms={platforms}
            onPlatformsChange={setPlatforms}
            pillClass={pillClass}
            platformPreset={preset}
            onPlatformPresetChange={setPreset}
            connectedCount={connected.length}
          />

          <button
            type="button"
            className={cn(
              pillClass,
              genImage && 'border-primary/20 bg-primary/10 text-foreground',
            )}
            onClick={() => setGenImage(v => !v)}
            title="Optional AI image generation"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI image
            {genImage ? ' · on' : ''}
          </button>

          <button
            type="button"
            className={cn(
              pillClass,
              showSchedule && 'border-primary/20 bg-primary/10 text-foreground',
            )}
            onClick={() => setShowSchedule(v => !v)}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Schedule
          </button>

          {materialId && (
            <span className="hidden font-mono text-[10px] text-muted-foreground md:inline">
              draft
              {' '}
              {materialId.slice(0, 8)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {materialId && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3.5"
              disabled={busy}
              onClick={publishNow}
            >
              <Rocket className="h-3.5 w-3.5" />
              Publish
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            data-testid="photo-post-submit"
            className="h-9 gap-1.5 rounded-full px-4 shadow-sm"
            disabled={busy || !canSubmit}
            onClick={() => void runGenerate()}
          >
            {busy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ArrowUp className="h-4 w-4" />}
            {busy ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>

      {showSchedule && (
        <div className="border-t border-border/50 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Publish time</label>
              <Input
                type="datetime-local"
                value={scheduleAt}
                onChange={e => setScheduleAt(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full"
              disabled={!materialId || !scheduleAt}
              onClick={() => {
                toast.info(`Schedule ${scheduleAt} — set time in Publish dialog`)
                publishNow()
              }}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Open schedule
            </Button>
          </div>
        </div>
      )}

      {busy && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-card/80">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-[12px] text-muted-foreground">Generating captions…</span>
        </div>
      )}

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl">
          <SheetHeader className="space-y-0 border-b border-border px-4 py-2.5 text-left">
            <SheetTitle className="flex items-center gap-2 text-[14px]">
              <BugSellMark size={18} className="rounded-md" />
              BugSell product
            </SheetTitle>
            <SheetDescription className="sr-only">Pick product image and metadata</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BugSellProductPicker embedded onSelect={applyProduct} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
