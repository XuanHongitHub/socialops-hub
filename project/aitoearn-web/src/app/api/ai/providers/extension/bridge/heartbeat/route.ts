import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { heartbeatBridge } from '../_store'

export async function POST(req: Request) {
  const body = await readBody(req)
  const result = await heartbeatBridge({
    profileId: String(body.profileId || ''),
    bridgeToken: String(body.bridgeToken || ''),
    status: body.status ? String(body.status) : 'online',
    url: body.url ? String(body.url) : undefined,
    error: body.error ? String(body.error) : undefined,
  })
  if (!result.ok) {
    return apiOk({
      status: 'error',
      error: result.error,
      receivedAt: new Date().toISOString(),
    }, '/api/ai/providers/extension/bridge/heartbeat')
  }
  return apiOk({
    status: result.bridge.status,
    receivedAt: new Date().toISOString(),
    lastUrl: result.bridge.lastUrl,
  }, '/api/ai/providers/extension/bridge/heartbeat')
}
