/**
 * Unit checks for BugSell product → gen mapping (mirrors _client helpers).
 * Run: node scripts/bugsell-bridge-unit.mjs
 */

function productStoreUrl(storeUrl, slug) {
  return `${storeUrl.replace(/\/$/, '')}/products/${slug}`
}

function normalizeProductCard(raw, storeUrl) {
  const slug = String(raw.slug || '')
  const shop = raw.shop && typeof raw.shop === 'object' ? raw.shop : null
  return {
    id: String(raw.id || ''),
    slug,
    name: String(raw.name || ''),
    price: Number(raw.price || 0),
    salePrice: raw.sale_price == null ? null : Number(raw.sale_price),
    thumbnailUrl: raw.thumbnail_url || raw.image || null,
    storeUrl: slug ? productStoreUrl(storeUrl, slug) : '',
    shop: shop ? { slug: String(shop.slug || ''), name: String(shop.name || '') } : null,
    category: raw.category ? { name: String(raw.category.name || '') } : null,
    isCustomizable: Boolean(raw.is_customizable),
  }
}

function productToGenInput(product) {
  const priceLabel = product.salePrice != null && product.salePrice < product.price
    ? `$${product.salePrice} (was $${product.price})`
    : `$${product.price}`
  return {
    productUrl: product.storeUrl,
    productTitle: product.name,
    productNotes: [
      product.shop?.name ? `Shop: ${product.shop.name}` : '',
      product.category?.name ? `Category: ${product.category.name}` : '',
      `Price: ${priceLabel}`,
      product.isCustomizable ? 'Customizable product' : '',
    ].filter(Boolean).join(' · '),
  }
}

function envEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function getConfig(env) {
  const enabled = envEnabled(env.BUGSELL_ENABLED)
  const apiUrl = (env.BUGSELL_API_URL || 'https://api.bugsell.com').replace(/\/$/, '')
  if (!enabled) return { enabled: false, reason: 'disabled' }
  if (/bugsell\.test|localhost|127\.0\.0\.1/i.test(apiUrl) && !envEnabled(env.BUGSELL_ALLOW_LOCAL))
    return { enabled: false, reason: 'local blocked' }
  return { enabled: true, apiUrl }
}

let failed = 0
function check(name, cond) {
  if (!cond) {
    failed += 1
    console.error(`FAIL  ${name}`)
  }
  else console.log(`PASS  ${name}`)
}

const product = normalizeProductCard({
  id: '1',
  name: 'Cat Shirt',
  slug: 'cat-shirt',
  price: 29.99,
  sale_price: 23.99,
  thumbnail_url: 'https://cdn.example/a.png',
  is_customizable: true,
  shop: { slug: 'city-cats', name: 'City Cats' },
  category: { name: 'Graphic Tees' },
}, 'https://www.bugsell.com')

const gen = productToGenInput(product)
check('store url prod', gen.productUrl === 'https://www.bugsell.com/products/cat-shirt')
check('title', gen.productTitle === 'Cat Shirt')
check('notes has shop', gen.productNotes.includes('City Cats'))
check('notes has sale', gen.productNotes.includes('$23.99'))

check('disabled by default', getConfig({}).enabled === false)
check('enabled prod', getConfig({ BUGSELL_ENABLED: 'true' }).enabled === true)
check('block local', getConfig({ BUGSELL_ENABLED: 'true', BUGSELL_API_URL: 'http://bugsell.test' }).enabled === false)
check('allow local override', getConfig({ BUGSELL_ENABLED: 'true', BUGSELL_API_URL: 'http://bugsell.test', BUGSELL_ALLOW_LOCAL: 'true' }).enabled === true)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nBugSell bridge unit checks passed')
