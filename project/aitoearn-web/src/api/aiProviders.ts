import http from '@/utils/request'

export interface ProviderRegistryItem {
  id: string
  name: string
  category: string
  capabilities: string[]
  authModes: string[]
  status: 'ready' | 'planned'
  accountCount: number
  activeAccountCount: number
}

export interface ProviderAccountItem {
  id: string
  providerId: string
  name: string
  authMode: string
  status: string
  hasCredentials: boolean
  metadata?: Record<string, unknown>
  quota?: Record<string, unknown>
  lastHealthStatus?: string
  lastHealthAt?: string
  lastUsedAt?: string
  cooldownUntil?: string
}

export function getProviders() {
  return http.get<ProviderRegistryItem[]>('ai/providers', undefined, true)
}

export function getProviderAccounts() {
  return http.get<ProviderAccountItem[]>('ai/providers/accounts', undefined, true)
}

export function discoverProviderModels(providerId?: string) {
  const path = providerId === 'grok' ? 'ai/providers/grok/models' : 'ai/providers/models'
  return http.get<Array<{ id: string, ownedBy?: string, type?: string }>>(path, undefined, true)
}

export function upsertProviderAccount(data: {
  id?: string
  providerId: string
  name: string
  authMode: string
  status?: string
  credentials?: Record<string, unknown>
  metadata?: Record<string, unknown>
  quota?: Record<string, unknown>
  lastHealthStatus?: string
  lastHealthAt?: string
}) {
  return http.post<ProviderAccountItem>('ai/providers/accounts', data)
}

export function importCookieAccount(data: {
  providerId: string
  name: string
  raw: string
  metadata?: Record<string, unknown>
}) {
  return http.post<ProviderAccountItem>('ai/providers/accounts/import-cookie', data)
}

export function selectProviderAccount(data: {
  providerId: string
  capability?: string
  strategy?: 'round_robin' | 'least_used' | 'sticky_per_workflow'
  workflowId?: string
}) {
  return http.post<ProviderAccountItem>('ai/providers/accounts/select', data)
}

export function routeProviderAccount(data: {
  providerId: string
  capability?: 'chat' | 'image' | 'video' | 'workflow'
  strategy?: 'round_robin' | 'least_used' | 'sticky_per_workflow'
  workflowId?: string
  operation?: 'health_check' | 'generate_text'
  prompt?: string
  model?: string
  maxAttempts?: number
  dryRun?: boolean
  simulateStatuses?: number[]
}) {
  return http.post<Record<string, unknown>>('ai/providers/accounts/dispatch', data)
}

export function checkProviderAccountHealth(id: string) {
  return http.post<ProviderAccountItem & { health?: Record<string, unknown> }>(`ai/providers/accounts/${id}/health`, {})
}

export function disableProviderAccount(id: string) {
  return http.patch<ProviderAccountItem>(`ai/providers/accounts/${id}/disable`)
}

export function deleteProviderAccount(id: string) {
  return http.delete<{ deleted: boolean, id: string }>(`ai/providers/accounts/${id}`)
}


export interface GrokDeviceLoginResult {
  status: 'pending' | 'completed'
  deviceCode?: string
  userCode?: string
  verificationUri?: string
  verificationUriComplete?: string
  expiresIn?: number
  interval?: number
  account?: ProviderAccountItem
  error?: string
}

export function startGrokDeviceLogin(name: string) {
  return http.post<GrokDeviceLoginResult>('ai/providers/grok/oauth/device', { name })
}

export function pollGrokDeviceLogin(data: { name: string, deviceCode: string }) {
  return http.post<GrokDeviceLoginResult>('ai/providers/grok/oauth/device/poll', data)
}


export interface AutomationProfileItem {
  id: string
  name: string
  status: 'active' | 'disabled'
  description?: string
  steps?: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
}

export interface WorkflowRunItem {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
  profileId?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
}

export function getAutomationProfiles() {
  return http.get<AutomationProfileItem[]>('ai/providers/automation-profiles')
}

export function createAutomationProfile(data: {
  name: string
  status?: 'active' | 'disabled'
  description?: string
  steps?: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
}) {
  return http.post<AutomationProfileItem>('ai/providers/automation-profiles', data)
}

export function importExtensionRecipe(data: {
  name: string
  platform: 'chatgpt' | 'grok' | 'x' | 'facebook' | 'instagram' | 'pinterest' | 'youtube' | 'tiktok'
  profileId?: string
  dryRun?: boolean
  steps: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
}) {
  return http.post<AutomationProfileItem>('ai/providers/extension/recipes', data)
}

export function runExtensionRecipe(data: {
  name: string
  platform: 'chatgpt' | 'grok' | 'x' | 'facebook' | 'instagram' | 'pinterest' | 'youtube' | 'tiktok'
  profileId?: string
  dryRun?: boolean
  steps: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
}) {
  return http.post<Record<string, unknown>>('ai/providers/extension/recipes/run', data)
}

export function registerExtensionBridge(data: {
  platform: 'chatgpt' | 'grok' | 'x' | 'facebook' | 'instagram' | 'pinterest' | 'youtube' | 'tiktok'
  profileId: string
  name?: string
  proxyUrl?: string
}) {
  return http.post<Record<string, unknown>>('ai/providers/extension/bridge/register', data)
}

export function heartbeatExtensionBridge(data: {
  providerId: string
  profileId: string
  bridgeToken: string
  url?: string
  status?: 'online' | 'idle' | 'busy' | 'error'
  error?: string
}) {
  return http.post<Record<string, unknown>>('ai/providers/extension/bridge/heartbeat', data)
}

