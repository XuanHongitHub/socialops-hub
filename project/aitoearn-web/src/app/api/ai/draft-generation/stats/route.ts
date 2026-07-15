import { getDraftTasks } from '../_local'
export async function GET() { const tasks = await getDraftTasks(); return Response.json({ code: 0, data: { generatingCount: tasks.filter(task => task.status === 'generating').length }, message: 'ok', url: '/api/ai/draft-generation/stats' }) }
