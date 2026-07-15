const DEFAULT_API_BASE = 'http://127.0.0.1:6061/api'
const BRIDGE_RUNNER_VERSION = '0.3.0'
const PAIR_URLS = [
  'http://127.0.0.1:6061/api/ai/providers/extension/bridge/pair-config',
  'http://localhost:6061/api/ai/providers/extension/bridge/pair-config',
]

/** Restricted pages cannot receive content scripts or tabs.sendMessage. */
function isRestrictedUrl(url) {
  const u = String(url || '')
  return !u
    || u === 'about:blank'
    || u.startsWith('chrome://')
    || u.startsWith('chrome-extension://')
    || u.startsWith('devtools://')
    || u.startsWith('edge://')
    || u.startsWith('about:')
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname
  }
  catch {
    return ''
  }
}

async function getConfig() {
  return await chrome.storage.local.get([
    'apiBase', 'appToken', 'providerId', 'profileId', 'bridgeToken', 'autoPair', 'lastPairAt',
  ])
}

function isLocalHub(apiBase) {
  const b = String(apiBase || DEFAULT_API_BASE)
  return /localhost|127\.0\.0\.1/.test(b)
}

async function tryAutoPair(force = false) {
  const config = await getConfig()
  if (config.autoPair === false)
    return { ok: false, skipped: 'auto_pair_disabled' }
  if (!force && config.bridgeToken && config.profileId && config.lastPairAt) {
    const age = Date.now() - Number(config.lastPairAt || 0)
    if (age < 30_000)
      return { ok: true, skipped: 'fresh', config }
  }

  for (const url of PAIR_URLS) {
    try {
      const res = await fetch(`${url}?profileId=${encodeURIComponent(config.profileId || 'primary')}`, {
        cache: 'no-store',
      })
      if (!res.ok)
        continue
      const json = await res.json()
      const data = json?.data || json
      if (!data?.paired || !data?.bridgeToken)
        continue
      const next = {
        apiBase: data.apiBase || DEFAULT_API_BASE,
        profileId: data.profileId || 'primary',
        bridgeToken: data.bridgeToken,
        providerId: data.providerId || 'extension-bridge',
        lastPairAt: Date.now(),
        autoPair: true,
      }
      await chrome.storage.local.set(next)
      return { ok: true, paired: true, source: data.source || 'hub', config: next }
    }
    catch {
      // try next
    }
  }
  return { ok: false, paired: false, error: 'hub_unreachable_or_unpaired' }
}

async function heartbeat(status = 'online', extra = {}) {
  await tryAutoPair(false)
  const config = await getConfig()
  if (!config.profileId || !config.bridgeToken) {
    const pair = await tryAutoPair(true)
    if (!pair.ok)
      return { ok: false, skipped: 'missing_config', pair }
  }
  const cfg = await getConfig()
  if (!cfg.profileId || !cfg.bridgeToken)
    return { ok: false, skipped: 'missing_config' }
  if (!cfg.appToken && !isLocalHub(cfg.apiBase))
    return { ok: false, skipped: 'missing_token' }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const headers = { 'Content-Type': 'application/json' }
  if (cfg.appToken)
    headers.Authorization = `Bearer ${cfg.appToken}`
  try {
    const response = await fetch(`${cfg.apiBase || DEFAULT_API_BASE}/ai/providers/extension/bridge/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        providerId: cfg.providerId || 'extension-bridge',
        profileId: cfg.profileId,
        bridgeToken: cfg.bridgeToken,
        status,
        url: tab?.url || extra.url || '',
        error: extra.error || '',
        runnerVersion: BRIDGE_RUNNER_VERSION,
      }),
    })
    const json = await response.json().catch(() => ({ ok: false, error: 'invalid_json' }))
    if (json?.data?.error === 'invalid_bridge_token' || json?.error === 'invalid_bridge_token') {
      await chrome.storage.local.remove(['bridgeToken', 'lastPairAt'])
      await tryAutoPair(true)
    }
    return json
  }
  catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

async function apiPost(path, body) {
  await tryAutoPair(false)
  const config = await getConfig()
  if (!config.profileId || !config.bridgeToken)
    return { ok: false, skipped: 'missing_config' }
  if (!config.appToken && !isLocalHub(config.apiBase))
    return { ok: false, skipped: 'missing_token' }
  const headers = { 'Content-Type': 'application/json' }
  if (config.appToken)
    headers.Authorization = `Bearer ${config.appToken}`
  const response = await fetch(`${config.apiBase || DEFAULT_API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providerId: config.providerId || 'extension-bridge',
      profileId: config.profileId,
      bridgeToken: config.bridgeToken,
      ...body,
    }),
  })
  return await response.json().catch(() => ({ ok: false, error: 'invalid_json' }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.min(Math.max(0, Number(ms) || 0), 60_000)))
}

