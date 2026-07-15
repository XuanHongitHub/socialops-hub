/**
 * Flow / VEO Automation (v3.2.x) defaults — aligned with extension Settings UI:
 * Default Mode, Model, Image Model, Aspect Ratio, Video Option (6s/10s/concat),
 * Image Mode, Max Retries, Auto Download Quality, Language.
 *
 * Google Flow does NOT support 15s clips. Hub SEO used to force 15s which
 * desynced draft-box / bridge from the pack the user actually runs.
 */

export const FLOW_VEO_PACK_VERSION = '3.2.1'

/** Video length options exposed in Flow Automation settings */
export type FlowVideoOption = '6s' | '10s' | '6sConcat' | '10sConcat'

export type FlowDefaultMode =
  | 'textToVideo'
  | 'imageToVideo'
  | 'componentsToVideo'

export type FlowImageModeOption = 'createNew' | 'concat'

export type FlowDownloadVideoQuality = '720p' | '1080p' | '4K'
export type FlowDownloadImageQuality = '1K' | '2K' | '4K'

export type FlowVeoDefaults = {
  packVersion: string
  /** Default mode when creating new videos (extension Default Mode) */
  defaultMode: FlowDefaultMode
  /** Video model label as shown in Flow UI (empty = pack/UI default) */
  model: string
  /** Image model for text-to-image (empty = pack/UI default) */
  imageModel: string
  /** 9:16 (Shorts/Reels) or 16:9 (YouTube) */
  aspectRatio: '9:16' | '16:9'
  /** Default duration setting for prompts */
  defaultVideoOption: FlowVideoOption
  /** Default input mode for image prompts; last prompt always New Image in pack */
  defaultImageModeOption: FlowImageModeOption
  /** Retry video generation on failure (1–20); pack default 5 */
  maxRetries: number
  autoDownloadQualityVideo: FlowDownloadVideoQuality
  autoDownloadQualityImage: FlowDownloadImageQuality
  language: string
  /**
   * Outputs per prompt — pack default is 2; Hub forces 1 (same for ChatGPT/Gemini/Grok image).
   */
  outputCount: number
  /**
   * Concurrent prompts (parallel streams) — pack “Concurrent Prompts”.
   * Default 1 (safe). Raise to test multi-stream (1–6 typical in pack UI).
   */
  concurrentPrompts: number
  /** Random delay before next prompt (seconds) — pack Settings “Random Delay” */
  promptDelaySecondsMin: number
  promptDelaySecondsMax: number
}

/**
 * Product baseline = Flow Automation Settings panel (v3.2.x / Max Plan).
 * Maps 1:1 to pack chrome.storage keys (see extensionSettingsPush).
 *
 * - Chế độ mặc định → defaultMode
 * - Mô hình / Mô hình hình ảnh → model / imageModel
 * - Tỷ lệ khung hình → aspectRatio (9:16 vertical social)
 * - Tùy chọn video → defaultVideoOption (10s; Flow không có 15s)
 * - Tùy chọn chế độ ảnh → defaultImageModeOption (Ảnh mới)
 * - Số lần thử lại → maxRetries (5)
 * - Chất lượng DL video/ảnh → autoDownload*
 * - Ngôn ngữ → language (vi)
 */
export const FLOW_VEO_DEFAULTS: FlowVeoDefaults = {
  packVersion: FLOW_VEO_PACK_VERSION,
  defaultMode: 'textToVideo',
  model: 'Veo 3.1 - Lite',
  imageModel: '🍌 Nano Banana 2',
  aspectRatio: '9:16',
  defaultVideoOption: '10s',
  defaultImageModeOption: 'createNew',
  maxRetries: 5,
  autoDownloadQualityVideo: '1080p',
  autoDownloadQualityImage: '1K',
  language: 'vi',
  outputCount: 1,
  concurrentPrompts: 1,
  /**
   * Stable multi-seat defaults — reduce Flow “unusual activity” flags.
   * Prefer 1 concurrent + generous delay over speed.
   */
  promptDelaySecondsMin: 30,
  promptDelaySecondsMax: 60,
}

const VIDEO_OPTIONS = new Set<string>(['6s', '10s', '6sConcat', '10sConcat'])
const MODES = new Set<string>(['textToVideo', 'imageToVideo', 'componentsToVideo'])
const IMAGE_MODES = new Set<string>(['createNew', 'concat'])
const VQ = new Set<string>(['720p', '1080p', '4K'])
const IQ = new Set<string>(['1K', '2K', '4K'])

export function videoOptionToSeconds(opt: FlowVideoOption | string): number {
  const s = String(opt || '')
  if (s.startsWith('6'))
    return 6
  if (s.startsWith('10') || s.startsWith('8'))
    return 10
  return 10
}

/** Map arbitrary seconds → nearest Flow video option (never 15). */
export function secondsToFlowVideoOption(seconds: number): FlowVideoOption {
  const n = Number(seconds)
  if (!Number.isFinite(n))
    return '10s'
  return n <= 7 ? '6s' : '10s'
}

