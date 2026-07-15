/**
 * Post-process Flow/Veo videos with allenk/VeoWatermarkRemover
 * (GeminiWatermarkTool-Video — reverse alpha blending, local CLI).
 *
 * Binary resolution order:
 *  1) SOCIALOPS_VEO_WATERMARK_TOOL env (full path to exe)
 *  2) %APPDATA%/SocialsHub/tools/GeminiWatermarkTool-Video.exe
 *  3) project/aitoearn-web/tools/GeminiWatermarkTool-Video.exe
 *
 * Download: https://github.com/allenk/VeoWatermarkRemover/releases
 * Optional: SOCIALOPS_VEO_WATERMARK_DISABLE=1 to skip
 */
import { spawn } from 'node:child_process'
import { access, copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { constants as fsConstants } from 'node:fs'

const appData = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming')

export type VeoWatermarkResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  toolPath?: string
  inputPath: string
  outputPath?: string
  /** Final path to use (cleaned or original) */
  path: string
  durationMs?: number
  stderr?: string
}

function candidateToolPaths(): string[] {
  const env = String(process.env.SOCIALOPS_VEO_WATERMARK_TOOL || '').trim()
  const name = process.platform === 'win32' ? 'GeminiWatermarkTool-Video.exe' : 'GeminiWatermarkTool-Video'
  return [
    env,
    join(appData, 'SocialsHub', 'tools', name),
    join(process.cwd(), 'tools', name),
    join(process.cwd(), 'vendor', 'VeoWatermarkRemover', name),
  ].filter(Boolean)
}

export async function resolveVeoWatermarkTool(): Promise<string | null> {
  for (const p of candidateToolPaths()) {
    try {
      await access(p, fsConstants.X_OK).catch(async () => {
        await access(p, fsConstants.F_OK)
      })
      return p
    }
    catch {
      // try next
    }
  }
  return null
}

function runTool(toolPath: string, args: string[], timeoutMs: number): Promise<{ code: number, stderr: string, stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(toolPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try {
        child.kill()
      }
      catch { /* ignore */ }
      resolve({ code: -1, stderr: stderr || 'timeout', stdout })
    }, timeoutMs)
    child.stdout?.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stderr, stdout })
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: 1, stderr: e.message, stdout })
    })
  })
}

/**
 * Remove visible Veo/Flow watermark from a local mp4.
 * On success replaces file in-place (keeps .bak of original next to it when possible).
 * Never throws for missing tool — returns skipped so Flow pipeline still succeeds.
 */
export async function removeVeoWatermarkFromFile(inputPath: string, opts?: {
  /** Keep original as inputPath.bak (default true) */
  keepBackup?: boolean
  /** Extra CLI flags e.g. ['--legacy'] for old Veo text */
  extraArgs?: string[]
  timeoutMs?: number
}): Promise<VeoWatermarkResult> {
  const keepBackup = opts?.keepBackup !== false
  if (process.env.SOCIALOPS_VEO_WATERMARK_DISABLE === '1') {
    return { ok: true, skipped: true, reason: 'disabled_by_env', inputPath, path: inputPath }
  }

  const toolPath = await resolveVeoWatermarkTool()
  if (!toolPath) {
    return {
      ok: true,
      skipped: true,
      reason: 'tool_not_found',
      inputPath,
      path: inputPath,
    }
  }

  try {
    const st = await stat(inputPath)
    if (!st.isFile() || st.size < 10_000) {
      return { ok: false, reason: 'input_too_small', inputPath, path: inputPath, toolPath }
    }
  }
  catch {
    return { ok: false, reason: 'input_missing', inputPath, path: inputPath, toolPath }
  }

  const outPath = `${inputPath}.dewmark.mp4`
  const started = Date.now()
  // CLI: GeminiWatermarkTool-Video -i in.mp4 -o out.mp4
  const args = [
    '-i', inputPath,
    '-o', outPath,
    ...(opts?.extraArgs || []),
  ]
  const run = await runTool(toolPath, args, opts?.timeoutMs ?? 600_000)

  if (run.code !== 0) {
    // Some builds: first arg is input only → drag-drop style
    const run2 = await runTool(toolPath, [inputPath, ...(opts?.extraArgs || [])], opts?.timeoutMs ?? 600_000)
    if (run2.code !== 0) {
      try {
        await unlink(outPath).catch(() => null)
      }
      catch { /* */ }
      return {
        ok: false,
        reason: 'tool_failed',
        inputPath,
        path: inputPath,
        toolPath,
        durationMs: Date.now() - started,
        stderr: (run.stderr || run2.stderr || '').slice(0, 800),
      }
    }
    // drag-drop often writes input_processed.mp4 beside input
    const sibling = inputPath.replace(/\.mp4$/i, '_processed.mp4')
    try {
      await access(sibling, fsConstants.F_OK)
      await copyFile(sibling, outPath)
      await unlink(sibling).catch(() => null)
    }
    catch {
      // outPath may already exist
    }
  }

  try {
    await access(outPath, fsConstants.F_OK)
    const outSt = await stat(outPath)
    if (outSt.size < 10_000) {
      await unlink(outPath).catch(() => null)
      return {
        ok: false,
        reason: 'output_too_small',
        inputPath,
        path: inputPath,
        toolPath,
        durationMs: Date.now() - started,
      }
    }

    if (keepBackup) {
      const bak = `${inputPath}.pre-dewmark.mp4`
      await copyFile(inputPath, bak).catch(() => null)
    }
    await unlink(inputPath).catch(() => null)
    await rename(outPath, inputPath)

    return {
      ok: true,
      toolPath,
      inputPath,
      outputPath: inputPath,
      path: inputPath,
      durationMs: Date.now() - started,
    }
  }
  catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      inputPath,
      path: inputPath,
      toolPath,
      durationMs: Date.now() - started,
      stderr: run.stderr?.slice(0, 800),
    }
  }
}

export function veoWatermarkInstallHint(): string {
  return [
    'Install Veo watermark tool (visible logo only — not SynthID):',
    '  https://github.com/allenk/VeoWatermarkRemover/releases',
    `  Place GeminiWatermarkTool-Video.exe in:`,
    `    ${join(appData, 'SocialsHub', 'tools')}`,
    '  Or set SOCIALOPS_VEO_WATERMARK_TOOL=C:\\\\path\\\\to\\\\exe',
    '  Disable: SOCIALOPS_VEO_WATERMARK_DISABLE=1',
  ].join('\n')
}
