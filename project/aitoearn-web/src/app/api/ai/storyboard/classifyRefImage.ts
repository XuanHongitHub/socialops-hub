/**
 * Classify ref images so storyboard I2V never uses a BOARD/info deck as hero.
 * Pure helpers + buffer heuristics (text density / chrome keywords).
 */
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { getLocalUploadAsset } from '@/app/api/assets/_local'
import { getAssets } from '@/app/api/ai/providers/_local'

export type RefImageRole = 'product_hero' | 'board_plan' | 'lifestyle' | 'unknown'

export type ClassifiedRef = {
  url: string
  role: RefImageRole
  confidence: number
  reasons: string[]
  width?: number
  height?: number
}

const BOARD_KEYWORDS = [
  'BOARD-',
  'BOARD_',
  'HERO DETAILS',
  'PRODUCTION NOTES',
  'DO NOT',
  'CALL TO ACTION',
  'EMOTIONAL JOB',
  'EMOTIONAL OPENINGS',
  'ON-FRAME ACTION',
  'CROSSING MEMORIES',
  'WEAR THE MEMORY',
  'STORYBOARD',
  'FRAME 1',
  'FRAME 2',
  'FRAME 3',
  'S01',
  'S02',
  'S03',
  '0.0s-',
  '3.3s-',
  '6.7s-',
  'AUDIO LOGO',
  'BGM:',
  'AMBIENT:',
]

/** Fast ASCII scrape from raw bytes (sparse sample — full PNG scan is too slow). */
export function scrapeAsciiHints(buf: Buffer): string {
  const max = Math.min(buf.length, 400_000)
  const step = buf.length > max ? Math.floor(buf.length / max) : 1
  let out = ''
  for (let i = 0; i < buf.length && out.length < 12_000; i += step) {
    const c = buf[i]!
    if (c >= 32 && c <= 126)
      out += String.fromCharCode(c)
    else if (out.length && !out.endsWith(' '))
      out += ' '
  }
  return out.replace(/\s+/g, ' ').slice(0, 12_000)
}

export function scoreBoardChrome(text: string): { score: number, hits: string[] } {
  const upper = text.toUpperCase()
  const hits: string[] = []
  let score = 0
  for (const kw of BOARD_KEYWORDS) {
    if (upper.includes(kw.toUpperCase())) {
      hits.push(kw)
      score += kw.length > 8 ? 2 : 1
    }
  }
  // Dense multi-panel storyboard docs often have many short time codes
  const timeCodes = upper.match(/\d+\.\d+S\s*[-~]\s*\d+/g)
  if (timeCodes && timeCodes.length >= 2) {
    hits.push('time_codes')
    score += 3
  }
  return { score, hits }
}

export function classifyFromHints(input: {
  url: string
  ascii?: string
  width?: number
  height?: number
}): ClassifiedRef {
  const reasons: string[] = []
  const { score, hits } = scoreBoardChrome(input.ascii || '')
  if (hits.length)
    reasons.push(`chrome:${hits.slice(0, 6).join(',')}`)

  const w = input.width || 0
  const h = input.height || 0
  const aspect = w > 0 && h > 0 ? w / h : 0
  // Full-page decks are tall (BOARD-03 was ~941x1672). Product flats are often square.
  const tallDoc = w > 0 && h > 0 && h >= w * 1.45 && (h >= 1200 || w >= 700)
  if (tallDoc)
    reasons.push('tall_document')

  // Strong chrome keywords (ASCII scrape works when text is in file metadata;
  // pixel-rendered UI still caught by tallDoc for storyboard pages).
  if (score >= 4 || (score >= 2 && tallDoc)) {
    return {
      url: input.url,
      role: 'board_plan',
      confidence: Math.min(0.99, 0.72 + score * 0.04 + (tallDoc ? 0.1 : 0)),
      reasons,
      width: w || undefined,
      height: h || undefined,
    }
  }

  // Tall multi-panel storyboard pages without extractable ASCII still look like docs
  if (tallDoc && score >= 1) {
    return {
      url: input.url,
      role: 'board_plan',
      confidence: 0.78,
      reasons,
      width: w,
      height: h,
    }
  }
  if (tallDoc && h >= 1500 && aspect <= 0.62) {
    // Very tall portrait page → almost always a design board, not a product flat
    return {
      url: input.url,
      role: 'board_plan',
      confidence: 0.82,
      reasons: [...reasons, 'very_tall_page'],
      width: w,
      height: h,
    }
  }

  // Square / mild portrait product photos
  if (w > 0 && h > 0 && aspect >= 0.72 && aspect <= 1.4) {
    reasons.push('product_aspect')
    return {
      url: input.url,
      role: 'product_hero',
      confidence: score >= 2 ? 0.6 : 0.88,
      reasons,
      width: w,
      height: h,
    }
  }

  // 9:16 on-body product (tall but not "document height")
  if (w > 0 && h > 0 && aspect >= 0.5 && aspect < 0.72 && h < 1500) {
    reasons.push('portrait_product')
    return {
      url: input.url,
      role: 'product_hero',
      confidence: 0.7,
      reasons,
      width: w,
      height: h,
    }
  }

  if (tallDoc) {
    return {
      url: input.url,
      role: 'board_plan',
      confidence: 0.75,
      reasons,
      width: w,
      height: h,
    }
  }

  reasons.push('unknown_default_product_bias')
  return {
    url: input.url,
    role: 'product_hero',
    confidence: 0.55,
    reasons,
    width: w || undefined,
    height: h || undefined,
  }
}