async function waitTabComplete(tabId, timeoutMs = 25_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (!tab)
      throw new Error('tab_closed')
    if (tab.status === 'complete' && tab.url && !isRestrictedUrl(tab.url))
      return tab
    // about:blank complete is not useful
    if (tab.status === 'complete' && tab.url && tab.url.startsWith('http'))
      return tab
    await sleep(250)
  }
  return await chrome.tabs.get(tabId)
}

/**
 * Pick or open a page tab suitable for job steps.
 * Prefer settings.startUrl / assert_host expected host — never stuck on about:blank.
 */
async function ensureJobTab(settings = {}, steps = []) {
  const startUrl = String(settings.startUrl || settings.url || '').trim()
  const hostStep = (steps || []).find(s => (s?.type || s?.action) === 'assert_host')
  const expectedHost = String(hostStep?.expectedHost || settings.expectedHost || '').trim()

  const all = await chrome.tabs.query({})
  const httpTabs = all.filter(t => t.id && t.url && t.url.startsWith('http') && !isRestrictedUrl(t.url))

  let tab = null
  if (expectedHost) {
    tab = httpTabs.find(t => hostFromUrl(t.url).includes(expectedHost)) || null
  }
  if (!tab && startUrl) {
    try {
      const startHost = hostFromUrl(startUrl)
      tab = httpTabs.find(t => startHost && hostFromUrl(t.url).includes(startHost)) || null
    }
    catch { /* ignore */ }
  }
  if (!tab) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (active?.id && active.url && !isRestrictedUrl(active.url) && active.url.startsWith('http'))
      tab = active
  }

  if (!tab && startUrl) {
    tab = await chrome.tabs.create({ url: startUrl, active: true })
    tab = await waitTabComplete(tab.id)
    return tab
  }

  if (!tab) {
    // Last resort: open about:blank then navigate if we have startUrl later
    tab = await chrome.tabs.create({ url: startUrl || 'https://grok.com/', active: true })
    tab = await waitTabComplete(tab.id)
  }

  return tab
}

async function navigateTab(tabId, url) {
  await chrome.tabs.update(tabId, { url, active: true })
  return await waitTabComplete(tabId)
}

/** Steps that never need a content-script receiver. */
async function runBackgroundStep(step, tab) {
  const type = step?.type || step?.action
  if (type === 'wait') {
    await sleep(step.ms || 500)
    return { ok: true, waitedMs: step.ms || 500, via: 'background' }
  }
  if (type === 'manual_checkpoint') {
    return {
      ok: true,
      checkpoint: true,
      message: step.text || 'Manual takeover required',
      via: 'background',
      tabUrl: tab?.url || '',
    }
  }
  if (type === 'navigate' || type === 'open_url') {
    const url = String(step.url || step.href || '').trim()
    if (!url)
      throw new Error('navigate_url_required')
    const next = await navigateTab(tab.id, url)
    return { ok: true, navigated: url, tabUrl: next.url, via: 'background' }
  }
  if (type === 'assert_host') {
    const expected = String(step.expectedHost || '').trim()
    const host = hostFromUrl(tab?.url || '')
    if (expected && !host.includes(expected)) {
      // Try startUrl-style recovery if tab is wrong
      throw new Error(`wrong_host:${host || 'empty'}:expected:${expected}`)
    }
    return { ok: true, host, via: 'background' }
  }
  if (type === 'ping' || type === 'noop') {
    return { ok: true, ping: true, via: 'background' }
  }
  return null // not a background-only step
}

async function ensureContentScript(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab || isRestrictedUrl(tab.url))
    throw new Error(`cannot_inject_content:${tab?.url || 'no_tab'}`)

  // Ping existing receiver first
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { type: 'ping' })
    if (pong?.ok || pong?.pong)
      return true
  }
  catch {
    // inject
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  })
  // small settle
  await sleep(150)
  return true
}

async function runContentStep(tabId, step) {
  await ensureContentScript(tabId)
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'runStep', step })
  }
  catch (e1) {
    // One more inject+retry
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    }).catch(() => undefined)
    await sleep(200)
    return await chrome.tabs.sendMessage(tabId, { type: 'runStep', step })
  }
}

