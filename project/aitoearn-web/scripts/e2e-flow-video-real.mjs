/**
 * Flow real video e2e using pack remote-config selector intent:
 *  1) disable agent mode
 *  2) open tune/config → video mode → text-to-video
 *  3) fill prompt + submit arrow_forward
 *  4) wait data-tile-id / real video (not gstatic banners)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] || 9483)
const PROMPT = process.argv.slice(3).join(' ').trim()
  || 'A black hoodie on a mannequin, soft studio lighting, slow camera orbit, cinematic product shot, vertical 9:16'
const cdp = `http://127.0.0.1:${port}`
const OUT_DIR = path.join(__dirname, '..', 'artifacts', 'flow-e2e')
const MAX_WAIT_MS = 12 * 60_000
const sleep = ms => new Promise(r => setTimeout(r, ms))

function isRealGeneratedMedia(u) {
  const s = String(u || '')
  if (s.startsWith('blob:'))
    return true
  if (!/^https?:/i.test(s))
    return false
  if (/gstatic\.com\/aitestkitchen|banner|favicon|trpc|getFlowAppConfig|analytics/i.test(s))
    return false
  if (/\.(mp4|webm)(\?|$)/i.test(s))
    return true
  if (/googlevideo\.com|videoplayback|lh3\.googleusercontent\.com.*video|storage\.googleapis\.com/i.test(s))
    return true
  return false
}

async function connect(pageId) {
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('ws'))
    setTimeout(() => rej(new Error('ws timeout')), 12000)
  })
  let id = 1
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data))
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.rej(new Error(msg.error.message || 'cdp')) : p.res(msg.result)
    }
  }
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const mid = id++
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }))
    setTimeout(() => {
      if (pending.has(mid)) {
        pending.delete(mid)
        rej(new Error(`timeout ${method}`))
      }
    }, 60000)
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId: pageId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId).catch(() => null)
  await send('Input.enable', {}, sessionId).catch(() => null)
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId)
    return r?.result?.value ?? r?.value ?? r
  }
  return { ws, send, sessionId, evalJs }
}

async function main() {
  console.log(JSON.stringify({ cdp, prompt: PROMPT.slice(0, 100) }))
  const ver = await fetch(`${cdp}/json/version`).then(r => r.json()).catch(e => ({ error: String(e) }))
  if (ver.error)
    throw new Error('CDP offline')
  console.log('Browser', ver.Browser)

  let list = await fetch(`${cdp}/json/list`).then(r => r.json())
  let page = list.find(t => t.type === 'page' && /labs\.google/.test(t.url || ''))
  if (!page) {
    await fetch(`${cdp}/json/new?${encodeURIComponent('https://labs.google/fx/tools/flow')}`, { method: 'PUT' }).catch(() => null)
    await sleep(2500)
    list = await fetch(`${cdp}/json/list`).then(r => r.json())
    page = list.find(t => t.type === 'page' && /labs\.google/.test(t.url || ''))
  }
  if (!page?.id)
    throw new Error('no page')

  const { ws, send, sessionId, evalJs } = await connect(page.id)
  try {
    await send('Page.navigate', { url: 'https://labs.google/fx/tools/flow' }, sessionId)
    await sleep(5000)

    // Create project if needed
    let url = String(await evalJs('location.href') || '')
    if (!url.includes('/project/')) {
      await evalJs(`(() => {
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find(x => {
          const icon = x.querySelector('i');
          const t = (x.innerText||'') + (icon?.textContent||'');
          return /add_2|Create with Google Flow|Tạo với|Get started|Bắt đầu|Create a project|Tạo một dự án|New project|Dự án mới/i.test(t);
        });
        b?.click();
        return !!b;
      })()`)
      await sleep(6000)
      url = String(await evalJs('location.href') || '')
    }
    console.log('[project]', url)
    if (url.includes('/characters')) {
      await send('Page.navigate', { url: url.replace(/\/characters.*/, '') }, sessionId)
      await sleep(4000)
    }

    // ── disable agent mode (critical) ──
    console.log('[1] disable agent mode')
    for (let attempt = 0; attempt < 4; attempt++) {
      const disabled = await evalJs(`(() => {
        const text = document.body?.innerText || '';
        const looksAgent = /Bạn muốn làm gì|Chào .+!|magic_button|Tác nhân/i.test(text)
          && !document.querySelector('div[data-tile-id]');
        // aria-pressed true = agent on
        const pressed = [...document.querySelectorAll('button[aria-pressed="true"]')];
        for (const b of pressed) {
          const t = (b.innerText||'') + (b.getAttribute('aria-label')||'') + (b.innerHTML||'');
          if (/agent|tác nhân|magic|expand|chat/i.test(t) || pressed.length <= 3) {
            b.click();
            return { action: 'aria-pressed', t: t.slice(0,40) };
          }
        }
        // close buttons near edit_square / agent panel
        const closes = [...document.querySelectorAll('button')].filter(b => {
          const i = b.querySelector('i');
          return i && /close/i.test(i.textContent||'');
        });
        // prefer close that is visible near "Phiên" / agent
        for (const b of closes) {
          const wrap = b.closest('div')?.innerText || '';
          if (/Phiên|Agent|Tác nhân|Nhật ký|edit_square/i.test(wrap) || /Đóng/i.test(b.innerText||'')) {
            b.click();
            return { action: 'close', t: (b.innerText||'').slice(0,30) };
          }
        }
        // toggle enableAgent false: buttons with expand_content
        const expand = [...document.querySelectorAll('button')].find(b => /expand_content/i.test(b.innerHTML||''));
        if (expand) { expand.click(); return { action: 'expand' }; }
        return { action: 'none', looksAgent };
      })()`)
      console.log('  attempt', attempt, disabled)
      await sleep(1200)
      const still = await evalJs(`/Bạn muốn làm gì\\?/i.test(document.body?.innerText||'')`)
      if (!still)
        break
    }

    // ── open config (tune / crop) ──
    console.log('[2] open config (tune)')
    await evalJs(`(() => {
      const btns = [...document.querySelectorAll('button')];
      // configVideoButton: color BLURPLE haspopup dialog — fallback tune/crop
      let b = btns.find(x => x.getAttribute('aria-haspopup') === 'dialog' && (x.getAttribute('color')||'').toUpperCase() === 'BLURPLE');
      if (!b) b = btns.find(x => {
        const i = (x.querySelector('i')?.textContent||'');
        return /tune|crop/i.test(i) && !/settings_2/i.test(i);
      });
      if (!b) b = btns.find(x => /^tune\\n|^Cài đặt$/i.test((x.innerText||'').trim()) || /\\btune\\b/i.test(x.innerHTML||''));
      b?.click();
      return { ok: !!b, text: (b?.innerText||'').slice(0,40) };
    })()`)
    await sleep(1500)

    // select video mode + text-to-video from open dialog/tabs
    console.log('[3] select video + text-to-video tabs')
    await evalJs(`(() => {
      const open = document.querySelector('[data-state="open"]') || document.querySelector('[role="dialog"]') || document.body;
      const tablists = [...open.querySelectorAll('[role="tablist"]')];
      // first tablist: image/video — pick video (eq 1)
      if (tablists[0]) {
        const tabs = [...tablists[0].querySelectorAll('button,[role=tab]')];
        if (tabs[1]) tabs[1].click();
        else {
          const v = tabs.find(t => /video|vid/i.test(t.innerText||'') || /videocam|movie/i.test(t.innerHTML||''));
          v?.click();
        }
      }
      return { tablists: tablists.length };
    })()`)
    await sleep(800)
    await evalJs(`(() => {
      const open = document.querySelector('[data-state="open"]') || document.querySelector('[role="dialog"]') || document.body;
      const tablists = [...open.querySelectorAll('[role="tablist"]')];
      // second tablist: i2v / t2v — text-to-video often eq(1)
      if (tablists[1]) {
        const tabs = [...tablists[1].querySelectorAll('button,[role=tab]')];
        // prefer text-to-video label
        const t2v = tabs.find(t => /text|chữ|văn bản|prompt/i.test(t.innerText||'')) || tabs[1] || tabs[0];
        t2v?.click();
        return { tabs: tabs.map(t => (t.innerText||'').slice(0,30)), picked: (t2v?.innerText||'').slice(0,30) };
      }
      // aspect 9:16 if present
      const ar = [...open.querySelectorAll('button')].find(b => /9:16|9\\s*:\\s*16|portrait|dọc/i.test(b.innerText||'') || /crop_9_16|9_16/i.test(b.innerHTML||''));
      ar?.click();
      const len = [...open.querySelectorAll('button')].find(b => /^\\s*6\\s*s?\\s*$/i.test((b.innerText||'').trim()) || /\\b6s\\b/i.test(b.innerText||''));
      len?.click();
      return { tablists: tablists.length, ar: !!ar, len: !!len };
    })()`)
    await sleep(500)

    // close config if needed by clicking outside / tune again
    await evalJs(`(() => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(esc);
      return true;
    })()`)
    await sleep(500)

    // ── fill prompt ──
    console.log('[4] fill prompt')
    const focused = await evalJs(`(() => {
      const boxes = [...document.querySelectorAll('div[role="textbox"], div[contenteditable="true"], textarea')];
      let box = boxes.find(b => /Bạn muốn tạo|What do you want|prompt|câu lệnh/i.test((b.textContent||'')+(b.getAttribute('aria-label')||'')+(b.getAttribute('placeholder')||'')));
      if (!box) box = boxes.find(b => b.getAttribute('contenteditable')==='true' || b.getAttribute('role')==='textbox') || boxes[0];
      if (!box) return { ok:false, n: boxes.length };
      box.focus(); box.click();
      box.textContent = ''; box.innerHTML = '';
      return { ok:true, n: boxes.length };
    })()`)
    console.log('[focus]', focused)
    if (!focused?.ok)
      throw new Error('no_prompt_box')

    await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sessionId)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sessionId)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, sessionId)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 }, sessionId)
    await send('Input.insertText', { text: PROMPT }, sessionId)
    await sleep(400)
    await evalJs(`(() => {
      const box = document.querySelector('div[role="textbox"], div[contenteditable="true"]');
      if (!box) return;
      box.dispatchEvent(new InputEvent('input', { bubbles:true, data: ${JSON.stringify(PROMPT)} }));
    })()`)

    const filled = await evalJs(`(() => [...document.querySelectorAll('div[role=textbox],div[contenteditable=true]')].map(b=>(b.textContent||'').trim().slice(0,70)))()`)
    console.log('[filled]', filled)

    // ── submit ──
    console.log('[5] submit')
    const submitted = await evalJs(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find(x => {
        const i = x.querySelector('i');
        return i && /arrow_forward/i.test(i.textContent||'') && !x.disabled;
      }) || btns.find(x => /arrow_forward/i.test(x.innerHTML||'') && !x.disabled);
      if (!b) return { ok:false };
      b.click();
      return { ok:true, text: (b.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40) };
    })()`)
    console.log('[submit]', submitted)
    await sleep(3000)

    console.log('[6] poll tiles/video')
    const started = Date.now()
    let media = null
    let last = null
    while (Date.now() - started < MAX_WAIT_MS) {
      await sleep(4000)
      const poll = await evalJs(`(async () => {
        const tiles = document.querySelectorAll('div[data-tile-id]').length;
        const videos = [...document.querySelectorAll('video')];
        const urls = [];
        for (const v of videos) {
          if (v.currentSrc) urls.push(v.currentSrc);
          if (v.src) urls.push(v.src);
        }
        for (const a of document.querySelectorAll('a[href]')) {
          if (/\\.(mp4|webm)(\\?|$)/i.test(a.href)) urls.push(a.href);
        }
        try {
          for (const e of performance.getEntriesByType('resource')) {
            if (/\\.(mp4|webm)(\\?|$)/i.test(e.name) || /googlevideo|videoplayback/i.test(e.name))
              urls.push(e.name);
          }
        } catch {}
        const text = (document.body?.innerText||'').slice(0,250);
        const generating = /đang tạo|generating|in progress|processing|queued|đang xử lý|creating|render|movie/i.test(text)
          || !!document.querySelector('[role=progressbar], i');
        // icon movie on tiles = generating (tileOnQueue)
        const movieIcons = [...document.querySelectorAll('i')].filter(i => /movie/i.test(i.textContent||'')).length;
        let blobB64 = null;
        const blobUrl = urls.find(u => String(u).startsWith('blob:'));
        if (blobUrl) {
          try {
            const res = await fetch(blobUrl);
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 8000 && buf.byteLength < 120*1024*1024) {
              const bytes = new Uint8Array(buf);
              let binary = '';
              const chunk = 0x8000;
              for (let i=0;i<bytes.length;i+=chunk)
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
              blobB64 = btoa(binary);
            }
          } catch {}
        }
        return { tiles, videos: videos.length, movieIcons, urls: [...new Set(urls)].slice(0,12), generating, blobBytes: blobB64?Math.round(blobB64.length*0.75):0, _b64: blobB64, text, url: location.href };
      })()`)

      const candidates = (poll?.urls || []).filter(isRealGeneratedMedia)
      const httpUrl = candidates.find(u => /^https?:/i.test(u))
      last = {
        elapsed: Math.round((Date.now() - started) / 1000),
        tiles: poll?.tiles,
        videos: poll?.videos,
        movieIcons: poll?.movieIcons,
        generating: poll?.generating,
        mediaCandidates: candidates.length,
        blob: poll?.blobBytes,
      }
      console.log('[poll]', JSON.stringify(last))

      if (httpUrl) {
        media = { kind: 'url', url: httpUrl }
        break
      }
      if (poll?._b64) {
        media = { kind: 'base64', base64: poll._b64 }
        break
      }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    if (!media) {
      const fail = path.join(OUT_DIR, `fail-${port}-${Date.now()}.json`)
      fs.writeFileSync(fail, JSON.stringify({ last, prompt: PROMPT }, null, 2))
      console.error('FAIL', fail)
      process.exit(1)
    }

    const outFile = path.join(OUT_DIR, `flow-${port}-${Date.now()}.mp4`)
    if (media.kind === 'url') {
      console.log('[download]', media.url.slice(0, 120))
      const res = await fetch(media.url, { signal: AbortSignal.timeout(180000) })
      if (!res.ok)
        throw new Error(`download ${res.status}`)
      fs.writeFileSync(outFile, Buffer.from(await res.arrayBuffer()))
    }
    else {
      fs.writeFileSync(outFile, Buffer.from(media.base64, 'base64'))
    }
    const st = fs.statSync(outFile)
    // reject tiny / known banner sizes if needed
    console.log(JSON.stringify({ ok: true, outFile, bytes: st.size, port }, null, 2))
    if (st.size < 20000)
      throw new Error('file too small — likely not a real gen')
    process.exit(0)
  }
  finally {
    try { ws.close() }
    catch { /* */ }
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
