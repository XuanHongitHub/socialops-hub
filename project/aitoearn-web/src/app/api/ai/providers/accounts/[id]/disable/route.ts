import { apiOk, accountFile, LocalAccount, readJson, safeAccount, writeJson } from '@/app/api/ai/providers/_local'

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const accounts = await readJson<LocalAccount[]>(accountFile, [])
  const account = accounts.find(item => item.id === id)
  if (!account)
    return apiOk(null, `/api/ai/providers/accounts/${id}/disable`)
  account.status = 'disabled'
  account.updatedAt = new Date().toISOString()
  await writeJson(accountFile, accounts)
  return apiOk(safeAccount(account), `/api/ai/providers/accounts/${id}/disable`)
}
