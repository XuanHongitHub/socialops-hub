import type { SocialAccount } from '@/api/accounts/account.types'
import type { PlatType } from '@/app/config/platConfig'
import {
  AccountPlatInfoMap,
  DRAFT_TARGET_EXCLUDED_PLATFORMS,
  DraftTargetPlatInfoArr,
} from '@/app/config/platConfig'

/** Platforms that appear in draft generation + have at least one active connected account. */
export function getConnectedPlatforms(accounts: SocialAccount[]): PlatType[] {
  const active = new Set(
    accounts
      .filter(a => a.status !== 0 && AccountPlatInfoMap.has(a.type) && !DRAFT_TARGET_EXCLUDED_PLATFORMS.has(a.type))
      .map(a => a.type),
  )
  return DraftTargetPlatInfoArr
    .map(([plat]) => plat)
    .filter(plat => active.has(plat))
}

export function getAllTaskPlatforms(): PlatType[] {
  return DraftTargetPlatInfoArr
    .map(([plat]) => plat)
    .filter(plat => AccountPlatInfoMap.has(plat) && !DRAFT_TARGET_EXCLUDED_PLATFORMS.has(plat))
}

export function resolvePlatformsByPreset(
  preset: 'connected' | 'all' | 'custom',
  accounts: SocialAccount[],
  custom: PlatType[] = [],
): PlatType[] {
  if (preset === 'custom') {
    return custom.filter(p => AccountPlatInfoMap.has(p) && !DRAFT_TARGET_EXCLUDED_PLATFORMS.has(p))
  }
  if (preset === 'all')
    return getAllTaskPlatforms()
  const connected = getConnectedPlatforms(accounts)
  // Fallback to all when nothing is connected so limits still work
  return connected.length > 0 ? connected : getAllTaskPlatforms()
}
