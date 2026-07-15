async function cdpEval(wsSend: any, expr: string) {
  const r = await wsSend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r?.result?.result?.value ?? r?.result?.value
}

async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('labs.google'))
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
  await send('Runtime.enable')
  await send('Page.enable')

  // Click create project / get started (VI or EN)
  const clickRes = await cdpEval(send, `(() => {
    const candidates = [...document.querySelectorAll('button, a, [role=button], div[role=button]')]
    const want = /Tạo một dự án|Create a project|Get started|New project|Create project|add_2/i
    const el = candidates.find(e => want.test((e.innerText||e.getAttribute('aria-label')||'')))
    if (!el) {
      // try material icon create
      const icons = candidates.filter(e => /add_2|add/.test(e.innerHTML||''))
      if (icons[0]) { icons[0].click(); return { ok:true, via:'icon', text: icons[0].innerText }
      }
      return { ok:false, sample: candidates.map(e=>(e.innerText||'').trim().slice(0,40)).filter(Boolean).slice(0,30) }
    }
    el.click()
    return { ok:true, text: (el.innerText||'').trim().slice(0,80) }
  })()`)
  console.log('CLICK', clickRes)
  await new Promise(r => setTimeout(r, 4000))

  // Snapshot
  let snap = await cdpEval(send, `JSON.stringify({
    url: location.href,
    text: (document.body?.innerText||'').slice(0,500),
    boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length,
    files: document.querySelectorAll('input[type=file]').length,
    buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,30)
  })`)
  console.log('SNAP1', snap)

  // If still no project editor, try clicking any "New" / create again
  const click2 = await cdpEval(send, `(() => {
    const all = [...document.querySelectorAll('button, a, [role=button]')]
    const el = all.find(e => /New project|Tạo dự án|Create|New|Start|Bắt đầu/i.test((e.innerText||e.getAttribute('aria-label')||'')) && !/Get started|Learn|Try Omni|Help|TV/i.test(e.innerText||''))
    if (!el) return { ok:false }
    el.click(); return { ok:true, text:(el.innerText||'').trim().slice(0,60) }
  })()`)
  console.log('CLICK2', click2)
  await new Promise(r => setTimeout(r, 5000))

  snap = await cdpEval(send, `JSON.stringify({
    url: location.href,
    text: (document.body?.innerText||'').slice(0,600),
    boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length,
    files: document.querySelectorAll('input[type=file]').length,
    buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||b.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ')).filter(Boolean).slice(0,35)
  })`)
  console.log('SNAP2', snap)

  // Try type a short prompt into first textbox and click arrow/send
  const typed = await cdpEval(send, `(() => {
    const box = document.querySelector('[role=textbox], textarea, [contenteditable=true]')
    if (!box) return { ok:false, error:'no_textbox' }
    box.focus()
    const prompt = 'A short product spin of an orange t-shirt, vertical 9:16, soft studio light, 10 seconds'
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      box.value = prompt
      box.dispatchEvent(new Event('input', { bubbles: true }))
      box.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      box.textContent = prompt
      box.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt }))
    }
    // find submit - arrow_forward icon or generate
    const btns = [...document.querySelectorAll('button')]
    const sendBtn = btns.find(b => /arrow_forward|send|Generate|Tạo|Submit/i.test(b.innerHTML+' '+(b.innerText||'')))
    if (sendBtn) { sendBtn.click(); return { ok:true, submitted:true, btn:(sendBtn.innerText||sendBtn.innerHTML).slice(0,40) } }
    return { ok:true, submitted:false, note:'typed only' }
  })()`)
  console.log('TYPE', typed)
  await new Promise(r => setTimeout(r, 3000))
  snap = await cdpEval(send, `JSON.stringify({
    url: location.href,
    text: (document.body?.innerText||'').slice(0,700),
    boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length
  })`)
  console.log('SNAP3', snap)
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
