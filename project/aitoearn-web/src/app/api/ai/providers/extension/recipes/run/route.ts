import { randomUUID } from 'node:crypto'
import { apiOk, readBody } from '@/app/api/ai/providers/_local'

function bridgeStore() {
  const g = globalThis as typeof globalThis & { __socialopsExtensionJobs?: Map<string, Record<string, unknown>> }
  if (!g.__socialopsExtensionJobs) g.__socialopsExtensionJobs = new Map()
  return g.__socialopsExtensionJobs
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const id = randomUUID()
  const job = {
    id,
    status: body.dryRun === true ? 'validated' : 'queued',
    platform: body.platform || 'grok',
    profileId: body.profileId || 'default',
    name: body.name || 'Extension recipe',
    steps: Array.isArray(body.steps) ? body.steps : [],
    createdAt: new Date().toISOString(),
  }
  bridgeStore().set(id, job)
  return apiOk(job, '/api/ai/providers/extension/recipes/run')
}
