import { NextRequest, NextResponse } from 'next/server'
import { bugsellFetch, getBugSellConfig, shopStoreUrl } from '../_client'

export const dynamic = 'force-dynamic'

function normalizeShop(raw: Record<string, unknown>, storeUrl: string) {
  const slug = String(raw.slug || '')
  return {
    id: String(raw.id || ''),
    slug,
    name: String(raw.name || ''),
    description: typeof raw.description === 'string' ? raw.description : null,
    avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
    banner: typeof raw.banner === 'string' ? raw.banner : null,
    productsCount: Number(raw.products_count || 0),
    averageRating: Number(raw.average_rating || 0),
    totalSalesCount: Number(raw.total_sales_count || 0),
    storeUrl: slug ? shopStoreUrl(storeUrl, slug) : '',
  }
}

export async function GET(req: NextRequest) {
  const config = getBugSellConfig()
  if (!config.enabled) {
    return NextResponse.json({ code: 503, message: config.reason, data: null }, { status: 503 })
  }

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || sp.get('search') || '').trim().toLowerCase()
  const page = sp.get('page') || 1
  const perPage = sp.get('per_page') || 24

  const bypassCache = sp.get('fresh') === '1' || sp.get('refresh') === '1'

  try {
    const result = await bugsellFetch('/api/v1/storefront/shops', {
      page,
      per_page: perPage,
      search: q || undefined,
    }, { bypassCache })
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
    }

    const body = result.body as Record<string, unknown>
    const data = body.data
    let itemsRaw: unknown[] = []
    let pagination: Record<string, unknown> | null = null

    if (Array.isArray(data)) {
      itemsRaw = data
    }
    else if (data && typeof data === 'object') {
      const nested = data as Record<string, unknown>
      if (Array.isArray(nested.items)) itemsRaw = nested.items
      if (nested.pagination && typeof nested.pagination === 'object')
        pagination = nested.pagination as Record<string, unknown>
    }

    let items = itemsRaw.map(item => normalizeShop(item as Record<string, unknown>, config.storeUrl))

    // Client-side filter fallback when API ignores search
    if (q) {
      items = items.filter(shop =>
        shop.name.toLowerCase().includes(q)
        || shop.slug.toLowerCase().includes(q)
        || (shop.description || '').toLowerCase().includes(q),
      )
    }

    return NextResponse.json({
      code: 0,
      data: {
        items,
        pagination,
        query: { q, page, per_page: perPage },
      },
      message: 'ok',
    }, {
      headers: {
        'Cache-Control': bypassCache ? 'no-store' : 'private, max-age=60, stale-while-revalidate=300',
      },
    })
  }
  catch (error) {
    return NextResponse.json({
      code: 502,
      message: error instanceof Error ? error.message : String(error),
      data: null,
    }, { status: 502 })
  }
}
