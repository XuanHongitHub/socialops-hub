const cdp = `http://127.0.0.1:${process.argv[2] || 9483}`
await fetch(`${cdp}/json/new?${encodeURIComponent('chrome://extensions/')}`, { method: 'PUT' })
  .catch(() => fetch(`${cdp}/json/new?${encodeURIComponent('chrome://extensions/')}`))
await new Promise(r => setTimeout(r, 3000))
const list = await fetch(`${cdp}/json/list`).then(r => r.json())
const pages = list.filter(t => t.type === 'page')
console.log('pages', pages.map(p => p.url))
const page = pages.find(t => String(t.url || '').includes('chrome://extensions'))
if (!page) {
  console.log('no extensions page')
  process.exit(1)
}
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
// pierce open shadow roots for extensions manager
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    function deepText(root, depth=0) {
      if (!root || depth > 12) return '';
      let t = root.innerText || '';
      const walk = (n) => {
        if (!n) return;
        if (n.shadowRoot) walk(n.shadowRoot);
        if (n.children) for (const c of n.children) walk(c);
      };
      try { walk(root); } catch {}
      // also collect from all open shadow roots via elements
      const all = [];
      const visit = (node) => {
        if (!node || depth > 20) return;
        if (node.innerText) all.push(node.innerText.slice(0,200));
        if (node.shadowRoot) visit(node.shadowRoot);
        if (node.children) for (const c of [...node.children]) visit(c);
      };
      visit(document.body);
      return all.join('\\n---\\n').slice(0,4000);
    }
    return {
      title: document.title,
      plain: (document.body?.innerText||'').slice(0,500),
      deep: deepText(document.body).slice(0,3500),
    };
  })()`,
  returnByValue: true,
}, sessionId)
console.log(JSON.stringify(r?.result?.value || r, null, 2))
ws.close()
