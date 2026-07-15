/**
 * Platform SEO + publish constraint rules for AI auto-fill and smart prefill.
 * Sources: platform product limits (platConfig) + 2026 SEO practice
 * (keyword-first captions, 3–5 niche tags, title front-load primary keyword).
 */
import { PlatType } from '@/app/config/platConfig'
import { AccountPlatInfoMap } from '@/app/config/platConfig'

export type PlatformSeoRule = {
  plat: PlatType
  name: string
  titleMax: number
  desMax: number
  topicMax: number
  /** SEO guidance injected into AI system prompt */
  seoHints: string[]
  /** Deterministic defaults applied without AI */
  defaults?: {
    privacy_level?: string
    youtubeCategoryHint?: string
    facebookContentCategory?: string
    instagramContentCategory?: string
    youtubePrivacy?: string
  }
}

const SEO_COMMON = [
  'Primary keyword in first 40 characters of title/caption.',
  'Natural language, no keyword stuffing.',
  '3–5 niche hashtags max; mix 1 broad + niche product/intent tags.',
  'Clear product value + soft CTA toward BugSell marketplace — not a random small seller shop name.',
  'Never write "Shop now at <seller shop>" (e.g. City Cats). Public brand is BugSell; seller names are internal only.',
  'Match spoken/on-screen product identity to caption keywords.',
  'No spam SALE ALL CAPS.',
]

export function getPlatformSeoRule(plat: PlatType): PlatformSeoRule {
  const info = AccountPlatInfoMap.get(plat)
  const titleMax = info?.commonPubParamsConfig.titleMax ?? 100
  const desMax = info?.commonPubParamsConfig.desMax ?? 2000
  const topicMax = info?.commonPubParamsConfig.topicMax ?? 5
  const name = info?.name || plat

  const base: PlatformSeoRule = {
    plat,
    name,
    titleMax,
    desMax,
    topicMax,
    seoHints: [...SEO_COMMON],
  }

  switch (plat) {
    case PlatType.Tiktok:
      return {
        ...base,
        titleMax: titleMax || 150,
        topicMax: Math.min(topicMax, 5),
        seoHints: [
          ...SEO_COMMON,
          'TikTok SEO 2026: keyword-rich caption > hashtag spam; 3–5 tags only.',
          'Open with searchable product phrase (e.g. "Best Dad hoodie with kids names").',
          'No more than 5 topics/hashtags total (platform hard limit in this app).',
        ],
        defaults: { privacy_level: 'PUBLIC_TO_EVERYONE' },
      }
    case PlatType.Instagram:
      return {
        ...base,
        topicMax: Math.min(topicMax, 5),
        seoHints: [
          ...SEO_COMMON,
          'Instagram Reels: keywords in caption first 2 lines; 3–5 niche tags.',
          'Aspect ideally 4:5–9:16 for Reels discovery.',
        ],
        // BugSell commerce: feed Post by default (user can switch to Reel)
        defaults: { instagramContentCategory: 'post' },
      }
    case PlatType.Facebook:
      return {
        ...base,
        seoHints: [
          ...SEO_COMMON,
          'Facebook: short hook first sentence; optional 3–5 tags.',
          'Prefer content_category post for BugSell product catalog (user can pick Reel).',
        ],
        defaults: { facebookContentCategory: 'post' },
      }
    case PlatType.YouTube:
      return {
        ...base,
        titleMax: Math.min(titleMax || 100, 100),
        seoHints: [
          ...SEO_COMMON,
          'YouTube: title ≤70 chars preferred for search SERP; keyword first.',
          'Description: first 2 lines = summary + keywords; then CTA + hashtags #Shorts if vertical.',
          'Category: People & Blogs or Entertainment for lifestyle product (use id from account list).',
        ],
        defaults: {
          youtubePrivacy: 'public',
          youtubeCategoryHint: '22', // People & Blogs (common default)
        },
      }
    case PlatType.Pinterest:
      return {
        ...base,
        // App validation: title often treated very short (user saw 16-char limit in UI)
        titleMax: Math.min(titleMax || 100, 100),
        seoHints: [
          ...SEO_COMMON,
          'Pinterest: descriptive keyword title; avoid emoji-only titles.',
          'Description is SEO body — full product benefits + keywords.',
          'Board must be selected by user (AI cannot invent board id).',
        ],
      }
    case PlatType.Twitter:
      return {
        ...base,
        desMax: Math.min(desMax, 280),
        topicMax: Math.min(topicMax, 3),
        seoHints: [
          ...SEO_COMMON,
          'X/Twitter: tight hook under 280 including spaces; 1–2 hashtags max.',
        ],
      }
    default:
      return base
  }
}

