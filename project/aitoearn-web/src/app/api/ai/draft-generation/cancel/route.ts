import { cancelDraftTask } from '../_local'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const taskId = String(body.taskId || body.id || '').trim()
    if (!taskId) {
      return Response.json({ code: 400, data: null, message: 'taskId required' }, { status: 400 })
    }
    const task = await cancelDraftTask(taskId)
    if (!task) {
      return Response.json({ code: 404, data: null, message: 'Task not found' }, { status: 404 })
    }
    return Response.json({ code: 0, data: task, message: 'ok', url: '/api/ai/draft-generation/cancel' })
  }
  catch (e) {
    return Response.json({
      code: 500,
      data: null,
      message: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
