/**
 * Push Hub media / pack defaults into each seat's chrome.storage.local
 * for Flow / ChatGPT / Gemini / Grok Automation packs (side-panel settings).
 *
 * Storage keys (from pack bundles v3.x):
 * - flow_automation_settings
 * - chatgpt_automation_settings
 * - gemini_automation_settings
 * - grok_automation_settings
 */
import {
  CdpSession,
  getBrowserWsUrl,
  listCdpTargets,
} from '@/app/api/ai/providers/workspace/cdpClient'
import {
  type FlowVeoDefaults,
  FLOW_VEO_DEFAULTS,
  videoOptionToSeconds,
} from './flowVeoDefaults'
import { getAutomationPack, listAutomationPacks } from './registry'

export type PackStorageTarget = {
  packId: string
  extensionId: string
  storageKey: string
  sidePanelPath: string
}

/** Fixed CRX ids (manifest key) + chrome.storage keys from minified packs */
export const PACK_STORAGE_TARGETS: PackStorageTarget[] = [
  {
    packId: 'flow-automation',
    extensionId: 'fnmijgmnjpealnnadjpjilaanhhambeb',
    storageKey: 'flow_automation_settings',
    sidePanelPath: 'src/ui/side-panel/index.html',
  },
  {
    packId: 'chatgpt-automation',
    extensionId: 'nocgcjgldlpeffhdhfjejhcgjbgcmpgb',
    storageKey: 'chatgpt_automation_settings',
    sidePanelPath: 'src/ui/side-panel/index.html',
  },
  {
    packId: 'gemini-automation',
    extensionId: 'jlhacppkbcmonaanlkbgipimelfbjgpb',
    storageKey: 'gemini_automation_settings',
    sidePanelPath: 'src/ui/side-panel/index.html',
  },
  {
    packId: 'grok-automation',
    extensionId: 'kpeloeongamilgpjaibcdmldenfmdngp',
    storageKey: 'grok_automation_settings',
    sidePanelPath: 'src/ui/side-panel/index.html',
  },
]

/** Hub quality labels → pack storage enums */
export function mapVideoQualityToPack(q: string): string {
  const s = String(q || '').toLowerCase()
  if (s.includes('4k') || s === '2160p')
    return '4k'
  if (s.includes('1080'))
    return '1080'
  if (s.includes('720'))
    return '720'
  if (s.includes('480'))
    return '480p-upscale'
  return '1080'
}

export function mapImageQualityToPack(q: string): string {
  const s = String(q || '').toLowerCase()
  if (s.includes('4k') || s === '4')
    return '4k'
  if (s.includes('2'))
    return '2k'
  return '1k'
}

export function mapImageModeToPack(mode: string): string {
  const m = String(mode || '')
  if (m === 'concat' || m === 'reuse')
    return 'concat'
  return 'new-image'
}

/**
 * Build chrome.storage patch objects per pack.
 * Always force outputCount / image outputs = 1 (user request: 1 not 2/4).
 */
