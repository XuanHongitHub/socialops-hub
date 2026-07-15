/**
 * Deterministic platform defaults applied when opening Publish from a draft.
 * Complements AI SEO (which rewrites copy). This sets options that AI cannot choose
 * without extra account APIs (privacy, category defaults, topic caps).
 */
import type { IPubParams, IPlatOption } from '@/components/PublishDialog/publishDialog.type'
import { PlatType } from '@/app/config/platConfig'
import {
  clampDes,
  clampTitle,
  getPlatformSeoRule,
  normalizeTopicsForPlat,
} from '@/components/PublishDialog/platformSeoRules'
import { getPreferredContentCategory } from '@/components/PublishDialog/publishChannelPrefs'

export function applySmartPublishDefaults(
  params: Partial<IPubParams>,
  accountType: PlatType,
): Partial<IPubParams> {
  const rule = getPlatformSeoRule(accountType)
  const next: Partial<IPubParams> = { ...params }
  const option: IPlatOption = { ...(params.option || {}) }

  // Cap + normalize topics (no spaces — broken #tags in UI)
  if (next.topics)
    next.topics = normalizeTopicsForPlat(next.topics, accountType)
  if (next.title)
    next.title = clampTitle(next.title, accountType)
  if (next.des) {
    // Strip existing #tags and broken "#word rest of phrase" trails, then re-append clean tags
    const bare = String(next.des)
      .replace(/#[\p{L}\p{N}_]+(?:\s+[\p{L}\p{N}_]+)*/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const topics = next.topics || []
    // Prefer topics in des as display hashtags; keep topics[] for platform APIs that need them
    next.des = clampDes(
      topics.length ? `${bare}\n${topics.map(t => `#${t}`).join(' ')}`.trim() : bare,
      accountType,
    )
  }

  switch (accountType) {
    case PlatType.Tiktok:
      option.tiktok = {
        comment_disabled: false,
        duet_disabled: false,
        stitch_disabled: false,
        brand_organic_toggle: false,
        brand_content_toggle: false,
        brand_disclosure_enabled: false,
        ...option.tiktok,
        privacy_level: option.tiktok?.privacy_level || rule.defaults?.privacy_level || 'PUBLIC_TO_EVERYONE',
      }
      break
    case PlatType.YouTube:
      option.youtube = {
        license: 'youtube',
        ...option.youtube,
        privacyStatus: option.youtube?.privacyStatus || 'public',
        // categoryId left for YouTubeParams / AI fill if list loaded
        categoryId: option.youtube?.categoryId || rule.defaults?.youtubeCategoryHint,
      }
      break
    case PlatType.Facebook:
      option.facebook = {
        ...option.facebook,
        // Prefer last user choice, else Post (BugSell commerce) — not forced Reels
        content_category:
          option.facebook?.content_category
          || getPreferredContentCategory('facebook', Boolean(params.video)),
      }
      break
    case PlatType.Instagram:
      option.instagram = {
        ...option.instagram,
        content_category:
          option.instagram?.content_category
          || getPreferredContentCategory('instagram', Boolean(params.video)),
      }
      break
    default:
      break
  }

  next.option = option
  return next
}

/** Apply base draft fields then per-account smart defaults */
export function buildPrefillParamsForAccount(
  base: Partial<IPubParams>,
  account: { type: PlatType | string },
): Partial<IPubParams> {
  return applySmartPublishDefaults({ ...base }, account.type as PlatType)
}
