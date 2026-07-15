/**
 * Extract clean lifestyle stills from a storyboard board document.
 *
 * CRITICAL: raw panel crops often include pink page chrome / FRAME labels.
 * Those leak into R2V and produce pink bars + "document" look in the final video.
 * We only keep on-body/lifestyle panels, inset hard, and reject chrome-heavy crops.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { fetchImageBuffer } from '@/app/api/ai/providers/imagePrep'

export type BoardKeyframe = {
  shotHint: 'S01' | 'S02' | 'S03' | string
  dataUrl: string
  path?: string
  width: number
  height: number
  /** chrome score 0–1 after clean (lower = cleaner) */
  chromeScore: number
  role: 'lifestyle' | 'product_scene' | 'detail'
}

/**
 * Only S02 outdoor worn panel is safe as lifestyle R2V ref.
 * S01/S03 raw crops usually include board chrome and hurt more than they help.
 */
const LIFESTYLE_PANEL_BOXES: Array<{
  shotHint: string
  role: BoardKeyframe['role']
  box: [number, number, number, number]
}> = [
  // Center on woman wearing tee (BOARD-03 left frame col, S02 row)
  { shotHint: 'S02', role: 'lifestyle', box: [0.08, 0.545, 0.155, 0.105] },
  // Optional second angle friends (FRAME 2) — only if clean
  { shotHint: 'S02b', role: 'lifestyle', box: [0.28, 0.545, 0.155, 0.105] },
]

/** Inset fraction after raw crop to kill pink borders / UI chrome */
const EDGE_INSET = 0.14

/**
 * Score pink/magenta document chrome in edge strips (0 = clean, 1 = full chrome).
 */
export async function scorePinkChrome(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf)
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height
  const band = 4
  let pink = 0
  let total = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x < band || y < band || x >= w - band || y >= h - band
      if (!edge)
        continue
      const i = (y * w + x) * 3
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
      total++
      // Magenta/pink board accents + near-white page margin
      const isPink = r > 180 && b > 140 && g < 160 && r > g + 30
      const isWhiteMargin = r > 240 && g > 240 && b > 240
      if (isPink || isWhiteMargin)
        pink++
    }
  }
  return total ? pink / total : 0
}

async function cleanCropToDataUrl(raw: Buffer): Promise<{
  dataUrl: string
  buf: Buffer
  width: number
  height: number
  chromeScore: number
} | null> {
  const meta = await sharp(raw).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w < 48 || h < 48)
    return null

  const ix = Math.max(2, Math.floor(w * EDGE_INSET))
  const iy = Math.max(2, Math.floor(h * EDGE_INSET))
  const cw = Math.max(32, w - ix * 2)
  const ch = Math.max(32, h - iy * 2)

  let cleaned = await sharp(raw)
    .extract({ left: ix, top: iy, width: cw, height: ch })
    .rotate()
    .resize({ width: 1024, height: 1280, fit: 'cover' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer()

  let chromeScore = await scorePinkChrome(cleaned)
  // Second inset if still chrome-y
  if (chromeScore > 0.12) {
    const m2 = await sharp(cleaned).metadata()
    const w2 = m2.width || 0
    const h2 = m2.height || 0
    const ix2 = Math.floor(w2 * 0.1)
    const iy2 = Math.floor(h2 * 0.1)
    cleaned = await sharp(cleaned)
      .extract({
        left: ix2,
        top: iy2,
        width: Math.max(32, w2 - ix2 * 2),
        height: Math.max(32, h2 - iy2 * 2),
      })
      .resize({ width: 1024, height: 1280, fit: 'cover' })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
    chromeScore = await scorePinkChrome(cleaned)
  }

  // Reject still-dirty crops — better no lifestyle ref than pink bars in video
  if (chromeScore > 0.22)
    return null

  const cm = await sharp(cleaned).metadata()
  return {
    dataUrl: `data:image/jpeg;base64,${cleaned.toString('base64')}`,
    buf: cleaned,
    width: cm.width || 1024,
    height: cm.height || 1280,
    chromeScore,
  }
}

export async function extractBoardKeyframes(input: {
  boardImageUrl: string
  persist?: boolean
}): Promise<BoardKeyframe[]> {
  const buf = await fetchImageBuffer(input.boardImageUrl)
  const meta = await sharp(buf).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w < 200 || h < 200)
    return []
  if (h < w * 1.2)
    return []

  const out: BoardKeyframe[] = []
  const workDir = join(homedir(), 'AppData', 'Roaming', 'SocialsHub', 'board-keyframes')
  if (input.persist)
    await mkdir(workDir, { recursive: true }).catch(() => null)

  for (const panel of LIFESTYLE_PANEL_BOXES) {
    const [lx, ty, bw, bh] = panel.box
    const left = Math.max(0, Math.floor(w * lx))
    const top = Math.max(0, Math.floor(h * ty))
    const width = Math.min(w - left, Math.floor(w * bw))
    const height = Math.min(h - top, Math.floor(h * bh))
    if (width < 40 || height < 40)
      continue

    try {
      const rawCrop = await sharp(buf)
        .extract({ left, top, width, height })
        .toBuffer()
      const cleaned = await cleanCropToDataUrl(rawCrop)
      if (!cleaned)
        continue

      let path: string | undefined
      if (input.persist) {
        path = join(workDir, `${panel.shotHint}-clean-${randomUUID().slice(0, 8)}.jpg`)
        await writeFile(path, cleaned.buf)
      }
      out.push({
        shotHint: panel.shotHint,
        dataUrl: cleaned.dataUrl,
        path,
        width: cleaned.width,
        height: cleaned.height,
        chromeScore: cleaned.chromeScore,
        role: panel.role,
      })
    }
    catch (e) {
      console.warn('[storyboard] keyframe crop failed', panel.shotHint, e)
    }
  }

  // Prefer lowest chrome, lifestyle role, max 2
  return out
    .sort((a, b) => a.chromeScore - b.chromeScore)
    .slice(0, 2)
}

/** Best lifestyle still for try-on R2V (never chrome-y board docs). */
export function bestLifestyleKeyframe(keyframes: BoardKeyframe[]): BoardKeyframe | undefined {
  return keyframes
    .filter(k => k.role === 'lifestyle' && k.chromeScore <= 0.22)
    .sort((a, b) => a.chromeScore - b.chromeScore)[0]
}

export function keyframeForShot(
  keyframes: BoardKeyframe[],
  shotId: string,
): BoardKeyframe | undefined {
  // Onbody beats: always prefer clean lifestyle, ignore S01 chrome panels
  if (/S02|onbody|walk|public/i.test(shotId))
    return bestLifestyleKeyframe(keyframes)
  const id = String(shotId || '').toUpperCase()
  const byHint = keyframes.find(k => id.includes(String(k.shotHint).toUpperCase()))
  if (byHint && byHint.chromeScore <= 0.22)
    return byHint
  return bestLifestyleKeyframe(keyframes)
}
