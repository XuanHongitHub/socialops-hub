import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    code: 0,
    data: [
      { value: 'US', label: 'United States' },
      { value: 'VN', label: 'Vietnam' },
    ],
    message: 'ok',
    url: '/api/plat/youtube/common/params',
  })
}
