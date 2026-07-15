async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('labs.google'))
  if (!page) { console.log('NO_FLOW_TAB'); process.exit(1) }
  console.log('tab', page.url)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws')); setTimeout(() => rej(new Error('to')), 5000) })
  let id = 1
  const pending = new Map<number, (v: any) => void>()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)!(msg); pending.delete(msg.id) }
  }
  const send = (method: string, params: any = {}) => new Promise<any>((resolve, reject) => {
    const i = id++
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
    setTimeout(() => reject(new Error('timeout ' + method)), 20000)
  })
  await send('Runtime.enable')
  const expr = `(() => {
    const text = (document.body?.innerText || '').slice(0, 800)
    const boxes = [...document.querySelectorAll('[role=textbox], textarea, [contenteditable=true]')]
      .map(el => ({ tag: el.tagName, role: el.getAttribute('role'), ph: el.getAttribute('placeholder')||el.getAttribute('aria-label')||'', text: (el.textContent||'').slice(0,40) }))
    const buttons = [...document.querySelectorAll('button')].map(b => (b.innerText||b.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0, 25)
    const files = document.querySelectorAll('input[type=file]').length
    const imgs = [...document.querySelectorAll('img')].slice(0,5).map(i => i.src?.slice(0,80))
    return { url: location.href, title: document.title, files, boxes, buttons, text: text.slice(0,400), imgs }
  })()`
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
  console.log(JSON.stringify(r.result?.value ?? r.result ?? r, null, 2))
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
