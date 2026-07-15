/**
 * Pure publish-ready generation params (no platConfig / enum imports).
 * platformCompatibility wraps this with AccountPlatInfoMap for topic max.
 */

/** 将比例标签转为数值："9:16" → 0.5625 */
export function aspectRatioLabelToNumeric(label: string): number | null {
  const parts = label.split(':')
  if (parts.length !== 2)
    return null
  const w = Number(parts[0])
  const h = Number(parts[1])
  if (!w || !h)
    return null
  return w / h
}

/** Video category constraint for pure checks */
interface VideoCategory {
  aspectRatioRange: [number, number] | null
  durationRange: [number, number] | null
}

interface PlatformConstraint {
  videoCategories: VideoCategory[]
}

/**
 * Subset of platform video constraints used for gen-param resolution.
 * Keys are platform ids (instagram, tiktok, …).
 */
const PLATFORM_CONSTRAINTS: Record<string, PlatformConstraint> = {
  instagram: {
    videoCategories: [
      { aspectRatioRange: [0.5625, 0.8], durationRange: [5, 900] },
      { aspectRatioRange: [0.5625, 0.8], durationRange: [3, 60] },
    ],
  },
  tiktok: {
    videoCategories: [
      { aspectRatioRange: null, durationRange: [3, 600] },
    ],
  },
  facebook: {
    videoCategories: [
      { aspectRatioRange: null, durationRange: [3, 90] },
      { aspectRatioRange: null, durationRange: [3, 14400] },
    ],
  },
  threads: {
    videoCategories: [
      { aspectRatioRange: null, durationRange: [1, 300] },
    ],
  },
  pinterest: {
    videoCategories: [
      { aspectRatioRange: null, durationRange: [4, 900] },
    ],
  },
  // YouTube: Shorts ≈ 9:16 portrait, standard upload ≈ 16:9 landscape (either category OK alone).
  // With Instagram Reels, intersection prefers 9:16.
  youtube: {
    videoCategories: [
      { aspectRatioRange: [0.55, 0.62], durationRange: [1, 180] }, // ~9:16 Shorts
      { aspectRatioRange: [1.7, 1.85], durationRange: [1, 43200] }, // ~16:9
    ],
  },
  twitter: {
    videoCategories: [
      { aspectRatioRange: null, durationRange: [1, 140] },
    ],
  },
  linkedin: {
    videoCategories: [
      { aspectRatioRange: null, durationRange: [3, 600] },
    ],
  },
}

/**
 * Pick aspect + duration for generate/submit.
 *
 * When target platforms constrain aspect (e.g. Instagram Reels 4:5–9:16),
 * preferred/source aspect is auto-corrected so batch gen does not produce
 * 1:1/4:3 that fails only later at Publish.
 *
 * forceSocialPortrait=true: always lock 9:16 (pad ok, stretch never).
 */
