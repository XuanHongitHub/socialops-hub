async function main() {
  const list = await (await fetch('http://127.0.0.1:9480/json/list')).json()
  const page = list.find((t: any) => t.type === 'page' && String(t.url || '').includes('/project/'))
  if (!page) throw new Error('no project')
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
  const val = (r: any) => r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')

  const prompt = 'A 10 second vertical fashion commercial for a terracotta cartoon cone graphic t-shirt. Soft studio light, photoreal UGC, 9:16 aspect.'
  const fill = await send('Runtime.evaluate', {
    expression: `(() => {
      const prompt = ${JSON.stringify(prompt)};
      const boxes = [...document.querySelectorAll('[role=textbox][contenteditable=true], [role=textbox], div[contenteditable=true]')]
      const box = boxes.find(b => /Bạn muốn tạo|What do you|prompt|câu lệnh/i.test((b.textContent||'')+(b.getAttribute('aria-label')||''))) || boxes[0]
      if (!box) return JSON.stringify({ ok:false, error:'no_box' })
      box.focus()
      box.click()
      // Select all content
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(box)
      sel.removeAllRanges()
      sel.addRange(range)
      // Replace via execCommand insertText (works with many React editors)
      const ok1 = document.execCommand('insertText', false, prompt)
      // Fallback
      if (!ok1 || !(box.textContent||'').includes('terracotta')) {
        box.textContent = ''
        box.focus()
        document.execCommand('insertText', false, prompt)
      }
      // Fire events React often listens to
      box.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: prompt }))
      box.dispatchEvent(new Event('change', { bubbles: true }))
      return JSON.stringify({ ok:true, text: (box.textContent||'').slice(0,120), len: (box.textContent||'').length })
    })()`,
    returnByValue: true,
  })
  console.log('FILL', val(fill))

  // Wait a tick then click Create
  await new Promise(r => setTimeout(r, 500))
  const click = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button')]
      const sendBtn = btns.find(b => (b.innerHTML||'').includes('arrow_forward') && !b.disabled)
      if (!sendBtn) return JSON.stringify({ ok:false })
      sendBtn.click()
      return JSON.stringify({ ok:true })
    })()`,
    returnByValue: true,
  })
  console.log('CLICK', val(click))

  // Poll for generation progress 60s
  for (let i=0;i<12;i++) {
    await new Promise(r => setTimeout(r, 5000))
    const s = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        text: (document.body?.innerText||'').slice(0,600),
        generating: /đang tạo|generating|queue|processing|Đang|progress|%|movie/i.test(document.body?.innerText||''),
        tiles: document.querySelectorAll('[data-tile-id]').length,
        videos: document.querySelectorAll('video').length
      })`,
      returnByValue: true,
    })
    console.log('POLL', i, val(s))
    try {
      const p = JSON.parse(val(s))
      if (p.tiles > 0 || p.videos > 0 || (p.generating && i > 1)) {
        // continue a bit if generating
        if (p.videos > 0 || p.tiles > 2) break
      }
    } catch {}
  }
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
