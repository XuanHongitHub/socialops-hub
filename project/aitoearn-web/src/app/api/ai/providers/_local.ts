import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export type LocalAccount = {
  id: string
  providerId: string
  name: string
  authMode: string
  status: string
  credentials?: Record<string, unknown>
  metadata?: Record<string, unknown>
  quota?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lastHealthStatus?: string
  lastHealthAt?: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const storeDir = join(appData, 'SocialsHub')
const runExecFile = promisify(execFile)
export const accountFile = join(storeDir, 'provider-accounts.json')
export const workflowFile = join(storeDir, 'workflow-runs.json')
export const assetFile = join(storeDir, 'ai-assets.json')


export type WorkflowRun = {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
  profileId?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
}

type MongoState = { client?: any, db?: any, failedAt?: number }
const mongoState: MongoState = {}
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017'
const mongoDbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'socialops_hub'
const mongoEnabled = process.env.SOCIALOPS_STORE !== 'json'

async function loadMongoClient() {
  if (!mongoEnabled) return null
  if (mongoState.db) return mongoState.db
  if (mongoState.failedAt && Date.now() - mongoState.failedAt < 10000) return null
  try {
    const importer = new Function('name', 'return import(name)') as (name: string) => Promise<any>
    const mod = await importer('mongodb')
    const client = new mod.MongoClient(mongoUri, { serverSelectionTimeoutMS: 1200 })
    await client.connect()
    mongoState.client = client
    mongoState.db = client.db(mongoDbName)
    await mongoState.db.collection('provider_accounts').createIndex({ id: 1 }, { unique: true })
    await mongoState.db.collection('provider_accounts').createIndex({ providerId: 1, name: 1 }, { unique: true })
    await mongoState.db.collection('provider_workflow_runs').createIndex({ id: 1 }, { unique: true })
    return mongoState.db
  }
  catch {
    mongoState.failedAt = Date.now()
    return null
  }
}

function collectionForFile(file: string) {
  if (file === accountFile) return 'provider_accounts'
  if (file === workflowFile) return 'provider_workflow_runs'
  if (file === assetFile) return 'provider_assets'
  return ''
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T }
  catch { return fallback }
}

async function seedMongoIfEmpty<T>(collection: any, file: string, fallback: T) {
  const count = await collection.countDocuments()
  if (count > 0) return
  const local = await readJsonFile<T>(file, fallback)
  if (Array.isArray(local) && local.length > 0)
    await collection.insertMany(local.map(item => ({ ...item, _source: 'json_import', _syncedAt: new Date() })), { ordered: false }).catch(() => null)
}

export function apiOk(data: unknown, url: string) {
  return NextResponse.json({ code: 0, data, message: 'ok', url })
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  const collectionName = collectionForFile(file)
  if (collectionName) {
    const db = await loadMongoClient()
    if (db) {
      const collection = db.collection(collectionName)
      await seedMongoIfEmpty(collection, file, fallback)
      return await collection.find({}, { projection: { _id: 0, _source: 0, _syncedAt: 0 } }).toArray() as T
    }
  }
  return await readJsonFile(file, fallback)
}

