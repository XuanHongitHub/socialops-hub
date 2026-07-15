'use client'

import {
  Activity,
  Boxes,
  ChevronLeft,
  Download,
  DownloadCloud,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Unplug,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  checkProviderAccountHealth,
  deleteProviderAccount,
  disableProviderAccount,
  discoverProviderModels,
  get9RouterProviders,
  getLocalProviderAccounts,
  getProviderAccounts,
  getProviders,
  importCookieAccount,
  pollGrokDeviceLogin,
  startGrokDeviceLogin,
  upsertLocalProviderAccount,
  upsertProviderAccount,
  type GrokDeviceLoginResult,
  type ProviderAccountItem,
  type ProviderRegistryItem,
} from '@/api/aiProviders'
import logo from '@/assets/images/logo.png'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/utils/ui/toast'
import { cn } from '@/utils/className'
import {
  getConnectionIdentity,
  healthTone,
  relativeHealthTime,
} from '@/utils/providerConnection'

export { getConnectionIdentity } from '@/utils/providerConnection'

type NavKey = 'providers' | 'connections' | 'sync'
type DetailTab = 'connections' | 'settings' | 'activity'
type ConnectMode = 'oauth' | 'cookie' | 'api_key' | null

const FALLBACK_PROVIDERS: ProviderRegistryItem[] = [
  { id: 'grok', name: 'Grok', category: 'oauth', capabilities: ['chat', 'image'], authModes: ['oauth', 'cookie_import'], status: 'ready', accountCount: 0, activeAccountCount: 0 },
  { id: 'chatgpt', name: 'ChatGPT', category: 'oauth', capabilities: ['chat'], authModes: ['oauth', 'cookie_import'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'codex', name: 'OpenAI Codex', category: 'oauth', capabilities: ['chat', 'workflow'], authModes: ['oauth'], status: 'ready', accountCount: 0, activeAccountCount: 0 },
  { id: 'claude', name: 'Claude', category: 'oauth', capabilities: ['chat'], authModes: ['oauth'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'gemini', name: 'Gemini', category: 'free_tier', capabilities: ['chat'], authModes: ['api_key', 'oauth'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'openrouter', name: 'OpenRouter', category: 'free_tier', capabilities: ['chat'], authModes: ['api_key'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
  { id: 'groq', name: 'Groq', category: 'api_key', capabilities: ['chat'], authModes: ['api_key'], status: 'ready', accountCount: 0, activeAccountCount: 0 },
  { id: 'anthropic', name: 'Anthropic', category: 'api_key', capabilities: ['chat'], authModes: ['api_key'], status: 'planned', accountCount: 0, activeAccountCount: 0 },
]

function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  destructive,
  testId,
  busy,
}: {
  label: string
  icon: typeof Activity
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  testId?: string
  busy?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid={testId}
          disabled={disabled || busy}
          aria-label={label}
          className={cn(
            'h-8 w-8 text-muted-foreground hover:text-foreground',
            destructive && 'hover:bg-destructive/10 hover:text-destructive',
          )}
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function ProviderMark({ id, name, className }: { id: string, name: string, className?: string }) {
  const palette: Record<string, string> = {
    grok: 'bg-slate-900 text-white',
    codex: 'bg-zinc-900 text-white',
    groq: 'bg-orange-500 text-orange-950',
    chatgpt: 'bg-emerald-600 text-white',
    claude: 'bg-amber-600 text-white',
    gemini: 'bg-gradient-to-br from-blue-500 via-violet-500 to-rose-400 text-white',
    openrouter: 'bg-slate-500 text-white',
    anthropic: 'bg-amber-700 text-white',
    xai: 'bg-slate-900 text-white',
  }
  const label = id === 'grok' || id === 'xai' ? 'GR' : name.slice(0, 2).toUpperCase()
  return (
    <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold', palette[id] || 'bg-muted text-foreground', className)}>
      {label}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone = healthTone(status)
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1 rounded-full px-2 text-[10px] font-medium capitalize',
        tone === 'ok' && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400',
        tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
        tone === 'bad' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
        tone === 'muted' && 'border-border bg-muted/50 text-muted-foreground',
      )}
    >
      {tone !== 'muted' && <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-red-500')} />}
      {status || 'unknown'}
    </Badge>
  )
}

function NavButton({
  icon: Icon,
  label,
  active,
  count,
  onClick,
  testId,
}: {
  icon: typeof Boxes
  label: string
  active: boolean
  count?: number
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
      {typeof count === 'number' && (
        <span className="ml-auto tabular-nums text-[11px] text-muted-foreground/80">{count}</span>
      )}
    </button>
  )
}

export function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderRegistryItem[]>([])
  const [accounts, setAccounts] = useState<ProviderAccountItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busyIds, setBusyIds] = useState<string[]>([])
  const [activeNav, setActiveNav] = useState<NavKey>('providers')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<DetailTab>('connections')
  const [providerSearch, setProviderSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState<ConnectMode>(null)
  const [models, setModels] = useState<Array<{ id: string, ownedBy?: string, type?: string }>>([])
  const [grokLogin, setGrokLogin] = useState<GrokDeviceLoginResult | null>(null)
  const [routerConnections, setRouterConnections] = useState<Array<Record<string, unknown>>>([])
  const [transferText, setTransferText] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const [editLabel, setEditLabel] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editQuotaLimit, setEditQuotaLimit] = useState('0')
  const [editQuotaWindow, setEditQuotaWindow] = useState<'day' | 'hour'>('day')
  const [editApiKey, setEditApiKey] = useState('')

  const [connectLabel, setConnectLabel] = useState('')
  const [connectModel, setConnectModel] = useState('grok-3')
  const [connectCookie, setConnectCookie] = useState('')
  const [connectApiKey, setConnectApiKey] = useState('')
  const [connectBaseUrl, setConnectBaseUrl] = useState('https://api.x.ai/v1')
  const [connectName, setConnectName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [providerRes, accountRes] = await Promise.all([
        getProviders().catch(() => null),
        getProviderAccounts().catch(() => null),
      ])
      const localRes = await getLocalProviderAccounts().catch(() => null)
      const providerList = (providerRes?.data?.length ? providerRes.data : FALLBACK_PROVIDERS)
        .filter(p => p.id !== '9router')
      const accountList = Array.from(
        new Map([...(accountRes?.data || []), ...(localRes?.accounts || [])].map(a => [a.id, a])).values(),
      ).filter(a => a.providerId !== '9router')
      setProviders(providerList)
      setAccounts(accountList)
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const catalog = useMemo(() => {
    const merged = [
      ...providers,
      ...FALLBACK_PROVIDERS.filter(p => !providers.some(item => item.id === p.id)),
    ]
    const q = providerSearch.trim().toLowerCase()
    return merged.filter((p) => {
      if (!q) return true
      return [p.name, p.id, p.category, ...(p.capabilities || [])].join(' ').toLowerCase().includes(q)
    })
  }, [providers, providerSearch])

  const selectedProvider = useMemo(
    () => catalog.find(p => p.id === selectedProviderId) || null,
    [catalog, selectedProviderId],
  )

  const providerAccounts = useMemo(() => {
    if (!selectedProviderId) return []
    return accounts.filter(a => a.providerId === selectedProviderId || (selectedProviderId === 'grok' && a.providerId === 'xai'))
  }, [accounts, selectedProviderId])

  const listScopeAccounts = useMemo(() => {
    if (activeNav === 'connections') return accounts
    if (selectedProviderId) return providerAccounts
    return []
  }, [activeNav, accounts, selectedProviderId, providerAccounts])

  const activeSelected = useMemo(
    () => selectedIds.filter(id => listScopeAccounts.some(a => a.id === id)),
    [selectedIds, listScopeAccounts],
  )

  const editingAccount = useMemo(
    () => accounts.find(a => a.id === editingId) || null,
    [accounts, editingId],
  )

  const openProvider = (id: string, provider?: ProviderRegistryItem) => {
    const item = provider || catalog.find(p => p.id === id)
    if (!item || item.status === 'planned') {
      toast.info(`${item?.name || id} is planned — not available yet`)
      return
    }
    setSelectedProviderId(id)
    setActiveNav('providers')
    setDetailTab('connections')
    setSelectedIds([])
    setEditingId(null)
    setConnectMode(null)
  }

  const goCatalog = () => {
    setSelectedProviderId(null)
    setActiveNav('providers')
    setSelectedIds([])
    setEditingId(null)
    setConnectMode(null)
  }

  const openEdit = (account: ProviderAccountItem) => {
    const identity = getConnectionIdentity(account)
    setEditingId(account.id)
    setConfirmDisconnect(false)
    setEditLabel(identity.displayLabel || '')
    setEditModel(identity.defaultModel || '')
    setEditApiKey('')
    const quota = account.quota || {}
    setEditQuotaLimit(String(Number(quota.limit ?? 0)))
    setEditQuotaWindow((quota.window === 'hour' ? 'hour' : 'day'))
  }

  const healthOne = async (id: string) => {
    setBusyIds(prev => [...new Set([...prev, id])])
    try {
      const res = await checkProviderAccountHealth(id)
      const status = res?.data?.lastHealthStatus || res?.data?.status || 'checked'
      toast.success(`Health: ${status}`)
      await load()
    }
    catch (e) {
      toast.error(String(e))
    }
    finally {
      setBusyIds(prev => prev.filter(x => x !== id))
    }
  }

  const disconnectOne = async (id: string) => {
    setBusyIds(prev => [...new Set([...prev, id])])
    try {
      await disableProviderAccount(id)
      toast.success('Connection disabled')
      setEditingId(null)
      setSelectedIds(prev => prev.filter(x => x !== id))
      await load()
    }
    catch (e) {
      toast.error(String(e))
    }
    finally {
      setBusyIds(prev => prev.filter(x => x !== id))
    }
  }

  const deleteOne = async (id: string) => {
    const account = accounts.find(a => a.id === id)
    const label = account ? getConnectionIdentity(account).primary : id
    if (!window.confirm(`Delete connection “${label}”? This permanently removes local credentials and cannot be undone.`))
      return
    setBusyIds(prev => [...new Set([...prev, id])])
    try {
      await deleteProviderAccount(id)
      toast.success('Connection deleted')
      setEditingId(null)
      setConfirmDisconnect(false)
      setSelectedIds(prev => prev.filter(x => x !== id))
      await load()
    }
    catch (e) {
      toast.error(String(e))
    }
    finally {
      setBusyIds(prev => prev.filter(x => x !== id))
    }
  }

  const bulkHealth = async (ids = activeSelected) => {
    if (!ids.length) return
    setLoading(true)
    let ok = 0
    for (const id of ids) {
      try {
        await checkProviderAccountHealth(id)
        ok += 1
      }
      catch { /* continue */ }
    }
    toast.success(`Health checked ${ok}/${ids.length}`)
    setSelectedIds([])
    await load()
    setLoading(false)
  }

  const bulkDisconnect = async (ids = activeSelected) => {
    if (!ids.length) return
    if (!window.confirm(`Disable ${ids.length} connection(s)? They will stop routing until reconnected.`))
      return
    setLoading(true)
    let ok = 0
    for (const id of ids) {
      try {
        await disableProviderAccount(id)
        ok += 1
      }
      catch { /* continue */ }
    }
    toast.success(`Disabled ${ok}/${ids.length}`)
    setSelectedIds([])
    setEditingId(null)
    await load()
    setLoading(false)
  }

  const bulkDelete = async (ids = activeSelected) => {
    if (!ids.length) return
    if (!window.confirm(`Permanently delete ${ids.length} connection(s)? Local credentials will be removed.`))
      return
    setLoading(true)
    let ok = 0
    for (const id of ids) {
      try {
        await deleteProviderAccount(id)
        ok += 1
      }
      catch { /* continue */ }
    }
    toast.success(`Deleted ${ok}/${ids.length}`)
    setSelectedIds([])
    setEditingId(null)
    await load()
    setLoading(false)
  }

  const saveEdit = async () => {
    if (!editingAccount) return
    try {
      const meta = { ...(editingAccount.metadata || {}) }
      if (editLabel.trim()) meta.displayLabel = editLabel.trim()
      else delete meta.displayLabel
      if (editModel.trim()) meta.defaultModel = editModel.trim()
      const identity = getConnectionIdentity(editingAccount)
      const payload = {
        id: editingAccount.id,
        providerId: editingAccount.providerId,
        name: identity.primary,
        authMode: editingAccount.authMode,
        status: editingAccount.status,
        metadata: meta,
        quota: {
          limit: Number(editQuotaLimit || 0),
          window: editQuotaWindow,
          used: Number((editingAccount.quota as any)?.used || 0),
        },
        credentials: editApiKey ? { apiKey: editApiKey } : undefined,
      }
      try {
        await upsertProviderAccount(payload)
      }
      catch {
        await upsertLocalProviderAccount(payload)
      }
      toast.success('Connection updated')
      setEditApiKey('')
      await load()
    }
    catch (e) {
      toast.error(String(e))
    }
  }

  const discoverModels = async (providerId?: string) => {
    const res = await discoverProviderModels(providerId).catch((error) => {
      toast.error(String(error))
      return null
    })
    if (!res?.data) return
    setModels(res.data)
    toast.success(`${res.data.length} models discovered`)
  }

  const startGrokOAuth = async (label?: string) => {
    const placeholderName = label?.trim() || 'Grok OAuth'
    toast.info('Starting Grok OAuth…')
    const res = await startGrokDeviceLogin(placeholderName).catch((e) => {
      toast.error(String(e))
      return null
    })
    const data = res?.data || null
    setGrokLogin(data)
    if (data?.error) {
      toast.error(data.error)
      return
    }
    const url = data?.verificationUriComplete || data?.verificationUri
    if (!url || !data?.deviceCode) {
      toast.error('Grok OAuth did not return an authorization URL')
      return
    }
    window.open(url, 'socialops-grok-oauth', 'noopener,noreferrer,width=980,height=760')
    toast.success('Grok OAuth opened — waiting for authorization…')
    const startedAt = Date.now()
    const intervalMs = Math.max(2000, Number(data.interval || 3) * 1000)
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt > Math.min(Number(data.expiresIn || 600) * 1000, 10 * 60 * 1000)) {
        window.clearInterval(timer)
        toast.error('Grok OAuth timed out')
        return
      }
      const poll = await pollGrokDeviceLogin({ name: placeholderName, deviceCode: data.deviceCode! }).catch(() => null)
      if (poll?.data?.status === 'completed') {
        window.clearInterval(timer)
        setGrokLogin(poll.data)
        const account = poll.data.account
        const identity = account ? getConnectionIdentity(account) : null
        toast.success(`Connected${identity ? `: ${identity.primary}` : ''}`)
        setConnectMode(null)
        await load()
      }
    }, intervalMs)
  }

  const beginConnect = (mode: ConnectMode) => {
    if (!selectedProvider || !mode) return
    setConnectMode(mode)
    setConnectLabel('')
    setConnectCookie('')
    setConnectApiKey('')
    setConnectName('')
    setConnectModel(
      selectedProvider.id === 'grok'
        ? 'grok-imagine-video'
        : models[0]?.id || '',
    )
    setConnectBaseUrl(
      selectedProvider.id === 'grok'
        ? 'https://api.x.ai/v1'
        : selectedProvider.id === 'groq'
          ? 'https://api.groq.com/openai/v1'
          : '',
    )
  }

  const submitConnect = async () => {
    if (!selectedProvider || !connectMode) return
    if (connectMode === 'oauth') {
      if (selectedProvider.id === 'grok') {
        await startGrokOAuth(connectLabel)
        return
      }
      toast.info('OAuth is not wired for this provider yet')
      return
    }
    if (connectMode === 'cookie') {
      if (!connectCookie.trim()) {
        toast.error('Paste cookie JSON first')
        return
      }
      try {
        const res = await importCookieAccount({
          providerId: selectedProvider.id,
          name: connectLabel.trim() || `${selectedProvider.name} cookie`,
          raw: connectCookie,
          metadata: {
            displayLabel: connectLabel.trim() || undefined,
            defaultModel: connectModel || undefined,
            source: 'local_import',
          },
        })
        const identity = res?.data ? getConnectionIdentity(res.data) : null
        toast.success(`Imported${identity ? `: ${identity.primary}` : ''}`)
        setConnectMode(null)
        await load()
      }
      catch (e) {
        toast.error(String(e))
      }
      return
    }
  }

  const submitApiKeyConnect = async () => {
    if (!selectedProvider) return
    if (!connectApiKey.trim()) {
      toast.error('API key is required')
      return
    }
    try {
      await upsertLocalProviderAccount({
        providerId: selectedProvider.id,
        name: connectName.trim() || connectLabel.trim() || `${selectedProvider.name} key`,
        authMode: 'api_key',
        status: 'active',
        credentials: { apiKey: connectApiKey },
        metadata: {
          baseUrl: connectBaseUrl || undefined,
          defaultModel: connectModel || undefined,
          displayLabel: connectLabel.trim() || undefined,
          source: 'local',
        },
        quota: { limit: 0, window: 'day', used: 0 },
      })
      toast.success('API key connection saved')
      setConnectMode(null)
      await load()
    }
    catch (e) {
      toast.error(String(e))
    }
  }

  const pullFrom9Router = async () => {
    try {
      const res = await get9RouterProviders()
      const connections = Array.isArray((res as any).connections) ? (res as any).connections : []
      setRouterConnections(connections)
      setTransferText(JSON.stringify(connections.map((c: Record<string, unknown>) => ({
        providerId: String(c.provider || c.providerId || 'unknown'),
        name: String(c.email || c.name || c.id || '9Router connection'),
        authMode: String(c.authType || 'api_key') === 'oauth' ? 'oauth' : 'api_key',
        status: c.isActive === false ? 'disabled' : 'active',
        metadata: {
          source: '9router',
          connectionId: c.id,
          email: c.email,
          testStatus: c.testStatus,
        },
        quota: {},
      })), null, 2))
      toast.success(`Pulled ${connections.length} connection(s) from 9Router`)
    }
    catch (e) {
      toast.error(String(e))
    }
  }

  const importAccounts = async () => {
    try {
      const parsed = JSON.parse(transferText)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const account of list) {
        await upsertLocalProviderAccount({
          providerId: String(account.providerId || 'unknown'),
          name: String(account.name || account.metadata?.email || 'Imported account'),
          authMode: String(account.authMode || 'api_key'),
          status: account.status === 'disabled' ? 'disabled' : 'active',
          metadata: account.metadata || {},
          quota: account.quota || {},
        })
      }
      await load()
      toast.success('Import successful')
    }
    catch (e) {
      toast.error(String(e))
    }
  }

  const exportAccounts = () => {
    const payload = accounts.map(a => ({
      providerId: a.providerId,
      name: a.name,
      authMode: a.authMode,
      status: a.status,
      metadata: a.metadata || {},
      quota: a.quota || {},
    }))
    setTransferText(JSON.stringify(payload, null, 2))
    toast.success(`Exported ${payload.length} account(s)`)
  }

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds(prev => checked ? [...new Set([...prev, id])] : prev.filter(x => x !== id))
  }

  const toggleSelectAll = (checked: boolean, rows: ProviderAccountItem[]) => {
    if (!checked) {
      setSelectedIds([])
      return
    }
    setSelectedIds(rows.map(a => a.id))
  }

  const readyCount = catalog.filter(p => p.status === 'ready').length
  const connectionCount = accounts.filter(a => a.status === 'active').length

  const renderConnectionTable = (rows: ProviderAccountItem[], opts?: { bulk?: boolean, showProvider?: boolean }) => {
    const bulk = opts?.bulk !== false
    const allSelected = rows.length > 0 && rows.every(r => selectedIds.includes(r.id))
    const someSelected = rows.some(r => selectedIds.includes(r.id))

    return (
      <div data-testid="pc-connection-table" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left text-[13px]">
            <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                {bulk && (
                  <th className="w-10 px-3 py-2.5">
                    <Checkbox
                      data-testid="pc-select-all"
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={v => toggleSelectAll(v === true, rows)}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 font-semibold">Account</th>
                {opts?.showProvider && <th className="px-3 py-2.5 font-semibold">Provider</th>}
                <th className="px-3 py-2.5 font-semibold">Method</th>
                <th className="px-3 py-2.5 font-semibold">Plan</th>
                <th className="px-3 py-2.5 font-semibold">Quota</th>
                <th className="px-3 py-2.5 font-semibold">Model</th>
                <th className="px-3 py-2.5 font-semibold">Health</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((acc) => {
                const id = getConnectionIdentity(acc)
                const selected = selectedIds.includes(acc.id)
                const healthStatus = acc.lastHealthStatus || (id.isRoutable ? 'unknown' : 'n/a')
                const subCode = (id.subscriptionCode || '').toLowerCase()
                return (
                  <tr
                    key={acc.id}
                    data-testid={`pc-connection-row-${acc.id}`}
                    data-identity={id.primary}
                    className={cn(
                      'group border-b border-border/70 last:border-0 transition-colors hover:bg-muted/30',
                      selected && 'bg-muted/40',
                      !id.isRoutable && 'opacity-70',
                    )}
                  >
                    {bulk && (
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          data-testid={`pc-select-${acc.id}`}
                          checked={selected}
                          onCheckedChange={v => toggleSelect(acc.id, v === true)}
                          aria-label={`Select ${id.primary}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        data-testid={`pc-open-connection-${acc.id}`}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                        onClick={() => openEdit(acc)}
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {id.initials}
                        </div>
                        <div className="min-w-0">
                          <div data-testid="pc-connection-identity" className="truncate font-semibold tracking-tight">{id.primary}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {id.secondary || id.displayLabel || '—'}
                          </div>
                        </div>
                      </button>
                    </td>
                    {opts?.showProvider && (
                      <td className="px-3 py-3 text-muted-foreground">{acc.providerId}</td>
                    )}
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px] font-medium capitalize">
                        {acc.authMode.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      {id.subscription
                        ? (
                            <Badge
                              data-testid={`pc-subscription-${acc.id}`}
                              className={cn(
                                'h-5 rounded-md border-transparent px-1.5 text-[10px] font-medium',
                                subCode === 'super' && 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
                                subCode === 'pro' && 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
                                subCode === 'plus' && 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
                                (subCode === 'free' || subCode === 'unknown' || !subCode) && 'bg-muted text-muted-foreground',
                              )}
                            >
                              {id.subscription}
                            </Badge>
                          )
                        : <span className="text-[11px] text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        data-testid={`pc-quota-${acc.id}`}
                        className="font-mono text-[11px] text-muted-foreground"
                      >
                        {id.quotaLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{id.defaultModel || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={healthStatus} />
                        {acc.lastHealthAt && (
                          <span className="font-mono text-[10px] text-muted-foreground">{relativeHealthTime(acc.lastHealthAt)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {id.isRoutable
                        ? <StatusBadge status={acc.status || 'active'} />
                        : <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">Not routable</Badge>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        <IconAction
                          label="Check health"
                          icon={Activity}
                          testId={`pc-health-${acc.id}`}
                          busy={busyIds.includes(acc.id)}
                          onClick={() => void healthOne(acc.id)}
                        />
                        <IconAction
                          label="Edit"
                          icon={Pencil}
                          testId={`pc-edit-${acc.id}`}
                          onClick={() => openEdit(acc)}
                        />
                        <IconAction
                          label="Delete"
                          icon={Trash2}
                          testId={`pc-delete-${acc.id}`}
                          destructive
                          busy={busyIds.includes(acc.id)}
                          onClick={() => void deleteOne(acc.id)}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              aria-label="More actions"
                              onClick={e => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openEdit(acc)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void healthOne(acc.id)}>
                              <Activity className="mr-2 h-3.5 w-3.5" />
                              Check health
                            </DropdownMenuItem>
                            {acc.authMode === 'oauth' && acc.providerId === 'grok' && (
                              <DropdownMenuItem onClick={() => void startGrokOAuth(id.displayLabel || id.primary)}>
                                <KeyRound className="mr-2 h-3.5 w-3.5" />
                                Re-authenticate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => void disconnectOne(acc.id)}>
                              <Unplug className="mr-2 h-3.5 w-3.5" />
                              Disable
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void deleteOne(acc.id)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={bulk ? 10 : 9} className="px-4 py-12 text-center text-muted-foreground">
                    No connections yet. Add a connection to start routing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={250}>
    <div data-testid="provider-console" className="flex h-full min-h-0 bg-background text-[13px] antialiased">
      {/* Sidebar */}
      <aside data-testid="provider-console-sidebar" className="flex w-[220px] shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center gap-2.5 border-b border-border px-3 py-3.5">
          <Image
            src={logo}
            alt="Socials Hub"
            width={36}
            height={36}
            className="rounded-lg border border-border bg-background object-cover shadow-sm"
          />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight">Socials Hub</div>
            <div className="text-[11px] text-muted-foreground">Integrations</div>
          </div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          <div>
            <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">AI</div>
            <div className="space-y-0.5">
              <NavButton testId="pc-nav-providers" icon={Boxes} label="Providers" active={activeNav === 'providers'} count={readyCount} onClick={goCatalog} />
              <NavButton
                testId="pc-nav-connections"
                icon={ShieldCheck}
                label="Connections"
                active={activeNav === 'connections'}
                count={connectionCount}
                onClick={() => { setActiveNav('connections'); setSelectedProviderId(null); setSelectedIds([]); setEditingId(null) }}
              />
            </div>
          </div>
          <div>
            <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Ops</div>
            <div className="space-y-0.5">
              <NavButton testId="pc-nav-sync" icon={Zap} label="9Router sync" active={activeNav === 'sync'} onClick={() => { setActiveNav('sync'); setSelectedProviderId(null) }} />
            </div>
          </div>
        </div>
        <div className="m-2 rounded-lg bg-muted/50 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Connection identity comes from the provider (email / username). Display labels are optional.
        </div>
      </aside>

      {/* Main */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/30 px-5">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            {selectedProvider
              ? (
                  <>
                    <button type="button" className="hover:text-foreground" onClick={goCatalog}>Providers</button>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="truncate font-semibold text-foreground">{selectedProvider.name}</span>
                  </>
                )
              : (
                  <span className="font-semibold text-foreground capitalize">
                    {activeNav === 'sync' ? '9Router sync' : activeNav === 'connections' ? 'Connections' : 'Providers'}
                  </span>
                )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={loading} onClick={() => void load()}>
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-6">
          {/* Catalog */}
          {activeNav === 'providers' && !selectedProvider && (
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Providers</h1>
                  <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
                    Manage AI integrations used for generation and workflows. Only ready providers accept connections.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={providerSearch}
                    onChange={e => setProviderSearch(e.target.value)}
                    placeholder="Filter providers…"
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              <div data-testid="pc-provider-catalog" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-[13px]">
                    <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Provider</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Auth methods</th>
                        <th className="px-3 py-2.5">Connections</th>
                        <th className="px-4 py-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.map((provider) => {
                        const count = accounts.filter(a =>
                          (a.providerId === provider.id || (provider.id === 'grok' && a.providerId === 'xai'))
                          && a.status === 'active',
                        ).length
                        const planned = provider.status === 'planned'
                        return (
                          <tr
                            key={provider.id}
                            data-testid={`pc-provider-row-${provider.id}`}
                            data-status={provider.status}
                            className={cn(
                              'border-b border-border/70 last:border-0',
                              planned ? 'opacity-70' : 'cursor-pointer hover:bg-muted/30',
                            )}
                            onClick={() => openProvider(provider.id, provider)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <ProviderMark id={provider.id} name={provider.name} />
                                <div className="min-w-0">
                                  <div className="font-semibold tracking-tight">{provider.name}</div>
                                  <div className="truncate text-[12px] text-muted-foreground">
                                    {(provider.capabilities || []).join(' · ') || provider.category}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {planned
                                ? <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">Planned</Badge>
                                : <StatusBadge status="Ready" />}
                            </td>
                            <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                              {(provider.authModes || []).join(' · ') || '—'}
                            </td>
                            <td className="px-3 py-3">
                              {planned
                                ? <span className="text-muted-foreground">—</span>
                                : (
                                    <span>
                                      <span className="font-semibold tabular-nums">{count}</span>
                                      {' '}
                                      <span className="text-muted-foreground">active</span>
                                    </span>
                                  )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {planned
                                ? <span className="text-[12px] text-muted-foreground">Unavailable</span>
                                : (
                                    <Button
                                      data-testid={`pc-manage-${provider.id}`}
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-1.5 px-2.5"
                                      onClick={(e) => { e.stopPropagation(); openProvider(provider.id, provider) }}
                                    >
                                      Open
                                    </Button>
                                  )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Provider detail */}
          {activeNav === 'providers' && selectedProvider && (
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <Button variant="ghost" size="icon" className="mt-0.5 h-8 w-8 shrink-0" onClick={goCatalog}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <ProviderMark id={selectedProvider.id} name={selectedProvider.name} className="h-10 w-10 rounded-[10px] text-sm" />
                  <div>
                    <h1 className="text-lg font-semibold tracking-tight">{selectedProvider.name}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                      <StatusBadge status="Ready" />
                      <span>·</span>
                      <span className="capitalize">{selectedProvider.category}</span>
                      <span>·</span>
                      <span>{(selectedProvider.capabilities || []).join(' · ')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                  <div className="inline-flex overflow-hidden rounded-lg border border-border bg-card">
                    <span className="border-r border-border px-3 py-1.5">
                      <b className="mr-1 tabular-nums text-foreground">{providerAccounts.filter(a => a.status === 'active').length}</b>
                      connected
                    </span>
                    <span className="border-r border-border px-3 py-1.5">
                      <b className="mr-1 tabular-nums text-foreground">
                        {providerAccounts.filter(a => healthTone(a.lastHealthStatus) === 'ok').length}
                      </b>
                      healthy
                    </span>
                    <span className="px-3 py-1.5">
                      <b className="mr-1 tabular-nums text-foreground">
                        {providerAccounts.filter(a => a.hasCredentials === false).length}
                      </b>
                      metadata-only
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-0 border-b border-border">
                {([
                  ['connections', 'Connections'],
                  ['settings', 'Provider settings'],
                  ['activity', 'Activity'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDetailTab(key)}
                    className={cn(
                      'h-9 border-b-2 px-3 text-[13px] font-medium transition-colors',
                      detailTab === key
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {detailTab === 'connections' && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-[13px] font-semibold">
                        Connections
                        <span className="ml-2 font-normal text-muted-foreground">
                          Identity is the provider account (email / username)
                        </span>
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeSelected.length > 0 && (
                        <div data-testid="pc-bulk-bar" className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-1.5 py-1">
                          <span className="px-2 text-[12px] font-medium tabular-nums text-muted-foreground">
                            {activeSelected.length}
                            {' '}
                            selected
                          </span>
                          <IconAction
                            label="Check health"
                            icon={Activity}
                            testId="pc-bulk-health"
                            disabled={loading}
                            onClick={() => void bulkHealth()}
                          />
                          <IconAction
                            label="Disable"
                            icon={Unplug}
                            testId="pc-bulk-disconnect"
                            disabled={loading}
                            onClick={() => void bulkDisconnect()}
                          />
                          <IconAction
                            label="Delete"
                            icon={Trash2}
                            testId="pc-bulk-delete"
                            destructive
                            disabled={loading}
                            onClick={() => void bulkDelete()}
                          />
                          <IconAction
                            label="Clear selection"
                            icon={X}
                            onClick={() => setSelectedIds([])}
                          />
                        </div>
                      )}
                      <IconAction
                        label="Check health for all connections"
                        icon={Activity}
                        disabled={loading || !providerAccounts.length}
                        onClick={() => void bulkHealth(providerAccounts.map(a => a.id))}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button data-testid="pc-add-connection" size="sm" className="h-8 gap-1.5">
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {(selectedProvider.authModes || []).includes('oauth') && (
                            <DropdownMenuItem onClick={() => beginConnect('oauth')}>
                              <KeyRound className="mr-2 h-3.5 w-3.5" />
                              OAuth
                            </DropdownMenuItem>
                          )}
                          {(selectedProvider.authModes || []).some(m => m.includes('cookie')) && (
                            <DropdownMenuItem onClick={() => beginConnect('cookie')}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              Cookie import
                            </DropdownMenuItem>
                          )}
                          {(selectedProvider.authModes || []).includes('api_key') && (
                            <DropdownMenuItem onClick={() => beginConnect('api_key')}>
                              <KeyRound className="mr-2 h-3.5 w-3.5" />
                              API key
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {renderConnectionTable(providerAccounts)}

                  <p className="text-[12px] text-muted-foreground">
                    Primary identity is always the provider subject (email or username). Optional labels live in connection settings and never replace the subject.
                  </p>
                </div>
              )}

              {detailTab === 'settings' && (
                <div className="max-w-lg space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="space-y-2">
                    <Label>Default model for new connections</Label>
                    <div className="flex gap-2">
                      <Select value={connectModel} onValueChange={setConnectModel}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {(models.length ? models : [{ id: 'grok-3' }, { id: 'grok-imagine-video' }, { id: 'cx_agy' }]).map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="h-9" onClick={() => void discoverModels()}>Discover</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Applied only when a connection has no model override.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Auth modes</Label>
                    <div className="font-mono text-[12px] text-muted-foreground">{(selectedProvider.authModes || []).join(' · ')}</div>
                  </div>
                </div>
              )}

              {detailTab === 'activity' && (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <table className="w-full text-left text-[13px]">
                    <thead className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Time</th>
                        <th className="px-3 py-2.5">Connection</th>
                        <th className="px-3 py-2.5">Event</th>
                        <th className="px-3 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerAccounts.slice(0, 8).map(acc => (
                        <tr key={acc.id} className="border-b border-border/70 last:border-0">
                          <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                            {relativeHealthTime(acc.lastHealthAt || acc.lastUsedAt) || '—'}
                          </td>
                          <td className="px-3 py-2.5">{getConnectionIdentity(acc).primary}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">health / sync</td>
                          <td className="px-3 py-2.5"><StatusBadge status={acc.lastHealthStatus || acc.status} /></td>
                        </tr>
                      ))}
                      {!providerAccounts.length && (
                        <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No activity yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* All connections */}
          {activeNav === 'connections' && (
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    All AI accounts across providers. Rows without credentials are imports only and cannot be routed.
                  </p>
                </div>
                <Button size="sm" className="h-8" onClick={goCatalog}>Add from provider</Button>
              </div>
              {activeSelected.length > 0 && (
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                  <span className="px-1 text-[12px] font-medium text-muted-foreground">
                    {activeSelected.length}
                    {' '}
                    selected
                  </span>
                  <IconAction label="Check health" icon={Activity} onClick={() => void bulkHealth()} />
                  <IconAction label="Disable" icon={Unplug} onClick={() => void bulkDisconnect()} />
                  <IconAction label="Delete" icon={Trash2} destructive onClick={() => void bulkDelete()} />
                  <IconAction label="Clear selection" icon={X} onClick={() => setSelectedIds([])} />
                </div>
              )}
              {renderConnectionTable(accounts, { showProvider: true })}
            </div>
          )}

          {/* Sync */}
          {activeNav === 'sync' && (
            <div className="mx-auto max-w-3xl space-y-4">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">9Router sync</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Pull gateway connections into Socials Hub. OAuth sessions stay owned by 9Router; only API keys are push-safe.
                </p>
              </div>
              <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void pullFrom9Router()}>
                    <DownloadCloud className="mr-1.5 h-3.5 w-3.5" />
                    Fetch 9Router connections
                  </Button>
                  <Button variant="outline" size="sm" disabled={!transferText.trim()} onClick={() => void importAccounts()}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Import to Socials Hub
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportAccounts}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Export JSON
                  </Button>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-left text-[12px]">
                    <thead className="border-b bg-muted/40 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Connection</th>
                        <th className="px-3 py-2">Provider</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routerConnections.map((c: any) => (
                        <tr key={String(c.id)} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{String(c.email || c.name || c.id)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{String(c.provider || c.providerId)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.isActive === false ? 'Disabled' : 'Active'}</td>
                        </tr>
                      ))}
                      {!routerConnections.length && (
                        <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">No data pulled yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Textarea
                  value={transferText}
                  onChange={e => setTransferText(e.target.value)}
                  placeholder="Import/export JSON payload (secrets excluded)…"
                  className="min-h-40 font-mono text-[11px]"
                />
              </div>
            </div>
          )}

        </div>
      </section>

      {/* Edit drawer — overlays, does not shrink main table */}
      <Sheet open={!!editingAccount} onOpenChange={(open) => { if (!open) { setEditingId(null); setConfirmDisconnect(false) } }}>
        <SheetContent side="right" data-testid="pc-edit-drawer" className="flex w-full flex-col gap-0 p-0 sm:max-w-md" hideCloseButton>
          {editingAccount && (() => {
            const id = getConnectionIdentity(editingAccount)
            return (
              <>
                <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <SheetTitle data-testid="pc-edit-title" className="truncate text-[15px]">{id.primary}</SheetTitle>
                      <SheetDescription className="text-[12px]">
                        {editingAccount.providerId}
                        {' '}
                        ·
                        {editingAccount.authMode}
                        {' '}
                        ·
                        {id.source}
                      </SheetDescription>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </SheetHeader>

                <ScrollArea className="flex-1">
                  <div className="space-y-5 px-5 py-4">
                    <div>
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        {[
                          ['Email', id.email || '—'],
                          ['Username', id.username || '—'],
                          ['Subscription', id.subscription || '—'],
                          ['Quota', id.quotaLabel || '—'],
                          ['Credentials', editingAccount.hasCredentials === false ? 'Metadata only' : 'Encrypted · present'],
                          ['Provider id', editingAccount.providerId],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-[12px] last:border-0">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="max-w-[60%] truncate text-right font-mono text-[11px] font-medium">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="display-label">Display label (optional)</Label>
                      <Input id="display-label" value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="e.g. Production Grok" />
                      <p className="text-[11px] text-muted-foreground">Never replaces the real email/username in lists or routing logs.</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Default model</Label>
                        <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => void discoverModels()}>Discover models</button>
                      </div>
                      <Select value={editModel || '__none__'} onValueChange={v => setEditModel(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">—</SelectItem>
                          {editModel && !models.some(m => m.id === editModel) && (
                            <SelectItem value={editModel}>{editModel}</SelectItem>
                          )}
                          {models.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.id}{m.ownedBy ? ` · ${m.ownedBy}` : ''}</SelectItem>
                          ))}
                          {!models.length && ['grok-3', 'grok-imagine-video', 'grok-2-image', 'cx_agy'].map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {(editingAccount.authMode === 'api_key' || editingAccount.authMode === '9router') && (
                      <div className="space-y-2">
                        <Label>Rotate API key</Label>
                        <Input type="password" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Leave blank to keep" />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Quota (local routing)</Label>
                      <div className="grid grid-cols-[1fr_110px] gap-2">
                        <Input type="number" min={0} value={editQuotaLimit} onChange={e => setEditQuotaLimit(e.target.value)} />
                        <Select value={editQuotaWindow} onValueChange={v => setEditQuotaWindow(v as 'day' | 'hour')}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day">per day</SelectItem>
                            <SelectItem value="hour">per hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-[11px] text-muted-foreground">0 = unlimited. Enforced only inside Socials Hub routing.</p>
                    </div>

                    <div>
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle</div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        {[
                          ['Status', editingAccount.status],
                          ['Last health', `${editingAccount.lastHealthStatus || '—'} · ${relativeHealthTime(editingAccount.lastHealthAt) || 'never'}`],
                          ['Last used', relativeHealthTime(editingAccount.lastUsedAt) || 'Never routed'],
                        ].map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-[12px] last:border-0">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="text-right font-medium">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={cn(
                      'rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed',
                      id.isRoutable
                        ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200'
                        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
                    )}
                    >
                      {id.isRoutable
                        ? 'Credentials are present. Re-authenticate only if health fails or you need to switch the signed-in provider user.'
                        : 'This row is metadata-only (no local credentials). It cannot be used for routing until you reconnect with OAuth, cookie, or API key.'}
                    </div>

                    {confirmDisconnect && (
                      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <div>
                          <div className="text-[13px] font-semibold">Remove this connection?</div>
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            <strong className="text-foreground">{id.primary}</strong>
                            {' '}
                            — disable keeps the row but stops routing; delete removes credentials permanently.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" className="h-8" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
                          <Button variant="outline" size="sm" className="h-8" onClick={() => void disconnectOne(editingAccount.id)}>
                            <Unplug className="mr-1.5 h-3.5 w-3.5" />
                            Disable
                          </Button>
                          <Button variant="destructive" size="sm" className="h-8" onClick={() => void deleteOne(editingAccount.id)}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <SheetFooter className="border-t border-border bg-muted/20 p-3 sm:flex-col sm:space-x-0">
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex items-center gap-0.5">
                      <IconAction
                        label="Check health"
                        icon={Activity}
                        busy={busyIds.includes(editingAccount.id)}
                        onClick={() => void healthOne(editingAccount.id)}
                      />
                      {editingAccount.authMode === 'oauth' && selectedProviderId === 'grok' && (
                        <IconAction
                          label="Re-authenticate"
                          icon={KeyRound}
                          onClick={() => void startGrokOAuth(id.displayLabel || id.primary)}
                        />
                      )}
                      <IconAction
                        label="Disable connection"
                        icon={Unplug}
                        onClick={() => void disconnectOne(editingAccount.id)}
                      />
                      <IconAction
                        label="Delete connection"
                        icon={Trash2}
                        destructive
                        onClick={() => setConfirmDisconnect(true)}
                      />
                    </div>
                    <Button className="h-9 px-4" onClick={() => void saveEdit()}>Save</Button>
                  </div>
                </SheetFooter>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>

      {/* Connect drawer */}
      <Sheet open={connectMode !== null} onOpenChange={(open) => { if (!open) setConnectMode(null) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md" hideCloseButton>
          <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="text-[15px]">
                  {connectMode === 'oauth' && `Connect ${selectedProvider?.name || ''} with OAuth`}
                  {connectMode === 'cookie' && `Import ${selectedProvider?.name || ''} cookies`}
                  {connectMode === 'api_key' && `Add ${selectedProvider?.name || ''} API key`}
                </SheetTitle>
                <SheetDescription className="text-[12px]">
                  {connectMode === 'oauth'
                    ? 'Identity is assigned by the provider after authorization — you do not invent account names.'
                    : connectMode === 'cookie'
                      ? 'Identity is derived after cookie validation.'
                      : 'Store an encrypted API key for this provider.'}
                </SheetDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConnectMode(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {connectMode === 'oauth' && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  After you authorize, Socials Hub stores tokens encrypted and sets the connection identity to the email/username returned by the provider.
                </div>
                <div className="space-y-2">
                  <Label>Display label (optional)</Label>
                  <Input value={connectLabel} onChange={e => setConnectLabel(e.target.value)} placeholder="Leave empty to use provider email only" />
                </div>
                <div className="space-y-2">
                  <Label>Default model</Label>
                  <Select value={connectModel} onValueChange={setConnectModel}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['grok-3', 'grok-imagine-video', 'grok-2-image', ...models.map(m => m.id)].filter((v, i, a) => a.indexOf(v) === i).map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="overflow-hidden rounded-lg border border-border text-[12px]">
                  <div className="flex justify-between border-b px-3 py-2"><span className="text-muted-foreground">Account name</span><span className="text-muted-foreground">Assigned after OAuth</span></div>
                  <div className="flex justify-between border-b px-3 py-2"><span className="text-muted-foreground">Method</span><span>OAuth device login</span></div>
                  <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">Provider</span><span className="font-mono text-[11px]">{selectedProvider?.id}</span></div>
                </div>
                {grokLogin?.status === 'pending' && grokLogin.userCode && (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[12px]">
                    Device code:
                    {' '}
                    <strong>{grokLogin.userCode}</strong>
                  </div>
                )}
              </>
            )}

            {connectMode === 'cookie' && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Use only cookies from a browser profile you own. Do not invent “Account 1/2” names.
                </div>
                <div className="space-y-2">
                  <Label>Cookie JSON</Label>
                  <Textarea
                    value={connectCookie}
                    onChange={e => setConnectCookie(e.target.value)}
                    className="min-h-28 font-mono text-[11px]"
                    placeholder='[{"name":"auth_token","value":"…","domain":".x.ai"}]'
                  />
                </div>
                <div className="space-y-2">
                  <Label>Display label (optional)</Label>
                  <Input value={connectLabel} onChange={e => setConnectLabel(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Default model</Label>
                  <Input value={connectModel} onChange={e => setConnectModel(e.target.value)} />
                </div>
              </>
            )}

            {connectMode === 'api_key' && (
              <>
                <div className="space-y-2">
                  <Label>Connection name / label</Label>
                  <Input value={connectName} onChange={e => setConnectName(e.target.value)} placeholder="e.g. Production key" />
                </div>
                <div className="space-y-2">
                  <Label>API key</Label>
                  <Input type="password" value={connectApiKey} onChange={e => setConnectApiKey(e.target.value)} placeholder="sk-…" />
                </div>
                <div className="space-y-2">
                  <Label>Base URL (optional)</Label>
                  <Input value={connectBaseUrl} onChange={e => setConnectBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
                </div>
                <div className="space-y-2">
                  <Label>Default model</Label>
                  <Input value={connectModel} onChange={e => setConnectModel(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <SheetFooter className="border-t border-border bg-muted/20 p-4 sm:flex-row sm:space-x-2">
            <Button variant="outline" className="h-9 flex-1" onClick={() => setConnectMode(null)}>Cancel</Button>
            {connectMode === 'api_key'
              ? (
                  <Button className="h-9 flex-1" onClick={() => void submitApiKeyConnect()}>Save API key</Button>
                )
              : (
                  <Button className="h-9 flex-1" onClick={() => void submitConnect()}>
                    {connectMode === 'oauth' ? 'Continue to provider' : 'Import & validate'}
                  </Button>
                )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
    </TooltipProvider>
  )
}
