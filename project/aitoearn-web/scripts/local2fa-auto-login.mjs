/**
 * Auto-login ChatGPT (or Google) on an existing CDP seat using local-2fa-auth vault export.
 * Usage:
 *   node scripts/local2fa-auto-login.mjs --platform chatgpt --accountId 109
 *   node scripts/local2fa-auto-login.mjs --platform chatgpt --preferIssuer icloud.com
 *
 * Reads F:/ACERMO~1/Temp/local2fa-creds.json (or %TEMP%/local2fa-creds.json)
 * Connects to CDP http://127.0.0.1:9480
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
// pnpm nests playwright under .pnpm; resolve via @playwright/test dependency tree
let chromium
try {
  ;({ chromium } = require('playwright'))
}
catch {
  const candidates = [
    join(__dirname, '../node_modules/.pnpm/playwright@1.57.0/node_modules/playwright'),
    join(__dirname, '../node_modules/playwright'),
  ]
  let loaded = false
  for (const p of candidates) {
    try {
      ;({ chromium } = require(p))
      loaded = true
      break
    }
    catch { /* next */ }
  }
  if (!loaded)
    throw new Error('playwright package not resolvable')
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--'))
      acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true])
    return acc
  }, []),
)

const CDP = String(args.cdp || 'http://127.0.0.1:9480')
const platform = String(args.platform || 'chatgpt')
const accountId = args.accountId ? Number(args.accountId) : null
const preferIssuer = args.preferIssuer ? String(args.preferIssuer) : null

function loadCreds() {
  const candidates = [
    join(tmpdir(), 'local2fa-creds.json'),
    'F:\\ACERMO~1\\Temp\\local2fa-creds.json',
    'C:\\Users\\Acer\\AppData\\Local\\Temp\\local2fa-creds.json',
  ]
  for (const p of candidates) {
    try {
      return { path: p, rows: JSON.parse(readFileSync(p, 'utf8')) }
    }
    catch { /* next */ }
  }
  throw new Error('local2fa-creds.json not found — run local-2fa-auth/scripts/export-creds-for-seat.php first')
}

function pickAccount(rows) {
  if (accountId) {
    const hit = rows.find(r => r.id === accountId)
    if (!hit)
      throw new Error(`account id ${accountId} not found`)
    return hit
  }
  if (preferIssuer) {
    const hit = rows.find(r =>
      String(r.issuer || '').toLowerCase().includes(preferIssuer.toLowerCase())
      && r.password
      && r.username,
    )
    if (hit)
      return hit
  }
  // Prefer passworded email-like accounts (typical ChatGPT email login pool)
  const withPw = rows.filter(r => r.password && r.username && String(r.username).includes('@'))
  // Skip pure OpenAI/xAI OTP-only rows for password form
  const preferred = withPw.find(r => /icloud|hotmail|outlook|chiamn|hathitrannhien/i.test(r.issuer || r.username))
    || withPw.find(r => /gmail/i.test(r.issuer || r.username))
    || withPw[0]
  if (!preferred)
    throw new Error('No passworded account available in local-2fa pool')
  return preferred
}

async function fillFirst(page, selectors, value) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if (await loc.count() && await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 3000 }).catch(() => {})
      await loc.fill('')
      await loc.fill(value)
      return sel
    }
  }
  return null
}

async function clickFirst(page, selectors, textRe) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if (await loc.count() && await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5000 })
      return sel
    }
  }
  if (textRe) {
    const btn = page.getByRole('button', { name: textRe }).first()
    if (await btn.count()) {
      await btn.click({ timeout: 5000 })
      return 'role=button'
    }
  }
  return null
}

async function maybeFillOtp(page, otp) {
  if (!otp)
    return { filled: false }
  const sels = [
    'input[name="code"]',
    'input[autocomplete="one-time-code"]',
    'input[inputmode="numeric"]',
    'input[name="otp"]',
    'input[placeholder*="code" i]',
    'input[aria-label*="code" i]',
  ]
  await page.waitForTimeout(1500)
  for (const sel of sels) {
    const loc = page.locator(sel).first()
    if (await loc.count() && await loc.isVisible().catch(() => false)) {
      await loc.fill(otp)
      await clickFirst(page, ['button[type="submit"]'], /continue|verify|submit|confirm|tiếp/i)
      return { filled: true, sel }
    }
  }
  return { filled: false }
}

