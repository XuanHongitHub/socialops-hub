import { NextResponse } from 'next/server'
import { filterPublishRecords, getPublishRecords } from '@/app/api/plat/publish/_local'

export async function GET(req: Request) {
  const records = filterPublishRecords(await getPublishRecords(), req.url)
  return NextResponse.json({
    code: 0,
    data: records,
    message: 'ok',
    url: '/api/v2/channels/publish/records',
  })
}
