const port = Number(process.argv[2] || 9483)
const cdp = `http://127.0.0.1:${port}`
const list = await fetch(`${cdp}/json/list`).then(r => r.json())
const page = list.find(t => t.type === 'page' && /labs\.google/.test(t.url || ''))
if (!page) throw new Error('no page')
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
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const text = (document.body?.innerText || '').slice(0, 2000);
    const labels = [...document.querySelectorAll('button,[role=button],[role=tab],span,div')]
      .map(e => (e.innerText || '').replace(/\\s+/g,' ').trim())
      .filter(t => t && t.length > 0 && t.length < 60);
    const uniq = [...new Set(labels)].slice(0, 100);
    // mode-ish
    const modeHits = uniq.filter(t => /video|hình|veo|text|image|ảnh|chế độ|mode|tạo|generate|6s|10s|9:16|16:9/i.test(t));
    return { url: location.href, modeHits, uniq, text };
  })()`,
  returnByValue: true,
}, sessionId)
console.log(JSON.stringify(r?.result?.value || r, null, 2))
ws.close()
