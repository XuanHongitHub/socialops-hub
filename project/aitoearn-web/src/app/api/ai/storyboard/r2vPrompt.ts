/**
 * Reference-to-Video prompts (grok.com / xAI docs parity).
 * Use <IMAGE_n> addressing + multi-ref try-on pattern.
 */

import type { ExecutableShot } from './dualConstraint'
import { normalizePrintLock } from './dualConstraint'
import {
  describePackForPrompt,
  imageTag,
  type ReferencePack,
} from './buildReferencePack'

export function r2vDualConstraintPrompt(input: {
  duration: number
  aspectRatio: string
  productTitle?: string
  printLock: string
  exec: ExecutableShot
  pack: ReferencePack
  audioClause: string
}): string {
  const e = input.exec
  const product = String(input.productTitle || 'product').slice(0, 80)
  const printLock = normalizePrintLock(input.printLock)
  const pack = input.pack
  const pIdx = pack.productIndex || 1
  // Lifestyle OR board keyframe acts as secondary identity (person / worn scene)
  const secondary = pack.slots.find(s => s.role === 'lifestyle' || s.role === 'keyframe')
  const lIdx = pack.lifestyleIndex || secondary?.index
  const refLegend = describePackForPrompt(pack)

  const tryOnLine = lIdx && lIdx !== pIdx
    ? [
        `VIRTUAL TRY-ON / MULTI-REF (like grok.com Animate Photos):`,
        `person, pose, and scene identity from ${imageTag(lIdx)};`,
        `exact garment & chest print from ${imageTag(pIdx)}.`,
        `Print on fabric must match ${imageTag(pIdx)} pixel-faithfully — cone hats, cast, layout, colors.`,
        `Blend: keep ${imageTag(lIdx)} human/scene realism while locking product art to ${imageTag(pIdx)}.`,
        'Do not invent a different graphic or plain tee.',
      ].join(' ')
    : [
        `REFERENCE-TO-VIDEO from ${imageTag(pIdx)} (product print source of truth).`,
        `Keep the exact front print from ${imageTag(pIdx)} on fabric every frame.`,
        'Do not redesign artwork; animate camera, hands, light, fabric micro-motion only.',
      ].join(' ')

  const scenarioLine = [
    `CONSTRAINT A — SCENARIO (must feel like this board beat): ${e.scenarioIntent.slice(0, 180)}.`,
    `Framing: ${e.framingNote}.`,
    `SCENE: ${String(e.scene).slice(0, 180)}`,
    `ACTION: ${String(e.onFrameAction).slice(0, 100)}`,
    `CAMERA: ${String(e.camera).slice(0, 100)}. One continuous shot, no hard cuts.`,
  ].join(' ')

  // Full outdoor worn only when lifestyle ref exists — else product-safe outdoor energy
  const bodyGuard = lIdx
    ? `Full lifestyle motion allowed using ${imageTag(lIdx)} identity + ${imageTag(pIdx)} product print. Medium-close chest-up preferred so print ≥40% frame.`
    : 'No inventing fashion model print: if a body appears, keep print match to product ref; prefer hands/product-held or tight chest crop for outdoor energy.'

  const visual = [
    `${input.duration}s ${input.aspectRatio} photoreal UGC product video of ${product}.`,
    `REFS: ${refLegend}.`,
    tryOnLine,
    scenarioLine,
    `CONSTRAINT B — PRODUCT PRINT (immutable, from ${imageTag(pIdx)}): ${printLock}`,
    bodyGuard,
    'Print legible ≥40% of frame when product visible. Tack-sharp print edges.',
    'DO NOT: BOARD UI chrome, captions, hashtags, alternate cast without cone hats, plastic CGI skin, blur print.',
  ].join(' ').replace(/\s+/g, ' ').trim()

  const max = 1500
  const audio = input.audioClause
  const budget = Math.min(audio.length + 2, 360)
  return `${visual.slice(0, max - budget)} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, max)
}
