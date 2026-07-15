/**
 * Turn any local/public ref URL into a vision-ready data URL (or https).
 * Local SocialOps uploads are `/api/assets/:id/file` — Grok cannot fetch those.
 */
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { getLocalUploadAsset } from '@/app/api/assets/_local'
import { getAssets } from '@/app/api/ai/providers/_local'

const MAX_DATA_CHARS = 450_000
const VISION_MAX_SIDE = 1280

async function encodeVisionJpeg(buf: Buffer): Promise<string> {
  const out = await sharp(buf)
    .rotate()
    .resize({
      width: VISION_MAX_SIDE,
      height: VISION_MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
  const dataUrl = `data:image/jpeg;base64,${out.toString('base64')}`
  if (dataUrl.length > MAX_DATA_CHARS) {
    const smaller = await sharp(buf)
      .rotate()
      .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${smaller.toString('base64')}`
  }
  return dataUrl
}

async function bufferFromHttp(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok)
      return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length ? bytes : null
  }
  catch {
    return null
  }
}

/**
 * Resolve one image URL for multimodal LLM vision.
 * Returns data: URL (preferred for local) or absolute https, or null if unreadable.
 */
export async function resolveImageForVision(rawUrl: string): Promise<string | null> {
  const url = String(rawUrl || '').trim()
  if (!url)
    return null

  if (url.startsWith('data:image')) {
    if (url.length <= MAX_DATA_CHARS)
      return url
    // Shrink oversized data URLs
    try {
      const b64 = url.split(',')[1]
      if (!b64)
        return null
      return await encodeVisionJpeg(Buffer.from(b64, 'base64'))
    }
    catch {
      return null
    }
  }

  // Local user upload: /api/assets/:id/file
  const uploadMatch = url.match(/\/api\/assets\/([^/?#]+)\/file/i)
  if (uploadMatch?.[1]) {
    const asset = await getLocalUploadAsset(uploadMatch[1])
    if (asset?.path) {
      try {
        const buf = await readFile(asset.path)
        if (buf.length)
          return await encodeVisionJpeg(buf)
      }
      catch { /* fall through */ }
    }
  }

  // Generated AI asset: /api/ai/assets/:id/file
  const aiMatch = url.match(/\/api\/ai\/assets\/([^/?#]+)\/file/i)
  if (aiMatch?.[1]) {
    const assets = await getAssets()
    const asset = assets.find(a => a.id === aiMatch[1])
    if (asset?.path) {
      try {
        const buf = await readFile(asset.path)
        if (buf.length)
          return await encodeVisionJpeg(buf)
      }
      catch { /* fall through */ }
    }
  }

  // Absolute http(s) — re-encode so payload is bounded
  if (/^https?:\/\//i.test(url)) {
    const buf = await bufferFromHttp(url)
    if (buf)
      return await encodeVisionJpeg(buf)
    // Grok can fetch public https itself if we failed to re-encode
    return url
  }

  // Relative path via local server (last resort)
  if (url.startsWith('/')) {
    const base = process.env.SOCIALOPS_PUBLIC_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || 'http://127.0.0.1:6061'
    const abs = `${base.replace(/\/$/, '')}${url}`
    const buf = await bufferFromHttp(abs)
    if (buf)
      return await encodeVisionJpeg(buf)
  }

  return null
}

/**
 * Resolve many refs; returns data URLs Grok/9Router can actually see.
 * Order preserved; skips unreadable.
 */
export async function resolveImagesForVision(urls: string[]): Promise<string[]> {
  const unique = [...new Set(urls.map(u => String(u || '').trim()).filter(Boolean))]
  const out: string[] = []
  for (const u of unique.slice(0, 4)) {
    const resolved = await resolveImageForVision(u)
    if (resolved)
      out.push(resolved)
  }
  return out
}
