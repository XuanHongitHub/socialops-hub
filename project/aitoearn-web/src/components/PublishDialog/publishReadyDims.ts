/**
 * Pure publish-ready dimension helpers (no path-alias / store deps).
 * Used by ensurePublishReady and unit tests.
 */

/** Synthetic pixel size from aspect label for prefill when probe fails */
export function dimensionsFromAspectLabel(aspect?: string, longSide = 1920): { width: number, height: number } {
  const a = String(aspect || '9:16').trim()
  const map: Record<string, [number, number]> = {
    '9:16': [1080, 1920],
    '4:5': [1080, 1350],
    '3:4': [1080, 1440],
    '1:1': [1080, 1080],
    '16:9': [1920, 1080],
  }
  const pair = map[a]
  if (pair)
    return { width: pair[0], height: pair[1] }
  const m = a.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/)
  if (m) {
    const w = Number(m[1])
    const h = Number(m[2])
    if (w > 0 && h > 0) {
      if (h >= w)
        return { width: Math.round(longSide * (w / h)), height: longSide }
      return { width: longSide, height: Math.round(longSide * (h / w)) }
    }
  }
  return { width: 1080, height: 1920 }
}

export type VideoDimInput = {
  width?: number
  height?: number
  duration?: number
  size?: number
  path?: string
  name?: string
  cover?: { width?: number, height?: number } | null
}

/**
 * Ensure video has valid portrait-social pixel size for IG/YT checks.
 * Missing probe OR non-portrait ratio → stamp publish-safe dims from aspect hint.
 */
export function normalizeVideoDimsForSocial<T extends VideoDimInput>(
  video: T | undefined,
  aspectHint = '9:16',
): T | undefined {
  if (!video)
    return video
  const fallback = dimensionsFromAspectLabel(aspectHint || '9:16')
  const w = Number(video.width) || 0
  const h = Number(video.height) || 0
  const ratio = h > 0 ? w / h : 0
  const needsFix = !w || !h || ratio < 0.5 || ratio > 0.85
  if (!needsFix)
    return video
  const cover = video.cover
    ? { ...video.cover, width: fallback.width, height: fallback.height }
    : video.cover
  return {
    ...video,
    width: fallback.width,
    height: fallback.height,
    duration: (Number(video.duration) || 0) > 0 ? video.duration : 15,
    cover,
  } as T
}

export type ImageDimInput = {
  width?: number
  height?: number
}

/** TikTok (and similar) hard-min; below this after probe is a real fail. */
export const SOCIAL_IMAGE_MIN_EDGE = 360

/** Default stamp when draft prefill left 0×0 (remote URL not probed yet). */
export const SOCIAL_IMAGE_FALLBACK = { width: 1080, height: 1080 } as const

/**
 * Stamp publish-safe image width/height when missing or below platform min.
 * Prevents false hard fails (e.g. TikTok min 360) after photo-post draft open.
 * Returns same array reference when nothing changed.
 */
export function normalizeImageDimsForPublish<T extends ImageDimInput>(
  images: T[] | undefined,
  fallback: { width: number, height: number } = SOCIAL_IMAGE_FALLBACK,
): T[] | undefined {
  if (!images?.length)
    return images
  let changed = false
  const next = images.map((img) => {
    const w = Number(img.width) || 0
    const h = Number(img.height) || 0
    if (w >= SOCIAL_IMAGE_MIN_EDGE && h >= SOCIAL_IMAGE_MIN_EDGE)
      return img
    changed = true
    return {
      ...img,
      width: w >= SOCIAL_IMAGE_MIN_EDGE ? w : fallback.width,
      height: h >= SOCIAL_IMAGE_MIN_EDGE ? h : fallback.height,
    } as T
  })
  return changed ? next : images
}

/**
 * True when resolution is known AND below min (real fail).
 * Unknown 0×0 must not false-block — use with normalizeImageDimsForPublish.
 */
export function isKnownImageBelowMinResolution(
  width: number | undefined,
  height: number | undefined,
  minEdge = SOCIAL_IMAGE_MIN_EDGE,
): boolean {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (w <= 0 || h <= 0)
    return false
  return w < minEdge || h < minEdge
}
