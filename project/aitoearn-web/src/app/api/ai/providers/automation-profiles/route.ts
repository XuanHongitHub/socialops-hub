import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { createRecipe, getProfiles, getRecipes, upsertProfile } from '../workspace/_store'

export async function GET() {
  const [profiles, recipes] = await Promise.all([getProfiles(), getRecipes()])
  // Expose hybrid list for legacy consumers
  const rows = [
    ...profiles.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status === 'disabled' ? 'disabled' : 'active',
      description: p.description || `${p.kind} · ${p.cdpEndpoint || p.platform || ''}`,
      settings: {
        kind: p.kind,
        cdpEndpoint: p.cdpEndpoint,
        profileType: p.profileType,
        expectedHost: p.expectedHost,
        platform: p.platform,
      },
    })),
    ...recipes.map(r => ({
      id: r.id,
      name: r.name,
      status: 'active' as const,
      description: `recipe · ${r.platform}`,
      steps: r.steps,
      settings: r.settings,
    })),
  ]
  return apiOk(rows, '/api/ai/providers/automation-profiles')
}

export async function POST(req: Request) {
  const body = await readBody(req)
  if (body.steps || body.mode === 'recipe') {
    const recipe = await createRecipe({
      name: String(body.name || 'Automation recipe'),
      platform: String(body.platform || 'web'),
      profileId: body.profileId ? String(body.profileId) : undefined,
      mode: 'cdp',
      steps: Array.isArray(body.steps) ? body.steps as Array<Record<string, unknown>> : [],
      settings: (body.settings as Record<string, unknown>) || {},
    })
    return apiOk(recipe, '/api/ai/providers/automation-profiles')
  }
  const profile = await upsertProfile({
    name: String(body.name || 'Automation profile'),
    kind: 'cdp',
    status: body.status === 'disabled' ? 'disabled' : 'active',
    description: body.description ? String(body.description) : undefined,
    cdpEndpoint: body.settings && typeof body.settings === 'object'
      ? String((body.settings as any).cdpEndpoint || 'http://127.0.0.1:9222')
      : 'http://127.0.0.1:9222',
  })
  return apiOk(profile, '/api/ai/providers/automation-profiles')
}
