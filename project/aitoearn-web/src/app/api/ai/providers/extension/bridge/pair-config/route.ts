/**
 * Extension polls this to auto-pair with SocialOps Hub (stable link).
 * GET → current pair config for primary (or ?profileId=)
 * No auth required on localhost loopback for extension service worker.
 */
import { NextResponse } from 'next/server'
import { readBridgePair } from '@/app/api/ai/providers/workspace/seatSession'
import { listBridges } from '../_store'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const profileId = url.searchParams.get('profileId') || 'primary'

  const pair = await readBridgePair()
  if (pair && (!profileId || pair.profileId === profileId)) {
    return NextResponse.json({
      code: 0,
      data: {
        ...pair,
        paired: true,
        source: 'pair_file',
      },
      message: 'ok',
      url: '/api/ai/providers/extension/bridge/pair-config',
    })
  }

  const bridges = await listBridges()
  const bridge = bridges.find(b => b.profileId === profileId) || bridges[0]
  if (!bridge) {
    return NextResponse.json({
      code: 0,
      data: {
        paired: false,
        profileId,
        apiBase: 'http://127.0.0.1:6061/api',
        message: 'No bridge registered. Click Prepare primary seat or Register bridge in Workspace.',
      },
      message: 'unpaired',
      url: '/api/ai/providers/extension/bridge/pair-config',
    })
  }

  return NextResponse.json({
    code: 0,
    data: {
      paired: true,
      apiBase: 'http://127.0.0.1:6061/api',
      profileId: bridge.profileId,
      bridgeToken: bridge.bridgeToken,
      providerId: 'extension-bridge',
      seatName: bridge.name,
      updatedAt: bridge.updatedAt,
      source: 'bridge_store',
    },
    message: 'ok',
    url: '/api/ai/providers/extension/bridge/pair-config',
  })
}
