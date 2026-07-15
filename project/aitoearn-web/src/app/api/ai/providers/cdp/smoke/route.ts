import { apiOk, readBody } from '@/app/api/ai/providers/_local'

function normalizeEndpoint(value: unknown) {
  return String(value || 'http://localhost:9222').replace(/\/$/, '')
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const endpoint = normalizeEndpoint(body.cdpEndpoint)
  try {
    const res = await fetch(`${endpoint}/json/version`, { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    const version = await res.json().catch(() => null)
    return apiOk({ ok: res.ok, endpoint, profileType: body.profileType || 'helium', version }, '/api/ai/providers/cdp/smoke')
  }
  catch (error) {
    return apiOk({ ok: false, endpoint, profileType: body.profileType || 'helium', error: error instanceof Error ? error.message : String(error) }, '/api/ai/providers/cdp/smoke')
  }
}
