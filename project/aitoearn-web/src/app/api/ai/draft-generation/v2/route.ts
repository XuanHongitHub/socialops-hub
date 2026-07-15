import { createDraftTasks } from '../_local'
export async function POST(req: Request) { const tasks = await createDraftTasks(await req.json().catch(() => ({}))); return Response.json({ code: 0, data: { taskIds: tasks.map(task => task.id) }, message: 'ok', url: '/api/ai/draft-generation/v2' }) }
