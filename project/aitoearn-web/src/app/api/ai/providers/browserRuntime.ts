/**
 * Browser runtime channel — same idea as Playwright MCP / Chrome DevTools MCP:
 *
 *   App (control plane)  ←→  CDP (debug port)  ←→  Chrome profile
 *                         ←→  Extension bridge (pair-config + jobs)
 *
 * Two ways to get a live browser (both valid):
 * 1) App-owned seat: launch with --user-data-dir + --load-extension (Prepare primary)
 * 2) Attach: connectOverCDP-style to ANY Chrome already running with --remote-debugging-port
 *    (Profile 6, primary, BugLogin, …) — extensions already in that profile keep working
 */
import { listBridges, queueBridgeJob, registerBridge } from './extension/bridge/_store'
import { buildBrowserModelCatalogFromPacks, parseExtModel } from './extension/extModels'
import { getResolvedHubMediaDefaults } from './extension/hubMediaSettings'
import { SEO_MEDIA_DEFAULTS } from './extension/seoMediaDefaults'
import { listAutomationPacks } from './extension/registry'
import { listLivePoolSeats, resolveOnlineBrowserSeat } from './browserSeatPool'
import { saveBridgePair } from './workspace/seatSession'
import { getProfiles, probeCdp, upsertProfile } from './workspace/_store'

export type { BrowserModelEntry } from './extension/extModels'
export { parseExtModel }
export { SEO_MEDIA_DEFAULTS } from './extension/seoMediaDefaults'

/** Sync catalog — uses product SEO defaults (no disk). Prefer async variant in routes. */
export function buildBrowserModelCatalog() {
  return buildBrowserModelCatalogFromPacks(listAutomationPacks(), {
    seo: SEO_MEDIA_DEFAULTS,
    tagSeo: true,
  })
}

/** Hub-resolved catalog (SEO product + SocialsHub overrides). */
export async function buildBrowserModelCatalogResolved() {
  const { defaults, settings } = await getResolvedHubMediaDefaults()
  return buildBrowserModelCatalogFromPacks(listAutomationPacks(), {
    seo: defaults,
    tagSeo: settings.tagSeo,
  })
}

export async function getBrowserRuntimeStatus() {
  const packs = listAutomationPacks()
  const bridges = await listBridges()
  // Prefer live chatgpt-1..4 pool (primary may be offline / no Google session)
  const resolved = await resolveOnlineBrowserSeat({ allowPrimary: false })
  let cdp: Awaited<ReturnType<typeof probeCdp>> | null = null
  if (resolved?.cdpEndpoint)
    cdp = await probeCdp(resolved.cdpEndpoint)
  const pool = await listLivePoolSeats()
  const bridge = bridges.find(b => b.profileId === (resolved?.id || 'primary'))
    || bridges.find(b => b.status === 'online' || b.status === 'busy')
  return {
    mode: resolved ? 'attached_or_launched' : 'none',
    seat: resolved
      ? {
          id: resolved.id,
          name: resolved.name,
          cdpEndpoint: resolved.cdpEndpoint,
          status: resolved.status,
          hasBridgeToken: Boolean(resolved.hasBridgeToken || bridge?.bridgeToken),
          role: resolved.role,
          userDataDir: resolved.userDataDir,
          source: resolved.source,
        }
      : null,
    cdpOnline: Boolean(cdp?.ok),
    cdpTargetCount: cdp?.targetCount || 0,
    bridgeOnline: bridge?.status === 'online' || bridge?.status === 'busy',
    bridgeLastHeartbeat: bridge?.lastHeartbeatAt,
    packsVerified: packs.filter(p => p.packageStatus === 'verified').length,
    packsTotal: packs.length,
    /** Live pool seats chatgpt-1..4 (content e2e) */
    poolSeats: pool.map(s => ({ id: s.id, cdpEndpoint: s.cdpEndpoint })),
    poolLiveCount: pool.length,
    /** How this mirrors Playwright MCP */
    controlPlane: {
      cdp: 'Same as playwright.connectOverCDP(http://127.0.0.1:PORT)',
      extensionBridge: 'pair-config + jobs/next/complete (like browser MCP extension)',
      appOwnedSeat: 'launch with user-data-dir + load-extension',
      attachExisting: 'workspace action attach_cdp — use Profile 6 / any Chrome with debug port',
      pool: 'chatgpt-1..4 on :9480–:9483 preferred over primary',
    },
  }
}

