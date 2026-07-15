/**
 * Dual-constraint storyboard: SCENARIO (board) + PRODUCT (print) are both hard goals.
 *
 * Root failure modes:
 *  A) Board I2V as hero → animates document (wrong product)
 *  B) Flat product I2V + "full-body outdoor walk" → model invents body AND redraws print
 *  C) Over-rewrite scenario → product OK but storyboard wrong
 *
 * Strategy:
 *  - Keep board beat intent (title/energy/place/camera mood)
 *  - Choose framing that I2V can do WITHOUT inventing a new print
 *  - Per-shot hero: lifestyle/on-body photo if stack has it, else product-safe framing
 */

import type { ClassifiedRef } from './classifyRefImage'
import type { StoryboardBoard, StoryboardShot } from './types'

export type ShotRisk = 'print_safe' | 'onbody_risk' | 'detail'

export type ExecutableShot = StoryboardShot & {
  risk: ShotRisk
  /** Board intent kept for logging / UI */
  scenarioIntent: string
  /** Hero preference for this beat */
  heroPref: 'flat_product' | 'lifestyle_worn' | 'either'
  framingNote: string
}

export function detectShotRisk(shot: StoryboardShot): ShotRisk {
  const blob = `${shot.title} ${shot.scene} ${shot.onFrameAction} ${shot.camera}`.toLowerCase()
  if (/close|ecu|extreme|finger|hand|rack focus|detail|print only/i.test(blob) && !/walk|street|park/i.test(blob))
    return 'detail'
  if (/walk|street|park|public|friend|wearer|model|outfit|strut|crowd|tracking|steadicam|over-the-shoulder/i.test(blob))
    return 'onbody_risk'
  return 'print_safe'
}

export function normalizePrintLock(raw: string): string {
  let s = String(raw || '').replace(/\s+/g, ' ').trim()
  if (/cone|traffic|abbey|crosswalk|zebra/i.test(s)) {
    s = [
      'EXACT chest print from the attached product photo:',
      'cartoon characters walking left-to-right on grey zebra crosswalk stripes;',
      'each small figure wears a large orange traffic cone as a hat;',
      'flat single-panel DTG on burnt-orange washed cotton;',
      'do not replace with full-size Woody/Buzz parade without cone hats',
    ].join(' ')
  }
  return s.slice(0, 340)
}

/**
 * Build executable shots: preserve scenario intent, constrain framing for dual success.
 */
export function buildExecutableShots(
  board: StoryboardBoard,
  printLock: string,
  hasLifestyleHero: boolean,
): ExecutableShot[] {
  const lock = normalizePrintLock(printLock || board.heroDetails?.join(' ') || '')
  const shots = board.shots?.length ? board.shots : []
  return shots.map((shot, i) => toExecutable(shot, i, lock, hasLifestyleHero))
}

