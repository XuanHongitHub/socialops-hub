/**
 * Mirror author remote-configs into SocialsHub disk + serve as primary source.
 * Fallback chain for extensions (patched loaders):
 *   Hub mirror (local) → configs.kylenguyen.me → extension-config.onegreen.workers.dev
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  UPSTREAM_CONFIG_BASES,
  UPSTREAM_PACKS,
  getUpstreamPack,
  summarizeRemoteConfig,
  type UpstreamPackId,
} from './upstreamPacks'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const mirrorRoot = join(appData, 'SocialsHub', 'extension-remote-configs')

export type MirroredConfigRecord = {
  packId: string
  configPath: string
  fetchedAt: string
  source: string
  body: Record<string, unknown>
  summary: ReturnType<typeof summarizeRemoteConfig>
}

function packFile(packId: string) {
  return join(mirrorRoot, `${packId}.json`)
}

function metaFile() {
  return join(mirrorRoot, '_index.json')
}

async function ensureDir() {
  await mkdir(mirrorRoot, { recursive: true })
}

export async function readMirroredConfig(packId: string): Promise<MirroredConfigRecord | null> {
  const path = packFile(packId)
  if (!existsSync(path))
    return null
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as MirroredConfigRecord
    if (!raw?.body || typeof raw.body !== 'object')
      return null
    return raw
  }
  catch {
    return null
  }
}

export async function listMirroredConfigs(): Promise<Array<{
  packId: string
  shortName: string
  configPath: string
  mirrored: boolean
  fetchedAt?: string
  source?: string
  summary?: ReturnType<typeof summarizeRemoteConfig>
  upstreamBases: string[]
  clientSecretHint: string
}>> {
  await ensureDir()
  const out = []
  for (const pack of UPSTREAM_PACKS) {
    const rec = await readMirroredConfig(pack.id)
    out.push({
      packId: pack.id,
      shortName: pack.shortName,
      configPath: pack.configPath,
      mirrored: Boolean(rec),
      fetchedAt: rec?.fetchedAt,
      source: rec?.source,
      summary: rec?.summary,
      upstreamBases: [...UPSTREAM_CONFIG_BASES],
      clientSecretHint: pack.clientSecret.slice(0, 12) + '…',
    })
  }
  return out
}

async function fetchUpstream(
  packId: UpstreamPackId | string,
  bases: readonly string[] = UPSTREAM_CONFIG_BASES,
): Promise<{ body: Record<string, unknown>, source: string }> {
  const pack = getUpstreamPack(packId)
  if (!pack)
    throw new Error(`unknown_pack:${packId}`)

  let lastErr = 'no_upstream'
  for (const base of bases) {
    const url = `${base.replace(/\/$/, '')}/config/${pack.configPath}`
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-Client-Secret': pack.clientSecret },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${url}`
        continue
      }
      const body = await res.json() as Record<string, unknown>
      if (!body?.selectors || typeof body.selectors !== 'object') {
        lastErr = `invalid_shape ${url}`
        continue
      }
      return { body, source: url }
    }
    catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(`upstream_fetch_failed:${packId}:${lastErr}`)
}

export async function syncOneRemoteConfig(packId: string): Promise<MirroredConfigRecord> {
  await ensureDir()
  const pack = getUpstreamPack(packId)
  if (!pack)
    throw new Error(`unknown_pack:${packId}`)

  const { body, source } = await fetchUpstream(pack.id)
  const rec: MirroredConfigRecord = {
    packId: pack.id,
    configPath: pack.configPath,
    fetchedAt: new Date().toISOString(),
    source,
    body,
    summary: summarizeRemoteConfig(body),
  }
  await writeFile(packFile(pack.id), JSON.stringify(rec, null, 2), 'utf8')
  return rec
}

export async function syncAllRemoteConfigs(): Promise<{
  ok: boolean
  results: Array<{ packId: string, ok: boolean, error?: string, summary?: ReturnType<typeof summarizeRemoteConfig>, source?: string }>
  indexPath: string
}> {
  await ensureDir()
  const results: Array<{ packId: string, ok: boolean, error?: string, summary?: ReturnType<typeof summarizeRemoteConfig>, source?: string }> = []
  for (const pack of UPSTREAM_PACKS) {
    try {
      const rec = await syncOneRemoteConfig(pack.id)
      results.push({
        packId: pack.id,
        ok: true,
        summary: rec.summary,
        source: rec.source,
      })
    }
    catch (e) {
      results.push({
        packId: pack.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  const index = {
    updatedAt: new Date().toISOString(),
    packs: results,
    hubBases: [
      'http://127.0.0.1:6061/api/ai/providers/extension/mirror',
      'http://localhost:6061/api/ai/providers/extension/mirror',
    ],
    upstreamBases: [...UPSTREAM_CONFIG_BASES],
  }
  await writeFile(metaFile(), JSON.stringify(index, null, 2), 'utf8')
  return {
    ok: results.every(r => r.ok),
    results,
    indexPath: metaFile(),
  }
}

/**
 * Resolve config body for extension clients:
 * 1) Local mirror disk
 * 2) Live upstream fetch + auto-save
 */
