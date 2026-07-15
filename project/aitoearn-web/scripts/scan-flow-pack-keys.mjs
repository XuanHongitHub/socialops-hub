import fs from 'fs'
const s = fs.readFileSync('extensions/FlowAutomation-dist/assets/index.html-Dpfjgpbd.js', 'utf8')
const set = new Set()
const re = /["']([a-zA-Z][a-zA-Z0-9_]{2,40})["']/g
let m
while ((m = re.exec(s))) {
  const k = m[1]
  if (/prompt|queue|run|auto|mode|video|storage|settings/i.test(k))
    set.add(k)
}
console.log([...set].sort().join('\n'))
