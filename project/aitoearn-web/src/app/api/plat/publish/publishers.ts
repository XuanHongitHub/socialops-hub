import type { PublishRecordItem } from '@/api/platforms/publish.types'
import { accountFile, readJson, upsertAccount, type LocalSocialAccount } from '@/app/api/plat/meta/_local'
import { youtubeClientId, youtubeClientSecret } from '@/app/api/plat/youtube/_local'

export type PlatformPublishResult = {
  id: string
  url: string
  status: string
  meta?: Record<string, unknown>
}

export async function publishRecordToPlatform(record: PublishRecordItem): Promise<PlatformPublishResult> {
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const selected = accounts.find(item => item.id === record.accountId && item.type === record.accountType)
  const account = selected
  if (!account?.access_token)
    throw new Error(`${record.accountType} account token is missing. Reconnect the channel.`)

  const media = await loadMedia(record.videoUrl)
  const caption = buildCaption(record)

  switch (record.accountType) {
    case 'facebook':
      return publishFacebookVideo(account, record, media, caption)
    case 'instagram':
      return publishInstagramReel(account, record, caption)
    case 'pinterest':
      return publishPinterestVideo(account, record, media, caption)
    case 'youtube':
      return publishYouTubeVideo(account, record, media, caption)
    default:
      throw new Error(`${record.accountType} publishing is not implemented.`)
  }
}

async function loadMedia(path: string) {
  if (!path)
    throw new Error('A video is required for publishing.')
  const url = absoluteUrl(path)
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
  if (!response.ok)
    throw new Error(`Video source returned ${response.status}.`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length)
    throw new Error('Video file is empty.')
  return { bytes, url, contentType: response.headers.get('content-type') || 'video/mp4' }
}

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path))
    return path
  const domain = process.env.APP_DOMAIN || 'socialops.bebio.site'
  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function buildCaption(record: PublishRecordItem) {
  const tags = (record.topics || [])
    .map(topic => String(topic).trim().replace(/^#/, '').replace(/\s+/g, ''))
    .filter(Boolean)
    .map(topic => `#${topic}`)
  return [record.desc || record.title, tags.join(' ')].filter(Boolean).join('\n\n')
}

async function jsonResponse(response: Response, label: string) {
  const text = await response.text()
  let payload: any = {}
  try {
    payload = text ? JSON.parse(text) : {}
  }
  catch {
    payload = { message: text.slice(0, 500) }
  }
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || payload?.message || `${label} failed (${response.status}).`
    throw new Error(String(message))
  }
  return payload
}

async function publishFacebookVideo(account: LocalSocialAccount, record: PublishRecordItem, media: Awaited<ReturnType<typeof loadMedia>>, caption: string) {
  const form = new FormData()
  form.set('access_token', account.access_token!)
  form.set('title', record.title.slice(0, 255))
  form.set('description', caption)
  form.set('published', 'true')
  form.set('source', new Blob([media.bytes], { type: media.contentType }), 'socials-hub-video.mp4')
  const payload = await jsonResponse(await fetch(`https://graph.facebook.com/v24.0/${account.uid}/videos`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(180_000),
  }), 'Facebook publish')
  const id = String(payload.id || '')
  if (!id)
    throw new Error('Facebook did not return a video ID.')
  return { id, url: `https://www.facebook.com/${id}`, status: 'PUBLISHED' }
}

async function publishInstagramReel(account: LocalSocialAccount, _record: PublishRecordItem, caption: string) {
  const profileQuery = new URLSearchParams({ fields: 'id,user_id,username', access_token: account.access_token! })
  const profile = await jsonResponse(await fetch(`https://graph.instagram.com/v24.0/me?${profileQuery}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  }), 'Instagram profile')
  const apiUserId = String(profile.id || '')
  if (!apiUserId)
    throw new Error('Instagram did not return an API user ID.')

  const createBody = new URLSearchParams({
    media_type: 'REELS',
    video_url: absoluteUrl(_record.videoUrl),
    caption,
    share_to_feed: 'true',
    access_token: account.access_token!,
  })
  const create = await jsonResponse(await fetch(`https://graph.instagram.com/v24.0/${apiUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createBody,
    signal: AbortSignal.timeout(30_000),
  }), 'Instagram container creation')
  const containerId = String(create.id || '')
  if (!containerId)
    throw new Error('Instagram did not return a container ID.')

  let status = ''
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(3_000)
    const query = new URLSearchParams({ fields: 'status_code,status', access_token: account.access_token! })
    const payload = await jsonResponse(await fetch(`https://graph.instagram.com/v24.0/${containerId}?${query}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    }), 'Instagram container status')
    status = String(payload.status_code || '')
    if (status === 'FINISHED')
      break
    if (status === 'ERROR' || status === 'EXPIRED')
      throw new Error(`Instagram container ${status}: ${payload.status || 'processing failed'}`)
  }
  if (status !== 'FINISHED')
    throw new Error('Instagram video processing timed out.')

  const publishBody = new URLSearchParams({ creation_id: containerId, access_token: account.access_token! })
  const published = await jsonResponse(await fetch(`https://graph.instagram.com/v24.0/${apiUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publishBody,
    signal: AbortSignal.timeout(30_000),
  }), 'Instagram publish')
  const id = String(published.id || '')
  if (!id)
    throw new Error('Instagram did not return a media ID.')
  const query = new URLSearchParams({ fields: 'permalink', access_token: account.access_token! })
  const details = await jsonResponse(await fetch(`https://graph.instagram.com/v24.0/${id}?${query}`, { cache: 'no-store' }), 'Instagram permalink')
  return { id, url: String(details.permalink || `https://www.instagram.com/${account.account.replace(/^@/, '')}/`), status: 'PUBLISHED', meta: { containerId, apiUserId } }
}

