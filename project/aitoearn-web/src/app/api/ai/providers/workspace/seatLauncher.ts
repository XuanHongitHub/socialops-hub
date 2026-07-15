/**
 * Launch / manage Chrome seats with ALL automation packs loaded.
 *
 * Profiles supported:
 * 1) app_owned  — %APPDATA%/SocialsHub/browser-seats/{seatId}
 * 2) chrome_named — Chrome User Data + profile-directory (e.g. "Profile 6")
 * 3) attach only — connectOverCDP without relaunch (see browserRuntime.attachExistingCdp)
 *
 * Extension load (critical on modern Chrome):
 *   --load-extension=p1,p2,...
 *   --disable-extensions-except=p1,p2,...
 */
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getLoadExtensionPaths, listAutomationPacks, packLoginTargets } from '../extension/registry'
import { probeCdp } from './_store'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const localApp = process.env.LOCALAPPDATA || ''
const seatsRoot = join(appData, 'SocialsHub', 'browser-seats')

const running = new Map<string, {
  pid: number
  port: number
  userDataDir: string
  profileDirectory?: string
  kind: 'app_owned' | 'chrome_named'
}>()

export type { BrowserEngine } from './browserEngine'
export {
  resolveBrowserEngine,
  findChromeBinary,
  getCloakInstallHint,
} from './browserEngine'
import type { BrowserEngine } from './browserEngine'
import { resolveBrowserEngine, getCloakInstallHint, cloakStealthArgs } from './browserEngine'

export function chromeUserDataRoot(): string {
  return join(localApp, 'Google', 'Chrome', 'User Data')
}

export function listChromeProfileDirectories(): string[] {
  const root = chromeUserDataRoot()
  if (!existsSync(root))
    return []
  try {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    return readdirSync(root).filter((name) => {
      if (name === 'System Profile' || name === 'Guest Profile')
        return false
      if (name === 'Default' || /^Profile \d+$/i.test(name)) {
        try {
          return statSync(join(root, name)).isDirectory()
        }
        catch {
          return false
        }
      }
      return false
    })
  }
  catch {
    return []
  }
}

export function seatUserDataDir(seatId: string) {
  return join(seatsRoot, seatId)
}

/**
 * Drop Chromium service-worker / extension script caches so --load-extension
 * always picks up the on-disk unpacked pack (prevents stale SW after code edits).
 */
export function purgeSeatExtensionRuntimeCache(userDataDir: string) {
  const def = join(userDataDir, 'Default')
  const doomed = [
    join(def, 'Service Worker'),
    join(def, 'Extension State'),
    join(def, 'Code Cache'),
    join(def, 'GPUCache'),
  ]
  for (const p of doomed) {
    try {
      if (existsSync(p))
        rmSync(p, { recursive: true, force: true })
    }
    catch {
      // non-fatal — profile may be locked
    }
  }
}

export async function ensureSeatDir(seatId: string, opts?: { purgeExtRuntime?: boolean }) {
  const dir = seatUserDataDir(seatId)
  await mkdir(dir, { recursive: true })
  await mkdir(join(dir, 'Default'), { recursive: true })
  const firstRun = join(dir, 'First Run')
  if (!existsSync(firstRun))
    await writeFile(firstRun, '', 'utf8')
  // Developer mode + silent downloads (no Save-As ask). Write Preferences only
  // (not Secure Preferences — HMAC-signed, writing breaks it). Browser must be closed.
  await ensureSeatChromePrefs(join(dir, 'Default', 'Preferences'))
  if (opts?.purgeExtRuntime !== false)
    purgeSeatExtensionRuntimeCache(dir)
  return dir
}

/** Default download folder for Flow/ChatGPT auto-download (no prompt). */
export function seatDownloadDir(seatId?: string) {
  const base = process.env.SOCIALOPS_DOWNLOAD_DIR
    || join(process.env.USERPROFILE || appData, 'Downloads', 'SocialsHub')
  return seatId ? join(base, seatId) : base
}

/**
 * Unpacked packs need developer_mode; Flow auto-download needs no Save-As dialog.
 * Must be written while Chrome is **closed** for that user-data-dir.
 */
