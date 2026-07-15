/**
 * Full path: open Flow project tab → pack side panel fill → Run → wait for tiles/video.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] || 9483)
const PROMPT = process.argv.slice(3).join(' ').trim()
  || 'A black hoodie on a mannequin, soft studio lighting, slow camera orbit, cinematic product video, vertical'
const cdp = `http://127.0.0.1:${port}`
const EXT = 'fnmijgmnjpealnnadjpjilaanhhambeb'
const PANEL = `chrome-extension://${EXT}/src/ui/side-panel/index.html`
const OUT_DIR = path.join(__dirname, '..', 'artifacts', 'flow-e2e')
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function connect(pageId) {
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('ws'))
    setTimeout(() => rej(new Error('to')), 12000)
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
    }, 90_000)
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId: pageId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId).catch(() => null)
  await send('Input.enable', {}, sessionId).catch(() => null)
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
    return r?.result?.value ?? r?.value ?? r
  }
  return { ws, send, sessionId, evalJs }
}

async function listPages() {
  const list = await fetch(`${cdp}/json/list`).then(r => r.json())
  return list.filter(t => t.type === 'page')
}

async function activate(pageId) {
  // CDP has no direct activate; bring via Target.activateTarget
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('ws'))
    setTimeout(() => rej(new Error('to')), 8000)
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
  const send = (method, params) => new Promise((res, rej) => {
    const mid = id++
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid)
        rej(new Error(method))
      }
    }, 10000)
  })
  await send('Target.activateTarget', { targetId: pageId }).catch(() => null)
  ws.close()
}

async function main() {
  console.log({ cdp, prompt: PROMPT.slice(0, 80) })
  // 1) Open/create Flow project
  let pages = await listPages()
  let flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || ''))
  if (!flow) {
    await fetch(`${cdp}/json/new?${encodeURIComponent('https://labs.google/fx/tools/flow')}`, { method: 'PUT' }).catch(() => null)
    await sleep(4000)
    pages = await listPages()
    flow = pages.find(p => /labs\.google/i.test(p.url || ''))
  }
  if (!flow)
    throw new Error('no flow tab')

  let { ws, send, sessionId, evalJs } = await connect(flow.id)
  try {
    await send('Page.navigate', { url: 'https://labs.google/fx/tools/flow' }, sessionId)
    await sleep(5000)
    let url = String(await evalJs('location.href') || '')
    if (!url.includes('/project/')) {
      await evalJs(`(() => {
        const btns=[...document.querySelectorAll('button')];
        const b=btns.find(x=>/add_2|Create with Google Flow|Tạo với|Create a project|Tạo một|Dự án mới|New project|Get started|Bắt đầu/i.test((x.innerText||'')+(x.innerHTML||'')));
        b?.click(); return !!b;
      })()`)
      await sleep(7000)
      url = String(await evalJs('location.href') || '')
    }
    console.log('[flow project]', url)
    if (!url.includes('/project/'))
      throw new Error('could not open project page')
    // Disable agent if present
    await evalJs(`(() => {
      for (const b of document.querySelectorAll('button[aria-pressed="true"]')) {
        if (/tác nhân|agent|magic/i.test((b.innerText||'')+(b.innerHTML||''))) b.click();
      }
      return true;
    })()`)
  }
  finally {
    ws.close()
  }

  // Re-find project page id (may change after nav)
  pages = await listPages()
  flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || ''))
  if (!flow)
    throw new Error('lost project page')
  await activate(flow.id)
  await sleep(1000)

  // 2) Open pack side panel
  await fetch(`${cdp}/json/new?${encodeURIComponent(PANEL)}`, { method: 'PUT' }).catch(() => null)
  await sleep(2500)
  pages = await listPages()
  const panel = pages.find(p => String(p.url || '').includes(EXT) && String(p.url || '').includes('side-panel'))
  if (!panel)
    throw new Error('no side panel')

  // Keep flow project activated before run
  await activate(flow.id)
  await sleep(500)

  // 3) Fill panel + Run (while flow project is the "active" content page for pack)
  ;({ ws, evalJs } = await connect(panel.id))
  try {
    await sleep(2000)
    const status = await evalJs(`(document.body?.innerText||'').includes('Not on a Flow Project Page')`)
    console.log('[panel not-on-project]', status)

    // Click Navigate to Flow if shown
    if (status) {
      await evalJs(`(() => {
        const b=[...document.querySelectorAll('button')].find(x=>/Navigate to Flow/i.test(x.innerText||''));
        b?.click(); return !!b;
      })()`)
      await sleep(4000)
      // re-activate project after navigation
      pages = await listPages()
      flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || '')) || flow
      await activate(flow.id)
      await sleep(1500)
    }

    // Ensure Text to Video mode
    await evalJs(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/Text to Video/i.test(x.innerText||''));
      b?.click(); return !!b;
    })()`)
    await sleep(500)

    const filled = await evalJs(`(() => {
      const prompt=${JSON.stringify(PROMPT)};
      const ta=document.querySelector('textarea');
      if(!ta) return {ok:false};
      ta.focus();
      const desc=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
      desc?.set?.call(ta, prompt);
      ta.dispatchEvent(new Event('input',{bubbles:true}));
      ta.dispatchEvent(new Event('change',{bubbles:true}));
      return {ok:true, len:(ta.value||'').length};
    })()`)
    console.log('[fill]', filled)

    // Activate flow project again right before Run
    await activate(flow.id)
    await sleep(800)

    const ran = await evalJs(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Run\\s*$/i.test((x.innerText||'').trim()));
      if(!b) return {ok:false};
      b.click();
      return {ok:true};
    })()`)
    console.log('[run]', ran)
    await sleep(2000)
    const panelText = await evalJs(`(document.body?.innerText||'').slice(0,600)`)
    console.log('[panel after run]\\n', panelText)
  }
  finally {
    ws.close()
  }

  // 4) Poll project page for tiles/video
  pages = await listPages()
  flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || '')) || flow
  ;({ ws, evalJs } = await connect(flow.id))
  try {
    const started = Date.now()
    let media = null
    while (Date.now() - started < 12 * 60_000) {
      await sleep(5000)
      const poll = await evalJs(`(async () => {
        const tiles = document.querySelectorAll('div[data-tile-id]').length;
        const videos = [...document.querySelectorAll('video')];
        const urls = [];
        for (const v of videos) {
          try { v.muted = true; await v.play().catch(() => null); } catch {}
          if (v.currentSrc) urls.push(v.currentSrc);
          if (v.src) urls.push(v.src);
          for (const s of v.querySelectorAll('source')) if (s.src) urls.push(s.src);
        }
        for (const a of document.querySelectorAll('a[href]')) if (/\\.(mp4|webm)(\\?|$)/i.test(a.href)) urls.push(a.href);
        // download buttons near tiles
        for (const a of document.querySelectorAll('a[download], a[href*="blob:"]')) if (a.href) urls.push(a.href);
        try {
          for (const e of performance.getEntriesByType('resource')) {
            if (/\\.(mp4|webm)(\\?|$)/i.test(e.name) || /googlevideo|videoplayback/i.test(e.name)) urls.push(e.name);
          }
        } catch {}
        const text = (document.body?.innerText||'').slice(0,200);
        const generating = /đang tạo|generating|processing|queued|in progress|đang xử lý/i.test(text);
        let blobB64 = null;
        let blobErr = null;
        const blobCandidates = urls.filter(u => String(u).startsWith('blob:'));
        // also try video capture via canvas if no blob URL but media present
        for (const blob of blobCandidates) {
          try {
            const res = await fetch(blob);
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 5000 && buf.byteLength < 120*1024*1024) {
              const bytes = new Uint8Array(buf);
              let binary = '';
              const chunk = 0x8000;
              for (let i = 0; i < bytes.length; i += chunk)
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
              blobB64 = btoa(binary);
              break;
            }
          } catch (e) { blobErr = String(e && e.message || e); }
        }
        // MediaSource / no src: try captureStream is not a file; skip
        // Click download on first tile if video exists but no URL
        if (!blobB64 && videos.length > 0 && !urls.some(u => /^https?:/i.test(u) && /mp4|webm|googlevideo/i.test(u))) {
          const dl = [...document.querySelectorAll('button')].find(b => /download/i.test((b.innerHTML||'')+(b.getAttribute('aria-label')||'')));
          if (dl) dl.click();
        }
        return {
          tiles, videos: videos.length, generating,
          urls: [...new Set(urls)].slice(0, 12),
          _b64: blobB64,
          blobErr,
          blobBytes: blobB64 ? Math.round(blobB64.length * 0.75) : 0,
          text,
        };
      })()`)
      const good = (poll?.urls || []).filter((u) => {
        const s = String(u || '')
        if (s.startsWith('blob:'))
          return true
        if (/gstatic\.com\/aitestkitchen|banner/i.test(s))
          return false
        if (/\.(mp4|webm)(\?|$)/i.test(s))
          return true
        if (/googlevideo|videoplayback/i.test(s))
          return true
        return false
      })
      console.log('[poll]', {
        elapsed: Math.round((Date.now() - started) / 1000),
        tiles: poll?.tiles,
        videos: poll?.videos,
        generating: poll?.generating,
        good: good.length,
      })
      if (good[0]?.startsWith?.('http')) {
        media = { kind: 'url', url: good[0] }
        break
      }
      if (poll?._b64) {
        media = { kind: 'base64', base64: poll._b64 }
        break
      }
      if ((poll?.tiles || 0) > 0 && good[0]) {
        media = good[0].startsWith('blob:') ? null : { kind: 'url', url: good[0] }
        if (media)
          break
      }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    if (!media) {
      console.error('FAIL no media after pack run')
      process.exit(1)
    }
    const outFile = path.join(OUT_DIR, `flow-pack-${port}-${Date.now()}.mp4`)
    if (media.kind === 'url') {
      const res = await fetch(media.url, { signal: AbortSignal.timeout(180000) })
      fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()))
    }
    else {
      fs.writeFileSync(outFile, Buffer.from(media.base64, 'base64'))
    }
    const st = fs.statSync(outFile)
    console.log(JSON.stringify({ ok: true, outFile, bytes: st.size }, null, 2))
    if (st.size < 20000)
      throw new Error('too small')
  }
  finally {
    ws.close()
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
