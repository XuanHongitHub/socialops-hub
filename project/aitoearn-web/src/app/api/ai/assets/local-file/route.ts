import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve archived media by id from local disk (outside git).
 * GET /api/ai/assets/local-file?id=generated-xxx
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const id = String(url.searchParams.get('id') || '').trim()
    if (!id)
      return NextResponse.json({ code: 400, message: 'id required' }, { status: 400 })

    const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
    const roots = [
      process.env.SOCIALOPS_MEDIA_ROOT ? join(process.env.SOCIALOPS_MEDIA_ROOT, 'generated-videos') : '',
      join('E:\\SocialsHub\\media', 'generated-videos'),
      join(appData, 'SocialsHub', 'generated-videos'),
    ].filter(Boolean)

    // Prefer path from catalog
    let path = ''
    try {
      const store = join(appData, 'SocialsHub', 'ai-assets.json')
      if (existsSync(store)) {
        const raw = JSON.parse(readFileSync(store, 'utf8'))
        const list = Array.isArray(raw) ? raw : (raw.assets || raw.list || [])
        const hit = list.find((a: any) => a?.id === id)
        if (hit?.path && existsSync(hit.path))
          path = hit.path
      }
    }
    catch { /* ignore */ }

    if (!path) {
      for (const root of roots) {
        for (const ext of ['.mp4', '.webm']) {
          const p = join(root, `${id}${ext}`)
          if (existsSync(p)) {
            path = p
            break
          }
        }
        if (path)
          break
      }
    }

    if (!path) {
      return NextResponse.json({
        code: 410,
        message: 'Local file not found outside git',
        id,
        roots,
      }, { status: 410 })
    }

    const st = statSync(path)
    const mime = path.endsWith('.webm') ? 'video/webm' : 'video/mp4'
    const bytes = readFileSync(path)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-SocialOps-Source': 'local-file',
        'X-SocialOps-Path': path,
      },
    })
  }
  catch (e) {
    return NextResponse.json({
      code: 500,
      message: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
