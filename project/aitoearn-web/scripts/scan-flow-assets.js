const fs = require('fs')
const path = 'F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets'
for (const f of fs.readdirSync(path)) {
  if (!f.endsWith('.js')) continue
  const s = fs.readFileSync(path+'/'+f,'utf8')
  if (s.includes('promptDelaySeconds') || s.includes('AUTO_FILL_FLOW') || s.includes('random')) {
    console.log('FILE', f, s.length)
    const i = s.indexOf('promptDelay')
    if (i>=0) console.log(JSON.stringify(s.slice(i, i+200)))
    const j = s.indexOf('AUTO_FILL')
    if (j>=0) console.log('AUTO', JSON.stringify(s.slice(j, j+150)))
  }
}
