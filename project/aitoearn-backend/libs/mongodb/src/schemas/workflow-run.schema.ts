import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { SchemaTypes } from 'mongoose'
import { DEFAULT_SCHEMA_OPTIONS } from '../mongodb.constants'
import { WithTimestampSchema } from './timestamp.schema'

export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled'
export type WorkflowStepStatus = WorkflowRunStatus | 'skipped'

@Schema({ ...DEFAULT_SCHEMA_OPTIONS, collection: 'workflowRun' })
export class WorkflowRun extends WithTimestampSchema {
  id: string

  @Prop({ required: true, index: true })
  userId: string

  @Prop({ required: false, index: true })
  profileId?: string

  @Prop({ required: true, type: String })
  name: string

  @Prop({ required: true, type: String, enum: ['pending', 'running', 'completed', 'failed', 'canceled'], default: 'pending' })
  status: WorkflowRunStatus

  @Prop({ required: false, type: SchemaTypes.Mixed, default: {} })
  input?: Record<string, unknown>

  @Prop({ required: false, type: SchemaTypes.Mixed, default: {} })
  output?: Record<string, unknown>

  @Prop({ required: false, type: String })
  error?: string

  @Prop({ required: false, type: Date })
  startedAt?: Date

  @Prop({ required: false, type: Date })
  finishedAt?: Date
}

@Schema({ ...DEFAULT_SCHEMA_OPTIONS, collection: 'workflowStep' })
export class WorkflowStep extends WithTimestampSchema {
  id: string

  @Prop({ required: true, index: true })
  runId: string

  @Prop({ required: true, index: true })
  userId: string

  @Prop({ required: true, type: String })
  key: string

  @Prop({ required: true, type: String })
  name: string

  @Prop({ required: true, type: Number, default: 0 })
  order: number

  @Prop({ required: true, type: String, enum: ['pending', 'running', 'completed', 'failed', 'canceled', 'skipped'], default: 'pending' })
  status: WorkflowStepStatus

  @Prop({ required: false, type: SchemaTypes.Mixed, default: {} })
  input?: Record<string, unknown>

  @Prop({ required: false, type: SchemaTypes.Mixed, default: {} })
  output?: Record<string, unknown>

  @Prop({ required: false, type: String })
  error?: string

  @Prop({ required: false, type: Date })
  startedAt?: Date

  @Prop({ required: false, type: Date })
  finishedAt?: Date
}

export const WorkflowRunSchema = SchemaFactory.createForClass(WorkflowRun)
export const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep)

WorkflowRunSchema.index({ userId: 1, status: 1, createdAt: -1 })
WorkflowStepSchema.index({ runId: 1, order: 1 })

