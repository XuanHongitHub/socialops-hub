import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJson, writeJson } from '@/app/api/ai/providers/_local'

export type CdpProfileType = 'helium' | 'buglogin' | 'chrome' | 'edge' | 'custom'

export type WorkspaceProfile = {
  id: string
  name: string
  kind: 'cdp' | 'extension' | 'hybrid'
  status: 'active' | 'disabled' | 'offline' | 'online' | 'busy' | 'error'
  cdpEndpoint?: string
  profileType?: CdpProfileType
  proxyUrl?: string
  expectedHost?: string
  platform?: string
  description?: string
  bridgeToken?: string
  lastSmokeAt?: string
  lastSmokeOk?: boolean
  lastError?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type WorkspaceRecipe = {
  id: string
  name: string
  platform: string
  profileId?: string
  mode: 'cdp' | 'extension' | 'hybrid'
  dryRunDefault?: boolean
  steps: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type WorkspaceJob = {
  id: string
  name: string
  status: 'queued' | 'running' | 'validated' | 'completed' | 'failed' | 'canceled'
  mode: 'cdp' | 'extension' | 'hybrid' | 'smoke'
  platform?: string
  profileId?: string
  recipeId?: string
  steps?: Array<Record<string, unknown>>
  result?: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string
}

export type WorkspaceActivity = {
  id: string
  type: string
  message: string
  level: 'info' | 'success' | 'warn' | 'error'
  profileId?: string
  jobId?: string
  createdAt: string
  meta?: Record<string, unknown>
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const dir = join(appData, 'SocialsHub')
const profilesFile = join(dir, 'workspace-profiles.json')
const recipesFile = join(dir, 'workspace-recipes.json')
const jobsFile = join(dir, 'workspace-jobs.json')
const activityFile = join(dir, 'workspace-activity.json')

export async function getProfiles() {
  return await readJson<WorkspaceProfile[]>(profilesFile, [])
}

export async function saveProfiles(rows: WorkspaceProfile[]) {
  await writeJson(profilesFile, rows.slice(0, 200))
}

export async function getRecipes() {
  return await readJson<WorkspaceRecipe[]>(recipesFile, [])
}

export async function saveRecipes(rows: WorkspaceRecipe[]) {
  await writeJson(recipesFile, rows.slice(0, 200))
}

export async function getJobs() {
  return await readJson<WorkspaceJob[]>(jobsFile, [])
}

export async function saveJobs(rows: WorkspaceJob[]) {
  await writeJson(jobsFile, rows.slice(0, 300))
}

export async function getActivity() {
  return await readJson<WorkspaceActivity[]>(activityFile, [])
}

export async function pushActivity(entry: Omit<WorkspaceActivity, 'id' | 'createdAt'>) {
  const rows = await getActivity()
  rows.unshift({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  })
  await writeJson(activityFile, rows.slice(0, 200))
}

export async function upsertProfile(input: Partial<WorkspaceProfile> & { name: string }) {
  const rows = await getProfiles()
  const now = new Date().toISOString()
  const index = rows.findIndex(r => r.id === input.id || (r.name === input.name && r.kind === (input.kind || 'cdp')))
  if (index >= 0) {
    rows[index] = {
      ...rows[index],
      ...input,
      updatedAt: now,
    }
    await saveProfiles(rows)
    return rows[index]
  }
  const row: WorkspaceProfile = {
    id: input.id || randomUUID(),
    name: input.name,
    kind: input.kind || 'cdp',
    status: input.status || 'active',
    cdpEndpoint: input.cdpEndpoint || 'http://127.0.0.1:9222',
    profileType: input.profileType || 'chrome',
    proxyUrl: input.proxyUrl,
    expectedHost: input.expectedHost,
    platform: input.platform,
    description: input.description,
    bridgeToken: input.bridgeToken,
    lastSmokeAt: input.lastSmokeAt,
    lastSmokeOk: input.lastSmokeOk,
    lastError: input.lastError,
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  }
  rows.unshift(row)
  await saveProfiles(rows)
  return row
}

export async function deleteProfile(id: string) {
  const rows = await getProfiles()
  await saveProfiles(rows.filter(r => r.id !== id))
}

export async function createRecipe(input: Omit<WorkspaceRecipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  const rows = await getRecipes()
  const now = new Date().toISOString()
  const row: WorkspaceRecipe = {
    id: input.id || randomUUID(),
    name: input.name,
    platform: input.platform,
    profileId: input.profileId,
    mode: input.mode,
    dryRunDefault: input.dryRunDefault,
    steps: input.steps || [],
    settings: input.settings || {},
    createdAt: now,
    updatedAt: now,
  }
  rows.unshift(row)
  await saveRecipes(rows)
  return row
}

export async function createJob(input: Omit<WorkspaceJob, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) {
  const rows = await getJobs()
  const now = new Date().toISOString()
  const row: WorkspaceJob = {
    id: input.id || randomUUID(),
    name: input.name,
    status: input.status || 'queued',
    mode: input.mode,
    platform: input.platform,
    profileId: input.profileId,
    recipeId: input.recipeId,
    steps: input.steps || [],
    result: input.result,
    error: input.error,
    createdAt: now,
    updatedAt: now,
    finishedAt: input.finishedAt,
  }
  rows.unshift(row)
  await saveJobs(rows)
  return row
}

export async function updateJob(id: string, patch: Partial<WorkspaceJob>) {
  const rows = await getJobs()
  const index = rows.findIndex(r => r.id === id)
  if (index < 0)
    return null
  rows[index] = { ...rows[index], ...patch, updatedAt: new Date().toISOString() }
  await saveJobs(rows)
  return rows[index]
}

export function normalizeEndpoint(value: unknown) {
  return String(value || 'http://127.0.0.1:9222').replace(/\/$/, '')
}

export async function probeCdp(endpointRaw: unknown) {
  const endpoint = normalizeEndpoint(endpointRaw)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const [versionRes, listRes] = await Promise.all([
      fetch(`${endpoint}/json/version`, { cache: 'no-store', signal: controller.signal }),
      fetch(`${endpoint}/json/list`, { cache: 'no-store', signal: controller.signal }).catch(() => null),
    ])
    const version = await versionRes.json().catch(() => null)
    const targets = listRes ? await listRes.json().catch(() => []) : []
    return {
      ok: versionRes.ok,
      endpoint,
      version,
      targets: Array.isArray(targets) ? targets : [],
      targetCount: Array.isArray(targets) ? targets.length : 0,
    }
  }
  catch (error) {
    return {
      ok: false,
      endpoint,
      version: null,
      targets: [] as unknown[],
      targetCount: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  finally {
    clearTimeout(timer)
  }
}
