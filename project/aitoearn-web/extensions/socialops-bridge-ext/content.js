/**
 * SocialOps bridge content script.
 * CRITICAL: never touch Cloudflare / bot-challenge pages — content injection
 * breaks Turnstile even for manual human solving (infinite "Verifying...").
 */

function isCloudflareChallengePage() {
  try {
    const t = (document.title || '').toLowerCase()
    const body = (document.body && (document.body.innerText || document.body.textContent)) || ''
    const b = String(body).slice(0, 2000).toLowerCase()
    if (t.includes('just a moment') || t.includes('attention required') || t.includes('security verification'))
      return true
    if (b.includes('performing security verification') || b.includes('checking your browser') || b.includes('verify you are human'))
      return true
    if (b.includes('cf-browser-verification') || b.includes('cf-challenge') || b.includes('turnstile'))
      return true
    // Challenge DOM
    if (document.querySelector('#challenge-form, #challenge-running, #cf-challenge-running, .cf-browser-verification, iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]'))
      return true
    if (location.hostname.includes('challenges.cloudflare.com'))
      return true
  }
  catch { /* ignore */ }
  return false
}

// Bail out entirely on CF / bot walls — do not send heartbeat or register listeners
if (isCloudflareChallengePage()) {
  // no-op
}
else {
  function pick(selector) {
    if (!selector)
      throw new Error('selector_required')
    const element = document.querySelector(selector)
    if (!element)
      throw new Error('selector_not_found')
    return element
  }

  window.__socialOpsRunStep = async function runStep(step) {
    if (isCloudflareChallengePage())
      return { ok: false, error: 'cloudflare_challenge_page' }
    const type = step?.type || step?.action
    if (type === 'assert_host') {
      const expected = step.expectedHost || ''
      if (expected && !location.hostname.includes(expected))
        throw new Error(`wrong_host:${location.hostname}`)
      return { ok: true, host: location.hostname }
    }
    if (type === 'click') {
      pick(step.selector).click()
      return { ok: true, clicked: step.selector }
    }
    if (type === 'type') {
      const element = pick(step.selector)
      element.focus()
      element.value = step.text || ''
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true, typed: step.selector }
    }
    if (type === 'wait') {
      await new Promise(resolve => setTimeout(resolve, Math.min(Number(step.ms || 500), 30000)))
      return { ok: true, waitedMs: step.ms || 500 }
    }
    if (type === 'read') {
      return { ok: true, text: pick(step.selector).textContent?.slice(0, 2000) || '' }
    }
    if (type === 'manual_checkpoint') {
      return { ok: true, checkpoint: true, message: step.text || 'Manual takeover required' }
    }
    throw new Error(`unsupported_step:${type}`)
  }

  chrome.runtime.sendMessage({ type: 'heartbeat', status: 'online' }).catch(() => undefined)

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    ;(async () => {
      if (isCloudflareChallengePage())
        return { ok: false, error: 'cloudflare_challenge_page' }
      if (message?.type === 'ping')
        return { ok: true, pong: true, host: location.hostname }
      if (message?.type === 'runStep') {
        const result = await window.__socialOpsRunStep(message.step)
        return { ok: true, ...result }
      }
      return { ok: false, error: 'unknown_message' }
    })()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }))
    return true
  })
}
