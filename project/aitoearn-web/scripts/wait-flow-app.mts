async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  for (const t of list.filter((x:any)=>x.type==='page')) {
    console.log('PAGE', (t.url||'').slice(0,100), '|', (t.title||'').slice(0,40))
  }
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('labs.google'))
  if (!page) throw new Error('no flow')
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
  // wait up to 30s for app UI
  for (let n=0;n<6;n++) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const text = (document.body?.innerText||'').slice(0,600)
        const boxes = [...document.querySelectorAll('[role=textbox], textarea, [contenteditable=true]')]
        const files = document.querySelectorAll('input[type=file]').length
        const buttons = [...document.querySelectorAll('button')].map(b => (b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,25)
        const loading = /Loading/i.test(text)
        const signIn = /sign in|Sign in with Google/i.test(text)
        return { url: location.href, boxes: boxes.length, files, loading, signIn, buttons, text: text.slice(0,350) }
      })()`,
      returnByValue: true,
    })
    const v = r.result?.value
    console.log('try', n, JSON.stringify(v))
    if (v && !v.loading && (v.boxes > 0 || v.files > 0 || v.signIn || (v.buttons||[]).length > 3)) break
    await new Promise(r => setTimeout(r, 5000))
  }
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
