/**
 * Pure browser-extension model catalog helpers (no HTTP, no CDP).
 * Defaults follow Social SEO product baseline (9:16 · 15s · 1080p).
 * Hub overrides are injected by callers via `options.seo` (see hubMediaSettings).
 */
import type { AutomationPack } from './registry'
import type { SeoMediaDefaults } from './seoMediaDefaults'

/** Fallback when caller does not inject hub-resolved SEO (must match SEO_MEDIA_DEFAULTS). */
const SEO_FALLBACK: SeoMediaDefaults = {
  aspectRatio: '9:16',
  duration: 15,
  resolution: '1080p',
  videoDurations: [8, 15],
  videoResolutions: ['1080p', '720p'],
  videoAspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
  imageAspectRatios: ['1:1', '4:5', '9:16', '16:9'],
  imageAspectRatio: '1:1',
  portraitPixels: { width: 1080, height: 1920 },
  maxInputImages: 3,
}

export type BrowserModelEntry = {
  name: string
  description: string
  channel: 'browser'
  modes: string[]
  resolutions: string[]
  durations: number[]
  maxInputImages: number
  aspectRatios: string[]
  tags: string[]
  defaults: { resolution?: string, aspectRatio?: string, duration?: number }
  pricing: Array<{ duration: number, price: number, resolution: string }>
  packId: string
  platform: string
  capability: 'video' | 'image' | 'chat'
  seo?: {
    aspectRatio: string
    duration: number
    resolution: string
    portraitPixels: { width: number, height: number }
  }
}

export function parseExtModel(model: string): {
  platform: string
  capability: 'video' | 'image' | 'chat'
  packId: string
} | null {
  const m = String(model || '').trim()
  const hit = /^ext:([a-z0-9_-]+):(video|image|chat)$/i.exec(m)
  if (!hit)
    return null
  const platform = hit[1]!.toLowerCase()
  const capability = hit[2]!.toLowerCase() as 'video' | 'image' | 'chat'
  return {
    platform,
    capability,
    packId: `${platform}-automation`,
  }
}

export type BuildBrowserCatalogOptions = {
  seo?: SeoMediaDefaults
  tagSeo?: boolean
}

/** Build catalog from pack list (inject listAutomationPacks() at call site). */
export function buildBrowserModelCatalogFromPacks(
  packs: AutomationPack[],
  options?: BuildBrowserCatalogOptions,
): {
  videoModels: BrowserModelEntry[]
  imageModels: Array<{
    model: string
    displayName: string
    supportedAspectRatios: string[]
    maxInputImages: number
    tags: string[]
    pricing: Array<{ resolution: string, pricePerImage: number }>
    defaults?: { aspectRatio?: string }
    seo?: { aspectRatio: string }
  }>
  seo: SeoMediaDefaults
} {
  const seo = options?.seo || SEO_FALLBACK
  const tagSeo = options?.tagSeo !== false
  const vDef = {
    resolution: seo.resolution,
    aspectRatio: seo.aspectRatio,
    duration: seo.duration,
  }
  const iAspect = seo.imageAspectRatio
  const iRatios = [...seo.imageAspectRatios]

  const niche = packs.filter(p => p.role === 'niche' && p.packageStatus === 'verified')
  const videoModels: BrowserModelEntry[] = []
  const imageModels: Array<{
    model: string
    displayName: string
    supportedAspectRatios: string[]
    maxInputImages: number
    tags: string[]
    pricing: Array<{ resolution: string, pricePerImage: number }>
    defaults?: { aspectRatio?: string }
    seo?: { aspectRatio: string }
  }> = []

  for (const pack of niche) {
    const platform = pack.id.replace(/-automation$/, '')
    if (pack.capabilities.includes('video')) {
      videoModels.push({
        name: `ext:${platform}:video`,
        description: `${pack.shortName} via Browser — Social SEO default ${seo.aspectRatio} · ${seo.duration}s · ${seo.resolution}`,
        channel: 'browser',
        modes: ['text-to-video', 'image-to-video', 'image2video', 'image_to_video'],
        resolutions: [...seo.videoResolutions],
        durations: [...seo.videoDurations],
        maxInputImages: seo.maxInputImages,
        aspectRatios: [...seo.videoAspectRatios],
        tags: [
          'Browser',
          'Experimental',
          pack.shortName,
          'CDP+Ext',
          ...(tagSeo ? ['SEO', seo.aspectRatio, `${seo.duration}s`] : []),
        ],
        defaults: { ...vDef },
        pricing: seo.videoDurations.map(duration => ({
          duration,
          price: 0,
          resolution: seo.resolution,
        })),
        packId: pack.id,
        platform,
        capability: 'video',
        seo: {
          aspectRatio: seo.aspectRatio,
          duration: seo.duration,
          resolution: seo.resolution,
          portraitPixels: { ...seo.portraitPixels },
        },
      })
    }
    if (pack.capabilities.includes('image')) {
      imageModels.push({
        model: `ext:${platform}:image`,
        displayName: `${pack.shortName} Browser Image (SEO · ${iAspect})`,
        supportedAspectRatios: iRatios,
        maxInputImages: seo.maxInputImages,
        tags: [
          'Browser',
          'Experimental',
          pack.shortName,
          ...(tagSeo ? ['SEO'] : []),
        ],
        pricing: [{ resolution: 'auto', pricePerImage: 0 }],
        defaults: { aspectRatio: iAspect },
        seo: { aspectRatio: iAspect },
      })
    }
  }

  return { videoModels, imageModels, seo }
}