async function publishPinterestVideo(account: LocalSocialAccount, record: PublishRecordItem, media: Awaited<ReturnType<typeof loadMedia>>, caption: string) {
  const authHeaders = { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' }
  const registered = await jsonResponse(await fetch('https://api.pinterest.com/v5/media', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ media_type: 'video' }),
    signal: AbortSignal.timeout(30_000),
  }), 'Pinterest media registration')
  const mediaId = String(registered.media_id || '')
  const uploadUrl = String(registered.upload_url || '')
  if (!mediaId || !uploadUrl)
    throw new Error('Pinterest did not return media upload details.')
  const form = new FormData()
  for (const [key, value] of Object.entries(registered.upload_parameters || {}))
    form.set(key, String(value))
  form.set('file', new Blob([media.bytes], { type: media.contentType }), 'socials-hub-video.mp4')
  const uploaded = await fetch(uploadUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) })
  if (!uploaded.ok)
    throw new Error(`Pinterest media upload failed (${uploaded.status}).`)

  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(3_000)
    const status = await jsonResponse(await fetch(`https://api.pinterest.com/v5/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${account.access_token}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    }), 'Pinterest media status')
    if (status.status === 'succeeded')
      break
    if (status.status === 'failed')
      throw new Error('Pinterest video processing failed.')
    if (attempt === 39)
      throw new Error('Pinterest video processing timed out.')
  }

  const boardId = String(record.option?.pinterest?.boardId || '')
  if (!boardId)
    throw new Error('Pinterest board is required.')
  const pin = await jsonResponse(await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      board_id: boardId,
      title: record.title.slice(0, 100),
      description: caption.slice(0, 500),
      link: 'https://www.bugsell.com/',
      media_source: { source_type: 'video_id', media_id: mediaId },
    }),
    signal: AbortSignal.timeout(30_000),
  }), 'Pinterest Pin creation')
  const id = String(pin.id || '')
  if (!id)
    throw new Error('Pinterest did not return a Pin ID.')
  return { id, url: `https://www.pinterest.com/pin/${id}/`, status: 'PUBLISHED', meta: { mediaId } }
}

async function publishYouTubeVideo(account: LocalSocialAccount, record: PublishRecordItem, media: Awaited<ReturnType<typeof loadMedia>>, caption: string) {
  const accessToken = await validYouTubeToken(account)
  const option = record.option?.youtube || {}
  const metadata = {
    snippet: {
      title: record.title.slice(0, 100),
      description: caption.slice(0, 5_000),
      tags: (record.topics || []).slice(0, 30),
      categoryId: String(option.categoryId || '22'),
    },
    status: {
      privacyStatus: option.privacyStatus || 'public',
      embeddable: option.embeddable !== false,
      license: option.license || 'youtube',
      selfDeclaredMadeForKids: option.selfDeclaredMadeForKids === true,
    },
  }
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(media.bytes.length),
      'X-Upload-Content-Type': media.contentType,
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(30_000),
  })
  if (!init.ok)
    await jsonResponse(init, 'YouTube upload initialization')
  const uploadUrl = init.headers.get('location')
  if (!uploadUrl)
    throw new Error('YouTube did not return a resumable upload URL.')
  const uploaded = await jsonResponse(await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': media.contentType, 'Content-Length': String(media.bytes.length) },
    body: media.bytes,
    signal: AbortSignal.timeout(300_000),
  }), 'YouTube upload')
  const id = String(uploaded.id || '')
  if (!id)
    throw new Error('YouTube did not return a video ID.')
  return { id, url: `https://www.youtube.com/watch?v=${id}`, status: String(uploaded.status?.uploadStatus || 'uploaded') }
}

async function validYouTubeToken(account: LocalSocialAccount) {
  if (!account.refresh_token)
    return account.access_token!
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: youtubeClientId(),
      client_secret: youtubeClientSecret(),
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await jsonResponse(response, 'YouTube token refresh')
  account.access_token = String(payload.access_token || '')
  account.updateTime = new Date().toISOString()
  await upsertAccount(account)
  return account.access_token
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
