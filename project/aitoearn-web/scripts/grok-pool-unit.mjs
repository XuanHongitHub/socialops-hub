/**
 * Unit checks for Grok pool labeling / subscription mapping.
 * Run: node scripts/grok-pool-unit.mjs
 */

function subscriptionFromTier(tierRaw) {
  const tier = Number(tierRaw)
  if (!Number.isFinite(tier) || tier <= 0)
    return { tier: 0, code: 'unknown', label: 'Unknown' }
  if (tier >= 4)
    return { tier, code: 'super', label: 'SuperGrok' }
  if (tier >= 3)
    return { tier, code: 'pro', label: 'Pro' }
  if (tier >= 2)
    return { tier, code: 'plus', label: 'Plus' }
  return { tier, code: 'free', label: 'Free' }
}

function formatGrokModelLabel(modelId) {
  const id = modelId.replace(/^grok::/, '')
  if (id === 'grok-imagine-video')
    return 'Grok Imagine Video'
  if (id === 'grok-imagine-video-1.5' || id.startsWith('grok-imagine-video-1.5'))
    return 'Grok Imagine Video 1.5'
  return id
}

function buildGrokVideoEntries(modelIds, pool) {
  const unique = Array.from(new Set(modelIds.filter(Boolean)))
  return unique.map(id => ({
    name: `grok::${id}`,
    description: formatGrokModelLabel(id),
    tags: ['Grok', 'Pool', `${pool.seatCount} seats`, pool.subscriptionLabel].filter(Boolean),
  }))
}

function sortPoolCandidates(a, b) {
  const rem = (acc) => {
    const limit = Number(acc.quota?.limit || 0)
    const used = Number(acc.quota?.used || 0)
    if (!limit || limit <= 0)
      return Infinity
    return Math.max(0, limit - used)
  }
  const remA = rem(a)
  const remB = rem(b)
  if (remA === 0 && remB > 0)
    return 1
  if (remB === 0 && remA > 0)
    return -1
  const usedA = Date.parse(String(a.metadata?.lastUsedAt || 0)) || 0
  const usedB = Date.parse(String(b.metadata?.lastUsedAt || 0)) || 0
  return usedA - usedB
}

let failed = 0
function check(name, cond) {
  if (!cond) {
    failed += 1
    console.error(`FAIL  ${name}`)
  }
  else {
    console.log(`PASS  ${name}`)
  }
}

check('tier 1 free', subscriptionFromTier(1).label === 'Free')
check('tier 4 super', subscriptionFromTier(4).label === 'SuperGrok')
check('label video', formatGrokModelLabel('grok-imagine-video') === 'Grok Imagine Video')

const entries = buildGrokVideoEntries(
  ['grok-imagine-video', 'grok-imagine-video', 'grok-imagine-video-1.5'],
  { seatCount: 2, subscriptionLabel: 'Mixed (Free · SuperGrok)' },
)
check('dedupe models', entries.length === 2)
check('no Direct xAI label', entries.every(e => e.description !== 'Direct xAI OAuth account'))
check('pool tags', entries[0].tags.includes('Pool') && entries[0].tags.includes('2 seats'))

const ordered = [
  { id: 'a', quota: { limit: 5, used: 5 }, metadata: { lastUsedAt: '2020-01-01' } },
  { id: 'b', quota: { limit: 5, used: 1 }, metadata: { lastUsedAt: '2024-01-01' } },
  { id: 'c', quota: { limit: 0, used: 0 }, metadata: { lastUsedAt: '2019-01-01' } },
].sort(sortPoolCandidates)
check('prefer remaining quota before exhausted', ordered[0].id === 'c' || ordered[0].id === 'b')
check('exhausted last', ordered[ordered.length - 1].id === 'a')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nGrok pool unit checks passed')
