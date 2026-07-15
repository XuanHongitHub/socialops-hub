'use client'

import type {
  WorkspaceBundle,
  WorkspaceJob,
  WorkspaceProfile,
  WorkspaceRecipe,
} from '@/api/aiProviders'
import {
  getWorkspaceBundle,
  workspaceAction,
} from '@/api/aiProviders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/utils/ui/toast'
import { cn } from '@/utils/className'
import {
  Activity,
  Cable,
  CheckCircle2,
  Chrome,
  CircleDashed,
  FlaskConical,
  Layers3,
  Loader2,
  MonitorSmartphone,
  Plus,
  Puzzle,
  Radio,
  RefreshCw,
  Rocket,
  Settings2,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type NavKey = 'overview' | 'profiles' | 'packs' | 'auth' | 'live' | 'extension' | 'recipes' | 'jobs'

const NAV: Array<{ id: NavKey, label: string, hint: string, icon: typeof MonitorSmartphone }> = [
  { id: 'overview', label: 'Overview', hint: 'Status board', icon: Layers3 },
  { id: 'profiles', label: 'Profiles', hint: 'CDP & hybrid seats', icon: Chrome },
  { id: 'packs', label: 'Packs', hint: '4 automation + bridge', icon: Puzzle },
  { id: 'auth', label: 'Auth & sessions', hint: 'Vault · auto-login', icon: Settings2 },
  { id: 'live', label: 'CDP Live', hint: 'Smoke · targets', icon: Radio },
  { id: 'extension', label: 'Extension', hint: 'Bridge pair', icon: Puzzle },
  { id: 'recipes', label: 'Recipes', hint: 'Flows & steps', icon: Workflow },
  { id: 'jobs', label: 'Jobs', hint: 'Run history', icon: Activity },
]

function relativeTime(iso?: string) {
  if (!iso)
    return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms))
    return '—'
  const m = Math.floor(ms / 60000)
  if (m < 1)
    return 'just now'
  if (m < 60)
    return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48)
    return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function StatusDot({ status }: { status?: string }) {
  const s = (status || '').toLowerCase()
  const tone = s.includes('online') || s === 'active' || s === 'completed' || s === 'validated'
    ? 'bg-emerald-500'
    : s.includes('error') || s === 'failed'
      ? 'bg-rose-500'
      : s.includes('busy') || s === 'running' || s === 'queued'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40'
  return <span className={cn('inline-block h-2 w-2 rounded-full', tone)} />
}

function emptyBundle(): WorkspaceBundle {
  return {
    profiles: [],
    recipes: [],
    jobs: [],
    packs: [],
    bridges: [],
    activity: [],
    summary: { profileCount: 0, recipeCount: 0, jobCount: 0, onlineCount: 0, queuedJobs: 0, packsVerified: 0, packsTotal: 0 },
  }
}

