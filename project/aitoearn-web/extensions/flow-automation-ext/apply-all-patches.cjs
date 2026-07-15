const fs = require('fs')
const path = require('path')

function applyFile(fp, replacements) {
  let s = fs.readFileSync(fp, 'utf8')
  let n = 0
  for (const r of replacements) {
    if (!r.find) continue
    if (!s.includes(r.find)) {
      // skip silently if already applied
      continue
    }
    const before = s
    s = s.split(r.find).join(r.replace)
    if (s !== before) { n++; console.log('  +', r.find.slice(0, 60)) }
  }
  if (n) fs.writeFileSync(fp, s)
  return n
}

const patchesDir = 'custom/patches'
let total = 0
for (const name of fs.readdirSync(patchesDir).filter(f => f.endsWith('.json')).sort()) {
  const patch = JSON.parse(fs.readFileSync(path.join(patchesDir, name), 'utf8'))
  console.log('PATCH', patch.id)
  for (const file of patch.files || []) {
    const pattern = path.basename(file.glob)
    const [pre, post] = pattern.split('*')
    const dir = path.dirname(file.glob)
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(pre) && f.endsWith(post || '')) {
        total += applyFile(path.join(dir, f), file.replacements || [])
      }
    }
  }
}
console.log('total', total)

// Verify final defaults block
const s = fs.readFileSync('assets/index.html-Dpfjgpbd.js', 'utf8')
const i = s.indexOf('L=zo({migrationVersion:5')
console.log('DEFAULTS', s.slice(i, i+420))
// concurrent in sendJob fresh read
console.log('fresh concurrent', s.includes('concurrentPrompts:_f.concurrentPrompts'))
