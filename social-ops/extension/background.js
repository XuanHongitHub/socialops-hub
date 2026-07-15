const DEFAULT_API_BASE = 'http://127.0.0.1:6061/api'
const PAIR_URLS = [
  'http://127.0.0.1:6061/api/ai/providers/extension/bridge/pair-config',
  'http://localhost:6061/api/ai/providers/extension/bridge/pair-config',
]

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
      }),
    })
    const json = await response.json().catch(() => ({ ok: false, error: 'invalid_json' }))
    // Token rejected → re-pair
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

async function runBridgeJob() {
  const next = await apiPost('/ai/providers/extension/bridge/jobs/next', {})
  const job = next?.data?.job
  if (!job)
    return next
  const input = job.input || {}
  const logs = []
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id)
      throw new Error('no_active_tab')
    for (const [index, step] of (input.steps || []).entries()) {
      let result
      try {
        result = await chrome.tabs.sendMessage(tab.id, { type: 'runStep', step })
      }
      catch {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        }).catch(() => undefined)
        result = await chrome.tabs.sendMessage(tab.id, { type: 'runStep', step })
      }
      logs.push({ index, ok: Boolean(result?.ok), result })
      if (!result?.ok)
        throw new Error(result?.error || 'step_failed')
    }
    return await apiPost('/ai/providers/extension/bridge/jobs/complete', {
      jobId: job.id,
      ok: true,
      logs,
      artifacts: [],
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ apiBase: DEFAULT_API_BASE, autoPair: true, profileId: 'primary' })
  tryAutoPair(true).catch(() => undefined)
})

chrome.runtime.onStartup?.addListener?.(() => {
  tryAutoPair(true).catch(() => undefined)
})

chrome.alarms?.create?.('socialops-heartbeat', { periodInMinutes: 1 })
chrome.alarms?.create?.('socialops-pair', { periodInMinutes: 0.5 })
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'socialops-heartbeat')
    heartbeat('online').catch(() => undefined)
  if (alarm.name === 'socialops-pair')
    tryAutoPair(false).catch(() => undefined)
})

// Job poll loop when paired (every 15s via alarm is coarse — use 0.25 min if allowed; MV3 min is 1 min sometimes)
chrome.alarms?.create?.('socialops-jobs', { periodInMinutes: 1 })
chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'socialops-jobs')
    runBridgeJob().catch(() => undefined)
})

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
