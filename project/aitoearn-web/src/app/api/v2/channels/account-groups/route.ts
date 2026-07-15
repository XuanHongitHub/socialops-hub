import { NextResponse } from 'next/server'
import { defaultGroup, groupFile, readJson, writeJson } from '@/app/api/plat/meta/_local'
import type { AccountGroupItem } from '@/api/accounts/account.types'

async function getGroups() {
  const groups = await readJson<AccountGroupItem[]>(groupFile, [])
  return groups.some(group => group.isDefault) ? groups : [defaultGroup, ...groups]
}

export async function GET() {
  return NextResponse.json({ code: 0, data: await getGroups(), message: 'ok', url: '/api/v2/channels/account-groups' })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const groups = await getGroups()
  const group = {
    id: `group_${Date.now()}`,
    name: String(body.name || 'New group'),
    rank: groups.length,
    isDefault: false,
  }
  await writeJson(groupFile, [...groups, group])
  return NextResponse.json({
    code: 0,
    data: group,
    message: 'ok',
    url: '/api/v2/channels/account-groups',
  })
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
  const groups = await getGroups()
  await writeJson(groupFile, groups.filter(group => group.isDefault || !ids.includes(group.id)))
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: '/api/v2/channels/account-groups' })
}