async function loginChatgpt(page, account) {
  const log = []
  await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  log.push({ step: 'open', url: page.url() })

  // Cookie / consent banners
  await clickFirst(page, [], /accept all|accept|đồng ý/i).catch(() => null)

  // Prefer email login over Google when we have passworded non-gmail
  const emailLogin = page.getByRole('button', { name: /log in|sign in|đăng nhập/i }).first()
  if (await emailLogin.count()) {
    await emailLogin.click().catch(() => {})
    await page.waitForTimeout(1000)
  }

  // "Continue with email" patterns
  await clickFirst(page, [
    'button:has-text("Continue with email")',
    'button:has-text("Log in")',
    'a:has-text("Log in")',
  ], /continue with email|log in with email|email/i).catch(() => null)
  await page.waitForTimeout(1500)

  const emailSel = await fillFirst(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[autocomplete="username"]',
    'input[id*="email" i]',
  ], account.username)
  log.push({ step: 'email', sel: emailSel, user: account.username })

  await clickFirst(page, ['button[type="submit"]'], /continue|next|tiếp|log in|sign in/i)
  // Wait for password step (OpenAI multi-step)
  await page.waitForURL(/password|log-in|auth/i, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})

  let passSel = await fillFirst(page, [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="current-password"]',
    'input[autocomplete="current-password"]',
  ], account.password || '')

  // Retry once if password page loaded late
  if (!passSel) {
    await page.waitForTimeout(2500)
    passSel = await fillFirst(page, [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
    ], account.password || '')
  }
  log.push({ step: 'password', sel: passSel, hasPw: Boolean(account.password), url: page.url() })

  if (passSel) {
    await clickFirst(page, ['button[type="submit"]'], /continue|log in|sign in|tiếp/i)
    await page.waitForTimeout(3500)
  }

  // OTP / email code / authenticator
  for (let attempt = 0; attempt < 3; attempt++) {
    const otpRes = await maybeFillOtp(page, account.otp)
    log.push({ step: 'otp', attempt, ...otpRes, hasOtp: Boolean(account.otp), url: page.url() })
    if (otpRes.filled)
      break
    await page.waitForTimeout(2000)
  }

  await page.waitForTimeout(4000)
  const url = page.url()
  const title = await page.title().catch(() => '')
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 500)
  const looksLoggedIn = (/chatgpt\.com/i.test(url) && !/auth\/login|auth\/error/i.test(url))
    || /chat\.openai\.com/i.test(url)
  const challenge = /captcha|verify you|unusual activity|suspended|incorrect|wrong password|too many|couldn't log|invalid/i.test(snippet)

  return {
    platform: 'chatgpt',
    accountId: account.id,
    username: account.username,
    issuer: account.issuer,
    finalUrl: url,
    title,
    looksLoggedIn,
    challenge,
    snippet,
    log,
  }
}

async function loginGoogle(page, account) {
  const log = []
  await page.goto('https://accounts.google.com/ServiceLogin', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  log.push({ step: 'open', url: page.url() })

  const emailSel = await fillFirst(page, [
    'input[type="email"]',
    'input[name="identifier"]',
  ], account.username)
  log.push({ step: 'email', sel: emailSel })
  await clickFirst(page, ['#identifierNext button', 'button:has-text("Next")'], /next|tiếp/i)
  await page.waitForTimeout(2500)

  const passSel = await fillFirst(page, [
    'input[type="password"]',
    'input[name="Passwd"]',
  ], account.password || '')
  log.push({ step: 'password', sel: passSel })
  if (passSel) {
    await clickFirst(page, ['#passwordNext button', 'button:has-text("Next")'], /next|tiếp/i)
    await page.waitForTimeout(3000)
  }

  const otpRes = await maybeFillOtp(page, account.otp)
  log.push({ step: 'otp', ...otpRes })

  await page.waitForTimeout(3000)
  const url = page.url()
  const snippet = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
  return {
    platform: 'google',
    accountId: account.id,
    username: account.username,
    finalUrl: url,
    looksLoggedIn: /myaccount\.google\.com|mail\.google\.com/i.test(url),
    challenge: /captcha|verify|unusual|couldn't sign|wrong password/i.test(snippet),
    snippet,
    log,
  }
}

async function main() {
  const { path, rows } = loadCreds()
  const account = pickAccount(rows)
  // Refresh OTP near use: re-run export if remaining low is not available — use current
  console.log(JSON.stringify({
    usingCredsFile: path,
    pick: { id: account.id, issuer: account.issuer, username: account.username, hasPw: !!account.password, hasOtp: !!account.otp },
    platform,
    cdp: CDP,
  }))

  const browser = await chromium.connectOverCDP(CDP)
  const context = browser.contexts()[0] || await browser.newContext()
  const page = context.pages()[0] || await context.newPage()

  let result
  if (platform === 'google' || platform === 'gmail')
    result = await loginGoogle(page, account)
  else
    result = await loginChatgpt(page, account)

  const outPath = join(tmpdir(), 'local2fa-login-result.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ resultFile: outPath, ...result }, null, 2))
  // keep browser open (CDP owned by seat)
  await browser.close().catch(() => {})
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }))
  process.exit(1)
})
