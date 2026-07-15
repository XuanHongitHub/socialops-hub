const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
// Save Settings button
for (const k of ['Save Settings','saveSettings','onSave','@click":F','saveButton']) {
  const i = s.indexOf(k)
  console.log(k, i, i>=0 ? JSON.stringify(s.slice(i, i+100)) : '')
}
// How Control tab gets settings for run
const i = s.indexOf('sendJob:async(n,o={})')
// find callers of sendJob with concurrentPrompts
const j = s.indexOf('sendJob(')
console.log('sendJob call', s.slice(j, j+200))
// find all sendJob(
let idx = 0, c = 0
while ((idx = s.indexOf('.sendJob(', idx)) !== -1 && c < 8) {
  console.log('CALL', c, JSON.stringify(s.slice(idx-50, idx+180)))
  idx += 8; c++
}
// l( sendJob from setup
const k = s.indexOf('l(s,{concurrentPrompts')
console.log('BATCH', s.slice(k-150, k+250))
