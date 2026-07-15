import type { ProviderAccountItem } from '@/api/aiProviders'

export function isProviderEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function relativeHealthTime(iso?: string) {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return null
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function getConnectionIdentity(account: ProviderAccountItem) {
  const meta = account.metadata || {}
  const email = typeof meta.email === 'string' && meta.email.includes('@')
    ? meta.email
    : isProviderEmail(account.name)
      ? account.name
      : undefined
  const usernameRaw = typeof meta.username === 'string'
    ? meta.username
    : typeof meta.handle === 'string'
      ? meta.handle
      : undefined
  const username = usernameRaw
    ? (usernameRaw.startsWith('@') ? usernameRaw : `@${usernameRaw}`)
    : undefined

  const primary = email || username || account.name || account.id
  const secondaryParts: string[] = []
  if (email && username) secondaryParts.push(username)
  if (account.authMode === 'cookie_import' || account.authMode === 'cookie')
    secondaryParts.push('cookie session')
  if (typeof meta.source === 'string' && meta.source === '9router' && !account.hasCredentials)
    secondaryParts.push('import shell')

  const displayLabel = typeof meta.displayLabel === 'string'
    ? meta.displayLabel
    : (account.name
      && account.name !== primary
      && !isProviderEmail(account.name)
      ? account.name
      : undefined)

  const source = String(meta.source || (
    account.authMode === 'oauth' ? 'oauth'
      : account.authMode === 'cookie_import' || account.authMode === 'cookie' ? 'local_import'
        : account.authMode || 'local'
  ))

  const defaultModel = typeof meta.defaultModel === 'string' ? meta.defaultModel : undefined
  const isRoutable = account.hasCredentials !== false && account.status === 'active'
  const initials = primary
    .replace(/@.*/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase() || 'AC'

  const subscription = typeof meta.subscription === 'string' && meta.subscription.trim()
    ? meta.subscription.trim()
    : typeof meta.subscriptionCode === 'string'
      ? meta.subscriptionCode
      : undefined
  const subscriptionCode = typeof meta.subscriptionCode === 'string'
    ? meta.subscriptionCode
    : undefined

  const quotaLimit = Number(account.quota?.limit ?? 0)
  const quotaUsed = Number(account.quota?.used ?? 0)
  const quotaWindow = String(account.quota?.window || 'day')
  const quotaLabel = !Number.isFinite(quotaLimit) || quotaLimit <= 0
    ? 'Unlimited'
    : `${Math.max(0, quotaUsed)}/${quotaLimit} · ${quotaWindow}`

  return {
    primary,
    secondary: secondaryParts.join(' · ') || undefined,
    displayLabel,
    email,
    username,
    source,
    defaultModel,
    isRoutable,
    initials,
    subscription,
    subscriptionCode,
    quotaLabel,
    quotaLimit: Number.isFinite(quotaLimit) ? quotaLimit : 0,
    quotaUsed: Number.isFinite(quotaUsed) ? quotaUsed : 0,
    quotaWindow,
  }
}

export function healthTone(status?: string) {
  const s = (status || '').toLowerCase()
  if (!s || s === 'n/a') return 'muted' as const
  if (['ok', 'healthy', 'active', 'checked', 'ready'].includes(s)) return 'ok' as const
  if (['warn', 'cooldown', 'pending', 'degraded'].includes(s)) return 'warn' as const
  return 'bad' as const
}
