import { NextResponse } from 'next/server'
import { getPublishRecords } from '@/app/api/plat/publish/_local'

export async function GET(_req: Request, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params
  const record = (await getPublishRecords()).find(item => item.flowId === flowId || item.id === flowId)
  if (!record)
    return NextResponse.json({ code: 404, message: 'Publish record not found', url: `/api/plat/publish/records/${flowId}` }, { status: 404 })
  return NextResponse.json({ code: 0, data: record, message: 'ok', url: `/api/plat/publish/records/${flowId}` })
}
