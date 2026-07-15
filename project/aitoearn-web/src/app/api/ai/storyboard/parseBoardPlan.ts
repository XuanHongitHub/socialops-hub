/**
 * Parse a storyboard / info-deck image into structured BoardPlan.
 * Board = choreography only — never used as I2V pixel hero.
 */
import { callGrokChat } from '@/app/api/ai/providers/grok/_client'
import { call9RouterChat, parseAiContentPack } from '@/app/api/ai/providers/_local'
import { resolveImageForVision } from '@/app/api/ai/providers/resolveVisionImage'
import {
  defaultProductStoryboard,
  type StoryboardBoard,
  type StoryboardShot,
} from './types'

function asStr(v: unknown, max = 400) {
  return String(v || '').trim().slice(0, max)
}

function asStrArr(v: unknown, max = 8): string[] {
  if (!Array.isArray(v))
    return []
  return v.map(x => asStr(x, 120)).filter(Boolean).slice(0, max)
}

function normalizeShots(raw: unknown, fallback: StoryboardBoard): StoryboardShot[] {
  if (!Array.isArray(raw) || raw.length < 1)
    return fallback.shots
  const shots: StoryboardShot[] = []
  const n = Math.min(4, Math.max(2, raw.length))
  const total = 10
  for (let i = 0; i < n; i++) {
    const row = (raw[i] && typeof raw[i] === 'object' ? raw[i] : {}) as Record<string, unknown>
    const tStart = Number(row.tStart ?? row.start ?? (i * total) / n)
    const tEnd = Number(row.tEnd ?? row.end ?? ((i + 1) * total) / n)
    shots.push({
      id: asStr(row.id, 8) || `S0${i + 1}`,
      tStart: Number.isFinite(tStart) ? tStart : (i * total) / n,
      tEnd: Number.isFinite(tEnd) ? tEnd : ((i + 1) * total) / n,
      title: asStr(row.title, 80) || fallback.shots[i]?.title || `Beat ${i + 1}`,
      scene: asStr(row.scene, 280) || fallback.shots[i]?.scene || 'Product lifestyle beat',
      onFrameAction: asStr(row.onFrameAction || row.action || row.onFrame, 200)
        || fallback.shots[i]?.onFrameAction
        || 'Natural product-focused action',
      camera: asStr(row.camera, 160) || fallback.shots[i]?.camera || 'slow push-in',
      audioCues: asStrArr(row.audioCues || row.audio, 4).length
        ? asStrArr(row.audioCues || row.audio, 4)
        : (fallback.shots[i]?.audioCues || []),
      doNot: asStrArr(row.doNot, 4),
    })
  }
  // Ensure 3 beats covering ~10s when board only had 2
  if (shots.length === 2) {
    const mid = (shots[0]!.tEnd + shots[1]!.tStart) / 2
    shots.splice(1, 0, {
      id: 'S02',
      tStart: shots[0]!.tEnd,
      tEnd: mid > shots[0]!.tEnd ? mid : shots[0]!.tEnd + 3,
      title: 'Lifestyle beat',
      scene: 'Product worn or handled in a natural lifestyle setting',
      onFrameAction: 'Gentle motion that keeps the print readable',
      camera: 'tracking mid-shot',
      audioCues: ['soft ambient'],
    })
  }
  // Normalize timeline to 0–10
  const last = shots[shots.length - 1]!
  if (last.tEnd < 9)
    last.tEnd = 10
  shots[0]!.tStart = 0
  return shots.slice(0, 3)
}

function boardFromParsed(
  parsed: Record<string, unknown>,
  fallback: StoryboardBoard,
  source: string,
): StoryboardBoard {
  const shots = normalizeShots(parsed.shots || parsed.scenes || parsed.storyboard, fallback)
  return {
    boardId: asStr(parsed.boardId, 40) || `BOARD-PARSED-${source}`,
    title: asStr(parsed.title, 100) || fallback.title,
    subtitle: asStr(parsed.subtitle, 120) || fallback.subtitle,
    duration: 10,
    aspectRatio: '9:16',
    bgm: asStr(parsed.bgm || parsed.audioBed, 160) || fallback.bgm,
    ambient: asStr(parsed.ambient, 120) || fallback.ambient,
    audioLogo: asStr(parsed.audioLogo, 80) || fallback.audioLogo,
    productTitle: asStr(parsed.productTitle, 100) || fallback.productTitle,
    heroDetails: asStrArr(parsed.heroDetails, 6).length
      ? asStrArr(parsed.heroDetails, 6)
      : fallback.heroDetails,
    emotionalJob: asStr(parsed.emotionalJob || parsed.mood, 80) || fallback.emotionalJob,
    cta: asStr(parsed.cta, 100) || fallback.cta,
    productionNotes: asStrArr(parsed.productionNotes, 6).length
      ? asStrArr(parsed.productionNotes, 6)
      : fallback.productionNotes,
    doNot: [
      ...asStrArr(parsed.doNot, 8),
      ...(fallback.doNot || []),
      'No on-screen storyboard UI, BOARD headers, tables, or production notes',
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8),
    shots,
  }
}

