import { getAccounts, saveAccounts, type LocalAccount } from '../_local'

const DISCOVERY_URL = 'https://auth.x.ai/.well-known/openid-configuration'
const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const DEFAULT_BASE_URL = 'https://api.x.ai/v1'

type GrokModel = { id: string, ownedBy?: string, type?: 'chat' | 'image' | 'video' }

type TokenResponse = { access_token?: string, refresh_token?: string, expires_in?: number, token_type?: string, id_token?: string }

export type GrokSubscription = {
  tier: number
  code: 'free' | 'plus' | 'pro' | 'super' | 'unknown'
  label: string
}

export function subscriptionFromTier(tierRaw: unknown): GrokSubscription {
  const tier = Number(tierRaw)
  if (!Number.isFinite(tier) || tier <= 0)
    return { tier: 0, code: 'unknown', label: 'Unknown' }
  if (tier >= 4)
    return { tier, code: 'super', label: 'SuperGrok' }
  if (tier >= 3)
    return { tier, code: 'pro', label: 'Pro' }
  if (tier >= 2)
    return { tier, code: 'plus', label: 'Plus' }
  return { tier, code: 'free', label: 'Free' }
}

export function formatGrokModelLabel(modelId: string) {
  const id = modelId.replace(/^grok::/, '')
  if (id === 'grok-imagine-video')
    return 'Grok Imagine Video'
  if (id === 'grok-imagine-video-1.5' || id.startsWith('grok-imagine-video-1.5'))
    return 'Grok Imagine Video 1.5'
  if (id === 'grok-imagine-image')
    return 'Grok Imagine Image'
  if (id === 'grok-imagine-image-quality')
    return 'Grok Imagine Image Quality'
  return id
    .replace(/^grok-/, 'Grok ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function expiresSoon(account: LocalAccount) {
  const expiresAt = Date.parse(String(account.metadata?.expiresAt || ''))
  return !expiresAt || expiresAt - Date.now() < 60_000
}

function decodeJwtClaims(token?: string) {
  try {
    const payload = token?.split('.')[1]
    return payload ? JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown> : {}
  }
  catch { return {} as Record<string, unknown> }
}

function applyIdentityClaims(account: LocalAccount, claims: Record<string, unknown>) {
  const email = String(claims.email || claims.preferred_username || account.metadata?.email || '')
  const displayName = String(claims.name || claims.given_name || account.metadata?.displayName || '')
  const subscription = subscriptionFromTier(claims.tier ?? account.metadata?.subscriptionTier)
  account.name = email || displayName || account.name
  account.metadata = {
    ...account.metadata,
    email,
    displayName,
    subscriptionTier: subscription.tier,
    subscriptionCode: subscription.code,
    subscription: subscription.label,
    teamId: claims.team_id ? String(claims.team_id) : account.metadata?.teamId,
  }
  return account
}

/** How long a spending-limit / rate-limit seat stays out of the pool. */
const GROK_BLOCK_TTL_MS = 6 * 60 * 60 * 1000

export type GrokPoolSkipReason = 'free' | 'limit' | 'disabled' | 'no_token' | 'health' | 'excluded'

function isGrokCandidate(account: LocalAccount) {
  return account.providerId === 'grok'
    && account.status !== 'disabled'
    && Boolean(account.credentials?.accessToken)
}

function quotaRemaining(account: LocalAccount) {
  const limit = Number(account.quota?.limit || 0)
  const used = Number(account.quota?.used || 0)
  if (!Number.isFinite(limit) || limit <= 0)
    return Number.POSITIVE_INFINITY
  return Math.max(0, limit - (Number.isFinite(used) ? used : 0))
}

/** Normalize subscription from JWT claims / health metadata. */
export function getGrokAccountSubscription(account: LocalAccount): GrokSubscription {
  const code = String(account.metadata?.subscriptionCode || '').toLowerCase()
  if (code === 'free' || code === 'plus' || code === 'pro' || code === 'super')
    return subscriptionFromTier(
      account.metadata?.subscriptionTier
      ?? (code === 'super' ? 4 : code === 'pro' ? 3 : code === 'plus' ? 2 : 1),
    )
  return subscriptionFromTier(account.metadata?.subscriptionTier)
}

/** Free tier cannot reliably run Imagine Video / paid gen — always skip in pool. */
export function isGrokFreeSeat(account: LocalAccount) {
  const sub = getGrokAccountSubscription(account)
  if (sub.code === 'free')
    return true
  // tier 1 = free; tier 0/unknown is not treated as free (avoid skipping un-hydrated seats)
  if (sub.tier === 1)
    return true
  const health = String(account.lastHealthStatus || account.metadata?.healthStatus || '').toLowerCase()
  return health === 'free'
}

/** Seat temporarily out of credits / rate-limited (do not select for new jobs). */
export function isAccountTemporarilyBlocked(account: LocalAccount) {
  const until = Date.parse(String(account.metadata?.blockedUntil || ''))
  // Active TTL block (spending-limit / rate-limit)
  if (Number.isFinite(until) && until > Date.now())
    return true
  // Local quota exhausted
  if (quotaRemaining(account) === 0 && Number(account.quota?.limit || 0) > 0)
    return true
  // Health marked limit without TTL yet (just failed) — skip until health clears it
  if (!Number.isFinite(until) || until <= 0) {
    const health = String(account.lastHealthStatus || account.metadata?.healthStatus || '').toLowerCase()
    if (health === 'limit' || health === 'rate_limit' || health === 'spending_limit')
      return true
    if (account.metadata?.poolEligible === false && String(account.metadata?.poolSkipReason || '') === 'limit')
      return true
  }
  // blockedUntil expired → allow retry (stale health=limit alone does not pin forever)
  return false
}

/**
 * Why this seat must be skipped for new generation work.
 * Free + limit-hit are hard skips so we never burn latency on known-bad seats.
 */
export function getGrokPoolSkipReason(account: LocalAccount): GrokPoolSkipReason | null {
  if (account.providerId !== 'grok')
    return 'disabled'
  if (account.status === 'disabled')
    return 'disabled'
  if (!account.credentials?.accessToken)
    return 'no_token'
  if (isGrokFreeSeat(account))
    return 'free'
  if (isAccountTemporarilyBlocked(account))
    return 'limit'
  // Free from last health (subscription may lag JWT) — still hard skip
  if (account.metadata?.poolEligible === false && String(account.metadata?.poolSkipReason || '') === 'free')
    return 'free'
  return null
}

export function isGrokPoolEligible(account: LocalAccount) {
  return isGrokCandidate(account) && getGrokPoolSkipReason(account) === null
}

function sortPoolCandidates(a: LocalAccount, b: LocalAccount) {
  // Eligible paid seats first; free/limit always last (should already be filtered out).
  const skipA = getGrokPoolSkipReason(a)
  const skipB = getGrokPoolSkipReason(b)
  if (skipA && !skipB)
    return 1
  if (skipB && !skipA)
    return -1
  // Prefer higher subscription (Super > Pro > Plus)
  const tierA = getGrokAccountSubscription(a).tier
  const tierB = getGrokAccountSubscription(b).tier
  if (tierA !== tierB)
    return tierB - tierA
  const remA = quotaRemaining(a)
  const remB = quotaRemaining(b)
  // Prefer seats with remaining local quota; exhausted seats go last.
  if (remA === 0 && remB > 0)
    return 1
  if (remB === 0 && remA > 0)
    return -1
  const usedA = Date.parse(String(a.metadata?.lastUsedAt || 0)) || 0
  const usedB = Date.parse(String(b.metadata?.lastUsedAt || 0)) || 0
  return usedA - usedB
}

function applyPoolEligibilityMetadata(
  account: LocalAccount,
  opts: {
    eligible: boolean
    skipReason?: GrokPoolSkipReason | null
    healthStatus: string
    detail?: string
  },
) {
  const now = new Date().toISOString()
  account.lastHealthStatus = opts.healthStatus
  account.lastHealthAt = now
  account.metadata = {
    ...account.metadata,
    healthStatus: opts.healthStatus,
    poolEligible: opts.eligible,
    poolSkipReason: opts.eligible ? null : (opts.skipReason || 'health'),
    poolSkipDetail: opts.eligible ? null : String(opts.detail || opts.skipReason || '').slice(0, 300),
    poolCheckedAt: now,
  }
  account.updatedAt = now
  return account
}

/**
 * 403 spending-limit / team-blocked / 429 → rotate to next OAuth seat.
 * Auth/validation errors are NOT rotated (would burn the whole pool).
 */
function isPoolRotatableError(status: number, message: string) {
  if (status === 429)
    return true
  if (status !== 403)
    return false
  const m = message.toLowerCase()
  return (
    m.includes('spending-limit')
    || m.includes('personal-team-blocked')
    || m.includes('quota')
    || m.includes('rate limit')
    || m.includes('rate_limit')
    || m.includes('insufficient')
    || m.includes('credits')
    || m.includes('usage limit')
  )
}

function parseGrokHttpError(error: unknown): { status: number, message: string } | null {
  const message = error instanceof Error ? error.message : String(error || '')
  const match = message.match(/HTTP\s+(\d{3})/i)
  if (!match)
    return null
  return { status: Number(match[1]), message }
}

export async function listGrokPoolAccounts() {
  const accounts = await getAccounts()
  return accounts.filter(isGrokCandidate)
}

/** Seats the pool will actually use (paid + not limit-hit). */
export async function listGrokEligiblePoolAccounts() {
  const seats = await listGrokPoolAccounts()
  return seats.filter(isGrokPoolEligible)
}

export async function getGrokPoolSummary() {
  const seats = await listGrokPoolAccounts()
  const eligible = seats.filter(isGrokPoolEligible)
  const skippedFree = seats.filter(account => getGrokPoolSkipReason(account) === 'free')
  const skippedLimit = seats.filter(account => getGrokPoolSkipReason(account) === 'limit')
  const subscriptions = seats.map((account) => {
    const sub = getGrokAccountSubscription(account)
    return sub.label || String(account.metadata?.subscription || '')
  })
  const uniqueSubs = [...new Set(subscriptions.filter(Boolean))]
  const withQuota = seats.filter(account => Number(account.quota?.limit || 0) > 0)
  const totalRemaining = seats.reduce((sum, account) => {
    const rem = quotaRemaining(account)
    return sum + (Number.isFinite(rem) ? rem : 0)
  }, 0)
  return {
    seatCount: seats.length,
    activeSeats: seats.filter(account => account.status === 'active').length,
    eligibleSeats: eligible.length,
    skippedFree: skippedFree.length,
    skippedLimit: skippedLimit.length,
    subscriptions: uniqueSubs,
    subscriptionLabel: uniqueSubs.length === 0
      ? 'No seats'
      : uniqueSubs.length === 1
        ? uniqueSubs[0]
        : `Mixed (${uniqueSubs.join(' · ')})`,
    quotaConfigured: withQuota.length,
    localQuotaRemaining: withQuota.length ? totalRemaining : null as number | null,
  }
}

async function discovery() {
  const response = await fetch(DISCOVERY_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error(`xAI OAuth discovery HTTP ${response.status}`)
  return await response.json() as { token_endpoint?: string, userinfo_endpoint?: string }
}

async function tokenEndpoint() {
  const data = await discovery()
  if (!data.token_endpoint) throw new Error('xAI OAuth discovery missing token_endpoint')
  return data.token_endpoint
}

async function refresh(account: LocalAccount) {
  const refreshToken = String(account.credentials?.refreshToken || '')
  if (!refreshToken) throw new Error('Grok refresh token missing. Reconnect OAuth.')
  const response = await fetch(await tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID }),
    cache: 'no-store',
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`xAI token refresh HTTP ${response.status}: ${raw.slice(0, 300)}`)
  const token = JSON.parse(raw) as TokenResponse
  if (!token.access_token) throw new Error('xAI refresh missing access_token')
  const claims = decodeJwtClaims(token.id_token || token.access_token)
  account.credentials = { ...account.credentials, accessToken: token.access_token, refreshToken: token.refresh_token || refreshToken }
  applyIdentityClaims(account, claims)
  account.metadata = {
    ...account.metadata,
    expiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
  }
  account.updatedAt = new Date().toISOString()
  return account
}

