/**
 * Drive Flow generation via the Flow Automation extension (pack), not by
 * faking the labs.google prompt box with CDP.
 *
 * Control plane:
 *   1) Push Hub config → chrome.storage (flow_automation_settings)
 *   2) Ensure Flow project tab is open (pack requires /project/)
 *   3) Open pack side panel → paste mission prompt → Run
 *   4) Wait for pack auto-download / page media (honest progress + early abort)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  type FlowCdpDriveResult,
  type FlowCdpProgress,
  type FlowMediaAsset,
  flowBlobExtractExpression,
  flowMediaScanExpression,
  isArchivableFlowUrl,
  pickBestFlowMediaUrl,
} from '@/app/api/ai/providers/extension/flowCdpDriver'
import {
  buildPackStoragePatches,
  PACK_STORAGE_TARGETS,
  pushStorageToExtensionOnCdp,
} from '@/app/api/ai/providers/extension/extensionSettingsPush'
import {
  type FlowVeoDefaults,
  FLOW_VEO_DEFAULTS,
  mergeFlowVeoDefaults,
  secondsToFlowVideoOption,
} from '@/app/api/ai/providers/extension/flowVeoDefaults'
import {
  CdpSession,
  getBrowserWsUrl,
  listCdpTargets,
} from '@/app/api/ai/providers/workspace/cdpClient'

const FLOW_PACK = PACK_STORAGE_TARGETS.find(p => p.packId === 'flow-automation')!

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

/** Map seat id / CDP port → SocialsHub download roots (pack auto-download). */
export function seatDownloadRoots(seatId: string | undefined, cdpEndpoint: string): string[] {
  const roots: string[] = []
  const id = String(seatId || '').trim()
  if (id)
    roots.push(join('D:\\Download', 'SocialsHub', id))
  const port = Number((cdpEndpoint.match(/:(\d+)/) || [])[1] || 0)
  if (port >= 9480 && port <= 9483) {
    const n = port - 9479
    roots.push(join('D:\\Download', 'SocialsHub', `chatgpt-${n}`))
  }
  roots.push(join('D:\\Download'))
  const home = process.env.USERPROFILE || ''
  if (home) {
    if (id)
      roots.push(join(home, 'Downloads', 'SocialsHub', id))
    roots.push(join(home, 'Downloads'))
  }
  return [...new Set(roots)]
}

function walkRecentMp4(dir: string, sinceMs: number, depth = 0): Array<{ full: string, mtime: number, size: number }> {
  if (!existsSync(dir) || depth > 3)
    return []
  let out: Array<{ full: string, mtime: number, size: number }> = []
  let names: string[]
  try {
    names = readdirSync(dir)
  }
  catch {
    return []
  }
  for (const name of names) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    }
    catch {
      continue
    }
    if (st.isDirectory()) {
      out = out.concat(walkRecentMp4(full, sinceMs, depth + 1))
      continue
    }
    if (!/\.mp4$/i.test(name))
      continue
    if (st.size < 50_000 || st.mtimeMs < sinceMs)
      continue
    out.push({ full, mtime: st.mtimeMs, size: st.size })
  }
  return out
}

export function findNewestSeatDownload(input: {
  seatId?: string
  cdpEndpoint: string
  sinceMs: number
}): { full: string, mtime: number, size: number } | null {
  let best: { full: string, mtime: number, size: number } | null = null
  for (const root of seatDownloadRoots(input.seatId, input.cdpEndpoint)) {
    for (const f of walkRecentMp4(root, input.sinceMs)) {
      if (!best || f.mtime > best.mtime)
        best = f
    }
  }
  return best
}

export function mediaFromLocalFile(path: string): FlowMediaAsset | null {
  try {
    if (!existsSync(path))
      return null
    const buf = readFileSync(path)
    if (buf.byteLength < 20_000)
      return null
    return {
      base64: buf.toString('base64'),
      mime: 'video/mp4',
      source: 'anchor',
    }
  }
  catch {
    return null
  }
}

