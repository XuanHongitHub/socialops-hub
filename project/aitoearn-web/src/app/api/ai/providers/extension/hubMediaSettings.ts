/**
 * Persistable Socials Hub media defaults (SEO-aligned + Flow/VEO pack defaults).
 * Stored under %APPDATA%/SocialsHub/media-defaults.json
 */
import { join } from 'node:path'
import { readJson, writeJson } from '@/app/api/ai/providers/_local'
import {
  FLOW_VEO_DEFAULTS,
  mergeFlowVeoDefaults,
  videoOptionToSeconds,
  type FlowVeoDefaults,
} from './flowVeoDefaults'
import {
  SEO_MEDIA_DEFAULTS,
  mergeSeoMediaDefaults,
  type SeoMediaDefaults,
  type SeoMediaDefaultsPatch,
} from './seoMediaDefaults'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const settingsFile = join(appData, 'SocialsHub', 'media-defaults.json')

export type HubMediaSettingsFile = {
  version: 1
  updatedAt?: string
  /** Partial overrides on SEO product defaults */
  overrides: SeoMediaDefaultsPatch
  /**
   * Flow Automation / VEO pack defaults (mirrors extension Settings UI v3.2.x).
   * Used when model is ext:flow:* so Hub does not invent 15s jobs Flow cannot run.
   */
  flowVeo?: Partial<FlowVeoDefaults>
  /**
   * When true, draft generation for browser + grok paths force aspect/duration/resolution
   * from resolved hub defaults if client omits them (never silently invents other ratios).
   */
  applyToDraftGeneration: boolean
  /** Prefer vertical social pack in ext model tags */
  tagSeo: boolean
}

const EMPTY: HubMediaSettingsFile = {
  version: 1,
  overrides: {},
  flowVeo: { ...FLOW_VEO_DEFAULTS },
  applyToDraftGeneration: true,
  tagSeo: true,
}

export async function readHubMediaSettingsFile(): Promise<HubMediaSettingsFile> {
  const raw = await readJson<HubMediaSettingsFile>(settingsFile, EMPTY)
  return {
    version: 1,
    updatedAt: raw.updatedAt,
    overrides: (raw.overrides && typeof raw.overrides === 'object') ? raw.overrides : {},
    flowVeo: mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, raw.flowVeo || null),
    applyToDraftGeneration: raw.applyToDraftGeneration !== false,
    tagSeo: raw.tagSeo !== false,
  }
}

export async function getResolvedHubMediaDefaults(): Promise<{
  defaults: SeoMediaDefaults
  product: SeoMediaDefaults
  flowVeo: FlowVeoDefaults
  settings: HubMediaSettingsFile
}> {
  const settings = await readHubMediaSettingsFile()
  const defaults = mergeSeoMediaDefaults(SEO_MEDIA_DEFAULTS, settings.overrides)
  const flowVeo = mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, settings.flowVeo || null)
  return {
    defaults,
    product: SEO_MEDIA_DEFAULTS,
    flowVeo,
    settings: { ...settings, flowVeo },
  }
}

export async function saveHubMediaSettings(input: {
  overrides?: SeoMediaDefaultsPatch
  flowVeo?: Partial<FlowVeoDefaults>
  applyToDraftGeneration?: boolean
  tagSeo?: boolean
  reset?: boolean
}): Promise<{
  defaults: SeoMediaDefaults
  product: SeoMediaDefaults
  flowVeo: FlowVeoDefaults
  settings: HubMediaSettingsFile
}> {
  if (input.reset) {
    const settings: HubMediaSettingsFile = {
      ...EMPTY,
      flowVeo: { ...FLOW_VEO_DEFAULTS },
      updatedAt: new Date().toISOString(),
    }
    await writeJson(settingsFile, settings)
    return {
      defaults: { ...SEO_MEDIA_DEFAULTS, portraitPixels: { ...SEO_MEDIA_DEFAULTS.portraitPixels }, videoDurations: [...SEO_MEDIA_DEFAULTS.videoDurations], videoResolutions: [...SEO_MEDIA_DEFAULTS.videoResolutions], videoAspectRatios: [...SEO_MEDIA_DEFAULTS.videoAspectRatios], imageAspectRatios: [...SEO_MEDIA_DEFAULTS.imageAspectRatios] },
      product: SEO_MEDIA_DEFAULTS,
      flowVeo: { ...FLOW_VEO_DEFAULTS },
      settings,
    }
  }

  const prev = await readHubMediaSettingsFile()
  const flowVeo = mergeFlowVeoDefaults(
    FLOW_VEO_DEFAULTS,
    { ...(prev.flowVeo || {}), ...(input.flowVeo || {}) },
  )
  const next: HubMediaSettingsFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    overrides: {
      ...prev.overrides,
      ...(input.overrides || {}),
    },
    flowVeo,
    applyToDraftGeneration: input.applyToDraftGeneration ?? prev.applyToDraftGeneration,
    tagSeo: input.tagSeo ?? prev.tagSeo,
  }
  // When Flow/VEO block is saved, keep Hub SEO duration/aspect aligned (Flow has no 15s).
  const syncedOverrides: SeoMediaDefaultsPatch = { ...next.overrides }
  if (input.flowVeo) {
    if (input.flowVeo.defaultVideoOption)
      syncedOverrides.duration = videoOptionToSeconds(flowVeo.defaultVideoOption)
    if (input.flowVeo.aspectRatio === '9:16' || input.flowVeo.aspectRatio === '16:9')
      syncedOverrides.aspectRatio = flowVeo.aspectRatio
    if (flowVeo.autoDownloadQualityVideo === '1080p' || flowVeo.autoDownloadQualityVideo === '720p')
      syncedOverrides.resolution = flowVeo.autoDownloadQualityVideo
  }

  const defaults = mergeSeoMediaDefaults(SEO_MEDIA_DEFAULTS, syncedOverrides)
  next.overrides = {
    aspectRatio: defaults.aspectRatio,
    duration: defaults.duration,
    resolution: defaults.resolution,
    videoDurations: defaults.videoDurations,
    videoResolutions: defaults.videoResolutions,
    videoAspectRatios: defaults.videoAspectRatios,
    imageAspectRatios: defaults.imageAspectRatios,
    imageAspectRatio: defaults.imageAspectRatio,
    maxInputImages: defaults.maxInputImages,
  }
  next.flowVeo = flowVeo
  await writeJson(settingsFile, next)
  return { defaults, product: SEO_MEDIA_DEFAULTS, flowVeo, settings: next }
}