function toExecutable(
  shot: StoryboardShot,
  index: number,
  printLock: string,
  hasLifestyleHero: boolean,
): ExecutableShot {
  const risk = detectShotRisk(shot)
  const intent = [
    shot.title,
    shot.scene,
    shot.camera,
  ].filter(Boolean).join(' · ').slice(0, 200)

  // ── Beat 0 / print_safe: flat-lay first glance ──
  if (index === 0 || risk === 'print_safe' && index !== 1) {
    if (index === 0) {
      return {
        ...shot,
        id: shot.id || 'S01',
        risk: 'print_safe',
        scenarioIntent: intent,
        heroPref: 'flat_product',
        framingNote: 'flat-lay / hands — high print fidelity',
        title: shot.title || 'First glance',
        scene: [
          `Story beat: ${shot.title || 'first glance'}.`,
          'Same folded product as product photo on a surface; hands discover the print.',
          'Emotional: recognition / warm nostalgia (from board).',
          `Print (immutable): ${printLock.slice(0, 160)}`,
        ].join(' '),
        onFrameAction: shot.onFrameAction?.slice(0, 120)
          || 'Hands enter and gently touch fabric beside the print — print stays fully visible.',
        camera: /push|dolly|close/i.test(shot.camera)
          ? shot.camera
          : 'slow push-in medium to tight on chest print, 35mm, one continuous shot',
      }
    }
  }

  // ── On-body / public energy beat (usually S02) ──
  if (risk === 'onbody_risk' || index === 1) {
    if (hasLifestyleHero) {
      // Can attempt worn / outdoor with lifestyle ref as hero
      return {
        ...shot,
        id: shot.id || 'S02',
        risk: 'onbody_risk',
        scenarioIntent: intent,
        heroPref: 'lifestyle_worn',
        framingNote: 'lifestyle/on-body ref available — preserve board outdoor intent + print lock',
        title: shot.title || 'Stepping out',
        scene: [
          `Story beat from board: ${shot.title || 'public / playful energy'}.`,
          String(shot.scene).slice(0, 140),
          'Use the attached lifestyle/product photo as identity; keep the SAME chest print as catalog.',
          `Print (immutable): ${printLock.slice(0, 140)}`,
          'If walking: medium-close chest-up preferred so print stays readable (≥40% frame).',
        ].join(' '),
        onFrameAction: String(shot.onFrameAction || 'Natural motion; friends optional soft reaction').slice(0, 120),
        camera: String(shot.camera || 'tracking mid-chest, gentle energy').slice(0, 120),
      }
    }

    // No lifestyle photo: KEEP scenario energy WITHOUT full-body invent (dual constraint)
    return {
      ...shot,
      id: shot.id || 'S02',
      risk: 'onbody_risk',
      scenarioIntent: intent,
      heroPref: 'flat_product',
      framingNote: 'no on-body ref — scenario via outdoor context + product-held / chest-frame, not invent model print',
      title: shot.title || 'Playful in public',
      scene: [
        `Story beat from board (intent kept): ${shot.title || 'stepping out / public'}.`,
        'Feeling of being outdoors / daylight / movement energy from the board.',
        'Frame: person mostly out of frame OR only arms/hands holding the SAME folded/hung tee toward camera in outdoor light,',
        'OR tight chest crop if a body is implied — print must match product photo exactly.',
        'Do NOT invent a fashion model wearing a redesigned Toy Story graphic.',
        `Print (immutable): ${printLock.slice(0, 150)}`,
      ].join(' '),
      onFrameAction: 'Handheld micro-sway as if walking; print sharp and unchanged.',
      camera: 'handheld chest-level product hero, soft outdoor bokeh, gentle lateral energy (board tracking intent without full-body invent)',
      audioCues: shot.audioCues?.length ? shot.audioCues : ['soft outdoor air', 'footstep distant', 'fabric rustle'],
    }
  }

  // ── Detail / close connection ──
  return {
    ...shot,
    id: shot.id || 'S03',
    risk: 'detail',
    scenarioIntent: intent,
    heroPref: 'flat_product',
    framingNote: 'hands + print close — high fidelity',
    title: shot.title || 'Shared smile / close',
    scene: [
      `Story beat: ${shot.title || 'close connection'}.`,
      'Tactile close-up on the same product print; hands share the moment.',
      `Print (immutable): ${printLock.slice(0, 160)}`,
    ].join(' '),
    onFrameAction: String(shot.onFrameAction || 'Hands meet near the print').slice(0, 120),
    camera: /close|ecu|rack/i.test(shot.camera)
      ? shot.camera
      : 'extreme close-up rack focus hands to print, 50mm',
  }
}

/** Pick I2V image URL for a shot given stack classification. */
export function pickHeroForShot(
  exec: ExecutableShot,
  flatHeroUrl: string,
  classified: ClassifiedRef[],
): { url: string, reason: string } {
  if (exec.heroPref === 'lifestyle_worn') {
    const life = classified
      .filter(c => c.role === 'lifestyle' || (c.role === 'product_hero' && c.url !== flatHeroUrl))
      .sort((a, b) => b.confidence - a.confidence)[0]
    // Prefer a non-flat lifestyle if present; else flat product (scenario soft-path already in scene)
    if (life && life.url !== flatHeroUrl && life.role === 'lifestyle')
      return { url: life.url, reason: 'lifestyle_ref_for_onbody_beat' }
  }
  return { url: flatHeroUrl, reason: 'product_flat_hero' }
}

export function dualConstraintPrompt(input: {
  duration: number
  aspectRatio: string
  productTitle?: string
  printLock: string
  exec: ExecutableShot
  hasHeroImage: boolean
  audioClause: string
}): string {
  const e = input.exec
  const product = String(input.productTitle || 'product').slice(0, 80)
  const printLock = normalizePrintLock(input.printLock)

  const visual = [
    `${input.duration}s ${input.aspectRatio} photoreal UGC product video.`,
    input.hasHeroImage
      ? 'IMAGE-TO-VIDEO from the attached photo as product identity source of truth.'
      : `Show product: ${product}.`,
    // Dual hard constraints — equal weight
    `CONSTRAINT A — SCENARIO (must feel like this board beat): ${e.scenarioIntent.slice(0, 180)}.`,
    `Framing: ${e.framingNote}. SCENE: ${String(e.scene).slice(0, 200)}`,
    `ACTION: ${String(e.onFrameAction).slice(0, 110)}`,
    `CAMERA: ${String(e.camera).slice(0, 110)}. One continuous shot, no hard cuts.`,
    `CONSTRAINT B — PRODUCT PRINT (immutable every frame, flat on fabric): ${printLock}`,
    'Animate only camera, hands, light, fabric micro-motion — NEVER redesign the print art.',
    'Print legible ≥40% of frame when product is visible. Tack-sharp print edges.',
    'DO NOT: invent alternate cast/layout; remove cone hats from print; BOARD UI chrome; captions; plastic CGI skin; blur print.',
  ].join(' ').replace(/\s+/g, ' ').trim()

  const max = 1400
  const audio = input.audioClause
  const budget = Math.min(audio.length + 2, 360)
  return `${visual.slice(0, max - budget)} ${audio}`.replace(/\s+/g, ' ').trim().slice(0, max)
}
