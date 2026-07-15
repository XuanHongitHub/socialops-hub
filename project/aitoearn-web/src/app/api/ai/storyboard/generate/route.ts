/**
 * POST /api/ai/storyboard/generate
 * Direct multi-shot storyboard generation (also available via draft-generation mode=storyboard).
 * Prefer draft-generation/v2 for queue UI + material persist; this is for smoke / tools.
 */
import { runStoryboardGeneration } from '../runStoryboard'
import type { StoryboardBoard } from '../types'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const heroImageUrl = String(
      body.heroImageUrl || body.imageUrl || body.image || (Array.isArray(body.imageUrls) ? body.imageUrls[0] : '') || '',
    ).trim()
    if (!heroImageUrl) {
      return Response.json({
        code: 400,
        data: null,
        message: 'heroImageUrl / product photo required for storyboard',
        url: '/api/ai/storyboard/generate',
      }, { status: 400 })
    }

    const result = await runStoryboardGeneration({
      groupId: String(body.groupId || 'direct'),
      heroImageUrl,
      extraImageUrls: Array.isArray(body.extraImageUrls) ? body.extraImageUrls.map(String) : undefined,
      productTitle: String(body.productTitle || '').trim() || undefined,
      productUrl: String(body.productUrl || '').trim() || undefined,
      productNotes: String(body.productNotes || '').trim() || undefined,
      userPrompt: String(body.prompt || body.userPrompt || '').trim() || undefined,
      board: body.board as StoryboardBoard | undefined,
      // Default to multi-ref-capable model (R2V / web parity). 1.5 has no reference_images.
      model: String(body.model || 'grok-imagine-video').replace(/^grok::/, ''),
      resolution: String(body.resolution || '1080p'),
      platforms: Array.isArray(body.platforms) ? body.platforms.map(String) : undefined,
      draftType: body.draftType === 'video' ? 'video' : 'draft',
    })

    return Response.json({
      code: 0,
      data: result,
      message: 'ok',
      url: '/api/ai/storyboard/generate',
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/ai/storyboard/generate',
    }, { status: 500 })
  }
}
