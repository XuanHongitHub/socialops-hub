/**
 * Primary config endpoint for patched automation extensions.
 * Shape matches author API: GET {base}/config/{pack}
 * Tries local SocialsHub mirror first; live-upstream only when mirror missing.
 */
import { NextResponse } from 'next/server'
import { getUpstreamPack } from '@/app/api/ai/providers/extension/upstreamPacks'
import { resolveConfigForClient } from '@/app/api/ai/providers/extension/remoteConfigMirror'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ pack: string }> | { pack: string } },
) {
  const params = await Promise.resolve(ctx.params)
  const packId = String(params.pack || '').trim()
  const pack = getUpstreamPack(packId)
  if (!pack) {
    return NextResponse.json(
      { error: 'unknown_pack', pack: packId },
      { status: 404 },
    )
  }

  // Author uses X-Client-Secret; accept same secrets OR local hub without secret
  const secret = req.headers.get('x-client-secret') || ''
  if (secret && secret !== pack.clientSecret) {
    // Still allow empty secret for local Hub clients
    // Reject wrong secret only when provided
    if (secret.length > 0) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const resolved = await resolveConfigForClient(pack.id, {
      preferLiveUpstream: false,
    })
    // Return author-compatible body (selectors root) so extension validation passes
    return NextResponse.json(resolved.body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-SocialOps-Config-Source': resolved.source,
        'X-SocialOps-Config-Fetched-At': resolved.fetchedAt || '',
      },
    })
  }
  catch (e) {
    return NextResponse.json(
      {
        error: 'config_unavailable',
        message: e instanceof Error ? e.message : String(e),
        pack: pack.id,
        hint: 'Run Workspace → Sync remote configs, or ensure upstream author endpoints are reachable',
      },
      { status: 503 },
    )
  }
}
