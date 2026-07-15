import { createMaterialFromGeneration } from '@/app/api/material/_local'
import { callGrokChat, createGrokImage, recordGrokAccountUsage } from '@/app/api/ai/providers/grok/_client'
import { parseAiContentPack } from '@/app/api/ai/providers/_local'

/**
 * Photo Post flow: product image (+ optional AI gen) → multi-platform caption packs → draft material.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>
    const groupId = String(body.groupId || '')
    const productTitle = String(body.productTitle || 'Product')
    const productUrl = String(body.productUrl || '')
    const productNotes = String(body.productNotes || '')
    const platforms: string[] = Array.isArray(body.platforms) ? body.platforms.map(String) : []
    let imageUrls: string[] = Array.isArray(body.imageUrls) ? body.imageUrls.map(String).filter(Boolean) : []
    const genImage = body.genImage === true
    const imageModel = String(body.imageModel || 'grok-imagine-image').replace(/^grok::/, '')

    if (!groupId)
      return Response.json({ code: 400, data: null, message: 'groupId required' }, { status: 400 })
    if (!imageUrls.length && !genImage)
      return Response.json({ code: 400, data: null, message: 'Product image required (or enable genImage)' }, { status: 400 })

    // Optional AI product image generation from product context
    if (genImage) {
      try {
        const gen = await createGrokImage({
          model: imageModel,
          prompt: [
            `Professional ecommerce product photo for social media.`,
            `Product: ${productTitle}.`,
            productNotes ? `Details: ${productNotes}.` : '',
            `Clean studio or lifestyle presentation, accurate product look, no text overlays.`,
          ].filter(Boolean).join(' '),
          n: 1,
          aspectRatio: String(body.aspectRatio || '1:1'),
          image: imageUrls[0],
        })
        await recordGrokAccountUsage(gen.account.id, 1).catch(() => null)
        imageUrls = [...gen.urls, ...imageUrls]
      }
      catch (e) {
        // Keep original product images if gen fails
        if (!imageUrls.length) {
          return Response.json({
            code: 500,
            data: null,
            message: e instanceof Error ? e.message : 'Image generation failed',
          }, { status: 500 })
        }
      }
    }

    const platformList = platforms.length ? platforms : ['tiktok', 'instagram', 'x']
    const packPrompt = `You write short social posts for BugSell marketplace product photos.
Product: ${productTitle}
URL: ${productUrl}
Notes: ${productNotes}
Platforms: ${platformList.join(', ')}
Brand: public marketplace is BugSell. Do NOT promote individual seller shop names in CTAs (ignore "Seller (internal only…)" for public copy).
Return JSON only:
{
  "masterTitle": "...",
  "masterCaption": "...",
  "masterHashtags": ["..."],
  "platforms": {
    "<platform>": { "title": "...", "caption": "...", "hashtags": ["..."] }
  }
}
Rules: title max 70 chars; caption 1-2 sentences + soft BugSell CTA ("Find it on BugSell"); NEVER "Shop now at <seller>"; hashtags 3-5 without # (product niche + bugsell ok); adapt tone lightly per platform (tiktok casual, instagram polished, x concise, linkedin professional).`

    const chat = await callGrokChat(packPrompt, 'grok-4').catch(() => ({ text: '' }))
    const raw = parseAiContentPack(chat.text || '{}') as Record<string, any>
    const platformsPack: Record<string, { title: string, caption: string, hashtags: string[] }> = {}
    const src = (raw.platforms && typeof raw.platforms === 'object') ? raw.platforms : {}
    for (const p of platformList) {
      const row = src[p] || src[p.toLowerCase()] || {}
      platformsPack[p] = {
        title: String(row.title || raw.masterTitle || productTitle).slice(0, 80),
        caption: String(row.caption || raw.masterCaption || productNotes || productTitle),
        hashtags: Array.isArray(row.hashtags)
          ? row.hashtags.map(String)
          : (Array.isArray(raw.masterHashtags) ? raw.masterHashtags.map(String) : []),
      }
    }

    const masterTitle = String(raw.masterTitle || productTitle)
    const masterCaption = String(raw.masterCaption || platformsPack[platformList[0]]?.caption || '')
    const masterHashtags = Array.isArray(raw.masterHashtags)
      ? raw.masterHashtags.map(String)
      : (platformsPack[platformList[0]]?.hashtags || [])

    const material = await createMaterialFromGeneration({
      groupId,
      title: masterTitle,
      desc: masterCaption,
      topics: masterHashtags,
      model: genImage ? `grok::${imageModel}` : 'photo-post',
      imageUrls,
      coverUrl: imageUrls[0],
      generationParams: {
        flow: 'photo-post',
        productTitle,
        productUrl,
        productNotes,
        productImageUrl: imageUrls[0],
        platforms: platformList,
        platformPacks: platformsPack,
        genImage,
      },
    })

    return Response.json({
      code: 0,
      data: {
        materialId: material?.id,
        imageUrls,
        master: { title: masterTitle, caption: masterCaption, hashtags: masterHashtags },
        platforms: platformsPack,
        material,
      },
      message: 'ok',
      url: '/api/ai/draft-generation/photo-post',
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/ai/draft-generation/photo-post',
    }, { status: 500 })
  }
}
