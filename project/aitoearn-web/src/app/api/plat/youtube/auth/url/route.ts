import { NextResponse } from 'next/server'
import { apiOk, createYouTubeTask, youtubeAuthUrl } from '@/app/api/plat/youtube/_local'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const task = await createYouTubeTask(url.searchParams.get('spaceId') || 'default')
    const authUrl = youtubeAuthUrl(req, task.state)
    return apiOk({ url: authUrl, uri: authUrl, taskId: task.state }, '/api/plat/youtube/auth/url')
  }
  catch (error) {
    return NextResponse.json({
      code: 500,
      data: null,
      message: error instanceof Error ? error.message : 'YouTube OAuth URL failed',
      url: '/api/plat/youtube/auth/url',
    }, { status: 500 })
  }
}
