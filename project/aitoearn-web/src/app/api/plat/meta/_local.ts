import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export type MetaTask = {
  state: string
  platform: 'facebook' | 'instagram'
  status: number
  userId: string
  spaceId: string
  accountId?: string
  message?: string
  pages?: FacebookPage[]
  createdAt: string
}

export type FacebookPage = {
  id: string
  name: string
  access_token: string
  picture?: { data?: { url?: string } }
  instagram_business_account?: { id: string, username?: string, name?: string, profile_picture_url?: string }
}

export type LocalSocialAccount = {
  id: string
  type: string
  uid: string
  account: string
  avatar: string
  nickname: string
  access_token?: string
  refresh_token?: string
  loginTime: string
  createTime: string
  updateTime: string
  groupId: string
  status: number
  rank: number
  fansCount: number
  readCount: number
  likeCount: number
  collectCount: number
  forwardCount: number
  commentCount: number
  workCount: number
  income: number
  lastStatsTime: string
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const storeDir = join(appData, 'SocialsHub')
export const accountFile = join(storeDir, 'social-accounts.json')
export const taskFile = join(storeDir, 'meta-auth-tasks.json')
export const groupFile = join(storeDir, 'social-account-groups.json')


type MongoState = {
  client?: any
  db?: any
  failedAt?: number
}

const mongoState: MongoState = {}
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017'
const mongoDbName = process.env.MONGODB_DB || process.env.MONGO_DB || 'socialops_hub'
const mongoEnabled = process.env.SOCIALOPS_STORE !== 'json'

async function loadMongoClient() {
  if (!mongoEnabled)
    return null
  if (mongoState.db)
    return mongoState.db
  if (mongoState.failedAt && Date.now() - mongoState.failedAt < 10000)
    return null
  try {
    const importer = new Function('name', 'return import(name)') as (name: string) => Promise<any>
    const mod = await importer('mongodb')
    const client = new mod.MongoClient(mongoUri, { serverSelectionTimeoutMS: 1200 })
    await client.connect()
    mongoState.client = client
    mongoState.db = client.db(mongoDbName)
    await mongoState.db.collection('social_accounts').createIndex({ id: 1 }, { unique: true })
    await mongoState.db.collection('social_account_groups').createIndex({ id: 1 }, { unique: true })
    return mongoState.db
  }
  catch {
    mongoState.failedAt = Date.now()
    return null
  }
}

function mongoCollectionForFile(file: string) {
  if (file === accountFile)
    return 'social_accounts'
  if (file === groupFile)
    return 'social_account_groups'
  return ''
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  }
  catch {
    return fallback
  }
}

async function seedMongoIfEmpty<T>(collection: any, file: string, fallback: T) {
  const count = await collection.countDocuments()
  if (count > 0)
    return
  const local = await readJsonFile<T>(file, fallback)
  if (Array.isArray(local) && local.length > 0)
    await collection.insertMany(local.map(item => ({ ...item, _source: 'json_import', _syncedAt: new Date() })), { ordered: false }).catch(() => null)
}
export const defaultGroup = {
  id: 'default',
  name: 'Default',
  rank: 0,
  isDefault: true,
}

export function apiOk(data: unknown, url: string) {
  return NextResponse.json({ code: 0, data, message: 'ok', url })
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  const collectionName = mongoCollectionForFile(file)
  if (collectionName) {
    const db = await loadMongoClient()
    if (db) {
      const collection = db.collection(collectionName)
      await seedMongoIfEmpty(collection, file, fallback)
      const rows = await collection.find({}, { projection: { _id: 0, _source: 0, _syncedAt: 0 } }).toArray()
      return rows as T
    }
  }
  return await readJsonFile(file, fallback)
}

export async function writeJson(file: string, data: unknown) {
  const collectionName = mongoCollectionForFile(file)
  if (collectionName) {
    const db = await loadMongoClient()
    if (db) {
      const collection = db.collection(collectionName)
      const rows = Array.isArray(data) ? data : []
      await collection.deleteMany({})
      if (rows.length > 0)
        await collection.insertMany(rows.map(item => ({ ...item, _syncedAt: new Date() })), { ordered: false })
    }
  }
  await mkdir(storeDir, { recursive: true })
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

export async function readBody(req: Request) {
  return await req.json().catch(() => ({})) as Record<string, unknown>
}

export function makeAccount(input: {
  type: string
  uid: string
  account: string
  nickname?: string
  avatar?: string
  accessToken?: string
  refreshToken?: string
  groupId?: string
}): LocalSocialAccount {
  const now = new Date().toISOString()
  return {
    id: `${input.type}_${input.uid}`,
    type: input.type,
    uid: input.uid,
    account: input.account,
    nickname: input.nickname || input.account,
    avatar: input.avatar || '',
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    loginTime: now,
    createTime: now,
    updateTime: now,
    groupId: input.groupId || defaultGroup.id,
    status: 1,
    rank: 0,
    fansCount: 0,
    readCount: 0,
    likeCount: 0,
    collectCount: 0,
    forwardCount: 0,
    commentCount: 0,
    workCount: 0,
    income: 0,
    lastStatsTime: now,
  }
}

export async function upsertAccount(account: LocalSocialAccount) {
  const accounts = await readJson<LocalSocialAccount[]>(accountFile, [])
  const index = accounts.findIndex(item => item.id === account.id)
  if (index >= 0) accounts[index] = { ...accounts[index], ...account, createTime: accounts[index].createTime }
  else accounts.push(account)
  await writeJson(accountFile, accounts)
  return index >= 0 ? accounts[index] : account
}

export async function updateTask(state: string, patch: Partial<MetaTask>) {
  const tasks = await readJson<Record<string, MetaTask>>(taskFile, {})
  tasks[state] = { ...tasks[state], ...patch } as MetaTask
  await writeJson(taskFile, tasks)
  return tasks[state]
}

export async function exchangeFacebookCode(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID || '',
    client_secret: process.env.FACEBOOK_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch(`https://graph.facebook.com/v24.0/oauth/access_token?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as { access_token: string, expires_in?: number }
}

export async function exchangeInstagramCode(code: string, redirectUri: string) {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_CLIENT_ID || '',
    client_secret: process.env.INSTAGRAM_CLIENT_SECRET || '',
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    cache: 'no-store',
  })
  if (!res.ok)
    throw new Error(await res.text())
  return await res.json() as { access_token: string, user_id: number }
}

export function authBaseUrl(req: Request) {
  const host = process.env.APP_DOMAIN || new URL(req.url).host
  return `https://${host}`
}

export function newState() {
  return randomUUID().replaceAll('-', '')
}



export async function getSocialStoreStatus() {
  const db = await loadMongoClient()
  const accounts = db ? await db.collection('social_accounts').countDocuments() : null
  const groups = db ? await db.collection('social_account_groups').countDocuments() : null
  return {
    mode: db ? 'mongodb' : 'json_fallback',
    mongoUri: mongoUri.replace(/:\/\/([^:@]+):([^@]+)@/, '://$1:***@'),
    mongoDbName,
    accountFile,
    groupFile,
    accounts,
    groups,
    driverLoaded: Boolean(db),
  }
}