export async function writeJson(file: string, data: unknown) {
  const collectionName = collectionForFile(file)
  if (collectionName) {
    const db = await loadMongoClient()
    if (db) {
      const rows = Array.isArray(data) ? data : []
      const collection = db.collection(collectionName)
      await collection.deleteMany({})
      if (rows.length > 0)
        await collection.insertMany(rows.map(item => ({ ...item, _syncedAt: new Date() })), { ordered: false })
    }
  }
  await mkdir(storeDir, { recursive: true })
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

export function safeAccount(account: LocalAccount) {
  const { credentials, ...safe } = account
  return { ...safe, hasCredentials: Boolean(credentials) }
}

export async function upsertAccount(body: Partial<LocalAccount>) {
  const accounts = await readJson<LocalAccount[]>(accountFile, [])
  const now = new Date().toISOString()
  const index = accounts.findIndex(account => account.id === body.id || (account.providerId === body.providerId && account.name === body.name))
  const next: LocalAccount = {
    ...(index >= 0 ? accounts[index] : { id: randomUUID(), createdAt: now }),
    providerId: String(body.providerId || 'unknown'),
    name: String(body.name || 'Local account'),
    authMode: String(body.authMode || 'api_key'),
    status: body.status || 'active',
    credentials: body.credentials && Object.keys(body.credentials).length > 0 ? body.credentials : accounts[index]?.credentials,
    metadata: body.metadata || {},
    quota: body.quota || {},
    updatedAt: now,
  }
  if (index >= 0) accounts[index] = next
  else accounts.push(next)
  await writeJson(accountFile, accounts)
  return safeAccount(next)
}

export async function selectAccount(body: Record<string, unknown>) {
  const accounts = await readJson<LocalAccount[]>(accountFile, [])
  const account = accounts.find(item => item.providerId === body.providerId && item.status !== 'disabled')
  return account ? safeAccount(account) : null
}

export async function readBody(req: Request) {
  return await req.json().catch(() => ({})) as Record<string, unknown>
}

export async function getAccounts() {
  return await readJson<LocalAccount[]>(accountFile, [])
}

export async function saveAccounts(accounts: LocalAccount[]) {
  await writeJson(accountFile, accounts)
}

export async function getWorkflowRuns() {
  return await readJson<WorkflowRun[]>(workflowFile, [])
}

export async function saveWorkflowRuns(runs: WorkflowRun[]) {
  await writeJson(workflowFile, runs)
}

export async function createWorkflowRun(input: { name?: string, profileId?: string, input?: Record<string, unknown> }) {
  const now = new Date().toISOString()
  const run: WorkflowRun = {
    id: randomUUID(),
    name: input.name || 'AI content/video workflow',
    status: 'pending',
    profileId: input.profileId,
    input: input.input || {},
    createdAt: now,
    updatedAt: now,
  }
  const runs = await getWorkflowRuns()
  runs.unshift(run)
  await saveWorkflowRuns(runs.slice(0, 200))
  return run
}

export async function updateWorkflowRun(id: string, patch: Partial<WorkflowRun>) {
  const runs = await getWorkflowRuns()
  const index = runs.findIndex(run => run.id === id)
  const now = new Date().toISOString()
  const run = index >= 0 ? { ...runs[index], ...patch, updatedAt: now } : { id, name: 'AI content/video workflow', status: 'pending' as const, createdAt: now, updatedAt: now, ...patch }
  if (index >= 0) runs[index] = run
  else runs.unshift(run)
  await saveWorkflowRuns(runs)
  return run
}

function extractText(data: any) {
  return String(data?.choices?.[0]?.message?.content || data?.output_text || data?.content || '').trim()
}

export async function call9RouterChat(
  prompt: string,
  options: { model?: string, system?: string, imageUrl?: string, imageUrls?: string[], timeoutMs?: number } = {},
) {
  const accounts = await getAccounts()
  const router = accounts.find(account => account.providerId === '9router' && account.status !== 'disabled')
  const configuredBaseUrl = String(process.env.NINEROUTER_URL || router?.metadata?.baseUrl || 'http://localhost:20128/v1').replace(/\/$/, '')
  const baseUrls = configuredBaseUrl.endsWith('/v1') ? [configuredBaseUrl] : [`${configuredBaseUrl}/v1`, configuredBaseUrl]
  const apiKey = String(process.env.NINEROUTER_KEY || router?.credentials?.apiKey || '')
  if (!apiKey) throw new Error('9Router API key missing. Add a 9router provider account first.')
  const images = [
    ...(Array.isArray(options.imageUrls) ? options.imageUrls : []),
    options.imageUrl || '',
  ]
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 4)
  const userContent = images.length
    ? [
        { type: 'text', text: prompt },
        ...images.map(url => ({ type: 'image_url', image_url: { url } })),
      ]
    : prompt
  const payload = {
    model: options.model || String(router?.metadata?.defaultModel || 'cx_agy'),
    messages: [
      { role: 'system', content: options.system || 'You are Socials Hub. Return concise, production-ready social media output.' },
      { role: 'user', content: userContent },
    ],
  }
  const timeoutMs = options.timeoutMs ?? 120_000
  let lastError = ''
  for (const baseUrl of baseUrls) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const raw = await res.text()
    let data: any = null
    try { data = JSON.parse(raw) } catch { data = { raw } }
    if (res.ok) return { text: extractText(data), raw: data }
    lastError = data?.error?.message || raw || `9Router chat failed: ${res.status}`
    if (res.status !== 404) throw new Error(lastError)
  }
  throw new Error(lastError)
}

