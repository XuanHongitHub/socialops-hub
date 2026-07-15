/**
 * Fidelity-first shot rewrites for product I2V.
 * Outdoor "full body worn" beats cause Grok to invent alternate prints.
 * Keep storyboard rhythm but force print-safe framing.
 */
import type { StoryboardBoard, StoryboardShot } from './types'

/** Concrete print fingerprint for THIS SKU family (cone Abbey tee). Generic fallback OK. */
export function normalizePrintLock(raw: string): string {
  let s = String(raw || '').replace(/\s+/g, ' ').trim()
  // Prefer concrete geometry over brand names that invite hallucination
  if (/cone|traffic|abbey|crosswalk|zebra/i.test(s)) {
    s = [
      'EXACT print from product photo only:',
      'small cartoon characters walking L→R on grey zebra crosswalk stripes,',
      'EACH character wears a large orange traffic cone as a hat covering the head,',
      'flat DTG on burnt-orange vintage cotton, single front chest print only,',
      'no second panel, no alternate cast, no full-size Woody/Buzz redesign without cones as hats',
    ].join(' ')
  }
  return s.slice(0, 320)
}

/**
 * Rewrite board-plan / template shots so I2V stays print-locked.
 * Story beats preserved as camera/energy, not as "invent a model and redraw art".
 */
export function applyFidelityShotRecipes(
  board: StoryboardBoard,
  printLock: string,
): StoryboardBoard {
  const lock = normalizePrintLock(printLock || board.heroDetails?.join(' ') || '')
  const shots = (board.shots || []).map((shot, i) => fidelityRewriteOne(shot, i, lock))
  return {
    ...board,
    heroDetails: lock ? [lock, ...(board.heroDetails || [])].slice(0, 4) : board.heroDetails,
    doNot: [
      ...(board.doNot || []),
      'Do not redesign the chest print',
      'Do not swap characters or remove traffic-cone hats from the print',
      'Do not invent a different Toy Story layout',
      'Print must match the product photo pixel-for-pixel intent',
    ].filter((v, idx, a) => a.indexOf(v) === idx).slice(0, 10),
    shots,
  }
}

function fidelityRewriteOne(shot: StoryboardShot, index: number, printLock: string): StoryboardShot {
  const id = shot.id || `S0${index + 1}`
  const n = index // 0,1,2

  // Detect invent-heavy outdoor / worn language from board parse
  const risky = /walk|street|park|public|friend|wearer|model|outfit|strut|crowd/i.test(
    `${shot.scene} ${shot.onFrameAction} ${shot.title}`,
  )

  if (n === 0) {
    // S01 — First glance: flat-lay / hands (proven high fidelity)
    return {
      ...shot,
      id: id || 'S01',
      title: shot.title || 'The First Glance',
      scene: [
        'Tabletop product reveal of the SAME folded burnt-orange tee as the product photo.',
        'Print fully readable: traffic-cone hats on characters crossing zebra stripes.',
        printLock ? `Print: ${printLock.slice(0, 140)}` : '',
      ].filter(Boolean).join(' '),
      onFrameAction: 'Hands enter frame and gently touch or smooth the fabric near the print — no covering the whole print.',
      camera: 'slow push-in medium → tight on the chest print, 35mm, one continuous shot',
      audioCues: shot.audioCues?.length ? shot.audioCues : ['soft cotton rustle'],
    }
  }

  if (n === 1) {
    // S02 — was "walking outdoor" (failed hard). Rewrite to fidelity-safe lifestyle.
    // Still "energy / public vibe" via bokeh background, NOT full-body invent print.
    return {
      ...shot,
      id: id || 'S02',
      title: risky ? 'Print in daylight — chest hero' : (shot.title || 'Lifestyle beat'),
      scene: [
        'Photoreal medium close-up of the SAME tee (chest and print dominate the frame).',
        'Soft daylight outdoor bokeh behind — trees or street blur only, NOT a fashion lookbook redraw.',
        'If a person is present: torso only, face optional soft, NEVER redesign the print.',
        'Print must remain the exact cone-hat parade on zebra stripes from the product photo.',
        printLock ? `Print lock: ${printLock.slice(0, 120)}` : '',
      ].filter(Boolean).join(' '),
      onFrameAction: 'Very slight fabric sway or handheld micro-motion; print stays sharp and unchanged.',
      camera: 'chest-level medium close-up, gentle lateral drift or micro push-in, keep print ≥45% of frame',
      audioCues: shot.audioCues?.length ? shot.audioCues : ['soft outdoor air', 'fabric rustle'],
    }
  }

  // S03 — hands / connection on print
  return {
    ...shot,
    id: id || 'S03',
    title: shot.title || 'Close on print',
    scene: [
      'Extreme close product moment on the SAME print art as the product photo.',
      'Hands or fingers near the print for scale — print remains fully legible.',
      printLock ? `Print: ${printLock.slice(0, 140)}` : '',
    ].filter(Boolean).join(' '),
    onFrameAction: 'Fingertips tap or rest beside the print; do not smear or replace artwork.',
    camera: 'tight close-up rack focus hands → print, 50mm, one continuous shot',
    audioCues: shot.audioCues?.length ? shot.audioCues : ['soft fingertip tap', 'quiet end click'],
  }
}
