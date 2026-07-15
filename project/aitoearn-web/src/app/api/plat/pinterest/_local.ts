import { join } from 'node:path'
import { accountFile, apiOk, authBaseUrl, makeAccount, newState, readJson, updateTask, upsertAccount, writeJson } from '@/app/api/plat/meta/_local'

export type PinterestTask = {
  state: string
  status: number
  spaceId: string
  accountId?: string
  message?: string
  createdAt: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
export const pinterestTaskFile = join(appData, 'SocialsHub', 'pinterest-auth-tasks.json')

export function pinterestClientId() {
  return process.env.PINTEREST_CLIENT_ID || ''
}

export function pinterestClientSecret() {
  return process.env.PINTEREST_CLIENT_SECRET || ''
}

export function pinterestRedirectUri(req: Request) {
  return process.env.PINTEREST_REDIRECT_URI || `${authBaseUrl(req)}/api/plat/pinterest/callback`
}

export function pinterestAuthUrl(req: Request, state: string) {
  const clientId = pinterestClientId()
  if (!clientId)
    throw new Error('PINTEREST_CLIENT_ID is missing')

  const url = new URL('https://www.pinterest.com/oauth/')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: pinterestRedirectUri(req),
    response_type: 'code',
    scope: 'boards:read,boards:write,pins:read,pins:write,user_accounts:read',
    state,
  }).toString()
  return url.toString()
}

export async function createPinterestTask(spaceId = 'default') {
  const state = newState()
  const tasks = await readJson<Record<string, PinterestTask>>(pinterestTaskFile, {})
  tasks[state] = { state, status: 0, spaceId, createdAt: new Date().toISOString() }
  await writeJson(pinterestTaskFile, tasks)
  return tasks[state]
}

export async function updatePinterestTask(state: string, patch: Partial<PinterestTask>) {
  const tasks = await readJson<Record<string, PinterestTask>>(pinterestTaskFile, {})
  tasks[state] = { ...tasks[state], ...patch } as PinterestTask
  await writeJson(pinterestTaskFile, tasks)
  return tasks[state]
}

export async function exchangePinterestCode(code: string, redirectUri: string) {
  const secret = pinterestClientSecret()
  if (!secret)
    throw new Error('PINTEREST_CLIENT_SECRET is missing')

  const res = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${pinterestClientId()}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as { access_token: string, refresh_token?: string }
}

export async function fetchPinterestProfile(accessToken: string) {
  const res = await fetch('https://api.pinterest.com/v5/user_account', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as { username?: string, account_type?: string, profile_image?: string, id?: string }
}

export { accountFile, apiOk, makeAccount, readJson, updateTask, upsertAccount }
