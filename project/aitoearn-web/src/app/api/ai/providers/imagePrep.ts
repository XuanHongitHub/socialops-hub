/**
 * Preprocess product reference images before image-to-video.
 * xAI / Grok I2V will warp the whole frame when aspect_ratio differs from the source.
 * Letterbox with fit:contain + clean studio gradient fill (never blurred product bands).
 */
import sharp from 'sharp'

const ASPECT_MAP: Record<string, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
}

export function parseAspectRatioLabel(label: string): number | null {
  const key = String(label || '').trim()
  if (ASPECT_MAP[key])
    return ASPECT_MAP[key]
  const m = key.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/)
  if (!m)
    return null
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    return null
  return w / h
}

/** Nearest common social aspect from image width/height. */
export function nearestAspectLabel(width: number, height: number): string {
  if (!width || !height)
    return '3:4'
  const r = width / height
  const candidates: Array<[string, number]> = [
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['3:4', 3 / 4],
    ['9:16', 9 / 16],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
  ]
  let best = candidates[0]![0]
  let bestDist = Infinity
  for (const [label, value] of candidates) {
    const d = Math.abs(Math.log(r / value))
    if (d < bestDist) {
      bestDist = d
      best = label
    }
  }
  return best
}

/**
 * Pick I2V aspect for product photos.
 * Default (force=false): follow source photo → no pad/blur, never stretch.
 * force=true: honor requested (e.g. 9:16 Reels) via letterbox pad later — still never stretch.
 */
export function pickProductVideoAspect(
  requested: string | undefined,
  sourceWidth?: number,
  sourceHeight?: number,
  options?: { force?: boolean },
): string {
  const req = String(requested || '').trim()
  const force = Boolean(options?.force)
  const sourceLabel = sourceWidth && sourceHeight
    ? nearestAspectLabel(sourceWidth, sourceHeight)
    : ''

  // Forced target (Reels 9:16 etc.) — letterbox will pad; geometry lock forbids stretch.
  if (force && req && ASPECT_MAP[req])
    return req

  // Default: native source aspect (no letterbox fog).
  if (sourceLabel === '9:16' || sourceLabel === '2:3')
    return sourceLabel === '2:3' ? '9:16' : sourceLabel
  if (sourceLabel === '1:1' || sourceLabel === '4:3' || sourceLabel === '16:9')
    return sourceLabel === '1:1' ? '1:1' : (sourceLabel === '16:9' ? '16:9' : '4:3')
  if (sourceLabel === '3:4' || sourceLabel === '4:5')
    return sourceLabel

  // No probe: respect explicit request, else mild portrait commerce default
  if (req && ASPECT_MAP[req])
    return req
  return '3:4'
}

