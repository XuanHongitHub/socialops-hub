const fs = require('fs')
const p = 'F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js'
const s = fs.readFileSync(p, 'utf8')
const i = s.indexOf('L=zo({migrationVersion:5')
console.log(s.slice(i, i+500))
// also find concurrentPrompts options in UI defaults
const j = s.indexOf('concurrentPrompts:1')
console.log('count concurrentPrompts:1', (s.match(/concurrentPrompts:1/g)||[]).length)
console.log('count concurrentPrompts:2', (s.match(/concurrentPrompts:2/g)||[]).length)
// language default
const k = s.indexOf('language:')
// find settings language key
const re = /language[\"']?\s*:\s*[\"'](\w+)/g
let m, n=0
while ((m=re.exec(s)) && n<5) { console.log('lang', m[0]); n++ }
