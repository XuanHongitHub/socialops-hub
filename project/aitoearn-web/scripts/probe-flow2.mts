async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('labs.google'))
  console.log('page', page?.url, page?.title)
  if (!page) throw new Error('no page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('ws')); setTimeout(() => rej(new Error('to')), 8000) })
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
  await send('DOM.enable')
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText||'').slice(0,800),
      htmlLen: document.body?.innerHTML?.length||0,
      boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length,
      files: document.querySelectorAll('input[type=file]').length,
      buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,40),
      links: [...document.querySelectorAll('a')].map(a=>a.href).filter(h=>h.includes('flow')||h.includes('accounts.google')).slice(0,10)
    })`,
    returnByValue: true,
  })
  // dump full response
  console.log(JSON.stringify(r, null, 2).slice(0, 3000))
  const val = r?.result?.result?.value ?? r?.result?.value
  if (typeof val === 'string') console.log('PARSED', val.slice(0, 2000))
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
