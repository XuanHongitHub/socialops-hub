/**
 * Local SocialOps asset upload store (SOCIALOPS_LOCAL_MODE).
 * Replaces cloud R2 uploadSign + confirm so ref images work offline.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type LocalUploadAsset = {
  id: string
  filename: string
  contentType: string
  size: number
  path: string
  url: string
  status: 'pending' | 'uploaded' | 'confirmed'
  createdAt: string
  updatedAt: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const storeDir = join(appData, 'SocialsHub', 'user-uploads')
const metaFile = join(storeDir, 'index.json')

async function ensureDir() {
  await mkdir(storeDir, { recursive: true })
}

export async function listLocalUploadAssets(): Promise<LocalUploadAsset[]> {
  await ensureDir()
  try {
    return JSON.parse(await readFile(metaFile, 'utf8')) as LocalUploadAsset[]
  }
  catch {
    return []
  }
}

async function saveLocalUploadAssets(assets: LocalUploadAsset[]) {
  await ensureDir()
  await writeFile(metaFile, JSON.stringify(assets.slice(0, 500), null, 2), 'utf8')
}

export async function getLocalUploadAsset(id: string) {
  const assets = await listLocalUploadAssets()
  return assets.find(a => a.id === id) || null
}

export async function createLocalUploadSign(input: {
  filename?: string
  size?: number
  type?: string
  contentType?: string
}) {
  await ensureDir()
  const id = randomUUID()
  const filename = String(input.filename || `file_${Date.now()}`).replace(/[^\w.\-()/]/g, '_')
  const contentType = String(input.contentType || guessMime(filename) || 'application/octet-stream')
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
  const diskName = `${id}${ext || ''}`
  const path = join(storeDir, diskName)
  const publicUrl = `/api/assets/${id}/file`
  // Client PUTs raw body here (same contract as R2 uploadUrl)
  const uploadUrl = `/api/assets/local-upload/${id}`

  const asset: LocalUploadAsset = {
    id,
    filename,
    contentType,
    size: Number(input.size || 0) || 0,
    path,
    url: publicUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const assets = await listLocalUploadAssets()
  assets.unshift(asset)
  await saveLocalUploadAssets(assets)

  return {
    id,
    url: publicUrl,
    uploadUrl,
    path: diskName,
  }
}

export async function saveLocalUploadBody(id: string, body: Buffer, contentType?: string) {
  const assets = await listLocalUploadAssets()
  const index = assets.findIndex(a => a.id === id)
  if (index < 0)
    return null
  const asset = assets[index]
  await ensureDir()
  await writeFile(asset.path, body)
  asset.size = body.length
  if (contentType)
    asset.contentType = contentType
  asset.status = 'uploaded'
  asset.updatedAt = new Date().toISOString()
  assets[index] = asset
  await saveLocalUploadAssets(assets)
  return asset
}

export async function confirmLocalUpload(id: string) {
  const assets = await listLocalUploadAssets()
  const index = assets.findIndex(a => a.id === id)
  if (index < 0)
    return null
  const asset = assets[index]
  // Allow confirm even if client skipped PUT somehow — still return URL
  if (asset.status === 'pending') {
    // keep pending but return url so UX continues
  }
  else {
    asset.status = 'confirmed'
  }
  asset.updatedAt = new Date().toISOString()
  assets[index] = asset
  await saveLocalUploadAssets(assets)
  return {
    id: asset.id,
    url: asset.url,
    path: asset.url,
  }
}

function guessMime(filename: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png'))
    return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
    return 'image/jpeg'
  if (lower.endsWith('.webp'))
    return 'image/webp'
  if (lower.endsWith('.gif'))
    return 'image/gif'
  if (lower.endsWith('.mp4'))
    return 'video/mp4'
  if (lower.endsWith('.webm'))
    return 'video/webm'
  return 'application/octet-stream'
}

export function okJson(data: unknown, url: string, message = 'ok') {
  return Response.json({ code: 0, data, message, url })
}
