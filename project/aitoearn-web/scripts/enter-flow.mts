async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('labs.google'))
  if (!page) throw new Error('no flow tab')
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
    setTimeout(() => reject(new Error('timeout ' + method)), 30000)
  })
  await send('Runtime.enable')
  await send('Page.enable')

  // Click first "Create with Google Flow"
  const click = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button, a')]
      const b = btns.find(el => /Create with Google Flow/i.test(el.innerText||''))
      if (!b) return { ok:false, error:'btn_not_found', texts: btns.map(x=>x.innerText?.trim()).filter(Boolean).slice(0,20) }
      b.click()
      return { ok:true, text: b.innerText?.trim() }
    })()`,
    returnByValue: true,
  })
  console.log('click', JSON.stringify(click.result?.value ?? click))

  await new Promise(r => setTimeout(r, 5000))

  const state = await send('Runtime.evaluate', {
    expression: `(() => {
      const text = (document.body?.innerText||'').slice(0,1000)
      const boxes = [...document.querySelectorAll('[role=textbox], textarea, [contenteditable=true]')].length
      const files = document.querySelectorAll('input[type=file]').length
      const buttons = [...document.querySelectorAll('button')].map(b => (b.innerText||b.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,30)
      const signIn = /sign in|log in|Sign in with Google|Get started/i.test(text)
      return { url: location.href, title: document.title, boxes, files, signIn, buttons, text: text.slice(0,500) }
    })()`,
    returnByValue: true,
  })
  console.log('state', JSON.stringify(state.result?.value ?? state, null, 2))
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