async function runBridgeJob() {
  const next = await apiPost('/ai/providers/extension/bridge/jobs/next', {})
  const job = next?.data?.job
  if (!job)
    return next

  const input = job.input || {}
  const settings = input.settings || {}
  const steps = Array.isArray(input.steps) ? input.steps : []
  const logs = []

  try {
    let tab = await ensureJobTab(settings, steps)

    // If job carries startUrl and current tab is wrong/restricted, navigate first
    if (settings.startUrl && (isRestrictedUrl(tab.url) || (settings.expectedHost && !hostFromUrl(tab.url).includes(String(settings.expectedHost))))) {
      tab = await navigateTab(tab.id, settings.startUrl)
      logs.push({ index: -1, ok: true, result: { preNavigate: settings.startUrl, tabUrl: tab.url } })
    }

    // Empty steps = queue-only smoke: complete OK after tab ready
    if (!steps.length) {
      return await apiPost('/ai/providers/extension/bridge/jobs/complete', {
        jobId: job.id,
        ok: true,
        logs: [{ ok: true, result: { emptySteps: true, tabUrl: tab.url } }],
        artifacts: [],
        result: { tabUrl: tab.url, note: 'empty steps completed by bridge SW' },
      })
    }

    for (const [index, step] of steps.entries()) {
      // Refresh tab snapshot
      tab = await chrome.tabs.get(tab.id).catch(() => tab)

      // If assert_host will fail, try navigating to startUrl once
      const type = step?.type || step?.action
      if (type === 'assert_host' && settings.startUrl) {
        const expected = String(step.expectedHost || '')
        const host = hostFromUrl(tab.url || '')
        if (expected && !host.includes(expected)) {
          tab = await navigateTab(tab.id, settings.startUrl)
          logs.push({ index, phase: 'auto_navigate', ok: true, result: { to: settings.startUrl, host: hostFromUrl(tab.url) } })
        }
      }

      let result = await runBackgroundStep(step, tab)
      if (!result) {
        // DOM / content-script steps
        if (isRestrictedUrl(tab.url)) {
          if (settings.startUrl) {
            tab = await navigateTab(tab.id, settings.startUrl)
          }
          else {
            throw new Error(`restricted_tab_no_content:${tab.url || 'empty'}`)
          }
        }
        result = await runContentStep(tab.id, step)
      }

      const ok = result?.ok !== false && !result?.error
      logs.push({ index, ok, result, stepType: type })
      if (!ok)
        throw new Error(result?.error || 'step_failed')
    }

    return await apiPost('/ai/providers/extension/bridge/jobs/complete', {
      jobId: job.id,
      ok: true,
      logs,
      artifacts: [],
      result: {
        tabUrl: (await chrome.tabs.get(tab.id).catch(() => tab))?.url,
        steps: steps.length,
        runner: 'socialops-bridge-ext',
      },
    })
  }
  catch (error) {
    return await apiPost('/ai/providers/extension/bridge/jobs/complete', {
      jobId: job.id,
      ok: false,
      logs,
      error: String(error?.message || error),
    })
  }
}

// ── lifecycle ──────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ apiBase: DEFAULT_API_BASE, autoPair: true, profileId: 'primary' })
  tryAutoPair(true).catch(() => undefined)
  startJobPollLoop()
})

chrome.runtime.onStartup?.addListener?.(() => {
  tryAutoPair(true).catch(() => undefined)
  startJobPollLoop()
})

chrome.alarms?.create?.('socialops-heartbeat', { periodInMinutes: 1 })
chrome.alarms?.create?.('socialops-pair', { periodInMinutes: 0.5 })
chrome.alarms?.create?.('socialops-jobs', { periodInMinutes: 1 })
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'socialops-heartbeat')
    heartbeat('online').catch(() => undefined)
  if (alarm.name === 'socialops-pair')
    tryAutoPair(false).catch(() => undefined)
  if (alarm.name === 'socialops-jobs')
    runBridgeJob().catch(() => undefined)
})

/** Aggressive poll while SW is awake (alarms alone are too coarse for e2e). */
let jobPollTimer = null
function startJobPollLoop() {
  if (jobPollTimer)
    return
  jobPollTimer = setInterval(() => {
    runBridgeJob().catch(() => undefined)
  }, 8_000)
  // Kick immediately
  tryAutoPair(true).then(() => runBridgeJob()).catch(() => undefined)
  heartbeat('online').catch(() => undefined)
}
startJobPollLoop()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (message?.type === 'pair')
      return await tryAutoPair(true)
    if (message?.type === 'heartbeat')
      return await heartbeat(message.status || 'online')
    if (message?.type === 'runBridgeJob')
      return await runBridgeJob()
    if (message?.type === 'getConfig')
      return await getConfig()
    if (message?.type === 'capture') {
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
      return { ok: true, dataUrl }
    }
    if (message?.type === 'runStep' && sender.tab?.id) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        func: step => window.__socialOpsRunStep?.(step),
        args: [message.step],
      })
      return { ok: true, result: result?.result }
    }
    return { ok: false, error: 'unknown_message' }
  })().then(sendResponse).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }))
  return true
})
