/**
 * Vision → staff prompt for draft generation.
 *
 * With product + storyboard board in the stack:
 *  - classify refs (product_hero vs board_plan vs lifestyle)
 *  - parse board → commercial multi-scene motion prompt (Scene 1/2/3)
 *  - product photo = print identity only; board = plan text, never video hero
 *
 * Without board: product catalog brief + motion skeleton (legacy).
 *
 * NDJSON: progress / result / error
 */
import {
  runProductCreativeAgent,
  type ProductCreativeProgress,
} from '@/app/api/ai/providers/productCreativeAgent'
import { buildCommercialStoryboardPrompt } from '@/app/api/ai/storyboard/commercialPrompt'
import { classifyRefImages, pickStoryboardHero } from '@/app/api/ai/storyboard/classifyRefImage'
import { normalizePrintLock } from '@/app/api/ai/storyboard/dualConstraint'
import { autoBoardFromProduct, parseBoardPlanFromImages } from '@/app/api/ai/storyboard/parseBoardPlan'
import { buildGrokNativeAudioClause } from '@/app/api/ai/providers/productVideoMotion'

function parseBody(body: Record<string, unknown>) {
  const productTitle = String(body.productTitle || body.title || '').trim()
  const productUrl = String(body.productUrl || '').trim()
  const productNotes = String(body.productNotes || body.notes || '').trim()
  const userPrompt = String(body.prompt || body.userPrompt || '').trim()
  const singleImage = String(body.imageUrl || body.image || body.heroImageUrl || '').trim()
  const imageUrls = [
    ...(Array.isArray(body.imageUrls) ? body.imageUrls.map(String) : []),
    singleImage,
  ]
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 6)

  const platforms = Array.isArray(body.platforms)
    ? body.platforms.map(String)
    : String(body.platforms || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
  // Honor UI config (10 / 15 etc.) — clamp to Grok-usable range
  const duration = Math.min(15, Math.max(6, Number(body.duration || 10) || 10))
  const aspectRatio = String(body.aspectRatio || '9:16')
  const provider = String(body.provider || 'auto').toLowerCase() as 'grok' | '9router' | 'auto'
  const bugsellCatalog = Boolean(
    body.bugsellCatalog
    || body.catalogSource === 'bugsell'
    || /bugsell/i.test(productUrl),
  )
  const stream = body.stream === true || body.stream === 1 || body.stream === '1'
  const storyboardPreferred = /storyboard/i.test(String(body.mode || body.generationMode || ''))
    || body.preferStoryboard === true

  return {
    productTitle,
    productUrl,
    productNotes,
    userPrompt,
    imageUrls,
    platforms,
    duration,
    aspectRatio,
    provider,
    bugsellCatalog,
    stream,
    storyboardPreferred,
  }
}

function scaleBoardShotsToDuration(
  board: import('@/app/api/ai/storyboard/types').StoryboardBoard,
  duration: number,
) {
  const d = Math.min(15, Math.max(6, duration || 10))
  board.duration = d
  const shots = board.shots || []
  if (!shots.length)
    return board
  // Proportional thirds for commercial beats
  const edges = [0, d / 3, (2 * d) / 3, d]
  board.shots = shots.slice(0, 3).map((s, i) => ({
    ...s,
    tStart: Math.round(edges[i]! * 10) / 10,
    tEnd: Math.round(edges[i + 1]! * 10) / 10,
  }))
  return board
}

