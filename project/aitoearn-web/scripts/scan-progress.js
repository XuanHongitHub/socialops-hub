const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
const i = s.indexOf('VIDEO_GENERATION_PROGRESS')
console.log('count', (s.match(/VIDEO_GENERATION_PROGRESS/g)||[]).length)
// how side panel handles progress
let idx = 0, c = 0
while ((idx = s.indexOf('VIDEO_GENERATION_PROGRESS', idx)) !== -1 && c < 5) {
  console.log(JSON.stringify(s.slice(idx-80, idx+200)))
  idx += 10; c++
}
// status delay display
const j = s.indexOf('status:"gen')
console.log('status gen', s.slice(j, j+100))
