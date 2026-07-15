async function main() {
  const base = 'http://127.0.0.1:9480'
  const url = 'chrome-extension://fnmijgmnjpealnnadjpjilaanhhambeb/src/ui/side-panel/index.html'
  await fetch(base + '/json/new?' + encodeURIComponent(url), { method: 'PUT' }).catch(() => null)
  await new Promise(r => setTimeout(r, 3000))
  const list = await (await fetch(base + '/json/list')).json()
  const page = list.find((t: any) => String(t.url||'').includes('fnmijgmnjpealnnadjpjilaanhhambeb'))
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
    setTimeout(() => reject(new Error('timeout ' + method)), 15000)
  })
  await send('Runtime.enable')
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      title: document.title,
      chromeType: typeof chrome,
      chromeKeys: typeof chrome !== 'undefined' ? Object.keys(chrome).slice(0, 30) : [],
      storage: typeof chrome !== 'undefined' && chrome.storage ? Object.keys(chrome.storage) : null,
      body: (document.body?.innerText||'').slice(0,200)
    })`,
    returnByValue: true,
  })
  console.log(r?.result?.result?.value ?? r?.result?.value ?? r)
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
