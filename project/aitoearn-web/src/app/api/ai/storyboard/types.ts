/**
 * Storyboard Gen — multi-shot product video (BOARD-style).
 * Inspired by commercial boards like BOARD-03 "Crossing Memories".
 */

export type StoryboardShotId = 'S01' | 'S02' | 'S03' | string

export type StoryboardShot = {
  id: StoryboardShotId
  /** Seconds from clip start */
  tStart: number
  tEnd: number
  /** Beat title e.g. "The First Glance—Warm Nostalgia" */
  title: string
  scene: string
  onFrameAction: string
  camera: string
  audioCues: string[]
  doNot?: string[]
}

export type StoryboardBoard = {
  boardId: string
  title: string
  subtitle?: string
  /** Total duration seconds (sum of shots, typically 10) */
  duration: number
  aspectRatio: '9:16' | '4:5' | string
  bgm?: string
  ambient?: string
  audioLogo?: string
  productTitle?: string
  heroDetails?: string[]
  emotionalJob?: string
  cta?: string
  productionNotes?: string[]
  emotionalOpenings?: string[]
  doNot?: string[]
  shots: StoryboardShot[]
}

export type StoryboardGenerateInput = {
  groupId: string
  heroImageUrl: string
  /** Optional lifestyle / wearer refs */
  extraImageUrls?: string[]
  productTitle?: string
  productUrl?: string
  productNotes?: string
  userPrompt?: string
  board?: StoryboardBoard
  model?: string
  resolution?: string
  /** Target clip length from UI (e.g. 10 or 15). Scene windows scale to this. */
  duration?: number
  platforms?: string[]
  draftType?: 'draft' | 'video'
}

export function defaultProductStoryboard(input: {
  productTitle?: string
  mood?: string
  sceneHint?: string
}): StoryboardBoard {
  const title = String(input.productTitle || 'Product tee').trim().slice(0, 80)
  const mood = String(input.mood || 'warm nostalgia / gift smile').slice(0, 60)
  const scene = String(input.sceneHint || 'lifestyle reveal of the printed tee').slice(0, 120)

  return {
    boardId: 'BOARD-AUTO',
    title: 'CROSSING MEMORIES, PRODUCT STORY',
    subtitle: `${title} · 10s vertical · UGC lifestyle`,
    duration: 10,
    aspectRatio: '9:16',
    bgm: 'bouncy retro pop, 110 BPM, clean electric guitar with handclaps',
    ambient: 'soft room tone, distant city park laughter, soft breeze',
    audioLogo: 'quick toy wind-up click at 9.9s',
    productTitle: title,
    heroDetails: [
      'large playful print front & center',
      'soft lived-in cotton texture',
      'nostalgic gift palette',
    ],
    emotionalJob: mood,
    cta: 'Wear the memory. Share the smile.',
    productionNotes: [
      'Keep lighting cozy and natural — avoid harsh studio lights',
      'Maintain accurate crisp details of the actual print — no added text overlays',
      'Gestures and eye contact tell the story rather than captions',
    ],
    doNot: [
      'No plain white backgrounds or sterile studio setups',
      'Don\'t use generic clipart mockups — show the true printed art',
      'No exaggerated cartoon acting — keep reactions natural',
      'No on-screen burned-in text or hashtags',
    ],
    shots: [
      {
        id: 'S01',
        tStart: 0,
        tEnd: 3.3,
        title: 'The First Glance—Warm Nostalgia',
        scene: `A gentle reveal: hands discover the folded tee, pausing on the childhood-inspired print. ${scene}`,
        onFrameAction: 'Fingers trace over the cartoon print — brief moment of recognition, a smile forms.',
        camera: 'slow push-in from medium to tight on print, 35mm lens',
        audioCues: ['cotton rustle at 0.5s', 'subtle gasp of delight at 2.4s'],
      },
      {
        id: 'S02',
        tStart: 3.3,
        tEnd: 6.7,
        title: 'Stepping Out—Playful in Public',
        scene: 'Tee in action: the wearer walks confidently; others instantly recognize the print humor.',
        onFrameAction: 'Friends\' faces light up; one playful reaction; energy without overacting.',
        camera: 'tracking shot, steadicam, mid-chest height then pivot to over-the-shoulder',
        audioCues: ['soft shoe scuff at 3.8s', 'friend\'s laugh at 5.5s'],
      },
      {
        id: 'S03',
        tStart: 6.7,
        tEnd: 10,
        title: 'Close Connection—Shared Smile',
        scene: 'A tactile, joyful close-up: friends relive a pop-culture memory together, tee at the heart.',
        onFrameAction: 'Hands meet over the print, light laughter; camera racks focus onto vintage cartoon faces on fabric.',
        camera: 'extreme close-up, rack focus from hands to print, 50mm lens',
        audioCues: ['soft fingertip tap on print at 7.2s', 'wind-up toy click at 9.9s'],
      },
    ],
  }
}

export function shotDurationSeconds(shot: StoryboardShot) {
  return Math.max(3, Math.min(8, Math.round((shot.tEnd - shot.tStart) * 10) / 10))
}

/** Grok minimum duration is often 6s — pad short beats to 6–8s then we can trim on stitch if needed */
export function shotGenDuration(shot: StoryboardShot) {
  const raw = shot.tEnd - shot.tStart
  // Generate slightly longer than beat for safer trim; clamp to Grok 6–10
  return Math.min(10, Math.max(6, Math.ceil(raw + 2)))
}
