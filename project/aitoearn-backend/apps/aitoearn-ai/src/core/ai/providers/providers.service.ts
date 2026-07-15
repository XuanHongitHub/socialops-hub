import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { UserType } from '@yikart/common'
import { AutomationProfileRepository, ProviderAccountRepository, WorkflowRunRepository, WorkflowStepRepository } from '@yikart/mongodb'
import { config } from '../../../config'
import { ChatService } from '../chat'
import { CdpProfileSmokeDto, CdpRecipeDto, CdpScreenshotDto, CreateWorkflowRunDto, ExecuteWorkflowRunDto, ExtensionBridgeHeartbeatDto, ExtensionBridgeJobCompleteDto, ExtensionBridgeJobDto, ExtensionBridgeJobPollDto, ExtensionBridgeRegisterDto, ExtensionRecipeDto, GrokDeviceLoginPollDto, ImportCookieAccountDto, ProviderRouteDto, SelectProviderAccountDto, SocialPublishDryRunDto, UpsertAutomationProfileDto, UpsertProviderAccountDto } from './providers.dto'

export interface ProviderRegistryItem {
  id: string
  name: string
  category: string
  capabilities: string[]
  authModes: string[]
  status: 'ready' | 'planned'
}

const nodeRequire = createRequire(__filename)
const ARTIFACT_ROOT = process.env['SOCIALOPS_ARTIFACT_DIR'] || '/app/social-artifacts'

const PROVIDERS: ProviderRegistryItem[] = [
  { id: '9router', name: '9Router', category: 'ai_gateway', capabilities: ['chat', 'image'], authModes: ['api_key', '9router'], status: 'ready' },
  { id: 'grok', name: 'Grok', category: 'ai_video', capabilities: ['chat', 'image', 'video', 'workflow'], authModes: ['oauth', 'api_key', 'cookie_import', 'extension', 'cdp_profile'], status: 'planned' },
  { id: 'chatgpt', name: 'ChatGPT', category: 'ai_workflow', capabilities: ['chat', 'workflow'], authModes: ['oauth', 'cookie_import', 'extension', 'cdp_profile'], status: 'planned' },
  { id: 'seedance', name: 'Seedance', category: 'ai_video', capabilities: ['video'], authModes: ['builtin_relay'], status: 'ready' },
]

@Injectable()
export class ProvidersService {
  constructor(
    private readonly providerAccountRepository: ProviderAccountRepository,
    private readonly automationProfileRepository: AutomationProfileRepository,
    private readonly workflowRunRepository: WorkflowRunRepository,
    private readonly workflowStepRepository: WorkflowStepRepository,
    private readonly chatService: ChatService,
  ) {}

  async listProviders(userId: string) {
    const accounts = await this.providerAccountRepository.listByUser(userId)
    return PROVIDERS.map(provider => ({
      ...provider,
      accountCount: accounts.filter(account => account.providerId === provider.id).length,
      activeAccountCount: accounts.filter(account => account.providerId === provider.id && account.status === 'active').length,
    }))
  }

  async listAccounts(userId: string) {
    const accounts = await this.providerAccountRepository.listByUser(userId)
    return accounts.map(account => this.safeAccount(account))
  }

  async upsertAccount(userId: string, dto: UpsertProviderAccountDto) {
    const credentialsEnc = dto.credentials ? this.encrypt(dto.credentials) : undefined
    const account = await this.providerAccountRepository.upsertByName({
      userId,
      providerId: dto.providerId,
      name: dto.name,
      authMode: dto.authMode,
      status: dto.status,
      ...(credentialsEnc ? { credentialsEnc } : {}),
      metadata: dto.metadata || {},
      quota: dto.quota || {},
    })
    return this.safeAccount(account)
  }


  async importCookieAccount(userId: string, dto: ImportCookieAccountDto) {
    const parsed = this.parseCookieImport(dto.raw)
    if (!parsed.cookies.length) {
      throw new BadRequestException('No cookies found in import payload')
    }
    return await this.upsertAccount(userId, {
      providerId: dto.providerId,
      name: dto.name,
      authMode: 'cookie_import',
      status: 'active',
      credentials: parsed,
      metadata: { ...(dto.metadata || {}), source: 'cookie_import', cookieCount: parsed.cookies.length },
      quota: {},
    } as UpsertProviderAccountDto)
  }

  async selectAccount(userId: string, dto: SelectProviderAccountDto) {
    const [selected] = await this.getProviderCandidates(userId, dto.providerId, dto.capability || '', dto.strategy, dto.workflowId)
    await this.providerAccountRepository.markUsed(selected.id)
    return this.safeAccount(selected)
  }