async function openOrFindTarget(cdpEndpoint: string, url: string, match: RegExp) {
  const base = cdpEndpoint.replace(/\/$/, '')
  let targets = await listCdpTargets(cdpEndpoint)
  let page = targets.find(t => t.type === 'page' && match.test(String(t.url || '')))
  if (page)
    return page
  await fetch(`${base}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(8000),
  }).catch(() =>
    fetch(`${base}/json/new?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) }),
  )
  await sleep(1800)
  targets = await listCdpTargets(cdpEndpoint)
  return targets.find(t => t.type === 'page' && match.test(String(t.url || '')))
}

/**
 * App mission → Flow Automation pack:
 * push config, open panel, inject prompt, click Run, harvest media.
 */
export async function driveFlowPackGeneration(input: {
  cdpEndpoint: string
  prompt: string
  seatId?: string
  aspectRatio?: string
  durationSeconds?: number
  flowVeo?: FlowVeoDefaults
  /** Poll interval (ms). Default 5000. */
  pollMs?: number
  /** Max poll rounds after Run. Default 90 (~7.5 min @ 5s). */
  pollRounds?: number
  /**
   * After Run: consecutive quiet polls (no tiles / generating / download)
   * before early fail. Default 18 (~90s @ 5s) — do not wait full window empty.
   */
  quietAbortRounds?: number
  /** Grace polls after Run before quiet abort applies. Default 6 (~30s). */
  quietGraceRounds?: number
  onProgress?: (p: FlowCdpProgress) => void | Promise<void>
}): Promise<FlowCdpDriveResult> {
  const base = input.cdpEndpoint.replace(/\/$/, '')
  const prompt = String(input.prompt || '').trim().slice(0, 3500)
  if (!prompt) {
    return { ok: false, phase: 'no_prompt', error: 'empty_prompt' }
  }

  const report = async (p: FlowCdpProgress) => {
    try {
      await input.onProgress?.(p)
    }
    catch { /* non-fatal */ }
  }

  const flowVeo = mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, {
    ...(input.flowVeo || {}),
    aspectRatio: (input.aspectRatio === '16:9' || input.aspectRatio === '9:16')
      ? input.aspectRatio
      : (input.flowVeo?.aspectRatio || FLOW_VEO_DEFAULTS.aspectRatio),
    defaultVideoOption: input.durationSeconds != null
      ? secondsToFlowVideoOption(input.durationSeconds)
      : (input.flowVeo?.defaultVideoOption || FLOW_VEO_DEFAULTS.defaultVideoOption),
  })

  // ── 1) Push Hub config into pack storage ──
  await report({ percent: 12, stage: 'Pushing Flow pack config to seat…' })
  const patches = buildPackStoragePatches({
    flowVeo,
    aspectRatio: flowVeo.aspectRatio,
  })
  const flowPatch = patches['flow-automation']
  if (!flowPatch) {
    return { ok: false, phase: 'config_push_failed', error: 'no_flow_pack_patch' }
  }
  // Mission: one concurrent prompt, stable delays (already in defaults)
  const push = await pushStorageToExtensionOnCdp({
    cdpEndpoint: input.cdpEndpoint,
    extensionId: FLOW_PACK.extensionId,
    storageKey: FLOW_PACK.storageKey,
    patch: {
      ...flowPatch,
      // Ensure text-to-video mission mode
      defaultMode: flowVeo.defaultMode || 'textToVideo',
      concurrentPrompts: 1,
      outputCount: 1,
    },
    sidePanelPath: FLOW_PACK.sidePanelPath,
  })
  if (!push.ok) {
    return {
      ok: false,
      phase: 'config_push_failed',
      error: push.error || 'pack_storage_push_failed',
    }
  }

  // ── 2) Ensure Flow project tab (pack refuses non-project pages) ──
  await report({ percent: 20, stage: 'Opening Google Flow project on seat…' })
  let flowPage = await openOrFindTarget(
    input.cdpEndpoint,
    'https://labs.google/fx/tools/flow',
    /labs\.google/i,
  )
  if (!flowPage?.id) {
    return { ok: false, phase: 'no_flow_tab', error: 'no_labs_google_tab' }
  }

  const browserWs = await getBrowserWsUrl(input.cdpEndpoint)
  const session = new CdpSession(browserWs)
  await session.connect()

  const attachEval = async (targetId: string, expression: string, timeoutMs = 30_000) => {
    const sessionId = await session.attachPage(targetId)
    await session.send('Runtime.enable', {}, sessionId).catch(() => null)
    const r = await session.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId, timeoutMs)
    return unwrapEval(r)
  }

  try {
    // Enter / stay on a project URL when still on landing
    let flowUrl = String(flowPage.url || '')
    if (!/\/project\//i.test(flowUrl)) {
      await attachEval(flowPage.id, `(() => {
        const els = [...document.querySelectorAll('button,a,[role=button]')];
        const b = els.find(e => /Create with Google Flow|Tạo với Google Flow|Get started|Bắt đầu|New project|Tạo một dự án|add_2/i.test((e.innerText||'')+(e.innerHTML||'')));
        if (b) b.click();
        return true;
      })()`).catch(() => null)
      await sleep(4500)
      const targets = await listCdpTargets(input.cdpEndpoint)
      flowPage = targets.find(t => t.type === 'page' && /labs\.google.*project/i.test(String(t.url || '')))
        || targets.find(t => t.type === 'page' && /labs\.google/i.test(String(t.url || '')))
        || flowPage
      flowUrl = String(flowPage?.url || '')
    }

    // ── 3) Open pack side panel + inject mission + Run ──
    await report({ percent: 32, stage: 'Opening Flow Automation pack…' })
    const panelUrl = `chrome-extension://${FLOW_PACK.extensionId}/${FLOW_PACK.sidePanelPath || 'src/ui/side-panel/index.html'}`
    let panel = await openOrFindTarget(
      input.cdpEndpoint,
      panelUrl,
      new RegExp(`${FLOW_PACK.extensionId}.*side-panel`, 'i'),
    )
    if (!panel?.id) {
      // retry once
      await fetch(`${base}/json/new?${encodeURIComponent(panelUrl)}`, { method: 'PUT' }).catch(() => null)
      await sleep(2000)
      const targets = await listCdpTargets(input.cdpEndpoint)
      panel = targets.find(t =>
        t.type === 'page'
        && String(t.url || '').includes(FLOW_PACK.extensionId)
        && String(t.url || '').includes('side-panel'),
      )
    }
    if (!panel?.id) {
      return {
        ok: false,
        phase: 'pack_panel_missing',
        error: 'flow_automation_side_panel_not_found',
        projectUrl: flowUrl,
      }
    }

    await sleep(1500)
    await report({ percent: 40, stage: 'Sending mission prompt to pack…' })

    // Prefer Text to Video tab if present
    await attachEval(panel.id, `(() => {
      const btns = [...document.querySelectorAll('button, [role=tab], a, div[role=button]')];
      const t = btns.find(b => /text\\s*to\\s*video|văn bản.*video|text.?video/i.test((b.innerText||'')+(b.getAttribute('aria-label')||'')));
      if (t) t.click();
      return true;
    })()`).catch(() => null)
    await sleep(400)

    const filled = await attachEval(panel.id, `(() => {
      const prompt = ${JSON.stringify(prompt)};
      const nodes = [...document.querySelectorAll('textarea, input[type=text], [contenteditable=true], [role=textbox]')];
      let box = nodes.find(n => /prompt|câu lệnh|batch|line/i.test((n.placeholder||'')+(n.getAttribute('aria-label')||'')+(n.id||'')))
        || nodes.find(n => n.tagName === 'TEXTAREA')
        || nodes[0];
      if (!box) return { ok:false, error:'no_prompt_box', n: nodes.length };
      box.focus();
      box.click();
      if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
        const proto = box.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc?.set?.call(box, prompt);
        box.dispatchEvent(new Event('input', { bubbles:true }));
        box.dispatchEvent(new Event('change', { bubbles:true }));
      } else {
        box.textContent = prompt;
        box.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data: prompt }));
      }
      const val = (box.value || box.textContent || '').trim();
      if (val.length < 8) return { ok:false, error:'prompt_not_accepted', len: val.length };
      return { ok:true, len: val.length };
    })()`)

    if (!filled?.ok) {
      return {
        ok: false,
        phase: 'pack_prompt_failed',
        error: filled?.error || 'could_not_fill_pack_prompt',
        projectUrl: flowUrl,
      }
    }

    const ran = await attachEval(panel.id, `(() => {
      const btns = [...document.querySelectorAll('button, [role=button]')];
      const label = (b) => ((b.innerText||'')+(b.getAttribute('aria-label')||'')+(b.getAttribute('title')||'')).trim();
      const b = btns.find(x => /^(run|start|generate|chạy|bắt đầu)$/i.test(label(x)))
        || btns.find(x => /\\brun\\b|start|generate|chạy|bắt đầu|create batch/i.test(label(x)));
      if (!b) return { ok:false, error:'no_run_button', btns: btns.map(label).filter(Boolean).slice(0,20) };
      if (b.disabled) return { ok:false, error:'run_disabled', text: label(b) };
      b.click();
      return { ok:true, text: label(b).slice(0, 40) };
    })()`)

    if (!ran?.ok) {
      return {
        ok: false,
        phase: 'pack_run_failed',
        error: ran?.error || 'could_not_click_run',
        projectUrl: flowUrl,
        promptSubmitted: true,
        textSample: Array.isArray(ran?.btns) ? ran.btns.join(' | ') : undefined,
      }
    }

    await report({
      percent: 48,
      stage: 'Pack Run — waiting for Flow + auto-download…',
      projectUrl: flowUrl,
    })

    const missionStartedAt = Date.now()
    const pollMs = input.pollMs ?? 5000
    const rounds = input.pollRounds ?? 90
    const quietAbort = input.quietAbortRounds ?? 18
    const quietGrace = input.quietGraceRounds ?? 6
    let quietStreak = 0
    let tileCount = 0
    let videoCount = 0
    let generating = false
    let textSample = ''
    let videoUrls: string[] = []
    let media: FlowMediaAsset | null = null
    let projectUrl = flowUrl

    // Refresh flow page id each loop (navigation may change target)
    for (let i = 0; i < rounds; i++) {
      await sleep(pollMs)

      // Pack auto-download first (most reliable for content archive)
      const dl = findNewestSeatDownload({
        seatId: input.seatId,
        cdpEndpoint: input.cdpEndpoint,
        sinceMs: missionStartedAt - 5_000,
      })
      if (dl) {
        const local = mediaFromLocalFile(dl.full)
        if (local) {
          media = local
          await report({
            percent: 92,
            stage: 'Pack downloaded video — archiving…',
            tileCount,
            videoCount: Math.max(videoCount, 1),
            projectUrl,
          })
          break
        }
      }

      const targets = await listCdpTargets(input.cdpEndpoint)
      const flowNow = targets.find(t => t.type === 'page' && /labs\.google.*project/i.test(String(t.url || '')))
        || targets.find(t => t.type === 'page' && /labs\.google/i.test(String(t.url || '')))
      if (flowNow?.id)
        flowPage = flowNow

      let poll: any = null
      try {
        poll = await attachEval(flowPage!.id, flowMediaScanExpression())
      }
      catch {
        poll = null
      }

      tileCount = Number(poll?.tiles || 0)
      videoCount = Number(poll?.videos || 0)
      generating = Boolean(poll?.generating)
      textSample = String(poll?.text || '').slice(0, 300)
      projectUrl = String(poll?.href || projectUrl)
      const urls = Array.isArray(poll?.urls) ? poll.urls.map(String) : []
      if (urls.length)
        videoUrls = [...new Set([...videoUrls, ...urls])]

      const bestHttp = pickBestFlowMediaUrl(videoUrls.filter(u => isArchivableFlowUrl(u)))
      if (bestHttp) {
        media = { url: bestHttp, source: 'video_src', mime: 'video/mp4' }
        await report({
          percent: 90,
          stage: 'Flow media URL ready',
          tileCount,
          videoCount,
          generating,
          projectUrl,
        })
        break
      }

      // Blob extract when video element present
      if (videoCount > 0) {
        await report({
          percent: 82,
          stage: 'Video on page — extracting…',
          tileCount,
          videoCount,
          generating,
          projectUrl,
        })
        try {
          const blob = await attachEval(flowPage!.id, flowBlobExtractExpression(), 120_000)
          if (blob?.ok && blob.base64) {
            media = {
              base64: String(blob.base64),
              mime: String(blob.mime || 'video/mp4'),
              source: 'blob',
            }
            break
          }
        }
        catch { /* keep polling */ }
      }

      const alive = tileCount > 0 || videoCount > 0 || generating || Boolean(dl)
      if (!alive && i >= quietGrace)
        quietStreak += 1
      else
        quietStreak = 0

      // Honest progress from signals (not fake linear clock)
      let percent = 50
      let stage = 'Waiting for pack / Flow output…'
      if (generating) {
        percent = 62
        stage = 'Flow is generating…'
      }
      else if (tileCount > 0) {
        percent = 70
        stage = `Flow tiles (${tileCount}) — waiting for video…`
      }
      else if (videoCount > 0) {
        percent = 80
        stage = 'Video element present — extracting…'
      }
      else if (i < quietGrace) {
        percent = 52
        stage = 'Pack started — waiting for generation…'
      }
      await report({ percent, stage, tileCount, videoCount, generating, projectUrl })

      if (quietStreak >= quietAbort) {
        return {
          ok: false,
          phase: 'pack_quiet_abort',
          error: 'pack_run_no_tiles_or_video_early',
          projectUrl,
          promptSubmitted: true,
          generating: false,
          tileCount: 0,
          videoCount: 0,
          media: null,
          videoUrls,
          textSample,
        }
      }
    }

    // Final download scan
    if (!media) {
      const dl = findNewestSeatDownload({
        seatId: input.seatId,
        cdpEndpoint: input.cdpEndpoint,
        sinceMs: missionStartedAt - 5_000,
      })
      if (dl)
        media = mediaFromLocalFile(dl.full)
    }

    // Last-chance: click download once on Flow if video present
    if (!media && videoCount > 0 && flowPage?.id) {
      await attachEval(flowPage.id, `(() => {
        const btns = [...document.querySelectorAll('button,a,[role=button]')];
        const b = btns.find(e => /download|tải xuống|save/i.test((e.innerText||'')+(e.getAttribute('aria-label')||'')));
        if (b) b.click();
        return !!b;
      })()`).catch(() => null)
      await sleep(3000)
      const dl = findNewestSeatDownload({
        seatId: input.seatId,
        cdpEndpoint: input.cdpEndpoint,
        sinceMs: missionStartedAt - 5_000,
      })
      if (dl)
        media = mediaFromLocalFile(dl.full)
      if (!media) {
        try {
          const blob = await attachEval(flowPage.id, flowBlobExtractExpression(), 120_000)
          if (blob?.ok && blob.base64) {
            media = {
              base64: String(blob.base64),
              mime: String(blob.mime || 'video/mp4'),
              source: 'blob',
            }
          }
        }
        catch { /* ignore */ }
      }
    }

    const hasMedia = Boolean(media?.url || media?.base64)
    if (hasMedia) {
      await report({ percent: 94, stage: 'Media captured from pack/Flow' })
      return {
        ok: true,
        phase: media?.base64 ? 'media_blob_ready' : 'media_url_ready',
        projectUrl,
        promptSubmitted: true,
        generating,
        tileCount,
        videoCount,
        media,
        videoUrls,
        textSample,
      }
    }

    return {
      ok: false,
      phase: videoCount > 0 || tileCount > 0
        ? 'video_present_no_url'
        : 'pack_no_output',
      error: videoCount > 0 || tileCount > 0
        ? 'tiles_or_video_but_no_archivable_media'
        : 'pack_run_finished_without_media',
      projectUrl,
      promptSubmitted: true,
      generating,
      tileCount,
      videoCount,
      media: null,
      videoUrls,
      textSample,
    }
  }
  finally {
    try {
      await session.close()
    }
    catch { /* ignore */ }
  }
}
