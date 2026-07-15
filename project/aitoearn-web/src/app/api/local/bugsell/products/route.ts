import { NextRequest, NextResponse } from 'next/server'
import { bugsellFetch, getBugSellConfig, normalizeProductCard } from '../_client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const config = getBugSellConfig()
  if (!config.enabled) {
    return NextResponse.json({ code: 503, message: config.reason, data: null }, { status: 503 })
  }

  const sp = req.nextUrl.searchParams
  const bypassCache = sp.get('fresh') === '1' || sp.get('refresh') === '1'
  const query = {
    search: sp.get('q') || sp.get('search') || undefined,
    shop: sp.get('shop') || undefined,
    page: sp.get('page') || 1,
    per_page: sp.get('per_page') || 12,
    sort: sp.get('sort') || 'relevance',
  }

  try {
    const result = await bugsellFetch('/api/v1/storefront/products', query, { bypassCache })
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
    }

    const payload = result.body as { data?: unknown[], meta?: Record<string, unknown> }
    const items = Array.isArray(payload.data)
      ? payload.data.map(item => normalizeProductCard(item as Record<string, unknown>, config.storeUrl))
      : []

    return NextResponse.json({
      code: 0,
      data: {
        items,
        meta: payload.meta || null,
        query,
      },
      message: 'ok',
    }, {
      headers: {
        // Browser may reuse; server still has process TTL cache
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