export function buildPackStoragePatches(input: {
  flowVeo: FlowVeoDefaults
  /** Global social aspect if Flow block not set */
  aspectRatio?: string
}): Record<string, Record<string, unknown>> {
  const flow = input.flowVeo || FLOW_VEO_DEFAULTS
  const aspect = (flow.aspectRatio === '16:9' || flow.aspectRatio === '9:16')
    ? flow.aspectRatio
    : (input.aspectRatio === '16:9' ? '16:9' : '9:16')
  const videoQ = mapVideoQualityToPack(flow.autoDownloadQualityVideo)
  const imageQ = mapImageQualityToPack(flow.autoDownloadQualityImage)
  const imageOpt = mapImageModeToPack(flow.defaultImageModeOption)
  const outputCount = Math.min(4, Math.max(1, Number(flow.outputCount) || 1))

  const flowPatch: Record<string, unknown> = {
    // Full Settings-tab shape (pack v3.2.x) — matches side-panel “Cài đặt”
    migrationVersion: 5,
    defaultMode: flow.defaultMode, // Chế độ mặc định
    model: flow.model || 'Veo 3.1 - Lite', // Mô hình
    imageModel: flow.imageModel || '🍌 Nano Banana 2', // Mô hình hình ảnh
    aspectRatio: aspect, // Tỷ lệ khung hình mặc định
    defaultVideoOption: flow.defaultVideoOption, // Tùy chọn video mặc định (6s/10s/…)
    defaultImageOption: imageOpt, // Tùy chọn chế độ ảnh (Ảnh mới)
    maxRetries: flow.maxRetries, // Số lần thử lại tối đa khi lỗi
    autoDownloadVideoQuality: videoQ, // Chất lượng tải xuống tự động (Video)
    autoDownloadImageQuality: imageQ, // Chất lượng tải xuống tự động (Hình ảnh)
    // Concurrent streams (1 = sequential; raise to test parallel)
    concurrentPrompts: Math.min(6, Math.max(1, Number(flow.concurrentPrompts) || 1)),
    outputCount,
    imageToVideoMaxImagesPerPrompt: 1,
    componentsToVideoMaxImagesPerPrompt: 3,
    imageToImageMaxImagesPerPrompt: 3,
    autoAddCharacterImages: false,
    autoAddVoiceBySpeaker: false,
    defaultSpeaker: 'none',
    enableCharacterControl: false,
    autoChangeFileName: true,
    folderName: 'veo-folder-1',
    hideTipBeforeUse: false,
    promptDelaySecondsMin: Number(flow.promptDelaySecondsMin ?? 30),
    promptDelaySecondsMax: Number(flow.promptDelaySecondsMax ?? 60),
  }

  const chatgptPatch: Record<string, unknown> = {
    migrationVersion: 3,
    aspectRatio: aspect,
    concurrentPrompts: 1,
    outputCount,
    maxRetries: flow.maxRetries,
    autoDownloadImageQuality: imageQ,
    defaultImageOption: imageOpt,
    defaultMode: 'textToImage',
  }

  const geminiPatch: Record<string, unknown> = {
    migrationVersion: 3,
    aspectRatio: aspect,
    concurrentPrompts: 1,
    outputCount,
    imageOutputCount: 1,
    imageToVideoOutputCount: 1,
    componentsToImageOutputCount: 1,
    maxRetries: flow.maxRetries,
    // Gemini pack labels use 720p-style strings
    autoDownloadVideoQuality: videoQ === '720' ? '720p' : videoQ === '4k' ? '720p' : '720p',
    autoDownloadImageQuality: imageQ,
    defaultVideoOption: flow.defaultVideoOption.startsWith('6') ? '6s' : '10s',
    defaultImageOption: imageOpt,
    defaultMode: 'textToImage',
  }

  const grokPatch: Record<string, unknown> = {
    migrationVersion: 5,
    aspectRatio: aspect,
    concurrentPrompts: 1,
    outputCount,
    imageOutputCount: 1,
    maxRetries: flow.maxRetries,
    defaultVideoOption: '6s',
    defaultImageOption: imageOpt,
    autoDownloadImageQuality: imageQ,
  }

  return {
    'flow-automation': flowPatch,
    'chatgpt-automation': chatgptPatch,
    'gemini-automation': geminiPatch,
    'grok-automation': grokPatch,
  }
}

async function evaluateInTarget(
  session: CdpSession,
  targetId: string,
  expression: string,
): Promise<unknown> {
  const sessionId = await session.attachPage(targetId)
  await session.send('Runtime.enable', {}, sessionId).catch(() => null)
  const result = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId) as {
    result?: { value?: unknown, subtype?: string, description?: string }
    exceptionDetails?: { text?: string }
  }
  if (result?.exceptionDetails)
    throw new Error(result.exceptionDetails.text || 'evaluate exception')
  return result?.result?.value
}

