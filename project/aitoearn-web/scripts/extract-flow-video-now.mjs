/**
 * Extract video currently showing on Flow project tab (port).
 * Uses CDP: Network capture + blob fetch + download click + MediaRecorder fallback.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] || 9483)
const cdp = `http://127.0.0.1:${port}`
const OUT_DIR = path.join(__dirname, '..', 'artifacts', 'flow-e2e')
const WM = path.join(process.env.APPDATA || '', 'SocialsHub', 'tools', 'GeminiWatermarkTool-Video.exe')
const sleep = ms => new Promise(r => setTimeout(r, ms))

function isGood(u) {
  const s = String(u || '')
  if (!s) return false
  if (/gstatic\.com\/aitestkitchen|banner|favicon|trpc|getFlowAppConfig/i.test(s)) return false
  if (s.startsWith('blob:')) return true
  if (/\.(mp4|webm)(\?|$)/i.test(s)) return true
  if (/googlevideo|videoplayback|storage\.googleapis/i.test(s)) return true
  return false
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const list = await fetch(`${cdp}/json/list`).then(r => r.json())
  const page = list.find(t => t.type === 'page' && /labs\.google.*project/i.test(t.url || ''))
    || list.find(t => t.type === 'page' && /labs\.google/i.test(t.url || ''))
  if (!page) throw new Error('no flow page')
  console.log('page', page.url)

  const ver = await fetch(`${cdp}/json/version`).then(r => r.json())
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('ws'))
    setTimeout(() => rej(new Error('to')), 10000)
  })
  let id = 1
  const pending = new Map()
  const networkUrls = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Network.responseReceived') {
      const url = m.params?.response?.url || ''
      if (isGood(url)) networkUrls.push(url)
    }
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
    }, 180_000)
  })
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.id, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Network.enable', {}, sessionId).catch(() => null)
  await send('Page.enable', {}, sessionId).catch(() => null)

  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId)
    return r?.result?.value ?? r?.value ?? r
  }

  // Click first tile + download if present
  await evalJs(`(() => {
    const tile = document.querySelector('[data-tile-id]');
    if (tile) tile.click();
    return !!tile;
  })()`)
  await sleep(1500)

  // Hover tile and click download
  await evalJs(`(() => {
    const tile = document.querySelector('[data-tile-id]');
    if (tile) {
      tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      tile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    }
    const btns = [...document.querySelectorAll('button, a, [role=button]')];
    const dl = btns.find(b => /download/i.test((b.innerHTML||'')+(b.getAttribute('aria-label')||'')+(b.innerText||'')));
    if (dl) { dl.click(); return { ok:true, text:(dl.innerText||'').slice(0,40) }; }
    return { ok:false, n: btns.length };
  })()`)
  await sleep(3000)

  // Capture blob from video element (long timeout eval)
  const cap = await evalJs(`(async () => {
    const videos = [...document.querySelectorAll('video')];
    const info = videos.map(v => ({
      src: v.currentSrc || v.src || '',
      ready: v.readyState,
      w: v.videoWidth,
      h: v.videoHeight,
      dur: v.duration,
    }));
    let blobB64 = null;
    let bytes = 0;
    let err = null;
    for (const v of videos) {
      const s = v.currentSrc || v.src || '';
      if (s.startsWith('blob:') || s.startsWith('http')) {
        try {
          const res = await fetch(s);
          const buf = await res.arrayBuffer();
          bytes = buf.byteLength;
          if (bytes > 20000 && bytes < 150*1024*1024) {
            const u8 = new Uint8Array(buf);
            let binary = '';
            const chunk = 0x8000;
            for (let i = 0; i < u8.length; i += chunk)
              binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
            blobB64 = btoa(binary);
            break;
          }
        } catch (e) { err = String(e && e.message || e); }
      }
    }
    // MediaRecorder fallback from playing video
    if (!blobB64 && videos[0] && videos[0].captureStream) {
      try {
        const v = videos[0];
        v.muted = true;
        await v.play().catch(()=>{});
        const stream = v.captureStream();
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        const chunks = [];
        await new Promise((resolve, reject) => {
          rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          rec.onerror = reject;
          rec.onstop = resolve;
          rec.start(200);
          setTimeout(() => { try { rec.stop(); } catch(e) { reject(e); } }, Math.min(12000, (v.duration||8)*1000 + 500));
        });
        const blob = new Blob(chunks, { type: 'video/webm' });
        const buf = await blob.arrayBuffer();
        bytes = buf.byteLength;
        if (bytes > 10000) {
          const u8 = new Uint8Array(buf);
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < u8.length; i += chunk)
            binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
          blobB64 = btoa(binary);
        }
      } catch (e) { err = (err||'') + ' rec:' + String(e && e.message || e); }
    }
    const perf = performance.getEntriesByType('resource').map(e => e.name).filter(n => /\\.(mp4|webm)|googlevideo|videoplayback|storage\\.googleapis/i.test(n)).slice(0,15);
    return { info, bytes, err, hasB64: !!blobB64, _b64: blobB64, perf };
  })()`)

  console.log(JSON.stringify({
    info: cap?.info,
    bytes: cap?.bytes,
    err: cap?.err,
    hasB64: cap?.hasB64,
    networkUrls: networkUrls.slice(0, 10),
    perf: cap?.perf,
  }, null, 2))

  const stamp = Date.now()
  let rawPath = null

  if (cap?._b64) {
    rawPath = path.join(OUT_DIR, `extract-raw-${port}-${stamp}.mp4`)
    // may be webm
    if (cap.info?.[0] && !cap.info[0].src?.includes('mp4'))
      rawPath = path.join(OUT_DIR, `extract-raw-${port}-${stamp}.webm`)
    fs.writeFileSync(rawPath, Buffer.from(cap._b64, 'base64'))
  }

  // network https
  if (!rawPath) {
    const http = [...networkUrls, ...(cap?.perf || [])].find(isGood)
    if (http && http.startsWith('http')) {
      console.log('download', http.slice(0, 120))
      const res = await fetch(http, { signal: AbortSignal.timeout(180000) })
      if (res.ok) {
        rawPath = path.join(OUT_DIR, `extract-raw-${port}-${stamp}.mp4`)
        fs.writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()))
      }
    }
  }

  // download folder scan
  if (!rawPath) {
    const dirs = [
      path.join('D:\\Download', 'SocialsHub', 'chatgpt-4'),
      path.join('D:\\Download', 'SocialsHub', 'chatgpt-3'),
      'D:\\Download',
      path.join(process.env.USERPROFILE || '', 'Downloads'),
    ]
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue
      const files = fs.readdirSync(d)
        .filter(f => /\.(mp4|webm)$/i.test(f))
        .map(f => {
          const full = path.join(d, f)
          const st = fs.statSync(full)
          return { full, mtime: st.mtimeMs, size: st.size }
        })
        .filter(f => f.size > 50000 && Date.now() - f.mtime < 30 * 60_000)
        .sort((a, b) => b.mtime - a.mtime)
      if (files[0]) {
        rawPath = path.join(OUT_DIR, `extract-copy-${port}-${stamp}.mp4`)
        fs.copyFileSync(files[0].full, rawPath)
        console.log('copied from', files[0].full)
        break
      }
    }
  }

  ws.close()

  if (!rawPath || !fs.existsSync(rawPath) || fs.statSync(rawPath).size < 20000) {
    console.error('FAIL extract')
    process.exit(1)
  }

  const rawSize = fs.statSync(rawPath).size
  console.log({ rawPath, rawSize })

  // watermark
  let finalPath = rawPath
  let wmOk = false
  if (fs.existsSync(WM) && /\.mp4$/i.test(rawPath)) {
    const clean = path.join(OUT_DIR, `extract-clean-${port}-${stamp}.mp4`)
    await new Promise((resolve) => {
      const child = spawn(WM, ['-i', rawPath, '-o', clean], { windowsHide: true, stdio: 'ignore' })
      const t = setTimeout(() => { try { child.kill() } catch {}; resolve() }, 600000)
      child.on('close', () => { clearTimeout(t); resolve() })
    })
    if (fs.existsSync(clean) && fs.statSync(clean).size > 20000) {
      finalPath = clean
      wmOk = true
    }
  }

  const meta = {
    ok: true,
    rawPath,
    rawSize,
    finalPath,
    finalBytes: fs.statSync(finalPath).size,
    watermarkRemoved: wmOk,
    port,
  }
  fs.writeFileSync(path.join(OUT_DIR, `extract-meta-${port}-${stamp}.json`), JSON.stringify(meta, null, 2))
  console.log('DONE', JSON.stringify(meta, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
