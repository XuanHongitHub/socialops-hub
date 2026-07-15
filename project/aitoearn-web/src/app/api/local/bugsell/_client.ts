/**
 * BugSell production storefront client (server-only).
 * Public catalog endpoints — no admin/shop API key required for MVP.
 */

export type BugSellConfig = {
  enabled: boolean
  apiUrl: string
  storeUrl: string
  reason?: string
}

function envFlag(value: string | undefined) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

/** Production-only defaults. Local bugsell.test is never implied. */
export function getBugSellConfig(): BugSellConfig {
  const enabled = envFlag(process.env.BUGSELL_ENABLED)
  const apiUrl = (process.env.BUGSELL_API_URL || 'https://api.bugsell.com').replace(/\/$/, '')
  const storeUrl = (process.env.BUGSELL_STORE_URL || 'https://www.bugsell.com').replace(/\/$/, '')

  if (!enabled) {
    return {
      enabled: false,
      apiUrl,
      storeUrl,
      reason: 'Set BUGSELL_ENABLED=true to opt in to BugSell production catalog.',
    }
  }

  // Guard against accidental local targets when opting in without explicit override intent.
  if (/bugsell\.test|localhost|127\.0\.0\.1/i.test(apiUrl) && !envFlag(process.env.BUGSELL_ALLOW_LOCAL)) {
    return {
      enabled: false,
      apiUrl,
      storeUrl,
      reason: 'Local BugSell API is blocked. Use production api.bugsell.com (or set BUGSELL_ALLOW_LOCAL=true for experiments).',
    }
  }

  return { enabled: true, apiUrl, storeUrl }
}

export function productStoreUrl(storeUrl: string, slug: string) {
  return `${storeUrl.replace(/\/$/, '')}/products/${slug}`
}

export function shopStoreUrl(storeUrl: string, slug: string) {
  return `${storeUrl.replace(/\/$/, '')}/shops/${slug}`
}

type CacheEntry = { expiresAt: number, value: Awaited<ReturnType<typeof bugsellFetchUncached>> }

// Process-local TTL cache — avoids hammering api.bugsell.com on every picker open.
const g = globalThis as typeof globalThis & { __bugsellFetchCache?: Map<string, CacheEntry> }
function cacheMap() {
  if (!g.__bugsellFetchCache)
    g.__bugsellFetchCache = new Map()
  return g.__bugsellFetchCache
}

/** Browse/list defaults: longer TTL. Explicit search queries: shorter. */
export function bugsellCacheTtlMs(path: string, query: Record<string, string | number | boolean | undefined | null>) {
  const q = String(query.q || query.query || '').trim()
  if (q)
    return 2 * 60_000 // search: 2 min
  if (/\/shops\/?$|\/products\/?$|\/shops\b/.test(path) && !String(path).match(/\/shops\/[^/]+$/))
    return 10 * 60_000 // shop/product browse lists: 10 min
  if (/\/products\//.test(path) || /\/shops\//.test(path))
    return 15 * 60_000 // product/shop detail: 15 min
  return 5 * 60_000
}

async function bugsellFetchUncached(path: string, query: Record<string, string | number | boolean | undefined | null> = {}) {
  const config = getBugSellConfig()
  if (!config.enabled) {
    return {
      ok: false as const,
      status: 503,
      body: { code: 503, message: config.reason || 'BugSell integration disabled', data: null },
    }
  }

  const url = new URL(path.startsWith('http') ? path : `${config.apiUrl}${path.startsWith('/') ? '' : '/'}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '')
      continue
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SocialsHub-BugSellBridge/1.0',
    },
    cache: 'no-store',
    signal: controller.signal,
  }).catch((error: Error) => {
    throw new Error(`BugSell request failed: ${error.message}`)
  }).finally(() => {
    clearTimeout(timer)
  })

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  }
  catch {
    json = { raw: text.slice(0, 500) }
  }

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      body: {
        code: res.status,
        message: `BugSell API ${res.status}`,
        data: json,
      },
    }
  }

  return { ok: true as const, status: res.status, body: json, config }
}

export async function bugsellFetch(
  path: string,
  query: Record<string, string | number | boolean | undefined | null> = {},
  opts?: { bypassCache?: boolean },
) {
  const config = getBugSellConfig()
  if (!config.enabled) {
    return {
      ok: false as const,
      status: 503,
      body: { code: 503, message: config.reason || 'BugSell integration disabled', data: null },
    }
  }

  const cacheKey = `${path}?${Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')}`

  const map = cacheMap()
  if (!opts?.bypassCache) {
    const hit = map.get(cacheKey)
    if (hit && hit.expiresAt > Date.now())
      return { ...hit.value, cached: true as const }
  }

  const value = await bugsellFetchUncached(path, query)
  // Only cache successful catalog responses
  if (value.ok) {
    map.set(cacheKey, {
      expiresAt: Date.now() + bugsellCacheTtlMs(path, query),
      value,
    })
    // Soft cap map size
    if (map.size > 200) {
      const first = map.keys().next().value
      if (first)
        map.delete(first)
    }
  }
  return { ...value, cached: false as const }
}

export function clearBugSellServerCache() {
  cacheMap().clear()
}

export function normalizeProductCard(raw: Record<string, unknown>, storeUrl: string) {
  const slug = String(raw.slug || '')
  const shop = (raw.shop && typeof raw.shop === 'object') ? raw.shop as Record<string, unknown> : null
  const category = (raw.category && typeof raw.category === 'object') ? raw.category as Record<string, unknown> : null
  const price = typeof raw.price === 'number' ? raw.price : Number(raw.price || 0)
  const salePrice = raw.sale_price == null ? null : Number(raw.sale_price)
  const thumbnail = typeof raw.thumbnail_url === 'string'
    ? raw.thumbnail_url
    : typeof raw.image === 'string'
      ? raw.image
      : null

  return {
    id: String(raw.id || ''),
    slug,
    name: String(raw.name || ''),
    price,
    salePrice: Number.isFinite(salePrice as number) ? salePrice : null,
    thumbnailUrl: thumbnail,
    storeUrl: slug ? productStoreUrl(storeUrl, slug) : '',
    shop: shop
      ? {
          id: String(shop.id || ''),
          slug: String(shop.slug || ''),
          name: String(shop.name || ''),
          avatar: typeof shop.avatar === 'string' ? shop.avatar : null,
        }
      : null,
    category: category
      ? {
          id: String(category.id || ''),
          slug: String(category.slug || ''),
          name: String(category.name || ''),
        }
      : null,
    isCustomizable: Boolean(raw.is_customizable),
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    shopName: typeof raw.shop_name === 'string' ? raw.shop_name : (shop ? String(shop.name || '') : null),
  }
}

export function productToGenInput(product: ReturnType<typeof normalizeProductCard>, notes?: string) {
  const priceLabel = product.salePrice != null && product.salePrice < product.price
    ? `$${product.salePrice} (was $${product.price})`
    : `$${product.price}`
  const parts = [
    product.shop?.name || product.shopName ? `Shop: ${product.shop?.name || product.shopName}` : '',
    product.category?.name ? `Category: ${product.category.name}` : '',
    `Price: ${priceLabel}`,
    product.isCustomizable ? 'Customizable product' : '',
    notes?.trim() || '',
  ].filter(Boolean)

  return {
    productUrl: product.storeUrl,
    productTitle: product.name,
    productNotes: parts.join(' · '),
    thumbnailUrl: product.thumbnailUrl,
    productId: product.id,
    productSlug: product.slug,
    shopSlug: product.shop?.slug || null,
  }
}
