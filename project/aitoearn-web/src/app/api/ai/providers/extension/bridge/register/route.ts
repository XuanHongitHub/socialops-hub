import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { registerBridge } from '../_store'

export async function POST(req: Request) {
  const body = await readBody(req)
  const row = await registerBridge({
    platform: String(body.platform || 'web'),
    profileId: String(body.profileId || 'primary'),
    name: body.name ? String(body.name) : undefined,
  })
  return apiOk({
    id: row.id,
    bridgeToken: row.bridgeToken,
    profileId: row.profileId,
    platform: row.platform,
    status: row.status,
    name: row.name,
  }, '/api/ai/providers/extension/bridge/register')
}