function findExtensionTarget(
  targets: Awaited<ReturnType<typeof listCdpTargets>>,
  extensionId: string,
) {
  const prefix = `chrome-extension://${extensionId}/`
  const sw = targets.find(t =>
    (t.type === 'service_worker' || t.type === 'background_page')
    && String(t.url || '').startsWith(prefix),
  )
  if (sw)
    return sw
  return targets.find(t => String(t.url || '').startsWith(prefix))
}

async function closeCdpTarget(cdpEndpoint: string, targetId: string) {
  const base = cdpEndpoint.replace(/\/$/, '')
  // DevTools HTTP: /json/close/{id}
  await fetch(`${base}/json/close/${targetId}`, {
    method: 'GET',
    signal: AbortSignal.timeout(3000),
  }).catch(() => null)
}

/**
 * Close leftover automation side-panel / chrome-extension pages so Flow jobs
 * don't leave ChatGPT/Grok/Gemini pack UI tabs open.
 */
export async function closeAutomationSidePanelTabs(
  cdpEndpoint: string,
  opts?: { keepPackIds?: string[] },
): Promise<number> {
  const keep = new Set(opts?.keepPackIds || [])
  const keepIds = new Set(
    PACK_STORAGE_TARGETS
      .filter(t => keep.has(t.packId))
      .map(t => t.extensionId),
  )
  const targets = await listCdpTargets(cdpEndpoint)
  let closed = 0
  for (const t of targets) {
    if (t.type !== 'page')
      continue
    const url = String(t.url || '')
    if (!url.startsWith('chrome-extension://'))
      continue
    // Only our automation packs
    const pack = PACK_STORAGE_TARGETS.find(p => url.includes(p.extensionId))
    if (!pack)
      continue
    if (keepIds.has(pack.extensionId) && !url.includes('side-panel'))
      continue
    // Always close side-panel pages (they were only for storage write wake-up)
    if (url.includes('side-panel') || url.includes('index.html')) {
      await closeCdpTarget(cdpEndpoint, t.id)
      closed++
    }
  }
  return closed
}

/**
 * Merge patch into chrome.storage.local[storageKey] inside extension context.
 * Prefer service_worker — only open side-panel as last resort, then close it.
 */
