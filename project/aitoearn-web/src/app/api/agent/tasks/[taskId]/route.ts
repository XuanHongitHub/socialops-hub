import { getTasks, jsonOk, saveTasks } from '../../_local'

async function getTaskId(params: Promise<{ taskId: string }>) { return (await params).taskId }

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const taskId = await getTaskId(params)
  const task = (await getTasks()).find(item => item.id === taskId)
  if (!task) return Response.json({ code: 404, data: null, message: 'Local task not found.', url: `/api/agent/tasks/${taskId}` }, { status: 404 })
  return jsonOk(task, `/api/agent/tasks/${taskId}`)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const taskId = await getTaskId(params)
  await saveTasks((await getTasks()).filter(task => task.id !== taskId))
  return jsonOk(true, `/api/agent/tasks/${taskId}`)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const taskId = await getTaskId(params)
  const body = await req.json().catch(() => ({}))
  const tasks = await getTasks()
  const index = tasks.findIndex(task => task.id === taskId)
  if (index >= 0) {
    tasks[index] = { ...tasks[index], title: String(body.title || tasks[index].title), updatedAt: new Date().toISOString() }
    await saveTasks(tasks)
  }
  return jsonOk(true, `/api/agent/tasks/${taskId}`)
}
