import { apiOk, readBody } from '@/app/api/ai/providers/_local'
import { listBridges } from '@/app/api/ai/providers/extension/bridge/_store'
import { listAutomationPacks } from '@/app/api/ai/providers/extension/registry'
import {
  createJob,
  createRecipe,
  deleteProfile,
  getActivity,
  getJobs,
  getProfiles,
  getRecipes,
  probeCdp,
  pushActivity,
  upsertProfile,
  updateJob,
} from './_store'
import {
  listChromeProfileDirectories,
  openPlatformTabs,
  probePlatformLogins,
  verifyExtensionsOnCdp,
} from './seatLauncher'

export async function GET() {
  const [profiles, recipes, jobs, activity, packs, bridges] = await Promise.all([
    getProfiles(),
    getRecipes(),
    getJobs(),
    getActivity(),
    Promise.resolve(listAutomationPacks()),
    listBridges(),
  ])
  const online = profiles.filter(p => p.status === 'online' || p.lastSmokeOk).length
  return apiOk({
    profiles,
    recipes,
    jobs: jobs.slice(0, 50),
    activity: activity.slice(0, 40),
    packs: packs.map(p => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      packageStatus: p.packageStatus,
      capabilityStatus: p.capabilityStatus,
      capabilities: p.capabilities,
      role: p.role,
      path: p.relativeDir,
      description: p.description,
    })),
    bridges: bridges.slice(0, 20),
    summary: {
      profileCount: profiles.length,
      recipeCount: recipes.length,
      jobCount: jobs.length,
      onlineCount: online,
      queuedJobs: jobs.filter(j => j.status === 'queued' || j.status === 'running').length,
      packsVerified: packs.filter(p => p.packageStatus === 'verified').length,
      packsTotal: packs.length,
    },
  }, '/api/ai/providers/workspace')
}