function describePoolExhausted(allCandidates: LocalAccount[]) {
  const freeCount = allCandidates.filter(account => getGrokPoolSkipReason(account) === 'free').length
  const limitCount = allCandidates.filter(account => getGrokPoolSkipReason(account) === 'limit').length
  const parts: string[] = []
  if (freeCount)
    parts.push(`${freeCount} free`)
  if (limitCount)
    parts.push(`${limitCount} limit-hit`)
  const detail = parts.length ? ` (${parts.join(', ')} skipped)` : ''
  if (freeCount === allCandidates.length)
    return `All Grok seats are Free tier${detail}. Connect a Plus/Pro/SuperGrok account for video generation.`
  if (limitCount === allCandidates.length)
    return `All Grok seats hit spending/rate limit${detail}. Top up SuperGrok credits or wait for the block to expire.`
  if (freeCount + limitCount >= allCandidates.length)
    return `No eligible Grok OAuth seats${detail}. Top up SuperGrok credits, upgrade free seats, or wait for limit blocks to expire.`
  return `No eligible Grok OAuth seats left in the pool${detail}.`
}

/**
 * Grok OAuth pool selector: LRU among **eligible** seats only.
 * Hard-skips Free tier and limit-hit seats (no wasted calls).
 */
export async function selectGrokAccount(excludeIds: Iterable<string> = []) {
  const excluded = new Set(excludeIds)
  const accounts = await getAccounts()
  const allCandidates = accounts.filter(isGrokCandidate)
  if (!allCandidates.length)
    throw new Error('No connected Grok OAuth account. Connect Grok in Provider Console.')

  // Never fall back onto free / limit seats — that only wastes latency.
  const available = allCandidates.filter(
    account => !excluded.has(account.id) && isGrokPoolEligible(account),
  )

  if (!available.length) {
    const remaining = allCandidates.filter(account => !excluded.has(account.id))
    throw new Error(describePoolExhausted(remaining.length ? remaining : allCandidates))
  }

  const ordered = [...available].sort(sortPoolCandidates)
  const selected = ordered[0]
  if (expiresSoon(selected))
    await refresh(selected)
  applyIdentityClaims(selected, decodeJwtClaims(String(selected.credentials?.accessToken || '')))
  // After refresh, free seats can appear — re-check before using.
  const postSkip = getGrokPoolSkipReason(selected)
  if (postSkip === 'free' || postSkip === 'limit') {
    applyPoolEligibilityMetadata(selected, {
      eligible: false,
      skipReason: postSkip,
      healthStatus: postSkip,
      detail: postSkip === 'free' ? 'Seat is Free tier after token refresh' : 'Seat still limit-blocked after refresh',
    })
    const indexSkip = accounts.findIndex(account => account.id === selected.id)
    if (indexSkip >= 0) {
      accounts[indexSkip] = selected
      await saveAccounts(accounts)
    }
    // Try next eligible seat (exclude grows → bounded)
    return selectGrokAccount([...excluded, selected.id])
  }

  selected.metadata = { ...selected.metadata, lastUsedAt: new Date().toISOString(), poolEligible: true }
  const index = accounts.findIndex(account => account.id === selected.id)
  accounts[index] = selected
  await saveAccounts(accounts)
  return selected
}

