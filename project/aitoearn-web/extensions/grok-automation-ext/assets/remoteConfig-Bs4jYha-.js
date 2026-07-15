/**
 * SocialOps-patched remote config loader.
 * Order: Socials Hub mirror → author CDN → onegreen workers (final fallback).
 */
function t(t, n) {
  return t.version.split(",").map(t => t.trim()).filter(Boolean).includes(n.trim())
}
let n = null
const HUB_BASES = [
  "http://127.0.0.1:6061/api/ai/providers/extension/mirror",
  "http://localhost:6061/api/ai/providers/extension/mirror",
]
const UPSTREAM_BASES = [
  "https://configs.kylenguyen.me",
  "https://extension-config.onegreen.workers.dev",
]
const PACK = "grok-automation"
const SECRET = "YES_THAT_IS_VERY_EASY_RIGHT_?"

async function e(base) {
  const n = await fetch(`${base}/config/${PACK}`, {
    method: "GET",
    headers: { "X-Client-Secret": SECRET },
  })
  if (!n.ok)
    throw new Error(`HTTP ${n.status}`)
  const e = await n.json()
  if (!e?.selectors)
    throw new Error("Invalid config shape")
  return e
}

async function r() {
  if (n)
    return n
  for (const base of [...HUB_BASES, ...UPSTREAM_BASES]) {
    try {
      n = await e(base)
      return n
    }
    catch {
      // try next
    }
  }
  return null
}
export { r as g, t as i }
