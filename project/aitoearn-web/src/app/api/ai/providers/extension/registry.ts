/**
 * Capability registry for vendored automation packs + SocialOps bridge shell.
 * package_status vs capability_status kept separate (consensus R16/R20).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type PackageStatus = 'absent' | 'vendored' | 'verified' | 'blocked'
export type CapabilityStatus = 'unavailable' | 'experimental' | 'active'
export type ExtCapability = 'chat' | 'image' | 'video'

export type AutomationPack = {
  id: string
  name: string
  shortName: string
  chromeExtensionId?: string
  /** Relative to aitoearn-web root or absolute */
  relativeDir: string
  hosts: string[]
  capabilities: ExtCapability[]
  packageStatus: PackageStatus
  capabilityStatus: CapabilityStatus
  connection: 'browser' | 'bridge'
  role: 'niche' | 'bridge'
  description: string
}

const WEB_ROOT = join(process.cwd())

function resolvePackDir(relativeDir: string) {
  const candidates = [
    relativeDir,
    join(WEB_ROOT, relativeDir),
    join(WEB_ROOT, 'extensions', relativeDir),
    join(WEB_ROOT, 'extensions', 'socialops-bridge-ext'),
    join(WEB_ROOT, '..', '..', relativeDir),
    join(WEB_ROOT, '..', '..', 'social-ops', 'extension'),
  ]
  return candidates.find(p => existsSync(join(p, 'manifest.json'))) || join(WEB_ROOT, relativeDir)
}

const PACK_DEFS: Omit<AutomationPack, 'packageStatus' | 'capabilityStatus'>[] = [
  {
    id: 'socialops-bridge',
    name: 'SocialOps Bridge',
    shortName: 'Bridge',
    // Prefer vendored copy under extensions/ (stable with other packs); fall back to social-ops/
    relativeDir: join(WEB_ROOT, 'extensions', 'socialops-bridge-ext'),
    hosts: ['*'],
    capabilities: [],
    connection: 'bridge',
    role: 'bridge',
    description: 'Control plane: heartbeat, job lease, step runner',
  },
  {
    id: 'grok-automation',
    name: 'Grok Automation',
    shortName: 'Grok',
    chromeExtensionId: 'kpeloeongamilgpjaibcdmldenfmdngp',
    relativeDir: join(WEB_ROOT, 'extensions', 'grok-automation-ext'),
    hosts: ['grok.com', 'x.ai'],
    capabilities: ['chat', 'image', 'video'],
    connection: 'browser',
    role: 'niche',
    description: 'Auto Grok on grok.com (chat / image / video)',
  },
  {
    id: 'chatgpt-automation',
    name: 'ChatGPT Automation',
    shortName: 'ChatGPT',
    chromeExtensionId: 'nocgcjgldlpeffhdhfjejhcgjbgcmpgb',
    relativeDir: join(WEB_ROOT, 'extensions', 'chatgpt-automation-ext'),
    hosts: ['chatgpt.com', 'chat.openai.com'],
    capabilities: ['chat', 'image'],
    connection: 'browser',
    role: 'niche',
    description: 'Auto ChatGPT on chatgpt.com',
  },
  {
    id: 'gemini-automation',
    name: 'Gemini Automation',
    shortName: 'Gemini',
    chromeExtensionId: 'jlhacppkbcmonaanlkbgipimelfbjgpb',
    relativeDir: join(WEB_ROOT, 'extensions', 'gemini-automation-ext'),
    hosts: ['gemini.google.com'],
    capabilities: ['chat', 'image'],
    connection: 'browser',
    role: 'niche',
    description: 'Auto Gemini on gemini.google.com',
  },
  {
    id: 'flow-automation',
    name: 'Flow Automation',
    shortName: 'Flow',
    chromeExtensionId: 'fnmijgmnjpealnnadjpjilaanhhambeb',
    relativeDir: join(WEB_ROOT, 'extensions', 'flow-automation-ext'),
    hosts: ['labs.google', 'aitestkitchen.withgoogle.com'],
    capabilities: ['video'],
    connection: 'browser',
    role: 'niche',
    description: 'Auto Flow / Veo on labs.google',
  },
]

function verifyPack(def: (typeof PACK_DEFS)[0]): AutomationPack {
  const dir = resolvePackDir(def.relativeDir)
  const manifest = join(dir, 'manifest.json')
  const present = existsSync(manifest)
  const packageStatus: PackageStatus = present ? 'verified' : 'absent'
  // All 4 niche packs + bridge: experimental browser surface until production SLA
  const capabilityStatus: CapabilityStatus = !present
    ? 'unavailable'
    : def.role === 'bridge'
      ? 'active'
      : 'experimental'
  return {
    ...def,
    relativeDir: dir,
    packageStatus,
    capabilityStatus,
  }
}

export function listAutomationPacks(): AutomationPack[] {
  return PACK_DEFS.map(verifyPack)
}

export function getAutomationPack(id: string): AutomationPack | null {
  return listAutomationPacks().find(p => p.id === id) || null
}

/** Paths suitable for Chrome --load-extension= */
export function getLoadExtensionPaths(packIds?: string[]): string[] {
  const packs = listAutomationPacks().filter(p => p.packageStatus === 'verified')
  const filtered = packIds?.length
    ? packs.filter(p => packIds.includes(p.id))
    : packs
  return filtered.map(p => p.relativeDir).filter(dir => existsSync(join(dir, 'manifest.json')))
}

export function packLoginTargets(): Array<{
  packId: string
  platform: string
  url: string
  readyUrlIncludes: string[]
  loginUrlIncludes: string[]
}> {
  return [
    {
      packId: 'grok-automation',
      platform: 'grok',
      url: 'https://grok.com/',
      readyUrlIncludes: ['grok.com'],
      loginUrlIncludes: ['accounts.x.ai', 'login', 'sign-in', 'signin'],
    },
    {
      packId: 'chatgpt-automation',
      platform: 'chatgpt',
      url: 'https://chatgpt.com/',
      readyUrlIncludes: ['chatgpt.com', 'chat.openai.com'],
      loginUrlIncludes: ['auth', 'login', 'signin'],
    },
    {
      packId: 'gemini-automation',
      platform: 'gemini',
      url: 'https://gemini.google.com/app',
      readyUrlIncludes: ['gemini.google.com'],
      loginUrlIncludes: ['accounts.google.com', 'signin', 'ServiceLogin'],
    },
    {
      packId: 'flow-automation',
      platform: 'flow',
      url: 'https://labs.google/fx/tools/flow',
      readyUrlIncludes: ['labs.google'],
      loginUrlIncludes: ['accounts.google.com', 'signin', 'ServiceLogin'],
    },
  ]
}
