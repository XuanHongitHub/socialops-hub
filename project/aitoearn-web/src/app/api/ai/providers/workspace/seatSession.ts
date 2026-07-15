/**
 * Seat session + credential vault for auto-login assistance.
 *
 * Strategy (practical, ToS-aware):
 * 1) Primary seat user-data-dir already persists logins after first sign-in
 * 2) Cookie snapshots export/import to seed seats without full re-login
 * 3) Credential vault + form-fill assisted login (user still solves CAPTCHA/2FA)
 *
 * Never claims silent CAPTCHA bypass.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { readJson, writeJson } from '@/app/api/ai/providers/_local'
import { cdpGetAllCookies, cdpNavigateAndEvaluate, cdpSetCookies, type CookieLike } from './cdpClient'
import { packLoginTargets } from '@/app/api/ai/providers/extension/registry'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const dir = join(appData, 'SocialsHub')
const sessionsFile = join(dir, 'seat-sessions.json')
const credentialsFile = join(dir, 'seat-credentials.enc.json')
const pairFile = join(dir, 'bridge-pair.json')

export type PlatformKey = 'grok' | 'chatgpt' | 'gemini' | 'flow'

export type SessionSnapshot = {
  seatId: string
  platform: PlatformKey
  cookies: CookieLike[]
  savedAt: string
  source: 'cdp_export' | 'chrome_import' | 'manual'
  cookieCount: number
}

export type StoredCredential = {
  platform: PlatformKey
  email: string
  /** AES-GCM encrypted password blob (base64) */
  passwordEnc: string
  updatedAt: string
}

type CredStore = {
  keyHint: string
  items: StoredCredential[]
}

function machineKey(): Buffer {
  const raw = [
    process.env.SOCIALOPS_SEAT_SECRET || '',
    process.env.COMPUTERNAME || '',
    process.env.USERNAME || '',
    'socialops-seat-v1',
  ].join('|')
  return createHash('sha256').update(raw).digest()
}

function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', machineKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', machineKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

async function getSessions(): Promise<SessionSnapshot[]> {
  return await readJson<SessionSnapshot[]>(sessionsFile, [])
}

async function saveSessions(rows: SessionSnapshot[]) {
  await writeJson(sessionsFile, rows.slice(0, 200))
}

export async function exportSeatCookies(input: {
  seatId: string
  cdpEndpoint: string
  platform?: PlatformKey
  source?: SessionSnapshot['source']
}) {
  const all = await cdpGetAllCookies(input.cdpEndpoint)
  const targets = packLoginTargets()
  const platforms = input.platform
    ? [input.platform]
    : targets.map(t => t.platform as PlatformKey)

  const rows = await getSessions()
  const saved: SessionSnapshot[] = []
  const now = new Date().toISOString()

  for (const platform of platforms) {
    const meta = targets.find(t => t.platform === platform)
    if (!meta)
      continue
    const hostHints = meta.readyUrlIncludes
    const cookies = all.filter((c) => {
      const d = String(c.domain || '')
      return hostHints.some(h => d.includes(h.replace(/^www\./, '')) || h.includes(d.replace(/^\./, '')))
    })
    if (!cookies.length)
      continue
    const snap: SessionSnapshot = {
      seatId: input.seatId,
      platform,
      cookies,
      savedAt: now,
      source: input.source || 'cdp_export',
      cookieCount: cookies.length,
    }
    const idx = rows.findIndex(r => r.seatId === input.seatId && r.platform === platform)
    if (idx >= 0)
      rows[idx] = snap
    else
      rows.unshift(snap)
    saved.push({ ...snap, cookies: [] }) // don't echo cookie values in API
  }
  await saveSessions(rows)
  return {
    ok: true,
    saved: saved.map(s => ({
      platform: s.platform,
      cookieCount: s.cookieCount,
      savedAt: s.savedAt,
      source: s.source,
    })),
    totalCookies: all.length,
  }
}

export async function restoreSeatCookies(input: {
  seatId: string
  cdpEndpoint: string
  platform?: PlatformKey
}) {
  const rows = await getSessions()
  const snaps = rows.filter(r =>
    r.seatId === input.seatId
    && (!input.platform || r.platform === input.platform),
  )
  if (!snaps.length)
    return { ok: false, error: 'no_session_snapshot', restored: 0 }

  let restored = 0
  for (const snap of snaps) {
    await cdpSetCookies(input.cdpEndpoint, snap.cookies)
    restored += snap.cookies.length
  }
  // Navigate platforms to apply
  const targets = packLoginTargets().filter(t =>
    snaps.some(s => s.platform === t.platform),
  )
  for (const t of targets) {
    try {
      await cdpNavigateAndEvaluate(input.cdpEndpoint, t.url, 'location.href', { waitMs: 1500 })
    }
    catch { /* ignore */ }
  }
  return { ok: true, restored, platforms: snaps.map(s => s.platform) }
}

export async function listSessionMeta(seatId?: string) {
  const rows = await getSessions()
  return rows
    .filter(r => !seatId || r.seatId === seatId)
    .map(r => ({
      seatId: r.seatId,
      platform: r.platform,
      cookieCount: r.cookieCount,
      savedAt: r.savedAt,
      source: r.source,
    }))
}