export async function ensureSeatChromePrefs(prefsPath: string, opts?: {
  downloadDirectory?: string
}) {
  try {
    let prefs: any = {}
    if (existsSync(prefsPath)) {
      try {
        prefs = JSON.parse(await readFile(prefsPath, 'utf8'))
      }
      catch {
        prefs = {}
      }
    }
    prefs.extensions = prefs.extensions || {}
    prefs.extensions.ui = { ...(prefs.extensions.ui || {}), developer_mode: true }

    // Reduce first-run prompts
    prefs.browser = prefs.browser || {}
    prefs.browser.has_seen_welcome_page = true
    prefs.distribution = prefs.distribution || {}
    prefs.distribution.import_bookmarks = false

    // ── Silent downloads (no "Save as" / ask every file) ──
    // Keep existing D:\Download if already set (user habit); else SocialsHub Downloads.
    const existingDl = String(prefs.download?.default_directory || prefs.savefile?.default_directory || '').trim()
    const downloadDirectory = opts?.downloadDirectory
      || existingDl
      || seatDownloadDir()
    try {
      await mkdir(downloadDirectory, { recursive: true })
    }
    catch {
      // path may be on missing drive — still write pref
    }
    prefs.download = {
      ...(prefs.download || {}),
      prompt_for_download: false,
      default_directory: downloadDirectory,
      directory_upgrade: true,
    }
    prefs.savefile = {
      ...(prefs.savefile || {}),
      default_directory: downloadDirectory,
    }
    // Allow multi/auto downloads without extra permission prompts
    prefs.profile = prefs.profile || {}
    prefs.profile.default_content_setting_values = {
      ...(prefs.profile.default_content_setting_values || {}),
      automatic_downloads: 1, // Allow
    }

    await mkdir(join(prefsPath, '..'), { recursive: true })
    await writeFile(prefsPath, JSON.stringify(prefs), 'utf8')
    return true
  }
  catch {
    // non-fatal — profile may be locked while Chrome is running
    return false
  }
}

/** @deprecated use ensureSeatChromePrefs */
export async function ensureDeveloperModePrefs(prefsPath: string) {
  return ensureSeatChromePrefs(prefsPath)
}

/** Force developer_mode + silent downloads on a seat (browser must be stopped). */
export async function enableSeatDeveloperMode(seatId: string) {
  const dir = seatUserDataDir(seatId)
  await mkdir(join(dir, 'Default'), { recursive: true })
  const dl = seatDownloadDir(seatId)
  const ok = await ensureSeatChromePrefs(join(dir, 'Default', 'Preferences'), {
    downloadDirectory: dl,
  })
  return { seatId, ok, prefsPath: join(dir, 'Default', 'Preferences'), downloadDirectory: dl }
}

async function portFree(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800),
      cache: 'no-store',
    })
    return !r.ok
  }
  catch {
    return true
  }
}

export async function pickCdpPort(preferred = 9222): Promise<number> {
  for (let p = preferred; p < preferred + 80; p++) {
    if (await portFree(p))
      return p
  }
  return preferred + Math.floor(Math.random() * 2000)
}

export type LaunchSeatResult = {
  ok: boolean
  seatId: string
  kind: 'app_owned' | 'chrome_named'
  cdpEndpoint: string
  cdpPort: number
  userDataDir: string
  profileDirectory?: string
  chromePath?: string
  pid?: number
  extensionPaths: string[]
  extensionVerify?: ExtensionVerifyResult
  error?: string
  alreadyRunning?: boolean
}

export type { ExtensionVerifyResult } from '../extension/cdpVerify'
export { scoreCdpExtensionTargets } from '../extension/cdpVerify'
import { scoreCdpExtensionTargets, type ExtensionVerifyResult } from '../extension/cdpVerify'

