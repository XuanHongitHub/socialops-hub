const fs = require('fs')
const path = require('path')

function applyReplacements(filePath, replacements) {
  let s = fs.readFileSync(filePath, 'utf8')
  let n = 0
  for (const r of replacements) {
    if (r.findRegex) {
      const re = new RegExp(r.findRegex)
      if (!re.test(s)) {
        console.log('MISS regex', filePath)
        continue
      }
      s = s.replace(re, r.replace ?? '')
      n++
    } else if (r.find) {
      if (!s.includes(r.find)) {
        console.log('MISS find', r.find.slice(0, 80))
        continue
      }
      s = s.split(r.find).join(r.replace)
      n++
      console.log('OK replace in', path.basename(filePath), 'count', (s.split(r.replace).length - 1))
    }
  }
  if (n) fs.writeFileSync(filePath, s)
  return n
}

const patchesDir = path.join('custom', 'patches')
const assets = path.join('assets')
let total = 0
for (const name of fs.readdirSync(patchesDir).filter(f => f.startsWith('004') || f.startsWith('005'))) {
  const patch = JSON.parse(fs.readFileSync(path.join(patchesDir, name), 'utf8'))
  console.log('APPLY', patch.id)
  for (const file of patch.files) {
    const glob = file.glob // assets/index.html-*.js
    const dir = path.dirname(glob)
    const prefix = path.basename(glob).replace('*', '')
    // simple glob: assets/index.html-*.js
    const parts = glob.split('/')
    const baseDir = parts[0]
    const pattern = parts[1]
    const [pre, post] = pattern.split('*')
    for (const f of fs.readdirSync(baseDir)) {
      if (f.startsWith(pre) && f.endsWith(post || '')) {
        const fp = path.join(baseDir, f)
        total += applyReplacements(fp, file.replacements)
      }
    }
  }
}

// Badge UI disabled by user request — do not inject socialops-draft-smooth.js
console.log('badge inject skipped')