export function queueExtensionBridgeJob(data: {
  platform: 'chatgpt' | 'grok' | 'x' | 'facebook' | 'instagram' | 'pinterest' | 'youtube' | 'tiktok'
  profileId: string
  name: string
  steps: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
}) {
  return http.post<Record<string, unknown>>('ai/providers/extension/bridge/jobs', data)
}

export function getWorkflowRuns() {
  return http.get<WorkflowRunItem[]>('ai/providers/workflow-runs', undefined, true)
}

export function createWorkflowRun(data: {
  name: string
  profileId?: string
  input?: Record<string, unknown>
}) {
  return http.post<WorkflowRunItem>('ai/providers/workflow-runs', data)
}


export function smokeCdpProfile(data: {
  name: string
  cdpEndpoint?: string
  profileType?: 'helium' | 'buglogin' | 'chrome'
  proxyUrl?: string
  expectedHost?: string
  dryRun?: boolean
}) {
  return http.post<Record<string, unknown>>('ai/providers/cdp/smoke', data)
}

export function dryRunSocialPublish(data: {
  platform: 'facebook' | 'instagram' | 'youtube' | 'pinterest' | 'tiktok' | 'x' | 'linkedin'
  strategy?: 'api_oauth' | 'cookie_session' | 'cdp_extension'
  title: string
  caption: string
  mediaUrls?: string[]
  scheduledAt?: string
  dryRun?: boolean
}) {
  return http.post<Record<string, unknown>>('ai/providers/social/publish/dry-run', data)
}


export function executeWorkflowRun(id: string, data: {
  dryRun?: boolean
  steps: Array<{
    key: string
    name?: string
    type: 'prompt' | 'generate_text' | 'generate_image' | 'generate_video' | 'transform' | 'browser_action' | 'publish' | 'wait' | 'approval' | 'download'
    input?: Record<string, unknown>
  }>
}) {
  return http.post<Record<string, unknown>>(`ai/providers/workflow-runs/${id}/execute`, data)
}


export function captureCdpScreenshot(data: {
  cdpEndpoint: string
  expectedHost?: string
  fullPage?: boolean
}) {
  return http.post<Record<string, unknown>>('ai/providers/cdp/screenshot', data)
}

export function executeCdpRecipe(data: {
  cdpEndpoint: string
  expectedHost?: string
  steps: Array<Record<string, unknown>>
}) {
  return http.post<Record<string, unknown>>('ai/providers/cdp/recipe', data)
}

export async function get9RouterProviders() {
  const res = await fetch('/api/local/9router/providers', { cache: 'no-store' })
  if (!res.ok) throw new Error(`9Router providers failed: ${res.status}`)
  return await res.json() as Record<string, unknown>
}

// ── Browser Workspace (CDP + Extension) ──────────────────────────────

export type WorkspaceProfile = {
  id: string
  name: string
  kind: 'cdp' | 'extension' | 'hybrid'
  status: string
  cdpEndpoint?: string
  profileType?: string
  proxyUrl?: string
  expectedHost?: string
  platform?: string
  description?: string
  bridgeToken?: string
  lastSmokeAt?: string
  lastSmokeOk?: boolean
  lastError?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type WorkspaceRecipe = {
  id: string
  name: string
  platform: string
  profileId?: string
  mode: 'cdp' | 'extension' | 'hybrid'
  steps: Array<Record<string, unknown>>
  settings?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type WorkspaceJob = {
  id: string
  name: string
  status: string
  mode: string
  platform?: string
  profileId?: string
  recipeId?: string
  result?: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
  finishedAt?: string
}

export type AutomationPackItem = {
  id: string
  name: string
  shortName: string
  packageStatus: string
  capabilityStatus: string
  capabilities: string[]
  role: string
  path: string
  description: string
}

export type WorkspaceBundle = {
  profiles: WorkspaceProfile[]
  recipes: WorkspaceRecipe[]
  jobs: WorkspaceJob[]
  packs?: AutomationPackItem[]
  bridges?: Array<Record<string, unknown>>
  activity: Array<{
    id: string
    type: string
    message: string
    level: string
    profileId?: string
    jobId?: string
    createdAt: string
    meta?: Record<string, unknown>
  }>
  summary: {
    profileCount: number
    recipeCount: number
    jobCount: number
    onlineCount: number
    queuedJobs: number
    packsVerified?: number
    packsTotal?: number
  }
}

export function getWorkspaceBundle() {
  return http.get<WorkspaceBundle>('ai/providers/workspace', undefined, true)
}

export function workspaceAction(data: Record<string, unknown>) {
  return http.post<Record<string, unknown>>('ai/providers/workspace', data)
}

export async function create9RouterProvider(data: { provider: string, name: string, apiKey: string }) {
  const res = await fetch('/api/local/9router/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`9Router save failed: ${res.status}`)
  return await res.json() as Record<string, unknown>
}

export async function getLocalProviderAccounts() {
  const res = await fetch('/api/local/socialops/providers', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Local provider store failed: ${res.status}`)
  return await res.json() as { accounts: ProviderAccountItem[] }
}

export async function upsertLocalProviderAccount(data: {
  providerId: string
  name: string
  authMode: string
  status?: string
  credentials?: Record<string, unknown>
  metadata?: Record<string, unknown>
  quota?: Record<string, unknown>
}) {
  const res = await fetch('/api/local/socialops/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Local provider save failed: ${res.status}`)
  return await res.json() as { account: ProviderAccountItem }
}
