import { apiOk, readBody, socialContentPrompt, call9RouterChat } from '@/app/api/ai/providers/_local'

export async function POST(req: Request) {
  const body = await readBody(req)
  try {
    const result = await call9RouterChat(socialContentPrompt(body), { model: 'cx_agy' })
    return apiOk({ ok: true, dryRun: true, platform: body.platform, strategy: body.strategy, title: body.title, content: result.text }, '/api/ai/providers/social/publish/dry-run')
  }
  catch (error) {
    return apiOk({ ok: false, dryRun: true, platform: body.platform, error: error instanceof Error ? error.message : String(error) }, '/api/ai/providers/social/publish/dry-run')
  }
}
