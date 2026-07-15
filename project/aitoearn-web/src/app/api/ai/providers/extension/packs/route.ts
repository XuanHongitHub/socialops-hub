import { apiOk } from '@/app/api/ai/providers/_local'
import { listAutomationPacks } from '../registry'

export async function GET() {
  const packs = listAutomationPacks().map(p => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    chromeExtensionId: p.chromeExtensionId,
    path: p.relativeDir,
    hosts: p.hosts,
    capabilities: p.capabilities,
    packageStatus: p.packageStatus,
    capabilityStatus: p.capabilityStatus,
    connection: p.connection,
    role: p.role,
    description: p.description,
  }))
  return apiOk({
    packs,
    summary: {
      total: packs.length,
      verified: packs.filter(p => p.packageStatus === 'verified').length,
      experimental: packs.filter(p => p.capabilityStatus === 'experimental').length,
      active: packs.filter(p => p.capabilityStatus === 'active').length,
    },
  }, '/api/ai/providers/extension/packs')
}