async function loadBuffer(url: string): Promise<Buffer | null> {
  const u = String(url || '').trim()
  if (!u)
    return null
  if (u.startsWith('data:')) {
    const b64 = u.split(',')[1]
    return b64 ? Buffer.from(b64, 'base64') : null
  }
  const upload = u.match(/\/api\/assets\/([^/?#]+)\/file/i)
  if (upload?.[1]) {
    const a = await getLocalUploadAsset(upload[1])
    if (a?.path)
      return readFile(a.path).catch(() => null)
  }
  const ai = u.match(/\/api\/ai\/assets\/([^/?#]+)\/file/i)
  if (ai?.[1]) {
    const list = await getAssets()
    const a = list.find(x => x.id === ai[1])
    if (a?.path)
      return readFile(a.path).catch(() => null)
  }
  if (/^https?:\/\//i.test(u)) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok)
        return null
      return Buffer.from(await res.arrayBuffer())
    }
    catch {
      return null
    }
  }
  if (u.startsWith('/')) {
    const base = process.env.SOCIALOPS_PUBLIC_URL || 'http://127.0.0.1:6061'
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}${u}`, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok)
        return null
      return Buffer.from(await res.arrayBuffer())
    }
    catch {
      return null
    }
  }
  return null
}

export async function classifyRefImage(url: string): Promise<ClassifiedRef> {
  const buf = await loadBuffer(url)
  if (!buf?.length) {
    return {
      url,
      role: 'unknown',
      confidence: 0.2,
      reasons: ['unreadable'],
    }
  }
  let width = 0
  let height = 0
  try {
    const meta = await sharp(buf).metadata()
    width = meta.width || 0
    height = meta.height || 0
  }
  catch {
    // ignore
  }
  const ascii = scrapeAsciiHints(buf)
  return classifyFromHints({ url, ascii, width, height })
}

export async function classifyRefImages(urls: string[]): Promise<ClassifiedRef[]> {
  const unique = [...new Set(urls.map(u => String(u || '').trim()).filter(Boolean))]
  const out: ClassifiedRef[] = []
  for (const u of unique)
    out.push(await classifyRefImage(u))
  return out
}

/**
 * Pick I2V hero: never board_plan. Prefer highest-confidence product_hero.
 */
export function pickStoryboardHero(classified: ClassifiedRef[]): {
  hero: ClassifiedRef | null
  errorCode?: 'NO_PRODUCT' | 'HERO_WAS_BOARD' | 'NO_IMAGES'
  rejectedBoards: ClassifiedRef[]
} {
  if (!classified.length)
    return { hero: null, errorCode: 'NO_IMAGES', rejectedBoards: [] }

  const boards = classified.filter(c => c.role === 'board_plan')
  const products = classified
    .filter(c => c.role === 'product_hero' || c.role === 'lifestyle' || c.role === 'unknown')
    .filter(c => c.role !== 'board_plan')
    // Prefer product_hero, then closer-to-square (flat-lay), then confidence
    .sort((a, b) => {
      const rank = (r: RefImageRole) => (r === 'product_hero' ? 3 : r === 'lifestyle' ? 2 : 1)
      const sq = (c: ClassifiedRef) => {
        if (!c.width || !c.height)
          return 0
        const ar = c.width / c.height
        return 1 - Math.min(1, Math.abs(Math.log(ar)))
      }
      return rank(b.role) - rank(a.role) || sq(b) - sq(a) || b.confidence - a.confidence
    })

  if (!products.length) {
    return {
      hero: null,
      errorCode: boards.length ? 'HERO_WAS_BOARD' : 'NO_PRODUCT',
      rejectedBoards: boards,
    }
  }

  return {
    hero: products[0]!,
    rejectedBoards: boards,
  }
}
