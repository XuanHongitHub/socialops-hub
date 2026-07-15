import { NextResponse } from 'next/server'
import { getSocialStoreStatus, readJson, accountFile, groupFile, type LocalSocialAccount } from '@/app/api/plat/meta/_local'
import type { AccountGroupItem } from '@/api/types/account.type'

export async function GET() {
  const status = await getSocialStoreStatus()
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const groups = await readJson<AccountGroupItem[]>(groupFile, [])
  return NextResponse.json({ code: 0, data: { ...status, accountCount: accounts.length, groupCount: groups.length, accountIds: accounts.map(item => item.id) }, message: 'ok', url: '/api/v2/channels/accounts/debug' })
}
