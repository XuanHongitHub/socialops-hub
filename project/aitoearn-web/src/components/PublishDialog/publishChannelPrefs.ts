/**
 * Remember last publish content type (post/reel/story) per channel.
 * BugSell / SocialOps default: Post (not Reels) — product catalog commerce.
 */

export type MetaContentCategory = 'post' | 'reel' | 'story'

const STORAGE_KEY = 'socialops.publish.contentCategory.v1'

type PrefsMap = Partial<Record<string, MetaContentCategory>>

function readAll(): PrefsMap {
  if (typeof localStorage === 'undefined')
    return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return {}
    const parsed = JSON.parse(raw) as PrefsMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

function writeAll(map: PrefsMap) {
  if (typeof localStorage === 'undefined')
    return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  }
  catch { /* quota */ }
}

/** Persist user choice (Instagram / Facebook content type). */
export function saveChannelContentCategory(
  platform: string,
  category: MetaContentCategory | string,
) {
  const key = String(platform || '').toLowerCase()
  if (!key || !category)
    return
  const cat = String(category).toLowerCase() as MetaContentCategory
  if (!['post', 'reel', 'story'].includes(cat))
    return
  const all = readAll()
  all[key] = cat
  writeAll(all)
}

/**
 * Resolve default content category for IG/FB.
 * Order: saved last choice → post (BugSell-friendly) → reel only if hasVideo and no pref? 
 * User wants POST for BugSell; always prefer saved, else `post`.
 */
export function getPreferredContentCategory(
  platform: string,
  _hasVideo?: boolean,
): MetaContentCategory {
  const key = String(platform || '').toLowerCase()
  const saved = readAll()[key]
  if (saved)
    return saved
  // SocialOps / BugSell: product posts default to feed Post, not Reels
  return 'post'
}