/** Mark seat exhausted so the next selectGrokAccount picks another OAuth account. */
export async function markGrokAccountBlocked(
  accountId: string,
  reason: string,
  ttlMs = GROK_BLOCK_TTL_MS,
) {
  const accounts = await getAccounts()
  const index = accounts.findIndex(account => account.id === accountId)
  if (index < 0)
    return null
  const account = accounts[index]
  const limit = Number(account.quota?.limit || 0)
  // Force local remaining to 0 so sortPoolCandidates deprioritizes this seat.
  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? limit : 1
  account.quota = {
    ...(account.quota || {}),
    limit: effectiveLimit,
    window: account.quota?.window || 'day',
    used: effectiveLimit,
  }
  account.metadata = {
    ...account.metadata,
    blockedUntil: new Date(Date.now() + ttlMs).toISOString(),
    blockedReason: String(reason || '').slice(0, 400),
    lastBlockedAt: new Date().toISOString(),
  }
  applyPoolEligibilityMetadata(account, {
    eligible: false,
    skipReason: 'limit',
    healthStatus: 'limit',
    detail: reason,
  })
  accounts[index] = account
  await saveAccounts(accounts)
  console.warn(
    `[grok-pool] blocked seat ${accountId} (${account.name || account.metadata?.email || 'unknown'}) until ${account.metadata.blockedUntil}: ${String(reason).slice(0, 160)}`,
  )
  return account
}

