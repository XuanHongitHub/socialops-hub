import { apiOk, readJson, taskFile, type MetaTask } from '@/app/api/plat/meta/_local'

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const tasks = await readJson<Record<string, MetaTask>>(taskFile, {})
  return apiOk(tasks[taskId] || { state: taskId, status: 0 }, `/api/plat/meta/auth/info/${taskId}`)
}
