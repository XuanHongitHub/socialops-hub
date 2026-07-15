/**
 * Unit smoke for draft generation queue visibility rules.
 * Run: node scripts/generation-task-visibility-unit.mjs
 */

function shouldShowDraftGenerationTaskCard(task) {
  return task.status === 'generating' || task.status === 'failed'
}

const cases = [
  { status: 'generating', expect: true },
  { status: 'failed', expect: true },
  { status: 'success', expect: false },
]

let failed = 0
for (const c of cases) {
  const got = shouldShowDraftGenerationTaskCard({ status: c.status })
  if (got !== c.expect) {
    console.error(`FAIL status=${c.status}: expected ${c.expect}, got ${got}`)
    failed++
  }
  else {
    console.log(`ok status=${c.status} -> ${got}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`)
  process.exit(1)
}
console.log('\nall generation-task visibility cases passed')
