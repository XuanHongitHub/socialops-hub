/**
 * Grok Imagine prompt craft for SocialOps product I2V.
 *
 * Inspired by community best practices (YouMind Grok Imagine prompt library):
 * https://youmind.com/vi-VN/grok-imagine-prompts
 *
 * YouMind FAQ structure that works well with Aurora / Grok Imagine:
 * 1) Clear scene description first
 * 2) Explicit camera move (e.g. "slow dolly in")
 * 3) Lighting + mood
 * 4) Subject details / identity lock (esp. reference image)
 * 5) Keep prompts tight (~under 200 words / ~1200 chars)
 *
 * Product-commerce adaptation (BugSell):
 * - Reference-to-video fidelity > cinematic fantasy
 * - Trailing AUDIO: block for native soundtrack (xAI Imagine 1.5)
 * - No on-screen text; print on fabric stays static
 */

export type GrokCameraMove
  = | 'slow_dolly_in'
    | 'gentle_orbit'
    | 'static_push'
    | 'handheld_micro'

export type GrokProductMood
  = | 'gift_warm'
    | 'lifestyle_clean'
    | 'catalog_premium'
    | 'ugc_casual'

/** Camera phrases — mirror YouMind “dolly in chậm” style specificity */
export function grokCameraPhrase(move?: string | GrokCameraMove): string {
  const m = String(move || 'slow_dolly_in').toLowerCase()
  if (/orbit|circle|xoay/.test(m))
    return 'gentle 5–8° orbit around the product, smooth and continuous'
  if (/hand|handheld|micro/.test(m))
    return 'subtle handheld micro-movement, premium lifestyle feel'
  if (/static|lock/.test(m))
    return 'locked tripod with a very slow push-in'
  // default / dolly
  return 'slow dolly-in (push-in ~10–15%), one continuous move'
}

export function grokLightingPhrase(lighting?: string, mood?: string): string {
  const lit = String(lighting || '').trim()
  if (lit)
    return lit
  const moodKey = String(mood || '').toLowerCase()
  if (/gift|dad|family|warm|cozy|father|mẹ|bố/.test(moodKey))
    return 'soft warm window light, gentle falloff, cozy living-room ambience'
  if (/catalog|studio|premium/.test(moodKey))
    return 'clean softbox product light, controlled highlights on fabric'
  if (/ugc|casual|phone/.test(moodKey))
    return 'natural smartphone daylight, slight realism grain'
  return 'soft natural daylight, realistic product commerce lighting'
}

export function grokMoodPhrase(mood?: string, giftOccasion?: string): string {
  const g = String(giftOccasion || mood || '').trim()
  if (g)
    return g.slice(0, 80)
  return 'desirable gift / lifestyle product moment'
}

/**
 * YouMind-ordered motion skeleton for product reference-to-video.
 * Returns visual body only (caller appends AUDIO:).
 */
export function buildYouMindStyleProductVisual(input: {
  duration?: number
  aspectRatio?: string
  productTitle?: string
  scene?: string
  camera?: string
  lighting?: string
  mood?: string
  giftOccasion?: string
  fabricMotion?: string
  hasReferenceImage?: boolean
  letterboxed?: boolean
  printHasFaces?: boolean
  printOrArtwork?: string
  notes?: string
}): string {
  const duration = Math.min(15, Math.max(6, Number(input.duration || 10)))
  const aspect = String(input.aspectRatio || '9:16')
  const title = String(input.productTitle || 'the product').trim().slice(0, 100)
  const scene = String(input.scene || '').trim().slice(0, 220)
    || `Photoreal lifestyle product moment featuring ${title}`
  const camera = grokCameraPhrase(input.camera)
  const lighting = grokLightingPhrase(input.lighting, input.mood || input.giftOccasion)
  const mood = grokMoodPhrase(input.mood, input.giftOccasion)
  const fabric = String(input.fabricMotion || 'subtle fabric sway from soft air only').slice(0, 100)
  const printFaces = input.printHasFaces
    || /face|child|people|portrait|person/i.test(String(input.printOrArtwork || ''))

  // Order = YouMind best practice: scene → camera → light/mood → subject → quality rails
  const parts = [
    // 1) Scene
    `${duration}s, ${aspect}, ${scene}. Mood: ${mood}.`,
    // 2) Camera (explicit verb)
    `Camera: ${camera}. ONE continuous shot — no cuts, no montage, no location jump.`,
    // 3) Light + micro physics
    `Lighting: ${lighting}. Motion: ${fabric}.`,
    // 4) Subject / reference lock
    input.hasReferenceImage
      ? `Image-to-video from the attached product photo as source of truth: lock silhouette, colors, logos, materials, and print artwork every frame.`
      : `Show real product clearly: ${title}.`,
    printFaces || input.hasReferenceImage
      ? `Print/art on fabric stays flat static like real DTG/screen-print — do not animate, morph, smile, or blink faces in the print.`
      : '',
    // 5) Quality (short, positive + few hard avoids)
    `Tack-sharp product and faces, crisp fabric weave, no motion blur, no plastic CGI skin, no dreamy haze, no on-screen text/captions/CTAs/watermarks.`,
    input.letterboxed ? `Clean studio pad only — no blur fog bars.` : '',
    input.notes ? `Context (not on-screen text): ${String(input.notes).slice(0, 80)}.` : '',
    `Product: ${title}.`,
  ]

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** YouMind-inspired agent instruction snippet (for creative director LLM). */
export const YOUMIND_GROK_IMAGINE_RULES = `
Grok Imagine prompt craft (YouMind-style, product commerce):
- Order: SCENE → CAMERA (name the move: slow dolly-in / gentle orbit) → LIGHTING + MOOD → SUBJECT DETAIL → quality rails.
- Keep motionPrompt under ~200 words / 350–700 chars visual + AUDIO line.
- Reference image is sacred: identity consistency across frames (Aurora strength).
- Prefer one continuous camera move; add one micro physics detail (fabric air, soft sway).
- End with AUDIO: specific continuous bed (e.g. warm acoustic gift underscore + room tone), no VO.
- Category vibe: brand/product ad + social lifestyle — not fantasy/meme unless product is fantasy.
`.trim()
