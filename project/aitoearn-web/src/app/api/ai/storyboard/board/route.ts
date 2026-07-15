/**
 * POST /api/ai/storyboard/board
 * Build board plan from:
 *  - client board JSON
 *  - board/info deck image(s) via vision parse
 *  - product image + agent (auto 3-beat)
 */
import { runProductCreativeAgent } from '@/app/api/ai/providers/productCreativeAgent'
import { classifyRefImages } from '../classifyRefImage'
import { autoBoardFromProduct, parseBoardPlanFromImages } from '../parseBoardPlan'
import { defaultProductStoryboard, type StoryboardBoard } from '../types'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const productTitle = String(body.productTitle || body.title || '').trim()
    const productUrl = String(body.productUrl || '').trim()
    const productNotes = String(body.productNotes || body.notes || '').trim()
    const userPrompt = String(body.prompt || body.userPrompt || '').trim()
    const single = String(body.imageUrl || body.image || body.heroImageUrl || '').trim()
    const imageUrls = [
      ...(Array.isArray(body.imageUrls) ? body.imageUrls.map(String) : []),
      single,
    ]
      .map(u => String(u || '').trim())
      .filter(Boolean)
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 4)

    const platforms = Array.isArray(body.platforms)
      ? body.platforms.map(String)
      : String(body.platforms || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)

    const provided = body.board as StoryboardBoard | undefined
    if (provided?.shots?.length) {
      return Response.json({
        code: 0,
        data: { board: provided, source: 'client' },
        message: 'ok',
        url: '/api/ai/storyboard/board',
      })
    }

    const classified = imageUrls.length ? await classifyRefImages(imageUrls) : []
    const boardImgs = classified.filter(c => c.role === 'board_plan').map(c => c.url)
    const productImgs = classified
      .filter(c => c.role === 'product_hero' || c.role === 'lifestyle' || c.role === 'unknown')
      .map(c => c.url)

    // 1) Board deck image(s) → vision parse
    if (boardImgs.length) {
      const parsed = await parseBoardPlanFromImages({
        boardImageUrls: boardImgs,
        productTitle: productTitle || userPrompt.slice(0, 80),
        userPrompt: userPrompt || productNotes,
        timeoutMs: 42_000,
      })
      return Response.json({
        code: 0,
        data: {
          board: parsed.board,
          source: parsed.source,
          provider: parsed.provider,
          classified: classified.map(c => ({ url: c.url, role: c.role, confidence: c.confidence })),
          note: 'Board image used as plan only — I2V still needs product photo',
        },
        message: parsed.source === 'vision' ? 'ok' : 'fallback:template',
        url: '/api/ai/storyboard/board',
      })
    }

    // 2) Product image → agent-enriched auto board
    const productHero = productImgs[0] || imageUrls[0] || ''
    let board = defaultProductStoryboard({
      productTitle: productTitle || userPrompt.slice(0, 80),
      sceneHint: userPrompt || productNotes,
    })
    let source: 'agent' | 'template' = 'template'
    let creative: Record<string, unknown> | undefined

    if (productHero || productTitle || userPrompt) {
      try {
        const plan = await runProductCreativeAgent({
          productTitle: productTitle || userPrompt.slice(0, 120),
          productUrl,
          productNotes,
          userPrompt: userPrompt || productNotes,
          imageUrl: productHero || undefined,
          platforms: platforms.length ? platforms : ['instagram', 'youtube', 'tiktok'],
          duration: 10,
          aspectRatio: '9:16',
          hasReferenceImage: Boolean(productHero),
          timeoutMs: 35_000,
        })
        source = plan.source === 'agent' ? 'agent' : 'template'
        creative = {
          source: plan.source,
          provider: plan.provider,
          vision: plan.vision,
          motionBrief: plan.motionBrief,
          title: plan.title,
          caption: plan.caption,
          hashtags: plan.hashtags,
        }
        board = autoBoardFromProduct({
          productTitle: plan.title || productTitle,
          printLock: plan.vision?.printOrArtwork,
          mood: plan.vision?.mood || plan.vision?.giftOccasion,
          sceneHint: plan.vision?.scene || userPrompt,
          camera: plan.motionBrief?.camera,
          audioBed: plan.motionBrief?.audioBed,
        })
      }
      catch {
        // keep default
      }
    }

    return Response.json({
      code: 0,
      data: {
        board,
        source,
        creative,
        classified: classified.map(c => ({ url: c.url, role: c.role, confidence: c.confidence })),
      },
      message: 'ok',
      url: '/api/ai/storyboard/board',
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/ai/storyboard/board',
    }, { status: 500 })
  }
}
