const fields = ['apiBase', 'appToken', 'providerId', 'profileId', 'bridgeToken']
const out = document.getElementById('out')
const statusEl = document.getElementById('status')

function setStatus(text, ok = true) {
  statusEl.textContent = text
  statusEl.className = ok ? 'status' : 'status bad'
}

async function loadFields() {
  const config = await chrome.storage.local.get([...fields, 'lastPairAt', 'autoPair'])
  for (const field of fields) {
    const node = document.getElementById(field)
    if (!node)
      continue
    if (field === 'apiBase')
      node.value = config.apiBase || 'http://127.0.0.1:6061/api'
    else if (field === 'providerId')
      node.value = config.providerId || 'extension-bridge'
    else if (field === 'profileId')
      node.value = config.profileId || 'primary'
    else
      node.value = config[field] || ''
  }
  if (config.bridgeToken) {
    setStatus(`Paired · profile ${config.profileId || 'primary'} · token …${String(config.bridgeToken).slice(-6)}`)
  }
  else {
    setStatus('Not paired — click Pair with Hub', false)
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const config = Object.fromEntries(fields.map(field => [field, document.getElementById(field).value.trim()]))
  config.autoPair = true
  await chrome.storage.local.set(config)
  out.textContent = 'saved'
  setStatus('Saved local config')
})

document.getElementById('pair').addEventListener('click', async () => {
  out.textContent = 'pairing…'
  const response = await chrome.runtime.sendMessage({ type: 'pair' })
  out.textContent = JSON.stringify(response, (k, v) => (String(k).toLowerCase().includes('token') ? '<redacted>' : v), 2)
  await loadFields()
  if (response?.ok && response?.paired)
    setStatus('Paired with Hub')
  else
    setStatus(response?.error || 'Pair failed — is SocialOps on :6061?', false)
})

document.getElementById('beat').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'heartbeat', status: 'online' })
  out.textContent = JSON.stringify(response, (k, v) => (String(k).toLowerCase().includes('token') ? '<redacted>' : v), 2)
})

document.getElementById('job').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'runBridgeJob' })
  out.textContent = JSON.stringify(response, (k, v) => (String(k).toLowerCase().includes('token') ? '<redacted>' : v), 2)
})

loadFields().then(() => chrome.runtime.sendMessage({ type: 'pair' }).then(loadFields).catch(() => undefined))
