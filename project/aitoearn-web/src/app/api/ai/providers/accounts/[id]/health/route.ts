import { apiOk, call9RouterChat, getAccounts, safeAccount, saveAccounts } from '@/app/api/ai/providers/_local'
import { checkGrokHealth } from '@/app/api/ai/providers/grok/_client'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const accounts = await getAccounts()
  const account = accounts.find(item => item.id === id)
  if (!account)
    return apiOk(null, `/api/ai/providers/accounts/${id}/health`)

  const now = new Date().toISOString()
  try {
    let health: Record<string, unknown> = { status: 'ok', source: 'local_credentials' }
    if (account.providerId === 'grok') {
      // checkGrokHealth persists free/limit pool flags onto the account store
      health = await checkGrokHealth(account)
      // Re-read after health wrote poolEligible / subscription metadata
      const latest = (await getAccounts()).find(item => item.id === id)
      if (latest) {
        Object.assign(account, latest)
      }
    }
    else if (account.providerId === '9router') {
      const result = await call9RouterChat('Return only OK', { model: String(account.metadata?.defaultModel || 'cx_agy') })
      health = { status: result.text === 'OK' ? 'ok' : 'warn', source: '9router', sample: result.text }
      account.lastHealthStatus = String(health.status)
      account.lastHealthAt = now
      await saveAccounts(accounts)
    }
    else if (account.metadata?.source === '9router') {
      health = { status: account.metadata?.testStatus === 'active' ? 'ok' : 'warn', source: '9router_sync', testStatus: account.metadata?.testStatus }
      account.lastHealthStatus = String(health.status)
      account.lastHealthAt = now
      await saveAccounts(accounts)
    }
    else {
      account.lastHealthStatus = String(health.status)
      account.lastHealthAt = now
      await saveAccounts(accounts)
    }
    return apiOk({ ...safeAccount(account), health }, `/api/ai/providers/accounts/${id}/health`)
  }
  catch (error) {
    account.lastHealthStatus = 'failed'
    account.lastHealthAt = now
    account.metadata = {
      ...account.metadata,
      poolEligible: false,
      poolSkipReason: 'health',
      healthStatus: 'failed',
    }
    await saveAccounts(accounts)
    return apiOk({ ...safeAccount(account), health: { status: 'failed', error: error instanceof Error ? error.message : String(error) } }, `/api/ai/providers/accounts/${id}/health`)
  }
}
