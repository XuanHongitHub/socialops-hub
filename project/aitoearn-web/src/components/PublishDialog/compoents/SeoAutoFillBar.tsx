/**
 * SEO Auto-fill — job-queue style progress (like draft generation cards).
 */
'use client'

import type { PlatType } from '@/app/config/platConfig'
import { AccountPlatInfoMap } from '@/app/config/platConfig'
import {
  Check,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { memo, useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { applySmartPublishDefaults } from '@/components/PublishDialog/smartPublishPrefill'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

type ProviderId = 'auto' | 'grok' | '9router'
type Stage = 'idle' | 'queued' | 'writing' | 'applying' | 'done' | 'failed'
type PlatStatus = 'pending' | 'writing' | 'done' | 'error'

const STAGE_META: Record<Exclude<Stage, 'idle'>, { label: string, percent: number }> = {
  queued: { label: 'Queued', percent: 8 },
  writing: { label: 'Writing SEO packs', percent: 45 },
  applying: { label: 'Applying to accounts', percent: 82 },
  done: { label: 'Completed', percent: 100 },
  failed: { label: 'Failed', percent: 100 },
}

export const SeoAutoFillBar = memo(function SeoAutoFillBar({
  className,
}: {
  className?: string
}) {
  const { pubListChoosed, setOnePubParams } = usePublishDialog(
    useShallow(s => ({
      pubListChoosed: s.pubListChoosed,
      setOnePubParams: s.setOnePubParams,
    })),
  )
  const [provider, setProvider] = useState<ProviderId>('auto')
  const [stage, setStage] = useState<Stage>('idle')
  const [percent, setPercent] = useState(0)
  const [stageLabel, setStageLabel] = useState('')
  const [usedProvider, setUsedProvider] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [platStatus, setPlatStatus] = useState<Record<string, PlatStatus>>({})
  const [appliedCount, setAppliedCount] = useState(0)

  const platforms = useMemo(
    () => [...new Set(pubListChoosed.map(p => p.account.type))],
    [pubListChoosed],
  )

  const sample = pubListChoosed[0]
  const busy = stage === 'queued' || stage === 'writing' || stage === 'applying'

  const setPhase = (next: Exclude<Stage, 'idle'>, label?: string) => {
    setStage(next)
    setPercent(STAGE_META[next].percent)
    setStageLabel(label || STAGE_META[next].label)
  }

  const dismiss = useCallback(() => {
    if (busy)
      return
    setStage('idle')
    setPercent(0)
    setStageLabel('')
    setErrorMsg('')
    setPlatStatus({})
    setAppliedCount(0)
    setUsedProvider('')
  }, [busy])

  const run = useCallback(async () => {
    if (!pubListChoosed.length) {
      toast.warning('Select at least one account')
      return
    }

    const initialStatus: Record<string, PlatStatus> = {}
    for (const p of platforms)
      initialStatus[p] = 'pending'
    setPlatStatus(initialStatus)
    setAppliedCount(0)
    setErrorMsg('')
    setUsedProvider('')
    setPhase('queued')

    await new Promise(r => setTimeout(r, 180))
    setPhase('writing', provider === 'grok' ? 'Writing via Grok…' : provider === '9router' ? 'Writing via 9Router…' : 'Writing via Auto…')
    for (const p of platforms)
      setPlatStatus(prev => ({ ...prev, [p]: 'writing' }))

    try {
      const res = await fetch('/api/ai/publish-seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          platforms,
          title: sample?.params.title,
          des: sample?.params.des,
          topics: sample?.params.topics,
          productTitle: sample?.params.title,
          productNotes: sample?.params.des,
        }),
      })
      const body = await res.json()
      if (body.code !== 0)
        throw new Error(body.message || 'SEO generate failed')

      const packs = (body.data?.packs || {}) as Record<
        string,
        { title: string, des: string, topics: string[] }
      >
      const used = String(body.data?.provider || provider)
      setUsedProvider(used)
      setPhase('applying', `Applying · ${used}`)

      let applied = 0
      for (const item of pubListChoosed) {
        const plat = item.account.type as PlatType
        const pack = packs[plat]
        if (!pack) {
          setPlatStatus(prev => ({ ...prev, [plat]: 'error' }))
          continue
        }
        const smart = applySmartPublishDefaults(
          {
            title: pack.title,
            des: pack.des,
            topics: pack.topics,
            option: item.params.option,
          },
          plat,
        )
        setOnePubParams(
          {
            title: smart.title,
            des: smart.des,
            topics: smart.topics,
            option: smart.option,
          },
          item.account.id,
        )
        setPlatStatus(prev => ({ ...prev, [plat]: 'done' }))
        applied++
        setAppliedCount(applied)
        setPercent(82 + Math.round((applied / Math.max(1, pubListChoosed.length)) * 16))
        await new Promise(r => setTimeout(r, 60))
      }

      // Text fill alone is not enough — fix video dims (IG/YT) + auto-pick Pinterest board
      setPhase('applying', 'Fixing media & boards…')
      try {
        const { ensureAllAccountsPublishReady } = await import(
          '@/components/PublishDialog/ensurePublishReady'
        )
        // Re-read latest store state after text apply
        const { usePublishDialog } = await import('@/components/PublishDialog/usePublishDialog')
        const latest = usePublishDialog.getState().pubListChoosed
        await ensureAllAccountsPublishReady(latest, setOnePubParams, '9:16')
      }
      catch (fixErr) {
        console.warn('[seo-fill] ensurePublishReady', fixErr)
      }

      setPhase('done', applied > 0 ? `Filled ${applied} account(s)` : 'No packs returned')
      setPercent(100)
      if (applied > 0)
        toast.success(`SEO filled · ${applied} account(s) · ${used}`)
      else
        toast.warning('No packs returned — try another provider')
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMsg(msg)
      setPhase('failed', 'SEO fill failed')
      for (const p of platforms)
        setPlatStatus(prev => (prev[p] === 'done' ? prev : { ...prev, [p]: 'error' }))
      toast.error(msg)
    }
  }, [provider, platforms, pubListChoosed, sample, setOnePubParams])

  if (!pubListChoosed.length)
    return null

  return (
    <div
      data-testid="publish-seo-autofill"
      className={cn(
        'overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {busy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : stage === 'done'
                ? <Check className="h-4 w-4" />
                : <Sparkles className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold tracking-tight text-foreground">
              SEO auto-fill
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {stage === 'idle'
                ? 'Title · caption · tags per platform limits'
                : stageLabel}
              {usedProvider && stage !== 'idle' ? ` · ${usedProvider}` : ''}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto">
        <Select value={provider} onValueChange={v => setProvider(v as ProviderId)} disabled={busy}>
          <SelectTrigger className="h-8 w-[min(148px,100%)] shrink-0 rounded-full text-[12px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto (Grok→9Router)</SelectItem>
            <SelectItem value="grok">Grok pool</SelectItem>
            <SelectItem value="9router">9Router</SelectItem>
          </SelectContent>
        </Select>

        {stage !== 'idle' && stage !== 'queued' && stage !== 'writing' && stage !== 'applying' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 gap-1.5 rounded-full px-3.5"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? 'Running…' : stage === 'done' ? 'Run again' : 'Fill all platforms'}
        </Button>
        </div>
      </div>

      {/* Progress body — mirrors generation job card */}
      {stage !== 'idle' && (
        <div className="space-y-3 px-3 py-3">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className={cn(
              'font-medium tabular-nums',
              stage === 'failed' ? 'text-destructive' : 'text-foreground',
            )}
            >
              {percent}
              %
            </span>
            <span className="truncate text-muted-foreground">
              {stage === 'done' && appliedCount > 0
                ? `${appliedCount}/${pubListChoosed.length} accounts`
                : stageLabel}
            </span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-out',
                stage === 'failed' ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${percent}%` }}
              data-testid="publish-seo-progress-bar"
            />
          </div>

          {errorMsg && (
            <p className="text-[11px] leading-snug text-destructive">{errorMsg}</p>
          )}

          {/* Per-platform chips */}
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((plat) => {
              const info = AccountPlatInfoMap.get(plat as PlatType)
              const st = platStatus[plat] || 'pending'
              return (
                <div
                  key={plat}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]',
                    st === 'done' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                    st === 'writing' && 'border-primary/30 bg-primary/10 text-foreground',
                    st === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
                    st === 'pending' && 'border-border bg-muted/40 text-muted-foreground',
                  )}
                >
                  {info?.icon && (
                    <Image src={info.icon} alt="" width={12} height={12} className="rounded-full" />
                  )}
                  <span className="font-medium">{info?.name || plat}</span>
                  {st === 'writing' && <Loader2 className="h-3 w-3 animate-spin opacity-70" />}
                  {st === 'done' && <Check className="h-3 w-3" />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})
