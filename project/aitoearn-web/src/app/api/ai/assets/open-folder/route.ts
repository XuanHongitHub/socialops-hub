import { spawn } from 'node:child_process'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { getAssets } from '@/app/api/ai/providers/_local'


export async function POST(req: Request) {
  if (process.env.SOCIALOPS_LOCAL_MODE !== '1' || process.platform !== 'win32')
    return NextResponse.json({ code: 403, message: 'Open folder is available only on the local Windows runtime' }, { status: 403 })

  const origin = req.headers.get('origin') || ''
  const allowedOrigins = new Set(['https://socialops.bebio.site', 'http://127.0.0.1:6061', 'http://localhost:6061'])
  if (origin && !allowedOrigins.has(origin))
    return NextResponse.json({ code: 403, message: 'Origin is not allowed' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { assetId?: string }
  const assetId = String(body.assetId || '').trim()
  const asset = (await getAssets()).find(item => item.id === assetId && item.type === 'video')
  if (!asset)
    return NextResponse.json({ code: 404, message: 'Local video asset not found' }, { status: 404 })

  const storageRoot = resolve(process.env.APPDATA || '', 'SocialsHub')
  const assetPath = resolve(asset.path)
  if (!assetPath.startsWith(`${storageRoot}${sep}`))
    return NextResponse.json({ code: 403, message: 'Asset path is outside local storage' }, { status: 403 })

  spawn('explorer.exe', [`/select,${assetPath}`], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  return NextResponse.json({ code: 0, message: 'Folder opened' })
}