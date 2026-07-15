const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
// concurrentPrompts UI labels and which component
const keys = ['concurrentPrompts','Concurrent Prompts','1 prompt','6 prompts','Number of prompts to process']
for (const k of keys) {
  let i = 0, c = 0
  while ((i = s.indexOf(k, i)) !== -1 && c < 3) {
    console.log('---', k, '---')
    console.log(JSON.stringify(s.slice(Math.max(0,i-100), i+150)))
    i += k.length; c++
  }
}
// Control tab fields order
const i = s.indexOf('concurrentPrompts:{label')
console.log('label block', s.slice(i, i+200))
// settings tab vs control - which has concurrent
const j = s.indexOf('settingsTab:')
const k = s.indexOf('controlTab:')
console.log('settingsTab', j, 'control around concurrent in settings?', s.slice(j, j+500).includes('concurrent'))
// search settingsTab concurrent
const m = s.indexOf('concurrentPrompts', s.indexOf('settingsTab'))
console.log('first concurrent after settingsTab context', JSON.stringify(s.slice(m-80, m+120)))
