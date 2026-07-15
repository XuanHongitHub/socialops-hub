export type BugSellStatus = {
  enabled: boolean
  apiUrl: string | null
  storeUrl: string | null
  reason: string | null
  flows: string[]
  auth: string
}

export type BugSellProductCard = {
  id: string
  slug: string
  name: string
  price: number
  salePrice: number | null
  thumbnailUrl: string | null
  storeUrl: string
  shop: { id: string, slug: string, name: string, avatar: string | null } | null
  category: { id: string, slug: string, name: string } | null
  isCustomizable: boolean
  rating: number | null
  shopName: string | null
}

export type BugSellShopCard = {
  id: string
  slug: string
  name: string
  description: string | null
  avatar: string | null
  banner: string | null
  productsCount: number
  averageRating: number
  totalSalesCount: number
  storeUrl: string
}

export type BugSellGenInput = {
  productUrl: string
  productTitle: string
  productNotes: string
  thumbnailUrl: string | null
  productId: string
  productSlug: string
  shopSlug: string | null
}

type ApiResult<T> = { code: number, message?: string, data: T }

// Browser memory + sessionStorage — reopen picker instantly, revalidate in background.
const clientCache = new Map<string, { expiresAt: number, value: ApiResult<unknown> }>()
const CLIENT_TTL_BROWSE_MS = 15 * 60_000
const CLIENT_TTL_SEARCH_MS = 3 * 60_000
const CLIENT_TTL_STATUS_MS = 10 * 60_000
const SS_PREFIX = 'bugsell.cache.v2:'

function clientTtl(url: string) {
  if (url.includes('/status'))
    return CLIENT_TTL_STATUS_MS
  if (/[?&]q=/.test(url))
    return CLIENT_TTL_SEARCH_MS
  return CLIENT_TTL_BROWSE_MS
}

function readSessionCache(url: string): ApiResult<unknown> | null {
  if (typeof sessionStorage === 'undefined')
    return null
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + url)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as { expiresAt: number, value: ApiResult<unknown> }
    if (!parsed?.expiresAt || parsed.expiresAt < Date.now())
      return null
    return parsed.value
  }
  catch {
    return null
  }
}

function writeSessionCache(url: string, value: ApiResult<unknown>, ttl: number) {
  if (typeof sessionStorage === 'undefined')
    return
  try {
    sessionStorage.setItem(SS_PREFIX + url, JSON.stringify({
      expiresAt: Date.now() + ttl,
      value,
    }))
  }
  catch {
    // quota — ignore
  }
}

/** Sync peek (memory → session) for instant UI hydrate before network. */
export function peekBugSellCache<T>(url: string): ApiResult<T> | null {
  const mem = clientCache.get(url)
  if (mem && mem.expiresAt > Date.now())
    return mem.value as ApiResult<T>
  const ss = readSessionCache(url)
  if (ss) {
    clientCache.set(url, { expiresAt: Date.now() + clientTtl(url), value: ss })
    return ss as ApiResult<T>
  }
  return null
}

async function getJson<T>(url: string, opts?: { bypassCache?: boolean }): Promise<ApiResult<T>> {
  if (!opts?.bypassCache) {
    const hit = clientCache.get(url)
    if (hit && hit.expiresAt > Date.now())
      return hit.value as ApiResult<T>
    const ss = readSessionCache(url)
    if (ss) {
      clientCache.set(url, { expiresAt: Date.now() + clientTtl(url), value: ss })
      // stale-while-revalidate: return SS immediately, refresh in background
      void fetch(url, { cache: 'default' })
        .then(r => r.json().catch(() => null))
        .then((body) => {
          if (body && (body.code === 0 || body.data != null)) {
            const ttl = clientTtl(url)
            clientCache.set(url, { expiresAt: Date.now() + ttl, value: body })
            writeSessionCache(url, body, ttl)
          }
        })
        .catch(() => null)
      return ss as ApiResult<T>
    }
  }

  const res = await fetch(url, { cache: 'default' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok && body?.code == null) {
    throw new Error(body?.message || `Request failed: ${res.status}`)
  }
  const result = body as ApiResult<T>
  if (result?.code === 0 || res.ok) {
    const ttl = clientTtl(url)
    clientCache.set(url, {
      expiresAt: Date.now() + ttl,
      value: result as ApiResult<unknown>,
    })
    writeSessionCache(url, result as ApiResult<unknown>, ttl)
    if (clientCache.size > 80) {
      const first = clientCache.keys().next().value
      if (first)
        clientCache.delete(first)
    }
  }
  return result
}

/** Drop client catalog cache (e.g. after manual refresh). */
export function clearBugSellClientCache() {
  clientCache.clear()
  if (typeof sessionStorage === 'undefined')
    return
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(SS_PREFIX))
        keys.push(k)
    }
    keys.forEach(k => sessionStorage.removeItem(k))
  }
  catch { /* ignore */ }
}

/** Prefetch default browse so opening the picker is instant. */
export function prefetchBugSellCatalog() {
  if (typeof window === 'undefined')
    return
  void getBugSellStatus().catch(() => null)
  void searchBugSellProducts({ perPage: 12 }).catch(() => null)
  void searchBugSellShops({ perPage: 12 }).catch(() => null)
}

export async function getBugSellStatus() {
  return getJson<BugSellStatus>('/api/local/bugsell/status')
}

export async function searchBugSellProducts(params: {
  q?: string
  shop?: string
  page?: number
  perPage?: number
  fresh?: boolean
}) {
  const sp = new URLSearchParams()
  if (params.q)
    sp.set('q', params.q)
  if (params.shop)
    sp.set('shop', params.shop)
  if (params.page)
    sp.set('page', String(params.page))
  if (params.perPage)
    sp.set('per_page', String(params.perPage))
  if (params.fresh)
    sp.set('fresh', '1')
  return getJson<{ items: BugSellProductCard[], meta: Record<string, unknown> | null }>(
    `/api/local/bugsell/products?${sp}`,
    { bypassCache: params.fresh },
  )
}

export async function getBugSellProduct(slug: string) {
  return getJson<{ product: BugSellProductCard, gen: BugSellGenInput }>(`/api/local/bugsell/products/${encodeURIComponent(slug)}`)
}

export async function searchBugSellShops(params: {
  q?: string
  page?: number
  perPage?: number
  fresh?: boolean
}) {
  const sp = new URLSearchParams()
  if (params.q)
    sp.set('q', params.q)
  if (params.page)
    sp.set('page', String(params.page))
  if (params.perPage)
    sp.set('per_page', String(params.perPage))
  if (params.fresh)
    sp.set('fresh', '1')
  return getJson<{ items: BugSellShopCard[], pagination: Record<string, unknown> | null }>(
    `/api/local/bugsell/shops?${sp}`,
    { bypassCache: params.fresh },
  )
}

export async function getBugSellShop(slug: string) {
  return getJson<BugSellShopCard>(`/api/local/bugsell/shops/${encodeURIComponent(slug)}`)
}

export async function getBugSellSuggestions(q: string) {
  const sp = new URLSearchParams({ q, limit: '12' })
  return getJson<{ products: BugSellProductCard[], querySuggestions: Array<{ query: string }> }>(`/api/local/bugsell/suggestions?${sp}`)
}
