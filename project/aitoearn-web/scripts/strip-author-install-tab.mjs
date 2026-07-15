/**
 * Remove author "open kylenguyen.me?new-version-installed=true" on extension install.
 * Keeps sidePanel setup + reload of site tabs.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const files = [
  'extensions/grok-automation-ext/assets/index.ts-BTg47V9k.js',
  'extensions/chatgpt-automation-ext/assets/index.ts-DMt1LMj0.js',
  'extensions/gemini-automation-ext/assets/index.ts-DMYBFwyk.js',
  'extensions/flow-automation-ext/assets/index.ts-DoSGWp_j.js',
]

// The install-time marketing tab opener (minified), variable names differ slightly per pack
const patterns = [
  // full IIFE call with new-version-installed
  /await\(async e=>\{try\{const \w+=await chrome\.tabs\.query\(\{url:\[\x60\*\:\/\/kylenguyen\.me\/\*\?\$\{e\}\x60\]\}\);if\([\s\S]*?chrome\.tabs\.create\(\{url:\x60https:\/\/kylenguyen\.me\?\$\{e\}\x60\}\)\}catch\(\w+\)\{\}\}\)\("new-version-installed=true"\),?/g,
  // bare create
  /await chrome\.tabs\.create\(\{url:\x60https:\/\/kylenguyen\.me\?\$\{e\}\x60\}\)/g,
  /await chrome\.tabs\.create\(\{url:"https:\/\/kylenguyen\.me\?new-version-installed=true"\}\)/g,
  /await chrome\.tabs\.create\(\{url:'https:\/\/kylenguyen\.me\?new-version-installed=true'\}\)/g,
]

for (const rel of files) {
  const f = new URL(`../${rel}`, import.meta.url)
  let t = readFileSync(f, 'utf8')
  const before = t
  for (const re of patterns)
    t = t.replace(re, '')

  // Fallback: if still has new-version-installed create, surgically cut from query kylenguyen through IIFE end
  if (t.includes('new-version-installed')) {
    t = t.replace(
      /await\(async e=>\{try\{const \w+=await chrome\.tabs\.query\(\{url:\[\x60\*\:\/\/kylenguyen\.me[^\]]+\]\}\)[\s\S]*?\}\)\("new-version-installed=true"\),?/g,
      '',
    )
  }

  // Absolute nuclear: any tabs.create to kylenguyen.me (install promo only; keep config CDN)
  t = t.replace(
    /await chrome\.tabs\.create\(\{url:\x60https:\/\/kylenguyen\.me[^`]*\x60\}\)/g,
    '/* socialops: stripped author install tab */undefined',
  )
  t = t.replace(
    /await chrome\.tabs\.create\(\{url:"https:\/\/kylenguyen\.me[^"]*"\}\)/g,
    '/* socialops: stripped author install tab */undefined',
  )

  writeFileSync(f, t)
  const still = (t.match(/new-version-installed|tabs\.create\(\{url:[\x60"]https:\/\/kylenguyen\.me/g) || []).length
  const idx = t.indexOf('onInstalled')
  console.log(rel)
  console.log('  changed=', before !== t, 'leftoverHits=', still)
  console.log('  onInstalled:', t.slice(idx, idx + 320).replace(/\s+/g, ' '))
}