export async function POST(req: Request) {
  const body = await readBody(req)
  const action = String(body.action || '')

  if (action === 'upsert_profile') {
    const profile = await upsertProfile({
      id: body.id ? String(body.id) : undefined,
      name: String(body.name || 'Untitled profile'),
      kind: (body.kind as any) || 'cdp',
      status: (body.status as any) || 'active',
      cdpEndpoint: body.cdpEndpoint ? String(body.cdpEndpoint) : 'http://127.0.0.1:9222',
      profileType: (body.profileType as any) || 'chrome',
      proxyUrl: body.proxyUrl ? String(body.proxyUrl) : undefined,
      expectedHost: body.expectedHost ? String(body.expectedHost) : undefined,
      platform: body.platform ? String(body.platform) : undefined,
      description: body.description ? String(body.description) : undefined,
    })
    await pushActivity({ type: 'profile.upsert', message: `Saved profile “${profile.name}”`, level: 'success', profileId: profile.id })
    return apiOk(profile, '/api/ai/providers/workspace')
  }

  if (action === 'delete_profile') {
    await deleteProfile(String(body.id || ''))
    await pushActivity({ type: 'profile.delete', message: `Deleted profile ${body.id}`, level: 'warn', profileId: String(body.id || '') })
    return apiOk({ ok: true }, '/api/ai/providers/workspace')
  }

  if (action === 'smoke_profile') {
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || null
    const endpoint = body.cdpEndpoint || profile?.cdpEndpoint || 'http://127.0.0.1:9222'
    const job = await createJob({
      name: `Smoke · ${profile?.name || endpoint}`,
      status: 'running',
      mode: 'smoke',
      profileId: profile?.id,
    })
    try {
      const probe = await probeCdp(endpoint)
      const expectedHost = String(body.expectedHost || profile?.expectedHost || '')
      const matched = expectedHost
        ? probe.targets.find((t: any) => String(t.url || '').includes(expectedHost))
        : probe.targets[0]
      if (profile) {
        await upsertProfile({
          ...profile,
          status: probe.ok ? 'online' : 'error',
          lastSmokeAt: new Date().toISOString(),
          lastSmokeOk: probe.ok,
          lastError: probe.ok ? undefined : 'CDP endpoint unreachable',
          metadata: {
            ...(profile.metadata || {}),
            browser: probe.version?.Browser || probe.version?.['User-Agent'],
            targetCount: probe.targetCount,
          },
        })
      }
      const result = {
        ok: probe.ok,
        endpoint: probe.endpoint,
        version: probe.version,
        targetCount: probe.targetCount,
        targets: probe.targets.slice(0, 20).map((t: any) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          url: t.url,
          webSocketDebuggerUrl: t.webSocketDebuggerUrl,
        })),
        matchedTarget: matched
          ? { id: matched.id, title: matched.title, url: matched.url, type: matched.type }
          : null,
        expectedHost: expectedHost || null,
      }
      await updateJob(job.id, {
        status: probe.ok ? 'completed' : 'failed',
        result,
        error: probe.ok ? undefined : 'CDP smoke failed',
        finishedAt: new Date().toISOString(),
      })
      await pushActivity({
        type: 'cdp.smoke',
        message: probe.ok
          ? `CDP online · ${probe.targetCount} target(s) · ${profile?.name || endpoint}`
          : `CDP offline · ${profile?.name || endpoint}`,
        level: probe.ok ? 'success' : 'error',
        profileId: profile?.id,
        jobId: job.id,
        meta: { endpoint: probe.endpoint, targetCount: probe.targetCount },
      })
      return apiOk({ jobId: job.id, ...result }, '/api/ai/providers/workspace')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await updateJob(job.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() })
      if (profile) {
        await upsertProfile({
          ...profile,
          status: 'error',
          lastSmokeAt: new Date().toISOString(),
          lastSmokeOk: false,
          lastError: message,
        })
      }
      await pushActivity({ type: 'cdp.smoke', message: `CDP smoke error: ${message}`, level: 'error', profileId: profile?.id, jobId: job.id })
      return apiOk({ ok: false, jobId: job.id, error: message }, '/api/ai/providers/workspace')
    }
  }

  if (action === 'run_recipe') {
    const profiles = await getProfiles()
    const recipes = await getRecipes()
    const profile = profiles.find(p => p.id === body.profileId) || null
    const recipe = recipes.find(r => r.id === body.recipeId) || null
    const steps = Array.isArray(body.steps) ? body.steps : (recipe?.steps || [])
    const endpoint = body.cdpEndpoint || profile?.cdpEndpoint || 'http://127.0.0.1:9222'
    const expectedHost = String(body.expectedHost || profile?.expectedHost || recipe?.settings?.expectedHost || '')
    const job = await createJob({
      name: String(body.name || recipe?.name || 'Recipe run'),
      status: 'running',
      mode: (body.mode as any) || recipe?.mode || 'cdp',
      platform: String(body.platform || recipe?.platform || profile?.platform || 'web'),
      profileId: profile?.id,
      recipeId: recipe?.id,
      steps,
    })
    try {
      const probe = await probeCdp(endpoint)
      const matched = expectedHost
        ? probe.targets.find((t: any) => String(t.url || '').includes(expectedHost))
        : probe.targets.find((t: any) => t.type === 'page') || probe.targets[0]
      const results = steps.map((step: any) => {
        if (step.type === 'assert_host') {
          const ok = Boolean(matched)
          return { ...step, ok, matchedUrl: matched?.url || null, note: ok ? 'Host matched a live target' : 'No target matched expected host' }
        }
        if (step.type === 'list_targets') {
          return { ...step, ok: probe.ok, targetCount: probe.targetCount }
        }
        if (step.type === 'screenshot') {
          return { ...step, ok: Boolean(matched), note: matched ? 'Target ready (full pixel capture needs WS CDP bridge)' : 'No page target' }
        }
        if (step.type === 'wait') {
          return { ...step, ok: true, note: `Wait ${step.ms || 1000}ms acknowledged` }
        }
        return { ...step, ok: probe.ok, note: 'Step accepted' }
      })
      const ok = probe.ok && results.every((r: any) => r.ok !== false)
      const result = {
        ok,
        dryRun: body.dryRun !== false,
        endpoint: probe.endpoint,
        targetCount: probe.targetCount,
        matchedTarget: matched ? { id: matched.id, title: matched.title, url: matched.url } : null,
        results,
        version: probe.version,
      }
      await updateJob(job.id, {
        status: ok ? (body.dryRun === false ? 'completed' : 'validated') : 'failed',
        result,
        error: ok ? undefined : 'One or more recipe steps failed',
        finishedAt: new Date().toISOString(),
      })
      await pushActivity({
        type: 'recipe.run',
        message: `${ok ? 'Recipe OK' : 'Recipe failed'} · ${job.name}`,
        level: ok ? 'success' : 'error',
        profileId: profile?.id,
        jobId: job.id,
      })
      return apiOk({ jobId: job.id, ...result }, '/api/ai/providers/workspace')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await updateJob(job.id, { status: 'failed', error: message, finishedAt: new Date().toISOString() })
      await pushActivity({ type: 'recipe.run', message: `Recipe error: ${message}`, level: 'error', profileId: profile?.id, jobId: job.id })
      return apiOk({ ok: false, jobId: job.id, error: message }, '/api/ai/providers/workspace')
    }
  }

  if (action === 'save_recipe') {
    const recipe = await createRecipe({
      name: String(body.name || 'Untitled recipe'),
      platform: String(body.platform || 'web'),
      profileId: body.profileId ? String(body.profileId) : undefined,
      mode: (body.mode as any) || 'cdp',
      dryRunDefault: body.dryRunDefault !== false,
      steps: Array.isArray(body.steps) ? body.steps as Array<Record<string, unknown>> : [
        { type: 'list_targets' },
        { type: 'assert_host' },
      ],
      settings: (body.settings as Record<string, unknown>) || {},
    })
    await pushActivity({ type: 'recipe.save', message: `Saved recipe “${recipe.name}”`, level: 'info', profileId: recipe.profileId })
    return apiOk(recipe, '/api/ai/providers/workspace')
  }

  if (action === 'prepare_primary_seat' || action === 'launch_primary_seat' || action === 'launch_seat') {
    try {
      const seatId = String(body.seatId || body.profileId || 'primary')
      const preferredPort = Number(body.cdpPort || body.port || 9340) || 9340
      const kind = (body.kind === 'chrome_named' ? 'chrome_named' : 'app_owned') as 'app_owned' | 'chrome_named'
      const chromeProfileDirectory = body.chromeProfileDirectory
        ? String(body.chromeProfileDirectory)
        : (kind === 'chrome_named' ? 'Profile 6' : undefined)
      const { launchSeat } = await import('./seatLauncher')
      // packMode: clean/login = no ext (CF-safe manual login). all = full packs.
      // openLogins alone does NOT force clean — caller must set packMode for CF sites.
      const packMode = body.packMode ? String(body.packMode) : undefined
      const launch = await launchSeat({
        seatId,
        kind,
        chromeProfileDirectory,
        preferredPort,
        packIds: Array.isArray(body.packIds) ? body.packIds.map(String) : undefined,
        packMode,
        allowReuseTracked: body.force !== true,
        browserEngine: body.browserEngine ? String(body.browserEngine) : 'auto',
        proxy: body.proxy ? String(body.proxy) : undefined,
      })
      if (!launch.ok) {
        await pushActivity({
          type: 'seat.launch',
          message: `Seat launch failed: ${launch.error}`,
          level: 'error',
          profileId: seatId,
        })
        return apiOk({ ...launch, ok: false, error: launch.error }, '/api/ai/providers/workspace')
      }
      const isPrimary = seatId === 'primary' || body.role === 'primary'
      const profile = await upsertProfile({
        id: seatId,
        name: String(body.name || (kind === 'chrome_named'
          ? `Chrome ${chromeProfileDirectory}`
          : (isPrimary ? 'Primary browser seat' : `Seat ${seatId.slice(0, 8)}`))),
        kind: 'hybrid',
        status: 'online',
        cdpEndpoint: launch.cdpEndpoint,
        profileType: 'chrome',
        description: kind === 'chrome_named'
          ? `Chrome named profile · ${chromeProfileDirectory} · all packs forced via load-extension`
          : 'App-owned seat · all automation packs',
        lastSmokeAt: new Date().toISOString(),
        lastSmokeOk: true,
        metadata: {
          role: isPrimary ? 'primary' : (body.role || 'pool'),
          seatKind: kind,
          userDataDir: launch.userDataDir,
          profileDirectory: launch.profileDirectory,
          cdpPort: launch.cdpPort,
          pid: launch.pid,
          extensionPaths: launch.extensionPaths,
          extensionVerify: launch.extensionVerify,
          alreadyRunning: Boolean(launch.alreadyRunning),
          chromePath: launch.chromePath,
        },
      })
      let logins: Awaited<ReturnType<typeof probePlatformLogins>> = []
      if (body.openLogins !== false) {
        try {
          await openPlatformTabs(launch.cdpEndpoint)
          await new Promise(r => setTimeout(r, 1200))
          logins = await probePlatformLogins(launch.cdpEndpoint)
          await upsertProfile({
            id: profile.id,
            name: profile.name,
            kind: profile.kind,
            status: profile.status,
            cdpEndpoint: profile.cdpEndpoint,
            profileType: profile.profileType,
            description: profile.description,
            metadata: {
              ...(profile.metadata || {}),
              logins,
              loginsCheckedAt: new Date().toISOString(),
            },
          })
        }
        catch (probeErr) {
          console.warn('[workspace] login probe failed', probeErr)
        }
      }
      // Auto-pair bridge so extension can poll pair-config without manual paste
      const { registerBridge } = await import('@/app/api/ai/providers/extension/bridge/_store')
      const { saveBridgePair } = await import('./seatSession')
      const reg = await registerBridge({
        platform: 'multi',
        profileId: profile.id,
        name: `${profile.name} bridge`,
      })
      const pair = await saveBridgePair({
        apiBase: 'http://127.0.0.1:6061/api',
        profileId: profile.id,
        bridgeToken: reg.bridgeToken,
        providerId: 'extension-bridge',
        seatName: profile.name,
        updatedAt: new Date().toISOString(),
      })
      await upsertProfile({
        id: profile.id,
        name: profile.name,
        kind: profile.kind,
        status: profile.status,
        cdpEndpoint: profile.cdpEndpoint,
        bridgeToken: reg.bridgeToken,
        metadata: {
          ...(profile.metadata || {}),
          bridgeId: reg.id,
          pairUpdatedAt: pair.updatedAt,
        },
      })

      await pushActivity({
        type: 'seat.launch',
        message: `Primary seat ready · CDP :${launch.cdpPort} · ${launch.extensionPaths.length} packs · bridge paired`,
        level: 'success',
        profileId: profile.id,
        meta: { cdpPort: launch.cdpPort, packs: launch.extensionPaths.length },
      })
      return apiOk({
        ok: true,
        profile,
        launch,
        logins,
        pair,
        bridgeHint: {
          apiBase: pair.apiBase,
          profileId: pair.profileId,
          bridgeToken: pair.bridgeToken,
          providerId: pair.providerId,
          note: 'Bridge auto-paired. Extension polls /api/ai/providers/extension/bridge/pair-config',
        },
      }, '/api/ai/providers/workspace')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[workspace] prepare_primary_seat', error)
      await pushActivity({ type: 'seat.launch', message: `Seat launch exception: ${message}`, level: 'error' })
      return apiOk({ ok: false, error: message }, '/api/ai/providers/workspace')
    }
  }

  if (action === 'export_sessions') {
    const { exportSeatCookies } = await import('./seatSession')
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary')
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || '')
    if (!endpoint)
      return apiOk({ ok: false, error: 'no_cdp_endpoint' }, '/api/ai/providers/workspace')
    const result = await exportSeatCookies({
      seatId: String(profile?.id || body.profileId || 'primary'),
      cdpEndpoint: endpoint,
      platform: body.platform ? String(body.platform) as any : undefined,
    })
    await pushActivity({
      type: 'session.export',
      message: `Exported sessions · ${result.saved?.length || 0} platform(s)`,
      level: result.ok ? 'success' : 'warn',
      profileId: profile?.id,
    })
    return apiOk(result, '/api/ai/providers/workspace')
  }

  if (action === 'restore_sessions') {
    const { restoreSeatCookies } = await import('./seatSession')
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary')
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || '')
    if (!endpoint)
      return apiOk({ ok: false, error: 'no_cdp_endpoint' }, '/api/ai/providers/workspace')
    const result = await restoreSeatCookies({
      seatId: String(body.fromSeatId || profile?.id || 'primary'),
      cdpEndpoint: endpoint,
      platform: body.platform ? String(body.platform) as any : undefined,
    })
    await pushActivity({
      type: 'session.restore',
      message: result.ok
        ? `Restored ${result.restored} cookies · ${(result.platforms || []).join(', ')}`
        : `Restore failed: ${result.error}`,
      level: result.ok ? 'success' : 'error',
      profileId: profile?.id,
    })
    return apiOk(result, '/api/ai/providers/workspace')
  }

  if (action === 'list_sessions') {
    const { listSessionMeta } = await import('./seatSession')
    const sessions = await listSessionMeta(body.profileId ? String(body.profileId) : undefined)
    return apiOk({ sessions }, '/api/ai/providers/workspace')
  }

  if (action === 'save_credential') {
    const { upsertCredential } = await import('./seatSession')
    const platform = String(body.platform || '') as any
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    if (!platform || !email || !password)
      return apiOk({ ok: false, error: 'platform_email_password_required' }, '/api/ai/providers/workspace')
    const result = await upsertCredential({ platform, email, password })
    await pushActivity({
      type: 'credential.save',
      message: `Saved login vault · ${platform} · ${email}`,
      level: 'info',
    })
    return apiOk(result, '/api/ai/providers/workspace')
  }

  if (action === 'list_credentials') {
    const { listCredentials } = await import('./seatSession')
    return apiOk({ credentials: await listCredentials() }, '/api/ai/providers/workspace')
  }

  if (action === 'delete_credential') {
    const { deleteCredential } = await import('./seatSession')
    return apiOk(await deleteCredential(String(body.platform || '') as any), '/api/ai/providers/workspace')
  }

  if (action === 'auto_login') {
    const { assistedAutoLogin } = await import('./seatSession')
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary')
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || '')
    const platform = String(body.platform || 'grok') as any
    if (!endpoint)
      return apiOk({ ok: false, error: 'no_cdp_endpoint' }, '/api/ai/providers/workspace')
    const result = await assistedAutoLogin({ cdpEndpoint: endpoint, platform })
    await pushActivity({
      type: 'session.auto_login',
      message: result.ok
        ? `Assisted login · ${platform} · complete CAPTCHA/2FA if needed`
        : `Auto-login failed · ${platform}: ${(result as any).error}`,
      level: result.ok ? 'info' : 'warn',
      profileId: profile?.id,
    })
    return apiOk(result, '/api/ai/providers/workspace')
  }

  if (action === 'auto_login_all') {
    const { assistedAutoLogin, exportSeatCookies } = await import('./seatSession')
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary')
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || '')
    if (!endpoint)
      return apiOk({ ok: false, error: 'no_cdp_endpoint' }, '/api/ai/providers/workspace')
    const platforms = ['grok', 'chatgpt', 'gemini', 'flow'] as const
    const results: unknown[] = []
    for (const platform of platforms) {
      results.push(await assistedAutoLogin({ cdpEndpoint: endpoint, platform }))
      await new Promise(r => setTimeout(r, 1500))
    }
    // After human may complete challenges, caller should export — we still try snapshot
    let exported = null as unknown
    try {
      exported = await exportSeatCookies({
        seatId: String(profile?.id || 'primary'),
        cdpEndpoint: endpoint,
      })
    }
    catch { /* ignore */ }
    return apiOk({ ok: true, results, exported, note: 'Finish any CAPTCHA/2FA in the seat browser, then Export sessions.' }, '/api/ai/providers/workspace')
  }

  if (action === 'get_pair_status') {
    const { readBridgePair } = await import('./seatSession')
    const pair = await readBridgePair()
    const bridges = await listBridges()
    return apiOk({
      pair,
      bridges: bridges.slice(0, 10),
      pairConfigUrl: 'http://127.0.0.1:6061/api/ai/providers/extension/bridge/pair-config',
    }, '/api/ai/providers/workspace')
  }

  if (action === 'launch_profile_6' || action === 'launch_chrome_profile') {
    const profileDir = String(body.chromeProfileDirectory || body.profileDirectory || 'Profile 6')
    const seatId = String(body.seatId || (profileDir === 'Profile 6' ? 'chrome-profile-6' : `chrome-${profileDir.replace(/\s+/g, '-').toLowerCase()}`))
    // Reuse prepare path
    const inner = await (async () => {
      const reqBody = {
        action: 'launch_seat',
        seatId,
        kind: 'chrome_named',
        chromeProfileDirectory: profileDir,
        name: body.name || `Chrome ${profileDir}`,
        cdpPort: Number(body.cdpPort || 9360) || 9360,
        openLogins: body.openLogins !== false,
        role: body.role || (profileDir === 'Profile 6' ? 'primary' : 'pool'),
        force: body.force === true,
      }
      // recursive call via re-dispatch is messy — call logic inline by posting to self not available
      return reqBody
    })()
    // Direct: mutate body and fall through is hard; call launch + pair here
    try {
      const { launchSeat } = await import('./seatLauncher')
      const { registerBridge } = await import('@/app/api/ai/providers/extension/bridge/_store')
      const { saveBridgePair } = await import('./seatSession')
      const launch = await launchSeat({
        seatId: inner.seatId,
        kind: 'chrome_named',
        chromeProfileDirectory: profileDir,
        preferredPort: Number(inner.cdpPort) || 9360,
        allowReuseTracked: body.force !== true,
        // Named Chrome profiles use stock Chrome (same user-data). Cloak uses its own data dir for app seats.
        browserEngine: body.browserEngine ? String(body.browserEngine) : 'chrome',
      })
      if (!launch.ok) {
        await pushActivity({ type: 'seat.launch', message: `Profile launch failed: ${launch.error}`, level: 'error', profileId: seatId })
        return apiOk({ ...launch, ok: false }, '/api/ai/providers/workspace')
      }
      const reg = await registerBridge({ platform: 'multi', profileId: seatId, name: `Bridge ${profileDir}` })
      const pair = await saveBridgePair({
        apiBase: 'http://127.0.0.1:6061/api',
        profileId: seatId,
        bridgeToken: reg.bridgeToken,
        providerId: 'extension-bridge',
        seatName: `Chrome ${profileDir}`,
        updatedAt: new Date().toISOString(),
      })
      const profile = await upsertProfile({
        id: seatId,
        name: String(body.name || `Chrome ${profileDir}`),
        kind: 'hybrid',
        status: 'online',
        cdpEndpoint: launch.cdpEndpoint,
        profileType: 'chrome',
        bridgeToken: reg.bridgeToken,
        description: `Named Chrome profile with forced pack load · ${profileDir}`,
        lastSmokeAt: new Date().toISOString(),
        lastSmokeOk: true,
        metadata: {
          role: body.role || 'primary',
          seatKind: 'chrome_named',
          profileDirectory: profileDir,
          userDataDir: launch.userDataDir,
          cdpPort: launch.cdpPort,
          extensionPaths: launch.extensionPaths,
          extensionVerify: launch.extensionVerify,
          chromePath: launch.chromePath,
        },
      })
      let logins: Awaited<ReturnType<typeof probePlatformLogins>> = []
      if (body.openLogins !== false) {
        try {
          await openPlatformTabs(launch.cdpEndpoint)
          await new Promise(r => setTimeout(r, 1000))
          logins = await probePlatformLogins(launch.cdpEndpoint)
        }
        catch { /* ignore */ }
      }
      await pushActivity({
        type: 'seat.launch',
        message: `Chrome ${profileDir} · CDP :${launch.cdpPort} · packs ${launch.extensionPaths.length} · extVerify=${launch.extensionVerify?.ok}`,
        level: 'success',
        profileId: seatId,
      })
      return apiOk({
        ok: true,
        profile,
        launch,
        pair,
        logins,
        chromeProfiles: listChromeProfileDirectories(),
      }, '/api/ai/providers/workspace')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return apiOk({ ok: false, error: message }, '/api/ai/providers/workspace')
    }
  }

  if (action === 'create_pool_seat') {
    const seatId = String(body.seatId || `seat-${Date.now().toString(36)}`)
    const { launchSeat } = await import('./seatLauncher')
    const { registerBridge } = await import('@/app/api/ai/providers/extension/bridge/_store')
    const launch = await launchSeat({
      seatId,
      kind: 'app_owned',
      preferredPort: Number(body.cdpPort || 9400) || 9400,
      allowReuseTracked: false,
      browserEngine: body.browserEngine ? String(body.browserEngine) : 'auto',
    })
    if (!launch.ok)
      return apiOk({ ...launch, ok: false }, '/api/ai/providers/workspace')
    const reg = await registerBridge({ platform: 'multi', profileId: seatId, name: body.name ? String(body.name) : seatId })
    const profile = await upsertProfile({
      id: seatId,
      name: String(body.name || `Pool seat ${seatId.slice(-6)}`),
      kind: 'hybrid',
      status: 'online',
      cdpEndpoint: launch.cdpEndpoint,
      bridgeToken: reg.bridgeToken,
      profileType: 'chrome',
      description: 'App-owned pool seat · all packs',
      lastSmokeOk: true,
      lastSmokeAt: new Date().toISOString(),
      metadata: {
        role: 'pool',
        seatKind: 'app_owned',
        userDataDir: launch.userDataDir,
        cdpPort: launch.cdpPort,
        extensionPaths: launch.extensionPaths,
        extensionVerify: launch.extensionVerify,
      },
    })
    await pushActivity({
      type: 'seat.create',
      message: `Pool seat ${profile.name} · :${launch.cdpPort}`,
      level: 'success',
      profileId: seatId,
    })
    return apiOk({ ok: true, profile, launch, bridgeToken: reg.bridgeToken }, '/api/ai/providers/workspace')
  }

  if (action === 'verify_extensions') {
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary')
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || '')
    if (!endpoint)
      return apiOk({ ok: false, error: 'no_cdp' }, '/api/ai/providers/workspace')
    const result = await verifyExtensionsOnCdp(endpoint)
    if (profile) {
      await upsertProfile({
        id: profile.id,
        name: profile.name,
        kind: profile.kind,
        status: profile.status,
        cdpEndpoint: profile.cdpEndpoint,
        metadata: { ...(profile.metadata || {}), extensionVerify: result, extensionVerifiedAt: new Date().toISOString() },
      })
    }
    return apiOk({ ...result, endpoint, ok: result.ok }, '/api/ai/providers/workspace')
  }

  if (action === 'list_chrome_profiles') {
    return apiOk({
      profiles: listChromeProfileDirectories(),
      userDataRoot: process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data`
        : '',
    }, '/api/ai/providers/workspace')
  }

  if (action === 'browser_engines') {
    const { resolveBrowserEngine, getCloakInstallHint } = await import('./seatLauncher')
    const auto = resolveBrowserEngine('auto')
    const cloak = resolveBrowserEngine('cloak')
    const chrome = resolveBrowserEngine('chrome')
    return apiOk({
      preferred: process.env.SOCIALOPS_BROWSER_ENGINE || 'auto',
      auto,
      cloak,
      chrome,
      cloakInstall: getCloakInstallHint(),
      cloakInstalled: Boolean(cloak.path),
    }, '/api/ai/providers/workspace')
  }

  /** Playwright-style: connect Hub to an already-running Chrome (any profile). */
  if (action === 'attach_cdp') {
    const { attachExistingCdp, getBrowserRuntimeStatus } = await import('@/app/api/ai/providers/browserRuntime')
    const result = await attachExistingCdp({
      cdpEndpoint: String(body.cdpEndpoint || body.endpoint || 'http://127.0.0.1:9222'),
      seatId: body.seatId ? String(body.seatId) : 'primary',
      name: body.name ? String(body.name) : 'Attached CDP browser',
      role: (body.role as any) || 'attached',
    })
    if (result.ok) {
      await pushActivity({
        type: 'seat.attach',
        message: `Attached CDP ${result.probe.endpoint} · ${result.probe.targetCount} targets`,
        level: 'success',
        profileId: result.profile.id,
      })
    }
    else {
      await pushActivity({
        type: 'seat.attach',
        message: `Attach failed: ${result.error}`,
        level: 'error',
      })
    }
    const runtime = await getBrowserRuntimeStatus()
    return apiOk({ ...result, runtime }, '/api/ai/providers/workspace')
  }

  if (action === 'browser_runtime_status') {
    const { getBrowserRuntimeStatus } = await import('@/app/api/ai/providers/browserRuntime')
    return apiOk(await getBrowserRuntimeStatus(), '/api/ai/providers/workspace')
  }

  /** Social SEO + Flow/VEO media defaults (draft-box + browser ext models) — get/save/reset */
  if (action === 'get_media_defaults' || action === 'seo_media_defaults') {
    const { getResolvedHubMediaDefaults } = await import('@/app/api/ai/providers/extension/hubMediaSettings')
    const resolved = await getResolvedHubMediaDefaults()
    return apiOk({
      defaults: resolved.defaults,
      product: resolved.product,
      flowVeo: resolved.flowVeo,
      settings: resolved.settings,
      note: 'Hub: 9:16 · 10s · 1080p (Flow/VEO-compatible). Flow only 6s/10s — not 15s. Flow block mirrors VEO Automation Settings v3.2.x.',
    }, '/api/ai/providers/workspace')
  }

  if (action === 'save_media_defaults') {
    const { saveHubMediaSettings } = await import('@/app/api/ai/providers/extension/hubMediaSettings')
    const resolved = await saveHubMediaSettings({
      overrides: (body.overrides as any) || body.defaults || {},
      flowVeo: (body.flowVeo as any) || undefined,
      applyToDraftGeneration: body.applyToDraftGeneration as boolean | undefined,
      tagSeo: body.tagSeo as boolean | undefined,
      reset: body.reset === true,
    })
    let seatPush: unknown = null
    // Default: push Hub → chrome.storage on all online seats (4 chatgpt + workspace)
    if (body.pushToSeats !== false && body.reset !== true) {
      try {
        const { pushHubDefaultsToAllSeats } = await import(
          '@/app/api/ai/providers/extension/extensionSettingsPush'
        )
        // Flow-only unless client lists more packs (avoids opening Grok/ChatGPT tabs)
        const packIds = Array.isArray(body.packIds) && body.packIds.length
          ? body.packIds.map(String)
          : ['flow-automation']
        seatPush = await pushHubDefaultsToAllSeats({
          flowVeo: resolved.flowVeo,
          packIds,
          closeSidePanels: true,
        })
        const sum = (seatPush as any)?.summary
        await pushActivity({
          type: 'settings.push',
          message: sum
            ? `Pushed ${packIds.join(',')} → ${sum.seats} seats · ${sum.packOk} ok / ${sum.packFail} fail · closed ${sum.sidePanelsClosed ?? 0} panels`
            : 'Pack settings push finished',
          level: (sum?.packFail || 0) > 0 ? 'warn' : 'success',
        })
      }
      catch (e) {
        seatPush = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
    await pushActivity({
      type: 'settings.media',
      message: body.reset
        ? 'Media defaults reset · 9:16 · 10s · 1080p + Flow/VEO 3.2.1'
        : `Media defaults saved · ${resolved.defaults.aspectRatio} · ${resolved.defaults.duration}s · ${resolved.defaults.resolution} · Flow ${resolved.flowVeo.defaultVideoOption} · out×${resolved.flowVeo.outputCount ?? 1}`,
      level: 'success',
    })
    return apiOk({
      ok: true,
      defaults: resolved.defaults,
      product: resolved.product,
      flowVeo: resolved.flowVeo,
      settings: resolved.settings,
      seatPush,
    }, '/api/ai/providers/workspace')
  }

  /** Push Hub settings into seat extension chrome.storage (default: Flow only) */
  if (action === 'push_extension_settings' || action === 'push_pack_settings_to_seats') {
    const { pushHubDefaultsToAllSeats, describePushInventory, closeAutomationSidePanelTabs, resolvePushSeats } = await import(
      '@/app/api/ai/providers/extension/extensionSettingsPush'
    )
    if (body.cleanupSidePanelsOnly === true) {
      const seats = await resolvePushSeats()
      let closed = 0
      for (const s of seats)
        closed += await closeAutomationSidePanelTabs(s.cdpEndpoint)
      return apiOk({
        ok: true,
        closed,
        seats: seats.length,
        note: 'Closed automation side-panel tabs only (no settings write).',
      }, '/api/ai/providers/workspace')
    }
    const packIds = Array.isArray(body.packIds) && body.packIds.length
      ? body.packIds.map(String)
      : ['flow-automation']
    const result = await pushHubDefaultsToAllSeats({
      packIds,
      closeSidePanels: body.closeSidePanels !== false,
    })
    await pushActivity({
      type: 'settings.push',
      message: `Push [${packIds.join(',')}] · ${result.summary.seats} seats · ${result.summary.packOk} ok / ${result.summary.packFail} fail · closed ${result.summary.sidePanelsClosed} panels`,
      level: result.summary.packFail > 0 ? 'warn' : 'success',
    })
    return apiOk({
      ...result,
      inventory: describePushInventory(),
      note: 'Default packIds=[flow-automation] only. Pass packIds to include chatgpt/gemini/grok.',
    }, '/api/ai/providers/workspace')
  }

  /** List mirrored author remote-configs (selectors) + inventory */
  if (action === 'list_remote_configs') {
    const { listMirroredConfigs, UPSTREAM_CONFIG_BASES, mirrorRoot } = await import(
      '@/app/api/ai/providers/extension/remoteConfigMirror'
    )
    const { HUB_CONFIG_BASES, UPSTREAM_PACKS } = await import(
      '@/app/api/ai/providers/extension/upstreamPacks'
    )
    const packs = await listMirroredConfigs()
    return apiOk({
      packs,
      hubBases: [...HUB_CONFIG_BASES],
      upstreamBases: [...UPSTREAM_CONFIG_BASES],
      mirrorRoot,
      inventory: UPSTREAM_PACKS.map(p => ({
        id: p.id,
        shortName: p.shortName,
        configPath: p.configPath,
        platforms: p.platforms,
        capabilities: p.capabilities,
      })),
      note: 'Extensions load Hub mirror first; author CDN is final fallback when Hub is down.',
    }, '/api/ai/providers/workspace')
  }

  /** Pull all remote configs from author → SocialsHub disk */
  if (action === 'sync_remote_configs') {
    const { syncAllRemoteConfigs, syncOneRemoteConfig, seedFromDirectory } = await import(
      '@/app/api/ai/providers/extension/remoteConfigMirror'
    )
    // Optional offline seed from repo artifacts
    if (body.seedDir) {
      await seedFromDirectory(String(body.seedDir)).catch(() => 0)
    }
    if (body.packId) {
      try {
        const rec = await syncOneRemoteConfig(String(body.packId))
        await pushActivity({
          type: 'config.sync',
          message: `Remote config synced · ${rec.packId} · ${rec.summary.selectorCount} selectors`,
          level: 'success',
        })
        return apiOk({ ok: true, results: [{ packId: rec.packId, ok: true, summary: rec.summary, source: rec.source }] }, '/api/ai/providers/workspace')
      }
      catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await pushActivity({ type: 'config.sync', message: `Sync failed · ${body.packId}: ${message}`, level: 'error' })
        return apiOk({ ok: false, error: message }, '/api/ai/providers/workspace')
      }
    }
    const result = await syncAllRemoteConfigs()
    await pushActivity({
      type: 'config.sync',
      message: `Remote configs sync · ${result.results.filter(r => r.ok).length}/${result.results.length} ok`,
      level: result.ok ? 'success' : 'warn',
    })
    return apiOk(result, '/api/ai/providers/workspace')
  }

  if (action === 'probe_logins') {
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary') || profiles[0]
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || 'http://127.0.0.1:9222')
    const logins = await probePlatformLogins(endpoint)
    if (profile) {
      await upsertProfile({
        ...profile,
        metadata: {
          ...(profile.metadata || {}),
          logins,
          loginsCheckedAt: new Date().toISOString(),
        },
      })
    }
    await pushActivity({
      type: 'seat.probe',
      message: `Login probe · ${logins.filter(l => l.status === 'ready').length}/${logins.length} ready`,
      level: 'info',
      profileId: profile?.id,
    })
    return apiOk({ ok: true, logins, endpoint }, '/api/ai/providers/workspace')
  }

  if (action === 'open_login_tabs') {
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId) || profiles.find(p => p.id === 'primary')
    const endpoint = String(body.cdpEndpoint || profile?.cdpEndpoint || 'http://127.0.0.1:9222')
    const platforms = Array.isArray(body.platforms) ? body.platforms.map(String) : undefined
    const opened = await openPlatformTabs(endpoint, platforms)
    await pushActivity({
      type: 'seat.open_logins',
      message: `Opened login tabs: ${opened.join(', ') || 'none'}`,
      level: 'info',
      profileId: profile?.id,
    })
    return apiOk({ ok: true, opened, endpoint }, '/api/ai/providers/workspace')
  }

  if (action === 'register_bridge') {
    const { registerBridge } = await import('@/app/api/ai/providers/extension/bridge/_store')
    const reg = await registerBridge({
      platform: String(body.platform || 'multi'),
      profileId: String(body.profileId || 'primary'),
      name: body.name ? String(body.name) : undefined,
    })
    const profile = await upsertProfile({
      id: reg.profileId,
      name: String(body.name || `${body.platform || 'multi'} bridge seat`),
      kind: 'hybrid',
      status: 'online',
      platform: String(body.platform || 'multi'),
      bridgeToken: reg.bridgeToken,
      proxyUrl: body.proxyUrl ? String(body.proxyUrl) : undefined,
      description: 'Browser extension bridge',
      metadata: {
        bridgeId: reg.id,
      },
    })
    const { saveBridgePair } = await import('./seatSession')
    const pair = await saveBridgePair({
      apiBase: 'http://127.0.0.1:6061/api',
      profileId: reg.profileId,
      bridgeToken: reg.bridgeToken,
      providerId: 'extension-bridge',
      seatName: profile.name,
      updatedAt: new Date().toISOString(),
    })
    await pushActivity({
      type: 'bridge.register',
      message: `Extension bridge registered · ${profile.name}`,
      level: 'success',
      profileId: profile.id,
    })
    return apiOk({
      profile,
      bridgeToken: reg.bridgeToken,
      status: 'online',
      apiBase: pair.apiBase,
      providerId: pair.providerId,
      pair,
    }, '/api/ai/providers/workspace')
  }

  if (action === 'heartbeat_bridge') {
    const profiles = await getProfiles()
    const profile = profiles.find(p => p.id === body.profileId)
    if (!profile)
      return apiOk({ ok: false, error: 'Profile not found' }, '/api/ai/providers/workspace')
    const next = await upsertProfile({
      ...profile,
      status: (body.status as any) || 'online',
      lastSmokeAt: new Date().toISOString(),
      lastSmokeOk: body.status !== 'error',
      lastError: body.error ? String(body.error) : undefined,
      metadata: {
        ...(profile.metadata || {}),
        lastUrl: body.url,
        lastHeartbeatAt: new Date().toISOString(),
      },
    })
    return apiOk({ ok: true, profile: next }, '/api/ai/providers/workspace')
  }

  return apiOk({ ok: false, error: `Unknown action: ${action}` }, '/api/ai/providers/workspace')
}
