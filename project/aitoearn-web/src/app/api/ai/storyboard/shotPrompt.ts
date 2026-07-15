/**
 * Per-shot I2V prompts — print fidelity FIRST, then camera/scene.
 * Outdoor full-body "fashion invent" is actively discouraged.
 */
import { buildGrokNativeAudioClause } from '@/app/api/ai/providers/productVideoMotion'
import { normalizePrintLock } from './fidelityShots'
import type { StoryboardBoard, StoryboardShot } from './types'
import { shotGenDuration } from './types'

export function buildStoryboardShotPrompt(input: {
  board: StoryboardBoard
  shot: StoryboardShot
  productTitle?: string
  hasHeroImage?: boolean
  printLock?: string
}): string {
  const { board, shot } = input
  const duration = shotGenDuration(shot)
  const product = String(input.productTitle || board.productTitle || 'the product tee').slice(0, 80)
  const printLock = normalizePrintLock(
    String(input.printLock || board.heroDetails?.join('; ') || product),
  )

  const doNot = [
    'Do not redesign, restyle, or replace the chest print',
    'Do not invent Woody/Buzz/Slinky layouts different from the product photo',
    'No traffic-cone-free full character parade; cones stay as hats on the print',
    'No burned-in text, captions, BOARD UI, tables, watermarks',
    'No plastic CGI skin; no motion blur on the print art',
    'No second product, no mockup collage, no storyboard document frames',
  ]

  const foley = (shot.audioCues || []).join('; ')
  const bgm = board.bgm || 'warm lifestyle underscore'
  const ambient = board.ambient || 'soft room tone'
  const audio = buildGrokNativeAudioClause({
    duration,
    audioBed: `${bgm}; ambient ${ambient}${foley ? `; foley: ${foley}` : ''}`,
    mood: board.emotionalJob || product,
  })

  const maxTotal = 1400
  const audioBudget = Math.min(audio.length + 2, 380)
  const visualMax = maxTotal - audioBudget

  // Print lock FIRST so model attends before lifestyle invent
  const visual = [
    `${duration}s ${board.aspectRatio || '9:16'} photoreal product video.`,
    `IMAGE-TO-VIDEO from the attached PRODUCT PHOTO (source of truth).`,
    `PRINT LOCK — identical every frame, flat DTG on fabric: ${printLock}`,
    `Animate ONLY camera, hands, light, fabric micro-motion around that fixed print.`,
    `SCENE (framing only): ${String(shot.title).slice(0, 60)}. ${String(shot.scene).slice(0, 160)}`,
    `ACTION: ${String(shot.onFrameAction).slice(0, 100)}`,
    `CAMERA: ${String(shot.camera).slice(0, 100)}. One continuous shot, no hard cuts.`,
    `Print must stay ≥40% of frame when visible; tack-sharp edges.`,
    `Product: ${product}.`,
    `DO NOT: ${doNot.join('; ')}.`,
  ].join(' ').replace(/\s+/g, ' ').trim().slice(0, visualMax)

  return `${visual} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, maxTotal)
}
