/**
 * Explore Flow UI by clicking candidate controls and dumping state.
 * port as argv[2]
 */
const port = Number(process.argv[2] || 9483)
const cdp = `http://127.0.0.1:${port}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

const list = await fetch(`${cdp}/json/list`).then(r => r.json())
const page = list.find(t => t.type === 'page' && /labs\.google/.test(t.url || ''))
if (!page)
  throw new Error('no page')
const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
const ws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = () => rej(new Error('ws'))
  setTimeout(() => rej(new Error('to')), 8000)
})
let id = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)
    pending.delete(m.id)
    m.error ? p.rej(m.error) : p.res(m.result)
  }
}
const send = (method, params, sessionId) => new Promise((res, rej) => {
  const mid = id++
  pending.set(mid, { res, rej })
  ws.send(JSON.stringify({ id: mid, method, params, sessionId }))
  setTimeout(() => {
    if (pending.has(mid)) {
      pending.delete(mid)
      rej(new Error(method))
    }
  }, 20000)
})
const { sessionId } = await send('Target.attachToTarget', { targetId: page.id, flatten: true })
await send('Runtime.enable', {}, sessionId)
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  return r?.result?.value ?? r
}

// Click add media and list resulting menu
const afterAdd = await evalJs(`(() => {
  const els = [...document.querySelectorAll('button,[role=button]')];
  const b = els.find(e => /Thêm nội dung nghe nhìn|Add media|add\\n/i.test(e.innerText||''));
  if (b) b.click();
  return !!b;
})()`)
await sleep(1500)
const menu = await evalJs(`(() => {
  const labels = [...document.querySelectorAll('button,[role=menuitem],[role=option],li,div[role=button],span')]
    .map(e => (e.innerText||'').replace(/\\s+/g,' ').trim())
    .filter(t => t && t.length < 80);
  return [...new Set(labels)].filter(t => /video|text|hình|ảnh|veo|tạo|from|prompt|scene|cảnh|image|frame/i.test(t)).slice(0,40);
})()`)
console.log(JSON.stringify({ afterAdd, menu }, null, 2))

// Try open tune settings
await evalJs(`(() => {
  const els = [...document.querySelectorAll('button')];
  const b = els.find(e => /tune|Cài đặt/i.test(e.innerText||'') && !/chế độ xem/i.test(e.innerText||''));
  if (b) b.click();
  return !!(b && (b.innerText||'').slice(0,40));
})()`)
await sleep(1200)
const settings = await evalJs(`(() => {
  const labels = [...document.querySelectorAll('button,[role=menuitem],[role=option],label,span,div')]
    .map(e => (e.innerText||'').replace(/\\s+/g,' ').trim())
    .filter(t => t && t.length < 60);
  return [...new Set(labels)].filter(t => /veo|6s|10s|9:16|16:9|text|video|model|chất lượng|landscape|portrait|lite|quality/i.test(t)).slice(0,50);
})()`)
console.log(JSON.stringify({ settings }, null, 2))

const body = await evalJs(`(document.body?.innerText||'').slice(0,1200)`)
console.log('BODY_SNIP', body)
ws.close()
