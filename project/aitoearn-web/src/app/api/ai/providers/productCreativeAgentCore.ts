/**
 * Pure creative-agent helpers (no network / Next deps) — unit-testable.
 */

import {
  buildYouMindStyleProductVisual,
  YOUMIND_GROK_IMAGINE_RULES,
} from './grokImaginePromptCraft'
import { buildGrokNativeAudioClause, productVideoMotionPrompt } from './productVideoMotion'

export type ProductCreativeAgentInput = {
  productTitle?: string
  productUrl?: string
  productNotes?: string
  userPrompt?: string
  imageUrl?: string
  /** Extra ref images (lifestyle / storyboard / packshots) — vision reads all */
  imageUrls?: string[]
  platforms?: string[]
  duration?: number
  aspectRatio?: string
  hasReferenceImage?: boolean
  letterboxed?: boolean
  topicMax?: number
  titleMax?: number
  provider?: 'grok' | '9router' | 'auto'
  timeoutMs?: number
  /**
   * When true, SEO can soft-CTA BugSell marketplace.
   * When false/undefined with only ref images — never invent marketplace listing SEO.
   */
  bugsellCatalog?: boolean
}

export type ProductVisionContext = {
  productType?: string
  materials?: string
  colors?: string
  printOrArtwork?: string
  printHasFaces?: boolean
  scene?: string
  mood?: string
  giftOccasion?: string
}

export type ProductMotionBrief = {
  scene?: string
  camera?: string
  lighting?: string
  audioBed?: string
  fabricMotion?: string
  avoid?: string[]
}

export type ProductCreativePlan = {
  source: 'agent' | 'template'
  provider: string
  vision: ProductVisionContext
  title: string
  caption: string
  hashtags: string[]
  channelAngles: Record<string, string>
  motionBrief: ProductMotionBrief
  motionPrompt: string
  agentMotionDraft?: string
}

export function asString(v: unknown, max = 400) {
  return String(v || '').trim().slice(0, max)
}

