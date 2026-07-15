async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('/project/'))
  if (!page) throw new Error('no project page')
  console.log('page', page.url)
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
  await send('Input.enable').catch(()=>null)

  // Detailed type using Input.insertText after focus
  const prep = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const boxes = [...document.querySelectorAll('[role=textbox], textarea, [contenteditable=true]')]
        const info = boxes.map((b,i)=>({i, tag:b.tagName, role:b.getAttribute('role'), ce:b.getAttribute('contenteditable'), ph:b.getAttribute('placeholder')||b.getAttribute('aria-label')||'', text:(b.textContent||'').slice(0,30)}))
        const box = boxes.find(b => /prompt|command|câu lệnh|describe/i.test((b.getAttribute('aria-label')||'')+(b.getAttribute('placeholder')||''))) || boxes[boxes.length-1]
        if (!box) return JSON.stringify({ ok:false, error:'no box', info })
        box.focus()
        box.click()
        // select all and clear
        if (box.tagName==='TEXTAREA' || box.tagName==='INPUT') {
          box.select?.()
          box.value = ''
        } else {
          document.execCommand('selectAll')
          document.execCommand('delete')
        }
        return JSON.stringify({ ok:true, info, focused: true })
      } catch(e) { return JSON.stringify({ ok:false, error: String(e) }) }
    })()`,
    returnByValue: true,
  })
  console.log('PREP', prep?.result?.result?.value ?? prep)

  const prompt = '10s vertical product commercial terracotta graphic t-shirt spin soft studio light photoreal UGC fashion 9:16'
  // Use CDP Input.insertText
  await send('Input.insertText', { text: prompt })

  const afterType = await send('Runtime.evaluate', {
    expression: `(() => {
      const boxes = [...document.querySelectorAll('[role=textbox], textarea, [contenteditable=true]')]
      const texts = boxes.map(b => (b.value || b.textContent || '').slice(0,80))
      const btns = [...document.querySelectorAll('button')].map(b => ({
        t: (b.innerText||'').trim().slice(0,40),
        html: (b.innerHTML||'').includes('arrow_forward'),
        disabled: b.disabled
      })).filter(x => x.html || /Tạo|Create|Generate|arrow/i.test(x.t))
      return JSON.stringify({ texts, btns })
    })()`,
    returnByValue: true,
  })
  console.log('TYPED', afterType?.result?.result?.value ?? afterType)

  // Click create with arrow_forward
  const click = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button')]
      const sendBtn = btns.find(b => (b.innerHTML||'').includes('arrow_forward') && !b.disabled)
        || btns.find(b => /^(Tạo|Create)$/i.test((b.innerText||'').trim()) && !b.disabled)
      if (!sendBtn) return JSON.stringify({ ok:false, error:'no_send' })
      sendBtn.click()
      return JSON.stringify({ ok:true, text: (sendBtn.innerText||'').trim(), disabled: sendBtn.disabled })
    })()`,
    returnByValue: true,
  })
  console.log('CLICK', click?.result?.result?.value ?? click)

  await new Promise(r => setTimeout(r, 10000))
  const snap = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href,
      text: (document.body?.innerText||'').slice(0,1000),
      generating: /generating|đang tạo|queue|processing|loading/i.test(document.body?.innerText||'')
    })`,
    returnByValue: true,
  })
  console.log('SNAP', snap?.result?.result?.value ?? snap)
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
