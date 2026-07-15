const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
const i = s.indexOf('migrationVersion:5,defaultMode')
console.log('DEFAULTS', s.slice(i, i+600))
const j = s.indexOf('L=zo({migrationVersion:5')
console.log('LDEF', s.slice(j, j+500))
const a = s.indexOf('type:"AUTO_FILL_FLOW"')
console.log('AUTO', s.slice(a-500, a+400))
const b = s.indexOf('Object.assign(L,o)')
console.log('ASSIGN', s.slice(b-200, b+250))
// F save function
let idx = 0, c = 0
while ((idx = s.indexOf('chrome.storage.local.set({[od]', idx)) !== -1 && c < 5) {
  console.log('SET', c, JSON.stringify(s.slice(idx-80, idx+120)))
  idx += 10; c++
}
// delay in UI - InputNumber binding
const re = /promptDelaySecondsM(in|ax)/g
let m, n = 0
while ((m = re.exec(s)) && n < 20) {
  console.log('D', n, JSON.stringify(s.slice(m.index - 40, m.index + 90)))
  n++
}