function buildCatalogStaffPrompt(
  plan: Awaited<ReturnType<typeof runProductCreativeAgent>>,
  opts: {
    productUrl: string
    imageUrls: string[]
    bugsellCatalog: boolean
  },
) {
  return [
    plan.title ? `Product: ${plan.title}` : '',
    opts.productUrl ? `URL: ${opts.productUrl}` : '',
    plan.vision?.productType ? `Type: ${plan.vision.productType}` : '',
    plan.vision?.printOrArtwork ? `Print/art: ${plan.vision.printOrArtwork}` : '',
    plan.vision?.colors ? `Colors: ${plan.vision.colors}` : '',
    plan.vision?.materials ? `Materials: ${plan.vision.materials}` : '',
    plan.vision?.scene ? `Scene: ${plan.vision.scene}` : '',
    plan.vision?.mood ? `Mood: ${plan.vision.mood}` : '',
    plan.vision?.giftOccasion ? `Occasion: ${plan.vision.giftOccasion}` : '',
    plan.motionBrief?.camera ? `Camera: ${plan.motionBrief.camera}` : '',
    plan.motionBrief?.lighting ? `Light: ${plan.motionBrief.lighting}` : '',
    plan.motionBrief?.audioBed ? `Audio: ${plan.motionBrief.audioBed}` : '',
    plan.caption ? `Caption draft: ${plan.caption}` : '',
    plan.hashtags?.length ? `Hashtags: ${plan.hashtags.map(h => `#${h}`).join(' ')}` : '',
  ].filter(Boolean).join('\n')
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const parsed = parseBody(body)
    const accept = req.headers.get('accept') || ''
    const wantStream = parsed.stream || accept.includes('application/x-ndjson')

    if (!parsed.imageUrls.length && !parsed.productTitle && !parsed.userPrompt) {
      return Response.json({
        code: 400,
        data: null,
        message: 'Need at least one reference image (upload/paste) or product title for Vision',
        url: '/api/ai/creative-vision',
      }, { status: 400 })
    }

    const run = async (
      onProgress?: (p: ProductCreativeProgress) => void | Promise<void>,
    ) => {
      await onProgress?.({
        percent: 6,
        stage: 'Classifying refs…',
        step: 'collect',
        refCount: parsed.imageUrls.length,
        detail: 'product vs storyboard board',
      })

      let classified: Awaited<ReturnType<typeof classifyRefImages>> = []
      if (parsed.imageUrls.length) {
        try {
          classified = await classifyRefImages(parsed.imageUrls)
        }
        catch (e) {
          console.warn('[creative-vision] classify failed', e)
          classified = parsed.imageUrls.map(url => ({
            url,
            role: 'unknown' as const,
            confidence: 0.3,
            reasons: ['classify_failed'],
          }))
        }
      }

      const boards = classified.filter(c => c.role === 'board_plan')
      const picked = pickStoryboardHero(classified)
      const productUrl = picked.hero?.url || parsed.imageUrls[0] || ''
      const boardUrls = boards.map(b => b.url)
      const lifestyleUrls = classified.filter(c => c.role === 'lifestyle').map(c => c.url)

      await onProgress?.({
        percent: 14,
        stage: boards.length
          ? `Found storyboard board · product ${productUrl ? 'locked' : 'missing'}`
          : productUrl
            ? 'Product photo · no board (auto commercial beats)'
            : 'No product photo classified',
        step: 'resolve',
        refCount: parsed.imageUrls.length,
        resolvedCount: classified.filter(c => c.role !== 'unknown').length,
        detail: boards.length
          ? 'Board = plan only · will not be used as video hero'
          : 'Catalog vision path',
      })

      // ── Product print lock (always prefer real product image) ──
      await onProgress?.({
        percent: 28,
        stage: productUrl ? 'Reading product print…' : 'Reading product fields…',
        step: 'vision',
        refCount: parsed.imageUrls.length,
        detail: productUrl ? 'Product photo only (board skipped for print)' : undefined,
      })

      const plan = await runProductCreativeAgent({
        productTitle: parsed.productTitle || undefined,
        productUrl: parsed.productUrl || undefined,
        productNotes: parsed.productNotes || undefined,
        userPrompt: parsed.userPrompt || undefined,
        imageUrl: productUrl || undefined,
        imageUrls: productUrl ? [productUrl] : [],
        platforms: parsed.platforms.length
          ? parsed.platforms
          : ['tiktok', 'instagram', 'youtube', 'facebook', 'pinterest'],
        duration: parsed.duration,
        aspectRatio: parsed.aspectRatio,
        hasReferenceImage: Boolean(productUrl),
        letterboxed: false,
        topicMax: 5,
        titleMax: 80,
        provider: parsed.provider === 'grok' || parsed.provider === '9router' ? parsed.provider : 'auto',
        timeoutMs: 42_000,
        bugsellCatalog: parsed.bugsellCatalog,
      }, async (p) => {
        // Remap agent progress into mid-band
        await onProgress?.({
          ...p,
          percent: Math.min(70, 28 + Math.round((p.percent || 0) * 0.4)),
          step: p.step === 'done' ? 'compose' : (p.step || 'vision'),
        })
      })

      const printLock = normalizePrintLock(
        plan.vision?.printOrArtwork
        || plan.vision?.productType
        || parsed.productTitle
        || 'exact front print from the attached product photo',
      )

      // ── Board plan → commercial multi-scene prompt ──
      let mode: 'storyboard_commercial' | 'catalog_brief' = 'catalog_brief'
      let motionPrompt = plan.motionPrompt
      let staffPrompt = ''
      let planSource: string = plan.source

      const wantBoardPath = boards.length > 0 || parsed.storyboardPreferred

      if (wantBoardPath) {
        await onProgress?.({
          percent: 72,
          stage: boards.length ? 'Parsing storyboard board…' : 'Building commercial beats…',
          step: 'compose',
          detail: `${parsed.duration}s · ${parsed.aspectRatio}`,
        })

        let board = autoBoardFromProduct({
          productTitle: plan.title || parsed.productTitle,
          printLock,
          mood: plan.vision?.mood || plan.vision?.giftOccasion,
          sceneHint: plan.vision?.scene || parsed.userPrompt,
          camera: plan.motionBrief?.camera,
          audioBed: plan.motionBrief?.audioBed,
        })

        if (boardUrls.length) {
          try {
            const parsedBoard = await parseBoardPlanFromImages({
              boardImageUrls: boardUrls,
              productTitle: plan.title || parsed.productTitle,
              userPrompt: parsed.userPrompt,
              timeoutMs: 42_000,
            })
            board = parsedBoard.board
            planSource = parsedBoard.source === 'vision' ? 'board_vision' : 'board_template'
          }
          catch (e) {
            console.warn('[creative-vision] board parse failed', e)
            planSource = 'board_fallback'
          }
        }
        else {
          planSource = plan.source === 'agent' ? 'agent_auto_beats' : 'template_beats'
        }

        board = scaleBoardShotsToDuration(board, parsed.duration)
        if (printLock)
          board.heroDetails = [printLock, plan.vision?.colors, plan.vision?.productType].filter(Boolean).slice(0, 5) as string[]
        if (plan.vision?.mood)
          board.emotionalJob = plan.vision.mood

        const audioClause = buildGrokNativeAudioClause({
          duration: parsed.duration,
          audioBed: board.bgm || plan.motionBrief?.audioBed || 'warm lifestyle bed',
          mood: board.emotionalJob || plan.title || 'playful',
        })

        motionPrompt = buildCommercialStoryboardPrompt({
          duration: parsed.duration,
          aspectRatio: parsed.aspectRatio === 'auto' ? '9:16' : parsed.aspectRatio,
          productTitle: plan.title || parsed.productTitle || board.productTitle,
          printLock,
          board,
          audioClause,
        })

        // Staff prompt = commercial motion prompt (what Grok video should run)
        // plus a short ref legend so ops knows which image is board
        const refLegend = [
          productUrl ? `PRODUCT_REF: product photo (video hero / print lock)` : '',
          ...boardUrls.map((_, i) => `BOARD_REF_${i + 1}: storyboard plan only — do not animate as product`),
          ...lifestyleUrls.map((_, i) => `LIFESTYLE_REF_${i + 1}: optional on-body (not used unless clean)`),
        ].filter(Boolean).join('\n')

        staffPrompt = [
          motionPrompt,
          '',
          '---',
          `Duration: ${parsed.duration}s · Aspect: ${parsed.aspectRatio}`,
          refLegend,
        ].filter(Boolean).join('\n')

        mode = 'storyboard_commercial'
      }
      else {
        await onProgress?.({
          percent: 78,
          stage: 'Composing catalog brief…',
          step: 'compose',
        })
        staffPrompt = buildCatalogStaffPrompt(plan, {
          productUrl: parsed.productUrl,
          imageUrls: parsed.imageUrls,
          bugsellCatalog: parsed.bugsellCatalog,
        }) || motionPrompt
        mode = 'catalog_brief'
      }

      await onProgress?.({
        percent: 96,
        stage: mode === 'storyboard_commercial'
          ? `Commercial ${parsed.duration}s prompt ready`
          : 'Catalog brief ready',
        step: 'done',
      })

      return {
        source: plan.source,
        provider: plan.provider,
        title: plan.title,
        caption: plan.caption,
        hashtags: plan.hashtags,
        channelAngles: plan.channelAngles,
        vision: plan.vision,
        motionBrief: plan.motionBrief,
        motionPrompt,
        prompt: staffPrompt || motionPrompt,
        refImageCount: parsed.imageUrls.length,
        bugsellCatalog: parsed.bugsellCatalog,
        mode,
        planSource,
        duration: parsed.duration,
        aspectRatio: parsed.aspectRatio,
        classified: classified.map(c => ({
          url: c.url,
          role: c.role,
          confidence: c.confidence,
        })),
        productHeroUrl: productUrl || null,
        boardRefUrls: boardUrls,
        lifestyleRefUrls: lifestyleUrls,
        // Explicit: video gen must use product hero only when board present
        videoHeroUrl: productUrl || null,
        boardIsPlanOnly: boardUrls.length > 0,
      }
    }

    if (!wantStream) {
      const data = await run()
      return Response.json({
        code: 0,
        data,
        message: data.source === 'agent' ? 'ok' : `fallback:${data.provider}`,
        url: '/api/ai/creative-vision',
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const write = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`))
        }
        try {
          write({
            type: 'progress',
            percent: 4,
            stage: 'Starting Vision',
            step: 'collect',
            refCount: parsed.imageUrls.length,
            detail: parsed.imageUrls.length > 1
              ? 'Classify product vs storyboard…'
              : 'Reference images',
          })

          const data = await run(async (p) => {
            write({ type: 'progress', ...p })
          })

          write({
            type: 'result',
            data,
            message: data.source === 'agent' ? 'ok' : `fallback:${data.provider}`,
          })
        }
        catch (error) {
          write({
            type: 'error',
            message: error instanceof Error ? error.message : 'creative-vision failed',
            step: 'error',
            percent: 0,
            stage: 'Failed',
          })
        }
        finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'creative-vision failed',
      url: '/api/ai/creative-vision',
    }, { status: 500 })
  }
}
