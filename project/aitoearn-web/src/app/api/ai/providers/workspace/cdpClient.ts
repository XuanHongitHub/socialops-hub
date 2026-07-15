/**
 * Minimal CDP (Chrome DevTools Protocol) client over WebSocket.
 * Used for cookie session restore + assisted login evaluate.
 */

export type CdpTarget = {
  id: string
  type?: string
  title?: string
  url?: string
  webSocketDebuggerUrl?: string
}

export async function getBrowserWsUrl(cdpEndpoint: string): Promise<string> {
  const base = cdpEndpoint.replace(/\/$/, '')
  const res = await fetch(`${base}/json/version`, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
  if (!res.ok)
    throw new Error(`CDP version HTTP ${res.status}`)
  const data = await res.json() as { webSocketDebuggerUrl?: string }
  if (!data.webSocketDebuggerUrl)
    throw new Error('CDP missing webSocketDebuggerUrl')
  return data.webSocketDebuggerUrl
}

export async function listCdpTargets(cdpEndpoint: string): Promise<CdpTarget[]> {
  const base = cdpEndpoint.replace(/\/$/, '')
  const res = await fetch(`${base}/json/list`, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
  if (!res.ok)
    return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

type WsLike = {
  readyState: number
  send: (data: string) => void
  close: () => void
  addEventListener: (type: string, fn: (ev: any) => void) => void
}

function createWs(url: string): WsLike {
  const G = globalThis as any
  if (typeof G.WebSocket === 'function')
    return new G.WebSocket(url) as WsLike
  // Node < 22 fallback via undici optional — throw clear error
  throw new Error('WebSocket not available in this Node runtime (need Node 22+ or polyfill)')
}

export class CdpSession {
  private ws: WsLike | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private sessions = new Map<string, string>() // targetId -> sessionId

  constructor(private browserWsUrl: string) {}

  async connect() {
    if (this.ws && this.ws.readyState === 1)
      return
    await new Promise<void>((resolve, reject) => {
      let ws: WsLike
      try {
        ws = createWs(this.browserWsUrl)
      }
      catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
        return
      }
      this.ws = ws
      const timer = setTimeout(() => reject(new Error('CDP WS connect timeout')), 8000)
      ws.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('CDP WS error'))
      })
      ws.addEventListener('message', (ev: any) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            id?: number
            result?: unknown
            error?: { message?: string }
          }
          if (msg.id != null && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!
            this.pending.delete(msg.id)
            if (msg.error)
              p.reject(new Error(msg.error.message || 'CDP error'))
            else
              p.resolve(msg.result)
          }
        }
        catch { /* ignore */ }
      })
    })
  }

  async send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    /** Default 15s; use 60s+ for Runtime.evaluate blob/video capture */
    timeoutMs?: number,
  ) {
    if (!this.ws || this.ws.readyState !== 1)
      await this.connect()
    const id = this.nextId++
    const payload: Record<string, unknown> = { id, method }
    if (params)
      payload.params = params
    if (sessionId)
      payload.sessionId = sessionId
    const wait = Math.min(Math.max(timeoutMs ?? 15_000, 3_000), 180_000)
    return await new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify(payload))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, wait)
    })
  }

  async attachPage(targetId: string): Promise<string> {
    if (this.sessions.has(targetId))
      return this.sessions.get(targetId)!
    const result = await this.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId?: string }
    const sessionId = String(result?.sessionId || '')
    if (!sessionId)
      throw new Error('attachToTarget missing sessionId')
    this.sessions.set(targetId, sessionId)
    return sessionId
  }

  async close() {
    try {
      this.ws?.close()
    }
    catch { /* ignore */ }
    this.ws = null
    this.pending.clear()
    this.sessions.clear()
  }
}

export type CookieLike = {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None' | string
  url?: string
}

export async function cdpGetAllCookies(cdpEndpoint: string): Promise<CookieLike[]> {
  const wsUrl = await getBrowserWsUrl(cdpEndpoint)
  const session = new CdpSession(wsUrl)
  try {
    await session.connect()
    const result = await session.send('Network.getAllCookies') as { cookies?: CookieLike[] }
    return Array.isArray(result?.cookies) ? result.cookies : []
  }
  finally {
    await session.close()
  }
}

export async function cdpSetCookies(cdpEndpoint: string, cookies: CookieLike[]) {
  const wsUrl = await getBrowserWsUrl(cdpEndpoint)
  const session = new CdpSession(wsUrl)
  try {
    await session.connect()
    for (const c of cookies) {
      const domain = c.domain || ''
      const path = c.path || '/'
      const url = c.url || `http${c.secure ? 's' : ''}://${domain.replace(/^\./, '')}${path}`
      await session.send('Network.setCookie', {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None' ? c.sameSite : undefined,
        url,
      })
    }
    return { ok: true, count: cookies.length }
  }
  finally {
    await session.close()
  }
}

export async function cdpNavigateAndEvaluate(
  cdpEndpoint: string,
  url: string,
  expression: string,
  opts?: { waitMs?: number },
) {
  const base = cdpEndpoint.replace(/\/$/, '')
  // Prefer existing page target
  let targets = await listCdpTargets(cdpEndpoint)
  let page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!page) {
    await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT', signal: AbortSignal.timeout(5000) }).catch(() =>
      fetch(`${base}/json/new?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) }),
    )
    await new Promise(r => setTimeout(r, 800))
    targets = await listCdpTargets(cdpEndpoint)
    page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
  }
  if (!page?.webSocketDebuggerUrl)
    throw new Error('No page target for evaluate')

  const browserWs = await getBrowserWsUrl(cdpEndpoint)
  const session = new CdpSession(browserWs)
  try {
    await session.connect()
    const sessionId = await session.attachPage(page.id)
    await session.send('Page.enable', {}, sessionId)
    await session.send('Runtime.enable', {}, sessionId)
    await session.send('Page.navigate', { url }, sessionId)
    await new Promise(r => setTimeout(r, opts?.waitMs ?? 2500))
    const result = await session.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId) as { result?: { value?: unknown } }
    return result?.result?.value
  }
  finally {
    await session.close()
  }
}
