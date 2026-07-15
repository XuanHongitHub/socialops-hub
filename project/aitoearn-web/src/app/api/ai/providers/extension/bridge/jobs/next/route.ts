import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { nextBridgeJob } from '../../_store'

export async function POST(req: Request) {
  const body = await readBody(req)
  const result = await nextBridgeJob({
    profileId: String(body.profileId || ''),
    bridgeToken: String(body.bridgeToken || ''),
  })
  if (!result.ok) {
    return apiOk({ job: null, error: result.error }, '/api/ai/providers/extension/bridge/jobs/next')
  }
  return apiOk({ job: result.job }, '/api/ai/providers/extension/bridge/jobs/next')
}
