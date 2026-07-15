/**
 * Launch chatgpt-1..4 without Hub (direct Cloak/Chrome + --load-extension).
 * Writes developer_mode=true first.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const APPDATA = process.env.APPDATA || ''
const LOCAL = process.env.LOCALAPPDATA || ''
const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
// Windows path fix for fileURL
const webRoot = process.cwd().includes('aitoearn-web')
  ? process.cwd()
  : path.join(process.cwd(), 'project', 'aitoearn-web')

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

function enableDevMode(seatId) {
  const prefsPath = path.join(APPDATA, 'SocialsHub', 'browser-seats', seatId, 'Default', 'Preferences')
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true })
  let prefs = {}
  if (fs.existsSync(prefsPath)) {
    try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')) }
    catch { prefs = {} }
  }
  prefs.extensions = prefs.extensions || {}
  prefs.extensions.ui = { ...(prefs.extensions.ui || {}), developer_mode: true }
  fs.writeFileSync(prefsPath, JSON.stringify(prefs))
}

async function cdpLive(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })
    return r.ok
  }
  catch { return false }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('No Chrome/Cloak found')
    process.exit(1)
  }
  console.log('Chrome', chrome)
  console.log('Packs', PACKS.length, PACKS.map(p => path.basename(p)))
  if (PACKS.length < 1) {
    console.error('No packs under', webRoot)
    process.exit(1)
  }

  const joined = PACKS.map(p => p.replace(/\\/g, '/')).join(',')

  for (const { id, port } of SEATS) {
    if (await cdpLive(port)) {
      console.log(`SKIP ${id} :${port} already live`)
      continue
    }
    enableDevMode(id)
    const userDataDir = path.join(APPDATA, 'SocialsHub', 'browser-seats', id)
    fs.mkdirSync(path.join(userDataDir, 'Default'), { recursive: true })
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--load-extension=${joined}`,
      `--disable-extensions-except=${joined}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch,ExtensionManifestV2Unsupported,ExtensionManifestV2Disabled',
      'chrome://newtab/',
    ]
    console.log(`LAUNCH ${id} :${port}`)
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
    console.log(`  ${id} live=${ok} pid=${child.pid}`)
  }

  console.log('DONE')
  for (const { id, port } of SEATS)
    console.log(`  ${id} :${port} live=${await cdpLive(port)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
