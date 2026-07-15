import { NextResponse } from 'next/server'
import { PlatType } from '@/app/config/platConfig'
import { PublishStatus } from '@/api/platforms/publish.constants'
import { accountFile, readJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'
import { getPublishRecords, makePublishRecord, savePublishRecords } from '@/app/api/plat/publish/_local'
import { publishRecordToPlatform } from '@/app/api/plat/publish/publishers'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const records = await getPublishRecords()
  const record = makePublishRecord(body)

  if (record.accountType === PlatType.Tiktok) {
    const result = await publishTikTokDraft(record)
    if (!result.ok) {
      record.status = PublishStatus.FAIL
      record.errorMsg = result.message
      await savePublishRecords([record, ...records])
      return NextResponse.json({ code: 400, data: record, message: result.message, url: '/api/plat/publish/create' }, { status: 400 })
    }

    record.status = PublishStatus.RELEASED
    record.dataId = result.publishId || ''
    record.platformWorkId = result.publishId || ''
    record.linkStatus = 'pending'
    record.linkMeta = { tiktokPublishStatus: result.status }
    record.workLink = result.profileUrl || ''
  }
  else {
    try {
      const result = await publishRecordToPlatform(record)
      record.status = PublishStatus.RELEASED
      record.dataId = result.id
      record.platformWorkId = result.id
      record.workLink = result.url
      record.linkStatus = 'ready'
      record.linkMeta = { platformStatus: result.status, ...result.meta }
      record.errorMsg = ''
    }
    catch (error) {
      record.status = PublishStatus.FAIL
      record.linkStatus = 'failed'
      record.errorMsg = error instanceof Error ? error.message : `${record.accountType} publish failed.`
      await savePublishRecords([record, ...records])
      return NextResponse.json(
        { code: 400, data: record, message: record.errorMsg, url: '/api/plat/publish/create' },
        { status: 400 },
      )
    }
  }

  await savePublishRecords([record, ...records])
  return NextResponse.json({ code: 0, data: { id: record.id, flowId: record.flowId }, message: 'ok', url: '/api/plat/publish/create' })
}

async function publishTikTokDraft(record: ReturnType<typeof makePublishRecord>) {
  if (!record.videoUrl)
    return { ok: false, message: 'TikTok publishing requires a video. Upload a video before publishing.' }

  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const account = accounts.find(item => item.id === record.accountId && item.type === PlatType.Tiktok)
  if (!account?.access_token)
    return { ok: false, message: 'TikTok account token is missing. Reconnect TikTok in My Channels.' }

  const videoUrl = normalizeAssetUrl(record.videoUrl)
  const video = await fetch(videoUrl, { cache: 'no-store' })
  if (!video.ok)
    return { ok: false, message: `TikTok video source is not reachable (${video.status}).` }

  const videoBytes = Buffer.from(await video.arrayBuffer())
  if (!videoBytes.length)
    return { ok: false, message: 'TikTok video file is empty.' }

  const init = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoBytes.length,
        chunk_size: videoBytes.length,
        total_chunk_count: 1,
      },
    }),
    cache: 'no-store',
  })
  const initPayload = await init.json().catch(() => null) as any
  if (!init.ok || (initPayload?.error?.code && initPayload.error.code !== 'ok'))
    return { ok: false, message: initPayload?.error?.message || `TikTok upload init failed (${init.status}).` }

  const uploadUrl = initPayload?.data?.upload_url
  const publishId = initPayload?.data?.publish_id
  if (!uploadUrl || !publishId)
    return { ok: false, message: 'TikTok did not return an upload URL.' }

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(videoBytes.length),
      'Content-Range': `bytes 0-${videoBytes.length - 1}/${videoBytes.length}`,
    },
    body: videoBytes,
  })
  if (!upload.ok)
    return { ok: false, message: `TikTok video upload failed (${upload.status}).` }

  const status = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
    cache: 'no-store',
  }).then(res => res.json()).catch(() => null) as any

  return {
    ok: true,
    publishId,
    status: status?.data?.status || 'UPLOADED_TO_TIKTOK_INBOX',
    profileUrl: account.account ? `https://www.tiktok.com/@${account.account.replace(/^@/, '')}` : '',
  }
}

function normalizeAssetUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://'))
    return path
  const base = process.env.NEXT_PUBLIC_OSS_URL || process.env.APP_DOMAIN || ''
  if (!base)
    return path
  if (base.startsWith('http'))
    return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  return `https://${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
