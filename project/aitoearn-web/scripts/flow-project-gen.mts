async function main() {
  const projectId = '45d77752-af90-42ac-bded-7b84e77ad353'
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  let page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('labs.google'))
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
    setTimeout(() => reject(new Error('timeout ' + method)), 30000)
  })
  const evalV = async (expression: string) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r?.result?.result?.value ?? r?.result?.value
  }
  await send('Runtime.enable')
  await send('Page.enable')

  // Navigate to project root (not characters)
  await send('Page.navigate', { url: `https://labs.google/fx/tools/flow/project/${projectId}` })
  await new Promise(r => setTimeout(r, 6000))

  let snap = await evalV(`JSON.stringify({
    url: location.href,
    text: (document.body?.innerText||'').slice(0,800),
    boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length,
    files: document.querySelectorAll('input[type=file]').length,
    buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,40)
  })`)
  console.log('PROJECT', snap)

  // Try EN URL if still not good
  const parsed = typeof snap === 'string' ? JSON.parse(snap) : snap
  if (!parsed || parsed.boxes < 1) {
    await send('Page.navigate', { url: `https://labs.google/fx/vi/tools/flow/project/${projectId}` })
    await new Promise(r => setTimeout(r, 6000))
    snap = await evalV(`JSON.stringify({
      url: location.href,
      text: (document.body?.innerText||'').slice(0,800),
      boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length,
      files: document.querySelectorAll('input[type=file]').length,
      buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,40)
    })`)
    console.log('PROJECT_VI', snap)
  }

  // Type prompt + submit
  const typed = await evalV(`(() => {
    const boxes = [...document.querySelectorAll('[role=textbox], textarea, [contenteditable=true]')]
    const box = boxes[boxes.length-1] || boxes[0]
    if (!box) return { ok:false, error:'no_box' }
    box.focus()
    const prompt = '10s vertical product commercial, terracotta graphic t-shirt spin, soft studio light, photoreal UGC fashion, 9:16'
    if ('value' in box) {
      ;(box as any).value = prompt
      box.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      box.textContent = prompt
      box.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }
    const btns = [...document.querySelectorAll('button')]
    // Prefer arrow_forward create
    let sendBtn = btns.find(b => /arrow_forward/i.test(b.innerHTML||''))
    if (!sendBtn) sendBtn = btns.find(b => /^(Tạo|Generate|Create)$/i.test((b.innerText||'').trim()))
    if (sendBtn) { sendBtn.click(); return { ok:true, submitted:true, btn: (sendBtn.innerText||'').slice(0,30) } }
    return { ok:true, submitted:false, boxes: boxes.length }
  })()`)
  console.log('TYPE', typed)
  await new Promise(r => setTimeout(r, 8000))
  snap = await evalV(`JSON.stringify({
    url: location.href,
    text: (document.body?.innerText||'').slice(0,900),
    boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length,
    files: document.querySelectorAll('input[type=file]').length,
    buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,25)
  })`)
  console.log('AFTER', snap)
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
