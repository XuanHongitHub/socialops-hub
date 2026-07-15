import { accountFile, apiOk, readJson, type LocalAccount, writeJson } from '@/app/api/ai/providers/_local'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const accounts = await readJson<LocalAccount[]>(accountFile, [])
  const next = accounts.filter(item => item.id !== id)
  if (next.length === accounts.length)
    return apiOk({ deleted: false, id }, `/api/ai/providers/accounts/${id}`)

  await writeJson(accountFile, next)
  return apiOk({ deleted: true, id }, `/api/ai/providers/accounts/${id}`)
}