export function resolvePublishReadyGenParams(input: {
  platforms: string[]
  preferredAspect?: string
  preferredDuration?: number
  modelRatios?: string[]
  modelDurationMin?: number
  modelDurationMax?: number
  /** When set, used for topicMax; else defaults (5 if no platforms, 8 with platforms) */
  topicMaxByPlatform?: Record<string, number>
  /** Force multi-platform Reels 9:16 (pad ok, stretch never) */
  forceSocialPortrait?: boolean
  /**
   * When false, never auto-correct aspect for platforms (true source match).
   * Default true: fit selected platforms.
   */
  fitPlatforms?: boolean
}): { aspectRatio: string, duration: number, topicMax: number, notes: string[], aspectCorrected: boolean } {
  const platforms = (input.platforms || []).map(p => String(p).toLowerCase()).filter(Boolean)
  const notes: string[] = []
  const modelRatios = input.modelRatios?.length
    ? input.modelRatios
    : ['9:16', '4:5', '3:4', '1:1', '16:9']
  const forceSocial = Boolean(input.forceSocialPortrait)
  const fitPlatforms = input.fitPlatforms !== false
  const preferred = String(input.preferredAspect || '').trim()
  let aspectCorrected = false

  const ratioFitsPlat = (plat: string, ratioLabel: string): boolean => {
    const constraint = PLATFORM_CONSTRAINTS[plat]
    if (!constraint?.videoCategories?.length)
      return true
    const ratio = aspectRatioLabelToNumeric(ratioLabel)
    if (ratio == null)
      return true
    return constraint.videoCategories.some((cat) => {
      if (!cat.aspectRatioRange)
        return true
      const [min, max] = cat.aspectRatioRange
      return ratio >= min - 0.001 && ratio <= max + 0.001
    })
  }

  const ratioFitsAll = (ratioLabel: string) =>
    platforms.length === 0 || platforms.every(p => ratioFitsPlat(p, ratioLabel))

  let aspectRatio = preferred && modelRatios.includes(preferred)
    ? preferred
    : (modelRatios.includes('1:1') ? '1:1' : (modelRatios[0] || '9:16'))

  if (forceSocial) {
    if (modelRatios.includes('9:16') || !modelRatios.length) {
      if (aspectRatio !== '9:16') {
        notes.push(`aspect forced 9:16 for Reels (was ${aspectRatio || preferred || 'auto'})`)
        aspectCorrected = true
      }
      aspectRatio = '9:16'
    }
    else {
      const portraitOrder = ['9:16', '4:5', '3:4']
      const found = portraitOrder.find(r => modelRatios.includes(r) && ratioFitsAll(r))
      aspectRatio = found || modelRatios[0] || aspectRatio
      notes.push(`forceSocialPortrait: nearest portrait ${aspectRatio}`)
      aspectCorrected = true
    }
  }
  else if (fitPlatforms && platforms.length > 0 && !ratioFitsAll(aspectRatio)) {
    // Auto-fix for Instagram Reels etc. — prefer 9:16 then 4:5
    const order = ['9:16', '4:5', '3:4', '1:1', '16:9', ...modelRatios]
    const seen = new Set<string>()
    const candidates = order.filter((r) => {
      if (seen.has(r) || !modelRatios.includes(r))
        return false
      seen.add(r)
      return true
    })
    const found = candidates.find(r => ratioFitsAll(r))
    if (found) {
      const platHint = platforms.includes('instagram') && platforms.includes('youtube')
        ? 'IG Reels 4:5–9:16 + YT Shorts 9:16 (intersection → 9:16)'
        : platforms.includes('instagram')
          ? 'Instagram Reels 4:5–9:16'
          : platforms.includes('youtube')
            ? 'YouTube Shorts 9:16 or landscape 16:9'
            : platforms.join(', ')
      notes.push(
        `aspect ${aspectRatio} → ${found} (${platHint}; pad product, never stretch)`,
      )
      aspectRatio = found
      aspectCorrected = true
    }
    else {
      notes.push(`aspect ${aspectRatio} may fail publish for: ${platforms.join(', ')}`)
    }
  }
  // Multi social (IG + YT + TikTok): prefer 9:16 even if preferred already "fits" one loose platform
  else if (
    fitPlatforms
    && !forceSocial
    && platforms.includes('instagram')
    && modelRatios.includes('9:16')
    && aspectRatio !== '9:16'
    && ratioFitsAll('9:16')
  ) {
    // If current aspect is 4:5 it still fits IG; leave it. Only nudge landscape/square.
    const r = aspectRatioLabelToNumeric(aspectRatio) ?? 1
    if (r > 0.85 || r < 0.5) {
      notes.push(`aspect ${aspectRatio} → 9:16 (best for IG Reels + YT Shorts + TikTok multi-post)`)
      aspectRatio = '9:16'
      aspectCorrected = true
    }
  }
  else if (preferred && !modelRatios.includes(preferred)) {
    notes.push(`preferred aspect ${preferred} not in model list; using ${aspectRatio}`)
  }

  let minD = input.modelDurationMin ?? 6
  let maxD = input.modelDurationMax ?? 15
  for (const plat of platforms) {
    const constraint = PLATFORM_CONSTRAINTS[plat]
    if (!constraint?.videoCategories?.length)
      continue
    let platMin = 0
    let platMax = Number.POSITIVE_INFINITY
    for (const cat of constraint.videoCategories) {
      if (!cat.durationRange)
        continue
      platMin = Math.max(platMin, cat.durationRange[0])
      platMax = Math.min(platMax, cat.durationRange[1])
    }
    if (Number.isFinite(platMax))
      maxD = Math.min(maxD, platMax)
    if (platMin > 0)
      minD = Math.max(minD, platMin)
  }
  if (minD > maxD) {
    minD = 6
    maxD = 15
  }

  let duration = Math.round(Number(input.preferredDuration) || 15)
  if (duration < minD || duration > maxD) {
    const next = Math.min(maxD, Math.max(minD, duration || 15))
    notes.push(`duration ${duration}s → ${next}s (platform limits)`)
    duration = next
  }

  let topicMax = 8
  if (input.topicMaxByPlatform) {
    for (const plat of platforms) {
      const tm = input.topicMaxByPlatform[plat]
      if (tm != null)
        topicMax = Math.min(topicMax, tm)
    }
  }
  if (!platforms.length)
    topicMax = 5

  return {
    aspectRatio,
    duration,
    topicMax: Math.max(1, topicMax),
    notes,
    aspectCorrected,
  }
}

/** True when any selected platform constrains video aspect (e.g. IG Reels). */
export function platformsConstrainVideoAspect(platforms: string[]): boolean {
  return (platforms || []).some((p) => {
    const c = PLATFORM_CONSTRAINTS[String(p).toLowerCase()]
    return c?.videoCategories?.some(cat => cat.aspectRatioRange != null)
  })
}
