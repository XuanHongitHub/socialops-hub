/**
 * Drive Google Flow (labs.google) via CDP for ext:flow:video jobs.
 * Full path: open project → fill prompt → submit → wait for video → extract media URL/bytes.
 * Replaces shell-only navigate/checkpoint (0 media).
 */
import {
  CdpSession,
  getBrowserWsUrl,
  listCdpTargets,
} from '@/app/api/ai/providers/workspace/cdpClient'

export type FlowMediaAsset = {
  /** https/http playback or download URL (preferred) */
  url?: string
  /** raw base64 video when only blob: is available in page */
  base64?: string
  mime?: string
  source: 'video_src' | 'anchor' | 'blob' | 'source_el'
}

export type FlowCdpDriveResult = {
  ok: boolean
  phase: string
  projectUrl?: string
  promptSubmitted?: boolean
  generating?: boolean
  tileCount?: number
  videoCount?: number
  /** Best playable/downloadable media for archive */
  media?: FlowMediaAsset | null
  videoUrls?: string[]
  error?: string
  textSample?: string
}

export type FlowCdpProgress = {
  percent: number
  stage: string
  tileCount?: number
  videoCount?: number
  generating?: boolean
  projectUrl?: string
}

async function sleep(ms: number) {
  await new Promise(r => setTimeout(r, ms))
}

function unwrapEval(r: any): any {
  if (r == null)
    return r
  if (typeof r === 'object' && 'value' in r && 'type' in r)
    return (r as { value: unknown }).value
  if (typeof r === 'object' && r.result && typeof r.result === 'object' && 'value' in r.result)
    return r.result.value
  return r
}

