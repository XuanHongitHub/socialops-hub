import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve archived media from local disk OUTSIDE git.
 * Path: /api/ai/assets/file/:id
 * Root: SOCIALOPS_MEDIA_ROOT/generated-videos (e.g. E:\SocialsHub\media\generated-videos)
 */
function mediaRoots() {
  const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  const envRoot = process.env.SOCIALOPS_MEDIA_ROOT
  return [
    envRoot ? join(envRoot, 'generated-videos') : '',
    join('E:\\SocialsHub\\media', 'generated-videos'),
    join(appData, 'SocialsHub', 'generated-videos'),
  ].filter(Boolean)
}

function resolveFile(id: string) {
  const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
  try {
    const store = join(appData, 'SocialsHub', 'ai-assets.json')
    if (existsSync(store)) {
      const raw = JSON.parse(readFileSync(store, 'utf8'))
      const list = Array.isArray(raw) ? raw : (raw.assets || raw.list || [])
      const hit = list.find((a: any) => a && a.id === id)
      if (hit?.path && existsSync(hit.path)) {
        const st = statSync(hit.path)
        if (st.isFile() && st.size > 0)
          return { path: String(hit.path), size: st.size }
      }
    }
  }
  catch { /* ignore */ }

  for (const root of mediaRoots()) {
    for (const ext of ['.mp4', '.webm']) {
      const path = join(root, `${id}${ext}`)
      if (!existsSync(path))
        continue
      const st = statSync(path)
      if (st.isFile() && st.size > 0)
        return { path, size: st.size }
    }
  }
  return null
}

export async function GET(
  _req: Request,
  context: { params: { id: string } },
) {
  try {
    const id = String(context.params?.id || '').trim()
    if (!id)
      return NextResponse.json({ code: 400, message: 'missing id' }, { status: 400 })

    const file = resolveFile(id)
    if (!file) {
      return NextResponse.json({
        code: 410,
        message: 'Local media not found outside git. Grok temp URLs expire — archive under SOCIALOPS_MEDIA_ROOT/generated-videos.',
        id,
        roots: mediaRoots(),
      }, { status: 410 })
    }

    const mime = file.path.endsWith('.webm') ? 'video/webm' : 'video/mp4'
    const bytes = readFileSync(file.path)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.byteLength),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-SocialOps-Source': 'local-file',
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
