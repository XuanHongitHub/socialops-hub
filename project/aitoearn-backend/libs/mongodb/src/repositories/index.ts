import { AccountGroupRepository } from './account-group.repository'
import { AccountRepository } from './account.repository'
import { AiLogRepository } from './ai-log.repository'
import { ApiKeyRepository } from './api-key.repository'
import { AssetRepository } from './asset.repository'
import { AutomationProfileRepository } from './automation-profile.repository'
import { BlogRepository } from './blog.repository'
import { ContentGenerationTaskRepository } from './content-generation-task.repository'
import { DraftGenerationMemoryRepository } from './draft-generation-memory.repository'
import { MaterialGroupRepository } from './material-group.repository'
import { MaterialRepository } from './material.repository'
import { MediaGroupRepository } from './media-group.repository'
import { MediaRepository } from './media.repository'
import { NotificationRepository } from './notification.repository'
import { OAuth2CredentialRepository } from './oauth2-credential.repository'
import { PublishRecordRepository } from './publish-record.repository'
import { ProviderAccountRepository } from './provider-account.repository'
import { QrCodeArtImageRepository } from './qr-code-art-image.repository'
import { UserNotificationControlRepository } from './user-notification-control.repository'
import { UserRepository } from './user.repository'
import { WorkflowRunRepository, WorkflowStepRepository } from './workflow-run.repository'

export * from './account-group.repository'
export * from './account.repository'
export * from './ai-log.repository'
export * from './api-key.repository'
export * from './asset.repository'
export * from './automation-profile.repository'
export * from './base.repository'
export * from './blog.repository'
export * from './content-generation-task.repository'
export * from './draft-generation-memory.repository'
export * from './material-group.repository'
export * from './material.repository'
export * from './media-group.repository'
export * from './media.repository'
export * from './notification.repository'
export * from './oauth2-credential.repository'
export * from './publish-record.repository'
export * from './provider-account.repository'
export * from './qr-code-art-image.repository'
export * from './user-notification-control.repository'
export * from './user.repository'
export * from './workflow-run.repository'

export const repositories = [
  AiLogRepository,
  AssetRepository,
  AutomationProfileRepository,
  BlogRepository,
  NotificationRepository,
  UserRepository,
  AccountRepository,
  AccountGroupRepository,
  ApiKeyRepository,
  MediaRepository,
  MediaGroupRepository,
  MaterialGroupRepository,
  MaterialRepository,
  PublishRecordRepository,
  OAuth2CredentialRepository,
  ProviderAccountRepository,
  ContentGenerationTaskRepository,
  DraftGenerationMemoryRepository,
  UserNotificationControlRepository,
  QrCodeArtImageRepository,
  WorkflowRunRepository,
  WorkflowStepRepository,
] as const