export async function upsertCredential(input: {
  platform: PlatformKey
  email: string
  password: string
}) {
  const store = await readJson<CredStore>(credentialsFile, { keyHint: 'machine', items: [] })
  const item: StoredCredential = {
    platform: input.platform,
    email: input.email.trim(),
    passwordEnc: encryptSecret(input.password),
    updatedAt: new Date().toISOString(),
  }
  const idx = store.items.findIndex(i => i.platform === input.platform)
  if (idx >= 0)
    store.items[idx] = item
  else
    store.items.push(item)
  await writeJson(credentialsFile, store)
  return { ok: true, platform: input.platform, email: item.email, updatedAt: item.updatedAt }
}

export async function listCredentials() {
  const store = await readJson<CredStore>(credentialsFile, { keyHint: 'machine', items: [] })
  return store.items.map(i => ({
    platform: i.platform,
    email: i.email,
    updatedAt: i.updatedAt,
    hasPassword: Boolean(i.passwordEnc),
  }))
}

export async function getCredential(platform: PlatformKey): Promise<{ email: string, password: string } | null> {
  const store = await readJson<CredStore>(credentialsFile, { keyHint: 'machine', items: [] })
  const item = store.items.find(i => i.platform === platform)
  if (!item)
    return null
  try {
    return { email: item.email, password: decryptSecret(item.passwordEnc) }
  }
  catch {
    return null
  }
}

export async function deleteCredential(platform: PlatformKey) {
  const store = await readJson<CredStore>(credentialsFile, { keyHint: 'machine', items: [] })
  store.items = store.items.filter(i => i.platform !== platform)
  await writeJson(credentialsFile, store)
  return { ok: true }
}

/** Assisted login: open platform, fill known selectors, click. CAPTCHA/2FA remains human. */
export async function assistedAutoLogin(input: {
  cdpEndpoint: string
  platform: PlatformKey
}) {
  const cred = await getCredential(input.platform)
  if (!cred)
    return { ok: false, error: 'no_credentials', needsHuman: true as const }

  const target = packLoginTargets().find(t => t.platform === input.platform)
  if (!target)
    return { ok: false, error: 'unknown_platform' }

  const email = JSON.stringify(cred.email)
  const password = JSON.stringify(cred.password)

  // Generic fill strategy across common auth UIs
  const expression = `(() => {
    const email = ${email};
    const password = ${password};
    const emailSel = [
      'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
      'input[autocomplete="username"]', 'input[id*="email" i]', 'input[id*="user" i]',
      'input[type="text"]'
    ];
    const passSel = [
      'input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]'
    ];
    const clickSel = [
      'button[type="submit"]', 'button[data-testid*="login" i]', 'button[data-testid*="submit" i]',
      'button:has-text("Log in")', 'button:has-text("Sign in")', 'input[type="submit"]'
    ];
    function find(sels) {
      for (const s of sels) {
        try {
          const el = document.querySelector(s);
          if (el) return el;
        } catch {}
      }
      return null;
    }
    const e = find(emailSel);
    const p = find(passSel);
    let filledEmail = false, filledPass = false, clicked = false;
    if (e) {
      e.focus();
      e.value = email;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      filledEmail = true;
    }
    if (p) {
      p.focus();
      p.value = password;
      p.dispatchEvent(new Event('input', { bubbles: true }));
      p.dispatchEvent(new Event('change', { bubbles: true }));
      filledPass = true;
    }
    // Prefer password form submit; if only email (Google-style) click next
    const btn = find(clickSel) || Array.from(document.querySelectorAll('button')).find(b =>
      /log\\s*in|sign\\s*in|next|continue|tiếp/i.test((b.textContent || ''))
    );
    if (btn) { btn.click(); clicked = true; }
    return {
      host: location.hostname,
      href: location.href,
      filledEmail,
      filledPass,
      clicked,
      note: (!filledEmail && !filledPass)
        ? 'No login fields found — may already be logged in or use OAuth popup'
        : (filledPass ? 'Submitted password form — complete CAPTCHA/2FA if shown'
          : 'Email step filled — continue if multi-step auth')
    };
  })()`

  try {
    const result = await cdpNavigateAndEvaluate(
      input.cdpEndpoint,
      target.url,
      expression,
      { waitMs: 3200 },
    )
    return {
      ok: true,
      platform: input.platform,
      needsHuman: true as const,
      result,
      message: 'Assisted fill attempted. Complete CAPTCHA / 2FA / OAuth if prompted, then Export session.',
    }
  }
  catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      needsHuman: true as const,
    }
  }
}

export type BridgePairConfig = {
  apiBase: string
  profileId: string
  bridgeToken: string
  providerId: string
  seatName?: string
  updatedAt: string
}

export async function saveBridgePair(cfg: BridgePairConfig) {
  await writeJson(pairFile, cfg)
  return cfg
}

export async function readBridgePair(): Promise<BridgePairConfig | null> {
  const cfg = await readJson<BridgePairConfig | null>(pairFile, null)
  return cfg
}
