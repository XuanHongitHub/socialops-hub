/**
 * Pure browser engine resolution (Cloak v146 vs stock Chrome). No CDP / spawn.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const localApp = process.env.LOCALAPPDATA || ''

export type BrowserEngine = 'auto' | 'cloak' | 'chrome'

/**
 * Prefer official cloakbrowser cache (~/.cloakbrowser/chromium-*) first.
 * SocialsHub/cloak-v146 may be an incomplete/stale unzip that still CF-blocks grok.com
 * even with remote-debugging only (verified A/B: different SHA vs chromium-146.0.7680.177.4).
 */
export function cloakCandidates(): string[] {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const cloakCache = join(home, '.cloakbrowser')
  const cached: string[] = []
  try {
    if (existsSync(cloakCache)) {
      const dirs = readdirSync(cloakCache)
        .filter(n => n.startsWith('chromium-'))
        .map((n) => {
          const dir = join(cloakCache, n)
          const exe = join(dir, 'chrome.exe')
          const mtime = existsSync(exe) ? statSync(exe).mtimeMs : 0
          return { exe, mtime, n }
        })
        .filter(x => x.mtime > 0)
        // Prefer higher version name (…177.4 before bare 177)
        .sort((a, b) => {
          if (a.n !== b.n)
            return b.n.localeCompare(a.n, undefined, { numeric: true })
          return b.mtime - a.mtime
        })
      for (const d of dirs)
        cached.push(d.exe)
    }
  }
  catch {
    // ignore cache scan errors
  }

  return [
    process.env.CLOAKBROWSER_PATH || '',
    process.env.SOCIALOPS_CLOAK_PATH || '',
    // Official npm/pip cache (correct stealth build)
    ...cached,
    join(localApp, 'SocialsHub', 'browsers', 'cloak-v146', 'chrome.exe'),
    join(localApp, 'SocialsHub', 'browsers', 'cloakbrowser', 'chrome.exe'),
    join(localApp, 'CloakBrowser', 'chrome.exe'),
    join(localApp, 'Programs', 'CloakBrowser', 'chrome.exe'),
  ].filter(Boolean)
}

export function stockChromeCandidates(): string[] {
  const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files'
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
  return [
    process.env.CHROME_PATH || '',
    process.env.SOCIALOPS_CHROME_PATH || '',
    join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(localApp, 'Chromium', 'Application', 'chrome.exe'),
    join(localApp, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean)
}

export function resolveBrowserEngine(preferred?: BrowserEngine | string): {
  engine: 'cloak' | 'chrome'
  path: string | null
  candidates: string[]
} {
  const pref = String(preferred || process.env.SOCIALOPS_BROWSER_ENGINE || 'auto').toLowerCase() as BrowserEngine
  const cloak = cloakCandidates()
  const stock = stockChromeCandidates()
  if (pref === 'cloak') {
    return { engine: 'cloak', path: cloak.find(p => existsSync(p)) || null, candidates: cloak }
  }
  if (pref === 'chrome') {
    return { engine: 'chrome', path: stock.find(p => existsSync(p)) || null, candidates: stock }
  }
  const cloakPath = cloak.find(p => existsSync(p))
  if (cloakPath)
    return { engine: 'cloak', path: cloakPath, candidates: [...cloak, ...stock] }
  return { engine: 'chrome', path: stock.find(p => existsSync(p)) || null, candidates: [...cloak, ...stock] }
}

export function findChromeBinary(preferred?: BrowserEngine | string): string | null {
  return resolveBrowserEngine(preferred).path
}

export function getCloakInstallHint() {
  return {
    release: 'https://github.com/CloakHQ/CloakBrowser/releases/tag/chromium-v146.0.7680.177.5',
    asset: 'cloakbrowser-windows-x64.zip',
    installDir: join(localApp, 'SocialsHub', 'browsers', 'cloak-v146'),
    exe: join(localApp, 'SocialsHub', 'browsers', 'cloak-v146', 'chrome.exe'),
    note: 'Free Cloak v146. Unzip so chrome.exe is in that folder. Set SOCIALOPS_BROWSER_ENGINE=cloak to force.',
    docs: 'https://github.com/CloakHQ/CloakBrowser',
    cloudflareNotes: [
      'Cloak free v146 has C++ stealth patches; Pro (v148) tracks Cloudflare changes faster.',
      'Always headed (never headless) for Turnstile/managed challenges.',
      'Use stable --fingerprint=seed per seat (returning visitor); random seed every launch looks botty on same IP.',
      'For grok.com / heavy CF: residential proxy + geoip (SOCIALOPS_PROXY / SOCIALOPS_CLOAK_PROXY).',
      'Managed Turnstile may still need one human click — Cloak does not solve CAPTCHAs, it reduces appearance.',
      'Avoid rapid multi-tab navigation + CDP fill right after cold start (triggers challenge).',
    ],
  }
}

/**
 * Stable numeric fingerprint seed from seat id (Cloak docs: fixed seed = returning visitor).
 * Range 10000–99999 matches wrapper defaults.
 */
export function cloakFingerprintSeed(seatId: string): number {
  let h = 2166136261
  const s = String(seatId || 'primary')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const n = Math.abs(h >>> 0) % 90000
  return 10000 + n
}

/**
 * CloakBrowser recommended binary flags when launching chrome.exe directly
 * (without npm cloakbrowser wrapper humanize).
 * @see https://github.com/CloakHQ/CloakBrowser — Fingerprint Management
 */
export function cloakStealthArgs(input: {
  seatId: string
  proxy?: string
  timezone?: string
  locale?: string
  /** Only when SOCIALOPS_CLOAK_FORCE_FINGERPRINT=1 — default lets binary auto-seed */
  forceFingerprint?: boolean
}): string[] {
  const args: string[] = []
  // Docs: "Stealthy with zero flags — binary auto-generates a random fingerprint".
  // Forcing --fingerprint on a wrong/stale binary can make CF worse; keep optional.
  if (input.forceFingerprint || process.env.SOCIALOPS_CLOAK_FORCE_FINGERPRINT === '1') {
    const seed = cloakFingerprintSeed(input.seatId)
    args.push(`--fingerprint=${seed}`)
    args.push('--fingerprint-platform=windows')
    args.push('--fingerprint-storage-quota=5000')
    const tz = input.timezone || process.env.SOCIALOPS_TIMEZONE || process.env.TZ
    const locale = input.locale || process.env.SOCIALOPS_LOCALE || 'en-US'
    if (tz)
      args.push(`--fingerprint-timezone=${tz}`)
    if (locale)
      args.push(`--fingerprint-locale=${locale}`)
  }

  const proxy = input.proxy
    || process.env.SOCIALOPS_CLOAK_PROXY
    || process.env.SOCIALOPS_PROXY
    || ''
  if (proxy) {
    args.push(`--proxy-server=${proxy.replace(/^https?:\/\//, '')}`)
    args.push('--fingerprint-webrtc-ip=auto')
  }
  return args
}
