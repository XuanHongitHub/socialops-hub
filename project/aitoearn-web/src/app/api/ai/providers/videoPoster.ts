/**
 * Extract a distinctive poster frame from a generated video (ffmpeg).
 * Product commerce often reuses the same SKU photo as cover — thumbs look identical.
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
export const posterDir = join(appData, 'SocialsHub', 'posters')

function ffmpegBin() {
  return process.env.FFMPEG_PATH || 'ffmpeg'
}

/**
 * Download remote video (or use URL if ffmpeg can stream) and grab a frame at ~1.2s
 * (mid-intro — more distinctive than frame 0 which often matches the I2V still).
 */
export async function extractVideoPoster(videoUrl: string, opts?: { seekSec?: number }): Promise<string | null> {
  const url = String(videoUrl || '').trim()
  if (!url || !/^https?:\/\//i.test(url))
    return null

  const seek = Math.max(0.4, Math.min(4, Number(opts?.seekSec) || 1.2))
  const id = randomUUID()
  const outPath = join(posterDir, `${id}.jpg`)

  try {
    await mkdir(posterDir, { recursive: true })
    // Stream seek: -ss before -i is faster; quality ok for thumbs
    await execFileAsync(
      ffmpegBin(),
      [
        '-y',
        '-ss', String(seek),
        '-i', url,
        '-frames:v', '1',
        '-q:v', '3',
        '-vf', 'scale=640:-2',
        outPath,
      ],
      { timeout: 60_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
    )
    // Public path served by /api/assets/poster/[id]
    return `/api/assets/poster/${id}.jpg`
  }
  catch (err) {
    console.warn('[videoPoster] extract failed', err instanceof Error ? err.message : err)
    return null
  }
}

/** Optional: write buffer (for tests / alternate pipelines). */
export async function savePosterBuffer(buf: Buffer, ext = 'jpg'): Promise<string> {
  await mkdir(posterDir, { recursive: true })
  const id = randomUUID()
  const name = `${id}.${ext.replace(/^\./, '')}`
  await writeFile(join(posterDir, name), buf)
  return `/api/assets/poster/${name}`
}
