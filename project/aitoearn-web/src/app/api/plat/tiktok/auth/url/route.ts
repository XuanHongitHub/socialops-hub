import { NextResponse } from 'next/server'
import { apiOk, createTikTokTask, tiktokAuthUrl } from '@/app/api/plat/tiktok/_local'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { spaceId?: string }
    const task = await createTikTokTask(body.spaceId || 'default')
    const authUrl = tiktokAuthUrl(req, task.state)
    return apiOk({ url: authUrl, uri: authUrl, taskId: task.state }, '/api/plat/tiktok/auth/url')
  }
  catch (error) {
    return NextResponse.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'TikTok OAuth URL failed',
      url: '/api/plat/tiktok/auth/url',
    }, { status: 500 })
  }
}
