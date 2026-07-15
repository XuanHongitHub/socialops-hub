import { randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  call9RouterChat,
  clampPublishPack,
  discover9RouterModels,
  parseAiContentPack,
  productCaptionPackPrompt,
  productVideoMotionPrompt, // re-exported from productVideoMotion via providers/_local
  getAssets,
  readJson,
  renderSocialVideo,
  saveAssets,
  socialContentPrompt,
  writeJson,
} from '../providers/_local'
import {
  runProductCreativeAgent,
  templateProductCreativePlan,
} from '../providers/productCreativeAgent'
import { createMaterialFromGeneration } from '@/app/api/material/_local'
import {
  callGrokChat,
  createGrokImage,
  createGrokVideo,
  discoverGrokModels,
  formatGrokModelLabel,
  getGrokPoolSummary,
  recordGrokAccountUsage,
  waitForGrokVideo,
} from '../providers/grok/_client'
import {
  pickProductVideoAspect,
  prepareProductRefForI2V,
  probeImageSize,
} from '../providers/imagePrep'
import { extractVideoPoster } from '../providers/videoPoster'
import { generatedVideoDir } from '@/app/api/ai/storage'

export type LocalDraftTask = {
  id: string
  status: 'generating' | 'success' | 'failed'
  points: number
  errorMessage?: string
  request: Record<string, any>
  response?: Record<string, any>
  createdAt: string
  updatedAt: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const file = join(appData, 'SocialsHub', 'draft-generation-tasks.json')
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024

/** Soft loudness normalize + 192k AAC so Grok beds feel less tinny after download. */
async function enhanceArchivedVideoAudio(filePath: string) {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const run = promisify(execFile)
    const outPath = `${filePath}.loud.mp4`
    await run('ffmpeg', [
      '-y',
      '-i', filePath,
      '-c:v', 'copy',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      outPath,
    ], { timeout: 120_000, windowsHide: true })
    await rename(outPath, filePath)
    return true
  }
  catch (e) {
    console.warn('[draft-generation] audio loudnorm skipped', e instanceof Error ? e.message : e)
    return false
  }
}

async function saveArchivedVideoAsset(input: {
  taskId: string
  title: string
  provider: string
  bytes: Buffer
  sourceUrl?: string
  sourceKind?: string
}) {
  const assetId = `generated-${input.taskId}`
  const outputPath = join(generatedVideoDir, `${assetId}.mp4`)
  const tempPath = `${outputPath}.part`
  if (!input.bytes.length || input.bytes.length > MAX_ARCHIVE_BYTES)
    throw new Error('Generated video archive is empty or too large')
  await mkdir(generatedVideoDir, { recursive: true })
  await writeFile(tempPath, input.bytes)
  await rename(tempPath, outputPath)

  // Flow/Veo: strip visible watermark after archive (optional CLI tool)
  let watermark: Awaited<ReturnType<typeof import('@/app/api/ai/providers/extension/veoWatermarkRemover').removeVeoWatermarkFromFile>> | null = null
  if (/flow|veo/i.test(input.provider)) {
    try {
      const { removeVeoWatermarkFromFile } = await import(
        '@/app/api/ai/providers/extension/veoWatermarkRemover'
      )
      watermark = await removeVeoWatermarkFromFile(outputPath)
      if (watermark.skipped && watermark.reason === 'tool_not_found') {
        console.warn(
          '[draft-generation] Veo watermark tool not installed — video kept as-is. See SocialsHub/tools/',
        )
      }
    }
    catch (e) {
      console.warn('[draft-generation] watermark step failed', e)
    }
  }

  const audioEnhanced = await enhanceArchivedVideoAudio(outputPath)
  let finalBytes = input.bytes.length
  try {
    const { stat } = await import('node:fs/promises')
    finalBytes = (await stat(outputPath)).size
  }
  catch { /* keep original */ }

  const assets = await getAssets()
  const asset = {
    id: assetId,
    type: 'video' as const,
    title: input.title,
    // Query form — reliable on this Next Windows stack (dynamic [id]/file was 500)
    url: `/api/ai/assets/local-file?id=${encodeURIComponent(assetId)}`,
    path: outputPath,
    provider: input.provider,
    metadata: {
      sourceUrl: input.sourceUrl,
      sourceKind: input.sourceKind,
      archivedAt: new Date().toISOString(),
      bytes: finalBytes,
      taskId: input.taskId,
      audioEnhanced,
      watermarkRemoved: Boolean(watermark?.ok && !watermark.skipped),
      watermarkSkipped: watermark?.skipped || undefined,
      watermarkReason: watermark?.reason,
      watermarkTool: watermark?.toolPath,
      watermarkMs: watermark?.durationMs,
    },
    createdAt: new Date().toISOString(),
  }
  await saveAssets([asset, ...assets.filter(item => item.id !== assetId)].slice(0, 200))
  return asset
}

