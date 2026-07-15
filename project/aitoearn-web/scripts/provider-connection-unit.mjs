/**
 * Lightweight unit checks for provider connection identity helpers.
 * Run: node scripts/provider-connection-unit.mjs
 * (Mirrors src/utils/providerConnection.ts without TS path aliases.)
 */

function isProviderEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getConnectionIdentity(account) {
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
  const secondaryParts = []
  if (email && username) secondaryParts.push(username)
  if (account.authMode === 'cookie_import' || account.authMode === 'cookie')
    secondaryParts.push('cookie session')
  if (typeof meta.source === 'string' && meta.source === '9router' && !account.hasCredentials)
    secondaryParts.push('import shell')

  const source = String(meta.source || (
    account.authMode === 'oauth' ? 'oauth'
      : account.authMode === 'cookie_import' || account.authMode === 'cookie' ? 'local_import'
        : account.authMode || 'local'
  ))

  const isRoutable = account.hasCredentials !== false && account.status === 'active'
  const subscription = typeof meta.subscription === 'string' && meta.subscription.trim()
    ? meta.subscription.trim()
    : undefined
  const subscriptionCode = typeof meta.subscriptionCode === 'string' ? meta.subscriptionCode : undefined
  const quotaLimit = Number(account.quota?.limit ?? 0)
  const quotaUsed = Number(account.quota?.used ?? 0)
  const quotaWindow = String(account.quota?.window || 'day')
  const quotaLabel = !Number.isFinite(quotaLimit) || quotaLimit <= 0
    ? 'Unlimited'
    : `${Math.max(0, quotaUsed)}/${quotaLimit} · ${quotaWindow}`
  return {
    primary,
    secondary: secondaryParts.join(' · ') || undefined,
    username,
    source,
    isRoutable,
    subscription,
    subscriptionCode,
    quotaLabel,
  }
}

function healthTone(status) {
  const s = (status || '').toLowerCase()
  if (!s || s === 'n/a') return 'muted'
  if (['ok', 'healthy', 'active', 'checked', 'ready'].includes(s)) return 'ok'
  if (['warn', 'cooldown', 'pending', 'degraded'].includes(s)) return 'warn'
  return 'bad'
}

let failed = 0
function check(name, cond) {
  if (!cond) {
    failed += 1
    console.error(`FAIL  ${name}`)
  }
  else {
    console.log(`PASS  ${name}`)
  }
}

check('email detect', isProviderEmail('westydoctorihan@hotmail.com') === true)
check('reject Account 2', isProviderEmail('Grok Account 2') === false)

const oauth = getConnectionIdentity({
  id: '1',
  providerId: 'grok',
  name: 'Grok Account 2',
  authMode: 'oauth',
  status: 'active',
  hasCredentials: true,
  metadata: { email: 'westydoctorihan@hotmail.com', username: 'westydoctorihan', source: 'xai_oauth' },
})
check('prefers metadata email', oauth.primary === 'westydoctorihan@hotmail.com')
check('username @prefix', oauth.username === '@westydoctorihan')
check('source xai_oauth', oauth.source === 'xai_oauth')

const grokPlan = getConnectionIdentity({
  id: '2',
  providerId: 'grok',
  name: 'seat@example.com',
  authMode: 'oauth',
  status: 'active',
  hasCredentials: true,
  metadata: { email: 'seat@example.com', subscription: 'SuperGrok', subscriptionCode: 'super' },
  quota: { limit: 20, used: 3, window: 'day' },
})
check('subscription badge', grokPlan.subscription === 'SuperGrok')
check('quota label', grokPlan.quotaLabel === '3/20 · day')

const unlimited = getConnectionIdentity({
  id: '3',
  providerId: 'grok',
  name: 'free@example.com',
  authMode: 'oauth',
  status: 'active',
  hasCredentials: true,
  metadata: { email: 'free@example.com', subscription: 'Free', subscriptionCode: 'free' },
  quota: { limit: 0, used: 0, window: 'day' },
})
check('unlimited quota', unlimited.quotaLabel === 'Unlimited')

const cookie = getConnectionIdentity({
  id: '2',
  providerId: 'grok',
  name: 'nxhytb2004@gmail.com',
  authMode: 'cookie_import',
  status: 'active',
  hasCredentials: true,
  metadata: { source: 'local_import' },
})
check('email-like name', cookie.primary === 'nxhytb2004@gmail.com')
check('cookie secondary', String(cookie.secondary || '').includes('cookie session'))

const ghost = getConnectionIdentity({
  id: '3',
  providerId: 'xai',
  name: 'ghost@example.com',
  authMode: 'oauth',
  status: 'active',
  hasCredentials: false,
  metadata: { source: '9router', email: 'ghost@example.com' },
})
check('ghost not routable', ghost.isRoutable === false)
check('ghost import shell', String(ghost.secondary || '').includes('import shell'))

check('health ok', healthTone('ok') === 'ok')
check('health ready', healthTone('Ready') === 'ok')
check('health muted', healthTone('n/a') === 'muted')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll identity unit checks passed')
