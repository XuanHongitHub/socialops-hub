import { apiOk, call9RouterChat, getAccounts, readBody, safeAccount, selectAccount } from '@/app/api/ai/providers/_local'
import { callGrokChat } from '@/app/api/ai/providers/grok/_client'

export async function POST(req: Request) {
  const body = await readBody(req)
  const account = await selectAccount(body)
  if (body.operation === 'generate_text') {
    try {
      const result = body.providerId === 'grok'
        ? await callGrokChat(String(body.prompt || ''), String(body.model || 'grok-4'))
        : await call9RouterChat(String(body.prompt || ''), { model: String(body.model || 'cx_agy') })
      const routedAccount = 'accountId' in result
        ? safeAccount((await getAccounts()).find(item => item.id === result.accountId)!)
        : account
      return apiOk({ account: routedAccount, routed: Boolean(routedAccount), operation: body.operation, output: result.text, raw: result.raw }, '/api/ai/providers/accounts/dispatch')
    }
    catch (error) {
      return apiOk({ account, routed: false, operation: body.operation, error: error instanceof Error ? error.message : String(error) }, '/api/ai/providers/accounts/dispatch')
    }
  }
  return apiOk({ account, routed: Boolean(account), dryRun: Boolean(body.dryRun), operation: body.operation || 'route' }, '/api/ai/providers/accounts/dispatch')
}