export function WorkspaceConsole() {
  const [nav, setNav] = useState<NavKey>('overview')
  const [bundle, setBundle] = useState<WorkspaceBundle>(emptyBundle())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null)
  const [liveResult, setLiveResult] = useState<Record<string, unknown> | null>(null)

  // Form state
  const [profileName, setProfileName] = useState('Local Chrome DevTools')
  const [cdpEndpoint, setCdpEndpoint] = useState('http://127.0.0.1:9222')
  const [profileType, setProfileType] = useState('chrome')
  const [expectedHost, setExpectedHost] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [recipeName, setRecipeName] = useState('Assert open host')
  const [recipePlatform, setRecipePlatform] = useState('web')
  const [bridgePlatform, setBridgePlatform] = useState('multi')
  const [bridgeName, setBridgeName] = useState('Primary extension seat')
  const [credPlatform, setCredPlatform] = useState('grok')
  const [credEmail, setCredEmail] = useState('')
  const [credPassword, setCredPassword] = useState('')
  const [credList, setCredList] = useState<Array<{ platform: string, email: string, hasPassword?: boolean }>>([])
  const [sessionList, setSessionList] = useState<Array<{ platform: string, cookieCount: number, savedAt: string }>>([])
  const [pairInfo, setPairInfo] = useState<Record<string, unknown> | null>(null)
  // Social SEO media defaults (Hub-overridable) + Flow/VEO Automation v3.2.x
  const [mediaAspect, setMediaAspect] = useState('9:16')
  const [mediaDuration, setMediaDuration] = useState(10)
  const [mediaResolution, setMediaResolution] = useState('1080p')
  const [mediaApplyDraft, setMediaApplyDraft] = useState(true)
  const [mediaTagSeo, setMediaTagSeo] = useState(true)
  const [mediaProductNote, setMediaProductNote] = useState('9:16 · 10s · 1080p')
  const [flowMode, setFlowMode] = useState('textToVideo')
  const [flowVideoOption, setFlowVideoOption] = useState('10s')
  const [flowAspect, setFlowAspect] = useState('9:16')
  const [flowMaxRetries, setFlowMaxRetries] = useState(5)
  const [flowDlVideo, setFlowDlVideo] = useState('1080p')
  const [flowDlImage, setFlowDlImage] = useState('1K')
  const [flowImageMode, setFlowImageMode] = useState('createNew')
  const [flowLanguage, setFlowLanguage] = useState('vi')
  const [flowModel, setFlowModel] = useState('Veo 3.1 - Lite')
  const [flowImageModel, setFlowImageModel] = useState('🍌 Nano Banana 2')
  const [flowOutputCount, setFlowOutputCount] = useState(1)
  const [flowConcurrent, setFlowConcurrent] = useState(1)
  const [flowDelayMin, setFlowDelayMin] = useState(20)
  const [flowDelayMax, setFlowDelayMax] = useState(30)
  const [pushToSeats, setPushToSeats] = useState(true)
  const [lastPushNote, setLastPushNote] = useState('')
  const [remoteConfigRows, setRemoteConfigRows] = useState<Array<{
    packId: string
    shortName: string
    mirrored: boolean
    fetchedAt?: string
    source?: string
    summary?: { selectorCount?: number, version?: string }
  }>>([])
  const [remoteConfigNote, setRemoteConfigNote] = useState('')

  const selectedProfile = useMemo(
    () => bundle.profiles.find(p => p.id === selectedProfileId) || bundle.profiles[0] || null,
    [bundle.profiles, selectedProfileId],
  )
  const selectedRecipe = useMemo(
    () => bundle.recipes.find(r => r.id === selectedRecipeId) || bundle.recipes[0] || null,
    [bundle.recipes, selectedRecipeId],
  )

  const refresh = useCallback(async () => {
    try {
      const res = await getWorkspaceBundle()
      if (res?.code === 0 && res.data) {
        setBundle(res.data)
        if (!selectedProfileId && res.data.profiles[0])
          setSelectedProfileId(res.data.profiles[0].id)
        if (!selectedRecipeId && res.data.recipes[0])
          setSelectedRecipeId(res.data.recipes[0].id)
      }
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load workspace')
    }
    finally {
      setLoading(false)
    }
  }, [selectedProfileId, selectedRecipeId])

  const loadMediaDefaults = useCallback(async () => {
    try {
      const res = await workspaceAction({ action: 'get_media_defaults' })
      if (res?.code !== 0 || !res.data)
        return
      const d = (res.data as any).defaults || {}
      const s = (res.data as any).settings || {}
      const p = (res.data as any).product || {}
      if (d.aspectRatio)
        setMediaAspect(String(d.aspectRatio))
      if (d.duration)
        setMediaDuration(Number(d.duration) || 10)
      if (d.resolution)
        setMediaResolution(String(d.resolution))
      setMediaApplyDraft(s.applyToDraftGeneration !== false)
      setMediaTagSeo(s.tagSeo !== false)
      if (p.aspectRatio && p.duration && p.resolution)
        setMediaProductNote(`${p.aspectRatio} · ${p.duration}s · ${p.resolution}`)
      const f = (res.data as any).flowVeo || s.flowVeo || {}
      if (f.defaultMode)
        setFlowMode(String(f.defaultMode))
      if (f.defaultVideoOption)
        setFlowVideoOption(String(f.defaultVideoOption))
      if (f.aspectRatio)
        setFlowAspect(String(f.aspectRatio))
      if (f.maxRetries != null)
        setFlowMaxRetries(Number(f.maxRetries) || 5)
      if (f.autoDownloadQualityVideo)
        setFlowDlVideo(String(f.autoDownloadQualityVideo))
      if (f.autoDownloadQualityImage)
        setFlowDlImage(String(f.autoDownloadQualityImage))
      if (f.defaultImageModeOption)
        setFlowImageMode(String(f.defaultImageModeOption))
      if (f.language)
        setFlowLanguage(String(f.language))
      if (typeof f.model === 'string')
        setFlowModel(f.model)
      if (typeof f.imageModel === 'string')
        setFlowImageModel(f.imageModel)
      if (f.outputCount != null)
        setFlowOutputCount(Math.min(4, Math.max(1, Number(f.outputCount) || 1)))
      if (f.concurrentPrompts != null)
        setFlowConcurrent(Math.min(6, Math.max(1, Number(f.concurrentPrompts) || 1)))
      if (f.promptDelaySecondsMin != null)
        setFlowDelayMin(Math.max(0, Number(f.promptDelaySecondsMin) || 20))
      if (f.promptDelaySecondsMax != null)
        setFlowDelayMax(Math.max(0, Number(f.promptDelaySecondsMax) || 30))
    }
    catch {
      // non-fatal
    }
  }, [])

  const loadRemoteConfigs = useCallback(async () => {
    try {
      const res = await workspaceAction({ action: 'list_remote_configs' })
      if (res?.code !== 0 || !res.data)
        return
      const packs = Array.isArray((res.data as any).packs) ? (res.data as any).packs : []
      setRemoteConfigRows(packs)
      const mirrored = packs.filter((p: any) => p.mirrored).length
      setRemoteConfigNote(`${mirrored}/${packs.length} mirrored · Hub first, author CDN fallback`)
    }
    catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    void refresh()
    void loadMediaDefaults()
    void loadRemoteConfigs()
    const t = setInterval(() => void refresh(), 12000)
    return () => clearInterval(t)
  }, [refresh, loadMediaDefaults, loadRemoteConfigs])

  const run = useCallback(async (payload: Record<string, unknown>, okMsg?: string) => {
    setBusy(true)
    try {
      const res = await workspaceAction(payload)
      if (res?.code !== 0)
        throw new Error(res?.message || 'Action failed')
      if (okMsg)
        toast.success(okMsg)
      if (payload.action === 'smoke_profile' || payload.action === 'run_recipe')
        setLiveResult(res.data || null)
      await refresh()
      return res.data
    }
    catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      return null
    }
    finally {
      setBusy(false)
    }
  }, [refresh])

  const saveMediaDefaults = async (reset = false) => {
    const data = await run({
      action: 'save_media_defaults',
      reset,
      applyToDraftGeneration: mediaApplyDraft,
      tagSeo: mediaTagSeo,
      overrides: reset
        ? undefined
        : {
            aspectRatio: mediaAspect,
            duration: mediaDuration,
            resolution: mediaResolution,
          },
      flowVeo: reset
        ? undefined
        : {
            defaultMode: flowMode,
            defaultVideoOption: flowVideoOption,
            aspectRatio: flowAspect,
            maxRetries: flowMaxRetries,
            autoDownloadQualityVideo: flowDlVideo,
            autoDownloadQualityImage: flowDlImage,
            defaultImageModeOption: flowImageMode,
            language: flowLanguage,
            model: flowModel,
            imageModel: flowImageModel,
            outputCount: flowOutputCount,
            concurrentPrompts: flowConcurrent,
            promptDelaySecondsMin: flowDelayMin,
            promptDelaySecondsMax: Math.max(flowDelayMin, flowDelayMax),
          },
      pushToSeats: !reset && pushToSeats,
    }, reset ? 'Reset to product defaults (Flow 10s)' : 'Media + Flow/VEO defaults saved')
    if (data && typeof data === 'object' && 'defaults' in (data as object)) {
      const d = (data as any).defaults
      setMediaAspect(String(d.aspectRatio || '9:16'))
      setMediaDuration(Number(d.duration) || 10)
      setMediaResolution(String(d.resolution || '1080p'))
      const f = (data as any).flowVeo
      if (f) {
        if (f.defaultMode)
          setFlowMode(String(f.defaultMode))
        if (f.defaultVideoOption)
          setFlowVideoOption(String(f.defaultVideoOption))
        if (f.aspectRatio)
          setFlowAspect(String(f.aspectRatio))
        if (f.maxRetries != null)
          setFlowMaxRetries(Number(f.maxRetries) || 5)
        if (f.outputCount != null)
          setFlowOutputCount(Number(f.outputCount) || 1)
      }
      const sp = (data as any).seatPush
      if (sp?.summary) {
        setLastPushNote(
          `Seats ${sp.summary.seats}: ${sp.summary.packOk} pack ok / ${sp.summary.packFail} fail · outputCount=1`,
        )
      }
    }
    else {
      await loadMediaDefaults()
    }
  }

  const pushPackSettingsToSeats = async () => {
    // Flow-only by default — do not open ChatGPT/Grok/Gemini side panels
    const data = await run({
      action: 'push_extension_settings',
      packIds: ['flow-automation'],
      closeSidePanels: true,
    }, 'Pushed Flow settings to seats (Flow only)')
    if (data && typeof data === 'object' && 'summary' in (data as object)) {
      const s = (data as any).summary
      const packs = Array.isArray((data as any).pushedPackIds)
        ? (data as any).pushedPackIds.join(',')
        : 'flow-automation'
      setLastPushNote(
        `Seats ${s.seats}: ${s.packOk} ok / ${s.packFail} fail · packs=[${packs}] · closed ${s.sidePanelsClosed ?? 0} side-panel tabs`,
      )
    }
  }

  const syncRemoteConfigs = async () => {
    const data = await run({
      action: 'sync_remote_configs',
      seedDir: 'F:/Herd/AiToEarn/project/aitoearn-web/artifacts/e2e-scratch/remote-configs',
    }, 'Remote configs synced from author → Hub')
    await loadRemoteConfigs()
    if (data && typeof data === 'object' && 'results' in (data as object)) {
      const results = (data as any).results as Array<{ ok: boolean }>
      const ok = results.filter(r => r.ok).length
      toast.success(`Synced ${ok}/${results.length} packs`)
    }
  }

  const saveProfile = async () => {
    const data = await run({
      action: 'upsert_profile',
      id: selectedProfile?.kind === 'cdp' || selectedProfile?.kind === 'hybrid' ? selectedProfile.id : undefined,
      name: profileName.trim() || 'CDP profile',
      kind: 'cdp',
      cdpEndpoint,
      profileType,
      expectedHost: expectedHost || undefined,
      proxyUrl: proxyUrl || undefined,
      status: 'active',
    }, 'Profile saved')
    if (data && typeof data === 'object' && 'id' in data)
      setSelectedProfileId(String((data as WorkspaceProfile).id))
  }

  const smokeSelected = async () => {
    await run({
      action: 'smoke_profile',
      profileId: selectedProfile?.id,
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
      expectedHost: selectedProfile?.expectedHost || expectedHost || undefined,
    }, 'Smoke finished')
    setNav('live')
  }

  const saveRecipe = async () => {
    const data = await run({
      action: 'save_recipe',
      name: recipeName.trim() || 'Recipe',
      platform: recipePlatform,
      profileId: selectedProfile?.id,
      mode: 'cdp',
      steps: [
        { type: 'list_targets' },
        { type: 'assert_host' },
        { type: 'screenshot' },
      ],
      settings: { expectedHost: expectedHost || selectedProfile?.expectedHost },
    }, 'Recipe saved')
    if (data && typeof data === 'object' && 'id' in data)
      setSelectedRecipeId(String((data as WorkspaceRecipe).id))
  }

  const runRecipe = async (dryRun = true) => {
    await run({
      action: 'run_recipe',
      recipeId: selectedRecipe?.id,
      profileId: selectedProfile?.id,
      name: selectedRecipe?.name || recipeName,
      platform: selectedRecipe?.platform || recipePlatform,
      mode: 'cdp',
      dryRun,
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
      expectedHost: expectedHost || selectedProfile?.expectedHost,
      steps: selectedRecipe?.steps || [
        { type: 'list_targets' },
        { type: 'assert_host' },
      ],
    }, dryRun ? 'Dry-run validated' : 'Recipe executed')
    setNav('live')
  }

  const registerBridge = async () => {
    const data = await run({
      action: 'register_bridge',
      name: bridgeName.trim() || 'Extension bridge',
      platform: bridgePlatform,
      profileId: selectedProfile?.id || 'primary',
    }, 'Bridge registered')
    if (data && typeof data === 'object' && (data as any).profile?.id)
      setSelectedProfileId(String((data as any).profile.id))
    if (data && typeof data === 'object' && (data as any).bridgeToken) {
      const token = String((data as any).bridgeToken)
      try {
        await navigator.clipboard.writeText(token)
        toast.success('Bridge token copied — paste into SocialOps Bridge popup')
      }
      catch {
        toast.success(`Bridge token: ${token.slice(0, 8)}…`)
      }
    }
    setNav('extension')
  }

  const preparePrimarySeat = async () => {
    const data = await run({
      action: 'prepare_primary_seat',
      seatId: 'primary',
      name: 'Primary browser seat',
      cdpPort: 9480,
      openLogins: true,
      force: true,
      browserEngine: 'auto', // Cloak v146 if installed, else Chrome
    }, 'Primary seat launched with automation packs')
    if (data && typeof data === 'object' && (data as any).profile?.id)
      setSelectedProfileId(String((data as any).profile.id))
    if (data && typeof data === 'object' && (data as any).launch?.cdpEndpoint)
      setCdpEndpoint(String((data as any).launch.cdpEndpoint))
    setNav('packs')
  }

  const probeLogins = async () => {
    await run({
      action: 'probe_logins',
      profileId: selectedProfile?.id || 'primary',
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
    }, 'Login probe finished')
  }

  const openLoginTabs = async () => {
    await run({
      action: 'open_login_tabs',
      profileId: selectedProfile?.id || 'primary',
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
    }, 'Login tabs opened')
  }

  const refreshAuthMeta = useCallback(async () => {
    try {
      const [creds, sessions, pair] = await Promise.all([
        workspaceAction({ action: 'list_credentials' }),
        workspaceAction({ action: 'list_sessions', profileId: selectedProfile?.id || 'primary' }),
        workspaceAction({ action: 'get_pair_status' }),
      ])
      if (creds?.code === 0 && (creds.data as any)?.credentials)
        setCredList((creds.data as any).credentials)
      if (sessions?.code === 0 && (sessions.data as any)?.sessions)
        setSessionList((sessions.data as any).sessions)
      if (pair?.code === 0)
        setPairInfo((pair.data as any) || null)
    }
    catch { /* ignore */ }
  }, [selectedProfile?.id])

  useEffect(() => {
    if (nav === 'auth' || nav === 'extension' || nav === 'overview')
      void refreshAuthMeta()
  }, [nav, refreshAuthMeta])

  const saveCredential = async () => {
    await run({
      action: 'save_credential',
      platform: credPlatform,
      email: credEmail.trim(),
      password: credPassword,
    }, `Saved ${credPlatform} vault entry`)
    setCredPassword('')
    await refreshAuthMeta()
  }

  const exportSessions = async () => {
    await run({
      action: 'export_sessions',
      profileId: selectedProfile?.id || 'primary',
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
    }, 'Sessions exported from seat cookies')
    await refreshAuthMeta()
  }

  const restoreSessions = async () => {
    await run({
      action: 'restore_sessions',
      profileId: selectedProfile?.id || 'primary',
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
    }, 'Sessions restored into seat')
    await probeLogins()
  }

  const autoLoginOne = async (platform: string) => {
    await run({
      action: 'auto_login',
      platform,
      profileId: selectedProfile?.id || 'primary',
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
    }, `Assisted login: ${platform} — finish CAPTCHA/2FA if shown`)
  }

  const autoLoginAll = async () => {
    await run({
      action: 'auto_login_all',
      profileId: selectedProfile?.id || 'primary',
      cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
    }, 'Assisted login all platforms — complete challenges, then Export sessions')
  }

  const deleteSelected = async () => {
    if (!selectedProfile)
      return
    await run({ action: 'delete_profile', id: selectedProfile.id }, 'Profile deleted')
    setSelectedProfileId(null)
  }

  useEffect(() => {
    if (!selectedProfile)
      return
    if (selectedProfile.cdpEndpoint)
      setCdpEndpoint(selectedProfile.cdpEndpoint)
    if (selectedProfile.name)
      setProfileName(selectedProfile.name)
    if (selectedProfile.profileType)
      setProfileType(selectedProfile.profileType)
    if (selectedProfile.expectedHost)
      setExpectedHost(selectedProfile.expectedHost)
    if (selectedProfile.proxyUrl)
      setProxyUrl(selectedProfile.proxyUrl)
  }, [selectedProfile?.id])

  const targets = (liveResult?.targets as Array<Record<string, unknown>> | undefined) || []

  return (
    <div data-testid="browser-workspace" className="flex h-full min-h-0 bg-background text-[13px] antialiased">
      {/* Sidebar */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-card/40">
        <div className="border-b border-border px-3 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <MonitorSmartphone className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-tight">Browser Workspace</div>
              <div className="text-[11px] text-muted-foreground">CDP · Extension · Flows</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = nav === item.id
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`ws-nav-${item.id}`}
                onClick={() => setNav(item.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium leading-tight">{item.label}</span>
                  <span className={cn('block text-[10.5px]', active ? 'text-background/70' : 'text-muted-foreground')}>{item.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-border bg-background px-2 py-2">
              <div className="text-[15px] font-semibold tabular-nums">{bundle.summary.onlineCount}</div>
              <div className="text-[10px] text-muted-foreground">Online</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-2 py-2">
              <div className="text-[15px] font-semibold tabular-nums">{bundle.summary.queuedJobs}</div>
              <div className="text-[10px] text-muted-foreground">Queued</div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8 w-full gap-1.5"
            disabled={loading || busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h1 className="text-[16px] font-semibold tracking-tight">
              {NAV.find(n => n.id === nav)?.label}
            </h1>
            <p className="text-[12px] text-muted-foreground">
              Real CDP smoke, live targets, extension bridge tokens, and recipe runs — persisted locally.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="h-8 gap-1.5" disabled={busy} onClick={() => void smokeSelected()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Smoke CDP
            </Button>
            <Button type="button" size="sm" variant="secondary" className="h-8 gap-1.5" disabled={busy} onClick={() => void runRecipe(true)}>
              <FlaskConical className="h-3.5 w-3.5" />
              Dry-run recipe
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
          <ScrollArea className="min-h-0">
            <div className="space-y-4 p-5">
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading workspace…
                </div>
              )}

              {nav === 'overview' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      ['Profiles', bundle.summary.profileCount, 'CDP + hybrid seats'],
                      ['Online', bundle.summary.onlineCount, 'Last smoke OK'],
                      ['Packs', bundle.summary.packsVerified ?? 0, `of ${bundle.summary.packsTotal ?? 0} verified`],
                      ['Jobs', bundle.summary.jobCount, 'Run history'],
                    ].map(([label, value, hint]) => (
                      <div key={String(label)} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value as number}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{hint as string}</div>
                      </div>
                    ))}
                  </div>

                  <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="ws-seo-media-defaults">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-xl">
                        <div className="text-[14px] font-semibold tracking-tight">Media defaults · Flow / VEO Automation</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                          Đồng bộ với extension <span className="font-medium text-foreground">Flow Automation v3.2.1</span>
                          {' '}(Settings: Mode, Model, Aspect, Video Option 6s/10s, Retries, Download quality).
                          Google Flow <span className="font-medium text-foreground">không có 15s</span> — Hub không còn ép 15s cho <code className="text-[11px]">ext:flow:*</code>.
                          Product baseline: <span className="font-medium text-foreground">{mediaProductNote}</span>.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8" disabled={busy} data-testid="ws-save-media-defaults" onClick={() => void saveMediaDefaults(false)}>
                          Save defaults
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void saveMediaDefaults(true)}>
                          Reset product
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1 text-[12px]">
                        <span className="text-muted-foreground">Aspect ratio (Hub / social)</span>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                          value={mediaAspect}
                          onChange={e => setMediaAspect(e.target.value)}
                          data-testid="ws-media-aspect"
                        >
                          {['9:16', '16:9', '1:1', '4:5'].map(a => (
                            <option key={a} value={a}>{a}{a === '9:16' ? ' · Shorts/Reels' : a === '16:9' ? ' · YouTube' : ''}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-[12px]">
                        <span className="text-muted-foreground">Duration (s) · Hub</span>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                          value={String(mediaDuration)}
                          onChange={e => setMediaDuration(Number(e.target.value) || 10)}
                          data-testid="ws-media-duration"
                        >
                          {[6, 10, 15].map(d => (
                            <option key={d} value={d}>
                              {d}
                              s
                              {d === 10 ? ' · Flow default' : d === 6 ? ' · Flow short' : ' · Grok/other only'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-[12px]">
                        <span className="text-muted-foreground">Resolution</span>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                          value={mediaResolution}
                          onChange={e => setMediaResolution(e.target.value)}
                          data-testid="ws-media-resolution"
                        >
                          {['1080p', '720p'].map(r => (
                            <option key={r} value={r}>{r}{r === '1080p' ? ' · Pro/Ultra download' : ''}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 rounded-lg border border-border/80 bg-muted/30 p-3" data-testid="ws-flow-veo-defaults">
                      <div className="text-[13px] font-semibold tracking-tight">VEO Automation Settings (mirror)</div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Khớp side-panel Flow Automation — Default Mode, Video Option, Max Retries, Auto Download. Gắn vào bridge job <code className="text-[10px]">settings.flowVeo</code>.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Default Mode</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowMode} onChange={e => setFlowMode(e.target.value)} data-testid="ws-flow-mode">
                            <option value="imageToVideo">Image to video</option>
                            <option value="textToVideo">Text to video</option>
                            <option value="componentsToVideo">Components to video</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Default Video Option</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowVideoOption} onChange={(e) => { setFlowVideoOption(e.target.value); setMediaDuration(e.target.value.startsWith('6') ? 6 : 10) }} data-testid="ws-flow-video-option">
                            <option value="6s">6s</option>
                            <option value="10s">10s</option>
                            <option value="6sConcat">6s concat (Ultra)</option>
                            <option value="10sConcat">10s concat</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Default Aspect Ratio</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowAspect} onChange={(e) => { setFlowAspect(e.target.value); setMediaAspect(e.target.value) }} data-testid="ws-flow-aspect">
                            <option value="9:16">9:16 (Shorts / Reels)</option>
                            <option value="16:9">16:9 (YouTube)</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Outputs per prompt</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={String(flowOutputCount)} onChange={e => setFlowOutputCount(Number(e.target.value) || 1)} data-testid="ws-flow-output-count">
                            {[1, 2, 3, 4].map(n => (
                              <option key={n} value={n}>
                                {n}
                                {n === 1 ? ' · recommended' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Luồng song song (Concurrent)</span>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]"
                            value={String(flowConcurrent)}
                            onChange={e => setFlowConcurrent(Number(e.target.value) || 1)}
                            data-testid="ws-flow-concurrent"
                          >
                            {[1, 2, 3, 4, 5, 6].map(n => (
                              <option key={n} value={n}>
                                {n}
                                {' '}
                                prompt
                                {n > 1 ? 's' : ''}
                                {n === 1 ? ' · mặc định (an toàn)' : ' · test parallel'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-3">
                          Concurrent = số prompt pack xử lý cùng lúc (pack
                          {' '}
                          <code className="text-[10px]">concurrentPrompts</code>
                          ).
                          {' '}
                          <strong>1</strong>
                          {' '}
                          = tuần tự + random delay giữa các prompt.
                          {' '}
                          Tăng 2–6 để test tải song song — dễ dính rate-limit / Unusual Activity.
                        </p>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Max Retries on Failure</span>
                          <input type="number" min={1} max={20} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowMaxRetries} onChange={e => setFlowMaxRetries(Math.min(20, Math.max(1, Number(e.target.value) || 5)))} data-testid="ws-flow-retries" />
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Random Delay min (s)</span>
                          <input type="number" min={0} max={600} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowDelayMin} onChange={e => setFlowDelayMin(Math.max(0, Number(e.target.value) || 0))} data-testid="ws-flow-delay-min" />
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Random Delay max (s)</span>
                          <input type="number" min={0} max={600} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowDelayMax} onChange={e => setFlowDelayMax(Math.max(0, Number(e.target.value) || 0))} data-testid="ws-flow-delay-max" />
                        </label>
                        <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-3">
                          Random delay
                          {' '}
                          <span className="font-medium text-foreground">
                            {flowDelayMin}
                            –
                            {Math.max(flowDelayMin, flowDelayMax)}
                            s
                          </span>
                          {' '}
                          between prompts. Pack re-reads storage on every
                          {' '}
                          <strong>Run</strong>
                          ; badge on side panel shows countdown while waiting.
                        </p>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Auto Download Quality (Video)</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowDlVideo} onChange={(e) => { setFlowDlVideo(e.target.value); if (e.target.value === '1080p' || e.target.value === '720p') setMediaResolution(e.target.value) }} data-testid="ws-flow-dl-video">
                            <option value="720p">720p</option>
                            <option value="1080p">1080p (Ultra/Pro)</option>
                            <option value="4K">4K</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Auto Download Quality (Image)</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowDlImage} onChange={e => setFlowDlImage(e.target.value)} data-testid="ws-flow-dl-image">
                            <option value="1K">1K</option>
                            <option value="2K">2K</option>
                            <option value="4K">4K</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Default Image Mode Option</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowImageMode} onChange={e => setFlowImageMode(e.target.value)} data-testid="ws-flow-image-mode">
                            <option value="createNew">New Image</option>
                            <option value="concat">Reuse / concat</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px]">
                          <span className="text-muted-foreground">Language</span>
                          <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-[13px]" value={flowLanguage} onChange={e => setFlowLanguage(e.target.value)}>
                            <option value="en">English</option>
                            <option value="vi">Tiếng Việt</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-[12px] sm:col-span-2 lg:col-span-1">
                          <span className="text-muted-foreground">Model (optional label)</span>
                          <Input className="h-9 text-[13px]" placeholder="Leave empty = pack UI default" value={flowModel} onChange={e => setFlowModel(e.target.value)} />
                        </label>
                        <label className="space-y-1 text-[12px] sm:col-span-2 lg:col-span-1">
                          <span className="text-muted-foreground">Image Model (optional)</span>
                          <Input className="h-9 text-[13px]" placeholder="Leave empty = pack UI default" value={flowImageModel} onChange={e => setFlowImageModel(e.target.value)} />
                        </label>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={mediaApplyDraft} onChange={e => setMediaApplyDraft(e.target.checked)} />
                        Apply when draft/ext omits aspect · duration
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={mediaTagSeo} onChange={e => setMediaTagSeo(e.target.checked)} />
                        Tag browser models with SEO
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={pushToSeats} onChange={e => setPushToSeats(e.target.checked)} data-testid="ws-push-to-seats" />
                        Push to seats on Save (chrome.storage)
                      </label>
                      <Button type="button" size="sm" variant="secondary" className="h-8" disabled={busy} data-testid="ws-push-pack-settings" onClick={() => void pushPackSettingsToSeats()}>
                        Push Flow → 4 seats
                      </Button>
                    </div>
                    {lastPushNote
                      ? (
                          <p className="mt-2 text-[11px] text-foreground/80" data-testid="ws-push-note">
                            Last push:
                            {' '}
                            {lastPushNote}
                          </p>
                        )
                      : (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Mặc định chỉ push
                            {' '}
                            <code className="text-[10px]">flow_automation_settings</code>
                            {' '}
                            (không mở tab ChatGPT/Grok/Gemini). Draft
                            {' '}
                            <code className="text-[10px]">ext:flow:video</code>
                            {' '}
                            = CDP submit → chờ video → archive material (không shell-only).
                            Cần seat CDP online + login Google Flow.
                          </p>
                        )}
                  </section>

                  <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="ws-remote-configs">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-xl">
                        <div className="text-[14px] font-semibold tracking-tight">Author remote configs (mirrored)</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                          Packs fetch DOM selectors from author CDN. Hub mirrors them locally first;
                          author endpoints remain final fallback if Hub is down.
                          {remoteConfigNote ? <span className="ml-1 font-medium text-foreground">{remoteConfigNote}</span> : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8" disabled={busy} data-testid="ws-sync-remote-configs" onClick={() => void syncRemoteConfigs()}>
                          Sync from author
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void loadRemoteConfigs()}>
                          Refresh list
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-[12px]">
                        <thead className="text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="py-1.5 pr-2 font-medium">Pack</th>
                            <th className="py-1.5 pr-2 font-medium">Mirror</th>
                            <th className="py-1.5 pr-2 font-medium">Selectors</th>
                            <th className="py-1.5 pr-2 font-medium">Version</th>
                            <th className="py-1.5 font-medium">Fetched</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(remoteConfigRows.length ? remoteConfigRows : [
                            { packId: 'grok-automation', shortName: 'Grok', mirrored: false },
                            { packId: 'chatgpt-automation', shortName: 'ChatGPT', mirrored: false },
                            { packId: 'gemini-automation', shortName: 'Gemini', mirrored: false },
                            { packId: 'flow-automation', shortName: 'Flow', mirrored: false },
                          ]).map(row => (
                            <tr key={row.packId} className="border-b border-border/60">
                              <td className="py-1.5 pr-2 font-medium">{row.shortName || row.packId}</td>
                              <td className="py-1.5 pr-2">
                                <Badge variant={row.mirrored ? 'default' : 'outline'} className="font-normal">
                                  {row.mirrored ? 'local' : 'missing'}
                                </Badge>
                              </td>
                              <td className="py-1.5 pr-2 tabular-nums">{row.summary?.selectorCount ?? '—'}</td>
                              <td className="py-1.5 pr-2 max-w-[180px] truncate text-muted-foreground" title={row.summary?.version}>
                                {row.summary?.version ? String(row.summary.version).split(',')[0] : '—'}
                              </td>
                              <td className="py-1.5 text-muted-foreground">
                                {row.fetchedAt ? relativeTime(row.fetchedAt) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Loader order: <code className="text-[10px]">127.0.0.1:6061/…/mirror</code>
                      {' → '}
                      <code className="text-[10px]">configs.kylenguyen.me</code>
                      {' → '}
                      <code className="text-[10px]">extension-config.onegreen.workers.dev</code>
                    </p>
                  </section>

                  <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 max-w-xl">
                        <div className="text-[14px] font-semibold tracking-tight">Primary browser seat</div>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                          Launches an app-owned Chrome profile, loads all verified packs (Bridge + Grok + ChatGPT + Gemini + Flow),
                          opens login tabs, and exposes CDP for smoke / recipes.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={busy}
                          data-testid="ws-prepare-cloak-clean"
                          onClick={() => void run({
                            action: 'prepare_primary_seat',
                            seatId: 'primary',
                            force: true,
                            openLogins: true,
                            browserEngine: 'cloak',
                            cdpPort: 9480,
                            packMode: 'clean',
                          }, 'Clean Cloak (no packs) — CF-safe login')}
                        >
                          <Rocket className="h-3.5 w-3.5" />
                          Clean Cloak (login / CF-safe)
                        </Button>
                        <Button type="button" size="sm" variant="secondary" className="h-8 gap-1.5" disabled={busy} data-testid="ws-prepare-primary" onClick={() => void preparePrimarySeat()}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                          Prepare primary (all packs)
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={busy}
                          data-testid="ws-prepare-cloak"
                          onClick={() => void run({
                            action: 'prepare_primary_seat',
                            seatId: 'primary',
                            force: true,
                            openLogins: false,
                            browserEngine: 'cloak',
                            cdpPort: 9480,
                            packMode: 'all',
                          }, 'Cloak + all packs (use after login)')}
                        >
                          <Rocket className="h-3.5 w-3.5" />
                          Cloak + all packs
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1.5"
                          disabled={busy}
                          data-testid="ws-launch-p6"
                          onClick={() => void run({
                            action: 'launch_profile_6',
                            chromeProfileDirectory: 'Profile 6',
                            openLogins: true,
                            force: true,
                          }, 'Launched Chrome Profile 6 with all packs')}
                        >
                          <Chrome className="h-3.5 w-3.5" />
                          Launch Profile 6
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1.5"
                          disabled={busy}
                          data-testid="ws-attach-cdp"
                          onClick={() => void run({
                            action: 'attach_cdp',
                            cdpEndpoint: cdpEndpoint || 'http://127.0.0.1:9222',
                            seatId: 'primary',
                            name: 'Attached CDP (Playwright-style)',
                          }, 'Attached to existing Chrome via CDP')}
                        >
                          <Cable className="h-3.5 w-3.5" />
                          Attach CDP
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          disabled={busy}
                          onClick={() => void run({ action: 'create_pool_seat', name: `Pool ${new Date().toLocaleTimeString()}` }, 'New app pool seat created')}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          New app seat
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => void probeLogins()}>
                          Probe logins
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          disabled={busy}
                          onClick={() => void run({
                            action: 'verify_extensions',
                            profileId: selectedProfile?.id || 'primary',
                            cdpEndpoint: selectedProfile?.cdpEndpoint || cdpEndpoint,
                          }, 'Extension verify finished')}
                        >
                          Verify exts
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => void openLoginTabs()}>
                          Open login tabs
                        </Button>
                      </div>
                    </div>
                    {(() => {
                      const primary = bundle.profiles.find(p => p.id === 'primary') || bundle.profiles.find(p => (p.metadata as any)?.role === 'primary')
                      const logins = ((primary?.metadata as any)?.logins || []) as Array<{ platform: string, status: string }>
                      if (!primary && !logins.length)
                        return null
                      return (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                          {primary && (
                            <Badge variant="secondary" className="font-normal">
                              CDP {primary.cdpEndpoint || '—'} · {primary.status}
                            </Badge>
                          )}
                          {logins.map(l => (
                            <Badge
                              key={l.platform}
                              variant={l.status === 'ready' ? 'default' : 'outline'}
                              className="font-normal capitalize"
                            >
                              {l.platform}: {l.status}
                            </Badge>
                          ))}
                        </div>
                      )
                    })()}
                  </section>

                  <section className="rounded-xl border border-border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <div className="font-semibold">Quick start</div>
                      <Badge variant="secondary" className="text-[10px]">Usable now</Badge>
                    </div>
                    <div className="grid gap-3 p-4 md:grid-cols-3">
                      <QuickCard
                        icon={Rocket}
                        title="1. Prepare primary seat"
                        body="App-owned Chrome + load 4 niche packs + SocialOps bridge."
                        cta="Prepare seat"
                        onClick={() => void preparePrimarySeat()}
                      />
                      <QuickCard
                        icon={Radio}
                        title="2. Smoke & inspect"
                        body="Hit /json/version + /json/list. See live tabs and match expected host."
                        cta="Open live"
                        onClick={() => setNav('live')}
                      />
                      <QuickCard
                        icon={Puzzle}
                        title="3. Extension bridge"
                        body="Register a bridge token for extension-driven flows on a seat."
                        cta="Open extension"
                        onClick={() => setNav('extension')}
                      />
                    </div>
                  </section>

                  <ProfilesTable
                    profiles={bundle.profiles}
                    selectedId={selectedProfile?.id}
                    onSelect={(id) => { setSelectedProfileId(id); setNav('profiles') }}
                  />
                </>
              )}

              {nav === 'auth' && (
                <div className="space-y-4">
                  <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="text-[14px] font-semibold">Why not fully auto-login?</div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      Grok / ChatGPT / Google use CAPTCHA, 2FA, and device checks. The stable pattern is:
                      <strong className="text-foreground"> one primary seat</strong> (extensions installed) →
                      assisted fill from vault → you solve challenge once →
                      <strong className="text-foreground"> Export sessions</strong> (cookies) for restore.
                      Bridge auto-pairs with Hub so jobs keep flowing without re-pasting tokens.
                    </p>
                  </section>

                  <section className="rounded-xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3 font-semibold">Credential vault (machine-encrypted)</div>
                    <div className="grid gap-3 p-4 md:grid-cols-4">
                      <div>
                        <div className="mb-1 text-[11px] text-muted-foreground">Platform</div>
                        <select
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                          value={credPlatform}
                          onChange={e => setCredPlatform(e.target.value)}
                        >
                          {['grok', 'chatgpt', 'gemini', 'flow'].map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <div className="mb-1 text-[11px] text-muted-foreground">Email / username</div>
                        <Input value={credEmail} onChange={e => setCredEmail(e.target.value)} placeholder="you@email.com" className="h-9" />
                      </div>
                      <div className="md:col-span-1">
                        <div className="mb-1 text-[11px] text-muted-foreground">Password</div>
                        <Input type="password" value={credPassword} onChange={e => setCredPassword(e.target.value)} className="h-9" />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" size="sm" className="h-9 w-full" disabled={busy || !credEmail || !credPassword} onClick={() => void saveCredential()}>
                          Save vault
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                      {credList.map(c => (
                        <Badge key={c.platform} variant="secondary" className="font-normal">
                          {c.platform}: {c.email}
                        </Badge>
                      ))}
                      {!credList.length && <span className="text-[12px] text-muted-foreground">No credentials saved yet.</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void autoLoginAll()}>Assisted login all</Button>
                      {['grok', 'chatgpt', 'gemini', 'flow'].map(p => (
                        <Button key={p} type="button" size="sm" variant="outline" disabled={busy} onClick={() => void autoLoginOne(p)}>
                          Login {p}
                        </Button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-card shadow-sm">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <div className="font-semibold">Session snapshots (cookies)</div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void exportSessions()}>Export from seat</Button>
                        <Button type="button" size="sm" className="h-8" disabled={busy} onClick={() => void restoreSessions()}>Restore into seat</Button>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {sessionList.map(s => (
                        <div key={`${s.platform}-${s.savedAt}`} className="flex items-center justify-between px-4 py-2.5 text-[12px]">
                          <span className="font-medium capitalize">{s.platform}</span>
                          <span className="text-muted-foreground">{s.cookieCount} cookies · {relativeTime(s.savedAt)}</span>
                        </div>
                      ))}
                      {!sessionList.length && (
                        <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                          No snapshots yet — login (manual or assisted), then Export.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {nav === 'packs' && (
                <section className="rounded-xl border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <div className="font-semibold">Automation packs</div>
                      <div className="text-[11px] text-muted-foreground">
                        Vendored under extensions/ + social-ops/extension · loaded on primary seat
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void preparePrimarySeat()}>
                      Reload seat packs
                    </Button>
                  </div>
                  <div className="divide-y divide-border">
                    {(bundle.packs || []).map((pack) => (
                      <div key={pack.id} className="flex items-start justify-between gap-3 px-4 py-3" data-testid={`ws-pack-${pack.id}`}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{pack.name}</span>
                            <Badge variant="outline" className="text-[10px] font-normal">{pack.role}</Badge>
                            <Badge
                              variant={pack.packageStatus === 'verified' ? 'default' : 'secondary'}
                              className="text-[10px] font-normal"
                            >
                              pkg:{pack.packageStatus}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              cap:{pack.capabilityStatus}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[12px] text-muted-foreground">{pack.description}</p>
                          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">{pack.path}</p>
                          {!!pack.capabilities?.length && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {pack.capabilities.map(c => (
                                <Badge key={c} variant="outline" className="text-[10px] font-normal capitalize">{c}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <StatusDot status={pack.packageStatus === 'verified' ? 'online' : 'offline'} />
                      </div>
                    ))}
                    {!bundle.packs?.length && (
                      <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                        No packs returned — rebuild server and refresh.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {nav === 'profiles' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <ProfilesTable
                    profiles={bundle.profiles}
                    selectedId={selectedProfile?.id}
                    onSelect={setSelectedProfileId}
                  />
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-2 font-semibold">
                      <Settings2 className="h-4 w-4" />
                      Profile editor
                    </div>
                    <Field label="Name">
                      <Input value={profileName} onChange={e => setProfileName(e.target.value)} className="h-9" />
                    </Field>
                    <Field label="CDP endpoint">
                      <Input value={cdpEndpoint} onChange={e => setCdpEndpoint(e.target.value)} className="h-9 font-mono text-[12px]" placeholder="http://127.0.0.1:9222" />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Type">
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12px]"
                          value={profileType}
                          onChange={e => setProfileType(e.target.value)}
                        >
                          {['chrome', 'edge', 'helium', 'buglogin', 'custom'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Expected host">
                        <Input value={expectedHost} onChange={e => setExpectedHost(e.target.value)} className="h-9" placeholder="grok.com" />
                      </Field>
                    </div>
                    <Field label="Proxy (optional)">
                      <Input value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} className="h-9 font-mono text-[12px]" placeholder="http://user:pass@host:port" />
                    </Field>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button type="button" size="sm" className="h-8 gap-1" disabled={busy} onClick={() => void saveProfile()}>
                        <Plus className="h-3.5 w-3.5" />
                        Save profile
                      </Button>
                      <Button type="button" size="sm" variant="secondary" className="h-8 gap-1" disabled={busy} onClick={() => void smokeSelected()}>
                        <Zap className="h-3.5 w-3.5" />
                        Smoke
                      </Button>
                      {selectedProfile && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-destructive" disabled={busy} onClick={() => void deleteSelected()}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      )}
                    </div>
                    {selectedProfile?.lastError && (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                        {selectedProfile.lastError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {nav === 'live' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold">{selectedProfile?.name || 'No profile selected'}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {selectedProfile?.cdpEndpoint || cdpEndpoint}
                      </div>
                    </div>
                    <Button type="button" size="sm" className="h-8 gap-1" disabled={busy} onClick={() => void smokeSelected()}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
                      Probe live
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard label="Reachable" value={liveResult?.ok === true ? 'Yes' : liveResult ? 'No' : '—'} ok={liveResult?.ok === true} />
                    <MetricCard label="Targets" value={String(liveResult?.targetCount ?? '—')} />
                    <MetricCard label="Browser" value={String((liveResult?.version as any)?.Browser || '—')} mono />
                  </div>

                  <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-2.5 font-semibold">Live targets</div>
                    <div className="divide-y divide-border">
                      {targets.length === 0 && (
                        <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                          Run smoke to list open tabs / pages from CDP.
                        </div>
                      )}
                      {targets.map((t) => (
                        <div key={String(t.id)} className="flex items-start gap-3 px-4 py-3">
                          <StatusDot status={String(t.type) === 'page' ? 'online' : 'idle'} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-medium">{String(t.title || '(untitled)')}</div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">{String(t.url || '')}</div>
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">{String(t.type || 'target')}</Badge>
                        </div>
                      ))}
                    </div>
                  </section>

                  {Boolean(liveResult?.matchedTarget) && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                      Matched host target:
                      {' '}
                      <span className="font-mono">{String((liveResult?.matchedTarget as { url?: string } | undefined)?.url || '')}</span>
                    </div>
                  )}
                </div>
              )}

              {nav === 'extension' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <section className="rounded-xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3 font-semibold">Extension bridges</div>
                    <div className="divide-y divide-border">
                      {bundle.profiles.filter(p => p.kind === 'extension' || p.kind === 'hybrid').length === 0 && (
                        <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                          No extension bridges yet. Register one to get a bridge token.
                        </div>
                      )}
                      {bundle.profiles.filter(p => p.kind === 'extension' || p.kind === 'hybrid').map(p => (
                        <div key={p.id} className="flex items-start gap-3 px-4 py-3">
                          <Puzzle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{p.name}</span>
                              <StatusDot status={p.status} />
                              <Badge variant="secondary" className="text-[10px]">{p.platform || 'web'}</Badge>
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-muted-foreground break-all">
                              token:
                              {' '}
                              {p.bridgeToken || '—'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              heartbeat
                              {' '}
                              {relativeTime(String(p.metadata?.lastHeartbeatAt || p.lastSmokeAt || ''))}
                              {p.metadata?.lastUrl ? ` · ${String(p.metadata.lastUrl)}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-2 font-semibold">
                      <Cable className="h-4 w-4" />
                      Register bridge
                    </div>
                    <Field label="Display name">
                      <Input value={bridgeName} onChange={e => setBridgeName(e.target.value)} className="h-9" />
                    </Field>
                    <Field label="Platform">
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12px]"
                        value={bridgePlatform}
                        onChange={e => setBridgePlatform(e.target.value)}
                      >
                        {['grok', 'chatgpt', 'x', 'tiktok', 'youtube', 'facebook', 'instagram', 'pinterest'].map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Creates a durable seat + bridge token. Extension can heartbeat and claim jobs against this profile.
                    </p>
                    <Button type="button" className="h-9 w-full gap-1.5" disabled={busy} onClick={() => void registerBridge()}>
                      <Puzzle className="h-3.5 w-3.5" />
                      Register extension bridge
                    </Button>
                  </div>
                </div>
              )}

              {nav === 'recipes' && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <section className="rounded-xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3 font-semibold">Recipes</div>
                    <div className="divide-y divide-border">
                      {bundle.recipes.length === 0 && (
                        <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                          No recipes yet. Create a default assert-host flow.
                        </div>
                      )}
                      {bundle.recipes.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedRecipeId(r.id)}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40',
                            selectedRecipe?.id === r.id && 'bg-muted/50',
                          )}
                        >
                          <Workflow className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="font-semibold">{r.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {r.platform}
                              {' · '}
                              {r.mode}
                              {' · '}
                              {r.steps?.length || 0}
                              {' '}
                              steps
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>

                  <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="font-semibold">Recipe builder</div>
                    <Field label="Name">
                      <Input value={recipeName} onChange={e => setRecipeName(e.target.value)} className="h-9" />
                    </Field>
                    <Field label="Platform">
                      <Input value={recipePlatform} onChange={e => setRecipePlatform(e.target.value)} className="h-9" />
                    </Field>
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                      Default steps: list_targets → assert_host → screenshot
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" className="h-8 gap-1" disabled={busy} onClick={() => void saveRecipe()}>
                        <Plus className="h-3.5 w-3.5" />
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="secondary" className="h-8 gap-1" disabled={busy} onClick={() => void runRecipe(true)}>
                        <FlaskConical className="h-3.5 w-3.5" />
                        Dry-run
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={busy} onClick={() => void runRecipe(false)}>
                        <Rocket className="h-3.5 w-3.5" />
                        Run
                      </Button>
                    </div>
                    {selectedRecipe && (
                      <Textarea
                        readOnly
                        className="min-h-[140px] font-mono text-[11px]"
                        value={JSON.stringify(selectedRecipe.steps, null, 2)}
                      />
                    )}
                  </div>
                </div>
              )}

              {nav === 'jobs' && (
                <JobsTable jobs={bundle.jobs} />
              )}
            </div>
          </ScrollArea>

          {/* Right activity rail */}
          <aside className="hidden min-h-0 border-l border-border bg-card/30 xl:flex xl:flex-col">
            <div className="border-b border-border px-4 py-3">
              <div className="font-semibold">Activity</div>
              <div className="text-[11px] text-muted-foreground">Live feed of smokes, recipes, bridges</div>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-0 p-2">
                {bundle.activity.length === 0 && (
                  <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">No activity yet.</div>
                )}
                {bundle.activity.map(item => (
                  <div key={item.id} className="rounded-lg px-3 py-2.5 hover:bg-muted/40">
                    <div className="flex items-center gap-2">
                      {item.level === 'success'
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : item.level === 'error'
                          ? <CircleDashed className="h-3.5 w-3.5 text-rose-500" />
                          : <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-[11px] text-muted-foreground">{relativeTime(item.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-[12px] leading-snug">{item.message}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </aside>
        </div>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function QuickCard({
  icon: Icon,
  title,
  body,
  cta,
  onClick,
}: {
  icon: typeof Chrome
  title: string
  body: string
  cta: string
  onClick: () => void
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/15 p-3.5">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-background border border-border">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[12.5px] font-semibold">{title}</div>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
      <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 px-2 text-[11px]" onClick={onClick}>
        {cta}
      </Button>
    </div>
  )
}

function MetricCard({ label, value, ok, mono }: { label: string, value: string, ok?: boolean, mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        'mt-1 text-[15px] font-semibold tracking-tight',
        mono && 'font-mono text-[12px]',
        ok === true && 'text-emerald-600',
        ok === false && 'text-rose-600',
      )}
      >
        {value}
      </div>
    </div>
  )
}

function ProfilesTable({
  profiles,
  selectedId,
  onSelect,
}: {
  profiles: WorkspaceProfile[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 font-semibold">Profiles</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead className="border-b border-border bg-muted/40 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Endpoint / Platform</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last check</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[12px] text-muted-foreground">
                  No profiles yet — save a CDP profile to begin.
                </td>
              </tr>
            )}
            {profiles.map(p => (
              <tr
                key={p.id}
                data-testid={`ws-profile-${p.id}`}
                className={cn(
                  'cursor-pointer border-b border-border/70 last:border-0 transition-colors hover:bg-muted/30',
                  selectedId === p.id && 'bg-muted/40',
                )}
                onClick={() => onSelect(p.id)}
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold tracking-tight">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">{p.profileType || '—'}</div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="secondary" className="text-[10px] capitalize">{p.kind}</Badge>
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {p.kind === 'extension' ? (p.platform || '—') : (p.cdpEndpoint || '—')}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 capitalize">
                    <StatusDot status={p.status} />
                    {p.status}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                  {relativeTime(p.lastSmokeAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function JobsTable({ jobs }: { jobs: WorkspaceJob[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 font-semibold">Jobs</div>
      <div className="divide-y divide-border">
        {jobs.length === 0 && (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">No jobs yet.</div>
        )}
        {jobs.map(job => (
          <div key={job.id} className="flex items-start gap-3 px-4 py-3">
            <StatusDot status={job.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{job.name}</span>
                <Badge variant="secondary" className="text-[10px]">{job.mode}</Badge>
                <Badge variant="outline" className="text-[10px] capitalize">{job.status}</Badge>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {relativeTime(job.createdAt)}
                {job.error ? ` · ${job.error}` : ''}
                {job.result && typeof job.result === 'object' && 'targetCount' in job.result
                  ? ` · ${String((job.result as any).targetCount)} targets`
                  : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