export async function recordGrokAccountUsage(accountId: string, units = 1) {
  const accounts = await getAccounts()
  const index = accounts.findIndex(account => account.id === accountId)
  if (index < 0)
    return null
  const account = accounts[index]
  const limit = Number(account.quota?.limit || 0)
  const used = Number(account.quota?.used || 0) + units
  account.quota = {
    ...(account.quota || {}),
    limit: Number.isFinite(limit) ? limit : 0,
    window: account.quota?.window || 'day',
    used: Math.max(0, used),
  }
  account.metadata = { ...account.metadata, lastUsedAt: new Date().toISOString() }
  account.updatedAt = new Date().toISOString()
  accounts[index] = account
  await saveAccounts(accounts)
  return account
}

async function grokFetchOnce(
  path: string,
  init: RequestInit,
  selected: LocalAccount,
  opts?: { timeoutMs?: number },
) {
  const baseUrl = String(selected.metadata?.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
  const timeoutMs = opts?.timeoutMs
  let signal = init.signal
  if (timeoutMs) {
    const t = AbortSignal.timeout(timeoutMs)
    signal = init.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, t])
      : t
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${String(selected.credentials?.accessToken || '')}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  })
  const raw = await response.text()
  let data: any
  try { data = JSON.parse(raw) }
  catch { data = { raw } }
  if (!response.ok) {
    const detail = String(data?.error?.message || data?.error || raw).slice(0, 500)
    throw new Error(`xAI ${path} HTTP ${response.status}: ${detail}`)
  }
  return { account: selected, data }
}

/**
 * Call xAI API. When `account` is fixed (e.g. video poll), no rotation.
 * Otherwise: on 403 spending-limit / 429, mark seat blocked and try next pool seat.
 */
