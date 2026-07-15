import { createZodDto } from '@yikart/common'
import { z } from 'zod'

export const providerAuthModeSchema = z.enum(['oauth', 'api_key', 'cookie_import', 'extension', 'cdp_profile', 'builtin_relay', '9router'])
export const providerStatusSchema = z.enum(['active', 'cooldown', 'expired', 'disabled'])

export const upsertProviderAccountSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1),
  authMode: providerAuthModeSchema,
  status: providerStatusSchema.default('active'),
  credentials: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  quota: z.record(z.string(), z.unknown()).optional(),
})

export class UpsertProviderAccountDto extends createZodDto(upsertProviderAccountSchema, 'UpsertProviderAccountDto') {}

export const importCookieAccountSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().min(1),
  raw: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export class ImportCookieAccountDto extends createZodDto(importCookieAccountSchema, 'ImportCookieAccountDto') {}

export const selectProviderAccountSchema = z.object({
  providerId: z.string().min(1),
  capability: z.string().optional(),
  strategy: z.enum(['round_robin', 'least_used', 'sticky_per_workflow']).default('least_used'),
  workflowId: z.string().optional(),
})

export class SelectProviderAccountDto extends createZodDto(selectProviderAccountSchema, 'SelectProviderAccountDto') {}

export const providerRouteSchema = z.object({
  providerId: z.string().min(1),
  capability: z.enum(['chat', 'image', 'video', 'workflow']).default('chat'),
  strategy: z.enum(['round_robin', 'least_used', 'sticky_per_workflow']).default('least_used'),
  workflowId: z.string().optional(),
  operation: z.enum(['health_check', 'generate_text']).default('health_check'),
  prompt: z.string().optional(),
  model: z.string().default('cx_agy'),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  dryRun: z.boolean().default(false),
  simulateStatuses: z.array(z.number().int()).max(5).optional(),
})

export class ProviderRouteDto extends createZodDto(providerRouteSchema, 'ProviderRouteDto') {}


export const grokDeviceLoginStartSchema = z.object({
  name: z.string().min(1).default('Grok Account'),
})

export class GrokDeviceLoginStartDto extends createZodDto(grokDeviceLoginStartSchema, 'GrokDeviceLoginStartDto') {}

export const grokDeviceLoginPollSchema = z.object({
  name: z.string().min(1).default('Grok Account'),
  deviceCode: z.string().min(1),
})

export class GrokDeviceLoginPollDto extends createZodDto(grokDeviceLoginPollSchema, 'GrokDeviceLoginPollDto') {}


export const upsertAutomationProfileSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['active', 'disabled']).default('active'),
  description: z.string().optional(),
  steps: z.array(z.record(z.string(), z.unknown())).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
})

export class UpsertAutomationProfileDto extends createZodDto(upsertAutomationProfileSchema, 'UpsertAutomationProfileDto') {}

export const createWorkflowRunSchema = z.object({
  profileId: z.string().optional(),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
})

export class CreateWorkflowRunDto extends createZodDto(createWorkflowRunSchema, 'CreateWorkflowRunDto') {}


export const cdpProfileSmokeSchema = z.object({
  name: z.string().min(1),
  cdpEndpoint: z.string().url().optional(),
  profileType: z.enum(['helium', 'buglogin', 'chrome']).default('chrome'),
  proxyUrl: z.string().optional(),
  expectedHost: z.string().optional(),
  dryRun: z.boolean().default(true),
})

export class CdpProfileSmokeDto extends createZodDto(cdpProfileSmokeSchema, 'CdpProfileSmokeDto') {}

export const socialPublishDryRunSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'youtube', 'pinterest', 'tiktok', 'x', 'linkedin']),
  strategy: z.enum(['api_oauth', 'cookie_session', 'cdp_extension']).default('cdp_extension'),
  title: z.string().min(1).max(100),
  caption: z.string().min(1).max(2200),
  mediaUrls: z.array(z.string().url()).default([]),
  scheduledAt: z.string().optional(),
  dryRun: z.boolean().default(true),
})

export class SocialPublishDryRunDto extends createZodDto(socialPublishDryRunSchema, 'SocialPublishDryRunDto') {}


