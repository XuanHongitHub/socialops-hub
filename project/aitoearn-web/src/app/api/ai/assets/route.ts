import { access } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { getAssets, saveAssets } from '@/app/api/ai/providers/_local'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1)
  const pageSize = Math.max(1, Number(url.searchParams.get('pageSize') || 20) || 20)
  const assets = await getAssets()
  const availability = await Promise.all(assets.map(async asset => ({ asset, exists: /^https?:\/\//i.test(asset.path) || await access(asset.path).then(() => true).catch(() => false) })))
  const validAssets = availability.filter(item => item.exists).map(item => item.asset)
  if (validAssets.length !== assets.length) await saveAssets(validAssets)
  const start = (page - 1) * pageSize

  const list = validAssets.slice(start, start + pageSize).map(({ path: _path, ...asset }) => ({
    ...asset,
    // Always serve from local disk outside git (never bare Grok temp CDN)
    url: `/api/ai/assets/local-file?id=${encodeURIComponent(asset.id)}`,
    type: asset.type === 'video' ? 'aiVideo' : 'aiImage',
    mimeType: asset.type === 'video' ? 'video/mp4' : 'image/png',
    filename: asset.title,
    updatedAt: asset.createdAt,
  }))

  return NextResponse.json({
    code: 0,
    data: {
      page,
      pageSize,
      total: validAssets.length,
      list,
    },
    message: 'ok',
    url: '/api/ai/assets',
  })
}

