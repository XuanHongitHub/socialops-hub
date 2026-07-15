import { NextResponse } from 'next/server'
import { groupFile, readJson, writeJson } from '@/app/api/plat/meta/_local'
import type { AccountGroupItem } from '@/api/accounts/account.types'

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({})) as { list?: { id: string, rank: number }[] }
  const ranks = new Map((body.list || []).map(item => [item.id, item.rank]))
  const groups = await readJson<AccountGroupItem[]>(groupFile, [])
  const next = groups.map(group => ranks.has(group.id) ? { ...group, rank: ranks.get(group.id)! } : group)
  await writeJson(groupFile, next)
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: '/api/accountGroup/sortRank' })
}
