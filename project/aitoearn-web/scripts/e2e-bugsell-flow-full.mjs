/**
 * Full content demo:
 *  BugSell product → Flow pack Run on pool seat → wait video → watermark strip → artifact
 *
 * Usage: node scripts/e2e-bugsell-flow-full.mjs [port=9483]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] || 9483)
const HUB = process.env.SOCIALOPS_HUB || 'http://127.0.0.1:6061'
const cdp = `http://127.0.0.1:${port}`
const EXT = 'fnmijgmnjpealnnadjpjilaanhhambeb'
const PANEL = `chrome-extension://${EXT}/src/ui/side-panel/index.html`
const OUT_DIR = path.join(__dirname, '..', 'artifacts', 'flow-e2e')
const WM = process.env.SOCIALOPS_VEO_WATERMARK_TOOL
  || path.join(process.env.APPDATA || '', 'SocialsHub', 'tools', 'GeminiWatermarkTool-Video.exe')
const sleep = ms => new Promise(r => setTimeout(r, ms))

function isGoodMedia(u) {
  const s = String(u || '')
  if (s.startsWith('blob:')) return true
  if (/gstatic\.com\/aitestkitchen|banner|favicon|trpc|getFlowAppConfig/i.test(s)) return false
  if (/\.(mp4|webm)(\?|$)/i.test(s)) return true
  if (/googlevideo|videoplayback|storage\.googleapis\.com/i.test(s)) return true
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
        rej(new Error(`timeout ${method}`))
      }
    }, 120_000)
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId: pageId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId).catch(() => null)
  await send('Input.enable', {}, sessionId).catch(() => null)
  const evalJs = async (expression, timeoutMs = 60_000) => {
    // extend timeout by temporarily using long send timeout already 120s
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId)
    return r?.result?.value ?? r?.value ?? r
  }
  return { ws, send, sessionId, evalJs }
}

async function listPages() {
  return (await fetch(`${cdp}/json/list`).then(r => r.json())).filter(t => t.type === 'page')
}

async function activate(pageId) {
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

function runWm(inputPath, outputPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(WM)) {
      resolve({ ok: false, reason: 'tool_missing' })
      return
    }
    const child = spawn(WM, ['-i', inputPath, '-o', outputPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    const t = setTimeout(() => {
      try { child.kill() } catch {}
      resolve({ ok: false, reason: 'timeout', stderr })
    }, 600_000)
    child.stderr?.on('data', d => { stderr += String(d) })
    child.on('close', (code) => {
      clearTimeout(t)
      resolve({ ok: code === 0 && fs.existsSync(outputPath), code, stderr: stderr.slice(0, 500) })
    })
  })
}

async function fetchProduct() {
  const r = await fetch(`${HUB}/api/local/bugsell/products?per_page=3`).then(x => x.json())
  const item = r?.data?.items?.[0]
  if (!item) throw new Error('no_bugsell_product')
  return item
}

function contentPrompt(product) {
  const name = product.name || 'product hoodie'
  const price = product.salePrice || product.price || ''
  return [
    `Cinematic vertical product video for TikTok/Reels, 9:16, premium social commerce ad.`,
    `Product: ${name}.`,
    price ? `Price highlight subtly in scene only if natural — no on-screen text, captions, logos, or watermarks.` : `No on-screen text, captions, logos, or watermarks.`,
    `Show the hoodie clearly: soft studio lighting, clean background, slow orbit then gentle push-in on print detail, fabric texture visible, high-end fashion commercial, 4K look, shallow depth of field, natural motion, keep product print readable.`,
  ].join(' ')
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log('=== 1) BugSell product ===')
  const product = await fetchProduct()
  const prompt = contentPrompt(product)
  console.log(JSON.stringify({
    name: product.name,
    thumb: product.thumbnailUrl,
    url: product.storeUrl,
    prompt: prompt.slice(0, 200),
    port,
    wm: fs.existsSync(WM),
  }, null, 2))

  console.log('=== 2) Ensure Flow project on seat ===')
  let pages = await listPages()
  let flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || ''))
  if (!flow) {
    await fetch(`${cdp}/json/new?${encodeURIComponent('https://labs.google/fx/tools/flow')}`, { method: 'PUT' }).catch(() => null)
    await sleep(4000)
    pages = await listPages()
    flow = pages.find(p => /labs\.google/i.test(p.url || ''))
  }
  if (!flow) throw new Error('no_flow_tab')

  let ctx = await connect(flow.id)
  try {
    await ctx.send('Page.navigate', { url: 'https://labs.google/fx/tools/flow' }, ctx.sessionId)
    await sleep(5000)
    let url = String(await ctx.evalJs('location.href') || '')
    if (!url.includes('/project/')) {
      await ctx.evalJs(`(() => {
        const btns=[...document.querySelectorAll('button,a,[role=button]')];
        const b=btns.find(x=>/Create with Google Flow|Tạo với|Get started|Bắt đầu|Create a project|Tạo một|Dự án mới|New project|add_2/i.test((x.innerText||'')+(x.innerHTML||'')));
        b?.click(); return !!b;
      })()`)
      await sleep(7000)
      url = String(await ctx.evalJs('location.href') || '')
    }
    // disable agent
    await ctx.evalJs(`(() => {
      for (const b of document.querySelectorAll('button[aria-pressed="true"]')) {
        const t=((b.innerText||'')+(b.innerHTML||'')).toLowerCase();
        if (/tác nhân|agent|magic/.test(t)) b.click();
      }
      return true;
    })()`)
    console.log('[project]', url)
    if (!url.includes('/project/')) throw new Error('no_project_url: ' + url)
    // unusual activity check
    const blocked = await ctx.evalJs(`/hoạt động bất thường|unusual activity|không thành công/i.test(document.body?.innerText||'')`)
    if (blocked) {
      console.error('FLOW_BLOCKED: unusual activity on this account/seat — stop automation')
      process.exit(3)
    }
  }
  finally {
    ctx.ws.close()
  }

  pages = await listPages()
  flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || ''))
  if (!flow) throw new Error('lost_project')
  await activate(flow.id)

  console.log('=== 3) Flow pack side panel → Text to Video → Run ===')
  await fetch(`${cdp}/json/new?${encodeURIComponent(PANEL)}`, { method: 'PUT' }).catch(() => null)
  await sleep(2500)
  pages = await listPages()
  const panel = pages.find(p => String(p.url || '').includes(EXT) && String(p.url || '').includes('side-panel'))
  if (!panel) throw new Error('no_side_panel')

  await activate(flow.id)
  await sleep(800)
  ctx = await connect(panel.id)
  try {
    const notOn = await ctx.evalJs(`(document.body?.innerText||'').includes('Not on a Flow Project Page')`)
    console.log('[panel notOnProject]', notOn)
    if (notOn) {
      await ctx.evalJs(`(() => {
        const b=[...document.querySelectorAll('button')].find(x=>/Navigate to Flow/i.test(x.innerText||''));
        b?.click(); return !!b;
      })()`)
      await sleep(5000)
      pages = await listPages()
      flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || '')) || flow
      await activate(flow.id)
      await sleep(1500)
    }
    await ctx.evalJs(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/Text to Video/i.test(x.innerText||''));
      b?.click(); return !!b;
    })()`)
    await sleep(600)
    const filled = await ctx.evalJs(`(() => {
      const prompt=${JSON.stringify(prompt)};
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
    await activate(flow.id)
    await sleep(1000)
    const ran = await ctx.evalJs(`(() => {
      const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Run\\s*$/i.test((x.innerText||'').trim()));
      if(!b) return {ok:false};
      b.click();
      return {ok:true};
    })()`)
    console.log('[run]', ran)
    await sleep(2000)
    const after = await ctx.evalJs(`(document.body?.innerText||'').slice(0,400)`)
    console.log('[panel]', after.replace(/\n/g, ' ').slice(0, 300))
  }
  finally {
    ctx.ws.close()
  }

  console.log('=== 4) Poll project for video (up to 12 min) ===')
  pages = await listPages()
  flow = pages.find(p => /labs\.google.*\/project\//i.test(p.url || '')) || flow
  ctx = await connect(flow.id)
  let media = null
  let downloadClicked = false
  try {
    const started = Date.now()
    while (Date.now() - started < 12 * 60_000) {
      await sleep(5000)
      // Only click Download once — re-clicking every poll floods the seat download folder
      const shouldClickDl = !downloadClicked
      const poll = await ctx.evalJs(`(async () => {
        const tiles = document.querySelectorAll('[data-tile-id]').length;
        const videos = [...document.querySelectorAll('video')];
        const urls = [];
        for (const v of videos) {
          try { v.muted = true; await v.play().catch(()=>{}); } catch {}
          if (v.currentSrc) urls.push(v.currentSrc);
          if (v.src) urls.push(v.src);
        }
        for (const a of document.querySelectorAll('a[href]')) {
          if (/\\.(mp4|webm)(\\?|$)/i.test(a.href)) urls.push(a.href);
        }
        try {
          for (const e of performance.getEntriesByType('resource')) {
            if (/\\.(mp4|webm)(\\?|$)/i.test(e.name) || /googlevideo|videoplayback/i.test(e.name)) urls.push(e.name);
          }
        } catch {}
        const text = (document.body?.innerText||'');
        const blocked = /hoạt động bất thường|unusual activity/i.test(text);
        const generating = /đang tạo|generating|processing|queued|in progress|đang xử lý/i.test(text);
        let blobB64 = null;
        for (const blob of urls.filter(u => String(u).startsWith('blob:'))) {
          try {
            const buf = await (await fetch(blob)).arrayBuffer();
            if (buf.byteLength > 8000 && buf.byteLength < 120*1024*1024) {
              const bytes = new Uint8Array(buf);
              let binary = '';
              const chunk = 0x8000;
              for (let i=0;i<bytes.length;i+=chunk)
                binary += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
              blobB64 = btoa(binary);
              break;
            }
          } catch {}
        }
        let clickedDownload = false;
        if (${shouldClickDl ? 'true' : 'false'} && !blobB64 && videos.length) {
          const dl = [...document.querySelectorAll('button')].find(b => /download/i.test((b.innerHTML||'')+(b.getAttribute('aria-label')||'')));
          if (dl) { dl.click(); clickedDownload = true; }
        }
        return { tiles, videos: videos.length, generating, blocked, urls: [...new Set(urls)].slice(0,12), _b64: blobB64, blobBytes: blobB64 ? Math.round(blobB64.length*0.75) : 0, clickedDownload };
      })()`)
      if (poll?.clickedDownload) {
        downloadClicked = true
        console.log('[download] clicked once — will not re-click')
      }

      if (poll?.blocked) {
        console.error('FLOW_BLOCKED during poll')
        process.exit(3)
      }
      const good = (poll?.urls || []).filter(isGoodMedia)
      const http = good.find(u => /^https?:/i.test(u) && !u.startsWith('blob:'))
      console.log('[poll]', {
        elapsed: Math.round((Date.now() - started) / 1000),
        tiles: poll?.tiles,
        videos: poll?.videos,
        generating: poll?.generating,
        good: good.length,
        blob: poll?.blobBytes,
      })
      if (http) { media = { kind: 'url', url: http }; break }
      if (poll?._b64) { media = { kind: 'base64', base64: poll._b64 }; break }
    }
  }
  finally {
    ctx.ws.close()
  }

  if (!media) {
    // check seat download folder (pack auto-download / Flow UI download)
    // port 9480 -> chatgpt-1; also scan veo-folder-* subdirs
    const seatId = `chatgpt-${port - 9479}`
    const roots = [
      path.join('D:\\Download', 'SocialsHub', seatId),
      path.join(process.env.USERPROFILE || '', 'Downloads', 'SocialsHub', seatId),
      path.join('D:\\Download'),
    ]
    const walkMp4 = (dir, depth = 0) => {
      if (!fs.existsSync(dir) || depth > 3) return []
      let out = []
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        let st
        try { st = fs.statSync(full) } catch { continue }
        if (st.isDirectory()) out = out.concat(walkMp4(full, depth + 1))
        else if (/\.mp4$/i.test(name)) out.push({ full, mtime: st.mtimeMs, size: st.size })
      }
      return out
    }
    let newest = null
    for (const d of roots) {
      const files = walkMp4(d)
        .filter(f => f.size > 50_000 && Date.now() - f.mtime < 20 * 60_000)
        .sort((a, b) => b.mtime - a.mtime)
      if (files[0]) { newest = files[0]; break }
    }
    if (newest) {
      console.log('[auto-download found]', newest.full, newest.size)
      media = { kind: 'file', path: newest.full }
    }
  }

  if (!media) {
    console.error('FAIL: no video media')
    process.exit(1)
  }

  console.log('=== 5) Save raw video ===')
  const stamp = Date.now()
  const rawPath = path.join(OUT_DIR, `bugsell-raw-${port}-${stamp}.mp4`)
  if (media.kind === 'url') {
    const res = await fetch(media.url, { signal: AbortSignal.timeout(180000) })
    if (!res.ok) throw new Error(`download ${res.status}`)
    fs.writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()))
  }
  else if (media.kind === 'base64') {
    fs.writeFileSync(rawPath, Buffer.from(media.base64, 'base64'))
  }
  else {
    fs.copyFileSync(media.path, rawPath)
  }
  const rawSize = fs.statSync(rawPath).size
  console.log({ rawPath, rawSize })
  if (rawSize < 30000) throw new Error('raw too small')

  console.log('=== 6) Watermark remove ===')
  const cleanPath = path.join(OUT_DIR, `bugsell-clean-${port}-${stamp}.mp4`)
  const wm = await runWm(rawPath, cleanPath)
  console.log(wm)

  let finalPath = rawPath
  let watermarked = false
  if (wm.ok && fs.existsSync(cleanPath) && fs.statSync(cleanPath).size > 30000) {
    finalPath = cleanPath
    watermarked = true
  }
  else if (fs.existsSync(WM)) {
    // try drag-drop style: tool writes _processed next to input
    const sibling = rawPath.replace(/\.mp4$/i, '_processed.mp4')
    const wm2 = await new Promise((resolve) => {
      const child = spawn(WM, [rawPath], { windowsHide: true, stdio: 'ignore' })
      const t = setTimeout(() => { try { child.kill() } catch {}; resolve({ ok: false }) }, 600000)
      child.on('close', () => {
        clearTimeout(t)
        resolve({ ok: fs.existsSync(sibling) })
      })
    })
    if (wm2.ok) {
      fs.copyFileSync(sibling, cleanPath)
      try { fs.unlinkSync(sibling) } catch {}
      finalPath = cleanPath
      watermarked = true
    }
  }

  const meta = {
    ok: true,
    product: {
      name: product.name,
      thumbnailUrl: product.thumbnailUrl,
      storeUrl: product.storeUrl,
      price: product.salePrice || product.price,
    },
    prompt,
    seatPort: port,
    rawPath,
    rawBytes: rawSize,
    finalPath,
    finalBytes: fs.statSync(finalPath).size,
    watermarkRemoved: watermarked,
    watermarkTool: fs.existsSync(WM) ? WM : null,
    contentReady: true,
    aspectHint: '9:16',
    note: watermarked
      ? 'Full path: BugSell → Flow pack → video → watermark strip'
      : 'Video ready; watermark skipped (tool failed or missing) — raw kept',
  }
  const metaPath = path.join(OUT_DIR, `bugsell-meta-${port}-${stamp}.json`)
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  console.log('=== DONE ===')
  console.log(JSON.stringify(meta, null, 2))
  process.exit(watermarked || rawSize > 30000 ? 0 : 1)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
