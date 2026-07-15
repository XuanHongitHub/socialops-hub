import { NextResponse } from 'next/server'
import { readJson, youtubeTaskFile, type YouTubeTask } from '@/app/api/plat/youtube/_local'

export async function POST(_req: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const tasks = await readJson<Record<string, YouTubeTask>>(youtubeTaskFile, {})
  const task = tasks[taskId] || { state: taskId, status: 0, message: 'Waiting for YouTube authorization' }
  return NextResponse.json({ code: 0, data: task, message: 'ok', url: `/api/plat/youtube/auth/create-account/${taskId}` })
}
