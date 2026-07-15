import { NextRequest, NextResponse } from 'next/server'
import { bugsellFetch, getBugSellConfig, normalizeProductCard } from '../_client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const config = getBugSellConfig()
  if (!config.enabled) {
    return NextResponse.json({ code: 503, message: config.reason, data: null }, { status: 503 })
  }

  const q = req.nextUrl.searchParams.get('q') || ''
  const limit = req.nextUrl.searchParams.get('limit') || 12
  if (!q.trim()) {
    return NextResponse.json({ code: 0, data: { products: [], suggestions: [] }, message: 'ok' })
  }

  try {
    const result = await bugsellFetch('/api/v1/search/suggestions', { q, limit })
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
    }

    const body = result.body as {
      data?: { suggestions?: { products?: Record<string, unknown>[], suggestions?: Array<{ query: string }> } }
    }
    const productsRaw = body.data?.suggestions?.products || []
    const products = productsRaw.map((item) => {
      // Suggestions use `image` instead of thumbnail_url
      const mapped = normalizeProductCard({
        ...item,
        thumbnail_url: item.image || item.thumbnail_url,
        shop: item.shop_name ? { name: item.shop_name } : null,
      }, config.storeUrl)
      return mapped
    })

    return NextResponse.json({
      code: 0,
      data: {
        products,
        querySuggestions: body.data?.suggestions?.suggestions || [],
      },
      message: 'ok',
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
