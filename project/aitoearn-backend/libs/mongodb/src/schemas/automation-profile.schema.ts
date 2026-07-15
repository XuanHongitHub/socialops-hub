import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { SchemaTypes } from 'mongoose'
import { DEFAULT_SCHEMA_OPTIONS } from '../mongodb.constants'
import { WithTimestampSchema } from './timestamp.schema'

export type AutomationProfileStatus = 'active' | 'disabled'

@Schema({ ...DEFAULT_SCHEMA_OPTIONS, collection: 'automationProfile' })
export class AutomationProfile extends WithTimestampSchema {
  id: string

  @Prop({ required: true, index: true })
  userId: string

  @Prop({ required: true, type: String })
  name: string

  @Prop({ required: true, type: String, enum: ['active', 'disabled'], default: 'active' })
  status: AutomationProfileStatus

  @Prop({ required: false, type: String })
  description?: string

  @Prop({ required: false, type: [SchemaTypes.Mixed], default: [] })
  steps?: Array<Record<string, unknown>>

  @Prop({ required: false, type: SchemaTypes.Mixed, default: {} })
  settings?: Record<string, unknown>

  @Prop({ required: false, type: Date })
  deletedAt?: Date
}

export const AutomationProfileSchema = SchemaFactory.createForClass(AutomationProfile)

AutomationProfileSchema.index({ userId: 1, status: 1, createdAt: -1 })
AutomationProfileSchema.index({ userId: 1, name: 1, deletedAt: 1 })
