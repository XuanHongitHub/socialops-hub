import { NextResponse } from 'next/server'
import { getBugSellConfig } from '../_client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const config = getBugSellConfig()
  return NextResponse.json({
    code: 0,
    data: {
      enabled: config.enabled,
      apiUrl: config.enabled ? config.apiUrl : null,
      storeUrl: config.enabled ? config.storeUrl : null,
      reason: config.reason || null,
      flows: ['product_search', 'shop_browse'],
      auth: 'public_storefront',
    },
    message: config.enabled ? 'BugSell production catalog ready' : 'BugSell integration disabled',
  }, {
    headers: {
      'Cache-Control': 'private, max-age=120, stale-while-revalidate=600',
    },
  })
}
