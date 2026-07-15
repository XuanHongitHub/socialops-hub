import { NextResponse } from 'next/server'
import { accountFile, readJson, writeJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'
import { fetchTikTokProfile } from '@/app/api/plat/tiktok/_local'

const allowedAvatarHosts = [
  'tiktokcdn-us.com',
  'tiktokcdn.com',
  'fbcdn.net',
  'pinimg.com',
  'ggpht.com',
  'googleusercontent.com',
]

function isAllowedAvatarUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedAvatarHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
  }
  catch {
    return false
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const index = accounts.findIndex(item => item.id === id)
  if (index < 0)
    return NextResponse.redirect(new URL('/icon.png', _req.url))

  const account = accounts[index]
  let avatarUrl = account.avatar || ''
  if (account.type === 'tiktok' && account.access_token) {
    const profile = await fetchTikTokProfile(account.access_token).catch(() => null)
    if (profile?.avatar && profile.avatar !== avatarUrl) {
      avatarUrl = profile.avatar
      accounts[index] = { ...account, avatar: avatarUrl, updateTime: new Date().toISOString() }
      await writeJson(accountFile, accounts)
    }
  }

  if (!isAllowedAvatarUrl(avatarUrl))
    return NextResponse.redirect(new URL('/icon.png', _req.url))

  const response = await fetch(avatarUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 SocialsHub/1.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null)
  if (!response?.ok)
    return NextResponse.redirect(new URL('/icon.png', _req.url))

  const bytes = await response.arrayBuffer()
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=300',
    },
  })
}