import { NextRequest, NextResponse } from 'next/server'
import { getAccounts, safeAccount, upsertAccount } from '@/app/api/ai/providers/_local'

export async function GET() {
  const accounts = await getAccounts()
  return NextResponse.json({ accounts: accounts.map(safeAccount) })
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({ account: await upsertAccount(await req.json()) })
  }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
