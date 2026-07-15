const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.ts-Bt6B9Lbt.js','utf8')
const i = s.indexOf('promptDelaySecondsMin')
console.log(s.slice(i-200, i+600))
// find progress reporting
const j = s.indexOf('isCancelling')
console.log('\\n---\\n', s.slice(j-100, j+400))
// chrome.runtime.sendMessage for status
let idx=0,c=0
while((idx=s.indexOf('sendMessage', idx))!==-1 && c<10) {
  console.log('SM', JSON.stringify(s.slice(idx, idx+120)))
  idx+=10;c++
}
