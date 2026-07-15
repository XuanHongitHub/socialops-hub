import { NextResponse } from 'next/server'
import { getPublishRecords, savePublishRecords } from '@/app/api/plat/publish/_local'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const records = await getPublishRecords()
  await savePublishRecords(records.filter(record => record.id !== id && record.flowId !== id))
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: `/api/plat/publish/delete/${id}` })
}
