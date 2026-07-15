import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ accountId: string, dataId: string }> }) {
  const { accountId, dataId } = await params
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: `/api/channel/${accountId}/post/${dataId}` })
}