async function grokFetch(path: string, init: RequestInit = {}, account?: LocalAccount, opts?: { timeoutMs?: number }) {
  // Sticky account (poll/status) — must stay on the seat that created the job.
  if (account)
    return grokFetchOnce(path, init, account, opts)

  // Only attempt seats that are not free / limit-hit
  const eligible = await listGrokEligiblePoolAccounts()
  const maxAttempts = Math.max(1, eligible.length || (await listGrokPoolAccounts()).length)
  const tried = new Set<string>()
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let selected: LocalAccount
    try {
      selected = await selectGrokAccount(tried)
    }
    catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      break
    }
    tried.add(selected.id)

    try {
      return await grokFetchOnce(path, init, selected, opts)
    }
    catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      lastError = error
      const parsed = parseGrokHttpError(error)
      if (parsed && isPoolRotatableError(parsed.status, parsed.message)) {
        await markGrokAccountBlocked(selected.id, parsed.message)
        // Try next eligible OAuth seat
        continue
      }
      throw error
    }
  }

  throw lastError || new Error('All eligible Grok OAuth seats failed for this request.')
}

export async function discoverGrokModels(sourceAccount?: LocalAccount): Promise<GrokModel[]> {
  const account = sourceAccount || await selectGrokAccount()
  const [general, video] = await Promise.all([
    grokFetch('/models', {}, account).catch(() => ({ data: { data: [] } } as any)),
    grokFetch('/video-generation-models', {}, account).catch(() => ({ data: { data: [] } } as any)),
  ])
  const normalize = (payload: any, type?: GrokModel['type']) => (Array.isArray(payload) ? payload : payload?.data || payload?.models || [])
    .map((model: any) => ({ id: String(model.id || model.model || model.name), ownedBy: 'xAI', type }))
    .filter((model: GrokModel) => model.id)
  // Video catalog is authoritative for video models; general list only fills chat/image.
  const videoModels = normalize(video.data, 'video')
  const generalModels = normalize(general.data).map((model: GrokModel) => {
    if (videoModels.some((videoModel: GrokModel) => videoModel.id === model.id))
      return { ...model, type: 'video' as const }
    if (/image/i.test(model.id))
      return { ...model, type: 'image' as const }
    return { ...model, type: model.type || 'chat' as const }
  })
  const models = [...generalModels, ...videoModels]
  return Array.from(new Map(models.map(model => [model.id, model])).values())
}

export type GrokChatOptions = {
  timeoutMs?: number
  /** System role override */
  system?: string
  /**
   * Optional vision input (http/data URL). OpenAI-style multimodal content.
   * Prefer public https product URLs over huge data: URLs.
   */
  imageUrl?: string
  /** Multiple ref images (product + lifestyle/storyboard). Max 4. */
  imageUrls?: string[]
}

export async function callGrokChat(
  prompt: string,
  model = 'grok-4',
  opts?: GrokChatOptions,
) {
  // Caption packs must not hang the whole I2V pipeline forever (UI stuck at 2%).
  const timeoutMs = opts?.timeoutMs ?? 55_000
  const system = opts?.system || 'You are Socials Hub. Return concise production-ready social content.'
  const images = [
    ...(Array.isArray(opts?.imageUrls) ? opts!.imageUrls! : []),
    opts?.imageUrl || '',
  ]
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 4)
  const userContent = images.length
    ? [
        { type: 'text', text: prompt },
        ...images.map(url => ({ type: 'image_url', image_url: { url } })),
      ]
    : prompt
  const { account, data } = await grokFetch(
    '/chat/completions',
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
    },
    undefined,
    { timeoutMs },
  )
  return {
    accountId: account.id,
    model,
    text: String(data?.choices?.[0]?.message?.content || data?.output_text || '').trim(),
    raw: data,
  }
}

export async function createGrokImage(input: {
  model?: string
  prompt: string
  n?: number
  aspectRatio?: string
  image?: string
}) {
  const model = input.model || 'grok-imagine-image'
  const payload: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    n: Math.min(10, Math.max(1, Number(input.n || 1))),
  }
  if (input.aspectRatio)
    payload.aspect_ratio = input.aspectRatio
  if (input.image) {
    payload.image = typeof input.image === 'string' && input.image.startsWith('http')
      ? { url: input.image, type: 'image_url' }
      : input.image
  }
  const { account, data } = await grokFetch('/images/generations', { method: 'POST', body: JSON.stringify(payload) })
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.images) ? data.images : []
  const urls = rows
    .map((row: any) => String(row?.url || row?.image_url || row?.b64_json || ''))
    .filter((url: string) => url && !url.startsWith('data:')) // prefer hosted urls
  // Some responses return single url
  if (!urls.length && data?.url)
    urls.push(String(data.url))
  if (!urls.length)
    throw new Error('xAI image generation returned no image URLs')
  return { account, urls, raw: data, model }
}

/**
 * xAI /videos/generations expects `image: { url, type: "image_url" }` with
 * public https or data: URL — never a bare relative string like /api/assets/.../file.
 */
