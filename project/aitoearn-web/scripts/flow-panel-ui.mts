async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  // open flow pack side panel
  const extId = 'fnmijgmnjpealnnadjpjilaanhhambeb'
  await fetch(`http://127.0.0.1:9480/json/new?${encodeURIComponent('chrome-extension://'+extId+'/src/ui/side-panel/index.html')}`, { method: 'PUT' }).catch(()=>null)
  await new Promise(r => setTimeout(r, 2000))
  const list2 = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const panel = list2.find((t: any) => t.type==='page' && String(t.url||'').includes(extId))
  console.log('panel', panel?.url)
  if (!panel) throw new Error('no panel')
  const ws = new WebSocket(panel.webSocketDebuggerUrl)
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
  const v = (r: any) => r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')
  await new Promise(r => setTimeout(r, 2000))
  const ui = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      text: (document.body?.innerText||'').slice(0,1500),
      buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,40),
      inputs: [...document.querySelectorAll('input,textarea')].map(i=>({type:i.type, ph:i.placeholder, name:i.name})).slice(0,20)
    })`,
    returnByValue: true,
  })
  console.log(v(ui))
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
