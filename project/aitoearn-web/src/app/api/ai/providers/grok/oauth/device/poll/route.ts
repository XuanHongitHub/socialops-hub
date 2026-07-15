import { apiOk, readBody } from '@/app/api/ai/providers/_local'

type PendingLogin = {
  status: 'pending' | 'completed' | 'failed'
  error?: string
  account?: unknown
}

function pendingStore() {
  const g = globalThis as typeof globalThis & { __socialopsGrokOAuth?: Map<string, PendingLogin> }
  if (!g.__socialopsGrokOAuth)
    g.__socialopsGrokOAuth = new Map()
  return g.__socialopsGrokOAuth
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const deviceCode = String(body.deviceCode || '')
  const pending = pendingStore().get(deviceCode)
  if (!pending)
    return apiOk({ status: 'failed', error: 'OAuth session not found. Start OAuth again.' }, '/api/ai/providers/grok/oauth/device/poll')
  return apiOk({ status: pending.status, error: pending.error, account: pending.account }, '/api/ai/providers/grok/oauth/device/poll')
}
