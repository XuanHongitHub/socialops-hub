import { exchangeYouTubeCode, fetchYouTubeProfile, makeAccount, readJson, updateYouTubeTask, upsertAccount, youtubeRedirectUri, youtubeTaskFile, type YouTubeTask } from '@/app/api/plat/youtube/_local'
import { oauthCallbackHtml } from '@/app/api/plat/_callbackHtml'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const tasks = await readJson<Record<string, YouTubeTask>>(youtubeTaskFile, {})
  const task = tasks[state]
  if (!code || !task)
    return oauthCallbackHtml('YouTube authorization failed', 'OAuth state or code is missing. Please restart the connection from Socials Hub.', 'error')

  try {
    const token = await exchangeYouTubeCode(code, youtubeRedirectUri(req))
    const profile = await fetchYouTubeProfile(token.access_token)
    const account = await upsertAccount(makeAccount({
      type: 'youtube',
      uid: profile.uid,
      account: profile.account,
      nickname: profile.nickname,
      avatar: profile.avatar,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      groupId: task.spaceId,
    }))
    await updateYouTubeTask(state, { status: 1, accountId: account.id })
    return oauthCallbackHtml('YouTube connected', 'Your YouTube channel is now available in Socials Hub.', 'success', {
      id: account.uid,
      name: account.nickname,
      username: account.account,
      avatar: account.avatar,
      platform: 'YouTube',
    })
  }
  catch (error) {
    await updateYouTubeTask(state, { status: -1, message: error instanceof Error ? error.message : 'YouTube OAuth failed' })
    return oauthCallbackHtml('YouTube authorization failed', 'Socials Hub received the callback, but Google rejected the token exchange.', 'error')
  }
}
