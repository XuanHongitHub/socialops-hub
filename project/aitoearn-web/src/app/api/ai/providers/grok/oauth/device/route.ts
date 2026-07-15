import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { apiOk, upsertAccount } from '@/app/api/ai/providers/_local'

type PendingLogin = {
  state: string
  verifier: string
  challenge: string
  redirectUri: string
  tokenEndpoint: string
  status: 'pending' | 'completed' | 'failed'
  accountName: string
  error?: string
  account?: unknown
  server?: http.Server
}

const CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const SCOPE = 'openid profile email offline_access grok-cli:access api:access'
const REDIRECT_HOST = '127.0.0.1'
const REDIRECT_PORT = 56121
const REDIRECT_PATH = '/callback'
const DISCOVERY_URL = 'https://auth.x.ai/.well-known/openid-configuration'

function pendingStore() {
  const g = globalThis as typeof globalThis & { __socialopsGrokOAuth?: Map<string, PendingLogin> }
  if (!g.__socialopsGrokOAuth)
    g.__socialopsGrokOAuth = new Map()
  return g.__socialopsGrokOAuth
}

function b64u(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomString(bytes = 32) {
  return b64u(randomBytes(bytes))
}

async function discovery() {
  const res = await fetch(DISCOVERY_URL, { cache: 'no-store' })
  if (!res.ok)
    throw new Error(`xAI OAuth discovery HTTP ${res.status}`)
  return await res.json() as { authorization_endpoint: string, token_endpoint: string }
}

async function exchangeToken(pending: PendingLogin, code: string) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    client_id: CLIENT_ID,
    code_verifier: pending.verifier,
    code_challenge: pending.challenge,
    code_challenge_method: 'S256',
  })
  const res = await fetch(pending.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form,
  })
  const text = await res.text()
  if (!res.ok)
    throw new Error(`xAI token exchange HTTP ${res.status}: ${text.slice(0, 500)}`)
  const token = JSON.parse(text) as { access_token?: string, refresh_token?: string, expires_in?: number, id_token?: string }
  if (!token.access_token || !token.refresh_token)
    throw new Error('xAI token exchange missing access_token/refresh_token')
  return token
}

function decodeJwtClaims(token?: string) {
  try {
    const payload = token?.split('.')[1]
    if (!payload) return {} as Record<string, unknown>
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>
  }
  catch { return {} as Record<string, unknown> }
}

async function saveGrokAccount(pending: PendingLogin, token: { access_token: string, refresh_token: string, expires_in?: number, id_token?: string }) {
  const claims = {
    ...decodeJwtClaims(token.id_token),
    ...decodeJwtClaims(token.access_token),
  }
  const email = String(claims.email || claims.preferred_username || '')
  const displayName = String(claims.name || claims.given_name || '')
  const tier = Number(claims.tier || 0)
  const subscription
    = tier >= 4 ? 'SuperGrok'
      : tier >= 3 ? 'Pro'
        : tier >= 2 ? 'Plus'
          : tier >= 1 ? 'Free'
            : 'Unknown'
  const subscriptionCode
    = tier >= 4 ? 'super'
      : tier >= 3 ? 'pro'
        : tier >= 2 ? 'plus'
          : tier >= 1 ? 'free'
            : 'unknown'
  return await upsertAccount({
    providerId: 'grok',
    name: email || displayName || pending.accountName || 'Grok OAuth',
    authMode: 'oauth',
    status: 'active',
    credentials: { accessToken: token.access_token, refreshToken: token.refresh_token },
    metadata: {
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-imagine-video',
      capabilities: ['chat', 'image', 'video'],
      source: 'xai_oauth',
      email,
      displayName,
      subscriptionTier: tier,
      subscription,
      subscriptionCode,
      teamId: claims.team_id ? String(claims.team_id) : undefined,
      expiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
    },
    quota: { limit: 0, window: 'day', used: 0 },
    lastHealthStatus: 'ok',
    lastHealthAt: new Date().toISOString(),
  })
}

function startCallbackServer(pending: PendingLogin) {
  const store = pendingStore()
  pending.server?.close()
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', pending.redirectUri)
    if (url.pathname !== REDIRECT_PATH) {
      res.writeHead(404).end('Not found')
      return
    }
    try {
      if (url.searchParams.get('state') !== pending.state)
        throw new Error('OAuth state mismatch')
      const remoteError = url.searchParams.get('error')
      if (remoteError)
        throw new Error(url.searchParams.get('error_description') || remoteError)
      const code = url.searchParams.get('code')
      if (!code)
        throw new Error('OAuth callback missing code')
      const token = await exchangeToken(pending, code)
      if (!token.access_token || !token.refresh_token)
        throw new Error('xAI token exchange missing access_token/refresh_token')
      pending.account = await saveGrokAccount(pending, { access_token: token.access_token, refresh_token: token.refresh_token, expires_in: token.expires_in, id_token: token.id_token })
      pending.status = 'completed'
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Grok connected</title><body style="font-family:Inter,Arial;padding:32px"><h2>Grok connected</h2><p>You can close this tab and return to Socials Hub.</p></body>')
    }
    catch (error) {
      pending.status = 'failed'
      pending.error = error instanceof Error ? error.message : String(error)
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(pending.error)
    }
    finally {
      store.set(pending.state, pending)
      setTimeout(() => pending.server?.close(), 500)
    }
  })
  pending.server = server
  server.listen(REDIRECT_PORT, REDIRECT_HOST)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { name?: string }
    const d = await discovery()
    if (!d.authorization_endpoint || !d.token_endpoint)
      throw new Error('xAI OAuth discovery missing endpoints')
    const verifier = randomString(64)
    const challenge = b64u(createHash('sha256').update(verifier).digest())
    const state = randomString(24)
    const redirectUri = `http://${REDIRECT_HOST}:${REDIRECT_PORT}${REDIRECT_PATH}`
    const pending: PendingLogin = {
      state,
      verifier,
      challenge,
      redirectUri,
      tokenEndpoint: d.token_endpoint,
      status: 'pending',
      accountName: body.name || 'Grok OAuth Account',
    }
    pendingStore().set(state, pending)
    startCallbackServer(pending)
    const url = new URL(d.authorization_endpoint)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce: randomString(24),
      plan: 'generic',
      referrer: 'socialops-hub',
    }).toString()
    return apiOk({ status: 'pending', deviceCode: state, verificationUri: url.toString(), verificationUriComplete: url.toString(), expiresIn: 240, interval: 3 }, '/api/ai/providers/grok/oauth/device')
  }
  catch (error) {
    return apiOk({ status: 'failed', error: error instanceof Error ? error.message : String(error) }, '/api/ai/providers/grok/oauth/device')
  }
}

