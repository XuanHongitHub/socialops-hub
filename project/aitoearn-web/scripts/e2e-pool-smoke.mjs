/**
 * Smoke e2e against live pool seats (chatgpt-1..4).
 * Usage: node scripts/e2e-pool-smoke.mjs [port=9480]
 */
const port = Number(process.argv[2] || 9480)
const cdp = `http://127.0.0.1:${port}`

async function sleep(ms) {
  await new Promise(r => setTimeout(r, ms))
}

async function cdpSession(pageId) {
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('ws fail'))
    setTimeout(() => rej(new Error('ws timeout')), 8000)
  })
  let id = 1
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.rej(new Error(msg.error.message || 'cdp')) : p.res(msg.result)
    }
  }
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const mid = id++
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }))
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid)
        rej(new Error(`timeout ${method}`))
      }
    }, 20000)
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId: pageId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId).catch(() => null)
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    return r?.result?.value ?? r?.value ?? r
  }
  return { ws, send, sessionId, evalJs }
}

async function ensurePage(urlHint, navigateUrl) {
  let list = await fetch(`${cdp}/json/list`).then(r => r.json())
  let page = list.find(t => t.type === 'page' && String(t.url || '').includes(urlHint))
  if (!page) {
    await fetch(`${cdp}/json/new?${encodeURIComponent(navigateUrl)}`, { method: 'PUT' }).catch(() =>
      fetch(`${cdp}/json/new?${encodeURIComponent(navigateUrl)}`),
    )
    await sleep(2500)
    list = await fetch(`${cdp}/json/list`).then(r => r.json())
    page = list.find(t => t.type === 'page' && String(t.url || '').includes(urlHint))
      || list.find(t => t.type === 'page')
  }
  return page
}

async function smokeChatgpt() {
  console.log('\n--- ChatGPT smoke ---')
  const page = await ensurePage('chatgpt.com', 'https://chatgpt.com/')
  if (!page?.id)
    return { ok: false, error: 'no_page' }
  const { ws, send, sessionId, evalJs } = await cdpSession(page.id)
  try {
    await send('Page.navigate', { url: 'https://chatgpt.com/' }, sessionId)
    await sleep(4000)
    const state = await evalJs(`(() => {
      const t = (document.body?.innerText||'').slice(0,400);
      const u = location.href;
      const login = /log in|sign up|đăng nhập/i.test(t) && !/new chat|composer|message chatgpt/i.test(t);
      const boxes = document.querySelectorAll('#prompt-textarea, [contenteditable=true], textarea').length;
      return { u, login, boxes, t: t.slice(0,180) };
    })()`)
    console.log(JSON.stringify(state, null, 2))
    if (state?.login)
      return { ok: false, phase: 'needs_login', ...state }
    if (!state?.boxes)
      return { ok: false, phase: 'no_composer', ...state }
    return { ok: true, phase: 'chatgpt_ready', ...state }
  }
  finally {
    ws.close()
  }
}

async function smokeFlow() {
  console.log('\n--- Flow smoke ---')
  const page = await ensurePage('labs.google', 'https://labs.google/fx/tools/flow')
  if (!page?.id)
    return { ok: false, error: 'no_page' }
  const { ws, send, sessionId, evalJs } = await cdpSession(page.id)
  try {
    await send('Page.navigate', { url: 'https://labs.google/fx/tools/flow' }, sessionId)
    await sleep(4500)
    const state = await evalJs(`(() => {
      const t = (document.body?.innerText||'').slice(0,500);
      const u = location.href;
      const login = /sign in|accounts\\.google|đăng nhập/i.test(t+u) && !/Create with Google Flow|Tạo với|project/i.test(t);
      const create = /Create with Google Flow|Tạo với Google Flow|Create a project|Tạo một dự án|What do you want|Bạn muốn tạo/i.test(t);
      const boxes = document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length;
      return { u, login, create, boxes, t: t.slice(0,200) };
    })()`)
    console.log(JSON.stringify(state, null, 2))
    if (state?.login)
      return { ok: false, phase: 'needs_login', ...state }
    return {
      ok: Boolean(state?.create || state?.boxes || /project/i.test(state?.u || '')),
      phase: state?.create ? 'flow_landing_ok' : (state?.boxes ? 'flow_has_composer' : 'flow_unknown'),
      ...state,
    }
  }
  finally {
    ws.close()
  }
}

async function main() {
  console.log('CDP', cdp)
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json()).catch(e => ({ error: String(e) }))
  if (ver.error) {
    console.error('CDP offline', ver)
    process.exit(2)
  }
  console.log('Browser', ver.Browser)
  const chat = await smokeChatgpt()
  const flow = await smokeFlow()
  const summary = { port, chatgpt: chat, flow }
  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
  const ok = chat.ok && flow.ok
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
