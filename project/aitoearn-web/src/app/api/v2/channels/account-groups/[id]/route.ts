import { NextResponse } from 'next/server'
import { groupFile, readJson, writeJson } from '@/app/api/plat/meta/_local'
import type { AccountGroupItem } from '@/api/accounts/account.types'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const groups = await readJson<AccountGroupItem[]>(groupFile, [])
  const index = groups.findIndex(group => group.id === id)
  if (index < 0)
    return NextResponse.json({ code: 404, message: 'Group not found', url: `/api/v2/channels/account-groups/${id}` }, { status: 404 })
  groups[index] = {
    ...groups[index],
    name: typeof body.name === 'string' ? body.name : groups[index].name,
    rank: typeof body.rank === 'number' ? body.rank : groups[index].rank,
  }
  await writeJson(groupFile, groups)
  return NextResponse.json({
    code: 0,
    data: groups[index],
    message: 'ok',
    url: `/api/v2/channels/account-groups/${id}`,
  })
}
