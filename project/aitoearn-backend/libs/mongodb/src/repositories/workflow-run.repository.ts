import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { WorkflowRun, WorkflowRunStatus, WorkflowStep, WorkflowStepStatus } from '../schemas'
import { BaseRepository } from './base.repository'

@Injectable()
export class WorkflowRunRepository extends BaseRepository<WorkflowRun> {
  constructor(
    @InjectModel(WorkflowRun.name) workflowRunModel: Model<WorkflowRun>,
  ) {
    super(workflowRunModel)
  }

  async listByUser(userId: string) {
    return await this.find({ userId }, { sort: { createdAt: -1 } })
  }

  async updateStatus(id: string, status: WorkflowRunStatus, data?: Partial<WorkflowRun>) {
    return await this.updateById(id, { status, ...data })
  }
}

@Injectable()
export class WorkflowStepRepository extends BaseRepository<WorkflowStep> {
  constructor(
    @InjectModel(WorkflowStep.name) workflowStepModel: Model<WorkflowStep>,
  ) {
    super(workflowStepModel)
  }

  async listByRun(runId: string) {
    return await this.find({ runId }, { sort: { order: 1 } })
  }

  async updateStatus(id: string, status: WorkflowStepStatus, data?: Partial<WorkflowStep>) {
    return await this.updateById(id, { status, ...data })
  }
}
