import { NextResponse } from 'next/server'
import { accountFile, readJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'

type Params = { params: Promise<{ accountId: string }> }

const defaultPrivacyLevels = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY']

export async function GET(_req: Request, { params }: Params) {
  const { accountId } = await params
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const account = accounts.find(item => item.id === accountId && item.type === 'tiktok')

  if (!account) {
    return NextResponse.json({
      code: 404,
      data: null,
      message: 'TikTok account is not connected. Reconnect TikTok in My Channels.',
      url: `/api/plat/tiktok/creator/info/${accountId}`,
    }, { status: 404 })
  }

  const liveInfo = account.access_token ? await fetchTikTokCreatorInfo(account.access_token).catch(() => null) : null
  return NextResponse.json({
    code: 0,
    data: {
      max_video_post_duration_sec: liveInfo?.max_video_post_duration_sec ?? 600,
      privacy_level_options: liveInfo?.privacy_level_options?.length ? liveInfo.privacy_level_options : defaultPrivacyLevels,
      stitch_disabled: liveInfo?.stitch_disabled ?? false,
      comment_disabled: liveInfo?.comment_disabled ?? false,
      creator_avatar_url: `/api/v2/channels/accounts/${account.id}/avatar`,
      creator_nickname: liveInfo?.creator_nickname || account.nickname || account.account,
      creator_username: liveInfo?.creator_username || account.account,
      duet_disabled: liveInfo?.duet_disabled ?? false,
    },
    message: 'ok',
    url: `/api/plat/tiktok/creator/info/${accountId}`,
  })
}

async function fetchTikTokCreatorInfo(accessToken: string) {
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())

  const payload = await res.json() as { data?: Partial<{
    max_video_post_duration_sec: number
    privacy_level_options: string[]
    stitch_disabled: boolean
    comment_disabled: boolean
    creator_avatar_url: string
    creator_nickname: string
    creator_username: string
    duet_disabled: boolean
  }> }
  return payload.data || null
}