export async function pushStorageToExtensionOnCdp(input: {
  cdpEndpoint: string
  extensionId: string
  storageKey: string
  patch: Record<string, unknown>
  sidePanelPath?: string
}): Promise<{ ok: boolean, via?: string, error?: string, applied?: Record<string, unknown> }> {
  const base = input.cdpEndpoint.replace(/\/$/, '')
  let targets = await listCdpTargets(input.cdpEndpoint)
  let target = findExtensionTarget(targets, input.extensionId)
  let openedSidePanelId: string | null = null

  // Prefer existing service_worker; only open side-panel if nothing extension-related is alive
  const preferSw = targets.find(t =>
    (t.type === 'service_worker' || t.type === 'background_page')
    && String(t.url || '').startsWith(`chrome-extension://${input.extensionId}/`),
  )
  if (preferSw)
    target = preferSw

  if (!target) {
    const panel = input.sidePanelPath || 'src/ui/side-panel/index.html'
    const url = `chrome-extension://${input.extensionId}/${panel}`
    await fetch(`${base}/json/new?${encodeURIComponent(url)}`, {
      method: 'PUT',
      signal: AbortSignal.timeout(5000),
    }).catch(() =>
      fetch(`${base}/json/new?${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) }),
    )
    await new Promise(r => setTimeout(r, 900))
    targets = await listCdpTargets(input.cdpEndpoint)
    target = findExtensionTarget(targets, input.extensionId)
    const panelPage = targets.find(t =>
      t.type === 'page' && String(t.url || '').includes(input.extensionId) && String(t.url || '').includes('side-panel'),
    )
    if (panelPage?.id)
      openedSidePanelId = panelPage.id
  }

  if (!target?.id) {
    return {
      ok: false,
      error: `extension_target_not_found:${input.extensionId} (is pack loaded on this seat?)`,
    }
  }

  const browserWs = await getBrowserWsUrl(input.cdpEndpoint)
  const session = new CdpSession(browserWs)
  try {
    await session.connect()
    // Wait for extension page context (chrome.storage) — can lag right after json/new
    const expr = `(async () => {
      const key = ${JSON.stringify(input.storageKey)};
      const patch = ${JSON.stringify(input.patch)};
      for (let i = 0; i < 40; i++) {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return { ok: false, error: 'no_chrome_storage' };
      }
      const cur = await chrome.storage.local.get(key);
      const prev = (cur && cur[key] && typeof cur[key] === 'object') ? cur[key] : {};
      const next = Object.assign({}, prev, patch);
      if (typeof patch.migrationVersion === 'number') {
        next.migrationVersion = Math.max(Number(prev.migrationVersion) || 0, patch.migrationVersion);
      }
      await chrome.storage.local.set({ [key]: next });
      const verify = await chrome.storage.local.get(key);
      return { ok: true, applied: verify[key] || next };
    })()`
    const value = await evaluateInTarget(session, target.id, expr) as {
      ok?: boolean
      error?: string
      applied?: Record<string, unknown>
    }
    if (!value?.ok) {
      return { ok: false, error: value?.error || 'storage_set_failed', via: target.url }
    }
    return {
      ok: true,
      via: `${target.type || 'target'}:${target.url || target.id}`,
      applied: value.applied,
    }
  }
  catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  finally {
    await session.close()
    // Do not leave ChatGPT/Grok/Gemini/Flow side-panel tabs cluttering the seat
    if (openedSidePanelId)
      await closeCdpTarget(input.cdpEndpoint, openedSidePanelId)
  }
}

export type SeatPushTarget = {
  seatId: string
  cdpEndpoint: string
  label?: string
}

/** Known local seats: chatgpt-1..4 on 9480–9483 + workspace online profiles */
export async function resolvePushSeats(): Promise<SeatPushTarget[]> {
  const seats: SeatPushTarget[] = []
  const seen = new Set<string>()

  const tryPort = async (seatId: string, port: number) => {
    const cdpEndpoint = `http://127.0.0.1:${port}`
    try {
      const res = await fetch(`${cdpEndpoint}/json/version`, {
        signal: AbortSignal.timeout(1200),
        cache: 'no-store',
      })
      if (!res.ok)
        return
      if (seen.has(cdpEndpoint))
        return
      seen.add(cdpEndpoint)
      seats.push({ seatId, cdpEndpoint, label: seatId })
    }
    catch { /* offline */ }
  }

  // Primary pool used for Flow GG e2e
  await tryPort('chatgpt-1', 9480)
  await tryPort('chatgpt-2', 9481)
  await tryPort('chatgpt-3', 9482)
  await tryPort('chatgpt-4', 9483)

  try {
    const { getProfiles } = await import('@/app/api/ai/providers/workspace/_store')
    const profiles = await getProfiles()
    for (const p of profiles) {
      const cdp = String(p.cdpEndpoint || '').replace(/\/$/, '')
      if (!cdp || seen.has(cdp))
        continue
      try {
        const res = await fetch(`${cdp}/json/version`, {
          signal: AbortSignal.timeout(1200),
          cache: 'no-store',
        })
        if (!res.ok)
          continue
        seen.add(cdp)
        seats.push({ seatId: p.id, cdpEndpoint: cdp, label: p.name || p.id })
      }
      catch { /* offline */ }
    }
  }
  catch { /* store optional */ }

  return seats
}

/** Default: Flow only — do not wake ChatGPT/Grok/Gemini when user is testing Flow. */
export const DEFAULT_PUSH_PACK_IDS = ['flow-automation'] as const

export async function pushHubDefaultsToAllSeats(input?: {
  flowVeo?: FlowVeoDefaults
  aspectRatio?: string
  /** Packs to write. Default: flow-automation only. */
  packIds?: string[]
  seats?: SeatPushTarget[]
  /** Close automation side-panel tabs after push (default true) */
  closeSidePanels?: boolean
}): Promise<{
  ok: boolean
  seats: Array<{
    seatId: string
    cdpEndpoint: string
    packs: Array<{ packId: string, ok: boolean, via?: string, error?: string, outputCount?: unknown }>
    sidePanelsClosed?: number
  }>
  summary: { seats: number, packOk: number, packFail: number, sidePanelsClosed: number }
  pushedPackIds: string[]
}> {
  const { getResolvedHubMediaDefaults } = await import('./hubMediaSettings')
  const resolved = await getResolvedHubMediaDefaults()
  const flowVeo = input?.flowVeo || resolved.flowVeo
  const aspectRatio = input?.aspectRatio || resolved.defaults.aspectRatio
  const patches = buildPackStoragePatches({ flowVeo, aspectRatio })
  const packIdList = input?.packIds?.length ? input.packIds : [...DEFAULT_PUSH_PACK_IDS]
  const wantPacks = PACK_STORAGE_TARGETS.filter(t => packIdList.includes(t.packId))

  const seats = input?.seats?.length ? input.seats : await resolvePushSeats()
  const rows: Array<{
    seatId: string
    cdpEndpoint: string
    packs: Array<{ packId: string, ok: boolean, via?: string, error?: string, outputCount?: unknown }>
    sidePanelsClosed?: number
  }> = []

  let packOk = 0
  let packFail = 0
  let sidePanelsClosed = 0

  for (const seat of seats) {
    const packResults: Array<{ packId: string, ok: boolean, via?: string, error?: string, outputCount?: unknown }> = []
    for (const t of wantPacks) {
      const patch = patches[t.packId]
      if (!patch) {
        packResults.push({ packId: t.packId, ok: false, error: 'no_patch' })
        packFail++
        continue
      }
      getAutomationPack(t.packId)
      const r = await pushStorageToExtensionOnCdp({
        cdpEndpoint: seat.cdpEndpoint,
        extensionId: t.extensionId,
        storageKey: t.storageKey,
        patch,
        sidePanelPath: t.sidePanelPath,
      })
      if (r.ok)
        packOk++
      else
        packFail++
      packResults.push({
        packId: t.packId,
        ok: r.ok,
        via: r.via,
        error: r.error,
        outputCount: r.applied?.outputCount,
      })
    }
    let closed = 0
    if (input?.closeSidePanels !== false) {
      closed = await closeAutomationSidePanelTabs(seat.cdpEndpoint)
      sidePanelsClosed += closed
    }
    rows.push({
      seatId: seat.seatId,
      cdpEndpoint: seat.cdpEndpoint,
      packs: packResults,
      sidePanelsClosed: closed,
    })
  }

  return {
    ok: packFail === 0 && seats.length > 0,
    seats: rows,
    summary: { seats: seats.length, packOk, packFail, sidePanelsClosed },
    pushedPackIds: wantPacks.map(p => p.packId),
  }
}

export function describePushInventory() {
  return {
    packs: PACK_STORAGE_TARGETS.map(t => ({
      packId: t.packId,
      extensionId: t.extensionId,
      storageKey: t.storageKey,
      registered: Boolean(listAutomationPacks().find(p => p.id === t.packId)),
    })),
    defaultPackIds: [...DEFAULT_PUSH_PACK_IDS],
    note: 'Default push = Flow only. Pass packIds for ChatGPT/Gemini/Grok. Closes side-panel tabs after write.',
  }
}

/** Expose duration mapping for tests */
export function flowDurationHint(flow: FlowVeoDefaults) {
  return videoOptionToSeconds(flow.defaultVideoOption)
}
