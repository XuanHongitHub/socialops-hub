import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const dir = 'C:/Users/Acer/AppData/Roaming/SocialsHub/grok-web-test'
const prod = await sharp(`${dir}/product.jpg`).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()
const life = await sharp(`${dir}/lifestyle.jpg`).resize(640, 800, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()
await writeFile(`${dir}/product-sm.jpg`, prod)
await writeFile(`${dir}/lifestyle-sm.jpg`, life)
const prodB = prod.toString('base64')
const lifeB = life.toString('base64')
const js = [
  'async (page) => {',
  `  const productB64 = '${prodB}';`,
  `  const lifeB64 = '${lifeB}';`,
  '  const result = await page.evaluate(async ({ productB64, lifeB64 }) => {',
  '    const toFile = (b64, name) => {',
  '      const bin = atob(b64);',
  '      const arr = new Uint8Array(bin.length);',
  '      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);',
  "      return new File([arr], name, { type: 'image/jpeg' });",
  '    };',
  "    const input = document.querySelector('input[type=file]');",
  "    if (!input) return { ok: false, reason: 'no input' };",
  '    const dt = new DataTransfer();',
  "    dt.items.add(toFile(productB64, 'product.jpg'));",
  "    dt.items.add(toFile(lifeB64, 'lifestyle.jpg'));",
  '    input.files = dt.files;',
  "    input.dispatchEvent(new Event('input', { bubbles: true }));",
  "    input.dispatchEvent(new Event('change', { bubbles: true }));",
  "    return { ok: true, files: input.files.length, names: [...input.files].map(f => f.name + ':' + f.size) };",
  '  }, { productB64, lifeB64 });',
  '  await page.waitForTimeout(4000);',
  '  const ui = await page.evaluate(() => document.body.innerText.slice(0, 1500));',
  '  return { result, ui };',
  '}',
].join('\n')
await writeFile(`${dir}/upload-sm.js`, js)
console.log('ok', js.length, prod.length, life.length)
