/**
 * Durable-enough local bridge store for SocialOps Next BFF (port 6061).
 * Implements register / heartbeat / queue / next(lease) / complete.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJson, writeJson } from '@/app/api/ai/providers/_local'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const dir = join(appData, 'SocialsHub')
const bridgesFile = join(dir, 'extension-bridges.json')
const bridgeJobsFile = join(dir, 'extension-bridge-jobs.json')

export type BridgeRegistration = {
  id: string
  bridgeToken: string
  profileId: string
  platform: string
  name: string
  status: 'online' | 'idle' | 'busy' | 'error' | 'offline'
  lastHeartbeatAt?: string
  lastUrl?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export type BridgeJob = {
  id: string
  name: string
  status: 'queued' | 'leased' | 'running' | 'completed' | 'failed' | 'canceled'
  platform: string
  profileId: string
  steps: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
  leaseOwner?: string
  leaseUntil?: string
  result?: Record<string, unknown>
  error?: string
  logs?: unknown[]
  createdAt: string
  updatedAt: string
  finishedAt?: string
}

const LEASE_MS = 60_000

async function getBridges() {
  return await readJson<BridgeRegistration[]>(bridgesFile, [])
}

async function saveBridges(rows: BridgeRegistration[]) {
  await writeJson(bridgesFile, rows.slice(0, 100))
}

async function getJobs() {
  return await readJson<BridgeJob[]>(bridgeJobsFile, [])
}

async function saveJobs(rows: BridgeJob[]) {
  await writeJson(bridgeJobsFile, rows.slice(0, 400))
}

export async function registerBridge(input: {
  platform: string
  profileId: string
  name?: string
}) {
  const rows = await getBridges()
  const now = new Date().toISOString()
  const existing = rows.find(r => r.profileId === input.profileId && r.platform === input.platform)
  if (existing) {
    existing.bridgeToken = randomUUID()
    existing.name = input.name || existing.name
    existing.status = 'online'
    existing.updatedAt = now
    await saveBridges(rows)
    return existing
  }
  const row: BridgeRegistration = {
    id: randomUUID(),
    bridgeToken: randomUUID(),
    profileId: input.profileId,
    platform: String(input.platform || 'web'),
    name: input.name || `${input.platform} bridge`,
    status: 'online',
    createdAt: now,
    updatedAt: now,
  }
  rows.unshift(row)
  await saveBridges(rows)
  return row
}

export async function heartbeatBridge(input: {
  profileId: string
  bridgeToken: string
  status?: string
  url?: string
  error?: string
}) {
  const rows = await getBridges()
  const row = rows.find(r => r.profileId === input.profileId && r.bridgeToken === input.bridgeToken)
  if (!row) {
    return { ok: false as const, error: 'invalid_bridge_token' }
  }
  const now = new Date().toISOString()
  row.status = (input.status as BridgeRegistration['status']) || 'online'
  row.lastHeartbeatAt = now
  row.lastUrl = input.url || row.lastUrl
  row.lastError = input.error || undefined
  row.updatedAt = now
  await saveBridges(rows)
  return { ok: true as const, bridge: row }
}

export async function queueBridgeJob(input: {
  name: string
  platform: string
  profileId: string
  steps?: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
}) {
  const rows = await getJobs()
  // Phase1: max 1 browser job running/leased per profile
  const active = rows.filter(j =>
    j.profileId === input.profileId
    && (j.status === 'leased' || j.status === 'running'),
  )
  if (active.length >= 1) {
    // still allow queue
  }
  const now = new Date().toISOString()
  const job: BridgeJob = {
    id: randomUUID(),
    name: input.name || 'Bridge job',
    status: 'queued',
    platform: input.platform,
    profileId: input.profileId,
    steps: input.steps || [],
    settings: input.settings || {},
    createdAt: now,
    updatedAt: now,
  }
  rows.unshift(job)
  await saveJobs(rows)
  return job
}

export async function nextBridgeJob(input: {
  profileId: string
  bridgeToken: string
}) {
  const bridges = await getBridges()
  const bridge = bridges.find(b => b.profileId === input.profileId && b.bridgeToken === input.bridgeToken)
  if (!bridge)
    return { ok: false as const, error: 'invalid_bridge_token', job: null }

  const rows = await getJobs()
  const now = Date.now()
  // expire leases
  for (const j of rows) {
    if (j.status === 'leased' && j.leaseUntil && new Date(j.leaseUntil).getTime() < now) {
      j.status = 'queued'
      j.leaseOwner = undefined
      j.leaseUntil = undefined
      j.updatedAt = new Date().toISOString()
    }
  }

  const job = rows.find(j =>
    j.profileId === input.profileId
    && j.status === 'queued',
  )
  if (!job) {
    await saveJobs(rows)
    return { ok: true as const, job: null }
  }

  job.status = 'leased'
  job.leaseOwner = bridge.id
  job.leaseUntil = new Date(now + LEASE_MS).toISOString()
  job.updatedAt = new Date().toISOString()
  await saveJobs(rows)
  bridge.status = 'busy'
  bridge.updatedAt = new Date().toISOString()
  await saveBridges(bridges)
  return {
    ok: true as const,
    job: {
      id: job.id,
      name: job.name,
      platform: job.platform,
      profileId: job.profileId,
      input: {
        steps: job.steps,
        settings: job.settings,
      },
      leaseUntil: job.leaseUntil,
    },
  }
}

export async function completeBridgeJob(input: {
  profileId: string
  bridgeToken: string
  jobId: string
  ok: boolean
  logs?: unknown[]
  artifacts?: unknown[]
  error?: string
  result?: Record<string, unknown>
}) {
  const bridges = await getBridges()
  const bridge = bridges.find(b => b.profileId === input.profileId && b.bridgeToken === input.bridgeToken)
  if (!bridge)
    return { ok: false as const, error: 'invalid_bridge_token' }

  const rows = await getJobs()
  const job = rows.find(j => j.id === input.jobId && j.profileId === input.profileId)
  if (!job)
    return { ok: false as const, error: 'job_not_found' }

  const now = new Date().toISOString()
  job.status = input.ok ? 'completed' : 'failed'
  job.logs = input.logs
  job.result = {
    ...(input.result || {}),
    artifacts: input.artifacts || [],
  }
  job.error = input.ok ? undefined : (input.error || 'job_failed')
  job.finishedAt = now
  job.updatedAt = now
  job.leaseOwner = undefined
  job.leaseUntil = undefined
  await saveJobs(rows)

  bridge.status = 'online'
  bridge.updatedAt = now
  await saveBridges(bridges)

  // Sync linked draft-box task (ext:* models) — queue is NOT success
  try {
    const draftTaskId = String((job.settings as any)?.draftTaskId || '')
    const { applyBridgeJobToDraftTask } = await import('@/app/api/ai/draft-generation/_local')
    await applyBridgeJobToDraftTask({
      jobId: job.id,
      draftTaskId: draftTaskId || undefined,
      ok: input.ok,
      error: input.error,
      result: input.result,
      artifacts: input.artifacts,
    })
  }
  catch {
    // non-fatal — bridge complete still succeeds
  }

  return { ok: true as const, job }
}

export async function listBridgeJobs(profileId?: string) {
  const rows = await getJobs()
  return profileId ? rows.filter(j => j.profileId === profileId) : rows
}

/** Cancel a queued/leased/running job (user cancelled draft task). */
export async function cancelBridgeJob(jobId: string) {
  const rows = await getJobs()
  const job = rows.find(j => j.id === jobId)
  if (!job)
    return { ok: false as const, error: 'job_not_found' }
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled')
    return { ok: true as const, job, alreadyDone: true }
  const now = new Date().toISOString()
  job.status = 'canceled'
  job.error = 'Cancelled by user'
  job.finishedAt = now
  job.updatedAt = now
  job.leaseOwner = undefined
  job.leaseUntil = undefined
  await saveJobs(rows)
  return { ok: true as const, job }
}

export async function listBridges() {
  return await getBridges()
}
