const port = Number(process.argv[2] || 9480)
const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())
const page = list.find(t => t.type === 'page' && /labs\.google.*project/i.test(t.url || ''))
  || list.find(t => t.type === 'page' && /labs\.google/i.test(t.url || ''))
if (!page) { console.log(JSON.stringify({ error: 'no flow page', tabs: list.filter(t=>t.type==='page').map(t=>({title:t.title,url:t.url?.slice(0,80)})) })); process.exit(1) }
const ver = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json())
const ws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); setTimeout(() => rej(new Error('to')), 10000) })
let id = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.rej(new Error(m.error.message || 'e')) : p.res(m.result)
  }
}
const send = (method, params, sessionId) => new Promise((res, rej) => {
  const mid = id++
  pending.set(mid, { res, rej })
  ws.send(JSON.stringify({ id: mid, method, params, sessionId }))
  setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error(method)) } }, 60000)
})
const { sessionId } = await send('Target.attachToTarget', { targetId: page.id, flatten: true })
await send('Runtime.enable', {}, sessionId)
const expr = `(() => {
  const text = (document.body && document.body.innerText || '').slice(0, 2500);
  const videos = [...document.querySelectorAll('video')].map(v => ({
    src: (v.currentSrc || v.src || '').slice(0, 140),
    ready: v.readyState, w: v.videoWidth, h: v.videoHeight, dur: v.duration
  }));
  const tiles = document.querySelectorAll('[data-tile-id]').length;
  const blocked = /unusual activity|hoạt động bất thường/i.test(text);
  const generating = /đang tạo|generating|processing|queued|in progress|đang xử lý|Creating|đang gen/i.test(text);
  const btns = [...document.querySelectorAll('button')].map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 30);
  return {
    url: location.href, title: document.title, tiles, videos, blocked, generating, btns,
    textSnippet: text.replace(/\\s+/g, ' ').slice(0, 900)
  };
})()`
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)
console.log(JSON.stringify({ port, pageUrl: page.url, pageTitle: page.title, state: r.result?.value ?? r }, null, 2))
ws.close()