  async routeProvider(userId: string, dto: ProviderRouteDto) {
    const candidates = await this.getProviderCandidates(userId, dto.providerId, dto.capability, dto.strategy, dto.workflowId)
    const attempts: Array<Record<string, unknown>> = []
    let lastError = 'No provider account attempted'
    for (const [index, account] of candidates.slice(0, dto.maxAttempts).entries()) {
      const simulated = dto.simulateStatuses?.[index]
      try {
        const result: Record<string, unknown> = simulated ? { status: simulated, ok: simulated < 400, simulated: true } : await this.executeProviderOperation(userId, account, dto)
        const retryable = this.isRetryableProviderStatus(Number(result['status'] || 200))
        attempts.push({ accountId: account.id, accountName: account.name, status: result['status'] || 200, ok: result['ok'], retryable, simulated: result['simulated'] || false })
        if (result['ok']) {
          if (!dto.dryRun) {
            await this.markProviderSuccess(account.id, this.providerUsageUnits(result))
          }
          return { ok: true, providerId: dto.providerId, selected: this.safeAccount(account), attempts, result }
        }
        lastError = `provider returned ${String(result['status'] || 'failed')}`
        if (retryable && !dto.dryRun) {
          await this.markProviderFailure(account, Number(result['status'] || 500))
        }
        if (!retryable) {
          break
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        attempts.push({ accountId: account.id, accountName: account.name, ok: false, retryable: true, error: this.safeError(lastError) })
        if (!dto.dryRun) {
          await this.markProviderFailure(account, 500)
        }
      }
    }
    throw new BadRequestException({ message: 'Provider route failed', error: this.safeError(lastError), attempts })
  }

  async checkAccountHealth(userId: string, id: string) {
    const account = await this.providerAccountRepository.getById(id)
    if (!account || account.userId !== userId) {
      throw new NotFoundException('Provider account not found')
    }
    const status = await this.probeAccount(account)
    const updated = await this.providerAccountRepository.markHealth(id, status.ok ? 'ok' : 'failed', {
      status: status.ok ? 'active' : 'cooldown',
      failCount: status.ok ? 0 : Number(account.failCount || 0) + 1,
      cooldownUntil: status.ok ? new Date(0) : new Date(Date.now() + 5 * 60 * 1000),
    })
    return { ...this.safeAccount(updated || account), health: status }
  }

  async disableAccount(userId: string, id: string) {
    const account = await this.providerAccountRepository.getById(id)
    if (!account || account.userId !== userId) {
      return null
    }
    const updated = await this.providerAccountRepository.updateById(id, { status: 'disabled' })
    return this.safeAccount(updated)
  }




  async smokeCdpProfile(userId: string, dto: CdpProfileSmokeDto) {
    const endpoint = dto.cdpEndpoint || ''
    const warnings: string[] = []
    if (!dto.dryRun) {
      throw new BadRequestException('CDP smoke is dry-run only until a profile is explicitly selected by the user')
    }
    if (endpoint && !/^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal|\[?::1\]?)(:\d+)?\/?/.test(endpoint)) {
      throw new BadRequestException('CDP endpoint must be local to avoid wrong-profile automation')
    }
    if (!endpoint) {
      warnings.push('cdpEndpoint missing: manual takeover checkpoint required')
    }
    if (!dto.expectedHost) {
      warnings.push('expectedHost missing: screenshot/domain assertion will be required before live automation')
    }
    return {
      userId,
      status: warnings.length ? 'needs_manual_checkpoint' : 'ready_for_manual_takeover',
      dryRun: true,
      profile: {
        name: dto.name,
        profileType: dto.profileType,
        hasProxy: Boolean(dto.proxyUrl),
        hasCdpEndpoint: Boolean(endpoint),
        expectedHost: dto.expectedHost,
      },
      checks: [
        { key: 'local_cdp_endpoint', ok: !endpoint || /^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal|\[?::1\]?)(:\d+)?\/?/.test(endpoint) },
        { key: 'manual_takeover_checkpoint', ok: true },
        { key: 'wrong_profile_guard', ok: Boolean(dto.expectedHost) },
        { key: 'screenshot_artifact_planned', ok: true },
      ],
      warnings,
    }
  }


  async captureCdpScreenshot(userId: string, dto: CdpScreenshotDto) {
    const endpoint = this.normalizeLocalCdpEndpoint(dto.cdpEndpoint)
    const { page, webSocketUrl, host, hostHeader } = await this.getGuardedCdpPage(endpoint, dto.expectedHost)
    const data = await this.cdpCaptureScreenshot(webSocketUrl, dto.fullPage, hostHeader)
    const stored = await this.storeBase64Artifact(data, 'image/png', 'cdp-screenshot')
    return {
      userId,
      ok: true,
      artifact: {
        type: 'cdp_screenshot',
        mimeType: 'image/png',
        bytes: Buffer.byteLength(data, 'base64'),
        dataUrl: `data:image/png;base64,${data}`,
        ...stored,
        pageTitle: page['title'],
        pageUrl: page['url'],
        host,
        hostHeader,
        capturedAt: new Date().toISOString(),
      },
    }
  }

  async executeCdpRecipe(userId: string, dto: CdpRecipeDto) {
    const endpoint = this.normalizeLocalCdpEndpoint(dto.cdpEndpoint)
    const { page, webSocketUrl, host, hostHeader } = await this.getGuardedCdpPage(endpoint, dto.expectedHost)
    const results: Array<Record<string, unknown>> = []
    const artifacts: Array<Record<string, unknown>> = []
    for (const [index, step] of dto.steps.entries()) {
      if (step.type === 'manual_checkpoint') {
        results.push({ index, type: step.type, status: 'needs_human_takeover', text: step.text || '' })
        break
      }
      if (step.type === 'assert_host') {
        const currentHost = await this.cdpEvaluate(webSocketUrl, 'location.hostname', hostHeader)
        const expected = step.expectedHost || dto.expectedHost
        if (expected && !String(currentHost).includes(expected)) {
          throw new BadRequestException(`Wrong CDP profile/page: expected ${expected}, got ${currentHost}`)
        }
        results.push({ index, type: step.type, ok: true, host: currentHost })
        continue
      }
      if (step.type === 'screenshot') {
        const data = await this.cdpCaptureScreenshot(webSocketUrl, false, hostHeader)
        const artifact = { type: 'cdp_screenshot', mimeType: 'image/png', bytes: Buffer.byteLength(data, 'base64'), dataUrl: `data:image/png;base64,${data}`, ...(await this.storeBase64Artifact(data, 'image/png', 'cdp-recipe')), pageUrl: page['url'], capturedAt: new Date().toISOString() }
        artifacts.push(artifact)
        results.push({ index, type: step.type, ok: true, bytes: artifact.bytes })
        continue
      }
      if (step.type === 'wait') {
        await new Promise(resolve => setTimeout(resolve, step.ms || 500))
        results.push({ index, type: step.type, ok: true, ms: step.ms || 500 })
        continue
      }
      const expression = this.cdpRecipeExpression(step)
      const value = await this.cdpEvaluate(webSocketUrl, expression, hostHeader)
      results.push({ index, type: step.type, ok: true, value })
    }
    return { userId, ok: true, host, pageUrl: page['url'], results, artifacts }
  }

  async dryRunSocialPublish(userId: string, dto: SocialPublishDryRunDto) {
    const matrix: Record<string, { maxCaption: number, needsMedia: boolean, api: boolean, cookie: boolean, cdp: boolean }> = {
      facebook: { maxCaption: 63206, needsMedia: false, api: true, cookie: true, cdp: true },
      instagram: { maxCaption: 2200, needsMedia: true, api: true, cookie: true, cdp: true },
      youtube: { maxCaption: 5000, needsMedia: true, api: true, cookie: false, cdp: true },
      pinterest: { maxCaption: 500, needsMedia: true, api: true, cookie: true, cdp: true },
      tiktok: { maxCaption: 2200, needsMedia: true, api: true, cookie: true, cdp: true },
      x: { maxCaption: 280, needsMedia: false, api: true, cookie: true, cdp: true },
      linkedin: { maxCaption: 3000, needsMedia: false, api: true, cookie: true, cdp: true },
    }
    const capability = matrix[dto.platform]
    const errors: string[] = []
    const warnings: string[] = []
    const strategyOk = dto.strategy === 'api_oauth' ? capability.api : dto.strategy === 'cookie_session' ? capability.cookie : capability.cdp
    if (!strategyOk) {
      errors.push(`${dto.strategy} is not enabled for ${dto.platform}`)
    }
    if (dto.caption.length > capability.maxCaption) {
      errors.push(`caption exceeds ${capability.maxCaption} characters`)
    }
    if (capability.needsMedia && dto.mediaUrls.length === 0) {
      errors.push(`${dto.platform} requires at least one media URL`)
    }
    if (!/[#＠@]/.test(dto.caption)) {
      warnings.push('caption has no hashtag or mention marker')
    }
    if (!dto.dryRun) {
      errors.push('live publish is disabled in this endpoint; use dryRun=true')
    }
    return {
      userId,
      ok: errors.length === 0,
      dryRun: true,
      platform: dto.platform,
      strategy: dto.strategy,
      capability,
      checks: {
        titleLength: dto.title.length,
        captionLength: dto.caption.length,
        mediaCount: dto.mediaUrls.length,
        scheduled: Boolean(dto.scheduledAt),
      },
      errors,
      warnings,
      nextRoute: errors.length ? 'fix_payload' : dto.strategy,
    }
  }

  async listAutomationProfiles(userId: string) {
    return await this.automationProfileRepository.listByUser(userId)
  }

  async createAutomationProfile(userId: string, dto: UpsertAutomationProfileDto) {
    return await this.automationProfileRepository.create({
      userId,
      name: dto.name,
      status: dto.status,
      description: dto.description,
      steps: dto.steps,
      settings: dto.settings,
    })
  }

  async listWorkflowRuns(userId: string) {
    return await this.workflowRunRepository.listByUser(userId)
  }

  async createWorkflowRun(userId: string, dto: CreateWorkflowRunDto) {
    return await this.workflowRunRepository.create({
      userId,
      profileId: dto.profileId,
      name: dto.name,
      status: 'pending',
      input: dto.input,
    })
  }


  async executeWorkflowRun(userId: string, id: string, dto: ExecuteWorkflowRunDto) {
    if (!dto.dryRun) {
      throw new BadRequestException('Workflow executor is dry-run only until live provider routes are explicitly enabled')
    }
    const run = await this.workflowRunRepository.getById(id)
    if (!run || run.userId !== userId) {
      throw new NotFoundException('Workflow run not found')
    }
    await this.workflowRunRepository.updateStatus(id, 'running', { startedAt: new Date() })
    const outputs: Record<string, unknown> = {}
    const artifacts: Array<Record<string, unknown>> = []
    try {
      for (const [index, step] of dto.steps.entries()) {
        const created = await this.workflowStepRepository.create({
          runId: id,
          userId,
          key: step.key,
          name: step.name || step.key,
          order: index,
          status: 'running',
          input: { type: step.type, ...(step.input || {}) },
          startedAt: new Date(),
        })
        const output = await this.executeWorkflowStep(step.type, step.input || {}, outputs, userId)
        outputs[step.key] = output
        if (output && typeof output === 'object' && 'artifact' in output) {
          artifacts.push((output as Record<string, unknown>)['artifact'] as Record<string, unknown>)
        }
        await this.workflowStepRepository.updateStatus(created.id, 'completed', {
          output,
          finishedAt: new Date(),
        })
      }
      const finalOutput = { dryRun: true, stepCount: dto.steps.length, outputs, artifacts }
      const updated = await this.workflowRunRepository.updateStatus(id, 'completed', {
        output: finalOutput,
        finishedAt: new Date(),
      })
      return { run: updated, steps: await this.workflowStepRepository.listByRun(id), output: finalOutput }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failed = await this.workflowRunRepository.updateStatus(id, 'failed', {
        error: message,
        finishedAt: new Date(),
      })
      return { run: failed, error: message, steps: await this.workflowStepRepository.listByRun(id) }
    }
  }

  async startGrokDeviceLogin() {
    const discovery = await this.getGrokDiscovery()
    if (!discovery['device_authorization_endpoint']) {
      throw new Error('xAI OAuth device endpoint is unavailable')
    }
    const body = new URLSearchParams({
      client_id: 'b1a00492-073a-47ea-816f-4c329264a828',
      scope: 'openid profile email offline_access grok-cli:access api:access',
    })
    const response = await fetch(discovery['device_authorization_endpoint'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = await response.json() as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`xAI device login failed: ${String(json['error'] || response.status)}`)
    }
    return {
      status: 'pending',
      deviceCode: json['device_code'],
      userCode: json['user_code'],
      verificationUri: json['verification_uri'],
      verificationUriComplete: json['verification_uri_complete'],
      expiresIn: json['expires_in'],
      interval: json['interval'],
    }
  }

  async pollGrokDeviceLogin(userId: string, dto: GrokDeviceLoginPollDto) {
    const discovery = await this.getGrokDiscovery()
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: 'b1a00492-073a-47ea-816f-4c329264a828',
      device_code: dto.deviceCode,
    })
    const response = await fetch(discovery['token_endpoint'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const json = await response.json() as Record<string, unknown>
    if (!response.ok) {
      const error = String(json['error'] || '')
      if (error === 'authorization_pending' || error === 'slow_down') {
        return { status: 'pending', error }
      }
      throw new Error(`xAI token exchange failed: ${error || response.status}`)
    }

    const expiresIn = Number(json['expires_in'] || 0)
    const account = await this.upsertAccount(userId, {
      providerId: 'grok',
      name: dto.name,
      authMode: 'oauth',
      status: 'active',
      credentials: {
        accessToken: json['access_token'],
        refreshToken: json['refresh_token'],
        idToken: json['id_token'],
        tokenType: json['token_type'],
        expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
        baseUrl: 'https://api.x.ai/v1',
      },
      metadata: { source: 'xai_device_oauth' },
      quota: {},
    } as UpsertProviderAccountDto)
    return { status: 'completed', account }
  }





  private async getCdpJson<T>(url: string) {
    return await new Promise<T>((resolve, reject) => {
      const request = httpRequest(url, { headers: { Host: this.cdpHostHeader(url) }, timeout: 5000 }, (response) => {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if (!response.statusCode || response.statusCode >= 400) {
            reject(new BadRequestException(`CDP request failed: ${response.statusCode || 0}`))
            return
          }
          resolve(JSON.parse(body) as T)
        })
      })
      request.on('timeout', () => {
        request.destroy()
        reject(new BadRequestException('CDP request timeout'))
      })
      request.on('error', () => reject(new BadRequestException('CDP request failed')))
      request.end()
    })
  }

  async importExtensionRecipe(userId: string, dto: ExtensionRecipeDto) {
    return await this.automationProfileRepository.create({
      userId,
      name: dto.name,
      status: 'active',
      description: `${dto.platform} extension recipe`,
      steps: dto.steps,
      settings: { ...dto.settings, mode: 'extension', platform: dto.platform, profileId: dto.profileId },
    })
  }

  async runExtensionRecipe(userId: string, dto: ExtensionRecipeDto) {
    if (!dto.dryRun) {
      throw new BadRequestException('Extension live run requires a connected browser extension bridge; use dryRun=true')
    }
    const logs = dto.steps.map((step, index) => ({
      index,
      ok: true,
      action: String(step['type'] || step['action'] || 'unknown'),
      selector: step['selector'] ? '<redacted-selector-ok>' : undefined,
      checkpoint: step['type'] === 'manual_checkpoint' || step['action'] === 'manual_checkpoint',
    }))
    const artifact = await this.storeJsonArtifact({ userId, platform: dto.platform, name: dto.name, dryRun: true, logs }, 'extension-recipe')
    return { userId, ok: true, dryRun: true, platform: dto.platform, profileId: dto.profileId, bridge: 'pending_extension_install', logs, artifacts: [artifact] }
  }

  async registerExtensionBridge(userId: string, dto: ExtensionBridgeRegisterDto) {
    const bridgeToken = randomBytes(24).toString('base64url')
    const account = await this.upsertAccount(userId, {
      providerId: dto.platform,
      name: dto.name || `Extension Bridge: ${dto.platform}/${dto.profileId}`,
      authMode: 'extension',
      status: 'active',
      credentials: { bridgeToken },
      metadata: { mode: 'extension_bridge', platform: dto.platform, profileId: dto.profileId, proxyUrl: dto.proxyUrl, bridgeStatus: 'registered', registeredAt: new Date().toISOString() },
      quota: { mode: 'local', limit: 0, used: 0, window: 'day' },
    } as UpsertProviderAccountDto)
    return { account, bridgeToken, installHint: 'Store bridgeToken in the browser extension profile. It is returned once and never listed again.' }
  }

  async heartbeatExtensionBridge(userId: string, dto: ExtensionBridgeHeartbeatDto) {
    const account = await this.requireExtensionBridgeAccount(userId, dto.providerId, dto.profileId, dto.bridgeToken)
    const updated = await this.providerAccountRepository.markHealth(account.id, dto.status === 'error' ? 'failed' : 'ok', {
      status: dto.status === 'error' ? 'cooldown' : 'active',
      failCount: dto.status === 'error' ? Number(account.failCount || 0) + 1 : 0,
      cooldownUntil: dto.status === 'error' ? new Date(Date.now() + 60 * 1000) : new Date(0),
      metadata: { ...(account.metadata || {}), bridgeStatus: dto.status, lastUrl: dto.url, lastError: this.safeError(dto.error || ''), lastHeartbeatAt: new Date().toISOString() },
    })
    return { ok: true, account: this.safeAccount(updated || account) }
  }

  async queueExtensionBridgeJob(userId: string, dto: ExtensionBridgeJobDto) {
    const run = await this.workflowRunRepository.create({
      userId,
      name: dto.name,
      status: 'pending',
      input: { mode: 'extension_bridge_job', platform: dto.platform, profileId: dto.profileId, steps: dto.steps, settings: dto.settings },
    })
    return { ok: true, job: run }
  }

  async nextExtensionBridgeJob(userId: string, dto: ExtensionBridgeJobPollDto) {
    await this.requireExtensionBridgeAccount(userId, dto.providerId, dto.profileId, dto.bridgeToken)
    const runs = await this.workflowRunRepository.listByUser(userId)
    const job = runs.find(run => run.status === 'pending'
      && ((run.input || {}) as Record<string, unknown>)['mode'] === 'extension_bridge_job'
      && ((run.input || {}) as Record<string, unknown>)['platform'] === dto.providerId
      && ((run.input || {}) as Record<string, unknown>)['profileId'] === dto.profileId)
    if (!job) {
      return { ok: true, job: null }
    }
    const updated = await this.workflowRunRepository.updateStatus(job.id, 'running', { startedAt: new Date() })
    return { ok: true, job: updated || job }
  }

  async completeExtensionBridgeJob(userId: string, dto: ExtensionBridgeJobCompleteDto) {
    await this.requireExtensionBridgeAccount(userId, dto.providerId, dto.profileId, dto.bridgeToken)
    const run = await this.workflowRunRepository.getById(dto.jobId)
    if (!run || run.userId !== userId) {
      throw new NotFoundException('Extension bridge job not found')
    }
    const artifact = await this.storeJsonArtifact({ userId, jobId: dto.jobId, ok: dto.ok, logs: dto.logs, artifacts: dto.artifacts, error: this.safeError(dto.error || '') }, 'extension-job')
    const updated = await this.workflowRunRepository.updateStatus(dto.jobId, dto.ok ? 'completed' : 'failed', {
      output: { ok: dto.ok, logs: dto.logs, artifacts: [...dto.artifacts, artifact] },
      error: dto.ok ? undefined : this.safeError(dto.error || 'Extension job failed'),
      finishedAt: new Date(),
    })
    return { ok: dto.ok, job: updated || run, artifact }
  }

  private async getGuardedCdpPage(endpoint: string, expectedHost?: string) {
    const hostHeader = this.cdpHostHeader(endpoint)
    const pages = await this.getCdpJson<Array<Record<string, unknown>>>(`${endpoint}/json/list`)
    const page = pages.find(item => item['type'] === 'page' && typeof item['webSocketDebuggerUrl'] === 'string' && this.cdpPageMatchesHost(item, expectedHost))
      || pages.find(item => item['type'] === 'page' && typeof item['webSocketDebuggerUrl'] === 'string')
    if (!page) {
      throw new BadRequestException('No debuggable CDP page found')
    }
    const webSocketUrl = String(page['webSocketDebuggerUrl']).replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal')
    const host = await this.cdpEvaluate(webSocketUrl, 'location.hostname', hostHeader)
    if (expectedHost && host && !String(host).includes(expectedHost)) {
      throw new BadRequestException(`Wrong CDP profile/page: expected ${expectedHost}, got ${host}`)
    }
    return { page, webSocketUrl, host, hostHeader }
  }

  private normalizeLocalCdpEndpoint(raw: string) {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|host\.docker\.internal|\[?::1\]?)(:\d+)?\/?/.test(raw)) {
      throw new BadRequestException('CDP endpoint must be local')
    }
    return raw.replace(/\/$/, '').replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal')
  }

  private async cdpEvaluate(webSocketUrl: string, expression: string, hostHeader = this.cdpHostHeader(webSocketUrl)) {
    const result = await this.cdpCommand(webSocketUrl, 'Runtime.evaluate', { expression, returnByValue: true }, hostHeader)
    return String((((result as Record<string, unknown>)['result'] as Record<string, unknown> | undefined)?.['result'] as Record<string, unknown> | undefined)?.['value'] || '')
  }

  private cdpRecipeExpression(step: { type: string, selector?: string, text?: string, expression?: string }) {
    if (step.type === 'evaluate') {
      return step.expression || 'true'
    }
    const selector = JSON.stringify(step.selector || '')
    if (step.type === 'click') {
      return `(() => { const el = document.querySelector(${selector}); if (!el) throw new Error('selector_not_found'); el.click(); return true })()`
    }
    if (step.type === 'type') {
      const text = JSON.stringify(step.text || '')
      return `(() => { const el = document.querySelector(${selector}); if (!el) throw new Error('selector_not_found'); el.focus(); el.value = ${text}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`
    }
    throw new BadRequestException(`Unsupported CDP recipe step: ${step.type}`)
  }

  private async cdpCaptureScreenshot(webSocketUrl: string, fullPage: boolean, hostHeader = this.cdpHostHeader(webSocketUrl)) {
    if (fullPage) {
      await this.cdpCommand(webSocketUrl, 'Page.enable', {}, hostHeader)
    }
    const result = await this.cdpCommand(webSocketUrl, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage }, hostHeader)
    const data = ((result as Record<string, unknown>)['result'] as Record<string, unknown> | undefined)?.['data']
    if (typeof data !== 'string' || !data) {
      throw new BadRequestException('CDP screenshot returned empty data')
    }
    return data
  }

  private async cdpCommand(webSocketUrl: string, method: string, params: Record<string, unknown>, hostHeader = this.cdpHostHeader(webSocketUrl)) {
    const WebSocketImpl = nodeRequire('ws') as new (url: string, options?: { headers?: Record<string, string> }) => {
      on(event: 'open' | 'message' | 'error', listener: (...args: unknown[]) => void): void
      send(data: string): void
      close(): void
    }
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      let socket: InstanceType<typeof WebSocketImpl> | undefined
      const id = Math.floor(Math.random() * 1_000_000)
      const timeout = setTimeout(() => {
        try { socket?.close() } catch {}
        reject(new BadRequestException(`CDP command timeout: ${method}`))
      }, 8000)
      socket = new WebSocketImpl(webSocketUrl, { headers: { Host: hostHeader } })
      socket.on('open', () => socket?.send(JSON.stringify({ id, method, params })))
      socket.on('message', (data) => {
        const payload = JSON.parse(String(data)) as Record<string, unknown>
        if (payload['id'] !== id) {
          return
        }
        clearTimeout(timeout)
        socket?.close()
        if (payload['error']) {
          reject(new BadRequestException(`CDP command failed: ${method}`))
        } else {
          resolve(payload)
        }
      })
      socket.on('error', () => {
        clearTimeout(timeout)
        reject(new BadRequestException('CDP WebSocket connection failed'))
      })
    })
  }

  private async executeWorkflowStep(type: string, input: Record<string, unknown>, previous: Record<string, unknown>, userId: string) {
    switch (type) {
      case 'prompt':
        return { prompt: String(input['prompt'] || ''), variables: input['variables'] || {}, previousKeys: Object.keys(previous) }
      case 'generate_text': {
        const prompt = String(input['prompt'] || input['text'] || '')
        const model = String(input['model'] || 'cx_agy')
        const result = await this.chatService.userChatCompletion({
          userId,
          userType: UserType.User,
          model,
          messages: [{ role: 'user', content: prompt || 'Generate concise social content.' }],
        })
        return { text: String(result.content || ''), provider: '9router', model, usage: result.usage, dryRun: false }
      }
      case 'generate_image':
      case 'generate_video':
        return { artifact: { type, status: 'planned', prompt: input['prompt'] || '', provider: input['provider'] || 'pending' }, dryRun: true }
      case 'transform':
        return { transformed: input['value'] ?? previous, mode: input['mode'] || 'identity', dryRun: true }
      case 'browser_action':
        return { action: input['action'] || 'manual_takeover', selector: input['selector'], wrongProfileGuard: Boolean(input['expectedHost']), dryRun: true }
      case 'publish':
        return { platform: input['platform'], strategy: input['strategy'] || 'dry_run', status: 'validated_not_posted', dryRun: true }
      case 'wait':
        return { waitedMs: Number(input['ms'] || 0), dryRun: true }
      case 'approval':
        return { status: 'needs_human_approval', message: input['message'] || 'Manual approval required', dryRun: true }
      case 'download':
        return { artifact: { type: 'download', url: input['url'], status: 'planned' }, dryRun: true }
      default:
        throw new BadRequestException(`Unsupported workflow step type: ${type}`)
    }
  }

  private safeAccount(account: Record<string, unknown> | null) {
    if (!account) {
      return null
    }
    const { credentialsEnc: _credentialsEnc, ...safe } = account
    return { ...safe, hasCredentials: Boolean(_credentialsEnc) }
  }

  private async getProviderCandidates(userId: string, providerId: string, capability: string, strategy: string, workflowId?: string) {
    const provider = PROVIDERS.find(item => item.id === providerId)
    if (!provider) {
      throw new NotFoundException('Provider not found')
    }
    if (capability && !provider.capabilities.includes(capability)) {
      throw new BadRequestException('Provider does not support requested capability')
    }
    const now = Date.now()
    const accounts = (await this.providerAccountRepository.listActiveByProvider(userId, providerId))
      .filter(account => !account.cooldownUntil || new Date(account.cooldownUntil).getTime() <= now)
      .filter(account => !this.isQuotaExceeded(account))
    if (!accounts.length) {
      throw new NotFoundException('No active provider account available')
    }
    if (strategy === 'sticky_per_workflow') {
      const index = this.hashIndex(workflowId || userId, accounts.length)
      return [...accounts.slice(index), ...accounts.slice(0, index)]
    }
    if (strategy === 'round_robin') {
      return accounts
    }
    return [...accounts].sort((a, b) => new Date(a.lastUsedAt || 0).getTime() - new Date(b.lastUsedAt || 0).getTime())
  }

  private async executeProviderOperation(userId: string, account: Record<string, unknown>, dto: ProviderRouteDto) {
    if (dto.operation === 'health_check') {
      const health = await this.probeAccount(account)
      return { ok: health.ok, status: health.ok ? 200 : 503, health }
    }
    const result = await this.chatService.userChatCompletion({
      userId,
      userType: UserType.User,
      model: dto.model || String(((account['metadata'] || {}) as Record<string, unknown>)['defaultModel'] || 'cx_agy'),
      messages: [{ role: 'user', content: dto.prompt || 'Reply OK only.' }],
    })
    return { ok: true, status: 200, content: result.content, usage: result.usage, model: result.model || dto.model }
  }

  private isRetryableProviderStatus(status: number) {
    return status === 401 || status === 429 || status >= 500
  }

  private async markProviderSuccess(id: string, usageUnits = 1) {
    const account = await this.providerAccountRepository.getById(id)
    await this.providerAccountRepository.markHealth(id, 'ok', { status: 'active', failCount: 0, cooldownUntil: new Date(0), lastUsedAt: new Date(), quota: this.nextQuota(account?.quota || {}, usageUnits) })
  }

  private async markProviderFailure(account: Record<string, unknown>, status: number) {
    const failCount = Number(account['failCount'] || 0) + 1
    const cooldownMs = status === 401 ? 60 * 60 * 1000 : Math.min(30 * 60 * 1000, 2 ** Math.min(failCount, 6) * 30 * 1000)
    await this.providerAccountRepository.markHealth(String(account['id']), `failed_${status}`, { status: status === 401 ? 'expired' : 'cooldown', failCount, cooldownUntil: new Date(Date.now() + cooldownMs) })
  }

  private safeError(message: string) {
    return message.replace(/(sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|auth_token=[^;\s]+)/g, '<redacted>')
  }

  private async requireExtensionBridgeAccount(userId: string, providerId: string, profileId: string, bridgeToken: string) {
    const accounts = await this.providerAccountRepository.listByUser(userId)
    const account = accounts.find(item => item.providerId === providerId && item.authMode === 'extension' && ((item.metadata || {}) as Record<string, unknown>)['profileId'] === profileId)
    if (!account?.credentialsEnc) {
      throw new NotFoundException('Extension bridge account not found')
    }
    const credentials = this.decrypt(account.credentialsEnc)
    if (credentials['bridgeToken'] !== bridgeToken) {
      throw new BadRequestException('Invalid extension bridge token')
    }
    return account
  }

  private isQuotaExceeded(account: Record<string, unknown>) {
    const quota = this.currentQuota((account['quota'] || {}) as Record<string, unknown>)
    const limit = Number(quota['limit'] || 0)
    return limit > 0 && Number(quota['used'] || 0) >= limit
  }

  private nextQuota(quota: Record<string, unknown>, units: number) {
    const current = this.currentQuota(quota)
    return { ...current, used: Number(current['used'] || 0) + Math.max(1, units), lastUsedAt: new Date().toISOString() }
  }

  private currentQuota(quota: Record<string, unknown>) {
    const window = String(quota['window'] || 'day')
    const startedAt = quota['windowStartedAt'] ? new Date(String(quota['windowStartedAt'])).getTime() : 0
    const ttl = window === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    if (!startedAt || Date.now() - startedAt > ttl) {
      return { ...quota, used: 0, window, windowStartedAt: new Date().toISOString() }
    }
    return quota
  }

  private providerUsageUnits(result: Record<string, unknown>) {
    const usage = (result['usage'] || {}) as Record<string, unknown>
    return Math.max(1, Math.ceil(Number(usage['points'] || usage['total_tokens'] || 1) / 1000))
  }

  private cdpHostHeader(url: string) {
    return new URL(url).host.replace('host.docker.internal', 'localhost').replace('127.0.0.1', 'localhost')
  }

  private cdpPageMatchesHost(page: Record<string, unknown>, expectedHost?: string) {
    if (!expectedHost) {
      return true
    }
    try {
      return new URL(String(page['url'] || '')).hostname.includes(expectedHost)
    } catch {
      return false
    }
  }

  private async storeBase64Artifact(data: string, mimeType: string, prefix: string) {
    const extension = mimeType === 'image/png' ? 'png' : 'bin'
    const fileName = `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}.${extension}`
    const dir = join(ARTIFACT_ROOT, 'socialops')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, fileName), Buffer.from(data, 'base64'))
    return { artifactPath: `/app/social-artifacts/socialops/${fileName}`, artifactName: fileName }
  }

  private async storeJsonArtifact(value: Record<string, unknown>, prefix: string) {
    const fileName = `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}.json`
    const dir = join(ARTIFACT_ROOT, 'socialops')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, fileName), JSON.stringify(value, null, 2), 'utf8')
    return { type: 'json_log', mimeType: 'application/json', artifactPath: `/app/social-artifacts/socialops/${fileName}`, artifactName: fileName, bytes: Buffer.byteLength(JSON.stringify(value), 'utf8') }
  }

  private hashIndex(value: string, length: number) {
    return createHash('sha1').update(value).digest().readUInt32BE(0) % length
  }

  private parseCookieImport(raw: string) {
    const [username, password, twoFactor, email, ...cookieParts] = raw.split('|')
    const cookieRaw = cookieParts.length ? cookieParts.join('|') : raw
    const cookies = cookieRaw
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=')
        return index > 0 ? { name: part.slice(0, index).trim(), value: part.slice(index + 1).trim() } : null
      })
      .filter((cookie): cookie is { name: string, value: string } => Boolean(cookie?.name))
    return {
      username: cookieParts.length ? username : undefined,
      password: cookieParts.length ? password : undefined,
      twoFactor: cookieParts.length ? twoFactor : undefined,
      email: cookieParts.length ? email : undefined,
      cookies,
    }
  }

  private async probeAccount(account: Record<string, unknown>) {
    if (account['providerId'] === '9router') {
      const metadata = (account['metadata'] || {}) as Record<string, unknown>
      const baseUrl = String(metadata['baseUrl'] || 'http://host.docker.internal:20128/v1').replace('localhost', 'host.docker.internal')
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, { signal: AbortSignal.timeout(8000) })
        return { ok: response.ok, status: response.status, provider: '9router', baseUrl }
      } catch (error) {
        return { ok: false, error: String(error), provider: '9router', baseUrl }
      }
    }
    if (account['providerId'] === 'grok') {
      return { ok: Boolean(account['credentialsEnc']), provider: 'grok', mode: account['authMode'] }
    }
    return { ok: true, provider: account['providerId'], mode: account['authMode'], note: 'dry_run_health' }
  }

  private async getGrokDiscovery(): Promise<Record<string, string>> {
    const response = await fetch('https://auth.x.ai/.well-known/openid-configuration')
    const json = await response.json() as Record<string, string>
    if (!response.ok) {
      throw new Error('xAI OAuth discovery failed')
    }
    return json
  }

  private encrypt(value: Record<string, unknown>) {
    const iv = randomBytes(12)
    const key = createHash('sha256').update(config.auth.secret).digest()
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${body.toString('base64')}`
  }

  decrypt(value: string): Record<string, unknown> {
    const [, ivRaw, tagRaw, bodyRaw] = value.split('.')
    const key = createHash('sha256').update(config.auth.secret).digest()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'))
    const body = Buffer.concat([decipher.update(Buffer.from(bodyRaw, 'base64')), decipher.final()]).toString('utf8')
    return JSON.parse(body) as Record<string, unknown>
  }
}


