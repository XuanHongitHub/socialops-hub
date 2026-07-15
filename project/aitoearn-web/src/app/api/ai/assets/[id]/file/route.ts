import { open, stat } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { getAssets } from '@/app/api/ai/providers/_local'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const asset = (await getAssets()).find(item => item.id === id)
  if (!asset)
    return NextResponse.json({ code: 404, data: null, message: 'Asset not found', url: `/api/ai/assets/${id}/file` }, { status: 404 })

  const fileStat = await stat(asset.path).catch(() => null)
  if (!fileStat)
    return NextResponse.json({ code: 410, data: null, message: 'Asset file is no longer available', url: `/api/ai/assets/${id}/file` }, { status: 410 })

  const mimeType = asset.type === 'video' ? 'video/mp4' : 'application/octet-stream'
  const range = req.headers.get('range')
  if (range && asset.type === 'video') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match)
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileStat.size}` } })
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileStat.size)
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileStat.size}` } })
    const length = end - start + 1
    const handle = await open(asset.path, 'r')
    try {
      const bytes = Buffer.alloc(length)
      await handle.read(bytes, 0, length, start)
      return new NextResponse(bytes, {
        status: 206,
        headers: {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${fileStat.size}`,
          'Content-Length': String(length),
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    }
    finally {
      await handle.close()
    }
  }

  const handle = await open(asset.path, 'r')
  try {
    const bytes = Buffer.alloc(fileStat.size)
    await handle.read(bytes, 0, fileStat.size, 0)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Accept-Ranges': asset.type === 'video' ? 'bytes' : 'none',
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Length': String(bytes.length),
      },
    })
  }
  finally {
    await handle.close()
  }
}