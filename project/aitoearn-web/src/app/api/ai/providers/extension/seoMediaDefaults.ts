/**
 * Social SEO media defaults — single source of truth for draft-box, browser ext
 * models, and publish-ready dimensions (TikTok / Reels / Shorts first).
 *
 * Mirrors product rules used in:
 * - draftBoxConfigStore (9:16, 15s)
 * - publishReadyDims (1080×1920 portrait stamp)
 * - platformSeoRules (vertical social discovery)
 *
 * Hub can override via SocialsHub settings (see hubMediaSettings.ts).
 */

export type SeoMediaDefaults = {
  /** Primary publish aspect for short-form social */
  aspectRatio: string
  /** Preferred video length (seconds) */
  duration: number
  /** Preferred output resolution label */
  resolution: string
  /** Allowed video durations exposed in model catalogs */
  videoDurations: number[]
  /** Allowed video resolutions */
  videoResolutions: string[]
  /** Allowed video aspect ratios */
  videoAspectRatios: string[]
  /** Allowed image aspect ratios (feed + vertical) */
  imageAspectRatios: string[]
  /** Default image aspect when not vertical-first product still */
  imageAspectRatio: string
  /** Pixel stamp used when probe missing (portrait social) */
  portraitPixels: { width: number, height: number }
  /** Max input reference images for browser / I2V */
  maxInputImages: number
}

/**
 * Product defaults — vertical social first, Flow/VEO-compatible primary duration.
 * Google Flow only offers 6s / 10s (and concat). 15s remains optional for Grok/other.
 * Do not mutate; merge overrides on top.
 */
export const SEO_MEDIA_DEFAULTS: SeoMediaDefaults = {
  aspectRatio: '9:16',
  duration: 10,
  resolution: '1080p',
  videoDurations: [6, 10, 15],
  videoResolutions: ['1080p', '720p'],
  videoAspectRatios: ['9:16', '16:9'],
  imageAspectRatios: ['1:1', '4:5', '9:16', '16:9'],
  imageAspectRatio: '1:1',
  portraitPixels: { width: 1080, height: 1920 },
  maxInputImages: 3,
}

export type SeoMediaDefaultsPatch = Partial<{
  aspectRatio: string
  duration: number
  resolution: string
  videoDurations: number[]
  videoResolutions: string[]
  videoAspectRatios: string[]
  imageAspectRatios: string[]
  imageAspectRatio: string
  maxInputImages: number
}>

function isAspect(s: unknown): s is string {
  return typeof s === 'string' && /^\d+(\.\d+)?\s*:\s*\d+(\.\d+)?$/.test(s.trim())
}

function isRes(s: unknown): s is string {
  return typeof s === 'string' && /^(auto|\d{3,4}p)$/i.test(s.trim())
}

/** Sanitize + merge hub overrides onto SEO product defaults. */
export function mergeSeoMediaDefaults(
  base: SeoMediaDefaults = SEO_MEDIA_DEFAULTS,
  patch?: SeoMediaDefaultsPatch | null,
): SeoMediaDefaults {
  if (!patch || typeof patch !== 'object')
    return { ...base, portraitPixels: { ...base.portraitPixels }, videoDurations: [...base.videoDurations], videoResolutions: [...base.videoResolutions], videoAspectRatios: [...base.videoAspectRatios], imageAspectRatios: [...base.imageAspectRatios] }

  const duration = Number(patch.duration)
  const maxInputImages = Number(patch.maxInputImages)
  const videoDurations = Array.isArray(patch.videoDurations)
    ? patch.videoDurations.map(Number).filter(n => n >= 4 && n <= 60)
    : base.videoDurations
  const videoResolutions = Array.isArray(patch.videoResolutions)
    ? patch.videoResolutions.map(String).filter(isRes)
    : base.videoResolutions
  const videoAspectRatios = Array.isArray(patch.videoAspectRatios)
    ? patch.videoAspectRatios.map(String).filter(isAspect)
    : base.videoAspectRatios
  const imageAspectRatios = Array.isArray(patch.imageAspectRatios)
    ? patch.imageAspectRatios.map(String).filter(isAspect)
    : base.imageAspectRatios

  const aspectRatio = isAspect(patch.aspectRatio) ? patch.aspectRatio.trim() : base.aspectRatio
  const imageAspectRatio = isAspect(patch.imageAspectRatio) ? patch.imageAspectRatio.trim() : base.imageAspectRatio
  const resolution = isRes(patch.resolution) ? patch.resolution.trim() : base.resolution

  // Keep portrait pixel stamp aligned with primary aspect when possible
  const portraitPixels = aspectRatio === '9:16'
    ? { width: 1080, height: 1920 }
    : aspectRatio === '16:9'
      ? { width: 1920, height: 1080 }
      : aspectRatio === '1:1'
        ? { width: 1080, height: 1080 }
        : { ...base.portraitPixels }

  return {
    aspectRatio,
    duration: Number.isFinite(duration) && duration >= 4 && duration <= 60
      ? Math.round(duration)
      : base.duration,
    resolution,
    videoDurations: videoDurations.length ? videoDurations : base.videoDurations,
    videoResolutions: videoResolutions.length ? videoResolutions : base.videoResolutions,
    videoAspectRatios: videoAspectRatios.length ? videoAspectRatios : base.videoAspectRatios,
    imageAspectRatios: imageAspectRatios.length ? imageAspectRatios : base.imageAspectRatios,
    imageAspectRatio,
    portraitPixels,
    maxInputImages: Number.isFinite(maxInputImages) && maxInputImages >= 1 && maxInputImages <= 9
      ? Math.round(maxInputImages)
      : base.maxInputImages,
  }
}

export function videoDefaultsFromSeo(seo: SeoMediaDefaults = SEO_MEDIA_DEFAULTS) {
  return {
    resolution: seo.resolution,
    aspectRatio: seo.aspectRatio,
    duration: seo.duration,
  }
}

export function imageDefaultsFromSeo(seo: SeoMediaDefaults = SEO_MEDIA_DEFAULTS) {
  return {
    aspectRatio: seo.imageAspectRatio,
    maxInputImages: seo.maxInputImages,
    supportedAspectRatios: [...seo.imageAspectRatios],
  }
}