/** List chrome-extension:// targets visible over CDP — proof packs are alive. */
export async function verifyExtensionsOnCdp(cdpEndpoint: string): Promise<ExtensionVerifyResult> {
  const packs = listAutomationPacks().filter(p => p.packageStatus === 'verified')
  const expected = packs.length
  const packIds = packs.map(p => p.id)
  try {
    const base = cdpEndpoint.replace(/\/$/, '')
    const listRes = await fetch(`${base}/json/list`, { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    const targets = listRes.ok ? await listRes.json() : []
    return scoreCdpExtensionTargets(Array.isArray(targets) ? targets : [], expected, packIds)
  }
  catch (e) {
    return {
      ok: false,
      expected,
      foundServiceWorkers: 0,
      foundExtensionTargets: [],
      uniqueExtensionIds: [],
      missingPackIds: packIds,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

function buildExtensionArgs(extensionPaths: string[]): string[] {
  if (!extensionPaths.length)
    return []
  // Normalize paths for Chrome CLI (forward slashes work on Windows)
  const normalized = extensionPaths.map(p => p.replace(/\\/g, '/'))
  const joined = normalized.join(',')
  return [
    `--load-extension=${joined}`,
    `--disable-extensions-except=${joined}`,
    // Allow remote debugging + extensions together
    '--allow-legacy-extension-manifests',
  ]
}

/**
 * Resolve which packs to load.
 *
 * CRITICAL (Cloudflare): niche packs inject content_scripts into grok.com /
 * chatgpt.com / labs.google / gemini — including on CF "Just a moment" pages.
 * That breaks Turnstile even for manual solving. Use packMode='clean' for login.
 *
 * - clean / login / none → zero extensions (true Cloak, CF-safe)
 * - bridge → SocialOps bridge only (still injects content.js on platform hosts —
 *   bridge content.js no-ops on CF challenge pages)
 * - all / undefined → all verified packs
 */
export function resolvePackIdsForLaunch(input: {
  packIds?: string[]
  packMode?: string
}): string[] | undefined {
  const mode = String(input.packMode || '').toLowerCase()
  if (mode === 'clean' || mode === 'login' || mode === 'none' || mode === 'cf_safe')
    return [] // explicit empty → no --load-extension
  if (mode === 'bridge')
    return ['socialops-bridge']
  if (mode === 'all' || mode === 'full')
    return undefined // all verified
  if (Array.isArray(input.packIds))
    return input.packIds
  return undefined // all verified
}

export async function launchSeat(input: {
  seatId: string
  /** app_owned (default) | chrome_named */
  kind?: 'app_owned' | 'chrome_named'
  /** e.g. "Profile 6" or "Default" when kind=chrome_named */
  chromeProfileDirectory?: string
  preferredPort?: number
  packIds?: string[]
  /**
   * clean | login | none | cf_safe → no extensions (manual CF / login)
   * bridge → bridge only
   * all → every verified pack (default)
   */
  packMode?: string
  headless?: boolean
  /** Only reuse CDP if it was launched for THIS seatId */
  allowReuseTracked?: boolean
  openAboutBlank?: boolean
  /** auto | cloak | chrome — default auto prefers Cloak v146 if installed */
  browserEngine?: BrowserEngine | string
  /** Optional HTTP/SOCKS proxy for Cloak (residential recommended for CF) */
  proxy?: string
}): Promise<LaunchSeatResult> {
  const seatId = input.seatId
  const kind = input.kind || 'app_owned'
  const resolvedPackIds = resolvePackIdsForLaunch({
    packIds: input.packIds,
    packMode: input.packMode,
  })
  // undefined → all packs; [] → clean (no extensions)
  const extensionPaths = resolvedPackIds === undefined
    ? getLoadExtensionPaths()
    : (resolvedPackIds.length ? getLoadExtensionPaths(resolvedPackIds) : [])

  const allowEmptyPacks = resolvedPackIds !== undefined && resolvedPackIds.length === 0
  if (!extensionPaths.length && !allowEmptyPacks) {
    return {
      ok: false,
      seatId,
      kind,
      cdpEndpoint: '',
      cdpPort: 0,
      userDataDir: '',
      extensionPaths: [],
      error: 'No verified extension packs (need extensions/*-automation-ext + social-ops/extension)',
    }
  }

  // Reuse only if we tracked this seat and CDP still up
  if (input.allowReuseTracked !== false) {
    const existing = running.get(seatId)
    if (existing) {
      const probe = await probeCdp(`http://127.0.0.1:${existing.port}`)
      if (probe.ok) {
        const extensionVerify = await verifyExtensionsOnCdp(`http://127.0.0.1:${existing.port}`)
        return {
          ok: true,
          seatId,
          kind: existing.kind,
          cdpEndpoint: `http://127.0.0.1:${existing.port}`,
          cdpPort: existing.port,
          userDataDir: existing.userDataDir,
          profileDirectory: existing.profileDirectory,
          pid: existing.pid,
          extensionPaths,
          extensionVerify,
          alreadyRunning: true,
        }
      }
      running.delete(seatId)
    }
  }

  const resolved = resolveBrowserEngine(input.browserEngine)
  const chromePath = resolved.path
  if (!chromePath) {
    const hint = getCloakInstallHint()
    return {
      ok: false,
      seatId,
      kind,
      cdpEndpoint: '',
      cdpPort: 0,
      userDataDir: '',
      extensionPaths,
      error: resolved.engine === 'cloak'
        ? `CloakBrowser not found. Download free v146: ${hint.release} → unzip to ${hint.installDir}`
        : 'Chrome/Edge/Cloak not found. Set CLOAKBROWSER_PATH or CHROME_PATH, or install Cloak v146.',
    }
  }

  let userDataDir: string
  let profileDirectory: string | undefined

  if (kind === 'chrome_named') {
    userDataDir = chromeUserDataRoot()
    profileDirectory = input.chromeProfileDirectory || 'Profile 6'
    const profilePath = join(userDataDir, profileDirectory)
    if (!existsSync(profilePath)) {
      return {
        ok: false,
        seatId,
        kind,
        cdpEndpoint: '',
        cdpPort: 0,
        userDataDir,
        profileDirectory,
        chromePath,
        extensionPaths,
        error: `Chrome profile not found: ${profilePath}`,
      }
    }
    // Enable developer mode + silent downloads on that profile
    await ensureSeatChromePrefs(join(profilePath, 'Preferences'))
  }
  else {
    // Always purge SW cache so bridge pack edits (background.js) load on next seat start
    userDataDir = await ensureSeatDir(seatId, { purgeExtRuntime: true })
    profileDirectory = undefined
  }

  const prefer = input.preferredPort || (kind === 'chrome_named' ? 9360 : 9340)
  const port = await pickCdpPort(prefer)

  // Chrome 137+: re-enable --load-extension via DisableLoadExtensionCommandLineSwitch off
  // App-owned: force all 5 packs (except + load).
  // Chrome named (Profile 6…): keep store niches; only force-load SocialOps Bridge.
  let extArgs: string[]
  let loadedPaths = extensionPaths
  if (kind === 'chrome_named') {
    const bridgeOnly = getLoadExtensionPaths(['socialops-bridge'])
    loadedPaths = bridgeOnly.length ? bridgeOnly : extensionPaths
    const joined = loadedPaths.map(p => p.replace(/\\/g, '/')).join(',')
    extArgs = [
      `--load-extension=${joined}`,
      // do NOT disable-extensions-except — preserve Profile store packs + logins
    ]
  }
  else {
    extArgs = buildExtensionArgs(extensionPaths)
  }

  // Cloak engine: apply official fingerprint flags (docs). Stock Chrome: keep load-extension workarounds only.
  const isCloak = resolved.engine === 'cloak'
  const stealth = isCloak
    ? cloakStealthArgs({
        seatId,
        proxy: typeof input.proxy === 'string' ? input.proxy : undefined,
      })
    : []

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...extArgs,
    ...stealth,
    '--no-first-run',
    '--no-default-browser-check',
    // Minimal chrome chrome flags — avoid bot-looking stacks. Cloak patches webdriver at C++ level.
    ...(isCloak
      ? [
          // Only what we need for unpacked packs on modern Chromium
          '--disable-features=DisableLoadExtensionCommandLineSwitch,ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled',
        ]
      : [
          '--disable-sync',
          '--disable-features=TranslateUI,DisableLoadExtensionCommandLineSwitch,ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled',
        ]),
  ]
  if (profileDirectory)
    args.push(`--profile-directory=${profileDirectory}`)
  // Cloak docs: never headless for Turnstile/CF — some sites detect even with C++ patches
  if (input.headless && !isCloak)
    args.unshift('--headless=new')
  else if (input.headless && isCloak) {
    // Ignore headless request for Cloak seats (Cloudflare / grok.com will challenge hard)
  }
  // Prefer real New Tab over about:blank for Cloak (empty about:blank + CDP looks colder)
  if (input.openAboutBlank !== false) {
    if (isCloak)
      args.push('chrome://newtab/')
    else
      args.push('about:blank')
  }

  let pid: number | undefined
  try {
    const child = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: process.env,
    })
    pid = child.pid
    child.unref()
  }
  catch (e) {
    return {
      ok: false,
      seatId,
      kind,
      cdpEndpoint: `http://127.0.0.1:${port}`,
      cdpPort: port,
      userDataDir,
      profileDirectory,
      chromePath,
      extensionPaths,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  let ready = false
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 400))
    const probe = await probeCdp(`http://127.0.0.1:${port}`)
    if (probe.ok) {
      ready = true
      break
    }
  }

  if (!ready) {
    return {
      ok: false,
      seatId,
      kind,
      cdpEndpoint: `http://127.0.0.1:${port}`,
      cdpPort: port,
      userDataDir,
      profileDirectory,
      chromePath,
      pid,
      extensionPaths,
      error: kind === 'chrome_named'
        ? `Chrome profile "${profileDirectory}" CDP not ready. Close all Chrome windows using that profile, then retry.`
        : 'Chrome started but CDP did not become ready in time',
    }
  }

  // Clean/login mode: no packs expected — skip 5/5 SW gate (CF-safe Cloak).
  let extensionVerify = allowEmptyPacks
    ? {
        ok: true,
        expected: 0,
        foundServiceWorkers: 0,
        foundExtensionTargets: [] as string[],
        uniqueExtensionIds: [] as string[],
        missingPackIds: [] as string[],
        detail: 'packMode=clean/login — no extensions loaded (Cloudflare-safe)',
      }
    : await verifyExtensionsOnCdp(`http://127.0.0.1:${port}`)
  if (!allowEmptyPacks) {
    for (let attempt = 0; attempt < 8 && !extensionVerify.ok; attempt++) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        const base = `http://127.0.0.1:${port}`
        if (attempt === 0 || attempt === 3) {
          await fetch(`${base}/json/new?${encodeURIComponent('chrome://extensions/')}`, {
            method: 'PUT',
            signal: AbortSignal.timeout(3000),
          }).catch(() => undefined)
        }
      }
      catch { /* ignore */ }
      extensionVerify = await verifyExtensionsOnCdp(`http://127.0.0.1:${port}`)
    }
  }

  if (pid)
    running.set(seatId, { pid, port, userDataDir, profileDirectory, kind })

  return {
    ok: true,
    seatId,
    kind,
    cdpEndpoint: `http://127.0.0.1:${port}`,
    cdpPort: port,
    userDataDir,
    profileDirectory,
    chromePath,
    pid,
    extensionPaths: loadedPaths,
    extensionVerify,
    // extra diagnostics for UI
    ...( {
      browserEngine: resolved.engine,
    } as any ),
  }
}