/** Clamp duration for Flow/VEO models — only 6 or 10 seconds. */
export function clampFlowDurationSeconds(seconds: number | undefined | null): number {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n <= 0)
    return videoOptionToSeconds(FLOW_VEO_DEFAULTS.defaultVideoOption)
  return n <= 7 ? 6 : 10
}

export function mergeFlowVeoDefaults(
  base: FlowVeoDefaults = FLOW_VEO_DEFAULTS,
  patch?: Partial<FlowVeoDefaults> | null,
): FlowVeoDefaults {
  if (!patch || typeof patch !== 'object')
    return { ...base }

  const maxRetries = Number(patch.maxRetries)
  const outputCount = Number(patch.outputCount)
  const concurrentPrompts = Number(patch.concurrentPrompts)
  let delayMin = Number(patch.promptDelaySecondsMin)
  let delayMax = Number(patch.promptDelaySecondsMax)
  const aspect = String(patch.aspectRatio || base.aspectRatio).trim()
  const videoOpt = String(patch.defaultVideoOption || base.defaultVideoOption).trim()
  const mode = String(patch.defaultMode || base.defaultMode).trim()
  const imageMode = String(patch.defaultImageModeOption || base.defaultImageModeOption).trim()
  const vq = String(patch.autoDownloadQualityVideo || base.autoDownloadQualityVideo).trim()
  const iq = String(patch.autoDownloadQualityImage || base.autoDownloadQualityImage).trim()

  if (!Number.isFinite(delayMin) || delayMin < 0)
    delayMin = base.promptDelaySecondsMin
  if (!Number.isFinite(delayMax) || delayMax < 0)
    delayMax = base.promptDelaySecondsMax
  if (delayMax < delayMin)
    delayMax = delayMin

  return {
    packVersion: FLOW_VEO_PACK_VERSION,
    defaultMode: (MODES.has(mode) ? mode : base.defaultMode) as FlowDefaultMode,
    model: typeof patch.model === 'string' ? patch.model.trim() : base.model,
    imageModel: typeof patch.imageModel === 'string' ? patch.imageModel.trim() : base.imageModel,
    aspectRatio: (aspect === '16:9' || aspect === '9:16' ? aspect : base.aspectRatio) as '9:16' | '16:9',
    defaultVideoOption: (VIDEO_OPTIONS.has(videoOpt) ? videoOpt : base.defaultVideoOption) as FlowVideoOption,
    defaultImageModeOption: (IMAGE_MODES.has(imageMode) ? imageMode : base.defaultImageModeOption) as FlowImageModeOption,
    maxRetries: Number.isFinite(maxRetries) && maxRetries >= 1 && maxRetries <= 20
      ? Math.round(maxRetries)
      : base.maxRetries,
    autoDownloadQualityVideo: (VQ.has(vq) ? vq : base.autoDownloadQualityVideo) as FlowDownloadVideoQuality,
    autoDownloadQualityImage: (IQ.has(iq) ? iq : base.autoDownloadQualityImage) as FlowDownloadImageQuality,
    language: typeof patch.language === 'string' && patch.language.trim()
      ? patch.language.trim()
      : base.language,
    outputCount: Number.isFinite(outputCount) && outputCount >= 1 && outputCount <= 4
      ? Math.round(outputCount)
      : base.outputCount,
    concurrentPrompts: Number.isFinite(concurrentPrompts) && concurrentPrompts >= 1
      ? Math.min(6, Math.round(concurrentPrompts))
      : base.concurrentPrompts,
    promptDelaySecondsMin: Math.min(600, Math.round(delayMin)),
    promptDelaySecondsMax: Math.min(600, Math.round(delayMax)),
  }
}

/** Payload embedded in bridge job settings for Flow seats. */
export function flowSettingsForBridgeJob(flow: FlowVeoDefaults, overrides?: {
  duration?: number
  aspectRatio?: string
  prompt?: string
}) {
  const videoOption = overrides?.duration != null
    ? secondsToFlowVideoOption(overrides.duration)
    : flow.defaultVideoOption
  const duration = clampFlowDurationSeconds(
    overrides?.duration ?? videoOptionToSeconds(videoOption),
  )
  const aspectRatio = (overrides?.aspectRatio === '16:9' || overrides?.aspectRatio === '9:16')
    ? overrides.aspectRatio
    : flow.aspectRatio

  return {
    pack: 'flow-automation',
    packVersion: flow.packVersion,
    defaultMode: flow.defaultMode,
    model: flow.model || undefined,
    imageModel: flow.imageModel || undefined,
    aspectRatio,
    defaultVideoOption: videoOption,
    duration,
    defaultImageModeOption: flow.defaultImageModeOption,
    maxRetries: flow.maxRetries,
    autoDownloadQualityVideo: flow.autoDownloadQualityVideo,
    autoDownloadQualityImage: flow.autoDownloadQualityImage,
    language: flow.language,
    outputCount: flow.outputCount ?? 1,
    concurrentPrompts: flow.concurrentPrompts ?? 1,
    promptDelaySecondsMin: flow.promptDelaySecondsMin,
    promptDelaySecondsMax: flow.promptDelaySecondsMax,
    prompt: overrides?.prompt,
  }
}