export function asStringArray(v: unknown, max = 8): string[] {
  if (!Array.isArray(v))
    return []
  return [...new Set(v.map(x => String(x || '').replace(/^#/, '').trim()).filter(Boolean))].slice(0, max)
}

export function asBool(v: unknown) {
  if (typeof v === 'boolean')
    return v
  if (typeof v === 'string')
    return /^(1|true|yes)$/i.test(v)
  return false
}

/** Build agent instruction — vision + SEO + motion draft in one JSON. */
export function buildProductCreativeAgentPrompt(input: ProductCreativeAgentInput) {
  const duration = Math.min(15, Math.max(6, Number(input.duration || 10)))
  const aspect = String(input.aspectRatio || '9:16')
  const platforms = (input.platforms?.length ? input.platforms : ['tiktok', 'instagram', 'youtube', 'facebook', 'pinterest'])
    .map(String)
    .join(', ')
  const topicMax = Math.min(8, Math.max(1, Number(input.topicMax) || 5))
  const titleMax = Math.min(100, Math.max(16, Number(input.titleMax) || 80))
  const refCount = Math.max(
    input.imageUrl ? 1 : 0,
    Array.isArray(input.imageUrls) ? input.imageUrls.filter(Boolean).length : 0,
  )
  const hasImage = refCount > 0 || Boolean(input.hasReferenceImage)
  const isBugsell = Boolean(
    input.bugsellCatalog
    || /bugsell/i.test(String(input.productUrl || ''))
    || /bugsell/i.test(String(input.productTitle || '')),
  )
  const titleKnown = Boolean(String(input.productTitle || '').trim())

  return `You are SocialOps Product Creative Director for short-form product video.

${hasImage
  ? `You can SEE ${refCount > 1 ? `${refCount} reference images` : 'the product photo'} attached. Image order: first = hero/main product; later = lifestyle, storyboard, packshot, or print detail. Use vision ONLY on what is visible: garment/object type, print art, colors, fabric, props, people (in-frame vs on-print). Name the real product from the photo — never invent a generic marketplace listing.`
  : 'No product photo attached — use title/notes only; do not invent a different product.'}

${isBugsell
  ? 'Catalog source: BugSell marketplace product (title/URL/notes may be trusted). Soft CTA may mention BugSell.'
  : 'Catalog source: staff reference images only (BugSell product picker NOT selected). Do NOT invent "BugSell Marketplace Finds", marketplace deals SEO, or #bugsell hashtags. Title must describe the product IN THE PHOTO.'}

Context:
- Title: ${titleKnown ? input.productTitle : '(derive from photo — do not invent marketplace brand)'}
- URL: ${input.productUrl || '(none)'}
- Notes: ${String(input.productNotes || '').slice(0, 280) || '(none)'}
- User brief: ${String(input.userPrompt || '').slice(0, 280) || '(none)'}
- Target platforms: ${platforms}
- Video: ${duration}s, aspect ${aspect}, image-to-video=${Boolean(input.hasReferenceImage || hasImage)}
- Ref images attached: ${hasImage ? refCount || 'yes' : 0}

${YOUMIND_GROK_IMAGINE_RULES}

Return JSON ONLY (no markdown) with this shape:
{
  "vision": {
    "productType": "what the product actually is from the photo",
    "materials": "short",
    "colors": "short",
    "printOrArtwork": "what is printed/drawn on product if any",
    "printHasFaces": true/false,
    "scene": "what the photo(s) show — concrete, not generic 'product on clean surface'",
    "mood": "emotion grounded in the image",
    "giftOccasion": "only if image/notes imply a gift; else empty string"
  },
  "seo": {
    "title": "max ${titleMax} chars, keyword first, publish-ready, grounded in the photo",
    "caption": "${isBugsell
      ? '1-2 sentences + soft CTA Find it on BugSell / Shop on BugSell — NEVER seller micro-shop name'
      : '1-2 sentences about THIS product from the photo — no marketplace brand invent; soft CTA optional (Shop now / Link in bio)'}",
    "hashtags": ["exactly ${topicMax} tags max, no # prefix, single tokens, niche to the product${isBugsell ? ' + bugsell' : ' — no bugsell unless product is BugSell'}"]
  },
  "channelAngles": {
    "tiktok": "1 short hook angle",
    "instagram": "1 short angle",
    "youtube": "1 short angle",
    "facebook": "1 short angle",
    "pinterest": "1 short pin angle"
  },
  "motion": {
    "scene": "clear lifestyle product scene grounded in the photo (YouMind: scene first)",
    "camera": "name the move: slow dolly-in OR gentle orbit (not vague 'camera move')",
    "lighting": "specific light + mood from photo",
    "audioBed": "specific continuous bed e.g. warm acoustic gift underscore + room tone",
    "fabricMotion": "one micro physics detail if fabric/soft goods",
    "avoid": ["plastic skin", "morph print faces", "on-screen text", "hard cuts"]
  },
  "motionPrompt": "English I2V 350-700 chars. Order: SCENE → CAMERA → LIGHTING/MOOD → subject lock from photo → tack-sharp rails. END with AUDIO: line for full ${duration}s. No VO. Category: brand/product social lifestyle."
}

Hard rules:
- Ground title/scene/print in the attached photo(s). No generic "Marketplace Finds".
${isBugsell ? '- Public catalog CTA: BugSell only (never seller micro-shop name).' : '- No BugSell branding unless the product photo/URL is BugSell.'}
- Do NOT invent a different product design than the photo.
- Do NOT put marketing captions into motionPrompt as on-screen text.
- motionPrompt MUST end with an AUDIO: line (specific bed, continuous, no VO).`
}

/**
 * Merge agent draft with non-negotiable production rails
 * (print lock, audio, no text, anti-AI).
 */
export function composeMotionPromptFromAgent(input: {
  agentMotionPrompt?: string
  motionBrief?: ProductMotionBrief
  vision?: ProductVisionContext
  productTitle?: string
  duration?: number
  aspectRatio?: string
  hasReferenceImage?: boolean
  letterboxed?: boolean
  productNotes?: string
}): string {
  const duration = Math.min(15, Math.max(6, Number(input.duration || 10)))
  const aspect = String(input.aspectRatio || '9:16')
  const title = String(input.productTitle || 'the product').trim().slice(0, 120)
  const draft = asString(input.agentMotionPrompt, 1200)
  const brief = input.motionBrief || {}
  const vision = input.vision || {}
  const printFaces = vision.printHasFaces === true
    || /face|child|people|portrait|person/i.test(String(vision.printOrArtwork || ''))

  // Prefer agent draft when rich; else rebuild with YouMind scene→camera→light order
  const visualDraft = draft.replace(/\bAUDIO\s*:[\s\S]*$/i, '').trim()
  const core = visualDraft.length >= 40
    ? visualDraft
    : buildYouMindStyleProductVisual({
        duration,
        aspectRatio: aspect,
        productTitle: title,
        scene: brief.scene || vision.scene,
        camera: brief.camera || 'slow_dolly_in',
        lighting: brief.lighting,
        mood: vision.mood || vision.giftOccasion,
        giftOccasion: vision.giftOccasion,
        fabricMotion: brief.fabricMotion,
        hasReferenceImage: input.hasReferenceImage,
        letterboxed: input.letterboxed,
        printHasFaces: printFaces,
        printOrArtwork: vision.printOrArtwork,
        notes: input.productNotes,
      })

  // Light rails only when using agent draft (YouMind builder already includes quality)
  const rails = visualDraft.length >= 40
    ? [
        printFaces ? 'Print on fabric stays flat static (no face morph).' : '',
        input.letterboxed ? 'No blur fog letterbox.' : '',
        'Tack-sharp product; no on-screen text.',
      ].filter(Boolean).join(' ')
    : ''

  const audio = buildGrokNativeAudioClause({
    duration,
    audioBed: brief.audioBed,
    mood: vision.mood || vision.giftOccasion || title,
  })

  // Visual first, AUDIO: last — Imagine 1.5 + YouMind craft
  return `${core} ${rails} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, 1200)
}

export function templateProductCreativePlan(
  input: ProductCreativeAgentInput,
  reason = 'template',
): ProductCreativePlan {
  const titleMax = Math.min(100, Math.max(16, Number(input.titleMax) || 80))
  const isBugsell = Boolean(
    input.bugsellCatalog
    || /bugsell/i.test(String(input.productUrl || ''))
    || /bugsell/i.test(String(input.productTitle || '')),
  )
  // Never invent marketplace listing names when only ref images were provided
  const title = asString(input.productTitle, titleMax)
    || (input.hasReferenceImage || input.imageUrl ? 'Product from reference photo' : 'Product video')
  const caption = asString(input.productNotes, 200)
    || (isBugsell ? 'Find it on BugSell' : 'Shot from your product reference')
  return {
    source: 'template',
    provider: `fallback:${reason}`,
    vision: {
      scene: input.hasReferenceImage || input.imageUrl
        ? 'Grounded in staff reference photo (agent fallback — re-run Vision if needed)'
        : undefined,
    },
    title,
    caption,
    hashtags: [],
    channelAngles: {},
    motionBrief: {},
    motionPrompt: productVideoMotionPrompt({
      productTitle: input.productTitle || title,
      productNotes: input.productNotes,
      productUrl: input.productUrl,
      userPrompt: input.userPrompt,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      hasReferenceImage: input.hasReferenceImage,
      letterboxed: input.letterboxed,
    }),
  }
}
