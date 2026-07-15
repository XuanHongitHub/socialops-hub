import { generatedVideoDir } from '@/app/api/ai/storage'
/**
 * Stitch multi-shot storyboard clips into one 9:16 vertical with loudnorm.
 */
import { execFile } from 'node:child_process'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

const run = promisify(execFile)

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')
const workRoot = join(appData, 'SocialsHub', 'storyboard-work')

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!res.ok)
    throw new Error(`Download shot failed HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length)
    throw new Error('Empty shot download')
  await writeFile(dest, buf)
  return dest
}

/**
 * Concat shots in order. Uses ffmpeg concat demuxer + scale/pad to 1080x1920.
 * Returns absolute path to final mp4.
 */
export async function stitchStoryboardClips(input: {
  shotUrls: string[]
  /** Optional per-shot trim length in seconds (beat length) */
  shotDurations?: number[]
  outName?: string
}): Promise<{ path: string, url: string }> {
  if (!input.shotUrls.length)
    throw new Error('No shots to stitch')

  const jobId = randomUUID()
  const dir = join(workRoot, jobId)
  await mkdir(dir, { recursive: true })

  const localShots: string[] = []
  for (let i = 0; i < input.shotUrls.length; i++) {
    const dest = join(dir, `shot-${String(i + 1).padStart(2, '0')}.mp4`)
    await downloadToFile(input.shotUrls[i]!, dest)
    localShots.push(dest)
  }

  // Normalize each shot to 1080x1920, optional trim to beat length
  const normalized: string[] = []
  for (let i = 0; i < localShots.length; i++) {
    const src = localShots[i]!
    const out = join(dir, `norm-${String(i + 1).padStart(2, '0')}.mp4`)
    const beat = input.shotDurations?.[i]
    const args = [
      '-y',
      '-i', src,
      ...(beat && beat > 0 ? ['-t', String(beat)] : []),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      '-movflags', '+faststart',
      out,
    ]
    await run('ffmpeg', args, { timeout: 180_000, windowsHide: true })
    normalized.push(out)
  }

  const listPath = join(dir, 'concat.txt')
  const listBody = normalized.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
  await writeFile(listPath, listBody, 'utf8')

  const stitched = join(dir, 'stitched.mp4')
  await run('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    stitched,
  ], { timeout: 120_000, windowsHide: true })

  // Loudnorm pass
  const finalName = input.outName || `storyboard-${jobId}.mp4`
  const finalPath = join(generatedVideoDir, finalName)
  await mkdir(generatedVideoDir, { recursive: true })
  try {
    await run('ffmpeg', [
      '-y',
      '-i', stitched,
      '-c:v', 'copy',
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
      '-c:a', 'aac',
      '-b:a', '192k',
      finalPath,
    ], { timeout: 120_000, windowsHide: true })
  }
  catch {
    // fallback copy without loudnorm
    await run('ffmpeg', ['-y', '-i', stitched, '-c', 'copy', finalPath], { timeout: 60_000, windowsHide: true })
  }

  // Cleanup work dir best-effort
  for (const f of [...localShots, ...normalized, listPath, stitched]) {
    await unlink(f).catch(() => null)
  }

  const assetId = finalName.replace(/\.mp4$/i, '')
  return {
    path: finalPath,
    url: `/api/ai/assets/${assetId}/file`,
  }
}