async function resolveGrokVideoImageUrl(raw?: string): Promise<string | undefined> {
  const imageUrl = typeof raw === 'string' ? raw.trim() : ''
  if (!imageUrl)
    return undefined

  if (imageUrl.startsWith('data:image') || /^https:\/\//i.test(imageUrl))
    return imageUrl

  // http://localhost or relative /api/assets → data URL via local disk / fetch
  try {
    const { resolveImageForVision } = await import('../resolveVisionImage')
    const resolved = await resolveImageForVision(imageUrl)
    if (resolved)
      return resolved
  }
  catch (e) {
    console.warn('[grok-video] resolveImageForVision failed', e instanceof Error ? e.message : e)
  }

  // Fallback: encode via imagePrep buffer loader (handles local assets)
  try {
    const { fetchImageBuffer } = await import('../imagePrep')
    const buf = await fetchImageBuffer(imageUrl)
    const { default: sharp } = await import('sharp')
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  }
  catch (e) {
    console.warn('[grok-video] image buffer fallback failed', e instanceof Error ? e.message : e)
  }

  throw new Error(
    `Cannot send product image to xAI (need https or data URL). Got: ${imageUrl.slice(0, 96)}`,
  )
}

export type GrokVideoMode = 'text_to_video' | 'image_to_video' | 'reference_to_video'

/**
 * Resolve model for video gen. Reference-to-video (multi-ref, web-parity) requires
 * `grok-imagine-video` — `grok-imagine-video-1.5` does NOT support reference_images.
 */
export function resolveGrokVideoModel(input: {
  model?: string
  mode?: GrokVideoMode
  referenceImageCount?: number
}): string {
  let model = String(input.model || 'grok-imagine-video').replace(/^grok::/, '').trim()
  if (!model || model === 'cx_agy')
    model = 'grok-imagine-video'
  const wantsR2V = input.mode === 'reference_to_video'
    || (Number(input.referenceImageCount || 0) >= 2)
  if (wantsR2V && /1\.5|imagine-video-1/i.test(model)) {
    console.warn('[grok-video] upgrading model to grok-imagine-video for reference-to-video (1.5 has no multi-ref)')
    return 'grok-imagine-video'
  }
  return model
}

export async function createGrokVideo(input: {
  model: string
  prompt: string
  duration?: number
  aspectRatio?: string
  resolution?: string
  /** Single first-frame for classic image-to-video (mutually exclusive with referenceImages). */
  image?: string
  /**
   * Multi-ref pack for web-parity Reference-to-Video (1–7 images).
   * Sent as `reference_images: [{url}]` — NOT `image`.
   * Address in prompt as <IMAGE_1>… or @image1… (same as grok.com).
   */
  referenceImages?: string[]
  /** Prefer image_to_video / reference_to_video when product refs are present. */
  mode?: GrokVideoMode
}) {
  const requestedAspect = String(input.aspectRatio || '').trim()
  const allowedAspect = /^(9:16|4:5|3:4|1:1|4:3|16:9|3:2|2:3)$/.test(requestedAspect)
    ? requestedAspect
    : '9:16'
  // Keep prompt tight — long walls of text get truncated / half-ignored by Imagine.
  const prompt = String(input.prompt || '').trim().slice(0, 1600)
  const requestedRes = String(input.resolution || '1080p').toLowerCase()
  // Prefer 1080p for product sharpness; some seats only accept 720p — retry below.
  const resolutionOrder = requestedRes === '480p'
    ? ['480p']
    : requestedRes === '720p'
      ? ['720p', '1080p']
      : ['1080p', '720p']

  // Multi-ref R2V (grok.com Animate Photos): up to 7 images, exclusive with single `image`
  const rawRefs = Array.isArray(input.referenceImages)
    ? input.referenceImages.map(u => String(u || '').trim()).filter(Boolean)
    : []
  const uniqueRefs = rawRefs.filter((u, i, a) => a.indexOf(u) === i).slice(0, 7)

  // Mode resolution (web parity):
  // - explicit mode wins
  // - 2+ referenceImages → reference_to_video
  // - single image / 1 ref without R2V mode → image_to_video
  // - none → text_to_video
  const mode: GrokVideoMode = input.mode
    || (uniqueRefs.length >= 2
      ? 'reference_to_video'
      : (uniqueRefs.length === 1 || input.image)
          ? 'image_to_video'
          : 'text_to_video')

  // R2V path: explicit reference_to_video OR auto multi-ref (≥2)
  const useR2V = mode === 'reference_to_video'
    || (uniqueRefs.length >= 2 && mode !== 'image_to_video' && mode !== 'text_to_video')
  const model = resolveGrokVideoModel({
    model: input.model,
    mode: useR2V ? 'reference_to_video' : mode,
    referenceImageCount: uniqueRefs.length,
  })

  let imagePayload: { url: string, type: 'image_url' } | undefined
  let referencePayload: Array<{ url: string }> | undefined

  if (useR2V && uniqueRefs.length >= 1) {
    const resolved: string[] = []
    for (const raw of uniqueRefs) {
      const url = await resolveGrokVideoImageUrl(raw)
      if (url)
        resolved.push(url)
    }
    if (!resolved.length)
      throw new Error('reference_to_video: no resolvable reference images')
    // xAI docs: reference_images: [{ url }] — no type field required
    referencePayload = resolved.map(url => ({ url }))
  }
  else {
    const single = uniqueRefs[0] || (typeof input.image === 'string' ? input.image : undefined)
    const resolvedImageUrl = await resolveGrokVideoImageUrl(single)
    // Always ImageUrl struct — never a bare string (xAI 422: expected struct ImageUrl)
    imagePayload = resolvedImageUrl
      ? { url: resolvedImageUrl, type: 'image_url' as const }
      : undefined
  }

  const effectiveMode: GrokVideoMode = referencePayload?.length
    ? 'reference_to_video'
    : imagePayload
      ? 'image_to_video'
      : 'text_to_video'

  let lastError: Error | null = null
  for (const resolution of resolutionOrder) {
    const payload: Record<string, unknown> = {
      model,
      prompt,
      duration: Math.min(15, Math.max(6, Number(input.duration || 10) || 10)),
      aspect_ratio: allowedAspect,
      resolution,
    }
    // Mutually exclusive: R2V uses reference_images; I2V uses image (web/docs parity)
    if (referencePayload?.length)
      payload.reference_images = referencePayload
    else if (imagePayload)
      payload.image = imagePayload

    try {
      const { account, data } = await grokFetch('/videos/generations', { method: 'POST', body: JSON.stringify(payload) })
      const requestId = String(data?.request_id || data?.id || '')
      if (!requestId)
        throw new Error('xAI video response missing request id')
      return {
        account,
        requestId,
        raw: data,
        usedImage: Boolean(imagePayload || referencePayload?.length),
        usedReferenceImages: referencePayload?.length || 0,
        mode: effectiveMode,
        model,
        resolution,
      }
    }
    catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const msg = lastError.message.toLowerCase()
      // Resolution fallback only — not for image format errors (already fixed above)
      if (!/resolution|unsupported.*resolution|invalid.*resolution/.test(msg) && !/resolution/.test(msg)) {
        // Still allow 422 retry across resolutions if message mentions resolution
        if (/422|400/.test(msg) && /resolution/i.test(lastError.message)) {
          console.warn(`[grok-video] resolution ${resolution} rejected, trying next…`, lastError.message.slice(0, 160))
          continue
        }
        throw lastError
      }
      console.warn(`[grok-video] resolution ${resolution} rejected, trying next…`, lastError.message.slice(0, 160))
    }
  }
  throw lastError || new Error('xAI video generation failed')
}

