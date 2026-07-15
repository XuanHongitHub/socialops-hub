import { accountFile, apiOk, authBaseUrl, newState, readBody, readJson, taskFile, writeJson, type MetaTask } from '@/app/api/plat/meta/_local'

export async function POST(req: Request) {
  const body = await readBody(req)
  const platform = body.platform === 'instagram' ? 'instagram' : 'facebook'
  const state = newState()
  const fallbackRedirectUri = `${authBaseUrl(req)}/api/plat/meta/auth/back`
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || fallbackRedirectUri
  const tasks = await readJson<Record<string, MetaTask>>(taskFile, {})
  tasks[state] = {
    state,
    platform,
    status: 0,
    userId: 'local-admin',
    spaceId: String(body.spaceId || 'default'),
    createdAt: new Date().toISOString(),
  }
  await writeJson(taskFile, tasks)

  if (platform === 'instagram') {
    const url = new URL('https://www.instagram.com/oauth/authorize')
    url.search = new URLSearchParams({
      client_id: process.env.INSTAGRAM_CLIENT_ID || '',
      redirect_uri: process.env.INSTAGRAM_REDIRECT_URI || fallbackRedirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      force_authentication: '1',
      enable_fb_login: '0',
      state,
    }).toString()
    return apiOk({ url: url.toString(), taskId: state, state }, '/api/plat/meta/auth/url')
  }

  const scopes = ['public_profile', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'pages_manage_posts', 'business_management']
  const url = new URL('https://www.facebook.com/v24.0/dialog/oauth')
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: scopes.join(' '),
    auth_type: 'rerequest',
  })
  if (process.env.FACEBOOK_CONFIG_ID)
    params.set('config_id', process.env.FACEBOOK_CONFIG_ID)
  url.search = params.toString()

  return apiOk({ url: url.toString(), taskId: state, state }, '/api/plat/meta/auth/url')
}
