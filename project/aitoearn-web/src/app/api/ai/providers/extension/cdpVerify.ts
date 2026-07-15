/**
 * Pure CDP extension-target scoring (no HTTP, no Node path aliases).
 * Used by seatLauncher verify + unit tests.
 */

export type ExtensionVerifyResult = {
  ok: boolean
  expected: number
  foundServiceWorkers: number
  foundExtensionTargets: string[]
  uniqueExtensionIds: string[]
  missingPackIds: string[]
  detail?: string
}

/**
 * Score CDP /json/list rows.
 * Requires unique chrome-extension IDs (or SW targets) ≥ expected — all packs observable.
 */
export function scoreCdpExtensionTargets(
  targets: unknown[],
  expected: number,
  packIds: string[],
): ExtensionVerifyResult {
  const rows = Array.isArray(targets) ? targets : []
  const extUrls = rows
    .map((t: any) => String(t?.url || t?.title || ''))
    .filter((u: string) => u.startsWith('chrome-extension://'))
  const idList = extUrls.map((u: string) => {
    const m = /^chrome-extension:\/\/([a-z]{32})/i.exec(u)
    return m?.[1] || ''
  }).filter(Boolean)
  const uniqueExtensionIds = [...new Set(idList)]
  const foundExtensionTargets = extUrls.slice(0, 40)
  const foundServiceWorkers = rows.filter((t: any) =>
    t?.type === 'service_worker'
    || String(t?.url || '').includes('service_worker')
    || String(t?.url || '').startsWith('chrome-extension://'),
  ).length

  const ok = expected > 0
    ? (uniqueExtensionIds.length >= expected || foundServiceWorkers >= expected)
    : (uniqueExtensionIds.length >= 1 || foundServiceWorkers >= 1)

  return {
    ok,
    expected,
    foundServiceWorkers,
    foundExtensionTargets,
    uniqueExtensionIds,
    missingPackIds: ok ? [] : packIds,
    detail: ok
      ? `Found ${foundExtensionTargets.length} extension URL(s), ${foundServiceWorkers} SW/ext target(s), ${uniqueExtensionIds.length} unique id(s) (need ≥${expected})`
      : `Only ${uniqueExtensionIds.length} unique ext id(s) / ${foundServiceWorkers} SW targets — need ≥${expected} packs. Open chrome://extensions or re-prepare seat.`,
  }
}
