import { NextResponse } from 'next/server'
import { accountFile, apiOk, makeAccount, readBody, readJson, upsertAccount, writeJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'

const supportedTypes = new Set([
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
  'instagram',
  'threads',
  'pinterest',
  'linkedin',
])

export async function GET() {
  const storedList = await readJson<LocalSocialAccount[]>(accountFile, [])
  const list = storedList.map(account => ({
    ...account,
    avatar: `/api/v2/channels/accounts/${account.id}/avatar`,
  }))
  return NextResponse.json({ code: 0, data: { list, total: list.length }, message: 'ok', url: '/api/v2/channels/accounts' })
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const type = String(body.type || '')
  if (!supportedTypes.has(type))
    return NextResponse.json({ code: 400, message: 'Invalid channel type', url: '/api/v2/channels/accounts' }, { status: 400 })

  const account = await upsertAccount(makeAccount({
    type,
    uid: String(body.uid || body.id || Date.now()),
    account: String(body.account || body.name || body.nickname || type),
    nickname: String(body.nickname || body.name || body.account || type),
    avatar: String(body.avatar || ''),
    accessToken: typeof body.access_token === 'string' ? body.access_token : undefined,
    groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
  }))
  return apiOk(account, '/api/v2/channels/accounts')
}

export async function DELETE(req: Request) {
  const body = await readBody(req)
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  await writeJson(accountFile, accounts.filter(item => !ids.includes(item.id)))
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: '/api/v2/channels/accounts' })
}
