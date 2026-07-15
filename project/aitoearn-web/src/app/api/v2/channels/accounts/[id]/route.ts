import { NextResponse } from 'next/server'
import { accountFile, readBody, readJson, writeJson, type LocalSocialAccount } from '@/app/api/plat/meta/_local'

async function getId(params: Promise<{ id: string }>) {
  return (await params).id
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await getId(params)
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const account = accounts.find(item => item.id === id)
  if (!account)
    return NextResponse.json({ code: 404, message: 'Account not found', url: `/api/v2/channels/accounts/${id}` }, { status: 404 })
  return NextResponse.json({ code: 0, data: account, message: 'ok', url: `/api/v2/channels/accounts/${id}` })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await getId(params)
  const patch = await readBody(req)
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const index = accounts.findIndex(item => item.id === id)
  if (index < 0)
    return NextResponse.json({ code: 404, message: 'Account not found', url: `/api/v2/channels/accounts/${id}` }, { status: 404 })
  accounts[index] = { ...accounts[index], ...patch, id, updateTime: new Date().toISOString() }
  await writeJson(accountFile, accounts)
  return NextResponse.json({ code: 0, data: accounts[index], message: 'ok', url: `/api/v2/channels/accounts/${id}` })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await getId(params)
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  await writeJson(accountFile, accounts.filter(item => item.id !== id))
  return NextResponse.json({ code: 0, data: true, message: 'ok', url: `/api/v2/channels/accounts/${id}` })
}
