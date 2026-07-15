import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ProviderAccount } from '../schemas'
import { BaseRepository } from './base.repository'

@Injectable()
export class ProviderAccountRepository extends BaseRepository<ProviderAccount> {
  constructor(
    @InjectModel(ProviderAccount.name) providerAccountModel: Model<ProviderAccount>,
  ) {
    super(providerAccountModel)
  }

  async listByUser(userId: string) {
    return await this.find({ userId })
  }

  async listActiveByProvider(userId: string, providerId: string) {
    return await this.find({ userId, providerId, status: 'active' }, { sort: { lastUsedAt: 1, createdAt: 1 } })
  }

  async markUsed(id: string) {
    return await this.updateById(id, { lastUsedAt: new Date() })
  }

  async markHealth(id: string, status: string, data?: Partial<ProviderAccount>) {
    return await this.updateById(id, { lastHealthStatus: status, lastHealthAt: new Date(), ...data })
  }

  async upsertByName(data: Partial<ProviderAccount> & { userId: string, providerId: string, name: string }) {
    return await this.updateOne(
      { userId: data.userId, providerId: data.providerId, name: data.name },
      { $set: data },
      { upsert: true },
    )
  }
}