export type GrokVideoProgress = {
  requestId: string
  status: string
  percent: number
  stage: string
  raw?: Record<string, unknown>
}

function mapGrokVideoStage(status: string, percent: number) {
  const s = status.toLowerCase()
  if (s === 'done' || s === 'completed')
    return 'Finalizing'
  if (s === 'failed' || s === 'expired')
    return 'Failed'
  if (percent >= 85)
    return 'Encoding'
  if (percent >= 45)
    return 'Rendering frames'
  if (percent >= 15)
    return 'Generating motion'
  if (percent > 0)
    return 'Queued at xAI'
  return 'Submitted'
}

export async function waitForGrokVideo(
  account: LocalAccount,
  requestId: string,
  timeoutMs = 240_000,
  onProgress?: (progress: GrokVideoProgress) => void | Promise<void>,
) {
  const deadline = Date.now() + timeoutMs
  let lastPercent = -1
  while (Date.now() < deadline) {
    const { data } = await grokFetch(`/videos/${encodeURIComponent(requestId)}`, {}, account)
    const status = String(data?.status || 'pending').toLowerCase()
    const rawPercent = Number(data?.progress ?? data?.percent ?? data?.percentage)
    const percent = Number.isFinite(rawPercent)
      ? Math.max(0, Math.min(100, Math.round(rawPercent)))
      : (status === 'done' || status === 'completed' ? 100 : Math.max(lastPercent, 0))
    lastPercent = Math.max(lastPercent, percent)
    const progress: GrokVideoProgress = {
      requestId,
      status,
      percent,
      stage: mapGrokVideoStage(status, percent),
      raw: data,
    }
    await onProgress?.(progress)

    if (status === 'done' || status === 'completed') {
      const url = String(data?.video?.url || data?.video_url || '')
      if (!url) throw new Error('xAI completed video missing URL')
      return { url, data, progress }
    }
    if (status === 'failed' || status === 'expired')
      throw new Error(String(data?.error || data?.message || `xAI video ${status}`))
    await new Promise(resolve => setTimeout(resolve, 2500))
  }
  throw new Error('xAI video generation timed out')
}

