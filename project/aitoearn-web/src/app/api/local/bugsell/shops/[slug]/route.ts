import { NextRequest, NextResponse } from 'next/server'
import { bugsellFetch, getBugSellConfig, shopStoreUrl } from '../../_client'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const config = getBugSellConfig()
  if (!config.enabled) {
    return NextResponse.json({ code: 503, message: config.reason, data: null }, { status: 503 })
  }

  try {
    const result = await bugsellFetch(`/api/v1/storefront/shops/${encodeURIComponent(slug)}`)
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
    }

    const payload = result.body as { data?: Record<string, unknown> }
    const raw = payload.data || {}
    const shopSlug = String(raw.slug || slug)

    return NextResponse.json({
      code: 0,
      data: {
        id: String(raw.id || ''),
        slug: shopSlug,
        name: String(raw.name || ''),
        description: typeof raw.description === 'string' ? raw.description : null,
        avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
        banner: typeof raw.banner === 'string' ? raw.banner : null,
        productsCount: Number(raw.products_count || 0),
        averageRating: Number(raw.average_rating || 0),
        totalSalesCount: Number(raw.total_sales_count || 0),
        storeUrl: shopStoreUrl(config.storeUrl, shopSlug),
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
