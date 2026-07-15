/**
 * Author (upstream) remote-config inventory for FlowVeo3 / Kyle packs.
 * Pure constants — no Node deps — for tests + mirror service.
 */

export type UpstreamPackId =
  | 'grok-automation'
  | 'chatgpt-automation'
  | 'gemini-automation'
  | 'flow-automation'

export type UpstreamPackDef = {
  id: UpstreamPackId
  /** SocialOps pack id in registry */
  registryPackId: string
  shortName: string
  /** Path segment: GET {base}/config/{configPath} */
  configPath: string
  /** Per-pack secret embedded in remoteConfig-*.js */
  clientSecret: string
  platforms: string[]
  capabilities: string[]
}

/** Official upstream bases (author) — used as final fallback */
export const UPSTREAM_CONFIG_BASES = [
  'https://configs.kylenguyen.me',
  'https://extension-config.onegreen.workers.dev',
] as const

/**
 * Local Socials Hub bases tried FIRST by patched extension loaders.
 * Path must end without trailing slash; loader appends `/config/{pack}`.
 */
export const HUB_CONFIG_BASES = [
  'http://127.0.0.1:6061/api/ai/providers/extension/mirror',
  'http://localhost:6061/api/ai/providers/extension/mirror',
] as const

export const UPSTREAM_PACKS: UpstreamPackDef[] = [
  {
    id: 'grok-automation',
    registryPackId: 'grok-automation',
    shortName: 'Grok',
    configPath: 'grok-automation',
    clientSecret: 'YES_THAT_IS_VERY_EASY_RIGHT_?',
    platforms: ['grok.com', 'x.ai'],
    capabilities: ['chat', 'image', 'video'],
  },
  {
    id: 'chatgpt-automation',
    registryPackId: 'chatgpt-automation',
    shortName: 'ChatGPT',
    configPath: 'chatgpt-automation',
    clientSecret: 'YES_THAT_IS_VERY_EASY_RIGHT_%511',
    platforms: ['chatgpt.com'],
    capabilities: ['chat', 'image'],
  },
  {
    id: 'gemini-automation',
    registryPackId: 'gemini-automation',
    shortName: 'Gemini',
    configPath: 'gemini-automation',
    clientSecret: 'YES_THAT_IS_VERY_EASY_RIGHT_??@&',
    platforms: ['gemini.google.com'],
    capabilities: ['chat', 'image'],
  },
  {
    id: 'flow-automation',
    registryPackId: 'flow-automation',
    shortName: 'Flow',
    configPath: 'flow-automation',
    clientSecret: 'YES_THAT_IS_VERY_EASY_RIGHT_?!$',
    platforms: ['labs.google'],
    capabilities: ['video'],
  },
]

export function getUpstreamPack(id: string): UpstreamPackDef | null {
  return UPSTREAM_PACKS.find(p => p.id === id || p.configPath === id) || null
}

export function summarizeRemoteConfig(body: Record<string, unknown>) {
  const selectors = (body.selectors && typeof body.selectors === 'object')
    ? body.selectors as Record<string, unknown>
    : {}
  return {
    version: String(body.version || ''),
    hash: String(body.hash || ''),
    selectorCount: Object.keys(selectors).length,
    selectorKeys: Object.keys(selectors).slice(0, 80),
    extraKeys: Object.keys(body).filter(k => k !== 'selectors' && k !== 'version' && k !== 'hash'),
    hasSelectors: Object.keys(selectors).length > 0,
  }
}
