import { NextRequest, NextResponse } from 'next/server'
import { bugsellFetch, getBugSellConfig, normalizeProductCard, productToGenInput } from '../../_client'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const config = getBugSellConfig()
  if (!config.enabled) {
    return NextResponse.json({ code: 503, message: config.reason, data: null }, { status: 503 })
  }

  try {
    const result = await bugsellFetch(`/api/v1/storefront/products/${encodeURIComponent(slug)}`)
    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status })
    }

    const payload = result.body as { data?: Record<string, unknown> }
    const raw = payload.data || (result.body as Record<string, unknown>)
    const product = normalizeProductCard(raw as Record<string, unknown>, config.storeUrl)
    const gen = productToGenInput(product)

    return NextResponse.json({
      code: 0,
      data: {
        product,
        gen,
        raw: {
          description: typeof raw.description === 'string' ? raw.description : null,
          images: raw.images || null,
        },
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
