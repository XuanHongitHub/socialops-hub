import { NextRequest, NextResponse } from 'next/server'
import { getAccounts, safeAccount, upsertAccount } from '@/app/api/ai/providers/_local'

export async function GET() {
  const accounts = await getAccounts()
  return NextResponse.json({ code: 0, data: accounts.map(safeAccount), message: 'ok', url: '/api/ai/providers/accounts' })
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({ code: 0, data: await upsertAccount(await req.json()), message: 'ok', url: '/api/ai/providers/accounts' })
  }
  catch (error) {
    return NextResponse.json({ code: 400, data: null, message: error instanceof Error ? error.message : String(error), url: '/api/ai/providers/accounts' }, { status: 200 })
  }
}
