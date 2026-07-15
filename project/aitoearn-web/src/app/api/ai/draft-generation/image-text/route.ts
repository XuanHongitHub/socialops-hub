import { createDraftTasks } from '../_local'

/** Image/text batch generation — reuses the same local task worker as video. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tasks = await createDraftTasks({
    ...body,
    // Normalize so processDraftTask can detect Grok image models
    model: body.imageModel || body.model,
    imageModel: body.imageModel || body.model,
  })
  return Response.json({
    code: 0,
    data: { taskIds: tasks.map(task => task.id) },
    message: 'ok',
    url: '/api/ai/draft-generation/image-text',
  })
}
