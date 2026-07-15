import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { posterDir } from '@/app/api/ai/providers/videoPoster'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  // Only allow simple poster filenames (uuid.jpg)
  if (!/^[a-f0-9-]{8,}\.(jpe?g|png|webp)$/i.test(name || '')) {
    return new Response('Not found', { status: 404 })
  }
  try {
    const buf = await readFile(join(posterDir, name))
    const ext = name.split('.').pop()?.toLowerCase()
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return new Response(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  }
  catch {
    return new Response('Not found', { status: 404 })
  }
}
