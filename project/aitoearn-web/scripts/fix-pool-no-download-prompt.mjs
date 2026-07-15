/**
 * Patch chatgpt-1..4: no download "Save as" prompt.
 * Stops browsers, writes Preferences, relaunches with packs.
 *
 * Usage: node scripts/fix-pool-no-download-prompt.mjs
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

function downloadDirFor(seatId) {
  // Prefer existing D:\Download if present on machine
  if (fs.existsSync('D:\\Download'))
    return path.join('D:\\Download', 'SocialsHub', seatId)
  return path.join(process.env.USERPROFILE || '', 'Downloads', 'SocialsHub', seatId)
}

function findChrome() {
  const candidates = [
    process.env.CLOAKBROWSER_PATH,
    path.join(process.env.USERPROFILE || '', '.cloakbrowser', 'chromium-146.0.7680.177.4', 'chrome.exe'),
    path.join(LOCAL, 'SocialsHub', 'browsers', 'cloak-v146', 'chrome.exe'),
    path.join(LOCAL, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (c && fs.existsSync(c))
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

function patchPrefs(seatId) {
  const def = path.join(APPDATA, 'SocialsHub', 'browser-seats', seatId, 'Default')
  fs.mkdirSync(def, { recursive: true })
  // Don't touch Secure Preferences (HMAC)
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
  const dl = downloadDirFor(seatId)
  fs.mkdirSync(dl, { recursive: true })

  prefs.extensions = prefs.extensions || {}
  prefs.extensions.ui = { ...(prefs.extensions.ui || {}), developer_mode: true }

  prefs.download = {
    ...(prefs.download || {}),
    prompt_for_download: false,
    default_directory: dl,
    directory_upgrade: true,
  }
  prefs.savefile = {
    ...(prefs.savefile || {}),
    default_directory: dl,
  }
  prefs.profile = prefs.profile || {}
  prefs.profile.default_content_setting_values = {
    ...(prefs.profile.default_content_setting_values || {}),
    automatic_downloads: 1,
  }
  prefs.browser = prefs.browser || {}
  prefs.browser.has_seen_welcome_page = true

  fs.writeFileSync(prefsPath, JSON.stringify(prefs))
  const check = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
  return {
    seatId,
    prompt: check.download?.prompt_for_download,
    dir: check.download?.default_directory,
    auto: check.profile?.default_content_setting_values?.automatic_downloads,
  }
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
    console.error('No Chrome/Cloak')
    process.exit(1)
  }
  console.log('Chrome', chrome)
  console.log('1) Stop 4 pool browsers…')
  for (const s of SEATS)
    await killPort(s.port)
  await sleep(2000)

  console.log('2) Patch silent download prefs…')
  for (const s of SEATS) {
    const r = patchPrefs(s.id)
    console.log(`  ${r.seatId}: prompt_for_download=${r.prompt} auto=${r.auto}`)
    console.log(`    dir=${r.dir}`)
  }

  console.log('3) Relaunch seats…')
  const joined = PACKS.map(p => p.replace(/\\/g, '/')).join(',')
  for (const { id, port } of SEATS) {
    patchPrefs(id) // again right before launch
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
      'chrome://newtab/',
    ]
    const child = spawn(chrome, args, { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    let ok = false
    for (let i = 0; i < 40; i++) {
      await sleep(400)
      if (await cdpLive(port)) {
        ok = true
        break
      }
    }
    console.log(`  ${id} :${port} live=${ok}`)
  }

  console.log('\nDone. Downloads go to D:\\Download\\SocialsHub\\{seat} (or ~/Downloads/SocialsHub/{seat}) without Save-As prompt.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
