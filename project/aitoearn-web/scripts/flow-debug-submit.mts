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
  const v = (r: any) => r?.result?.result?.value ?? r?.result?.value
  await send('Runtime.enable')
  await send('Network.enable')

  // Capture next network requests after submit
  const requests: string[] = []
  // we can't easily hook messages without filtering - just evaluate DOM deeply

  const prompt = 'Product spin orange t-shirt soft light vertical 10 seconds photoreal'
  const fill = await send('Runtime.evaluate', {
    expression: `(() => {
      const prompt = ${JSON.stringify(prompt)};
      const boxes = [...document.querySelectorAll('[role=textbox], div[contenteditable=true]')]
      const box = boxes[0]
      if (!box) return JSON.stringify({ok:false})
      box.focus(); box.click();
      // triple-click to select all
      box.dispatchEvent(new MouseEvent('click', { detail: 3, bubbles: true }))
      document.execCommand('selectAll')
      document.execCommand('insertText', false, prompt)
      const text = box.innerText || box.textContent || ''
      // Find mode controls near composer
      const near = box.closest('form,div')?.parentElement
      const labels = [...document.querySelectorAll('button, [role=tab], [role=radio]')].map(e => (e.innerText||e.getAttribute('aria-label')||'').trim()).filter(t => t.length && t.length < 40).slice(0,40)
      return JSON.stringify({ ok: text.includes('orange'), text: text.slice(0,100), labels })
    })()`,
    returnByValue: true,
  })
  console.log('FILL', v(fill))

  // Try click Video mode if present
  await send('Runtime.evaluate', {
    expression: `(() => {
      const els = [...document.querySelectorAll('button, [role=tab], [role=radio], div[role=button]')]
      const video = els.find(e => /^(Video|Hình ảnh|Image|Text to video|Image to video|Tạo video)$/i.test((e.innerText||'').trim()) || /videocam|movie/i.test(e.innerHTML||''))
      if (video) { video.click(); return 'clicked:'+(video.innerText||'').slice(0,30) }
      // open settings/tune near composer
      const tune = els.find(e => /tune|crop|settings/i.test(e.innerHTML||'') && !/settings_2|View Settings|Cài đặt chế độ xem/i.test(e.innerText||''))
      if (tune) { tune.click(); return 'tune' }
      return 'none'
    })()`,
    returnByValue: true,
  }).then(r => console.log('MODE', v(r)))

  await new Promise(r => setTimeout(r, 1000))

  // Enter key to submit
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await new Promise(r => setTimeout(r, 500))

  // Also click arrow_forward
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button')]
      const sendBtn = btns.find(b => (b.innerHTML||'').includes('arrow_forward') && !b.disabled)
      if (sendBtn) { sendBtn.click(); return 'clicked' }
      return 'no'
    })()`,
    returnByValue: true,
  }).then(r => console.log('SEND', v(r)))

  for (let i=0;i<8;i++) {
    await new Promise(r => setTimeout(r, 5000))
    const s = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        composer: ([...document.querySelectorAll('[role=textbox]')][0]?.innerText||'').slice(0,80),
        tiles: document.querySelectorAll('[data-tile-id]').length,
        videos: document.querySelectorAll('video').length,
        imgs: document.querySelectorAll('img[src*=\"googleusercontent\"], img[src*=\"blob:\"]').length,
        toast: (document.body?.innerText||'').match(/.{0,40}(error|lỗi|failed|thất bại|credits|hạn mức).{0,40}/i)?.[0] || null,
        snippet: (document.body?.innerText||'').slice(0,200)
      })`,
      returnByValue: true,
    })
    console.log('P', i, v(s))
  }
  ws.close()
}
main().catch(e => { console.error(e); process.exit(1) })
