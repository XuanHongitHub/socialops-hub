import { generatedVideoDir } from '@/app/api/ai/storage'
/**
 * Storyboard pipeline (benchmark path from high-quality grok.com commercials):
 *  1) Classify refs — product hero only for I2V; board = plan document only
 *  2) Vision-parse board → shot beats (scenario text)
 *  3) Print lock from product vision
 *  4) ONE continuous commercial prompt (Scene 1/2/3 timestamps)
 *  5) Single product-image I2V — no multi-ref board crops (they pollute / break video)
 */
import { randomUUID } from 'node:crypto'
import {
  createGrokVideo,
  recordGrokAccountUsage,
  resolveGrokVideoModel,
  waitForGrokVideo,
} from '@/app/api/ai/providers/grok/_client'
import { prepareProductRefForI2V } from '@/app/api/ai/providers/imagePrep'
import { clampPublishPack, getAssets, saveAssets, type AiAsset } from '@/app/api/ai/providers/_local'
import { runProductCreativeAgent } from '@/app/api/ai/providers/productCreativeAgent'
import { classifyRefImages, pickStoryboardHero, type ClassifiedRef } from './classifyRefImage'
import {
  buildExecutableShots,
  normalizePrintLock,
} from './dualConstraint'
import { buildCommercialStoryboardPrompt } from './commercialPrompt'
import { autoBoardFromProduct, parseBoardPlanFromImages } from './parseBoardPlan'
import { buildGrokNativeAudioClause } from '@/app/api/ai/providers/productVideoMotion'
import {
  type StoryboardBoard,
  type StoryboardGenerateInput,
} from './types'

export type StoryboardProgress = {
  percent: number
  stage: string
  shotId?: string
  shotIndex?: number
  shotTotal?: number
  errorCode?: string
  planSource?: string
}

export type StoryboardResult = {
  videoUrl: string
  coverUrl?: string
  title: string
  description: string
  topics: string[]
  board: StoryboardBoard
  shotUrls: string[]
  model: string
  aspectRatio: string
  duration: number
  resolution: string
  heroUrl: string
  printLock: string
  planSource: 'client' | 'vision' | 'template' | 'agent'
  classified: Array<{ url: string, role: string, confidence: number }>
}

function buildPrintLock(input: {
  userPrompt?: string
  productTitle?: string
  heroDetails?: string[]
  visionPrint?: string
  visionColors?: string
  visionType?: string
}): string {
  const fromUser = String(input.userPrompt || '')
  const printLine = fromUser.match(/Print\/art:\s*(.+)/i)?.[1]
    || fromUser.match(/Print:\s*(.+)/i)?.[1]
    || input.visionPrint
    || ''
  const typeLine = fromUser.match(/Type:\s*(.+)/i)?.[1] || input.visionType || ''
  const colors = fromUser.match(/Colors:\s*(.+)/i)?.[1] || input.visionColors || ''
  const bits = [
    printLine.trim(),
    typeLine.trim(),
    colors.trim(),
    ...(input.heroDetails || []),
    input.productTitle,
  ].filter(Boolean)
  return bits.join(' · ').replace(/\s+/g, ' ').trim().slice(0, 300)
    || 'exact front print on the attached product photo — do not invent alternate artwork'
}

/** Prefer 1.5 for single-product I2V commercial (strong first-frame lock on print). */
function forceStoryboardModel(requested: string) {
  const raw = String(requested || 'grok-imagine-video-1.5').replace(/^grok::/, '')
  if (!raw || raw === 'cx_agy')
    return 'grok-imagine-video-1.5'
  // Keep explicit user choice; otherwise default 1.5 for product I2V
  if (/imagine-video/i.test(raw))
    return raw
  return resolveGrokVideoModel({ model: raw, mode: 'image_to_video', referenceImageCount: 1 })
}