/**
 * Playwright-style attach: Hub connects to an already-running Chrome (any profile).
 * Does NOT relaunch; does NOT wipe user-data. Extensions already in that profile stay.
 */
export async function attachExistingCdp(input: {
  cdpEndpoint: string
  seatId?: string
  name?: string
  role?: 'primary' | 'pool' | 'attached'
}) {
  const endpoint = String(input.cdpEndpoint || '').replace(/\/$/, '')
  if (!endpoint)
    return { ok: false as const, error: 'cdpEndpoint_required' }

  const probe = await probeCdp(endpoint)
  if (!probe.ok) {
    return {
      ok: false as const,
      error: 'cdp_unreachable',
      detail: 'Start Chrome with --remote-debugging-port=PORT (same as Playwright MCP).',
      endpoint,
    }
  }

  const seatId = String(input.seatId || 'primary')
  const reg = await registerBridge({
    platform: 'multi',
    profileId: seatId,
    name: input.name || 'Attached browser',
  })
  await saveBridgePair({
    apiBase: 'http://127.0.0.1:6061/api',
    profileId: seatId,
    bridgeToken: reg.bridgeToken,
    providerId: 'extension-bridge',
    seatName: input.name || 'Attached browser',
    updatedAt: new Date().toISOString(),
  })

  const profile = await upsertProfile({
    id: seatId,
    name: input.name || 'Attached browser (CDP)',
    kind: 'hybrid',
    status: 'online',
    cdpEndpoint: endpoint,
    profileType: 'chrome',
    bridgeToken: reg.bridgeToken,
    description: 'Attached via CDP (Playwright-style) — keep this Chrome open',
    lastSmokeAt: new Date().toISOString(),
    lastSmokeOk: true,
    metadata: {
      role: input.role || 'attached',
      attachMode: true,
      browser: probe.version?.Browser,
      targetCount: probe.targetCount,
      note: 'Extensions must already be loaded in this Chrome profile (store or unpacked).',
    },
  })

  return {
    ok: true as const,
    profile,
    probe: {
      endpoint: probe.endpoint,
      targetCount: probe.targetCount,
      browser: probe.version?.Browser,
    },
    pair: {
      apiBase: 'http://127.0.0.1:6061/api',
      profileId: seatId,
      bridgeToken: reg.bridgeToken,
    },
  }
}

