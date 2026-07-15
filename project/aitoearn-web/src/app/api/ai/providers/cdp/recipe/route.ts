import { apiOk, readBody } from '@/app/api/ai/providers/_local'

function normalizeEndpoint(value: unknown) {
  return String(value || 'http://localhost:9222').replace(/\/$/, '')
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const endpoint = normalizeEndpoint(body.cdpEndpoint)
  const steps = Array.isArray(body.steps) ? body.steps : []
  try {
    const listRes = await fetch(`${endpoint}/json/list`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    const targets = await listRes.json().catch(() => [])
    const expectedHost = String(body.expectedHost || '')
    const matchedTarget = Array.isArray(targets) ? targets.find((target: any) => !expectedHost || String(target.url || '').includes(expectedHost)) : null
    const results = steps.map((step: any) => {
      if (step.type === 'assert_host')
        return { ...step, ok: Boolean(matchedTarget), matchedUrl: matchedTarget?.url || null }
      if (step.type === 'screenshot')
        return { ...step, ok: Boolean(matchedTarget), note: 'CDP target reachable; screenshot capture is handled by /api/ai/providers/cdp/screenshot.' }
      return { ...step, ok: true }
    })
    return apiOk({ ok: listRes.ok, endpoint, targetCount: Array.isArray(targets) ? targets.length : 0, matchedTarget, results }, '/api/ai/providers/cdp/recipe')
  }
  catch (error) {
    return apiOk({ ok: false, endpoint, results: [], error: error instanceof Error ? error.message : String(error) }, '/api/ai/providers/cdp/recipe')
  }
}
