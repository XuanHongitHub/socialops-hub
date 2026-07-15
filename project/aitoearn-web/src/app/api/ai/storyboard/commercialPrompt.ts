/**
 * Board → commercial multi-scene text prompt (benchmark path).
 *
 * Insight from high-quality grok.com clips:
 * - Vision reads storyboard as SCENARIO text only
 * - One continuous 10s prompt with Scene 1/2/3 timestamps
 * - Single product image as I2V identity (no multi-ref board crops — they pollute)
 */

import type { StoryboardBoard, StoryboardShot } from './types'

function normalizePrintLock(raw: string): string {
  let s = String(raw || '').replace(/\s+/g, ' ').trim()
  if (/cone|traffic|abbey|crosswalk|zebra/i.test(s)) {
    s = [
      'EXACT chest print from the attached product photo:',
      'cartoon characters walking left-to-right on grey zebra crosswalk stripes;',
      'each small figure wears a large orange traffic cone as a hat;',
      'flat single-panel DTG on burnt-orange washed cotton',
    ].join(' ')
  }
  return s.slice(0, 340)
}

function sceneWindow(shot: StoryboardShot | undefined, fallback: string) {
  if (!shot)
    return fallback
  const a = Number(shot.tStart)
  const b = Number(shot.tEnd)
  if (!Number.isFinite(a) || !Number.isFinite(b))
    return fallback
  return `${a.toFixed(1)}-${b.toFixed(1)}s`
}

function cleanSceneText(s: string, max = 160) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/BOARD-|HERO DETAILS|DO NOT|PRODUCTION NOTES/gi, '')
    .trim()
    .slice(0, max)
}

/**
 * Fashion-commercial style prompt (user benchmark).
 * Example shape:
 *   A 10-second vertical fashion commercial for …
 *   Scene 1 (0-3.3s): …
 *   Scene 2 (3.3-6.7s): …
 *   Scene 3 (6.7-10s): …
 *   Style: … 9:16 vertical.
 */
export function buildCommercialStoryboardPrompt(input: {
  duration?: number
  aspectRatio?: string
  productTitle?: string
  printLock: string
  board: StoryboardBoard
  audioClause?: string
}): string {
  const d = Math.min(15, Math.max(6, Number(input.duration || input.board.duration || 10) || 10))
  const ar = input.aspectRatio || '9:16'
  const printLock = normalizePrintLock(input.printLock)
  const product = String(input.productTitle || input.board.productTitle || 'product').slice(0, 90)
  const shots = input.board.shots || []
  const s01 = shots[0]
  const s02 = shots[1]
  const s03 = shots[2]

  const mood = cleanSceneText(input.board.emotionalJob || 'warm nostalgic playful', 80)
  const bgm = cleanSceneText(input.board.bgm || 'soft retro pop, light guitar', 90)

  const scene1 = [
    `Scene 1 (${sceneWindow(s01, '0-3.3s')}):`,
    s01?.camera ? cleanSceneText(s01.camera, 90) : 'Overhead close-up',
    cleanSceneText(
      s01?.onFrameAction || s01?.scene
      || 'hand gliding over the print, lifting the shirt from a wooden drawer, warm bedroom daylight',
      180,
    ),
  ].join(' ')

  const scene2 = [
    `Scene 2 (${sceneWindow(s02, '3.3-6.7s')}):`,
    s02?.camera ? cleanSceneText(s02.camera, 90) : 'Mirror selfie / chest-up handheld',
    cleanSceneText(
      s02?.onFrameAction || s02?.scene
      || 'young woman wearing the same orange tee, playful pose, genuine smile, natural handheld shake',
      180,
    ),
    'exact same front print as the product photo — do not redesign artwork',
  ].join(' ')

  const scene3 = [
    `Scene 3 (${sceneWindow(s03, '6.7-10s')}):`,
    s03?.camera ? cleanSceneText(s03.camera, 90) : 'Low angle tracking outdoors',
    cleanSceneText(
      s03?.onFrameAction || s03?.scene
      || 'woman walking with laughing friends, playful salute, quick pan to shirt print',
      180,
    ),
    'print remains legible on chest',
  ].join(' ')

  const style = [
    'Style: warm natural daylight, candid nostalgic playful tone, vintage film warmth,',
    'photoreal UGC fashion commercial, continuous single take feel (soft transitions ok),',
    'no text, no subtitles, no captions, no hashtags, no storyboard UI, no pink page borders.',
    `${ar} vertical.`,
  ].join(' ')

  const open = [
    `A ${d}-second vertical fashion commercial for ${product}.`,
    printLock
      ? `Product identity (immutable print on fabric every frame): ${printLock}.`
      : 'Keep the exact front print from the attached product photo every frame — no alternate graphic.',
    'The attached image is the product source of truth; invent wardrobe/scene around it without redesigning the print.',
  ].join(' ')

  const body = [open, scene1, scene2, scene3, style, `Mood: ${mood}. Score bed: ${bgm}.`]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  const audio = String(input.audioClause || '').trim()
  if (!audio)
    return body.slice(0, 1600)

  const budget = Math.min(audio.length + 2, 320)
  return `${body.slice(0, 1600 - budget)} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, 1600)
}
