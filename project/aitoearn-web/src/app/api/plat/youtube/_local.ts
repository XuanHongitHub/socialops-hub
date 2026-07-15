import { join } from 'node:path'
import { accountFile, apiOk, authBaseUrl, makeAccount, newState, readJson, upsertAccount, writeJson } from '@/app/api/plat/meta/_local'

export type YouTubeTask = {
  state: string
  status: number
  spaceId: string
  accountId?: string
  message?: string
  createdAt: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
export const youtubeTaskFile = join(appData, 'SocialsHub', 'youtube-auth-tasks.json')

export function youtubeClientId() {
  return process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
}

export function youtubeClientSecret() {
  return process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
}

export function youtubeRedirectUri(req: Request) {
  return process.env.YOUTUBE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `${authBaseUrl(req)}/api/plat/youtube/auth/callback`
}

export function youtubeAuthUrl(req: Request, state: string) {
  const clientId = youtubeClientId()
  if (!clientId)
    throw new Error('YOUTUBE_CLIENT_ID is missing')

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: youtubeRedirectUri(req),
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString()
  return url.toString()
}

export async function createYouTubeTask(spaceId = 'default') {
  const state = newState()
  const tasks = await readJson<Record<string, YouTubeTask>>(youtubeTaskFile, {})
  tasks[state] = { state, status: 0, spaceId, createdAt: new Date().toISOString() }
  await writeJson(youtubeTaskFile, tasks)
  return tasks[state]
}

export async function updateYouTubeTask(state: string, patch: Partial<YouTubeTask>) {
  const tasks = await readJson<Record<string, YouTubeTask>>(youtubeTaskFile, {})
  tasks[state] = { ...tasks[state], ...patch } as YouTubeTask
  await writeJson(youtubeTaskFile, tasks)
  return tasks[state]
}

export async function exchangeYouTubeCode(code: string, redirectUri: string) {
  const clientId = youtubeClientId()
  const secret = youtubeClientSecret()
  if (!clientId)
    throw new Error('YOUTUBE_CLIENT_ID is missing')
  if (!secret)
    throw new Error('YOUTUBE_CLIENT_SECRET is missing')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as { access_token: string, refresh_token?: string }
}

export async function fetchYouTubeProfile(accessToken: string) {
  const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (channelRes.ok) {
    const data = await channelRes.json() as any
    const item = data.items?.[0]
    if (item) {
      return {
        uid: item.id,
        account: item.snippet?.customUrl || item.snippet?.title || item.id,
        nickname: item.snippet?.title || item.snippet?.customUrl || item.id,
        avatar: item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.medium?.url || '',
      }
    }
  }

  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!userRes.ok)
    throw new Error(await channelRes.text().catch(() => 'YouTube profile fetch failed'))
  const user = await userRes.json() as any
  return {
    uid: user.sub || user.email,
    account: user.email || user.name || user.sub,
    nickname: user.name || user.email || user.sub,
    avatar: user.picture || '',
  }
}

export { accountFile, apiOk, makeAccount, readJson, upsertAccount }
