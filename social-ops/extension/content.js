function pick(selector) {
  if (!selector) throw new Error('selector_required')
  const element = document.querySelector(selector)
  if (!element) throw new Error('selector_not_found')
  return element
}

window.__socialOpsRunStep = async function runStep(step) {
  const type = step?.type || step?.action
  if (type === 'assert_host') {
    const expected = step.expectedHost || ''
    if (expected && !location.hostname.includes(expected)) throw new Error(`wrong_host:${location.hostname}`)
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
