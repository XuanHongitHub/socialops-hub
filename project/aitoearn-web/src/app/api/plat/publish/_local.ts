import { join } from 'node:path'
import type { PublishRecordItem } from '@/api/platforms/publish.types'
import { PublishStatus } from '@/api/platforms/publish.constants'
import { readJson, writeJson } from '@/app/api/plat/meta/_local'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
export const publishFile = join(appData, 'SocialsHub', 'social-publish-records.json')

export async function getPublishRecords() {
  return readJson<PublishRecordItem[]>(publishFile, [])
}

export async function savePublishRecords(records: PublishRecordItem[]) {
  await writeJson(publishFile, records)
}

export function makePublishRecord(input: Partial<PublishRecordItem>): PublishRecordItem {
  const now = new Date().toISOString()
  const id = input.id || `pub_${Date.now()}`
  return {
    option: input.option || {},
    userId: input.userId || 'local-admin',
    flowId: input.flowId || id,
    userTaskId: input.userTaskId || '',
    taskId: input.taskId || '',
    taskMaterialId: input.taskMaterialId || '',
    type: input.type || 'video',
    title: input.title || 'Untitled post',
    desc: input.desc || '',
    accountId: input.accountId || '',
    topics: input.topics || [],
    accountType: input.accountType!,
    uid: input.uid || '',
    videoUrl: input.videoUrl || '',
    coverUrl: input.coverUrl || '',
    imgUrlList: input.imgUrlList || [],
    publishTime: input.publishTime || new Date(now),
    status: input.status ?? PublishStatus.UNPUBLISH,
    inQueue: input.inQueue ?? false,
    dataId: input.dataId || '',
    workLink: input.workLink || '',
    linkStatus: input.linkStatus,
    linkError: input.linkError,
    linkMeta: input.linkMeta,
    platformWorkId: input.platformWorkId,
    createdAt: input.createdAt || now,
    updatedAt: now,
    id,
    errorMsg: input.errorMsg || '',
    engagement: input.engagement,
  }
}

export function filterPublishRecords(records: PublishRecordItem[], url: string) {
  const query = new URL(url).searchParams
  const accountType = query.get('accountType')
  const status = query.get('status')
  return records.filter((record) => {
    if (accountType && record.accountType !== accountType)
      return false
    if (status !== null && Number(record.status) !== Number(status))
      return false
    return true
  })
}