export const workflowStepInputSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).optional(),
  type: z.enum(['prompt', 'generate_text', 'generate_image', 'generate_video', 'transform', 'browser_action', 'publish', 'wait', 'approval', 'download']),
  input: z.record(z.string(), z.unknown()).default({}),
})

export const executeWorkflowRunSchema = z.object({
  steps: z.array(workflowStepInputSchema).min(1),
  dryRun: z.boolean().default(true),
})

export class ExecuteWorkflowRunDto extends createZodDto(executeWorkflowRunSchema, 'ExecuteWorkflowRunDto') {}


export const cdpScreenshotSchema = z.object({
  cdpEndpoint: z.string().url(),
  expectedHost: z.string().optional(),
  fullPage: z.boolean().default(false),
})

export class CdpScreenshotDto extends createZodDto(cdpScreenshotSchema, 'CdpScreenshotDto') {}

export const cdpRecipeStepSchema = z.object({
  type: z.enum(['assert_host', 'screenshot', 'click', 'type', 'wait', 'manual_checkpoint', 'evaluate']),
  selector: z.string().optional(),
  text: z.string().optional(),
  expression: z.string().optional(),
  expectedHost: z.string().optional(),
  ms: z.number().min(0).max(30000).optional(),
})

export const cdpRecipeSchema = z.object({
  cdpEndpoint: z.string().url(),
  expectedHost: z.string().optional(),
  steps: z.array(cdpRecipeStepSchema).min(1).max(30),
})

export class CdpRecipeDto extends createZodDto(cdpRecipeSchema, 'CdpRecipeDto') {}

export const extensionRecipeSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(['chatgpt', 'grok', 'x', 'facebook', 'instagram', 'pinterest', 'youtube', 'tiktok']),
  profileId: z.string().optional(),
  dryRun: z.boolean().default(true),
  steps: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  settings: z.record(z.string(), z.unknown()).default({}),
})

export class ExtensionRecipeDto extends createZodDto(extensionRecipeSchema, 'ExtensionRecipeDto') {}

export const extensionBridgeRegisterSchema = z.object({
  platform: z.enum(['chatgpt', 'grok', 'x', 'facebook', 'instagram', 'pinterest', 'youtube', 'tiktok']),
  profileId: z.string().min(1),
  name: z.string().min(1).optional(),
  proxyUrl: z.string().optional(),
})

export class ExtensionBridgeRegisterDto extends createZodDto(extensionBridgeRegisterSchema, 'ExtensionBridgeRegisterDto') {}

export const extensionBridgeHeartbeatSchema = z.object({
  providerId: z.string().min(1),
  profileId: z.string().min(1),
  bridgeToken: z.string().min(16),
  url: z.string().optional(),
  status: z.enum(['online', 'idle', 'busy', 'error']).default('online'),
  error: z.string().optional(),
})

export class ExtensionBridgeHeartbeatDto extends createZodDto(extensionBridgeHeartbeatSchema, 'ExtensionBridgeHeartbeatDto') {}

export const extensionBridgeJobSchema = z.object({
  platform: z.enum(['chatgpt', 'grok', 'x', 'facebook', 'instagram', 'pinterest', 'youtube', 'tiktok']),
  profileId: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  settings: z.record(z.string(), z.unknown()).default({}),
})

export class ExtensionBridgeJobDto extends createZodDto(extensionBridgeJobSchema, 'ExtensionBridgeJobDto') {}

export const extensionBridgeJobPollSchema = z.object({
  providerId: z.string().min(1),
  profileId: z.string().min(1),
  bridgeToken: z.string().min(16),
})

export class ExtensionBridgeJobPollDto extends createZodDto(extensionBridgeJobPollSchema, 'ExtensionBridgeJobPollDto') {}

export const extensionBridgeJobCompleteSchema = extensionBridgeJobPollSchema.extend({
  jobId: z.string().min(1),
  ok: z.boolean(),
  logs: z.array(z.record(z.string(), z.unknown())).default([]),
  artifacts: z.array(z.record(z.string(), z.unknown())).default([]),
  error: z.string().optional(),
})

export class ExtensionBridgeJobCompleteDto extends createZodDto(extensionBridgeJobCompleteSchema, 'ExtensionBridgeJobCompleteDto') {}
