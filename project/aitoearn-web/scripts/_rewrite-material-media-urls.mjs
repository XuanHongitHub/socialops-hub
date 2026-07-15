import fs from 'node:fs'
const p = process.env.APPDATA + '/SocialsHub/materials.json'
const list = JSON.parse(fs.readFileSync(p, 'utf8'))
let n = 0
for (const m of list) {
  if (!Array.isArray(m.mediaList)) continue
  for (const media of m.mediaList) {
    const u = String(media.url || '')
    let id = ''
    const a = u.match(/\/api\/ai\/assets\/([^/?#]+)\/file\/?$/i)
    const b = u.match(/\/api\/ai\/assets\/file\/([^/?#]+)/i)
    const c = u.match(/[?&]id=([^&]+)/i)
    if (a) id = a[1]
    else if (b) id = b[1]
    else if (c && u.includes('local-file')) id = decodeURIComponent(c[1])
    if (id) {
      const next = '/api/ai/assets/local-file?id=' + encodeURIComponent(id)
      if (media.url !== next) {
        media.url = next
        n++
      }
    }
  }
}
fs.writeFileSync(p, JSON.stringify(list, null, 2))
console.log('rewrote', n)
