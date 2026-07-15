/**
 * Build multi-ref packs for Grok web-parity Reference-to-Video.
 *
 * grok.com: upload up to 7 images, address as @Image1 / <IMAGE_1> in prompt.
 * Board/info decks are PLAN only — never included as visual refs (animating them
 * produces document chrome, not product video).
 */

import type { ClassifiedRef } from './classifyRefImage'
import type { ExecutableShot } from './dualConstraint'

export type RefSlotRole = 'product' | 'lifestyle' | 'extra' | 'keyframe'

export type RefSlot = {
  /** 1-based index for prompt tags <IMAGE_n> / @imageN */
  index: number
  url: string
  role: RefSlotRole
  label: string
}

export type ReferencePack = {
  /** Ordered URLs ready for createGrokVideo.referenceImages (max 7) */
  urls: string[]
  slots: RefSlot[]
  /** True when 2+ visual refs → must use reference_to_video + grok-imagine-video */
  isMultiRef: boolean
  productIndex: number
  lifestyleIndex?: number
}

const MAX_REFS = 7

/**
 * Collect visual refs from classified stack. Excludes board_plan.
 * Order: product hero first, then lifestyle, then other product/unknown extras.
 */
export function collectVisualRefs(
  classified: ClassifiedRef[],
  productHeroUrl: string,
): Array<{ url: string, role: RefSlotRole }> {
  const out: Array<{ url: string, role: RefSlotRole }> = []
  const seen = new Set<string>()

  const push = (url: string, role: RefSlotRole) => {
    const u = String(url || '').trim()
    if (!u || seen.has(u))
      return
    seen.add(u)
    out.push({ url: u, role })
  }

  push(productHeroUrl, 'product')

  const lifestyles = classified
    .filter(c => c.role === 'lifestyle')
    .sort((a, b) => b.confidence - a.confidence)
  for (const c of lifestyles)
    push(c.url, 'lifestyle')

  // Other product angles / unknown (not board)
  const extras = classified
    .filter(c => c.role === 'product_hero' || c.role === 'unknown')
    .sort((a, b) => b.confidence - a.confidence)
  for (const c of extras)
    push(c.url, c.role === 'product_hero' ? 'extra' : 'extra')

  return out.slice(0, MAX_REFS)
}

/**
 * Per-shot ref pack: always product; add lifestyle for on-body beats;
 * optional keyframe stills (pre-cropped board panels) if provided.
 */
export function buildReferencePackForShot(input: {
  classified: ClassifiedRef[]
  productHeroUrl: string
  exec: ExecutableShot
  /** Optional pre-extracted storyboard panel stills (not full deck) */
  keyframeUrls?: string[]
}): ReferencePack {
  const visual = collectVisualRefs(input.classified, input.productHeroUrl)
  const product = visual.find(v => v.role === 'product') || visual[0]
  if (!product) {
    return {
      urls: [],
      slots: [],
      isMultiRef: false,
      productIndex: 1,
    }
  }

  const ordered: Array<{ url: string, role: RefSlotRole }> = [{ url: product.url, role: 'product' }]
  const risk = input.exec.risk
  const wantsBody = risk === 'onbody_risk' || input.exec.heroPref === 'lifestyle_worn'

  if (wantsBody) {
    const life = visual.find(v => v.role === 'lifestyle')
    if (life)
      ordered.push(life)
  }

  // Extra product angles (different lighting) help identity — cap remaining slots
  for (const v of visual) {
    if (ordered.length >= MAX_REFS)
      break
    if (v.role === 'extra' && !ordered.some(o => o.url === v.url))
      ordered.push(v)
  }

  // Keyframe panels = storyboard frame stills (person/scene from board, not full BOARD doc)
  // Always attach for multi-ref web parity when available (especially onbody + detail)
  for (const kf of input.keyframeUrls || []) {
    if (ordered.length >= MAX_REFS)
      break
    const u = String(kf || '').trim()
    if (u && !ordered.some(o => o.url === u))
      ordered.push({ url: u, role: 'keyframe' })
  }

  // If still single ref but keyframes exist unused, force second ref for R2V
  if (ordered.length === 1 && (input.keyframeUrls || []).length) {
    const u = String(input.keyframeUrls![0] || '').trim()
    if (u)
      ordered.push({ url: u, role: 'keyframe' })
  }

  // If onbody + lifestyle, ensure lifestyle is present (already handled)
  // If onbody without lifestyle, product-only pack — prompt will use product-safe framing

  const slots: RefSlot[] = ordered.map((item, i) => ({
    index: i + 1,
    url: item.url,
    role: item.role,
    label: item.role === 'product'
      ? 'product print source of truth'
      : item.role === 'lifestyle'
        ? 'person / on-body identity'
        : item.role === 'keyframe'
          ? 'storyboard keyframe'
          : 'extra product angle',
  }))

  const lifestyleIndex = slots.find(s => s.role === 'lifestyle')?.index
    || slots.find(s => s.role === 'keyframe')?.index

  return {
    urls: slots.map(s => s.url),
    slots,
    isMultiRef: slots.length >= 2,
    productIndex: 1,
    lifestyleIndex,
  }
}

/** Prompt tag helpers matching xAI docs + grok.com */
export function imageTag(n: number): string {
  return `<IMAGE_${n}>`
}

export function describePackForPrompt(pack: ReferencePack): string {
  if (!pack.slots.length)
    return ''
  return pack.slots
    .map(s => `${imageTag(s.index)} = ${s.label}`)
    .join('; ')
}