export async function resolveConfigForClient(packId: string, opts?: {
  preferLiveUpstream?: boolean
}): Promise<{
  body: Record<string, unknown>
  source: 'mirror' | 'upstream'
  sourceUrl?: string
  fetchedAt?: string
}> {
  const pack = getUpstreamPack(packId)
  if (!pack)
    throw new Error(`unknown_pack:${packId}`)

  if (!opts?.preferLiveUpstream) {
    const mirrored = await readMirroredConfig(pack.id)
    if (mirrored?.body?.selectors)
      return { body: mirrored.body, source: 'mirror', sourceUrl: mirrored.source, fetchedAt: mirrored.fetchedAt }
  }

  try {
    const rec = await syncOneRemoteConfig(pack.id)
    return { body: rec.body, source: 'upstream', sourceUrl: rec.source, fetchedAt: rec.fetchedAt }
  }
  catch (e) {
    // Last chance: stale mirror even if preferLive
    const mirrored = await readMirroredConfig(pack.id)
    if (mirrored?.body?.selectors)
      return { body: mirrored.body, source: 'mirror', sourceUrl: mirrored.source, fetchedAt: mirrored.fetchedAt }
    throw e
  }
}

/** Import body already downloaded (e.g. offline seed). */
export async function importMirroredConfig(
  packId: string,
  body: Record<string, unknown>,
  source = 'manual-import',
): Promise<MirroredConfigRecord> {
  await ensureDir()
  const pack = getUpstreamPack(packId)
  if (!pack)
    throw new Error(`unknown_pack:${packId}`)
  if (!body?.selectors || typeof body.selectors !== 'object')
    throw new Error('invalid_config_shape')
  const rec: MirroredConfigRecord = {
    packId: pack.id,
    configPath: pack.configPath,
    fetchedAt: new Date().toISOString(),
    source,
    body,
    summary: summarizeRemoteConfig(body),
  }
  await writeFile(packFile(pack.id), JSON.stringify(rec, null, 2), 'utf8')
  return rec
}

export async function seedFromDirectory(dir: string): Promise<number> {
  if (!existsSync(dir))
    return 0
  let n = 0
  const files = await readdir(dir)
  for (const f of files) {
    if (!f.endsWith('.json') || f.startsWith('_'))
      continue
    const packId = f.replace(/\.json$/, '')
    if (!getUpstreamPack(packId))
      continue
    try {
      const body = JSON.parse(await readFile(join(dir, f), 'utf8')) as Record<string, unknown>
      // Support both raw author body and MirroredConfigRecord
      const payload = (body.body && typeof body.body === 'object')
        ? body.body as Record<string, unknown>
        : body
      await importMirroredConfig(packId, payload, `seed:${dir}`)
      n++
    }
    catch {
      // skip bad file
    }
  }
  return n
}

export { mirrorRoot, UPSTREAM_PACKS, UPSTREAM_CONFIG_BASES }