/**
 * Load image bytes from data URL, local SocialOps asset path, or remote http(s).
 * Relative `/api/assets/...` and `/api/ai/assets/...` are resolved from disk — xAI
 * cannot fetch localhost paths.
 */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const trimmed = String(url || '').trim()
  if (!trimmed)
    throw new Error('Empty product reference image URL')

  if (trimmed.startsWith('data:')) {
    const base64 = trimmed.split(',')[1]
    if (!base64)
      throw new Error('Invalid data URL for product reference')
    return Buffer.from(base64, 'base64')
  }

  // Local user upload: /api/assets/:id/file
  const uploadMatch = trimmed.match(/\/api\/assets\/([^/?#]+)\/file/i)
  if (uploadMatch?.[1]) {
    const { getLocalUploadAsset } = await import('@/app/api/assets/_local')
    const { readFile } = await import('node:fs/promises')
    const asset = await getLocalUploadAsset(uploadMatch[1])
    if (!asset?.path)
      throw new Error(`Local upload not found: ${uploadMatch[1]}`)
    const buf = await readFile(asset.path)
    if (!buf.length)
      throw new Error('Local upload file is empty')
    return buf
  }

  // Generated AI asset: /api/ai/assets/:id/file
  const aiMatch = trimmed.match(/\/api\/ai\/assets\/([^/?#]+)\/file/i)
  if (aiMatch?.[1]) {
    const { getAssets } = await import('@/app/api/ai/providers/_local')
    const { readFile } = await import('node:fs/promises')
    const asset = (await getAssets()).find(a => a.id === aiMatch[1])
    if (!asset?.path)
      throw new Error(`AI asset not found: ${aiMatch[1]}`)
    const buf = await readFile(asset.path)
    if (!buf.length)
      throw new Error('AI asset file is empty')
    return buf
  }

  // Absolute or relative URL
  let fetchUrl = trimmed
  if (trimmed.startsWith('/')) {
    const base = process.env.SOCIALOPS_PUBLIC_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || 'http://127.0.0.1:6061'
    fetchUrl = `${base.replace(/\/$/, '')}${trimmed}`
  }
  if (!/^https?:\/\//i.test(fetchUrl))
    throw new Error(`Unsupported product reference URL: ${trimmed.slice(0, 80)}`)

  const response = await fetch(fetchUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok)
    throw new Error(`Failed to fetch product reference image: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length)
    throw new Error('Product reference image download was empty')
  return bytes
}

export type PreparedProductRef = {
  /** data:image/jpeg;base64,... ready for xAI image field */
  dataUrl: string
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  aspectRatio: string
  letterboxed: boolean
}

/**
 * Average RGB from a downscaled sample — used for clean studio fill (no blur bars).
 */
async function sampleStudioColor(buf: Buffer): Promise<{ r: number, g: number, b: number }> {
  try {
    const stats = await sharp(buf).stats()
    // Prefer mean of edges-ish: stats mean is whole image; lighten slightly for studio look
    const r = Math.min(255, Math.round((stats.channels[0]?.mean ?? 240) * 0.92 + 18))
    const g = Math.min(255, Math.round((stats.channels[1]?.mean ?? 240) * 0.92 + 18))
    const b = Math.min(255, Math.round((stats.channels[2]?.mean ?? 240) * 0.92 + 18))
    return { r, g, b }
  }
  catch {
    return { r: 245, g: 245, b: 247 }
  }
}

function evenDim(n: number) {
  const v = Math.max(64, Math.round(n))
  return v - (v % 2)
}

/** High-quality encode for I2V refs — avoid mushy jpeg + chroma smear (faces look blurry). */
async function encodeI2vJpeg(pipeline: sharp.Sharp) {
  return pipeline
    .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.3 })
    .jpeg({
      quality: 95,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
      trellisQuantisation: true,
      overshootDeringing: true,
    })
    .toBuffer()
}

/**
 * Resize with fit:contain onto a clean studio fill (solid/gradient from image color).
 * Product never stretches. Avoids heavy blur top/bottom bands that I2V turns into fog.
 * Prefers max detail (1536 long side, lanczos3, 4:4:4 JPEG) so Grok I2V starts sharp.
 */
export async function prepareProductRefForI2V(
  imageUrl: string,
  aspectRatio: string,
  options?: { maxSide?: number },
): Promise<PreparedProductRef> {
  // Higher default side = less mush after I2V motion. Cap 1536 for payload size.
  const maxSide = Math.min(1536, Math.max(960, options?.maxSide || 1536))
  const ratio = parseAspectRatioLabel(aspectRatio) || (9 / 16)

  const sourceBuf = await fetchImageBuffer(imageUrl)
  const meta = await sharp(sourceBuf).metadata()
  const sourceWidth = meta.width || maxSide
  const sourceHeight = meta.height || maxSide
  const sourceRatio = sourceWidth / Math.max(1, sourceHeight)

  // Frame canvas from aspect + maxSide
  let canvasW: number
  let canvasH: number
  if (ratio >= 1) {
    canvasW = maxSide
    canvasH = Math.max(64, Math.round(maxSide / ratio))
  }
  else {
    canvasH = maxSide
    canvasW = Math.max(64, Math.round(maxSide * ratio))
  }
  canvasW = evenDim(canvasW)
  canvasH = evenDim(canvasH)

  const targetRatio = canvasW / canvasH
  const ratioDiff = Math.abs(Math.log(sourceRatio / targetRatio))
  // ~5% tolerance: skip pad if already close
  const needsLetterbox = ratioDiff > 0.05

  let out: Buffer
  let targetW = canvasW
  let targetH = canvasH

  if (!needsLetterbox) {
    // Near-match: keep as much native resolution as possible (only downscale if > maxSide).
    // Upscaling soft product shots makes I2V blurrier — never enlarge.
    const srcLong = Math.max(sourceWidth, sourceHeight)
    const scale = srcLong > maxSide ? maxSide / srcLong : 1
    targetW = evenDim(sourceWidth * scale)
    targetH = evenDim(sourceHeight * scale)
    // Nudge to requested aspect via cover crop only when slightly off
    if (ratioDiff > 0.01) {
      targetW = canvasW
      targetH = canvasH
      out = await encodeI2vJpeg(
        sharp(sourceBuf).resize(targetW, targetH, {
          fit: 'cover',
          position: 'centre',
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: false,
        }),
      )
    }
    else {
      out = await encodeI2vJpeg(
        sharp(sourceBuf).resize(targetW, targetH, {
          fit: 'fill',
          kernel: sharp.kernel.lanczos3,
        }),
      )
    }
  }
  else {
    // Clean studio pad — NOT blurred product copy (blur bars → I2V fog top/bottom).
    const color = await sampleStudioColor(sourceBuf)
    const top = {
      r: Math.min(255, color.r + 12),
      g: Math.min(255, color.g + 12),
      b: Math.min(255, color.b + 12),
    }
    const bot = {
      r: Math.max(0, color.r - 8),
      g: Math.max(0, color.g - 8),
      b: Math.max(0, color.b - 8),
    }
    const svg = Buffer.from(
      `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgb(${top.r},${top.g},${top.b})"/>
            <stop offset="45%" stop-color="rgb(${color.r},${color.g},${color.b})"/>
            <stop offset="100%" stop-color="rgb(${bot.r},${bot.g},${bot.b})"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
      </svg>`,
    )
    const background = await sharp(svg).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()

    // Fill ~94% of frame — thin pads, max product pixels (sharper detail for I2V)
    const maxProductW = evenDim(canvasW * 0.96)
    const maxProductH = evenDim(canvasH * 0.94)
    const foreground = await sharp(sourceBuf)
      .resize(maxProductW, maxProductH, {
        fit: 'inside',
        // Never upscale soft catalog thumbs — better slightly smaller + sharp
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()

    out = await encodeI2vJpeg(
      sharp(background).composite([{ input: foreground, gravity: 'centre' }]),
    )
    targetW = canvasW
    targetH = canvasH
  }

  const dataUrl = `data:image/jpeg;base64,${out.toString('base64')}`
  return {
    dataUrl,
    width: targetW,
    height: targetH,
    sourceWidth,
    sourceHeight,
    aspectRatio,
    letterboxed: needsLetterbox,
  }
}

/** Probe dimensions only (for aspect pick before letterbox). */
export async function probeImageSize(imageUrl: string): Promise<{ width: number, height: number } | null> {
  try {
    const buf = await fetchImageBuffer(imageUrl)
    const meta = await sharp(buf).metadata()
    if (!meta.width || !meta.height)
      return null
    return { width: meta.width, height: meta.height }
  }
  catch {
    return null
  }
}
