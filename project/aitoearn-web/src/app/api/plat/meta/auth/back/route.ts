import { authBaseUrl, exchangeFacebookCode, makeAccount, readJson, taskFile, updateTask, upsertAccount, type FacebookPage, type MetaTask } from '@/app/api/plat/meta/_local'
import { oauthCallbackHtml } from '@/app/api/plat/_callbackHtml'

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as T
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const state = url.searchParams.get('state') || ''
  const tasks = await readJson<Record<string, MetaTask>>(taskFile, {})
  const task = tasks[state]
  if (!code || !task)
    return oauthCallbackHtml('Authorization failed', 'OAuth state or code is missing. Please restart the connection from Socials Hub.', 'error')

  const fallbackRedirectUri = `${authBaseUrl(req)}/api/plat/meta/auth/back`
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || fallbackRedirectUri
  try {
    if (task.platform === 'instagram') {
      const instagramRedirectUri = process.env.INSTAGRAM_REDIRECT_URI || fallbackRedirectUri
      const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.INSTAGRAM_CLIENT_ID || '',
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          redirect_uri: instagramRedirectUri,
          code,
        }),
        cache: 'no-store',
      })
      if (!tokenResponse.ok)
        throw new Error(await tokenResponse.text())
      const shortToken = await tokenResponse.json() as { access_token: string, user_id: string }
      const exchange = new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET || '',
        access_token: shortToken.access_token,
      })
      const longResponse = await fetch(`https://graph.instagram.com/access_token?${exchange}`, { cache: 'no-store' })
      const longToken = longResponse.ok ? await longResponse.json() as { access_token?: string } : {}
      const accessToken = longToken.access_token || shortToken.access_token
      const account = await upsertAccount(makeAccount({
        type: 'instagram',
        uid: String(shortToken.user_id),
        account: 'bugsell.26',
        nickname: 'BugSell',
        accessToken,
        groupId: task.spaceId,
      }))
      await updateTask(state, { status: 1, accountId: account.id })
      return oauthCallbackHtml('Instagram connected', 'Your Instagram business account is now available in Socials Hub.', 'success', {
        id: account.uid,
        name: account.nickname,
        username: account.account,
        avatar: account.avatar,
        platform: 'Instagram',
      })
    }
    const token = await exchangeFacebookCode(code, redirectUri)
    const pageFields = 'id,name,access_token,picture,instagram_business_account{id,username,name,profile_picture_url}'
    const pagesRes = await fetchJson<{ data?: FacebookPage[] }>(
      `https://graph.facebook.com/v24.0/me/accounts?fields=${pageFields}`,
      token.access_token,
    )
    const pages = pagesRes.data || []
    if (!pages.length) {
      const businessesRes = await fetchJson<{ data?: { id: string, name?: string }[] }>(
        'https://graph.facebook.com/v24.0/me/businesses?fields=id,name',
        token.access_token,
      ).catch(() => ({ data: [] }))
      for (const business of businessesRes.data || []) {
        for (const edge of ['owned_pages', 'client_pages']) {
          const businessPagesRes = await fetchJson<{ data?: FacebookPage[] }>(
            `https://graph.facebook.com/v24.0/${business.id}/${edge}?fields=${pageFields}`,
            token.access_token,
          ).catch(() => ({ data: [] }))
          for (const page of businessPagesRes.data || []) {
            if (!pages.some(item => item.id === page.id))
              pages.push(page)
          }
        }
      }
    }
    let accountId = ''
    let connectedAccount: { uid: string, nickname: string, account: string, avatar: string, platform: string } | null = null
    for (const page of pages) {
        const account = await upsertAccount(makeAccount({
          type: 'facebook',
          uid: page.id,
          account: page.name,
          nickname: page.name,
          avatar: page.picture?.data?.url,
          accessToken: page.access_token || token.access_token,
          groupId: task.spaceId,
        }))
        accountId ||= account.id
        connectedAccount ||= {
          uid: account.uid,
          nickname: account.nickname,
          account: account.account,
          avatar: account.avatar,
          platform: 'Facebook',
        }

    }
    if (!accountId)
      throw new Error('No Facebook Pages found for this account.')

    await updateTask(state, { status: 1, accountId, pages })
    return oauthCallbackHtml('Facebook connected', 'Your Facebook Pages are now available in Socials Hub.', 'success', connectedAccount
        ? {
            id: connectedAccount.uid,
            name: connectedAccount.nickname,
            username: connectedAccount.account,
            avatar: connectedAccount.avatar,
            platform: connectedAccount.platform,
          }
        : undefined)
  }
  catch (error) {
    await updateTask(state, { status: 0, message: error instanceof Error ? error.message : 'OAuth failed' })
    return oauthCallbackHtml('Authorization failed', 'Socials Hub received the callback, but the platform rejected the token exchange. Check the channel status.', 'error')
  }
}