export async function discover9RouterModels(): Promise<Array<{ id: string, ownedBy: string }>> {
  const accounts = await getAccounts()
  const router = accounts.find(account => account.providerId === '9router' && account.status !== 'disabled')
  const configured = String(process.env.NINEROUTER_URL || router?.metadata?.baseUrl || 'http://localhost:20128/v1').replace(/\/$/, '')
  const baseUrl = configured.endsWith('/v1') ? configured : `${configured}/v1`
  const apiKey = String(process.env.NINEROUTER_KEY || router?.credentials?.apiKey || '')
  const response = await fetch(`${baseUrl}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, cache: 'no-store' })
  if (!response.ok) throw new Error(`9Router model discovery failed: ${response.status}`)
  const parsed = await response.json()
  return (Array.isArray(parsed) ? parsed : parsed.data || []).map((model: any) => ({ id: String(model.id || model.name), ownedBy: String(model.owned_by || model.provider || '') })).filter((model: any) => model.id)
}

export function socialContentPrompt(input: Record<string, unknown>) {
  return `Create a complete social content pack for this product.
Product URL: ${input.productUrl || ''}
Product title: ${input.productTitle || ''}
Notes: ${input.productNotes || ''}
Platform: ${input.platform || 'pinterest'}
Return JSON with keys: title, caption, hashtags, shortVideoScript, storyboard, publishChecklist. shortVideoScript must be ready for a 15s product video.`
}

export { productCaptionPackPrompt, productVideoMotionPrompt } from './productVideoMotion'

/** Clamp caption pack fields for multi-platform publish (prevents Publish Work warnings). */
export function clampPublishPack(pack: {
  title?: unknown
  caption?: unknown
  hashtags?: unknown
}, opts?: { topicMax?: number, titleMax?: number }) {
  const topicMax = Math.min(8, Math.max(1, Number(opts?.topicMax) || 5))
  const titleMax = Math.min(120, Math.max(16, Number(opts?.titleMax) || 80))
  const title = String(pack.title || '').trim().slice(0, titleMax)
  // Strip trailing hashtag soup from caption body
  let caption = String(pack.caption || '').trim()
    .replace(/(?:#[\p{L}\p{N}_]+[\s]*)+$/gu, '')
    .trim()
  const rawTags = Array.isArray(pack.hashtags) ? pack.hashtags : []
  const hashtags = [...new Set(
    rawTags
      .map((t) => {
        const raw = String(t || '').replace(/^#/, '').trim()
        if (!raw)
          return ''
        // Single-token hashtags only (no spaces) — matches publish UI rules
        if (!/\s/.test(raw))
          return raw.replace(/[^\p{L}\p{N}_]/gu, '')
        return raw
          .split(/[\s_-]+/)
          .filter(Boolean)
          .map((p, i) => {
            const clean = p.replace(/[^\p{L}\p{N}]/gu, '')
            if (!clean)
              return ''
            return i === 0
              ? clean.charAt(0).toLowerCase() + clean.slice(1)
              : clean.charAt(0).toUpperCase() + clean.slice(1)
          })
          .join('')
      })
      .filter(Boolean),
  )].slice(0, topicMax)
  return { title, caption, hashtags }
}

export type AiAsset = {
  id: string
  type: 'video' | 'image' | 'text'
  title: string
  url: string
  path: string
  provider: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export async function getAssets() {
  return await readJson<AiAsset[]>(assetFile, [])
}

export async function saveAssets(assets: AiAsset[]) {
  await writeJson(assetFile, assets)
}

function escapeXml(value: unknown) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function stripJsonFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
}

export function parseAiContentPack(text: string) {
  try { return JSON.parse(stripJsonFence(text)) as Record<string, unknown> }
  catch { return { caption: text } }
}

function wrapWords(text: string, max = 34) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      lines.push(line)
      line = word
    }
    else line = next
  }
  if (line) lines.push(line)
  return lines.slice(0, 8)
}

function svgText(lines: string[], x: number, y: number, size: number, weight = 700, color = '#f8fafc') {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * size * 1.18}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`).join('')
}

