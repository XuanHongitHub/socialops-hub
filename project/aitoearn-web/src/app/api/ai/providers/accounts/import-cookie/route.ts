import { apiOk, readBody, upsertAccount } from '@/app/api/ai/providers/_local'

export async function POST(req: Request) {
  const body = await readBody(req)
  return apiOk(await upsertAccount({ ...body, authMode: 'cookie_import', credentials: { raw: body.raw } }), '/api/ai/providers/accounts/import-cookie')
}
