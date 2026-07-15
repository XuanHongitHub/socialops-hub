import { getTasks, jsonOk } from '../../../_local'

async function getTaskId(params: Promise<{ taskId: string }>) { return (await params).taskId }

export async function GET(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const taskId = await getTaskId(params)
  const url = new URL(req.url)
  const lastMessageId = url.searchParams.get('lastMessageId')
  const task = (await getTasks()).find(item => item.id === taskId)
  if (!task) return Response.json({ code: 404, data: null, message: 'Local task not found.', url: `/api/agent/tasks/${taskId}/messages` }, { status: 404 })
  const start = lastMessageId ? task.messages.findIndex(message => message.uuid === lastMessageId) + 1 : 0
  return jsonOk({ messages: task.messages.slice(Math.max(0, start)), status: task.status }, `/api/agent/tasks/${taskId}/messages`)
}
