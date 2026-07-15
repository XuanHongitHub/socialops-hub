/**
 * Fix pool seats so unpacked Flow/ChatGPT packs actually enable:
 * 1) Stop browsers
 * 2) Clear Secure Preferences (HMAC blocks developer_mode writes)
 * 3) Strip parental "managed" extension gates in Preferences
 * 4) Force extensions.ui.developer_mode = true
 * 5) Relaunch with Cloak/Chrome + load-extension + DisableLoadExtensionCommandLineSwitch off
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const APPDATA = process.env.APPDATA || ''
const LOCAL = process.env.LOCALAPPDATA || ''
const webRoot = process.cwd()
const SEATS = [
  { id: 'chatgpt-1', port: 9480 },
  { id: 'chatgpt-2', port: 9481 },
  { id: 'chatgpt-3', port: 9482 },
  { id: 'chatgpt-4', port: 9483 },
]
const PACKS = [
  'socialops-bridge-ext',
  'grok-automation-ext',
  'chatgpt-automation-ext',
  'gemini-automation-ext',
  'flow-automation-ext',
].map(p => path.join(webRoot, 'extensions', p)).filter(p => fs.existsSync(path.join(p, 'manifest.json')))

const sleep = ms => new Promise(r => setTimeout(r, ms))

function findChrome() {
  const candidates = [
    process.env.CLOAKBROWSER_PATH,
    path.join(process.env.USERPROFILE || '', '.cloakbrowser', 'chromium-146.0.7680.177.4', 'chrome.exe'),
    path.join(LOCAL, 'SocialsHub', 'browsers', 'cloak-v146', 'chrome.exe'),
    // Prefer stock Chrome as fallback if Cloak blocks unpacked
    path.join(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
  ].filter(Boolean)
  for (const c of candidates) {
    if (fs.existsSync(c))
      return c
  }
  return null
}

async function killPort(port) {
  if (process.platform !== 'win32')
    return
  await new Promise((resolve) => {
    const p = spawn('powershell.exe', [
      '-NoProfile', '-Command',
      `$pids = Get-NetTCPConnection -LocalPort ${port} -State Listen -EA SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($x in $pids){ taskkill /PID $x /T /F 2>$null }`,
    ], { windowsHide: true })
    p.on('close', resolve)
  })
}

function patchSeat(seatId) {
  const root = path.join(APPDATA, 'SocialsHub', 'browser-seats', seatId)
  const def = path.join(root, 'Default')
  fs.mkdirSync(def, { recursive: true })

  // Secure Preferences HMAC will reject/overwrite developer_mode — remove so Chrome recreates clean
  for (const name of ['Secure Preferences', 'Secure Preferences.bak']) {
    const p = path.join(def, name)
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p)
        console.log(`  deleted ${name}`)
      }
      catch (e) {
        console.log(`  cannot delete ${name}: ${e.message}`)
      }
    }
  }

  const prefsPath = path.join(def, 'Preferences')
  let prefs = {}
  if (fs.existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
    }
    catch {
      prefs = {}
    }
  }
  prefs.extensions = prefs.extensions || {}
  prefs.extensions.ui = { ...(prefs.extensions.ui || {}), developer_mode: true }
  // Strip parental approval gate noise
  prefs.profile = prefs.profile || {}
  prefs.profile.managed = {
    locally_parent_approved_extensions: {},
    locally_parent_approved_extensions_migration_state: 0,
  }
  prefs.profile.managed_user_id = ''
  prefs.profile.family_member_role = 'not_in_family'
  prefs.browser = prefs.browser || {}
  prefs.browser.has_seen_welcome_page = true
  fs.writeFileSync(prefsPath, JSON.stringify(prefs))

  // Verify
  const check = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
  console.log(`  ${seatId} developer_mode=${check.extensions?.ui?.developer_mode}`)
}

async function cdpLive(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })
    return r.ok
  }
  catch {
    return false
  }
}

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('No chrome')
    process.exit(1)
  }
  console.log('Chrome', chrome)
  console.log('Packs', PACKS.length)
  if (PACKS.length < 5)
    console.warn('WARN: expected 5 packs, got', PACKS.length)

  console.log('1) Kill seats…')
  for (const s of SEATS)
    await killPort(s.port)
  await sleep(2500)

  console.log('2) Patch prefs (dev mode + clear Secure Preferences)…')
  for (const s of SEATS)
    patchSeat(s.id)

  console.log('3) Launch…')
  const joined = PACKS.map(p => p.replace(/\\/g, '/')).join(',')
  for (const { id, port } of SEATS) {
    // re-patch right before launch
    patchSeat(id)
    const userDataDir = path.join(APPDATA, 'SocialsHub', 'browser-seats', id)
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--load-extension=${joined}`,
      `--disable-extensions-except=${joined}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch,ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled',
      '--enable-extensions',
      'chrome://extensions/',
    ]
    const child = spawn(chrome, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    let ok = false
    for (let i = 0; i < 50; i++) {
      await sleep(400)
      if (await cdpLive(port)) {
        ok = true
        break
      }
    }
    console.log(`  ${id} :${port} live=${ok} pid=${child.pid}`)
  }

  await sleep(3000)
  console.log('4) Verify prefs survived launch…')
  for (const { id, port } of SEATS) {
    const prefsPath = path.join(APPDATA, 'SocialsHub', 'browser-seats', id, 'Default', 'Preferences')
    let dev = false
    try {
      const j = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
      dev = j?.extensions?.ui?.developer_mode === true
    }
    catch { /* */ }
    const live = await cdpLive(port)
    // count extension SW
    let sw = 0
    if (live) {
      try {
        const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())
        sw = list.filter(t => /chrome-extension:/.test(t.url || '')).length
      }
      catch { /* */ }
    }
    console.log(`  ${id} live=${live} devMode=${dev} extTargets=${sw}`)
  }
  console.log('\nOpen chrome://extensions on each window — Flow should NOT say turn on developer mode.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