function contentScenes(pack: Record<string, unknown>, input: Record<string, unknown>) {
  const storyboard = Array.isArray(pack.storyboard) ? pack.storyboard as Array<Record<string, unknown>> : []
  const script = String(pack.shortVideoScript || pack.caption || input.productTitle || 'BugSell product video')
  const base = storyboard.length ? storyboard.map((scene, index) => ({
    kicker: `Scene ${index + 1}`,
    title: scene.textOverlay || scene.visual || pack.title || input.productTitle,
    body: scene.visual || script,
  })) : [
    { kicker: 'Hook', title: pack.title || input.productTitle || 'BugSell Gift Idea', body: script },
    { kicker: 'Personalize', title: 'Make it personal', body: input.productNotes || pack.caption || script },
    { kicker: 'Gift Moment', title: 'Ready for social posts', body: pack.caption || script },
    { kicker: 'Publish', title: 'Customize yours today', body: Array.isArray(pack.hashtags) ? pack.hashtags.join(' ') : '#BugSell #GiftIdeas' },
  ]
  return base.slice(0, 4)
}

export async function renderSocialVideo(pack: Record<string, unknown>, input: Record<string, unknown>) {
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  const id = randomUUID()
  const publicDir = join(process.cwd(), 'public', 'socialops-assets', id)
  const frameDir = join(publicDir, 'frames')
  await mkdir(frameDir, { recursive: true })
  const scenes = contentScenes(pack, input)
  const title = String(pack.title || input.productTitle || 'BugSell Social Video')
  const caption = String(pack.caption || input.productNotes || '')

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index]
    const svg = `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="0.52" stop-color="#111827"/><stop offset="1" stop-color="#312e81"/></linearGradient>
        <radialGradient id="glow" cx="50%" cy="35%" r="55%"><stop offset="0" stop-color="#38bdf8" stop-opacity="0.35"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#bg)"/>
      <rect width="1080" height="1920" fill="url(#glow)"/>
      <rect x="70" y="80" width="940" height="1760" rx="42" fill="#020617" opacity="0.55" stroke="#ffffff" stroke-opacity="0.12"/>
      <text x="90" y="170" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="#67e8f9">BUGSELL</text>
      <text x="90" y="230" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600" fill="#cbd5e1">{escapeXml(scene['kicker'])}</text>
      ${svgText(wrapWords(String(scene['title'] || ''), 18), 90, 470, 78, 850)}
      ${svgText(wrapWords(String(scene['body'] || ''), 32), 90, 850, 42, 500, '#dbeafe')}
      ${svgText(wrapWords(caption, 46), 90, 1430, 30, 500, '#cbd5e1')}
      <text x="90" y="1735" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#f8fafc">${escapeXml(input.productUrl || '')}</text>
      <rect x="90" y="1780" width="900" height="2" fill="#ffffff" opacity="0.16"/>
      <text x="90" y="1830" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600" fill="#94a3b8">{escapeXml(title)}</text>
    </svg>`
    await sharp(Buffer.from(svg)).png().toFile(join(frameDir, `frame-${String(index + 1).padStart(2, '0')}.png`))
  }

  const outputPath = join(publicDir, 'video.mp4')
  await runExecFile('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', '0.25',
    '-i', join(frameDir, 'frame-%02d.png'),
    '-vf', 'fps=30,format=yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ], { timeout: 120000 })
  const asset: AiAsset = {
    id,
    type: 'video',
    title,
    url: `/api/ai/assets/${id}/file`,
    path: outputPath,
    provider: 'local_ffmpeg',
    metadata: { frameCount: scenes.length, source: '9router_content_pack' },
    createdAt: new Date().toISOString(),
  }
  const assets = await getAssets()
  assets.unshift(asset)
  await saveAssets(assets.slice(0, 200))
  return asset
}
