const fs = require('fs')
const main = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
const cs = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.ts-Bt6B9Lbt.js','utf8')
const a = 'sendJob:async(n,o={})=>{t.value=!0,e.value=null;const i=o.groupId??`group-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,a=o.concurrentPrompts,r=o.promptDelaySecondsMin,s=o.promptDelaySecondsMax;'
console.log('main has exact sendJob start', main.includes(a))
// find actual
const i = main.indexOf('sendJob:async(n,o={})')
console.log(JSON.stringify(main.slice(i, i+280)))
const j = cs.indexOf('u=e.promptDelaySecondsMin??0,l=e.promptDelaySecondsMax??u;if(i>0&&l>0){const t=u>=l?u:u+Math.random()*(l-u);let n=0;for(;n<1e3*t;)if(await z(1e3),n+=1e3,e.isCancelling)return}')
console.log('cs has delay loop', j>=0)
console.log(JSON.stringify(cs.slice(j, j+200)))
