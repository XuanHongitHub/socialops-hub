import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ code: 0, data: { count: 0 }, message: 'ok', url: '/api/notification/unread-count' })
}
