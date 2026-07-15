import { NextResponse } from 'next/server'
import { getPublishRecords, savePublishRecords } from '@/app/api/plat/publish/_local'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const records = await getPublishRecords()
  const index = records.findIndex(record => record.id === body.id || record.flowId === body.id)
  if (index < 0)
    return NextResponse.json({ code: 404, message: 'Publish record not found', url: '/api/plat/publish/updateRecordLink' }, { status: 404 })
  records[index] = { ...records[index], ...body, updatedAt: new Date().toISOString() }
  await savePublishRecords(records)
  return NextResponse.json({ code: 0, data: records[index], message: 'ok', url: '/api/plat/publish/updateRecordLink' })
}
