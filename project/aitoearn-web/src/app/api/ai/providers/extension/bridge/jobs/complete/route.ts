import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { completeBridgeJob } from '../../_store'

export async function POST(req: Request) {
  const body = await readBody(req)
  const result = await completeBridgeJob({
    profileId: String(body.profileId || ''),
    bridgeToken: String(body.bridgeToken || ''),
    jobId: String(body.jobId || body.id || ''),
    ok: body.ok !== false && !body.error,
    logs: Array.isArray(body.logs) ? body.logs : [],
    artifacts: Array.isArray(body.artifacts) ? body.artifacts : [],
    error: body.error ? String(body.error) : undefined,
    result: (body.result as Record<string, unknown>) || undefined,
  })
  if (!result.ok) {
    return apiOk({ ok: false, error: result.error }, '/api/ai/providers/extension/bridge/jobs/complete')
  }
  return apiOk({ ok: true, job: result.job }, '/api/ai/providers/extension/bridge/jobs/complete')
}