const PARSE_PROMPT = `You are reading a PRODUCT VIDEO STORYBOARD / production board DOCUMENT image (not the product to film).

Extract the production plan into JSON ONLY (no markdown). Ignore decorative chrome except the text meaning.

Return this shape:
{
  "boardId": "string",
  "title": "string",
  "subtitle": "string",
  "bgm": "music bed description",
  "ambient": "ambient bed",
  "audioLogo": "end sting if any",
  "emotionalJob": "emotion",
  "cta": "caption CTA if any",
  "heroDetails": ["print/fabric notes from the board"],
  "doNot": ["rules from DO NOT section"],
  "productionNotes": ["notes"],
  "shots": [
    {
      "id": "S01",
      "tStart": 0,
      "tEnd": 3.3,
      "title": "beat title",
      "scene": "where/what — lifestyle description only, NO UI chrome",
      "onFrameAction": "what hands/people do",
      "camera": "lens + move",
      "audioCues": ["foley timing"]
    }
  ]
}

Rules:
- Prefer exactly 3 shots covering ~0–10 seconds (S01, S02, S03).
- scene/camera/onFrameAction must be FILMABLE live-action beats for a real product photo.
- Do NOT include board headers, tables, or "BOARD-03" as on-screen content.
- If the board shows example still frames, describe the *intent* of each beat, not "show the frame thumbnail".`

/**
 * Vision-parse one or more board images into a StoryboardBoard.
 * Falls back to defaultProductStoryboard when parse fails.
 */
export async function parseBoardPlanFromImages(input: {
  boardImageUrls: string[]
  productTitle?: string
  userPrompt?: string
  timeoutMs?: number
}): Promise<{ board: StoryboardBoard, source: 'vision' | 'template', provider?: string }> {
  const fallback = defaultProductStoryboard({
    productTitle: input.productTitle,
    sceneHint: input.userPrompt,
  })

  const urls = (input.boardImageUrls || []).map(u => String(u || '').trim()).filter(Boolean).slice(0, 2)
  if (!urls.length)
    return { board: fallback, source: 'template' }

  const resolved: string[] = []
  for (const u of urls) {
    const r = await resolveImageForVision(u).catch(() => null)
    if (r)
      resolved.push(r)
  }
  if (!resolved.length)
    return { board: fallback, source: 'template' }

  const timeoutMs = Math.min(50_000, Math.max(15_000, Number(input.timeoutMs) || 40_000))
  const userText = [
    PARSE_PROMPT,
    input.productTitle ? `Product title context: ${input.productTitle}` : '',
    input.userPrompt ? `Staff notes: ${String(input.userPrompt).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n\n')

  let text = ''
  let provider = 'none'
  try {
    const r = await callGrokChat(userText, 'grok-4', {
      timeoutMs,
      system: 'Return strict JSON only. Extract storyboard plan from the document image.',
      imageUrls: resolved,
    })
    text = r.text
    provider = 'grok'
  }
  catch (e1) {
    console.warn('[parseBoardPlan] grok failed', e1)
    try {
      const r = await call9RouterChat(userText, {
        timeoutMs,
        system: 'Return strict JSON only.',
        imageUrls: resolved,
      })
      text = r.text
      provider = '9router'
    }
    catch (e2) {
      console.warn('[parseBoardPlan] 9router failed', e2)
      return { board: fallback, source: 'template' }
    }
  }

  if (!text?.trim())
    return { board: fallback, source: 'template', provider }

  const parsed = parseAiContentPack(text)
  const hasShots = Array.isArray(parsed.shots) || Array.isArray(parsed.scenes) || Array.isArray(parsed.storyboard)
  if (!hasShots && !parsed.title)
    return { board: fallback, source: 'template', provider }

  return {
    board: boardFromParsed(parsed, fallback, provider),
    source: 'vision',
    provider,
  }
}

/**
 * Auto board when no board ref image — product-aware 3-beat template.
 */
export function autoBoardFromProduct(input: {
  productTitle?: string
  printLock?: string
  mood?: string
  sceneHint?: string
  camera?: string
  audioBed?: string
}): StoryboardBoard {
  const board = defaultProductStoryboard({
    productTitle: input.productTitle,
    mood: input.mood,
    sceneHint: input.sceneHint,
  })
  if (input.printLock) {
    board.heroDetails = [
      input.printLock,
      ...(board.heroDetails || []),
    ].slice(0, 5)
  }
  if (input.camera && board.shots[0])
    board.shots[0].camera = input.camera
  if (input.audioBed)
    board.bgm = input.audioBed
  // Tie scenes to print lock so auto plan is not generic cartoon soup
  const lock = String(input.printLock || '').slice(0, 100)
  if (lock && board.shots[0]) {
    board.shots[0].scene = `Hands discover the folded product, pausing on the print: ${lock}`
    board.shots[2]!.onFrameAction = `Hands meet over the exact print (${lock}) — print stays sharp and unchanged`
  }
  return board
}
