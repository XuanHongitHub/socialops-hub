/**
 * Single continuous storyboard clip (web-parity quality path).
 *
 * Multi-shot I2V + hard stitch produces janky cuts, print drift, and chrome leaks.
 * One 10s R2V with product + clean lifestyle + timestamped beats matches grok.com better.
 */

import type { StoryboardBoard } from './types'
import { normalizePrintLock } from './dualConstraint'
import { imageTag } from './buildReferencePack'

export function buildSingleClipR2VPrompt(input: {
  duration: number
  aspectRatio: string
  productTitle?: string
  printLock: string
  board: StoryboardBoard
  hasLifestyleRef: boolean
  audioClause: string
}): string {
  const d = Math.min(15, Math.max(6, input.duration || 10))
  const printLock = normalizePrintLock(input.printLock)
  const product = String(input.productTitle || input.board.productTitle || 'product').slice(0, 80)
  const shots = input.board.shots || []
  const s01 = shots[0]
  const s02 = shots[1]
  const s03 = shots[2]

  const t1 = s01 ? `${s01.tStart.toFixed(1)}-${s01.tEnd.toFixed(1)}s` : '0-3.3s'
  const t2 = s02 ? `${s02.tStart.toFixed(1)}-${s02.tEnd.toFixed(1)}s` : '3.3-6.7s'
  const t3 = s03 ? `${s03.tStart.toFixed(1)}-${s03.tEnd.toFixed(1)}s` : '6.7-10s'

  const refs = input.hasLifestyleRef
    ? [
        `REFS: ${imageTag(1)} = PRODUCT PRINT source of truth (catalog flat photo — exact artwork).`,
        `${imageTag(2)} = PERSON identity + outdoor lifestyle (face/hair/body only — NOT a document).`,
        `Try-on: person from ${imageTag(2)} wears the EXACT tee print from ${imageTag(1)}.`,
      ].join(' ')
    : [
        `REFS: ${imageTag(1)} = PRODUCT PRINT source of truth.`,
        'Animate this product only; do not invent a redesigned graphic.',
      ].join(' ')

  const beats = [
    `[${t1}] ${s01?.title || 'First glance'}: cozy home, hands gently hold/reveal the SAME burnt-orange tee as ${imageTag(1)}; full chest print visible and sharp; soft natural light. No page borders.`,
    input.hasLifestyleRef
      ? `[${t2}] ${s02?.title || 'Stepping out'}: continuous motion into sunny sidewalk; woman matching ${imageTag(2)} wears exact print from ${imageTag(1)}; medium chest-up so print ≥35% of frame; friends soft bokeh optional; natural smile — not exaggerated acting.`
      : `[${t2}] Outdoor energy with product held chest-height toward camera in daylight; print matches ${imageTag(1)}; no fashion-model invent with wrong art.`,
    `[${t3}] ${s03?.title || 'Close connection'}: closer framing on print; fingers lightly along fabric EDGE without covering character faces; print fully legible with cone hats; warm shared smile energy.`,
  ].join(' ')

  const visual = [
    `${d}s ${input.aspectRatio} ONE continuous photoreal UGC product reel of ${product}. Smooth temporal continuity — no hard cuts, no storyboard collage, no multi-panel layout.`,
    refs,
    beats,
    `PRINT LOCK (every frame when product visible): ${printLock}`,
    'HARD BANS: pink document borders, white page margins, FRAME labels, BOARD UI, HERO DETAILS text, tables, hashtags, captions, plastic CGI skin, alternate print without orange cone hats, hands completely covering the print.',
    'Camera: handheld UGC micro-sway, natural depth of field, tack-sharp print edges.',
  ].join(' ').replace(/\s+/g, ' ').trim()

  const max = 1550
  const audio = input.audioClause
  const budget = Math.min(audio.length + 2, 340)
  return `${visual.slice(0, max - budget)} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, max)
}