async function hydrateIdentity(account: LocalAccount) {
  let claims = decodeJwtClaims(String(account.credentials?.accessToken || ''))
  applyIdentityClaims(account, claims)
  if (!account.metadata?.email) {
    const info: { userinfo_endpoint?: string } = await discovery().catch(() => ({}))
    if (info.userinfo_endpoint) {
      const response = await fetch(info.userinfo_endpoint, { headers: { Authorization: `Bearer ${String(account.credentials?.accessToken || '')}` }, cache: 'no-store' }).catch(() => null)
      if (response?.ok) {
        const profile = await response.json() as Record<string, unknown>
        claims = { ...claims, ...profile }
        applyIdentityClaims(account, claims)
      }
    }
  }
  return account
}

export async function checkGrokHealth(account: LocalAccount) {
  const refreshed = await hydrateIdentity(expiresSoon(account) ? await refresh(account) : account)
  const sub = getGrokAccountSubscription(refreshed)

  const persist = async () => {
    const accounts = await getAccounts()
    const index = accounts.findIndex(item => item.id === refreshed.id)
    if (index >= 0) {
      accounts[index] = refreshed
      await saveAccounts(accounts)
    }
  }

  const base = {
    source: 'xai_oauth' as const,
    email: refreshed.metadata?.email,
    displayName: refreshed.metadata?.displayName,
    subscription: refreshed.metadata?.subscription || sub.label,
    subscriptionCode: refreshed.metadata?.subscriptionCode || sub.code,
    subscriptionTier: refreshed.metadata?.subscriptionTier ?? sub.tier,
    quota: refreshed.quota || {},
  }

  // Free tier → hard skip in generation pool (no model probe needed)
  if (sub.code === 'free' || sub.tier === 1) {
    applyPoolEligibilityMetadata(refreshed, {
      eligible: false,
      skipReason: 'free',
      healthStatus: 'free',
      detail: 'Free tier — generation pool skips this seat',
    })
    await persist()
    return {
      ...base,
      status: 'free',
      poolEligible: false,
      poolSkipReason: 'free',
      reason: 'Free tier seat — skipped by generation pool. Upgrade to Plus/Pro/SuperGrok.',
      modelCount: 0,
      videoAccess: false,
      models: [] as GrokModel[],
    }
  }

  // Active spending / rate limit block → skip without re-calling xAI
  if (isAccountTemporarilyBlocked(refreshed)) {
    const detail = String(refreshed.metadata?.blockedReason || refreshed.metadata?.poolSkipDetail || 'Spending or rate limit')
    applyPoolEligibilityMetadata(refreshed, {
      eligible: false,
      skipReason: 'limit',
      healthStatus: 'limit',
      detail,
    })
    await persist()
    return {
      ...base,
      status: 'limit',
      poolEligible: false,
      poolSkipReason: 'limit',
      reason: detail,
      blockedUntil: refreshed.metadata?.blockedUntil,
      modelCount: 0,
      videoAccess: false,
      models: [] as GrokModel[],
    }
  }

  // Clear expired block window so seat re-enters the pool after TTL
  const until = Date.parse(String(refreshed.metadata?.blockedUntil || ''))
  if (Number.isFinite(until) && until <= Date.now()) {
    refreshed.metadata = {
      ...refreshed.metadata,
      blockedUntil: null,
      blockedReason: null,
    }
  }

  let models: GrokModel[] = []
  try {
    models = await discoverGrokModels(refreshed)
  }
  catch (err) {
    const parsed = parseGrokHttpError(err)
    const message = err instanceof Error ? err.message : String(err)
    if (parsed && isPoolRotatableError(parsed.status, parsed.message)) {
      await markGrokAccountBlocked(refreshed.id, parsed.message)
      return {
        ...base,
        status: 'limit',
        poolEligible: false,
        poolSkipReason: 'limit',
        reason: parsed.message,
        modelCount: 0,
        videoAccess: false,
        models: [] as GrokModel[],
      }
    }
    applyPoolEligibilityMetadata(refreshed, {
      eligible: false,
      skipReason: 'health',
      healthStatus: 'failed',
      detail: message,
    })
    await persist()
    return {
      ...base,
      status: 'failed',
      poolEligible: false,
      poolSkipReason: 'health',
      reason: message,
      modelCount: 0,
      videoAccess: false,
      models: [] as GrokModel[],
    }
  }

  const videoAccess = models.some(model => model.type === 'video')
  applyPoolEligibilityMetadata(refreshed, {
    eligible: true,
    healthStatus: 'ok',
  })
  await persist()
  return {
    ...base,
    status: 'ok',
    poolEligible: true,
    poolSkipReason: null,
    modelCount: models.length,
    videoAccess,
    models: models.slice(0, 20),
  }
}

