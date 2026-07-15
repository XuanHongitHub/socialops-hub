/**
 * Pure product I2V / caption prompt builders (no Next/server deps).
 *
 * Structure follows YouMind Grok Imagine best practices:
 * https://youmind.com/vi-VN/grok-imagine-prompts
 *   scene → camera → light/mood → subject → rails → AUDIO:
 *
 * Plus xAI Imagine 1.5 native audio: trailing AUDIO: block.
 */

import {
  buildYouMindStyleProductVisual,
} from './grokImaginePromptCraft'

/** Trailing AUDIO clause — Grok 1.5 attends well to end-of-prompt sound tags. */
export function buildGrokNativeAudioClause(input: {
  duration?: number
  audioBed?: string
  mood?: string
}) {
  const duration = Math.min(15, Math.max(6, Number(input.duration || 10)))
  const bed = String(input.audioBed || '').trim()
  const mood = String(input.mood || '').trim().toLowerCase()
  const defaultBed = /gift|dad|family|warm|cozy|father|mẹ|bố|family/i.test(mood)
    ? 'warm soft acoustic guitar and light piano gift underscore with cozy living-room room tone'
    : 'warm lo-fi guitar lifestyle bed with soft room tone'
  const sound = bed || defaultBed
  return [
    `AUDIO: continuous ${sound} for the full ${duration} seconds,`,
    `stereo, smooth levels, gentle fade-in and fade-out,`,
    `optional quiet fabric rustle only, no vocals, no voiceover, no TTS, no silence gaps, no harsh SFX.`,
  ].join(' ')
}

/**
 * Product commerce I2V prompt — YouMind order + product fidelity rails + AUDIO.
 */
export function productVideoMotionPrompt(input: {
  productTitle?: string
  productNotes?: string
  productUrl?: string
  userPrompt?: string
  duration?: number
  aspectRatio?: string
  hasReferenceImage?: boolean
  letterboxed?: boolean
  audioBed?: string
  mood?: string
  camera?: string
  lighting?: string
  scene?: string
}) {
  const duration = Math.min(15, Math.max(6, Number(input.duration || 10)))
  const title = String(input.productTitle || 'the product').trim().slice(0, 100)
  const notes = String(input.productNotes || '')
    .replace(/(Shop on BugSell|Find it on BugSell|Shop now|Buy now|#\w+|http\S+)/gi, '')
    .trim()
    .slice(0, 80)

  const visual = buildYouMindStyleProductVisual({
    duration,
    aspectRatio: input.aspectRatio,
    productTitle: title,
    scene: input.scene || notes || undefined,
    camera: input.camera || 'slow_dolly_in',
    lighting: input.lighting,
    mood: input.mood || title,
    hasReferenceImage: input.hasReferenceImage,
    letterboxed: input.letterboxed,
    notes: notes || undefined,
  })

  const audio = buildGrokNativeAudioClause({
    duration,
    audioBed: input.audioBed,
    mood: input.mood || title,
  })

  // Keep under ~YouMind “200 words” guidance for cleaner Imagine results
  return `${visual} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, 1200)
}

/** Caption/title pack only — do not use freeform shortVideoScript as the motion prompt. */
export function productCaptionPackPrompt(input: Record<string, unknown>) {
  const topicMax = Math.min(8, Math.max(1, Number(input.topicMax) || 5))
  const titleMax = Math.min(100, Math.max(16, Number(input.titleMax) || 80))
  return `Write social publish metadata for this BugSell marketplace product (not a freeform fantasy video).
Product: ${input.productTitle || ''}
URL: ${input.productUrl || ''}
Notes: ${input.productNotes || ''}
User brief: ${input.productNotes || input.prompt || ''}
Target platforms: ${input.platforms || 'tiktok,instagram,facebook,youtube,pinterest'}
Brand: BugSell is the public marketplace brand. Ignore seller micro-shop names for CTAs (if notes say "Seller (internal only…)", never put that name in title/caption).
Return JSON only with keys: title, caption, hashtags (array of strings).
Hard limits (publish validation):
- title max ${titleMax} chars, primary product keyword first
- caption 1-2 short sentences + soft BugSell CTA ("Find it on BugSell" / "Shop on BugSell") — NEVER "Shop now at <seller shop>"
- hashtags: EXACTLY ${Math.min(topicMax, 5)} items max (never more than ${topicMax}), without # prefix, niche+product+bugsell intent only
- Do NOT duplicate hashtags in caption text`
}
