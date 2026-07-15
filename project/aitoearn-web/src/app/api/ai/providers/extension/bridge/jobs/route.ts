import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { listBridgeJobs, queueBridgeJob } from '../_store'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const profileId = url.searchParams.get('profileId') || undefined
  const jobs = await listBridgeJobs(profileId || undefined)
  return apiOk({ jobs }, '/api/ai/providers/extension/bridge/jobs')
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const job = await queueBridgeJob({
    name: String(body.name || 'Bridge job'),
    platform: String(body.platform || 'web'),
    profileId: String(body.profileId || 'primary'),
    steps: Array.isArray(body.steps) ? body.steps as Array<Record<string, unknown>> : [],
    settings: (body.settings as Record<string, unknown>) || {},
  })
  return apiOk(job, '/api/ai/providers/extension/bridge/jobs')
}