async function archiveGeneratedVideo(taskId: string, title: string, sourceUrl: string, provider: string) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(180_000) })
      if (!response.ok)
        throw new Error(`Video archive download HTTP ${response.status}`)
      const declaredSize = Number(response.headers.get('content-length') || 0)
      if (declaredSize > MAX_ARCHIVE_BYTES)
        throw new Error(`Generated video exceeds ${MAX_ARCHIVE_BYTES} byte archive limit`)
      const bytes = Buffer.from(await response.arrayBuffer())
      return await saveArchivedVideoAsset({
        taskId,
        title,
        provider,
        bytes,
        sourceUrl,
        sourceKind: 'http',
      })
    }
    catch (error) {
      lastError = error
      if (attempt < 3)
        await new Promise(resolve => setTimeout(resolve, attempt * 1500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to archive generated video')
}

/** Archive video from base64 (Flow blob extracted via CDP when no public URL). */
async function archiveGeneratedVideoBase64(
  taskId: string,
  title: string,
  base64: string,
  provider: string,
  mime?: string,
) {
  const raw = String(base64 || '').replace(/^data:video\/[^;]+;base64,/, '')
  const bytes = Buffer.from(raw, 'base64')
  return saveArchivedVideoAsset({
    taskId,
    title,
    provider,
    bytes,
    sourceUrl: mime ? `data:${mime};base64` : 'blob:cdp',
    sourceKind: 'base64',
  })
}

const GROK_VIDEO_PREFERRED = ['grok-imagine-video', 'grok-imagine-video-1.5']
const GROK_IMAGE_PREFERRED = ['grok-imagine-image', 'grok-imagine-image-quality']

export async function getDraftTasks() { return await readJson<LocalDraftTask[]>(file, []) }
export async function saveDraftTasks(tasks: LocalDraftTask[]) { await writeJson(file, tasks.slice(0, 300)) }

function buildGrokVideoEntries(modelIds: string[], pool: Awaited<ReturnType<typeof getGrokPoolSummary>>) {
  const unique = Array.from(new Set(modelIds.filter(Boolean)))
  const ordered = [
    ...GROK_VIDEO_PREFERRED.filter(id => unique.includes(id)),
    ...unique.filter(id => !GROK_VIDEO_PREFERRED.includes(id)),
  ]
  const eligible = pool.eligibleSeats ?? pool.seatCount
  const poolLine = pool.seatCount > 0
    ? `OAuth pool · ${eligible}/${pool.seatCount} eligible · skip free/limit · ${pool.subscriptionLabel}`
    : 'OAuth pool · no seats connected'

  return ordered.map(id => ({
    name: `grok::${id}`,
    description: formatGrokModelLabel(id),
    channel: 'grok',
    // Include legacy + modern mode ids so UI maxImages never collapses to 0
    modes: ['text-to-video', 'image-to-video', 'image2video', 'image_to_video'],
    resolutions: ['1080p', '720p'],
    durations: [6, 10, 15],
    maxInputImages: 3,
    aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
    tags: [
      'Grok',
      'Pool',
      pool.seatCount > 0 ? `${eligible}/${pool.seatCount} ready` : 'No seats',
      pool.subscriptionLabel !== 'No seats' ? pool.subscriptionLabel : '',
      /1\.5/.test(id) ? 'I2V' : 'T2V+I2V',
    ].filter(Boolean),
    // Flow/VEO-compatible social defaults: 9:16 · 10s · 1080p (Flow has no 15s)
    defaults: { resolution: '1080p', aspectRatio: '9:16', duration: 10 },
    pricing: [
      { duration: 6, price: 0, resolution: '1080p' },
      { duration: 10, price: 0, resolution: '1080p' },
      { duration: 15, price: 0, resolution: '1080p' },
    ],
    pool: {
      provider: 'grok',
      strategy: 'least_used_skip_free_limit',
      seatCount: pool.seatCount,
      eligibleSeats: eligible,
      skippedFree: pool.skippedFree ?? 0,
      skippedLimit: pool.skippedLimit ?? 0,
      subscriptionLabel: pool.subscriptionLabel,
      note: poolLine,
    },
  }))
}

export async function getDraftPricing() {
  const discovered = await discover9RouterModels().catch(() => [])
  const pool = await getGrokPoolSummary().catch(() => ({
    seatCount: 0,
    activeSeats: 0,
    eligibleSeats: 0,
    skippedFree: 0,
    skippedLimit: 0,
    subscriptions: [] as string[],
    subscriptionLabel: 'No seats',
    quotaConfigured: 0,
    localQuotaRemaining: null as number | null,
  }))

  let grokVideoIds: string[] = []
  let grokImageIds: string[] = []
  if (pool.seatCount > 0) {
    const grokModels = await discoverGrokModels().catch(() => [])
    grokVideoIds = grokModels
      .filter(model => model.type === 'video' || (/video/i.test(model.id) && !/image/i.test(model.id)))
      .map(model => model.id)
    if (!grokVideoIds.length)
      grokVideoIds = [...GROK_VIDEO_PREFERRED]

    grokImageIds = grokModels
      .filter(model => model.type === 'image' || (/image/i.test(model.id) && !/video/i.test(model.id)))
      .map(model => model.id)
    if (!grokImageIds.length)
      grokImageIds = [...GROK_IMAGE_PREFERRED]
  }

  const videoIds = discovered
    .map(model => model.id)
    .filter(id => !/grok/i.test(id) && /video|seedance|veo|kling|wan|minimax/i.test(id))
  const ids = videoIds.length ? videoIds : ['cx_agy']

  const routerImageModels = discovered
    .map(model => model.id)
    .filter(id => /image|imagen|flux|dall/i.test(id) && !/grok/i.test(id))
    .slice(0, 20)
    .map(model => ({
      model,
      displayName: model,
      supportedAspectRatios: ['1:1', '4:5', '9:16', '16:9'],
      maxInputImages: 9,
      tags: ['9Router'],
      pricing: [{ resolution: 'auto', pricePerImage: 0 }],
    }))

  const grokImageModels = Array.from(new Set([
    ...GROK_IMAGE_PREFERRED.filter(id => grokImageIds.includes(id) || pool.seatCount > 0),
    ...grokImageIds,
  ])).filter(Boolean).map(id => ({
    model: `grok::${id}`,
    displayName: formatGrokModelLabel(id),
    supportedAspectRatios: ['1:1', '4:5', '9:16', '16:9'],
    maxInputImages: 3,
    tags: [
      'Grok',
      'Pool',
      pool.seatCount > 0 ? `${pool.seatCount} seats` : 'No seats',
      pool.subscriptionLabel !== 'No seats' ? pool.subscriptionLabel : '',
    ].filter(Boolean),
    pricing: [{ resolution: 'auto', pricePerImage: 0 }],
  }))

  // Browser channel — catalog defaults = Social SEO (Hub-overridable)
  const { buildBrowserModelCatalogResolved } = await import('@/app/api/ai/providers/browserRuntime')
  const browserCatalog = await buildBrowserModelCatalogResolved()
  const { getResolvedHubMediaDefaults } = await import('@/app/api/ai/providers/extension/hubMediaSettings')
  const hubMedia = await getResolvedHubMediaDefaults().catch(() => null)
  const seo = hubMedia?.defaults

  return {
    imageModels: [
      ...grokImageModels,
      ...browserCatalog.imageModels,
      ...routerImageModels,
    ],
    videoModels: [
      ...buildGrokVideoEntries(grokVideoIds, pool),
      ...browserCatalog.videoModels,
      ...ids.slice(0, 40).map(name => ({
        name,
        description: name === 'cx_agy' ? '9Router CX Agent' : name,
        channel: '9router',
        modes: ['text-to-video', 'image-to-video'],
        // Align 9Router catalog with Hub + Flow/VEO (6/10 primary)
        resolutions: seo?.videoResolutions || ['1080p', '720p'],
        durations: seo?.videoDurations || [6, 10, 15],
        maxInputImages: seo?.maxInputImages ?? 3,
        aspectRatios: seo?.videoAspectRatios || ['9:16', '16:9'],
        tags: ['9Router', 'SEO'],
        defaults: {
          resolution: seo?.resolution || '1080p',
          aspectRatio: seo?.aspectRatio || '9:16',
          duration: seo?.duration ?? 10,
        },
        pricing: [
          { duration: 6, price: 0, resolution: seo?.resolution || '1080p' },
          { duration: 10, price: 0, resolution: seo?.resolution || '1080p' },
          { duration: 15, price: 0, resolution: seo?.resolution || '1080p' },
        ],
      })),
    ],
    grokPool: pool,
    seoMedia: seo || browserCatalog.seo,
  }
}

async function persistGenerationMaterial(body: Record<string, any>, result: {
  title: string
  description?: string
  topics?: string[]
  model?: string
  videoUrl?: string
  coverUrl?: string
  imageUrls?: string[]
  /** Actual values used for Grok (may differ from client request after server force) */
  aspectRatio?: string
  duration?: number
  resolution?: string
}) {
  const groupId = String(body.groupId || '')
  if (!groupId)
    return null
  // Product still (SKU photo) — keep separate from video poster cover.
  const productStill = String(
    body.productImageUrl
    || body.thumbnailUrl
    || (Array.isArray(body.imageUrls) ? body.imageUrls[0] : '')
    || '',
  ).trim()
  const coverUrl = result.coverUrl || productStill || undefined
  return createMaterialFromGeneration({
    groupId,
    title: result.title,
    desc: result.description,
    topics: result.topics,
    model: result.model,
    videoUrl: result.videoUrl,
    coverUrl,
    imageUrls: result.imageUrls,
    generationParams: {
      model: body.model || body.imageModel,
      prompt: body.prompt,
      // Always persist actual SEO-forced values for publish prefill dims
      aspectRatio: result.aspectRatio || body.aspectRatio || '9:16',
      duration: result.duration ?? body.duration ?? 15,
      resolution: result.resolution || body.resolution || '720p',
      platforms: body.platforms,
      productImageUrl: productStill || undefined,
      productTitle: body.productTitle,
      productUrl: body.productUrl,
      posterFromVideo: Boolean(result.coverUrl && result.coverUrl !== productStill),
    },
  }).catch(() => null)
}

async function patchTask(taskId: string, patch: Partial<LocalDraftTask>) {
  const latest = await getDraftTasks()
  const updated = latest.map(item => item.id === taskId
    ? { ...item, ...patch, updatedAt: new Date().toISOString() }
    : item)
  await saveDraftTasks(updated)
  return updated.find(item => item.id === taskId) || null
}

/**
 * Called when bridge job completes — only then mark draft task success/failed.
 * (Queue alone must stay "generating", not Success in the UI.)
 */
export async function applyBridgeJobToDraftTask(input: {
  jobId: string
  ok: boolean
  error?: string
  result?: Record<string, unknown>
  artifacts?: unknown[]
  draftTaskId?: string
}) {
  const tasks = await getDraftTasks()
  const task = tasks.find((t) => {
    if (input.draftTaskId && t.id === input.draftTaskId)
      return true
    const plan = t.response?.plan as Record<string, unknown> | undefined
    return plan?.jobId === input.jobId
  })
  if (!task)
    return { ok: false as const, error: 'draft_task_not_found' }

  const artifacts = input.artifacts
    || (Array.isArray(input.result?.artifacts) ? input.result!.artifacts as unknown[] : [])
  const videoUrl = String(
    (input.result as any)?.videoUrl
    || (artifacts[0] as any)?.url
    || (artifacts[0] as any)?.videoUrl
    || '',
  ).trim()
  const imageUrls = Array.isArray((input.result as any)?.imageUrls)
    ? (input.result as any).imageUrls as string[]
    : []

  if (!input.ok) {
    const updated = await patchTask(task.id, {
      status: 'failed',
      errorMessage: input.error || 'browser_bridge_job_failed',
      response: {
        ...(task.response || {}),
        progress: {
          percent: 100,
          stage: 'Browser extension failed',
          providerStatus: 'error',
          updatedAt: new Date().toISOString(),
        },
        plan: {
          ...((task.response?.plan as object) || {}),
          phase: 'failed',
          jobId: input.jobId,
          bridgeError: input.error,
        },
      },
    })
    return { ok: true as const, task: updated }
  }

  // Bridge may only open the site (navigate + checkpoint). That is NOT generation progress.
  // Do not report high % or "running" when zero media was produced — that was fake 70%.
  const hasMedia = Boolean(videoUrl || imageUrls.length)
  if (!hasMedia) {
    const tabUrl = String((input.result as any)?.tabUrl || '')
    const updated = await patchTask(task.id, {
      status: 'failed',
      errorMessage:
        'Shell only: browser opened the site (navigate/checkpoint) but produced 0 video/image. '
        + 'Login Google Pro is not enough — Flow Automation must actually submit the prompt and return media. '
        + 'Current bridge job does not drive generation UI.',
      response: {
        ...(task.response || {}),
        title: (task.response as any)?.title || `Browser · ${input.jobId.slice(0, 8)}`,
        description:
          'No generation ran. Bridge only opened the tab. Percent is not mid-job — pipeline stopped without media.',
        progress: {
          percent: 15,
          stage: 'No media — opened tab only (not generating)',
          providerStatus: 'error',
          updatedAt: new Date().toISOString(),
        },
        plan: {
          ...((task.response?.plan as object) || {}),
          phase: 'shell_only_no_media',
          jobId: input.jobId,
          bridgeResult: input.result,
          artifacts: [],
          tabUrl: tabUrl || undefined,
          honest: true,
          note: '70% was never real progress — shell steps ≠ model generating.',
        },
      },
    })
    return { ok: true as const, task: updated }
  }

  const updated = await patchTask(task.id, {
    status: 'success',
    errorMessage: undefined,
    response: {
      ...(task.response || {}),
      title: (task.response as any)?.title || `Browser · ${input.jobId.slice(0, 8)}`,
      description: 'Browser generation finished with media.',
      videoUrl: videoUrl || undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      progress: {
        percent: 100,
        stage: 'Done',
        providerStatus: 'done',
        updatedAt: new Date().toISOString(),
      },
      plan: {
        ...((task.response?.plan as object) || {}),
        phase: 'completed',
        jobId: input.jobId,
        bridgeResult: input.result,
        artifacts,
      },
    },
  })
  return { ok: true as const, task: updated }
}

async function processDraftTask(task: LocalDraftTask, body: Record<string, any>) {
  try {
    const prompt = socialContentPrompt({ productNotes: body.prompt, platform: body.platforms?.[0] || 'tiktok' })
    const requestedModel = String(body.model || 'cx_agy')
    const imageModelRaw = String(body.imageModel || requestedModel || '')

    // ── Browser runtime (ext:* models) — CDP + extension bridge, like Playwright MCP ──
    const browserModel = requestedModel.startsWith('ext:')
      ? requestedModel
      : (imageModelRaw.startsWith('ext:') ? imageModelRaw : '')
    if (browserModel) {
      const { queueBrowserGenerationJob, getBrowserRuntimeStatus } = await import('@/app/api/ai/providers/browserRuntime')
      await patchTask(task.id, {
        status: 'generating',
        response: {
          progress: {
            percent: 12,
            stage: 'Browser seat preflight',
            providerStatus: 'preparing',
            updatedAt: new Date().toISOString(),
          },
          plan: { provider: 'browser', channel: 'browser', model: browserModel },
        },
      })
      const runtime = await getBrowserRuntimeStatus()
      if (!runtime.cdpOnline) {
        task.status = 'failed'
        task.errorMessage
          = 'Browser seat CDP offline. Open pool seats chatgpt-1..4 (ports 9480–9483) or Attach CDP.'
        task.response = {
          progress: { percent: 100, stage: 'Failed', providerStatus: 'error', updatedAt: new Date().toISOString() },
          plan: { provider: 'browser', runtime },
        }
        await patchTask(task.id, { status: task.status, errorMessage: task.errorMessage, response: task.response })
        return task
      }
      // Prefer client values; fall back to Hub defaults. Flow/VEO clamp to 6|10s only.
      const { getResolvedHubMediaDefaults } = await import('@/app/api/ai/providers/extension/hubMediaSettings')
      const hubMedia = await getResolvedHubMediaDefaults().catch(() => null)
      const seo = hubMedia?.defaults
      const isFlowModel = /:flow:/i.test(browserModel) || /^ext:flow/i.test(browserModel)
      const isChatgptModel = /:chatgpt:/i.test(browserModel) || /^ext:chatgpt/i.test(browserModel)
      let duration = Number(body.duration) > 0
        ? Number(body.duration)
        : (seo?.duration ?? 10)
      let aspectRatio = String(body.aspectRatio || '').trim()
        || (isFlowModel ? (hubMedia?.flowVeo?.aspectRatio || '9:16') : (seo?.aspectRatio ?? '9:16'))
      if (isFlowModel) {
        const { clampFlowDurationSeconds } = await import('@/app/api/ai/providers/extension/flowVeoDefaults')
        duration = clampFlowDurationSeconds(duration)
        if (aspectRatio !== '9:16' && aspectRatio !== '16:9')
          aspectRatio = hubMedia?.flowVeo?.aspectRatio || '9:16'
      }
      // ── Flow / VEO: pack mission (config + Run) → media → archive ──
      // Do NOT CDP-fill labs.google prompt box — Flow Automation extension owns generation.
      if (isFlowModel) {
        const cdpEndpoint = runtime.seat?.cdpEndpoint || 'http://127.0.0.1:9480'
        const seatId = runtime.seat?.id || 'primary'
        const fullPrompt = String(body.prompt || prompt || '')
        const titleBase = String(body.productTitle || body.title || 'Flow video').slice(0, 120)
        await patchTask(task.id, {
          status: 'generating',
          response: {
            title: `Flow · ${browserModel}`,
            description: 'Mission to Flow Automation pack — config push, panel Run, harvest media.',
            topics: ['browser', 'flow', 'veo', 'pack'],
            progress: {
              percent: 12,
              stage: 'Pushing mission to Flow pack…',
              providerStatus: 'running',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'browser',
              channel: 'browser',
              model: browserModel,
              seatId,
              cdpEndpoint,
              runtime: 'flow_pack_driver',
              phase: 'pack_mission',
              duration,
              aspectRatio,
            },
          },
        })

        const { isArchivableFlowUrl } = await import(
          '@/app/api/ai/providers/extension/flowCdpDriver'
        )
        const { driveFlowPackGeneration } = await import(
          '@/app/api/ai/providers/extension/flowPackDriver'
        )

        let lastProgressAt = 0
        const drive = await driveFlowPackGeneration({
          cdpEndpoint,
          seatId,
          prompt: fullPrompt,
          aspectRatio,
          durationSeconds: duration,
          flowVeo: hubMedia?.flowVeo,
          // Honest wait: ~7.5 min max; early abort if pack stays quiet ~90s after grace
          pollMs: 5000,
          pollRounds: 90,
          quietAbortRounds: 18,
          quietGraceRounds: 6,
          onProgress: async (p) => {
            const now = Date.now()
            if (now - lastProgressAt < 3500 && p.percent < 90)
              return
            lastProgressAt = now
            await patchTask(task.id, {
              status: 'generating',
              response: {
                title: `Flow · ${browserModel}`,
                description: p.projectUrl
                  ? `Flow project: ${p.projectUrl}`
                  : 'Flow Automation pack running on seat…',
                topics: ['browser', 'flow', 'veo', 'pack'],
                progress: {
                  percent: Math.min(92, Math.max(12, p.percent)),
                  stage: p.stage,
                  providerStatus: 'running',
                  updatedAt: new Date().toISOString(),
                },
                plan: {
                  provider: 'browser',
                  channel: 'browser',
                  model: browserModel,
                  seatId,
                  cdpEndpoint,
                  runtime: 'flow_pack_driver',
                  phase: 'pack_running',
                  duration,
                  aspectRatio,
                  projectUrl: p.projectUrl,
                  tileCount: p.tileCount,
                  videoCount: p.videoCount,
                },
              },
            })
          },
        })

        const media = drive.media
        const hasDownloadable = Boolean(
          (media?.url && isArchivableFlowUrl(media.url)) || media?.base64,
        )

        if (drive.ok && hasDownloadable) {
          try {
            await patchTask(task.id, {
              status: 'generating',
              response: {
                title: titleBase,
                description: 'Archiving Flow video into content library…',
                topics: ['browser', 'flow', 'pack'],
                progress: {
                  percent: 95,
                  stage: 'Saving video locally',
                  providerStatus: 'archiving',
                  updatedAt: new Date().toISOString(),
                },
                plan: {
                  provider: 'browser',
                  model: browserModel,
                  seatId,
                  cdpEndpoint,
                  runtime: 'flow_pack_driver',
                  phase: 'archiving',
                  projectUrl: drive.projectUrl,
                },
              },
            })

            const archived = media?.base64
              ? await archiveGeneratedVideoBase64(
                  task.id,
                  titleBase,
                  media.base64,
                  'flow',
                  media.mime,
                )
              : await archiveGeneratedVideo(task.id, titleBase, String(media!.url), 'flow')

            const posterUrl = await extractVideoPoster(archived.url, { seekSec: 1.0 }).catch(() => null)
            const coverUrl = posterUrl
              || String(body.productImageUrl || body.thumbnailUrl || '').trim()
              || ''
            const description = drive.projectUrl
              ? `Generated on Google Flow · ${drive.projectUrl}`
              : 'Generated on Google Flow via Flow Automation pack'
            const topics = ['flow', 'veo', 'browser', 'pack']
            const material = await persistGenerationMaterial(body, {
              title: titleBase,
              description,
              topics,
              model: browserModel,
              videoUrl: archived.url,
              coverUrl: coverUrl || undefined,
              aspectRatio,
              duration,
              resolution: String(body.resolution || '1080p'),
            })

            task.status = 'success'
            task.errorMessage = undefined
            task.response = {
              title: titleBase,
              description,
              topics,
              videoUrl: archived.url,
              sourceVideoUrl: media?.url || undefined,
              archivedAssetId: archived.id,
              coverUrl: coverUrl || undefined,
              materialId: material?.id,
              progress: {
                percent: 100,
                stage: 'Completed',
                providerStatus: 'done',
                updatedAt: new Date().toISOString(),
              },
              plan: {
                provider: 'browser',
                model: browserModel,
                seatId,
                cdpEndpoint,
                runtime: 'flow_pack_driver',
                phase: 'completed',
                projectUrl: drive.projectUrl,
                drivePhase: drive.phase,
                mediaSource: media?.source,
                hasMaterial: Boolean(material?.id),
              },
            }
          }
          catch (archiveErr) {
            task.status = 'failed'
            task.errorMessage = archiveErr instanceof Error
              ? `Flow video captured but archive failed: ${archiveErr.message}`
              : 'Flow video archive failed'
            task.response = {
              title: `Flow · archive failed`,
              description: drive.projectUrl || task.errorMessage,
              topics: ['browser', 'flow', 'pack'],
              progress: {
                percent: 90,
                stage: 'Archive failed',
                providerStatus: 'error',
                updatedAt: new Date().toISOString(),
              },
              plan: {
                provider: 'browser',
                model: browserModel,
                seatId,
                runtime: 'flow_pack_driver',
                phase: 'archive_failed',
                projectUrl: drive.projectUrl,
                drive,
              },
            }
          }
        }
        else if (drive.ok && ((drive.videoCount || 0) > 0 || (drive.tileCount || 0) > 0 || drive.generating)) {
          task.status = 'failed'
          task.errorMessage
            = drive.error
              || 'Pack/Flow showed tiles/video but no downloadable media for content library. '
              + 'Check seat download folder (SocialsHub/chatgpt-N) or pack auto-download.'
          task.response = {
            title: `Flow · no media`,
            description: drive.projectUrl
              ? `Check seat browser: ${drive.projectUrl}`
              : (drive.textSample || task.errorMessage),
            topics: ['browser', 'flow', 'pack'],
            progress: {
              percent: 70,
              stage: 'No downloadable media for content library',
              providerStatus: 'error',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'browser',
              model: browserModel,
              seatId,
              cdpEndpoint,
              runtime: 'flow_pack_driver',
              phase: drive.phase,
              projectUrl: drive.projectUrl,
              drive,
              honest: true,
              note: 'Success requires archived videoUrl for Draft / content management.',
            },
          }
        }
        else {
          task.status = 'failed'
          task.errorMessage = drive.error
            || 'Flow pack mission failed — ensure Flow Automation is loaded on seat, project page open, Google PRO logged in.'
          task.response = {
            title: `Flow · failed`,
            description: drive.textSample || drive.error || 'Pack did not produce media.',
            topics: ['browser', 'flow', 'pack'],
            progress: {
              percent: drive.phase === 'pack_quiet_abort' ? 45 : 20,
              stage: `Failed · ${drive.phase}`,
              providerStatus: 'error',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'browser',
              model: browserModel,
              seatId,
              cdpEndpoint,
              runtime: 'flow_pack_driver',
              phase: drive.phase,
              projectUrl: drive.projectUrl,
              drive,
            },
          }
        }
        await patchTask(task.id, {
          status: task.status,
          errorMessage: task.errorMessage,
          response: task.response,
        })
        return task
      }

      // ── ChatGPT: CDP drive (real composer submit) — not shell navigate-only ──
      if (isChatgptModel) {
        const cdpEndpoint = runtime.seat?.cdpEndpoint || 'http://127.0.0.1:9480'
        const seatId = runtime.seat?.id || 'chatgpt-1'
        const fullPrompt = String(body.prompt || prompt || '')
        const titleBase = String(body.productTitle || body.title || 'ChatGPT result').slice(0, 120)
        const imageMode = /:image$/i.test(browserModel) || /image/i.test(String(body.mode || ''))
        await patchTask(task.id, {
          status: 'generating',
          response: {
            title: `ChatGPT · ${browserModel}`,
            description: `Driving ChatGPT on seat ${seatId} via CDP…`,
            topics: ['browser', 'chatgpt'],
            progress: {
              percent: 18,
              stage: `Opening ChatGPT on ${seatId}…`,
              providerStatus: 'running',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'browser',
              channel: 'browser',
              model: browserModel,
              seatId,
              cdpEndpoint,
              runtime: 'chatgpt_cdp_driver',
              phase: 'driving',
            },
          },
        })

        const { driveChatgptViaCdp } = await import(
          '@/app/api/ai/providers/extension/chatgptCdpDriver'
        )
        let lastChatProgress = 0
        const drive = await driveChatgptViaCdp({
          cdpEndpoint,
          prompt: fullPrompt,
          imageMode,
          pollMs: 3000,
          pollRounds: 40,
          onProgress: async (p) => {
            const now = Date.now()
            if (now - lastChatProgress < 3500 && p.percent < 88)
              return
            lastChatProgress = now
            await patchTask(task.id, {
              status: 'generating',
              response: {
                title: `ChatGPT · ${browserModel}`,
                description: `Seat ${seatId}`,
                topics: ['browser', 'chatgpt'],
                progress: {
                  percent: Math.min(90, Math.max(18, p.percent)),
                  stage: p.stage,
                  providerStatus: 'running',
                  updatedAt: new Date().toISOString(),
                },
                plan: {
                  provider: 'browser',
                  model: browserModel,
                  seatId,
                  cdpEndpoint,
                  runtime: 'chatgpt_cdp_driver',
                  phase: 'driving',
                },
              },
            })
          },
        })

        if (drive.ok && (drive.imageUrls?.length || drive.replyText)) {
          const imageUrls = drive.imageUrls || []
          const description = (drive.replyText || '').slice(0, 2000)
          const material = await persistGenerationMaterial(body, {
            title: titleBase,
            description,
            topics: ['chatgpt', 'browser'],
            model: browserModel,
            imageUrls: imageUrls.length ? imageUrls : undefined,
            coverUrl: imageUrls[0] || undefined,
            aspectRatio,
          })
          task.status = 'success'
          task.errorMessage = undefined
          task.response = {
            title: titleBase,
            description,
            topics: ['chatgpt', 'browser'],
            imageUrls: imageUrls.length ? imageUrls : undefined,
            coverUrl: imageUrls[0] || undefined,
            materialId: material?.id,
            progress: {
              percent: 100,
              stage: 'Completed',
              providerStatus: 'done',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'browser',
              model: browserModel,
              seatId,
              cdpEndpoint,
              runtime: 'chatgpt_cdp_driver',
              phase: 'completed',
              drivePhase: drive.phase,
              tabUrl: drive.tabUrl,
              hasMaterial: Boolean(material?.id),
            },
          }
        }
        else {
          task.status = 'failed'
          task.errorMessage = drive.error
            || 'ChatGPT CDP drive failed — login OpenAI on the pool seat and retry.'
          task.response = {
            title: 'ChatGPT · failed',
            description: drive.textSample || drive.error || 'No reply',
            topics: ['browser', 'chatgpt'],
            progress: {
              percent: 25,
              stage: `Failed · ${drive.phase}`,
              providerStatus: 'error',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'browser',
              model: browserModel,
              seatId,
              cdpEndpoint,
              runtime: 'chatgpt_cdp_driver',
              phase: drive.phase,
              drive,
            },
          }
        }
        await patchTask(task.id, {
          status: task.status,
          errorMessage: task.errorMessage,
          response: task.response,
        })
        return task
      }

      const queued = await queueBrowserGenerationJob({
        model: browserModel,
        prompt: String(body.prompt || prompt || ''),
        profileId: runtime.seat?.id || 'chatgpt-1',
        productTitle: body.productTitle ? String(body.productTitle) : undefined,
        imageUrl: Array.isArray(body.imageUrls) ? body.imageUrls[0] : body.productImageUrl,
        duration,
        aspectRatio,
        draftTaskId: task.id,
      })
      if (!queued.ok) {
        task.status = 'failed'
        task.errorMessage = queued.message || queued.error || 'browser_queue_failed'
        task.response = {
          progress: { percent: 100, stage: 'Failed', providerStatus: 'error', updatedAt: new Date().toISOString() },
          plan: { provider: 'browser', error: queued },
        }
        await patchTask(task.id, { status: task.status, errorMessage: task.errorMessage, response: task.response })
        return task
      }
      // NOT success yet — only queued. Low % only; shell open ≠ generation.
      task.status = 'generating'
      task.response = {
        title: `Browser job · ${browserModel}`,
        description:
          'Queued on bridge. Expect only “open site” until niche pack returns media. Login alone does not generate.',
        topics: ['browser', 'experimental'],
        progress: {
          percent: 8,
          stage: 'Queued — waiting for seat bridge (open site, not gen yet)',
          providerStatus: 'running',
          updatedAt: new Date().toISOString(),
        },
        plan: {
          provider: 'browser',
          channel: 'browser',
          model: browserModel,
          jobId: queued.job.id,
          seatId: queued.seat.id,
          cdpEndpoint: queued.seat.cdpEndpoint,
          runtime: 'cdp_plus_extension_bridge',
          phase: 'queued',
          note: 'Success only with real video/image artifacts. Navigate/checkpoint alone → fail (shell_only_no_media), not 70%.',
        },
      }
      await patchTask(task.id, { status: task.status, response: task.response })
      return task
    }

    const isGrokImage = imageModelRaw.startsWith('grok::')
      && /image/i.test(imageModelRaw)
      && !/video/i.test(imageModelRaw)

    if (isGrokImage || (body.imageModel && String(body.imageModel).startsWith('grok::'))) {
      const imageModel = String(body.imageModel || requestedModel).replace(/^grok::/, '')
      await patchTask(task.id, {
        status: 'generating',
        response: {
          progress: { percent: 10, stage: 'Writing caption', providerStatus: 'preparing', updatedAt: new Date().toISOString() },
          plan: { provider: 'grok', mode: 'image', requestedModel: imageModel },
        },
      })
      const content = await callGrokChat(prompt, 'grok-4')
      const pack = parseAiContentPack(content.text)
      await patchTask(task.id, {
        status: 'generating',
        response: {
          title: String(pack.title || 'Grok social image'),
          description: String(pack.caption || ''),
          topics: Array.isArray(pack.hashtags) ? pack.hashtags : [],
          progress: { percent: 40, stage: 'Generating images', providerStatus: 'running', updatedAt: new Date().toISOString() },
        },
      })
      const images = await createGrokImage({
        model: imageModel,
        prompt: String(pack.shortVideoScript || pack.caption || body.prompt || ''),
        n: Number(body.imageCount || body.quantity || 1),
        aspectRatio: String(body.aspectRatio || '1:1'),
        image: Array.isArray(body.imageUrls) ? body.imageUrls[0] : undefined,
      })
      await recordGrokAccountUsage(images.account.id, 1).catch(() => null)
      const material = await persistGenerationMaterial(body, {
        title: String(pack.title || 'Grok social image'),
        description: String(pack.caption || ''),
        topics: Array.isArray(pack.hashtags) ? pack.hashtags : [],
        model: `grok::${imageModel}`,
        imageUrls: images.urls,
        coverUrl: images.urls[0],
      })
      task.status = 'success'
      task.response = {
        title: String(pack.title || 'Grok social image'),
        description: String(pack.caption || ''),
        topics: Array.isArray(pack.hashtags) ? pack.hashtags : [],
        imageUrls: images.urls,
        coverUrl: images.urls[0],
        materialId: material?.id,
        generatedImageCount: images.urls.length,
        requestedImageCount: Number(body.imageCount || 1),
        progress: { percent: 100, stage: 'Completed', providerStatus: 'done', updatedAt: new Date().toISOString() },
        plan: {
          provider: 'grok',
          mode: 'image',
          pool: true,
          accountId: images.account.id,
          accountName: images.account.name,
          subscription: images.account.metadata?.subscription,
          requestedModel: imageModel,
        },
      }
    }
    else if (requestedModel.startsWith('grok::')) {
      const videoModel = requestedModel.slice('grok::'.length)
      if (/image/i.test(videoModel) && !/video/i.test(videoModel)) {
        throw new Error(`${videoModel} is an image model. Switch to Image Post mode.`)
      }

      // Prefer BugSell / product URL first — other stack images often aren't the SKU.
      const isProductish = (u: string) =>
        /bugsell|shopify|cdn\.shop|product|myshopify|cloudinary|imgix|wixstatic|bigcommerce/i.test(u)
      const refImages = [
        body.productImageUrl,
        body.thumbnailUrl,
        ...(Array.isArray(body.imageUrls) ? body.imageUrls : []),
      ]
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .filter((url, i, arr) => arr.indexOf(url) === i)
        .sort((a, b) => Number(isProductish(b)) - Number(isProductish(a)))
      let productImageSource = refImages[0] || undefined
      // Soft path: missing ref falls back to T2V; never hard-block the queue.

      // Parse product fields from user prompt when BugSell filled the form.
      const userPrompt = String(body.prompt || '')
      const productTitleMatch = userPrompt.match(/Product:\s*(.+)/i)
      const productUrlMatch = userPrompt.match(/URL:\s*(\S+)/i)
      const productTitle = String(body.productTitle || productTitleMatch?.[1] || '').trim()
      const productUrl = String(body.productUrl || productUrlMatch?.[1] || '').trim()
      const productNotes = String(body.productNotes || '').trim()
      const looksLikeProductJob = Boolean(productImageSource || productTitle || productUrl)
      const isStoryboardMode = /storyboard/i.test(String(body.mode || body.generationMode || ''))

      // Classify stack once: never I2V a BOARD/info deck as the product photo.
      if (refImages.length) {
        try {
          const { classifyRefImages, pickStoryboardHero } = await import('../storyboard/classifyRefImage')
          const classified = await classifyRefImages(refImages)
          const picked = pickStoryboardHero(classified)
          if (picked.hero)
            productImageSource = picked.hero.url
          else if (isStoryboardMode) {
            throw new Error(
              `${picked.errorCode || 'NO_PRODUCT'}: Need a real product photo. `
              + (picked.errorCode === 'HERO_WAS_BOARD'
                ? 'Stack only has a storyboard/info document — add a flat-lay product photo.'
                : 'Add a product photo.'),
            )
          }
          // Non-storyboard: if only board, drop ref (T2V) rather than animate the deck
          else if (picked.errorCode === 'HERO_WAS_BOARD')
            productImageSource = undefined
        }
        catch (e) {
          if (isStoryboardMode)
            throw e
          console.warn('[draft-generation] classify refs failed', e)
        }
      }

      // ── Storyboard Gen: multi-ref R2V (web parity) + stitch (9:16) ──
      if (isStoryboardMode) {
        if (!productImageSource)
          throw new Error('NO_PRODUCT: Storyboard needs a product photo (BugSell or upload).')

        const platforms = Array.isArray(body.platforms) ? body.platforms.map(String) : []
        const heroForStoryboard = productImageSource
        await patchTask(task.id, {
          status: 'generating',
          response: {
            ...(typeof task.response === 'object' ? task.response : {}),
            coverUrl: heroForStoryboard,
            progress: {
              percent: 2,
              stage: 'Storyboard: commercial I2V (product only + Scene 1/2/3 prompt)',
              providerStatus: 'preparing',
              updatedAt: new Date().toISOString(),
            },
            plan: {
              provider: 'grok',
              mode: 'storyboard',
              commercialI2V: true,
              singleProduct: true,
              requestedModel,
              routedModel: videoModel,
              hasProductImage: true,
              heroUrl: heroForStoryboard,
            },
          },
        })

        const { runStoryboardGeneration } = await import('../storyboard/runStoryboard')
        const sbResult = await runStoryboardGeneration(
          {
            groupId: String(body.groupId || ''),
            heroImageUrl: heroForStoryboard,
            extraImageUrls: refImages.filter(u => u !== heroForStoryboard),
            productTitle: productTitle || undefined,
            productUrl: productUrl || undefined,
            productNotes: productNotes || undefined,
            userPrompt: userPrompt.slice(0, 400) || undefined,
            board: body.board,
            model: videoModel,
            resolution: String(body.resolution || '1080p'),
            duration: Math.min(15, Math.max(6, Number(body.duration || 10) || 10)),
            platforms: platforms.length ? platforms : ['instagram', 'youtube', 'tiktok'],
            draftType: body.draftType === 'video' ? 'video' : 'draft',
          },
          async (prog) => {
            await patchTask(task.id, {
              status: 'generating',
              response: {
                coverUrl: heroForStoryboard,
                progress: {
                  percent: prog.percent,
                  stage: prog.stage,
                  providerStatus: 'running',
                  updatedAt: new Date().toISOString(),
                },
                plan: {
                  provider: 'grok',
                  mode: 'storyboard',
                  requestedModel,
                  routedModel: videoModel,
                  shotId: prog.shotId,
                  shotIndex: prog.shotIndex,
                  shotTotal: prog.shotTotal,
                  heroUrl: heroForStoryboard,
                },
              },
            })
          },
        )

        const posterUrl = await extractVideoPoster(sbResult.videoUrl, { seekSec: 1.0 }).catch(() => null)
        const coverUrl = posterUrl || heroForStoryboard
        const material = await persistGenerationMaterial(body, {
          title: sbResult.title,
          description: sbResult.description,
          topics: sbResult.topics,
          model: sbResult.model,
          videoUrl: sbResult.videoUrl,
          coverUrl,
          aspectRatio: '9:16',
          duration: sbResult.duration,
          resolution: sbResult.resolution || '1080p',
        })

        task.status = 'success'
        task.response = {
          title: sbResult.title,
          description: sbResult.description,
          topics: sbResult.topics,
          videoUrl: sbResult.videoUrl,
          coverUrl,
          materialId: material?.id,
          progress: {
            percent: 100,
            stage: 'Completed',
            providerStatus: 'done',
            updatedAt: new Date().toISOString(),
          },
          plan: {
            provider: 'grok',
            mode: 'storyboard',
            requestedModel,
            routedModel: videoModel,
            boardId: sbResult.board.boardId,
            shots: sbResult.board.shots.map(s => s.id),
            shotUrls: sbResult.shotUrls,
            aspectRatio: '9:16',
            duration: sbResult.duration,
            resolution: sbResult.resolution,
            heroUrl: sbResult.heroUrl,
            printLock: sbResult.printLock,
            planSource: sbResult.planSource,
            classified: sbResult.classified,
          },
        }
      }
      else {
      await patchTask(task.id, {
        status: 'generating',
        response: {
          ...(typeof task.response === 'object' ? task.response : {}),
          progress: { percent: 2, stage: 'Writing caption pack', providerStatus: 'preparing', updatedAt: new Date().toISOString() },
          plan: { provider: 'grok', requestedModel, routedModel: videoModel, hasProductImage: Boolean(productImageSource) },
          coverUrl: productImageSource || '',
        },
      })

      // Platforms from client → topic/title limits for multi-platform SEO.
      const platforms = Array.isArray(body.platforms) ? body.platforms.map(String) : []
      const topicMax = platforms.some((p: string) => /tiktok|instagram/i.test(p)) ? 5 : 5
      const titleMax = platforms.some((p: string) => /pinterest/i.test(p)) ? 100 : 80

      // Duration / aspect first (agent + I2V need them); image prep after creative agent.
      let duration = Math.min(15, Math.max(6, Number(body.duration || 12) || 12))
      const forceAspect = Boolean(body.forceAspect || body.forceSocialPortrait)
      const requestedAspect = String(body.aspectRatio || '').trim() || '9:16'
      let aspectRatio = requestedAspect
      let i2vImage = productImageSource
      let letterboxed = false
      let sourceSize: { width: number, height: number } | null = null

      // Probe aspect early (no pad yet) so agent motion matches real output frame.
      if (productImageSource) {
        sourceSize = await probeImageSize(productImageSource).catch(() => null)
        aspectRatio = pickProductVideoAspect(
          requestedAspect,
          sourceSize?.width,
          sourceSize?.height,
          { force: forceAspect },
        )
      }

      await patchTask(task.id, {
        status: 'generating',
        response: {
          ...(typeof task.response === 'object' ? task.response : {}),
          coverUrl: productImageSource || '',
          progress: {
            percent: 3,
            stage: productImageSource
              ? 'Creative agent: vision + SEO channels'
              : 'Creative agent: SEO + motion brief',
            providerStatus: 'preparing',
            updatedAt: new Date().toISOString(),
          },
        },
      })

      // Vision (product photo) → multi-channel SEO pack → scene-specific motion draft.
      // Providers: Grok OAuth pool → 9Router → static template. Soft timeout so UI never hangs.
      const agentInput = {
        productTitle: productTitle || userPrompt.slice(0, 120),
        productUrl,
        productNotes: productNotes || '',
        userPrompt: userPrompt.slice(0, 240),
        imageUrl: productImageSource,
        platforms: platforms.length ? platforms : ['tiktok', 'instagram', 'youtube', 'facebook', 'pinterest'],
        duration,
        aspectRatio,
        hasReferenceImage: Boolean(productImageSource),
        letterboxed: false,
        topicMax,
        titleMax,
        provider: (body.creativeProvider as 'grok' | '9router' | 'auto') || 'auto',
        timeoutMs: 42_000,
      }
      let creativePlan = templateProductCreativePlan(agentInput, 'pending')
      try {
        const timedOut = Symbol('creative-timeout')
        const result = await Promise.race([
          runProductCreativeAgent(agentInput),
          new Promise<typeof timedOut>(resolve => setTimeout(() => resolve(timedOut), 46_000)),
        ])
        if (result === timedOut) {
          console.warn('[draft-generation] creative agent timed out — template fallback')
          creativePlan = templateProductCreativePlan(agentInput, 'timeout')
        }
        else {
          creativePlan = result
        }
      }
      catch (agentErr) {
        console.warn('[draft-generation] creative agent error', agentErr)
        creativePlan = templateProductCreativePlan(agentInput, 'error')
      }

      const pack = clampPublishPack(
        {
          title: creativePlan.title,
          caption: creativePlan.caption,
          hashtags: creativePlan.hashtags,
        },
        { topicMax, titleMax },
      )

      await patchTask(task.id, {
        status: 'generating',
        response: {
          title: String(pack.title || productTitle || 'Grok product video'),
          description: String(pack.caption || ''),
          topics: pack.hashtags,
          coverUrl: productImageSource || '',
          progress: {
            percent: 5,
            stage: creativePlan.source === 'agent'
              ? `Creative ready (${creativePlan.provider})`
              : 'Template creative — continuing video',
            providerStatus: 'preparing',
            updatedAt: new Date().toISOString(),
          },
          plan: {
            provider: 'grok',
            creative: {
              source: creativePlan.source,
              provider: creativePlan.provider,
              vision: creativePlan.vision,
              channelAngles: creativePlan.channelAngles,
              motionBrief: creativePlan.motionBrief,
            },
          },
        },
      })

      // Multi-ref pack for single-shot video (same as grok.com R2V when ≥2 visual refs)
      let r2vRefUrls: string[] = []
      if (productImageSource) {
        const stageLabel = forceAspect
          ? `Framing ${requestedAspect} (pad ok, no stretch)`
          : 'Matching product photo aspect (no pad, no stretch)'
        await patchTask(task.id, {
          status: 'generating',
          response: {
            title: String(pack.title || productTitle || 'Grok product video'),
            description: String(pack.caption || ''),
            topics: pack.hashtags,
            coverUrl: productImageSource,
            progress: { percent: 6, stage: stageLabel, providerStatus: 'preparing', updatedAt: new Date().toISOString() },
          },
        })

        try {
          // prepareProductRefForI2V only letterboxes when target ≠ source; never stretches.
          const prepared = await prepareProductRefForI2V(productImageSource, aspectRatio, { maxSide: 1536 })
          i2vImage = prepared.dataUrl
          letterboxed = prepared.letterboxed
          aspectRatio = prepared.aspectRatio || aspectRatio
        }
        catch (prepErr) {
          console.warn('[draft-generation] product ref prep failed', prepErr)
        }

        // Build extra visual refs (lifestyle / extra product — never board decks)
        try {
          const { classifyRefImages } = await import('../storyboard/classifyRefImage')
          const classified = await classifyRefImages(refImages)
          const extras = classified
            .filter(c => c.role === 'lifestyle' || (c.role === 'product_hero' && c.url !== productImageSource))
            .slice(0, 6)
          if (i2vImage && extras.length) {
            r2vRefUrls = [i2vImage]
            for (const ex of extras) {
              try {
                const prep = await prepareProductRefForI2V(ex.url, aspectRatio, { maxSide: 1536 })
                r2vRefUrls.push(prep.dataUrl)
              }
              catch {
                /* skip unreadable */
              }
            }
            r2vRefUrls = r2vRefUrls.filter((u, i, a) => a.indexOf(u) === i).slice(0, 7)
          }
        }
        catch (e) {
          console.warn('[draft-generation] multi-ref pack failed', e)
        }
      }
      else if (!forceAspect && requestedAspect) {
        aspectRatio = requestedAspect
      }

      // Re-compose motion if letterbox flag changed after prep (rails need letterboxed truth).
      let motionPrompt = creativePlan.motionPrompt
      if (letterboxed && creativePlan.source === 'agent') {
        const { composeMotionPromptFromAgent } = await import('../providers/productCreativeAgent')
        motionPrompt = composeMotionPromptFromAgent({
          agentMotionPrompt: creativePlan.agentMotionDraft || creativePlan.motionPrompt,
          motionBrief: creativePlan.motionBrief,
          vision: creativePlan.vision,
          productTitle: productTitle || pack.title,
          duration,
          aspectRatio,
          hasReferenceImage: Boolean(i2vImage),
          letterboxed: true,
          productNotes: productNotes || '',
        })
      }
      else if (letterboxed && creativePlan.source === 'template') {
        motionPrompt = productVideoMotionPrompt({
          productTitle: productTitle || pack.title,
          productNotes: productNotes || '',
          productUrl,
          userPrompt: userPrompt.slice(0, 200),
          duration,
          aspectRatio,
          hasReferenceImage: Boolean(i2vImage),
          letterboxed: true,
        })
      }

      const topics = pack.hashtags
      const title = String(pack.title || productTitle || 'Grok product video')
      const description = String(pack.caption || productNotes || '')
      // Product I2V defaults to 1080p for sharper faces/fabric (falls back to 720p in client).
      const videoResolution = String(body.resolution || '1080p')

      const useR2V = r2vRefUrls.length >= 2
      // Web-parity: multi-ref requires grok-imagine-video (not 1.5)
      const submitModel = useR2V && /1\.5|imagine-video-1/i.test(videoModel)
        ? 'grok-imagine-video'
        : videoModel
      // Address refs in prompt when multi-ref (xAI / grok.com style)
      let finalMotionPrompt = motionPrompt
      if (useR2V) {
        const legend = r2vRefUrls
          .map((_, i) => i === 0
            ? `<IMAGE_1> = product print source of truth`
            : `<IMAGE_${i + 1}> = lifestyle / secondary identity`)
          .join('; ')
        finalMotionPrompt = [
          `REFS: ${legend}.`,
          r2vRefUrls.length >= 2
            ? `Person/identity from <IMAGE_2> wears the EXACT garment and print from <IMAGE_1>. Print must match <IMAGE_1> every frame.`
            : '',
          motionPrompt,
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1600)
      }

      await patchTask(task.id, {
        status: 'generating',
        response: {
          title,
          description,
          topics,
          coverUrl: productImageSource || '',
          progress: {
            percent: 8,
            stage: useR2V
              ? `Submitting reference-to-video (${r2vRefUrls.length} refs)`
              : i2vImage
                ? 'Submitting image-to-video'
                : 'Submitting text-to-video',
            providerStatus: 'submitting',
            updatedAt: new Date().toISOString(),
          },
          plan: {
            provider: 'grok',
            requestedModel,
            routedModel: submitModel,
            hasProductImage: Boolean(productImageSource),
            referenceToVideo: useR2V,
            referenceCount: useR2V ? r2vRefUrls.length : (i2vImage ? 1 : 0),
            motionPrompt: finalMotionPrompt,
            aspectRatio,
            duration,
            letterboxed,
            resolution: videoResolution,
            sourceSize: sourceSize || undefined,
            creative: {
              source: creativePlan.source,
              provider: creativePlan.provider,
              vision: creativePlan.vision,
              channelAngles: creativePlan.channelAngles,
              motionBrief: creativePlan.motionBrief,
            },
          },
        },
      })

      const submission = await createGrokVideo({
        model: submitModel,
        prompt: finalMotionPrompt,
        duration,
        aspectRatio,
        resolution: videoResolution,
        ...(useR2V
          ? { referenceImages: r2vRefUrls, mode: 'reference_to_video' as const }
          : { image: i2vImage, mode: i2vImage ? 'image_to_video' as const : 'text_to_video' as const }),
      })

      await patchTask(task.id, {
        status: 'generating',
        response: {
          title,
          description,
          topics,
          coverUrl: productImageSource || '',
          progress: {
            percent: 10,
            stage: 'Queued at xAI',
            providerStatus: 'pending',
            requestId: submission.requestId,
            updatedAt: new Date().toISOString(),
          },
          plan: {
            provider: 'grok',
            pool: true,
            accountId: submission.account.id,
            accountName: submission.account.name,
            subscription: submission.account.metadata?.subscription,
            requestedModel,
            routedModel: videoModel,
            requestId: submission.requestId,
            hasProductImage: Boolean(productImageSource),
            usedImage: submission.usedImage,
            letterboxed,
            aspectRatio,
            duration,
          },
        },
      })

      let lastSavedPercent = 10
      const video = await waitForGrokVideo(
        submission.account,
        submission.requestId,
        240_000,
        async (progress) => {
          if (progress.percent - lastSavedPercent < 3 && progress.percent < 100)
            return
          lastSavedPercent = progress.percent
          await patchTask(task.id, {
            status: 'generating',
            response: {
              title,
              description,
              topics,
              coverUrl: productImageSource || '',
              progress: {
                percent: progress.percent,
                stage: progress.stage,
                providerStatus: progress.status,
                requestId: progress.requestId,
                updatedAt: new Date().toISOString(),
              },
              plan: {
                provider: 'grok',
                pool: true,
                accountId: submission.account.id,
                accountName: submission.account.name,
                subscription: submission.account.metadata?.subscription,
                requestedModel,
                routedModel: videoModel,
                requestId: submission.requestId,
                hasProductImage: Boolean(productImageSource),
                letterboxed,
                aspectRatio,
              },
            },
          })
        },
      )

      await recordGrokAccountUsage(submission.account.id, 1).catch(() => null)
      // Poster from actual video frame — product photo alone makes every card look identical.
      await patchTask(task.id, {
        status: 'generating',
        response: {
          title,
          description,
          topics,
          coverUrl: productImageSource || '',
          progress: {
            percent: 96,
            stage: 'Extracting thumbnail',
            providerStatus: 'done',
            requestId: submission.requestId,
            updatedAt: new Date().toISOString(),
          },
        },
      })
      const posterUrl = await extractVideoPoster(video.url, { seekSec: 1.2 }).catch(() => null)
      const coverUrl = posterUrl || productImageSource || ''
      await patchTask(task.id, {
        status: 'generating',
        response: {
          title,
          description,
          topics,
          coverUrl,
          progress: {
            percent: 98,
            stage: 'Saving video locally',
            providerStatus: 'archiving',
            requestId: submission.requestId,
            updatedAt: new Date().toISOString(),
          },
        },
      })
      const archivedVideo = await archiveGeneratedVideo(task.id, title, video.url, 'grok')
      const material = await persistGenerationMaterial(body, {
        title,
        description,
        topics,
        model: requestedModel,
        videoUrl: archivedVideo.url,
        coverUrl,
        aspectRatio,
        duration,
        resolution: String((submission as { resolution?: string }).resolution || body.resolution || '1080p'),
      })
      task.status = 'success'
      task.response = {
        title,
        description,
        topics,
        videoUrl: archivedVideo.url,
        sourceVideoUrl: video.url,
        archivedAssetId: archivedVideo.id,
        coverUrl,
        materialId: material?.id,
        progress: {
          percent: 100,
          stage: 'Completed',
          providerStatus: 'done',
          requestId: submission.requestId,
          updatedAt: new Date().toISOString(),
        },
        plan: {
          provider: 'grok',
          pool: true,
          accountId: submission.account.id,
          accountName: submission.account.name,
          subscription: submission.account.metadata?.subscription,
          requestedModel,
          routedModel: videoModel,
          requestId: submission.requestId,
          hasProductImage: Boolean(productImageSource),
          usedImage: submission.usedImage,
          letterboxed,
          aspectRatio,
          duration,
          motionPrompt,
        },
      }
      } // end non-storyboard grok video path
    }
    else {
      await patchTask(task.id, {
        status: 'generating',
        response: {
          progress: { percent: 15, stage: 'Generating via 9Router', providerStatus: 'running', updatedAt: new Date().toISOString() },
          plan: { provider: '9router', requestedModel },
        },
      })
      const chat = await call9RouterChat(prompt, { model: requestedModel })
      const pack = parseAiContentPack(chat.text)
      const asset = await renderSocialVideo(pack, body)
      const material = await persistGenerationMaterial(body, {
        title: String(pack.title || 'Social video'),
        description: String(pack.caption || ''),
        topics: Array.isArray(pack.hashtags) ? pack.hashtags : [],
        model: requestedModel,
        videoUrl: asset.url,
      })
      task.status = 'success'
      task.response = {
        title: String(pack.title || 'Social video'),
        description: String(pack.caption || ''),
        topics: Array.isArray(pack.hashtags) ? pack.hashtags : [],
        videoUrl: asset.url,
        coverUrl: '',
        materialId: material?.id,
        progress: { percent: 100, stage: 'Completed', providerStatus: 'done', updatedAt: new Date().toISOString() },
        plan: { provider: '9router', requestedModel, routedModel: requestedModel },
      }
    }
  }
  catch (error) {
    task.status = 'failed'
    task.errorMessage = error instanceof Error ? error.message : String(error)
    const prev = typeof task.response === 'object' && task.response ? task.response : {}
    task.response = {
      ...prev,
      progress: {
        ...(prev as any).progress,
        stage: 'Failed',
        providerStatus: 'failed',
        updatedAt: new Date().toISOString(),
      },
    }
  }
  task.updatedAt = new Date().toISOString()

  const latest = await getDraftTasks()
  const updated = latest.map(item => item.id === task.id ? task : item)
  await saveDraftTasks(updated)
}

/**
 * Mark zombie generating jobs as failed.
 * Early stages (caption pack / prep, percent < 10) reclaim sooner — those hangs
 * used to leave the card at 2% forever when Grok chat never returned.
 */
export async function reclaimStaleDraftTasks(maxAgeMs = 10 * 60_000) {
  const tasks = await getDraftTasks()
  const now = Date.now()
  let changed = false
  const next = tasks.map((task) => {
    if (task.status !== 'generating')
      return task
    const updated = Date.parse(task.updatedAt || task.createdAt) || 0
    const age = now - updated
    const percent = Number((task.response as any)?.progress?.percent)
    const stage = String((task.response as any)?.progress?.stage || '')
    const earlyStage = !Number.isFinite(percent) || percent < 10
      || /caption|queued|preparing|framing|matching/i.test(stage)
    const isFlowTask = /flow|veo|labs\.google/i.test(stage)
      || /flow|veo/i.test(String((task.response as any)?.plan?.runtime || ''))
      || /ext:flow/i.test(String((task.request as any)?.model || (task.response as any)?.plan?.model || ''))
    // Caption/prep stuck: 3.5 min. Flow CDP can run ~8–12 min. Mid xAI render: 10 min.
    const limit = earlyStage
      ? 3.5 * 60_000
      : isFlowTask
        ? 15 * 60_000
        : maxAgeMs
    if (age < limit)
      return task
    changed = true
    return {
      ...task,
      status: 'failed' as const,
      errorMessage: task.errorMessage
        || (earlyStage
          ? 'Stuck while preparing (caption/chat). Cancelled — retry generate.'
          : 'Generation stalled (no progress). Please retry.'),
      updatedAt: new Date().toISOString(),
      response: {
        ...(typeof task.response === 'object' ? task.response : {}),
        progress: {
          percent: Number.isFinite(percent) ? percent : 0,
          stage: 'Stalled',
          providerStatus: 'stale',
          updatedAt: new Date().toISOString(),
        },
      },
    }
  })
  if (changed)
    await saveDraftTasks(next)
  return next
}

/** User cancel from UI (generating or failed card). */
export async function cancelDraftTask(taskId: string) {
  const tasks = await getDraftTasks()
  const index = tasks.findIndex(t => t.id === taskId)
  if (index < 0)
    return null
  const task = tasks[index]
  if (task.status !== 'generating' && task.status !== 'failed')
    return task

  // Cancel linked browser bridge job if still queued/leased
  const jobId = String((task.response as any)?.plan?.jobId || '').trim()
  if (jobId) {
    try {
      const { cancelBridgeJob } = await import('@/app/api/ai/providers/extension/bridge/_store')
      await cancelBridgeJob(jobId)
    }
    catch {
      // non-fatal
    }
  }

  const next = {
    ...task,
    status: 'failed' as const,
    errorMessage: task.status === 'failed'
      ? (task.errorMessage || 'Cancelled')
      : 'Cancelled by user',
    updatedAt: new Date().toISOString(),
    response: {
      ...(typeof task.response === 'object' ? task.response : {}),
      progress: {
        ...((task.response as any)?.progress || {}),
        stage: 'Cancelled',
        providerStatus: 'cancelled',
        percent: 100,
        updatedAt: new Date().toISOString(),
      },
      plan: {
        ...((task.response as any)?.plan || {}),
        phase: 'cancelled',
      },
    },
  }
  tasks[index] = next
  await saveDraftTasks(tasks)
  return next
}

export async function createDraftTasks(body: Record<string, any>) {
  await reclaimStaleDraftTasks().catch(() => null)
  const quantity = Math.min(6, Math.max(1, Number(body.quantity || 1)))
  const tasks = await getDraftTasks()
  const created: LocalDraftTask[] = Array.from({ length: quantity }, () => ({
    id: randomUUID(),
    status: 'generating',
    points: 0,
    request: body,
    response: {
      progress: {
        percent: 1,
        stage: 'Queued',
        providerStatus: 'queued',
        updatedAt: new Date().toISOString(),
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))
  tasks.unshift(...created)
  await saveDraftTasks(tasks)

  void (async () => {
    for (const task of created)
      await processDraftTask(task, body)
  })()

  return created
}