export function buildMultiPlatformSeoSystemPrompt(plats: PlatType[]) {
  const rules = plats.map(getPlatformSeoRule)
  return `You are a social commerce SEO copywriter for BugSell (marketplace brand), multi-platform publish.
Return ONLY valid JSON object keyed by platform id with shape:
{ "<plat>": { "title": string, "des": string, "topics": string[] } }

Brand rules (critical):
- Public brand / marketplace = BugSell. Optimize discovery for BugSell + the PRODUCT, not for individual seller micro-shops.
- If context mentions "Seller (internal only…)" or a shop name like "City Cats", DO NOT put that name in title, caption, or CTA.
- Soft CTA examples: "Find it on BugSell", "Shop on BugSell", "Available on BugSell" — never "Shop now at <seller>".
- Hashtags may include product niche + bugsell when natural; never seller-shop vanity tags.

Platform rules:
${rules.map(r => `- ${r.plat} (${r.name}): titleMax=${r.titleMax}, desMax=${r.desMax}, topicMax=${r.topicMax}. ${r.seoHints.join(' ')}`).join('\n')}

Hard constraints:
- topics array length ≤ topicMax for that platform; no # prefix in topics items.
- title/des respect max lengths.
- Product fidelity: keep real product name; no fake claims or prices unless in context.
- Language: match product/context language (Vietnamese/English as given).`
}

/**
 * Social hashtags must be single tokens (no spaces).
 * "soccer dad shirt" → "soccerDadShirt" so "#soccer dad shirt" never splits in the editor.
 */
export function normalizeHashtagToken(raw: string): string {
  const s = String(raw || '').replace(/^#/, '').trim()
  if (!s)
    return ''
  // Already camel/snake/joined
  if (!/\s/.test(s))
    return s.replace(/[^\p{L}\p{N}_]/gu, '')
  const parts = s.split(/[\s_-]+/).filter(Boolean)
  if (!parts.length)
    return ''
  return parts
    .map((p, i) => {
      const clean = p.replace(/[^\p{L}\p{N}]/gu, '')
      if (!clean)
        return ''
      if (i === 0)
        return clean.charAt(0).toLowerCase() + clean.slice(1)
      return clean.charAt(0).toUpperCase() + clean.slice(1)
    })
    .join('')
}

/** Cap topics and strip # for a platform */
export function normalizeTopicsForPlat(topics: string[] | undefined, plat: PlatType): string[] {
  const max = getPlatformSeoRule(plat).topicMax
  const cleaned = (topics || [])
    .map(t => normalizeHashtagToken(t))
    .filter(Boolean)
  const unique = [...new Set(cleaned)]
  return unique.slice(0, Math.max(0, max))
}

export function clampTitle(title: string, plat: PlatType): string {
  const max = getPlatformSeoRule(plat).titleMax
  const t = String(title || '').trim()
  if (!max || t.length <= max)
    return t
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`
}

export function clampDes(des: string, plat: PlatType): string {
  const max = getPlatformSeoRule(plat).desMax
  const d = String(des || '').trim()
  if (!max || d.length <= max)
    return d
  return d.slice(0, max).trim()
}
