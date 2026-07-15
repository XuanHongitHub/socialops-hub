/**
 * Prefer live pool seats chatgpt-1..4 (ports 9480–9483).
 * Primary is optional / may be offline (no Google session).
 */
import { getProfiles, probeCdp, type WorkspaceProfile } from './workspace/_store'
import { seatUserDataDir } from './workspace/seatLauncher'

export const POOL_SEAT_PORTS: Array<{ seatId: string, port: number }> = [
  { seatId: 'chatgpt-1', port: 9480 },
  { seatId: 'chatgpt-2', port: 9481 },
  { seatId: 'chatgpt-3', port: 9482 },
  { seatId: 'chatgpt-4', port: 9483 },
]

export type ResolvedBrowserSeat = {
  id: string
  name: string
  cdpEndpoint: string
  status: string
  role?: string
  userDataDir?: string
  hasBridgeToken?: boolean
  source: 'pool_port' | 'workspace_profile'
}

function endpointForPort(port: number) {
  return `http://127.0.0.1:${port}`
}

/**
 * First live seat among chatgpt-1..4, then any workspace profile with live CDP.
 * Skips offline primary by default unless it is the only live CDP.
 */
export async function resolveOnlineBrowserSeat(opts?: {
  preferSeatId?: string
  /** Include primary even if marked offline when its CDP is alive (default false) */
  allowPrimary?: boolean
}): Promise<ResolvedBrowserSeat | null> {
  const prefer = String(opts?.preferSeatId || '').trim()
  const allowPrimary = opts?.allowPrimary === true
  const profiles = await getProfiles()

  const candidates: Array<{
    id: string
    name: string
    cdpEndpoint: string
    status: string
    role?: string
    userDataDir?: string
    hasBridgeToken?: boolean
    source: 'pool_port' | 'workspace_profile'
    rank: number
  }> = []

  // Fixed pool ports first
  for (let i = 0; i < POOL_SEAT_PORTS.length; i++) {
    const { seatId, port } = POOL_SEAT_PORTS[i]!
    const cdpEndpoint = endpointForPort(port)
    const prof = profiles.find(p => p.id === seatId)
    candidates.push({
      id: seatId,
      name: prof?.name || `Pool ${seatId}`,
      cdpEndpoint,
      status: prof?.status || 'online',
      role: (prof?.metadata as any)?.role || 'pool',
      userDataDir: (prof?.metadata as any)?.userDataDir || seatUserDataDir(seatId),
      hasBridgeToken: Boolean(prof?.bridgeToken),
      source: 'pool_port',
      rank: prefer === seatId ? -100 : i,
    })
  }

  for (const p of profiles) {
    if (!p.cdpEndpoint)
      continue
    if (p.id === 'primary' && !allowPrimary && p.status === 'offline')
      continue
    if (POOL_SEAT_PORTS.some(x => x.seatId === p.id))
      continue // already listed
    const cdp = String(p.cdpEndpoint).replace(/\/$/, '')
    candidates.push({
      id: p.id,
      name: p.name,
      cdpEndpoint: cdp,
      status: p.status,
      role: (p.metadata as any)?.role,
      userDataDir: (p.metadata as any)?.userDataDir,
      hasBridgeToken: Boolean(p.bridgeToken),
      source: 'workspace_profile',
      rank: prefer === p.id ? -100 : (p.id === 'primary' ? 50 : 20),
    })
  }

  candidates.sort((a, b) => a.rank - b.rank)

  for (const c of candidates) {
    const probe = await probeCdp(c.cdpEndpoint)
    if (!probe.ok)
      continue
    return {
      id: c.id,
      name: c.name,
      cdpEndpoint: c.cdpEndpoint,
      status: c.status === 'offline' ? 'online' : c.status,
      role: c.role,
      userDataDir: c.userDataDir,
      hasBridgeToken: c.hasBridgeToken,
      source: c.source,
    }
  }
  return null
}

/** List all live pool seats (for push / round-robin later). */
export async function listLivePoolSeats(): Promise<ResolvedBrowserSeat[]> {
  const out: ResolvedBrowserSeat[] = []
  for (const { seatId, port } of POOL_SEAT_PORTS) {
    const cdpEndpoint = endpointForPort(port)
    const probe = await probeCdp(cdpEndpoint)
    if (!probe.ok)
      continue
    out.push({
      id: seatId,
      name: `Pool ${seatId}`,
      cdpEndpoint,
      status: 'online',
      role: 'pool',
      userDataDir: seatUserDataDir(seatId),
      source: 'pool_port',
    })
  }
  return out
}

export function profileToSeat(p: WorkspaceProfile): ResolvedBrowserSeat {
  return {
    id: p.id,
    name: p.name,
    cdpEndpoint: String(p.cdpEndpoint || ''),
    status: p.status,
    role: (p.metadata as any)?.role,
    userDataDir: (p.metadata as any)?.userDataDir,
    hasBridgeToken: Boolean(p.bridgeToken),
    source: 'workspace_profile',
  }
}