/** @deprecated use launchSeat — kept for call sites */
export async function launchAppOwnedSeat(input: {
  seatId: string
  preferredPort?: number
  packIds?: string[]
  headless?: boolean
}): Promise<LaunchSeatResult> {
  return launchSeat({
    seatId: input.seatId,
    kind: 'app_owned',
    preferredPort: input.preferredPort,
    packIds: input.packIds,
    headless: input.headless,
    allowReuseTracked: true,
  })
}

export type LoginProbe = {
  platform: string
  packId: string
  status: 'ready' | 'needs_login' | 'unknown' | 'offline'
  url?: string
  checkedAt: string
  detail?: string
}

export async function probePlatformLogins(cdpEndpoint: string): Promise<LoginProbe[]> {
  const base = cdpEndpoint.replace(/\/$/, '')
  const checkedAt = new Date().toISOString()
  let targets: Array<{ url?: string, type?: string, title?: string }> = []
  try {
    const listRes = await fetch(`${base}/json/list`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    targets = listRes.ok ? await listRes.json() : []
  }
  catch {
    return packLoginTargets().map(t => ({
      platform: t.platform,
      packId: t.packId,
      status: 'offline' as const,
      checkedAt,
      detail: 'CDP unreachable',
    }))
  }

  const pages = (Array.isArray(targets) ? targets : []).filter(t =>
    !t.type || t.type === 'page' || t.type === 'webview',
  )

  const results: LoginProbe[] = []
  for (const t of packLoginTargets()) {
    const hit = pages.find(p => t.readyUrlIncludes.some(h => String(p.url || '').includes(h)))
    if (!hit) {
      try {
        await fetch(`${base}/json/new?${encodeURIComponent(t.url)}`, {
          method: 'PUT',
          signal: AbortSignal.timeout(4000),
        }).catch(async () => {
          await fetch(`${base}/json/new?${encodeURIComponent(t.url)}`, { signal: AbortSignal.timeout(4000) })
        })
      }
      catch { /* ignore */ }
      results.push({
        platform: t.platform,
        packId: t.packId,
        status: 'unknown',
        checkedAt,
        detail: 'Opened login target; re-probe after sign-in',
      })
      continue
    }
    const url = String(hit.url || '')
    const needsLogin = t.loginUrlIncludes.some(h => url.toLowerCase().includes(h.toLowerCase()))
    results.push({
      platform: t.platform,
      packId: t.packId,
      status: needsLogin ? 'needs_login' : 'ready',
      url,
      checkedAt,
      detail: hit.title,
    })
  }
  return results
}

export async function openPlatformTabs(cdpEndpoint: string, platforms?: string[]) {
  const base = cdpEndpoint.replace(/\/$/, '')
  const targets = packLoginTargets().filter(t => !platforms?.length || platforms.includes(t.platform))
  const opened: string[] = []
  for (const t of targets) {
    try {
      const res = await fetch(`${base}/json/new?${encodeURIComponent(t.url)}`, {
        method: 'PUT',
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        await fetch(`${base}/json/new?${encodeURIComponent(t.url)}`, { signal: AbortSignal.timeout(5000) })
      }
      opened.push(t.platform)
    }
    catch {
      // continue
    }
  }
  return opened
}
