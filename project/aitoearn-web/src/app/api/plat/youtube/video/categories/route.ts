import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    code: 0,
    data: [
      { id: '22', title: 'People & Blogs' },
      { id: '24', title: 'Entertainment' },
      { id: '26', title: 'Howto & Style' },
    ],
    message: 'ok',
    url: '/api/plat/youtube/video/categories',
  })
}
