import { getDraftTasks, reclaimStaleDraftTasks } from '../_local'

export async function POST(req: Request) {
  await reclaimStaleDraftTasks().catch(() => null)
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.taskIds) ? body.taskIds : []
  const tasks = (await getDraftTasks()).filter(task => ids.includes(task.id))
  return Response.json({ code: 0, data: tasks, message: 'ok', url: '/api/ai/draft-generation/query' })
}
