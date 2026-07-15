import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJson, writeJson } from '@/app/api/ai/providers/_local'

export type LocalMaterialGroup = {
  id: string
  name: string
  title?: string
  type: 'video' | 'article'
  desc?: string
  materialCount: number
  mediaCount?: number
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

export type LocalMaterial = {
  id: string
  groupId: string
  title: string
  desc?: string
  coverUrl?: string
  mediaList: Array<{ url: string, type: 'img' | 'video', content?: string }>
  type?: string
  status: 0 | 1
  topics?: string[]
  model?: string
  generationParams?: Record<string, unknown>
  accountTypes?: string[]
  useCount?: number
  createdAt: string
  updatedAt: string
  option?: Record<string, unknown>
}

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const groupsFile = join(appData, 'SocialsHub', 'material-groups.json')
const materialsFile = join(appData, 'SocialsHub', 'materials.json')

function normalizeGroup(group: LocalMaterialGroup): LocalMaterialGroup {
  return {
    ...group,
    title: group.title || group.name,
    mediaCount: group.mediaCount ?? group.materialCount ?? 0,
    materialCount: group.materialCount ?? group.mediaCount ?? 0,
  }
}

export async function getMaterialGroups() {
  const groups = await readJson<LocalMaterialGroup[]>(groupsFile, [])
  if (groups.length)
    return groups.map(normalizeGroup)
  const now = new Date().toISOString()
  const initial: LocalMaterialGroup[] = [{
    id: randomUUID(),
    name: 'Default',
    title: 'Default',
    type: 'video',
    materialCount: 0,
    mediaCount: 0,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }]
  await writeJson(groupsFile, initial)
  return initial
}

export async function saveMaterialGroups(groups: LocalMaterialGroup[]) {
  await writeJson(groupsFile, groups.map(normalizeGroup))
}

export async function createMaterialGroup(name: string, desc?: string) {
  const groups = await getMaterialGroups()
  const now = new Date().toISOString()
  const group: LocalMaterialGroup = {
    id: randomUUID(),
    name: name.trim() || 'Untitled',
    title: name.trim() || 'Untitled',
    type: 'video',
    desc,
    materialCount: 0,
    mediaCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  groups.unshift(group)
  await saveMaterialGroups(groups)
  return group
}

export async function getMaterials() {
  return await readJson<LocalMaterial[]>(materialsFile, [])
}

export async function saveMaterials(materials: LocalMaterial[]) {
  await writeJson(materialsFile, materials.slice(0, 500))
}

export async function listMaterials(groupId: string | undefined, page: number, pageSize: number) {
  const all = await getMaterials()
  const filtered = groupId ? all.filter(item => item.groupId === groupId) : all
  const start = (page - 1) * pageSize
  return {
    list: filtered.slice(start, start + pageSize),
    total: filtered.length,
  }
}

export async function getMaterialById(id: string) {
  const materials = await getMaterials()
  return materials.find(m => m.id === id) || null
}

export async function updateMaterialById(
  id: string,
  patch: Partial<Pick<LocalMaterial, 'title' | 'desc' | 'topics' | 'coverUrl' | 'mediaList' | 'option' | 'accountTypes' | 'generationParams'>>,
) {
  const materials = await getMaterials()
  const index = materials.findIndex(m => m.id === id)
  if (index < 0)
    return null
  const next: LocalMaterial = {
    ...materials[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  materials[index] = next
  await saveMaterials(materials)
  return next
}

export async function deleteMaterialsByIds(ids: string[]) {
  if (!ids.length)
    return { deleted: 0 }
  const idSet = new Set(ids)
  // Media tab uses composite ids: `${materialId}_${index}`
  const materialIds = new Set<string>()
  for (const id of ids) {
    materialIds.add(id.includes('_') ? id.split('_')[0] : id)
  }
  const materials = await getMaterials()
  const before = materials.length
  const next = materials.filter(m => !materialIds.has(m.id) && !idSet.has(m.id))
  await saveMaterials(next)
  const deleted = before - next.length

  // Keep group counters roughly in sync
  if (deleted > 0) {
    const groups = await getMaterialGroups()
    const counts = new Map<string, number>()
    for (const m of next)
      counts.set(m.groupId, (counts.get(m.groupId) || 0) + 1)
    const now = new Date().toISOString()
    await saveMaterialGroups(groups.map(g => ({
      ...g,
      materialCount: counts.get(g.id) || 0,
      mediaCount: counts.get(g.id) || 0,
      updatedAt: now,
    })))
  }
  return { deleted }
}

/** Prefer durable local asset routes (outside git), never bare vidgen.x.ai temp links. */
export function toLocalMediaUrl(url: string | undefined | null): string {
  const u = String(url || '').trim()
  if (!u)
    return ''
  const byPath = u.match(/\/api\/ai\/assets\/([^/?#]+)\/file\/?$/i)
  if (byPath?.[1])
    return `/api/ai/assets/local-file?id=${encodeURIComponent(byPath[1])}`
  const byFile = u.match(/\/api\/ai\/assets\/file\/([^/?#]+)/i)
  if (byFile?.[1])
    return `/api/ai/assets/local-file?id=${encodeURIComponent(byFile[1])}`
  if (/local-file/i.test(u)) {
    const q = u.match(/[?&]id=([^&]+)/i)
    if (q?.[1])
      return `/api/ai/assets/local-file?id=${encodeURIComponent(decodeURIComponent(q[1]))}`
  }
  // Remote Grok temp — never store as primary media URL
  if (/vidgen\.x\.ai|xai-vidgen|xai-video/i.test(u))
    return ''
  return u
}

export async function createMaterialFromGeneration(input: {
  groupId: string
  title: string
  desc?: string
  topics?: string[]
  model?: string
  videoUrl?: string
  coverUrl?: string
  imageUrls?: string[]
  generationParams?: Record<string, unknown>
}) {
  const materials = await getMaterials()
  const now = new Date().toISOString()
  const mediaList: LocalMaterial['mediaList'] = []
  const videoUrl = toLocalMediaUrl(input.videoUrl)
  if (videoUrl) {
    mediaList.push({ url: videoUrl, type: 'video' })
  }
  for (const url of input.imageUrls || []) {
    if (url)
      mediaList.push({ url, type: 'img' })
  }
  if (!mediaList.length)
    return null

  const material: LocalMaterial = {
    id: randomUUID(),
    groupId: input.groupId,
    title: input.title || 'Generated content',
    desc: input.desc,
    coverUrl: input.coverUrl
      || (mediaList.find(m => m.type === 'img')?.url)
      || (typeof input.generationParams?.productImageUrl === 'string' ? String(input.generationParams.productImageUrl) : '')
      || '',
    mediaList,
    type: videoUrl ? 'video' : 'article',
    status: 1,
    topics: input.topics || [],
    model: input.model,
    generationParams: {
      ...(input.generationParams || {}),
      // Keep product still for ref fidelity; do not overwrite with video poster cover.
      productImageUrl: input.generationParams?.productImageUrl || input.coverUrl,
    },
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  materials.unshift(material)
  await saveMaterials(materials)

  const groups = await getMaterialGroups()
  const index = groups.findIndex(g => g.id === input.groupId)
  if (index >= 0) {
    groups[index] = {
      ...groups[index],
      materialCount: (groups[index].materialCount || 0) + 1,
      mediaCount: (groups[index].mediaCount || 0) + 1,
      updatedAt: now,
    }
    await saveMaterialGroups(groups)
  }

  return material
}
