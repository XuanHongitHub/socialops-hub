/**
 * Enable Chrome Developer mode on chatgpt-1..4 so unpacked Flow/Grok packs work.
 * 1) Stop browsers on 9480–9483
 * 2) Write Preferences extensions.ui.developer_mode = true (browser closed)
 * 3) Relaunch seats via Hub API
 *
 * Usage: node scripts/fix-pool-dev-mode.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const APPDATA = process.env.APPDATA || ''
const SEATS = [
  { id: 'chatgpt-1', port: 9480 },
  { id: 'chatgpt-2', port: 9481 },
  { id: 'chatgpt-3', port: 9482 },
  { id: 'chatgpt-4', port: 9483 },
]
const HUB = process.env.SOCIALOPS_HUB || 'http://127.0.0.1:6061'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function cdpLive(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) })
    return r.ok
  }
  catch {
    return false
  }
}

function writeDeveloperMode(seatId) {
  const prefsPath = path.join(
    APPDATA,
    'SocialsHub',
    'browser-seats',
    seatId,
    'Default',
    'Preferences',
  )
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true })
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
  prefs.browser = prefs.browser || {}
  prefs.browser.has_seen_welcome_page = true
  prefs.distribution = prefs.distribution || {}
  prefs.distribution.import_bookmarks = false
  fs.writeFileSync(prefsPath, JSON.stringify(prefs))
  // verify
  const check = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
  const on = check?.extensions?.ui?.developer_mode === true
  return { prefsPath, on }
}

/** Kill process trees listening on CDP ports (Windows). */
async function killPortListeners(ports) {
  if (process.platform !== 'win32') {
    console.warn('killPortListeners: Windows only helper; stop browsers manually')
    return
  }
  for (const port of ports) {
    try {
      const out = await new Promise((resolve) => {
        const p = spawn('powershell.exe', [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
        ], { windowsHide: true })
        let buf = ''
        p.stdout.on('data', d => { buf += d })
        p.on('close', () => resolve(buf))
      })
      const pids = [...new Set(String(out).split(/\r?\n/).map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number))]
      for (const pid of pids) {
        console.log(`  kill pid=${pid} (port ${port})`)
        try {
          process.kill(pid)
        }
        catch {
          spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        }
      }
    }
    catch (e) {
      console.warn('  kill fail', port, e.message)
    }
  }
  await sleep(2000)
}

async function launchSeat(seatId, port) {
  const body = {
    action: 'launch_seat',
    seatId,
    profileId: seatId,
    name: `Pool ${seatId}`,
    cdpPort: port,
    force: false,
    openLogins: false,
    packMode: 'all',
    role: 'pool',
    allowReuseTracked: false,
  }
  // allowReuseTracked may not be in API body - use force via not alreadyRunning
  // Hub launch_seat maps force to allowReuseTracked: body.force !== true
  const r = await fetch(`${HUB}/api/ai/providers/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, force: true }),
    signal: AbortSignal.timeout(120000),
  })
  const json = await r.json().catch(() => ({}))
  return json?.data || json
}

async function main() {
  console.log('=== Fix Developer Mode for pool seats chatgpt-1..4 ===')
  console.log('1) Stop browsers on 9480–9483…')
  await killPortListeners(SEATS.map(s => s.port))

  // Also kill by user-data-dir in command line (leftover children)
  if (process.platform === 'win32') {
    for (const { id } of SEATS) {
      const marker = `browser-seats\\\\${id}`
      const ps = `
        Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
          Where-Object { $_.CommandLine -match '${id.replace(/'/g, '')}' -and $_.CommandLine -match 'browser-seats' } |
          ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }
      `
      await new Promise((resolve) => {
        const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true })
        p.on('close', resolve)
      })
    }
    await sleep(1500)
  }

  console.log('2) Write developer_mode=true into Preferences…')
  for (const { id } of SEATS) {
    const { prefsPath, on } = writeDeveloperMode(id)
    console.log(`  ${id}: developer_mode=${on} (${prefsPath})`)
  }

  console.log('3) Relaunch seats via Hub…')
  for (const { id, port } of SEATS) {
    // re-write prefs right before each launch in case ensureSeatDir races
    writeDeveloperMode(id)
    try {
      const data = await launchSeat(id, port)
      console.log(`  ${id}: ok=${data?.ok} cdp=${data?.launch?.cdpEndpoint || data?.profile?.cdpEndpoint} already=${data?.launch?.alreadyRunning} err=${data?.error || ''}`)
    }
    catch (e) {
      console.log(`  ${id}: LAUNCH_FAIL ${e.message}`)
    }
    await sleep(1500)
  }

  console.log('4) Verify CDP + prefs still have developer_mode…')
  for (const { id, port } of SEATS) {
    const live = await cdpLive(port)
    const { on } = writeDeveloperMode(id) // read-back after write is true; if browser overwrote, re-check file
    const prefsPath = path.join(APPDATA, 'SocialsHub', 'browser-seats', id, 'Default', 'Preferences')
    let fileOn = false
    try {
      const j = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
      fileOn = j?.extensions?.ui?.developer_mode === true
    }
    catch { /* */ }
    console.log(`  ${id} :${port} live=${live} prefs.developer_mode=${fileOn}`)
  }

  console.log('\nDone. In each window open chrome://extensions — Developer mode toggle should be ON.')
  console.log('If banner still shows once: toggle Developer mode ON, then reload Flow extension.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
