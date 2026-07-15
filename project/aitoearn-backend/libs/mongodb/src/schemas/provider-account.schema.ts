import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { DEFAULT_SCHEMA_OPTIONS } from '../mongodb.constants'
import { WithTimestampSchema } from './timestamp.schema'

@Schema({ ...DEFAULT_SCHEMA_OPTIONS, collection: 'providerAccount' })
export class ProviderAccount extends WithTimestampSchema {
  id: string

  @Prop({ required: true, type: String })
  userId: string

  @Prop({ required: true, type: String })
  providerId: string

  @Prop({ required: true, type: String })
  name: string

  @Prop({ required: true, type: String, enum: ['oauth', 'api_key', 'cookie_import', 'extension', 'cdp_profile', 'builtin_relay', '9router'] })
  authMode: string

  @Prop({ required: true, type: String, enum: ['active', 'cooldown', 'expired', 'disabled'], default: 'active' })
  status: string

  @Prop({ required: false, type: String, default: '' })
  credentialsEnc?: string

  @Prop({ required: false, type: Object, default: {} })
  metadata?: Record<string, unknown>

  @Prop({ required: false, type: Object, default: {} })
  quota?: Record<string, unknown>

  @Prop({ required: false, type: Number, default: 0 })
  failCount?: number

  @Prop({ required: false, type: Date })
  cooldownUntil?: Date

  @Prop({ required: false, type: Date })
  lastUsedAt?: Date

  @Prop({ required: false, type: String })
  lastHealthStatus?: string

  @Prop({ required: false, type: Date })
  lastHealthAt?: Date
}

export const ProviderAccountSchema = SchemaFactory.createForClass(ProviderAccount)
ProviderAccountSchema.index({ userId: 1, providerId: 1, name: 1 }, { unique: true })
ProviderAccountSchema.index({ userId: 1, providerId: 1, status: 1 })
