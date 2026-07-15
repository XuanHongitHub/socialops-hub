import { join } from 'node:path'
import { accountFile, apiOk, authBaseUrl, makeAccount, newState, readJson, upsertAccount, writeJson } from '@/app/api/plat/meta/_local'

export type TikTokTask = {
  state: string
  status: number
  spaceId: string
  accountId?: string
  message?: string
  createdAt: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
export const tiktokTaskFile = join(appData, 'SocialsHub', 'tiktok-auth-tasks.json')

export function tiktokClientKey() {
  return process.env.TIKTOK_CLIENT_KEY || ''
}

export function tiktokClientSecret() {
  return process.env.TIKTOK_CLIENT_SECRET || ''
}

export function tiktokRedirectUri(req: Request) {
  return process.env.TIKTOK_REDIRECT_URI || `${authBaseUrl(req)}/api/plat/tiktok/auth/callback`
}

export function tiktokAuthUrl(req: Request, state: string) {
  const clientKey = tiktokClientKey()
  if (!clientKey)
    throw new Error('TIKTOK_CLIENT_KEY is missing')

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
  url.search = new URLSearchParams({
    client_key: clientKey,
    redirect_uri: tiktokRedirectUri(req),
    response_type: 'code',
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.upload',
    state,
  }).toString()
  return url.toString()
}

export async function createTikTokTask(spaceId = 'default') {
  const state = newState()
  const tasks = await readJson<Record<string, TikTokTask>>(tiktokTaskFile, {})
  tasks[state] = { state, status: 0, spaceId, createdAt: new Date().toISOString() }
  await writeJson(tiktokTaskFile, tasks)
  return tasks[state]
}

export async function updateTikTokTask(state: string, patch: Partial<TikTokTask>) {
  const tasks = await readJson<Record<string, TikTokTask>>(tiktokTaskFile, {})
  tasks[state] = { ...tasks[state], ...patch } as TikTokTask
  await writeJson(tiktokTaskFile, tasks)
  return tasks[state]
}

export async function exchangeTikTokCode(code: string, redirectUri: string) {
  const clientKey = tiktokClientKey()
  const secret = tiktokClientSecret()
  if (!clientKey)
    throw new Error('TIKTOK_CLIENT_KEY is missing')
  if (!secret)
    throw new Error('TIKTOK_CLIENT_SECRET is missing')

  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as { access_token: string, refresh_token?: string, open_id?: string }
}

export async function fetchTikTokProfile(accessToken: string) {
  const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())
  const payload = await res.json() as any
  const user = payload.data?.user || payload.user || {}
  return {
    uid: user.open_id || user.union_id,
    account: user.username || user.display_name || user.open_id,
    nickname: user.display_name || user.username || user.open_id,
    avatar: user.avatar_url || '',
  }
}

export { accountFile, apiOk, makeAccount, readJson, upsertAccount }
