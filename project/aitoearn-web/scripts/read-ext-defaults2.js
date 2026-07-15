const fs = require('fs')
const p = 'F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js'
const s = fs.readFileSync(p, 'utf8')
const i = s.indexOf('L=zo({migrationVersion:5')
console.log(s.slice(i, i+700))
// locale/lang in settings
for (const k of ['locale:', 'lang:', 'language:', 'selectedLanguage', 'i18n']) {
  const n = (s.match(new RegExp(k.replace(':','\\s*:'), 'g'))||[]).length
  console.log(k, n)
}
// find where language is stored
const idx = s.indexOf("language:")
console.log('first language', s.slice(idx, idx+80))
