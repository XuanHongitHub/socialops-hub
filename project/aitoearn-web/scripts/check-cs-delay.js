const fs = require('fs')
const cs = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.ts-Bt6B9Lbt.js','utf8')
const needle = 'u=e.promptDelaySecondsMin??0,l=e.promptDelaySecondsMax??u;if(i>0&&l>0){'
let idx = 0, c = 0
while ((idx = cs.indexOf(needle, idx)) !== -1) {
  console.log('at', idx, JSON.stringify(cs.slice(idx, idx+180)))
  idx += 10; c++
}
console.log('count', c)
console.log('has Waiting', cs.includes('Waiting'))
console.log('has Random delay', cs.includes('Random delay'))
