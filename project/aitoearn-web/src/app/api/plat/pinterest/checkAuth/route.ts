import { NextResponse } from 'next/server'
import { pinterestTaskFile, readJson, type PinterestTask } from '@/app/api/plat/pinterest/_local'

export async function GET(req: Request) {
  const taskId = new URL(req.url).searchParams.get('taskId') || ''
  const tasks = await readJson<Record<string, PinterestTask>>(pinterestTaskFile, {})
  const task = tasks[taskId] || { state: taskId, status: 0, message: 'Waiting for Pinterest authorization' }
  return NextResponse.json({ code: 0, data: task, message: 'ok', url: '/api/plat/pinterest/checkAuth' })
}
