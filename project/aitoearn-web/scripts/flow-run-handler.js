const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
// Find Run click handler - how o is obtained for concurrentPrompts
const marker = 'a=o.concurrentPrompts,r=o.promptDelaySecondsMin'
const i = s.indexOf(marker)
console.log(s.slice(i-800, i+200))
// Find settings tab delay inputs
const j = s.indexOf('promptDelaySecondsMin')
// search settings.promptDelay or modelValue for delay
const k = s.indexOf('settings.promptDelaySecondsMin')
console.log('\\nBIND', s.slice(k-100, k+200))
// Control tab delay display
const re = /promptDelay/g
let m, n=0
while ((m = re.exec(s)) && n < 8) {
  if (s.slice(m.index, m.index+40).includes('label') || s.slice(m.index-20, m.index).includes('$t')) {
    console.log('UI', JSON.stringify(s.slice(m.index-30, m.index+100)))
  }
  n++
}
// form clear on switch mode
const l = s.indexOf('textToVideoForm')
console.log('\\nFORM', s.slice(l, l+300))
