import { NextResponse } from 'next/server'
import { PublishStatus } from '@/api/platforms/publish.constants'
import { PlatType } from '@/app/config/platConfig'
import { publishRecordToPlatform } from '@/app/api/plat/publish/publishers'
import { getPublishRecords, savePublishRecords } from '@/app/api/plat/publish/_local'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const records = await getPublishRecords()
  const index = records.findIndex(record => record.id === id || record.flowId === id)
  if (index < 0)
    return NextResponse.json({ code: 404, message: 'Publish record not found', url: `/api/plat/publish/nowPubTask/${id}` }, { status: 404 })
  if (records[index].accountType === PlatType.Tiktok) {
    return NextResponse.json(
      { code: 409, data: records[index], message: 'TikTok draft was sent to the creator inbox. Finish publishing in TikTok, or use Direct Post after app approval.', url: `/api/plat/publish/nowPubTask/${id}` },
      { status: 409 },
    )
  }
  try {
    const result = await publishRecordToPlatform(records[index])
    records[index] = {
      ...records[index],
      status: PublishStatus.RELEASED,
      dataId: result.id,
      platformWorkId: result.id,
      workLink: result.url,
      linkStatus: 'ready',
      linkMeta: { platformStatus: result.status, ...result.meta },
      errorMsg: '',
      publishTime: new Date(),
      updatedAt: new Date().toISOString(),
    }
  }
  catch (error) {
    records[index] = {
      ...records[index],
      status: PublishStatus.FAIL,
      linkStatus: 'failed',
      errorMsg: error instanceof Error ? error.message : `${records[index].accountType} publish failed.`,
      updatedAt: new Date().toISOString(),
    }
    await savePublishRecords(records)
    return NextResponse.json({ code: 400, data: records[index], message: records[index].errorMsg, url: `/api/plat/publish/nowPubTask/${id}` }, { status: 400 })
  }
  await savePublishRecords(records)
  return NextResponse.json({ code: 0, data: records[index], message: 'ok', url: `/api/plat/publish/nowPubTask/${id}` })
}
