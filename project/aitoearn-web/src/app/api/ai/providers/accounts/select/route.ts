import { apiOk, readBody, selectAccount } from '@/app/api/ai/providers/_local'

export async function POST(req: Request) {
  return apiOk(await selectAccount(await readBody(req)), '/api/ai/providers/accounts/select')
}
