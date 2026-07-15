/**
 * Multi-platform SEO copy for Publish dialog.
 * Providers: grok (OAuth pool) | 9router (local chat) | auto
 */
import { call9RouterChat } from '@/app/api/ai/providers/_local'
import { callGrokChat } from '@/app/api/ai/providers/grok/_client'
import {
  buildMultiPlatformSeoSystemPrompt,
  clampDes,
  clampTitle,
  normalizeTopicsForPlat,
} from '@/components/PublishDialog/platformSeoRules'
import { PlatType } from '@/app/config/platConfig'

function stripJsonFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const provider = String(body.provider || 'auto').toLowerCase() // grok | 9router | auto
    const platforms: string[] = Array.isArray(body.platforms)
      ? body.platforms.map(String)
      : []
    const productTitle = String(body.productTitle || body.title || '').trim()
    const productUrl = String(body.productUrl || '').trim()
    const productNotes = String(body.productNotes || body.context || '').trim()
    const baseTitle = String(body.title || productTitle || '').trim()
    const baseDes = String(body.des || body.caption || '').trim()
    const baseTopics: string[] = Array.isArray(body.topics)
      ? body.topics.map(String)
      : []

    if (!platforms.length) {
      return Response.json({ code: 400, message: 'platforms required', data: null }, { status: 400 })
    }

    const platEnums = platforms.filter((p): p is PlatType =>
      Object.values(PlatType).includes(p as PlatType),
    )
    if (!platEnums.length) {
      return Response.json({ code: 400, message: 'no valid platforms', data: null }, { status: 400 })
    }

    const system = buildMultiPlatformSeoSystemPrompt(platEnums)
    const user = `Product title: ${productTitle || baseTitle}
Product URL: ${productUrl}
Context/notes: ${productNotes}
Existing title: ${baseTitle}
Existing caption: ${baseDes}
Existing topics: ${baseTopics.join(', ')}
Platforms: ${platEnums.join(', ')}
Marketplace brand: BugSell. Rewrite any "Shop now at <seller shop>" style lines into BugSell-facing CTAs. Do not name micro-sellers in public copy.

Write SEO-optimized title, des, and topics for EACH platform key.`

    let text = ''
    let usedProvider = provider

    const tryGrok = async () => {
      const r = await callGrokChat(`${system}\n\n${user}`, 'grok-4')
      return r.text || ''
    }
    const tryRouter = async () => {
      const r = await call9RouterChat(`${system}\n\n${user}`)
      return r.text || ''
    }

    try {
      if (provider === 'grok') {
        text = await tryGrok()
        usedProvider = 'grok'
      }
      else if (provider === '9router') {
        text = await tryRouter()
        usedProvider = '9router'
      }
      else {
        // auto: prefer grok pool, fallback 9router
        try {
          text = await tryGrok()
          usedProvider = 'grok'
        }
        catch {
          text = await tryRouter()
          usedProvider = '9router'
        }
      }
    }
    catch (e) {
      return Response.json({
        code: 500,
        message: e instanceof Error ? e.message : String(e),
        data: null,
      }, { status: 500 })
    }

    let parsed: Record<string, { title?: string, des?: string, topics?: string[] }> = {}
    try {
      parsed = JSON.parse(stripJsonFence(text))
    }
    catch {
      // Soft fallback: apply deterministic clamps from base copy
      parsed = {}
      for (const plat of platEnums) {
        parsed[plat] = {
          title: baseTitle,
          des: baseDes,
          topics: baseTopics,
        }
      }
    }

    const packs: Record<string, { title: string, des: string, topics: string[] }> = {}
    for (const plat of platEnums) {
      const row = parsed[plat] || parsed[String(plat)] || {}
      const title = clampTitle(String(row.title || baseTitle || productTitle || 'Product'), plat)
      let des = clampDes(String(row.des || baseDes || title), plat)
      const topics = normalizeTopicsForPlat(
        Array.isArray(row.topics) ? row.topics : baseTopics,
        plat,
      )
      // Append topics to des for platforms that parse hashtags from caption (if not already present)
      if (topics.length && !topics.some(t => des.includes(`#${t}`))) {
        const tagLine = topics.map(t => `#${t}`).join(' ')
        const combined = `${des}\n${tagLine}`.trim()
        des = clampDes(combined, plat)
      }
      packs[plat] = { title, des, topics }
    }

    return Response.json({
      code: 0,
      data: { packs, provider: usedProvider },
      message: 'ok',
      url: '/api/ai/publish-seo',
    })
  }
  catch (error) {
    return Response.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : String(error),
      url: '/api/ai/publish-seo',
    }, { status: 500 })
  }
}
