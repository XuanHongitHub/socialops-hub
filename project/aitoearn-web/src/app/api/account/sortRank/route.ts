import { NextResponse } from 'next/server'
import { accountFile, readJson, writeJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({})) as { groupId?: string, list?: { id: string, rank: number }[] }
  const ranks = new Map((body.list || []).map(item => [item.id, item.rank]))
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const next = accounts.map(account => ranks.has(account.id) ? { ...account, rank: ranks.get(account.id)! } : account)
  await writeJson(accountFile, next)
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: '/api/account/sortRank' })
}
