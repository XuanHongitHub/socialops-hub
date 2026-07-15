/**
 * Serve uploaded local assets for draft ref images / media.
 */
import { open, stat } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { getLocalUploadAsset } from '../../_local'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const asset = await getLocalUploadAsset(id)
  if (!asset) {
    return NextResponse.json({
      code: 404,
      data: null,
      message: 'Asset not found',
      url: `/api/assets/${id}/file`,
    }, { status: 404 })
  }

  const fileStat = await stat(asset.path).catch(() => null)
  if (!fileStat) {
    return NextResponse.json({
      code: 410,
      data: null,
      message: 'Asset file missing',
      url: `/api/assets/${id}/file`,
    }, { status: 410 })
  }

  const handle = await open(asset.path, 'r')
  try {
    const bytes = Buffer.alloc(fileStat.size)
    await handle.read(bytes, 0, fileStat.size, 0)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': asset.contentType || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, max-age=86400',
      },
    })
  }
  finally {
    await handle.close()
  }
}
