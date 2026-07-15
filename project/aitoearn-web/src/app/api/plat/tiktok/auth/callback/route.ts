import { oauthCallbackHtml } from '@/app/api/plat/_callbackHtml'
import { exchangeTikTokCode, fetchTikTokProfile, makeAccount, readJson, tiktokRedirectUri, tiktokTaskFile, updateTikTokTask, upsertAccount, type TikTokTask } from '@/app/api/plat/tiktok/_local'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const tasks = await readJson<Record<string, TikTokTask>>(tiktokTaskFile, {})
  const task = tasks[state]
  if (!code || !task)
    return oauthCallbackHtml('TikTok authorization failed', 'OAuth state or code is missing. Please restart the connection from Socials Hub.', 'error')

  try {
    const token = await exchangeTikTokCode(code, tiktokRedirectUri(req))
    const profile = await fetchTikTokProfile(token.access_token)
    const uid = profile.uid || token.open_id || `tiktok_${state}`
    const account = await upsertAccount(makeAccount({
      type: 'tiktok',
      uid,
      account: profile.account || uid,
      nickname: profile.nickname || profile.account || uid,
      avatar: profile.avatar,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      groupId: task.spaceId,
    }))
    await updateTikTokTask(state, { status: 1, accountId: account.id })
    return oauthCallbackHtml('TikTok connected', 'Your TikTok account is now available in Socials Hub.', 'success', {
      id: account.uid,
      name: account.nickname,
      username: account.account,
      avatar: account.avatar,
      platform: 'TikTok',
    })
  }
  catch (error) {
    await updateTikTokTask(state, { status: -1, message: error instanceof Error ? error.message : 'TikTok OAuth failed' })
    return oauthCallbackHtml('TikTok authorization failed', 'Socials Hub received the callback, but TikTok rejected the token exchange.', 'error')
  }
}
