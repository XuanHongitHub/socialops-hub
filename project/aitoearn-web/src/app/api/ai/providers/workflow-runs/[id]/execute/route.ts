import { apiOk, call9RouterChat, parseAiContentPack, readBody, renderSocialVideo, socialContentPrompt, updateWorkflowRun } from '@/app/api/ai/providers/_local'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readBody(req)
  const { id } = await params
  await updateWorkflowRun(id, { status: 'running' })
  try {
    const steps = Array.isArray(body.steps) ? body.steps : []
    const input = (body.input || steps[0]?.input || {}) as Record<string, unknown>
    const prompt = String(input.prompt || body.prompt || socialContentPrompt(input))
    const content = await call9RouterChat(prompt, { model: String(body.model || 'cx_agy') })
    const pack = parseAiContentPack(content.text)
    const videoAsset = await renderSocialVideo(pack, input)
    const output = {
      content: content.text,
      pack,
      video: {
        status: 'ready',
        provider: videoAsset.provider,
        url: videoAsset.url,
        assetId: videoAsset.id,
      },
      raw: content.raw,
    }
    const run = await updateWorkflowRun(id, { status: 'completed', input, output })
    return apiOk({ ...run, steps, dryRun: false }, `/api/ai/providers/workflow-runs/${id}/execute`)
  }
  catch (error) {
    const run = await updateWorkflowRun(id, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    return apiOk(run, `/api/ai/providers/workflow-runs/${id}/execute`)
  }
}
