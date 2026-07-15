/**
 * Drive Flow Automation side-panel UI: paste prompt + Run.
 * port [default 9483]
 */
const port = Number(process.argv[2] || 9483)
const PROMPT = process.argv.slice(3).join(' ').trim()
  || 'A black hoodie on a mannequin, soft studio light, slow orbit, cinematic product video, 9:16'
const cdp = `http://127.0.0.1:${port}`
const EXT = 'fnmijgmnjpealnnadjpjilaanhhambeb'
const PANEL = `chrome-extension://${EXT}/src/ui/side-panel/index.html`
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function connect(pageId) {
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('ws'))
    setTimeout(() => rej(new Error('to')), 10000)
  })
  let id = 1
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.rej(new Error(m.error.message || 'cdp')) : p.res(m.result)
    }
  }
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const mid = id++
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }))
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid)
        rej(new Error(method))
      }
    }, 30000)
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId: pageId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    return r?.result?.value ?? r?.value ?? r
  }
  return { ws, send, sessionId, evalJs }
}

// Ensure Flow tab + panel
await fetch(`${cdp}/json/new?${encodeURIComponent('https://labs.google/fx/tools/flow')}`, { method: 'PUT' }).catch(() => null)
await sleep(2000)
await fetch(`${cdp}/json/new?${encodeURIComponent(PANEL)}`, { method: 'PUT' }).catch(() => null)
await sleep(2500)

const list = await fetch(`${cdp}/json/list`).then(r => r.json())
const panel = list.find(t => t.type === 'page' && String(t.url || '').includes(EXT) && String(t.url || '').includes('side-panel'))
if (!panel)
  throw new Error('side panel not open: ' + list.filter(t => t.type === 'page').map(t => t.url).join(' | '))

console.log('panel', panel.url)
const { ws, evalJs } = await connect(panel.id)
try {
  await sleep(2000)
  const snap = await evalJs(`(() => ({
    title: document.title,
    text: (document.body?.innerText||'').slice(0,1500),
    inputs: [...document.querySelectorAll('textarea,input,[contenteditable=true]')].map(e=>({
      tag:e.tagName, ph:e.placeholder||e.getAttribute('placeholder'), id:e.id, name:e.name, cls:e.className?.toString?.().slice(0,40)
    })),
    buttons: [...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,40),
  }))()`)
  console.log(JSON.stringify(snap, null, 2))

  // Fill first textarea / contenteditable with prompt
  const filled = await evalJs(`(() => {
    const prompt = ${JSON.stringify(PROMPT)};
    const ta = document.querySelector('textarea')
      || document.querySelector('[contenteditable=true]')
      || document.querySelector('input[type=text]');
    if (!ta) return { ok:false };
    ta.focus();
    if (ta.tagName === 'TEXTAREA' || ta.tagName === 'INPUT') {
      const proto = ta.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc?.set?.call(ta, prompt);
      ta.dispatchEvent(new Event('input', { bubbles:true }));
      ta.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      ta.textContent = prompt;
      ta.dispatchEvent(new InputEvent('input', { bubbles:true, data: prompt }));
    }
    return { ok:true, val: (ta.value||ta.textContent||'').slice(0,80) };
  })()`)
  console.log('fill', filled)

  // Click Run / Start / Generate
  const ran = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find(x => /^(run|start|generate|bắt đầu|chạy)$/i.test((x.innerText||'').trim()))
      || btns.find(x => /run|start|generate|chạy|bắt đầu/i.test(x.innerText||''));
    if (!b) return { ok:false, btns: btns.map(x=>(x.innerText||'').trim()).filter(Boolean).slice(0,20) };
    b.click();
    return { ok:true, text: (b.innerText||'').trim() };
  })()`)
  console.log('run', ran)

  await sleep(3000)
  const after = await evalJs(`(document.body?.innerText||'').slice(0,800)`)
  console.log('AFTER', after)
}
finally {
  ws.close()
}