/** Reject marketing banners / API noise (not user generations). */
export function isJunkFlowMediaUrl(url: string): boolean {
  const u = String(url || '')
  // Real Flow media redirect (path includes trpc but is archivable)
  if (/getMediaUrlRedirect|media\.getMediaUrlRedirect/i.test(u))
    return false
  return /gstatic\.com\/aitestkitchen|banner|favicon|getFlowAppConfig|analytics|google-analytics/i.test(u)
    // bare trpc noise — but not media redirects (handled above)
    || (/\/trpc\//i.test(u) && !/getMediaUrlRedirect/i.test(u))
}

/** Prefer https media URLs over blob; used by tests + driver. */
export function pickBestFlowMediaUrl(urls: string[]): string | undefined {
  const list = (urls || [])
    .map(u => String(u || '').trim())
    .filter(Boolean)
    .filter(u => !isJunkFlowMediaUrl(u))
  const https = list.find(u => /^https?:\/\//i.test(u) && !u.startsWith('blob:') && isArchivableFlowUrl(u))
  if (https)
    return https
  const httpish = list.find(u => /^https?:\/\//i.test(u) && !u.startsWith('blob:'))
  if (httpish)
    return httpish
  return list.find(u => u.startsWith('blob:')) || list[0]
}

export function isArchivableFlowUrl(url: string | undefined | null): boolean {
  const u = String(url || '').trim()
  if (!u || !/^https?:\/\//i.test(u) || u.startsWith('blob:'))
    return false
  if (isJunkFlowMediaUrl(u))
    return false
  // Prefer real media paths + Flow media redirect API
  return /\.(mp4|webm)(\?|$)/i.test(u)
    || /googlevideo\.com|videoplayback|storage\.googleapis\.com/i.test(u)
    || /getMediaUrlRedirect|media\.getMediaUrlRedirect/i.test(u)
}

/**
 * Browser-side snippet (string) — list candidate video URLs from DOM.
 * Kept as export string for unit tests that only check shape helpers.
 */
export function flowMediaScanExpression(): string {
  return `(() => {
    const junk = (h) => {
      const s = h || '';
      if (/getMediaUrlRedirect/i.test(s)) return false;
      return /gstatic\\.com\\/aitestkitchen|banner|favicon|getFlowAppConfig|analytics/i.test(s)
        || (/\\/trpc\\//i.test(s) && !/getMediaUrlRedirect/i.test(s));
    };
    const isMedia = (h) => /\\.(mp4|webm)(\\?|$)/i.test(h)
      || /googlevideo|videoplayback|storage\\.googleapis|getMediaUrlRedirect/i.test(h);
    const urls = [];
    for (const v of document.querySelectorAll('video')) {
      try { v.muted = true; v.play().catch(() => {}); } catch {}
      const s = v.currentSrc || v.src || '';
      if (s && !junk(s)) urls.push(s);
      for (const src of v.querySelectorAll('source')) {
        const u = src.src || src.getAttribute('src') || '';
        if (u && !junk(u)) urls.push(u);
      }
    }
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.href || '';
      if (junk(h)) continue;
      if (isMedia(h)) urls.push(h);
    }
    try {
      for (const e of performance.getEntriesByType('resource')) {
        const n = e.name || '';
        if (junk(n)) continue;
        if (isMedia(n)) urls.push(n);
      }
    } catch {}
    const tiles = document.querySelectorAll('[data-tile-id]').length;
    const videos = document.querySelectorAll('video').length;
    const text = document.body?.innerText || '';
    // Avoid false "generating" from static nav "movie" icons alone
    const generating = tiles > 0 && (
      /đang tạo|generating|in progress|processing|queued|Đang xử lý|Creating/i.test(text)
      || document.querySelector('[class*="progress"], [role=progressbar]') != null
    );
    return {
      urls: [...new Set(urls)].slice(0, 20),
      tiles,
      videos,
      generating,
      text: text.slice(0, 400),
      href: location.href,
    };
  })()`
}

/** Extract first blob: video as base64 (may be large; size-capped in page). */
export function flowBlobExtractExpression(maxBytes = 80 * 1024 * 1024): string {
  return ` (async () => {
    const max = ${Math.max(1_000_000, maxBytes)};
    const videos = [...document.querySelectorAll('video')];
    let blobUrl = '';
    for (const v of videos) {
      const s = v.currentSrc || v.src || '';
      if (s.startsWith('blob:')) { blobUrl = s; break; }
    }
    if (!blobUrl) {
      // try first media with srcObject
      for (const v of videos) {
        try {
          if (v.srcObject instanceof MediaStream) continue;
        } catch {}
      }
      return { ok:false, error:'no_blob_video' };
    }
    try {
      const res = await fetch(blobUrl);
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) return { ok:false, error:'empty_blob' };
      if (buf.byteLength > max) return { ok:false, error:'blob_too_large', bytes: buf.byteLength };
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      return { ok:true, base64: b64, mime: res.headers.get('content-type') || 'video/mp4', bytes: buf.byteLength, source: 'blob' };
    } catch (e) {
      return { ok:false, error: String(e && e.message || e) };
    }
  })() `
}

export async function driveFlowGenerationViaCdp(input: {
  cdpEndpoint: string
  prompt: string
  /** Prefer image-to-video when product image is available later */
  imageUrl?: string
  aspectRatio?: '9:16' | '16:9' | string
  durationSeconds?: number
  pollMs?: number
  /** Default ~8 min (Flow 10s often needs 3–6 min) */
  pollRounds?: number
  /** Extra rounds after first video element appears (download URL may lag) */
  extractRounds?: number
  onProgress?: (p: FlowCdpProgress) => void | Promise<void>
}): Promise<FlowCdpDriveResult> {
  const base = input.cdpEndpoint.replace(/\/$/, '')
  const report = async (p: FlowCdpProgress) => {
    try {
      await input.onProgress?.(p)
    }
    catch {
      // non-fatal
    }
  }

  let targets = await listCdpTargets(input.cdpEndpoint)
  let page = targets.find(t => t.type === 'page' && String(t.url || '').includes('labs.google'))

  if (!page) {
    await fetch(`${base}/json/new?${encodeURIComponent('https://labs.google/fx/tools/flow')}`, {
      method: 'PUT',
      signal: AbortSignal.timeout(8000),
    }).catch(() =>
      fetch(`${base}/json/new?${encodeURIComponent('https://labs.google/fx/tools/flow')}`, {
        signal: AbortSignal.timeout(8000),
      }),
    )
    await sleep(1500)
    targets = await listCdpTargets(input.cdpEndpoint)
    page = targets.find(t => t.type === 'page' && String(t.url || '').includes('labs.google'))
  }

  if (!page?.webSocketDebuggerUrl && !page?.id) {
    return { ok: false, phase: 'no_flow_tab', error: 'no_labs_google_tab' }
  }

  const browserWs = await getBrowserWsUrl(input.cdpEndpoint)
  const session = new CdpSession(browserWs)
  try {
    await session.connect()
    let sessionId: string | undefined
    if (page.id) {
      sessionId = await session.attachPage(page.id)
    }
    await session.send('Runtime.enable', {}, sessionId)
    await session.send('Page.enable', {}, sessionId).catch(() => null)
    // Capture network response URLs for mp4 while generating
    await session.send('Network.enable', {}, sessionId).catch(() => null)

    const evalJs = async (expression: string, timeoutMs = 45_000) => {
      const r = await session.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId, timeoutMs)
      return unwrapEval(r)
    }

    /** Turn off Flow Agent chat mode (blocks text-to-video submit). */
    const disableAgentMode = async () => {
      await evalJs(`(() => {
        for (const b of document.querySelectorAll('button[aria-pressed="true"]')) {
          const t = ((b.innerText||'')+(b.innerHTML||'')+(b.getAttribute('aria-label')||'')).toLowerCase();
          if (/tác nhân|agent|magic|chat/i.test(t) || true) {
            // only click if looks like agent toggle
            if (/tác nhân|agent|magic/i.test(t)) b.click();
          }
        }
        const closes = [...document.querySelectorAll('button')].filter(b => {
          const i = b.querySelector('i');
          return i && /close/i.test(i.textContent||'') && /Phiên|Agent|Tác nhân|Nhật ký/i.test(b.closest('div')?.innerText||'');
        });
        closes[0]?.click();
        return true;
      })()`).catch(() => null)
      await sleep(800)
    }

    await report({ percent: 18, stage: 'Opening Google Flow…' })

    // Reuse existing project tab when possible — mass "new project" triggers Flow unusual-activity blocks
    const alreadyProject = Boolean(page.url && String(page.url).includes('/project/'))
    if (!alreadyProject) {
      await session.send('Page.navigate', {
        url: 'https://labs.google/fx/tools/flow',
      }, sessionId)
      await sleep(5000)
    }
    else {
      await sleep(1500)
    }

    let snap = await evalJs(`JSON.stringify({
      url: location.href,
      text: (document.body?.innerText||'').slice(0,400),
      boxes: document.querySelectorAll('[role=textbox],textarea,[contenteditable=true]').length
    })`)
    let state = typeof snap === 'string' ? JSON.parse(snap) : snap

    // Landing → Create with Google Flow / Get started
    if (!String(state?.url || '').includes('/project/')) {
      await report({ percent: 22, stage: 'Starting Flow project…' })
      await evalJs(`(() => {
        const els = [...document.querySelectorAll('button,a,[role=button]')]
        const b = els.find(e => /Create with Google Flow|Get started|Tạo với Google Flow|Bắt đầu/i.test(e.innerText||''))
        if (b) b.click()
        return true
      })()`)
      await sleep(5000)
      snap = await evalJs(`JSON.stringify({ url: location.href, text: (document.body?.innerText||'').slice(0,300) })`)
      state = typeof snap === 'string' ? JSON.parse(snap) : snap
    }

    if (!String(state?.url || '').includes('/project/')) {
      await evalJs(`(() => {
        const els = [...document.querySelectorAll('button,a,[role=button],div[role=button]')]
        const b = els.find(e => /Tạo một dự án|Create a project|New project|add_2/i.test((e.innerText||'')+(e.innerHTML||'')))
        if (b) b.click()
        return !!b
      })()`)
      await sleep(5000)
    }

    snap = await evalJs(`JSON.stringify({ url: location.href })`)
    state = typeof snap === 'string' ? JSON.parse(snap) : snap
    const url = String(state?.url || '')
    const m = url.match(/\/project\/([a-f0-9-]+)/i)
    if (m && url.includes('/characters')) {
      const root = url.replace(/\/characters.*/, '')
      await session.send('Page.navigate', { url: root }, sessionId)
      await sleep(4000)
    }

    // Exit Agent mode first (stable text-to-video path)
    await report({ percent: 26, stage: 'Disabling Flow Agent mode…' })
    await disableAgentMode()
    await disableAgentMode()

    // Best-effort: set aspect / length if UI exposes them
    const aspect = String(input.aspectRatio || '9:16')
    const dur = Number(input.durationSeconds) === 6 ? 6 : 10
    await evalJs(`(() => {
      const aspect = ${JSON.stringify(aspect)};
      const dur = ${JSON.stringify(String(dur) + 's')};
      const clickMatch = (re) => {
        const els = [...document.querySelectorAll('button,[role=button],div[role=option],span')];
        const el = els.find(e => re.test((e.innerText||'').trim()) && e.offsetParent !== null);
        if (el) { el.click(); return true; }
        return false;
      };
      clickMatch(new RegExp('^' + aspect.replace(':','\\\\s*:\\\\s*') + '$'));
      clickMatch(new RegExp('^' + dur + '$', 'i'));
      return true;
    })()`).catch(() => null)

    await report({ percent: 30, stage: 'Filling prompt on Flow…' })
    await session.send('Input.enable', {}, sessionId).catch(() => null)

    const prompt = String(input.prompt || '').slice(0, 3500)
    // Focus box then CDP insertText (React-friendly) + fallbacks
    const focused = await evalJs(`(() => {
      const boxes = [...document.querySelectorAll('[role=textbox], div[contenteditable=true], textarea')];
      let box = boxes.find(b => /Bạn muốn tạo|What do you want|create|prompt|làm gì|câu lệnh/i.test((b.textContent||'')+(b.getAttribute('aria-label')||'')+(b.getAttribute('placeholder')||'')));
      if (!box) box = boxes.find(b => b.getAttribute('contenteditable') === 'true' || b.getAttribute('role')==='textbox') || boxes[0];
      if (!box) return { ok:false, error:'no_prompt_box' };
      box.focus(); box.click();
      box.textContent = ''; box.innerHTML = '';
      return { ok:true };
    })()`)
    if (!focused?.ok) {
      return {
        ok: false,
        phase: 'prompt_fill_failed',
        error: focused?.error || 'no_prompt_box',
        projectUrl: String((await evalJs('location.href')) || ''),
      }
    }
    try {
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65,
      }, sessionId)
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65,
      }, sessionId)
      await session.send('Input.insertText', { text: prompt }, sessionId)
    }
    catch {
      // fall through to DOM fill
    }
    const fill = await evalJs(`(() => {
      const prompt = ${JSON.stringify(prompt)};
      const boxes = [...document.querySelectorAll('[role=textbox], div[contenteditable=true], textarea')];
      let box = boxes.find(b => (b.textContent||b.value||'').length > 5) || boxes[0];
      if (!box) return { ok:false, error:'no_prompt_box' };
      const cur = (box.textContent||box.value||'').trim();
      if (!cur.includes(prompt.slice(0, 20))) {
        box.focus();
        if (box.tagName === 'TEXTAREA') {
          const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          desc?.set?.call(box, prompt);
        } else {
          box.textContent = prompt;
        }
        box.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data: prompt }));
      }
      const text = (box.textContent||box.value||'').replace(/^\\u200b/,'').trim();
      if (/^Bạn muốn tạo gì\\??$/i.test(text) || text.length < 10)
        return { ok:false, error:'prompt_not_accepted', text };
      return { ok:true, len: text.length, text: text.slice(0,100) };
    })()`)

    if (!fill || fill.ok === false) {
      return {
        ok: false,
        phase: 'prompt_fill_failed',
        error: fill?.error || 'could_not_fill_prompt',
        projectUrl: String((await evalJs('location.href')) || ''),
      }
    }

    await sleep(400)
    const submitted = await evalJs(`(() => {
      const btns = [...document.querySelectorAll('button')];
      const sendBtn = btns.find(b => (b.innerHTML||'').includes('arrow_forward') && !b.disabled)
        || btns.find(b => /^(Tạo|Create)$/i.test((b.innerText||'').trim()) && !b.disabled);
      if (!sendBtn) return { ok:false, error:'no_create_button' };
      sendBtn.click();
      return { ok:true };
    })()`)

    if (!submitted?.ok) {
      return {
        ok: false,
        phase: 'submit_failed',
        error: submitted?.error || 'no_create_button',
        promptSubmitted: false,
        projectUrl: String((await evalJs('location.href')) || ''),
      }
    }

    await report({ percent: 40, stage: 'Prompt submitted — waiting for Flow video…' })

    // Stable pacing: longer poll, more rounds (Flow 10s often 3–8 min; avoid hammering)
    const pollMs = input.pollMs ?? 6000
    const rounds = input.pollRounds ?? 120 // ~12 min
    const extractRounds = input.extractRounds ?? 36
    let tileCount = 0
    let videoCount = 0
    let generating = false
    let textSample = ''
    let videoUrls: string[] = []
    let sawVideo = false
    let extractLeft = 0

    for (let i = 0; i < rounds; i++) {
      await sleep(pollMs)
      const poll = await evalJs(flowMediaScanExpression())
      tileCount = Number(poll?.tiles || 0)
      videoCount = Number(poll?.videos || 0)
      generating = Boolean(poll?.generating)
      textSample = String(poll?.text || '').slice(0, 300)
      const urls = Array.isArray(poll?.urls) ? poll.urls.map(String) : []
      if (urls.length)
        videoUrls = [...new Set([...videoUrls, ...urls])]

      const pct = Math.min(88, 42 + Math.round((i / rounds) * 45))
      await report({
        percent: pct,
        stage: videoCount > 0
          ? 'Video element present — extracting media…'
          : tileCount > 0
            ? `Flow tiles (${tileCount}) — waiting for video…`
            : generating
              ? 'Flow is generating…'
              : 'Waiting for Flow output…',
        tileCount,
        videoCount,
        generating,
        projectUrl: String(poll?.href || ''),
      })

      if (videoCount > 0 || isArchivableFlowUrl(pickBestFlowMediaUrl(videoUrls))) {
        if (!sawVideo) {
          sawVideo = true
          extractLeft = extractRounds
        }
      }

      // Prefer real http(s) URL before exiting
      if (isArchivableFlowUrl(pickBestFlowMediaUrl(videoUrls)))
        break

      if (sawVideo) {
        extractLeft -= 1
        if (extractLeft <= 0)
          break
      }

      // Still generating with tiles — keep waiting
      if (!sawVideo && !generating && tileCount === 0 && i > 8 && videoCount === 0) {
        // early quiet after submit can still be OK; only fail late
      }
    }

    // If only blob URLs, extract bytes in-page
    let media: FlowMediaAsset | null = null
    const bestHttp = pickBestFlowMediaUrl(videoUrls.filter(u => isArchivableFlowUrl(u)))
    if (bestHttp) {
      media = { url: bestHttp, source: 'video_src', mime: 'video/mp4' }
    }
    else if (videoCount > 0 || videoUrls.some(u => u.startsWith('blob:'))) {
      await report({ percent: 90, stage: 'Reading video blob from Flow page…' })
      const blob = await evalJs(flowBlobExtractExpression())
      if (blob?.ok && blob.base64) {
        media = {
          base64: String(blob.base64),
          mime: String(blob.mime || 'video/mp4'),
          source: 'blob',
        }
      }
      else if (videoUrls[0]) {
        media = { url: videoUrls[0], source: videoUrls[0].startsWith('blob:') ? 'blob' : 'video_src' }
      }
    }

    // Try download button once if still no media
    if (!media?.url && !media?.base64 && (videoCount > 0 || tileCount > 0)) {
      await evalJs(`(() => {
        const btns = [...document.querySelectorAll('button,a,[role=button]')];
        const b = btns.find(e => /download|tải xuống|save/i.test((e.innerText||'')+(e.getAttribute('aria-label')||'')));
        if (b) b.click();
        return !!b;
      })()`)
      await sleep(2500)
      const again = await evalJs(flowMediaScanExpression())
      const urls2 = Array.isArray(again?.urls) ? again.urls.map(String) : []
      videoUrls = [...new Set([...videoUrls, ...urls2])]
      const http2 = pickBestFlowMediaUrl(urls2.filter((u: string) => isArchivableFlowUrl(u)))
      if (http2)
        media = { url: http2, source: 'anchor', mime: 'video/mp4' }
      else if (!media) {
        const blob2 = await evalJs(flowBlobExtractExpression())
        if (blob2?.ok && blob2.base64) {
          media = { base64: String(blob2.base64), mime: String(blob2.mime || 'video/mp4'), source: 'blob' }
        }
      }
    }

    const projectUrl = String((await evalJs('location.href')) || '')
    const hasMedia = Boolean(media?.url || media?.base64)
    const success = hasMedia || videoCount > 0 || tileCount > 0 || generating

    if (hasMedia) {
      await report({ percent: 94, stage: 'Media captured from Flow' })
    }

    return {
      ok: success,
      phase: hasMedia
        ? (media?.base64 ? 'media_blob_ready' : 'media_url_ready')
        : videoCount > 0
          ? 'video_present_no_url'
          : tileCount > 0
            ? 'tiles_present'
            : generating
              ? 'generating'
              : 'submitted_no_output_yet',
      projectUrl,
      promptSubmitted: true,
      generating,
      tileCount,
      videoCount,
      media,
      videoUrls,
      textSample,
      error: success
        ? (hasMedia ? undefined : 'video_ui_present_but_no_downloadable_url')
        : 'submitted_but_no_tiles_or_video_in_poll_window',
    }
  }
  catch (e) {
    return {
      ok: false,
      phase: 'cdp_error',
      error: e instanceof Error ? e.message : String(e),
    }
  }
  finally {
    await session.close()
  }
}
