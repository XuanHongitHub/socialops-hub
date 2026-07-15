import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AutomationProfile } from '../schemas'
import { BaseRepository } from './base.repository'

@Injectable()
export class AutomationProfileRepository extends BaseRepository<AutomationProfile> {
  constructor(
    @InjectModel(AutomationProfile.name) automationProfileModel: Model<AutomationProfile>,
  ) {
    super(automationProfileModel)
  }

  async listByUser(userId: string) {
    return await this.find({ userId, deletedAt: { $exists: false } }, { sort: { createdAt: -1 } })
  }

  async getByUserIdAndId(userId: string, id: string) {
    return await this.findOne({ _id: id, userId, deletedAt: { $exists: false } })
  }

  async softDelete(id: string) {
    return await this.updateById(id, { deletedAt: new Date() })
  }
}
