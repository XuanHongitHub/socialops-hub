/**
 * Local SocialOps chat for Publish Work AI Assistant.
 * Backend /ai/chat is missing when SOCIALOPS_LOCAL_MODE=1 (no proxy) → was HTTP 404.
 * Routes to Grok OAuth pool, then 9Router — same stack as publish-seo.
 */
import { call9RouterChat } from '@/app/api/ai/providers/_local'
import { callGrokChat } from '@/app/api/ai/providers/grok/_client'

type ChatMessage = { role?: string, content?: unknown }

function flattenContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object' && 'text' in part)
          return String((part as { text?: string }).text || '')
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object')
    return JSON.stringify(content)
  return ''
}

function messagesToPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const role = String(m.role || 'user').toUpperCase()
      const text = flattenContent(m.content).trim()
      return text ? `${role}:\n${text}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : []
    const model = String(body.model || 'cx_agy')
    const prompt = messagesToPrompt(messages)
      || String(body.prompt || body.content || '').trim()

    if (!prompt) {
      return Response.json(
        { code: 400, message: 'messages or prompt required', data: null },
        { status: 400 },
      )
    }

    const system
      = 'You are SocialOps Publish Assistant. Help rewrite captions, titles, hashtags for social posts. '
        + 'Be concise, production-ready, no markdown code fences unless asked. '
        + 'Never invent on-video burned-in text instructions unless the user asks for overlay copy.'

    let text = ''
    let usedProvider = 'none'
    const preferGrok = model.startsWith('grok::') || /grok/i.test(model)
    const grokModel = model.startsWith('grok::') ? model.slice('grok::'.length) : 'grok-4'
    const routerModel = preferGrok ? 'cx_agy' : (model || 'cx_agy')

    const tryGrok = async () => {
      const r = await callGrokChat(`${system}\n\n${prompt}`, grokModel || 'grok-4')
      return r.text || ''
    }
    const tryRouter = async () => {
      const r = await call9RouterChat(prompt, { model: routerModel, system })
      return r.text || ''
    }

    try {
      if (preferGrok) {
        try {
          text = await tryGrok()
          usedProvider = 'grok'
        }
        catch {
          text = await tryRouter()
          usedProvider = '9router'
        }
      }
      else {
        try {
          text = await tryRouter()
          usedProvider = '9router'
        }
        catch {
          text = await tryGrok()
          usedProvider = 'grok'
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

    if (!text.trim()) {
      return Response.json({
        code: 500,
        message: 'Empty AI response — check Grok OAuth pool or 9Router',
        data: null,
      }, { status: 500 })
    }

    // Shape expected by PublishDialogAi: result.code === 0 && result.data.content
    return Response.json({
      code: 0,
      message: 'ok',
      data: {
        content: text.trim(),
        model,
        provider: usedProvider,
      },
      url: '/api/ai/chat',
    })
  }
  catch (e) {
    return Response.json({
      code: 500,
      message: e instanceof Error ? e.message : String(e),
      data: null,
    }, { status: 500 })
  }
}
