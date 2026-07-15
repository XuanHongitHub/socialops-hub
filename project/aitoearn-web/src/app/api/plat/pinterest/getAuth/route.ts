import { apiOk, createPinterestTask, pinterestAuthUrl } from '@/app/api/plat/pinterest/_local'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const task = await createPinterestTask(url.searchParams.get('spaceId') || 'default')
  return apiOk({ uri: pinterestAuthUrl(req, task.state), url: pinterestAuthUrl(req, task.state), taskId: task.state }, '/api/plat/pinterest/getAuth')
}