export async function queueBrowserGenerationJob(input: {
  model: string
  prompt: string
  profileId?: string
  productTitle?: string
  imageUrl?: string
  duration?: number
  aspectRatio?: string
  /** Link bridge job → draft task so complete does not fake Success on queue */
  draftTaskId?: string
}) {
  const parsed = parseExtModel(input.model)
  if (!parsed)
    return { ok: false as const, error: 'not_browser_model' }

  // Prefer requested seat if live; else first live pool seat (chatgpt-1..4)
  const resolved = await resolveOnlineBrowserSeat({
    preferSeatId: input.profileId,
    allowPrimary: false,
  })
  if (!resolved?.cdpEndpoint) {
    return {
      ok: false as const,
      error: 'no_browser_seat',
      message: 'No live browser seat. Open chatgpt-1..4 (ports 9480–9483) or Attach CDP.',
    }
  }
  const profileId = resolved.id
  const seat = { id: resolved.id, cdpEndpoint: resolved.cdpEndpoint }
  const probe = await probeCdp(seat.cdpEndpoint)
  if (!probe.ok) {
    return {
      ok: false as const,
      error: 'cdp_offline',
      message: 'Browser seat CDP offline — re-open chatgpt-1..4 pool seats.',
    }
  }

  const hostByPlatform: Record<string, string> = {
    grok: 'grok.com',
    chatgpt: 'chatgpt.com',
    gemini: 'gemini.google.com',
    flow: 'labs.google',
  }
  const host = hostByPlatform[parsed.platform] || parsed.platform
  const startUrl = parsed.platform === 'flow'
    ? 'https://labs.google/fx/tools/flow'
    : parsed.platform === 'gemini'
      ? 'https://gemini.google.com/app'
      : parsed.platform === 'chatgpt'
        ? 'https://chatgpt.com/'
        : 'https://grok.com/'

  // Steps run entirely in bridge SW background where possible (navigate/assert_host/wait/checkpoint).
  // Avoid depending on content-script on about:blank — that caused "Receiving end does not exist".
  // Hub SEO defaults + Flow/VEO pack defaults (Flow only 6s/10s — never invent 15s for labs.google).
  const { defaults: seo, flowVeo, settings: hubSettings } = await getResolvedHubMediaDefaults()
  const isFlow = parsed.platform === 'flow'
  const {
    clampFlowDurationSeconds,
    flowSettingsForBridgeJob,
    secondsToFlowVideoOption,
  } = await import('./extension/flowVeoDefaults')

  let duration = Number(input.duration) > 0
    ? Math.min(60, Math.max(4, Number(input.duration)))
    : (isFlow
        ? clampFlowDurationSeconds(undefined)
        : seo.duration)
  let aspectRatio = String(input.aspectRatio || '').trim()
    || (isFlow ? flowVeo.aspectRatio : seo.aspectRatio)
  if (isFlow) {
    duration = clampFlowDurationSeconds(duration)
    if (aspectRatio !== '9:16' && aspectRatio !== '16:9')
      aspectRatio = flowVeo.aspectRatio
  }
  const resolution = isFlow
    ? (flowVeo.autoDownloadQualityVideo === '4K' ? '1080p' : flowVeo.autoDownloadQualityVideo)
    : seo.resolution
  const flowJob = isFlow
    ? flowSettingsForBridgeJob(flowVeo, {
        duration,
        aspectRatio,
        prompt: input.prompt,
      })
    : null

  const steps = [
    { type: 'navigate', url: startUrl },
    { type: 'assert_host', expectedHost: host },
    { type: 'wait', ms: 800 },
    {
      type: 'manual_checkpoint',
      text: isFlow
        ? `Flow/VEO ${flowVeo.packVersion}: ${flowJob?.defaultMode} · ${aspectRatio} · ${flowJob?.defaultVideoOption || secondsToFlowVideoOption(duration)} · dl ${flowVeo.autoDownloadQualityVideo}. Open ${startUrl} — pack must generate (shell open ≠ done).`
        : `Browser job: ${parsed.capability} on ${parsed.platform} · SEO ${aspectRatio} · ${duration}s · ${resolution}. Prompt ready on ${startUrl}.`,
    },
  ]

  const job = await queueBridgeJob({
    name: `Draft · ${input.model}`,
    platform: parsed.platform,
    profileId,
    steps,
    settings: {
      model: input.model,
      prompt: input.prompt,
      productTitle: input.productTitle,
      imageUrl: input.imageUrl,
      duration,
      aspectRatio,
      resolution,
      startUrl,
      expectedHost: host,
      capability: parsed.capability,
      packId: parsed.packId,
      draftTaskId: input.draftTaskId || undefined,
      channel: 'browser',
      runtime: 'cdp_plus_extension_bridge',
      seo: {
        aspectRatio,
        duration,
        resolution,
        portraitPixels: seo.portraitPixels,
        applyToDraftGeneration: hubSettings.applyToDraftGeneration,
        source: 'socials_hub_media_defaults',
      },
      // Full Flow Automation settings block (v3.2.x) — synced from Hub, not invent 15s SEO
      flowVeo: flowJob || undefined,
    },
  })

  return {
    ok: true as const,
    job,
    seat: { id: seat.id, cdpEndpoint: seat.cdpEndpoint },
    parsed,
    message: 'Browser job queued — Bridge extension pulls jobs/next on the seat (same control loop as browser MCP).',
  }
}