export async function runStoryboardGeneration(
  input: StoryboardGenerateInput,
  onProgress?: (p: StoryboardProgress) => void | Promise<void>,
): Promise<StoryboardResult> {
  const candidates = [
    input.heroImageUrl,
    ...(input.extraImageUrls || []),
  ]
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)

  if (!candidates.length)
    throw new Error('NO_PRODUCT: Storyboard needs at least one image (product photo preferred)')

  await onProgress?.({ percent: 2, stage: 'Classifying refs (product vs board plan)' })
  const classified = await classifyRefImages(candidates)
  const boards = classified.filter(c => c.role === 'board_plan')
  const picked = pickStoryboardHero(classified)

  if (!picked.hero) {
    const code = picked.errorCode || 'NO_PRODUCT'
    throw new Error(
      `${code}: Storyboard I2V needs a product photo. `
      + (code === 'HERO_WAS_BOARD'
        ? 'Stack only has a BOARD/info deck — add a flat-lay product photo (board is plan-only).'
        : 'Upload a product photo.'),
    )
  }

  const hero = picked.hero.url
  const model = forceStoryboardModel(input.model || 'grok-imagine-video-1.5')
  const resolution = String(input.resolution || '1080p')
  const aspectRatio = '9:16'
  const targetDuration = Math.min(15, Math.max(6, Number(input.duration || 10) || 10))

  await onProgress?.({
    percent: 5,
    stage: boards.length
      ? `Hero=product I2V · board=plan only (${boards.length} doc) · ${targetDuration}s`
      : `Hero=product I2V · auto commercial · ${targetDuration}s`,
  })

  // ── Plan: client board | vision-parse board image | auto from agent ──
  let board: StoryboardBoard
  let planSource: StoryboardResult['planSource'] = 'template'
  let seoTitle = input.productTitle || 'Storyboard product video'
  let seoCaption = input.productNotes || ''
  let seoTags: string[] = []
  let visionPrint = ''
  let visionColors = ''
  let visionType = ''

  if (input.board?.shots?.length) {
    board = { ...input.board, aspectRatio: '9:16' }
    planSource = 'client'
    await onProgress?.({ percent: 8, stage: 'Using client storyboard plan', planSource })
  }
  else if (boards.length) {
    await onProgress?.({ percent: 8, stage: 'Vision: reading storyboard board document…', planSource: 'vision' })
    const parsed = await parseBoardPlanFromImages({
      boardImageUrls: boards.map(b => b.url),
      productTitle: input.productTitle,
      userPrompt: input.userPrompt,
      timeoutMs: 42_000,
    })
    board = parsed.board
    planSource = parsed.source === 'vision' ? 'vision' : 'template'
    await onProgress?.({
      percent: 14,
      stage: planSource === 'vision'
        ? `Board plan parsed (${parsed.provider || 'vision'}) · ${board.shots.length} shots`
        : 'Board parse fallback → template beats',
      planSource,
    })
  }
  else {
    await onProgress?.({ percent: 8, stage: 'No board ref · building auto 3-beat plan', planSource: 'template' })
    board = autoBoardFromProduct({
      productTitle: input.productTitle,
      sceneHint: input.userPrompt,
    })
    planSource = 'template'
  }

  // Enrich SEO + print lock from product creative agent (product image only)
  await onProgress?.({ percent: 16, stage: 'Vision product: print lock + SEO' })
  try {
    const plan = await runProductCreativeAgent({
      productTitle: input.productTitle || board.productTitle,
      productUrl: input.productUrl,
      productNotes: input.productNotes,
      userPrompt: input.userPrompt,
      imageUrl: hero,
      platforms: input.platforms,
      duration: targetDuration,
      aspectRatio,
      hasReferenceImage: true,
      bugsellCatalog: Boolean(input.productUrl && /bugsell/i.test(String(input.productUrl))),
      timeoutMs: 40_000,
    })
    seoTitle = plan.title || seoTitle
    seoCaption = plan.caption || seoCaption
    seoTags = plan.hashtags || []
    visionPrint = plan.vision?.printOrArtwork || ''
    visionColors = plan.vision?.colors || ''
    visionType = plan.vision?.productType || ''
    // Only rebuild beats when we did not already parse a board document / client plan
    if (planSource === 'template') {
      board = autoBoardFromProduct({
        productTitle: seoTitle,
        printLock: visionPrint || board.heroDetails?.[0],
        mood: plan.vision?.mood || plan.vision?.giftOccasion,
        sceneHint: plan.vision?.scene || input.userPrompt,
        camera: plan.motionBrief?.camera,
        audioBed: plan.motionBrief?.audioBed || board.bgm,
      })
      if (plan.source === 'agent')
        planSource = 'agent'
    }
    else {
      // Board plan from vision/client — still inject print details
      if (visionPrint) {
        board.heroDetails = [visionPrint, visionColors, visionType].filter(Boolean).slice(0, 5)
      }
      if (plan.motionBrief?.audioBed && !board.bgm)
        board.bgm = plan.motionBrief.audioBed
      if (plan.vision?.mood)
        board.emotionalJob = plan.vision.mood
    }
  }
  catch (e) {
    console.warn('[storyboard] product agent failed', e)
  }

  board.aspectRatio = '9:16'
  board.productTitle = board.productTitle || input.productTitle || seoTitle
  board.duration = targetDuration
  // Scale shot windows to full clip (thirds) for 10s / 15s UI config
  if (board.shots?.length) {
    const edges = [0, targetDuration / 3, (2 * targetDuration) / 3, targetDuration]
    board.shots = board.shots.slice(0, 3).map((s, i) => ({
      ...s,
      tStart: Math.round(edges[i]! * 10) / 10,
      tEnd: Math.round(edges[i + 1]! * 10) / 10,
    }))
  }
  // Sanitize: never let board chrome words into filmable scenes
  board.doNot = [
    ...(board.doNot || []),
    'No storyboard document UI, BOARD headers, tables, HERO DETAILS, or production notes on screen',
    'No alternate print layouts — one print identity only',
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8)

  if (!board.shots?.length) {
    board = autoBoardFromProduct({ productTitle: seoTitle, printLock: visionPrint })
    planSource = 'template'
  }

  const printLock = normalizePrintLock(buildPrintLock({
    userPrompt: input.userPrompt,
    productTitle: input.productTitle || seoTitle,
    heroDetails: board.heroDetails,
    visionPrint,
    visionColors,
    visionType,
  }))

  // Keep board scenario text; do NOT crop board frames as visual refs (pollutes video)
  const execShots = buildExecutableShots(board, printLock, false)
  board = { ...board, shots: execShots }
  await onProgress?.({
    percent: 19,
    stage: 'Commercial plan: Scene 1/2/3 prompt · single product image only',
    planSource,
  })

  const pack = clampPublishPack(
    { title: seoTitle, caption: seoCaption || board.cta, hashtags: seoTags },
    { topicMax: 5, titleMax: 80 },
  )

  const { resolveImageForVision } = await import('@/app/api/ai/providers/resolveVisionImage')
  await onProgress?.({ percent: 22, stage: 'Preparing product photo (I2V first frame)…' })
  let productDataUrl: string
  try {
    const prepared = await prepareProductRefForI2V(hero, '9:16', { maxSide: 1536 })
    productDataUrl = prepared.dataUrl
  }
  catch {
    const resolved = await resolveImageForVision(hero)
    if (!resolved)
      throw new Error(`Product image unreadable: ${hero.slice(0, 80)}`)
    productDataUrl = resolved
  }

  const singleDur = targetDuration
  const audioClause = buildGrokNativeAudioClause({
    duration: singleDur,
    audioBed: `${board.bgm || 'warm lifestyle'}; ambient ${board.ambient || 'room tone'}`,
    mood: board.emotionalJob || input.productTitle || seoTitle,
  })
  const prompt = buildCommercialStoryboardPrompt({
    duration: singleDur,
    aspectRatio: '9:16',
    productTitle: input.productTitle || board.productTitle || seoTitle,
    printLock,
    board,
    audioClause,
  })

  const shotHeroLog = [{
    shotId: 'FULL',
    hero,
    reason: 'commercial_prompt_single_product_i2v',
    risk: 'print_safe',
    mode: 'image_to_video',
    refCount: 1,
    refs: ['1:product'],
  }]
  let usedModel = forceStoryboardModel(model)

  await onProgress?.({
    percent: 28,
    stage: `I2V commercial ${singleDur}s · product only · multi-scene prompt`,
    planSource,
  })

  const submission = await createGrokVideo({
    model: usedModel,
    prompt,
    duration: singleDur,
    aspectRatio: '9:16',
    resolution,
    image: productDataUrl,
    mode: 'image_to_video',
  })
  if (submission.model)
    usedModel = submission.model

  const done = await waitForGrokVideo(
    submission.account,
    submission.requestId,
    300_000,
    async (prog) => {
      await onProgress?.({
        percent: Math.min(88, 30 + Math.round(prog.percent * 0.55)),
        stage: `Commercial clip: ${prog.stage} ${prog.percent}%`,
        planSource,
      })
    },
  )
  await recordGrokAccountUsage(submission.account.id, 1).catch(() => null)
  const shotUrls = [done.url]

  await onProgress?.({ percent: 90, stage: 'Saving commercial video…', planSource })
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { homedir } = await import('node:os')
  const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  const outName = `storyboard-${randomUUID()}.mp4`
  const finalVideoPath = join(generatedVideoDir, outName)
  await mkdir(generatedVideoDir, { recursive: true })
  const res = await fetch(done.url, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok)
    throw new Error(`Download commercial clip failed HTTP ${res.status}`)
  await writeFile(finalVideoPath, Buffer.from(await res.arrayBuffer()))
  const finalVideoUrl = `/api/ai/assets/${outName.replace(/\.mp4$/i, '')}/file`
  const genMode = 'commercial_i2v_single_product' as const

  const idFromUrl = finalVideoUrl.match(/\/api\/ai\/assets\/([^/]+)\/file/)?.[1]
    || finalVideoUrl.split('/').filter(Boolean).pop()?.replace(/\.mp4$/i, '')
    || randomUUID()
  const assets = await getAssets()
  const asset: AiAsset = {
    id: idFromUrl,
    type: 'video',
    title: pack.title || board.title,
    url: `/api/ai/assets/${idFromUrl}/file`,
    path: finalVideoPath,
    provider: 'grok-storyboard',
    metadata: {
      storyboard: true,
      boardId: board.boardId,
      shots: board.shots.map(s => s.id),
      aspectRatio: '9:16',
      duration: board.duration,
      heroUrl: hero,
      printLock,
      planSource,
      model: usedModel,
      genMode,
      commercialPrompt: true,
      singleProductI2V: true,
      multiRefDisabled: true,
      motionPrompt: prompt.slice(0, 500),
      shotHeroLog,
      scenarioIntents: execShots.map(s => ({ id: s.id, intent: s.scenarioIntent, risk: s.risk })),
    },
    createdAt: new Date().toISOString(),
  }
  await saveAssets([asset, ...assets.filter(a => a.id !== asset.id)].slice(0, 200))

  await onProgress?.({ percent: 95, stage: 'Saving draft…', planSource })

  return {
    videoUrl: asset.url,
    coverUrl: hero.startsWith('http') || hero.startsWith('/') ? hero : undefined,
    title: pack.title,
    description: pack.caption || board.cta || '',
    topics: pack.hashtags,
    board,
    shotUrls,
    model: `grok::${usedModel}`,
    aspectRatio: '9:16',
    duration: board.duration,
    resolution: resolution === '1080p' ? '1080p' : resolution,
    heroUrl: hero,
    printLock,
    planSource,
    classified: classified.map((c: ClassifiedRef) => ({
      url: c.url,
      role: c.role,
      confidence: c.confidence,
    })),
  }
}
