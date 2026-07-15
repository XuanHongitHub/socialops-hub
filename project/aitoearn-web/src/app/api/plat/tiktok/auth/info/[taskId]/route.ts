import { NextResponse } from 'next/server'
import { readJson, tiktokTaskFile, type TikTokTask } from '@/app/api/plat/tiktok/_local'

export async function GET(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const tasks = await readJson<Record<string, TikTokTask>>(tiktokTaskFile, {})
  const task = tasks[taskId] || { state: taskId, status: 0, message: 'Waiting for TikTok authorization' }
  return NextResponse.json({ code: 0, data: task, message: 'ok', url: `/api/plat/tiktok/auth/info/${taskId}` })
}
