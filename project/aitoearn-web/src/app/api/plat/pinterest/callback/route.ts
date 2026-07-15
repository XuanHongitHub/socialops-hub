import { exchangePinterestCode, fetchPinterestProfile, makeAccount, pinterestRedirectUri, pinterestTaskFile, readJson, updatePinterestTask, upsertAccount, type PinterestTask } from '@/app/api/plat/pinterest/_local'
import { oauthCallbackHtml } from '@/app/api/plat/_callbackHtml'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const tasks = await readJson<Record<string, PinterestTask>>(pinterestTaskFile, {})
  const task = tasks[state]
  if (!code || !task)
    return oauthCallbackHtml('Pinterest authorization failed', 'OAuth state or code is missing. Please restart the connection from Socials Hub.', 'error')

  try {
    const token = await exchangePinterestCode(code, pinterestRedirectUri(req))
    const profile = await fetchPinterestProfile(token.access_token)
    const uid = profile.id || profile.username || `pinterest_${state}`
    const account = await upsertAccount(makeAccount({
      type: 'pinterest',
      uid,
      account: profile.username || uid,
      nickname: profile.username || uid,
      avatar: profile.profile_image,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      groupId: task.spaceId,
    }))
    await updatePinterestTask(state, { status: 1, accountId: account.id })
    return oauthCallbackHtml('Pinterest connected', 'Your Pinterest account is now available in Socials Hub.', 'success', {
      id: account.uid,
      name: account.nickname,
      username: account.account,
      avatar: account.avatar,
      platform: 'Pinterest',
    })
  }
  catch (error) {
    await updatePinterestTask(state, { status: -1, message: error instanceof Error ? error.message : 'Pinterest OAuth failed' })
    return oauthCallbackHtml('Pinterest authorization failed', 'Socials Hub received the callback, but Pinterest rejected the token exchange.', 'error')
  }
}
