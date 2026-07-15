const fs = require('fs')
const s = fs.readFileSync('F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js','utf8')
// find language setting persistence
const needles = ['currentLocale','appLocale','uiLanguage','preferredLanguage','setLocale','locale=','"en"','"vi"','languages']
for (const k of needles) {
  let i = s.indexOf(k)
  if (i>=0) console.log(k, JSON.stringify(s.slice(i-40, i+100)))
  else console.log('MISS', k)
}
// storage keys for language
const re = /local\.(get|set)\(\[?[\"']([a-zA-Z_]+)[\"']/g
let m, set = new Set(), n=0
while ((m=re.exec(s)) && n<40) { set.add(m[2]); n++ }
console.log('storage keys sample', [...set].slice(0,30))
