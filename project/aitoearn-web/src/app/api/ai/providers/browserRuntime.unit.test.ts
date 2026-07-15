/**
 * Unit tests against REAL shipped helpers (no mocks of SUT).
 * Run: node --experimental-strip-types --test src/app/api/ai/providers/browserRuntime.unit.test.ts
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  getLoadExtensionPaths,
  listAutomationPacks,
} from './extension/registry.ts'
import {
  buildBrowserModelCatalogFromPacks,
  parseExtModel,
} from './extension/extModels.ts'
import {
  SEO_MEDIA_DEFAULTS,
  mergeSeoMediaDefaults,
  videoDefaultsFromSeo,
} from './extension/seoMediaDefaults.ts'
import {
  resolveBrowserEngine,
  getCloakInstallHint,
  cloakFingerprintSeed,
  cloakStealthArgs,
} from './workspace/browserEngine.ts'
import { scoreCdpExtensionTargets } from './extension/cdpVerify.ts'

describe('parseExtModel (shipped)', () => {
  it('parses ext:platform:capability', () => {
    const g = parseExtModel('ext:grok:video')
    assert.ok(g)
    assert.equal(g!.platform, 'grok')
    assert.equal(g!.capability, 'video')
    assert.equal(g!.packId, 'grok-automation')
  })
  it('rejects non-browser models', () => {
    assert.equal(parseExtModel('grok::x'), null)
    assert.equal(parseExtModel('cx_agy'), null)
  })
})

describe('buildBrowserModelCatalogFromPacks (shipped)', () => {
  it('builds catalog from real listAutomationPacks() output', () => {
    const packs = listAutomationPacks()
    const cat = buildBrowserModelCatalogFromPacks(packs)
    assert.ok(cat.videoModels.length >= 1)
    assert.ok(cat.imageModels.length >= 1)
    for (const v of cat.videoModels) {
      assert.match(v.name, /^ext:[a-z]+:video$/)
      assert.equal(v.channel, 'browser')
      assert.ok(v.tags.includes('Browser'))
      assert.ok(v.tags.includes('Experimental'))
    }
  })
  it('uses Social SEO defaults (9:16 · 15s · 1080p)', () => {
    const packs = listAutomationPacks()
    const cat = buildBrowserModelCatalogFromPacks(packs, { seo: SEO_MEDIA_DEFAULTS, tagSeo: true })
    assert.equal(cat.seo.aspectRatio, '9:16')
    assert.equal(cat.seo.duration, 15)
    assert.equal(cat.seo.resolution, '1080p')
    for (const v of cat.videoModels) {
      assert.equal(v.defaults.aspectRatio, '9:16')
      assert.equal(v.defaults.duration, 15)
      assert.equal(v.defaults.resolution, '1080p')
      assert.ok(v.tags.includes('SEO'))
      assert.deepEqual(v.seo?.portraitPixels, { width: 1080, height: 1920 })
    }
  })
  it('honors hub override merge (e.g. 10s)', () => {
    const seo = mergeSeoMediaDefaults(SEO_MEDIA_DEFAULTS, { duration: 10, resolution: '720p' })
    assert.equal(seo.duration, 10)
    assert.equal(seo.resolution, '720p')
    assert.equal(seo.aspectRatio, '9:16')
    const packs = listAutomationPacks()
    const cat = buildBrowserModelCatalogFromPacks(packs, { seo })
    assert.equal(cat.videoModels[0]?.defaults.duration, 10)
    assert.equal(cat.videoModels[0]?.defaults.resolution, '720p')
  })
})

describe('seoMediaDefaults (shipped)', () => {
  it('product baseline matches draft-box social SEO', () => {
    assert.equal(SEO_MEDIA_DEFAULTS.aspectRatio, '9:16')
    assert.equal(SEO_MEDIA_DEFAULTS.duration, 15)
    assert.equal(SEO_MEDIA_DEFAULTS.resolution, '1080p')
    assert.deepEqual(videoDefaultsFromSeo(), {
      aspectRatio: '9:16',
      duration: 15,
      resolution: '1080p',
    })
  })
  it('rejects invalid aspect override', () => {
    const m = mergeSeoMediaDefaults(SEO_MEDIA_DEFAULTS, { aspectRatio: 'wide' as any })
    assert.equal(m.aspectRatio, '9:16')
  })
})

describe('registry packs (shipped)', () => {
  it('lists 5 verified packs with manifests on disk', () => {
    const packs = listAutomationPacks()
    assert.equal(packs.length, 5)
    assert.ok(packs.filter(p => p.packageStatus === 'verified').length >= 5)
    for (const path of getLoadExtensionPaths())
      assert.ok(existsSync(join(path, 'manifest.json')), path)
  })
})

describe('resolveBrowserEngine (shipped)', () => {
  it('prefers Cloak when installed', () => {
    const auto = resolveBrowserEngine('auto')
    const hint = getCloakInstallHint()
    if (existsSync(hint.exe)) {
      assert.equal(auto.engine, 'cloak')
      assert.ok(auto.path && existsSync(auto.path))
    }
    assert.equal(resolveBrowserEngine('cloak').engine, 'cloak')
  })
})

describe('cloakStealthArgs (shipped — CloakBrowser docs)', () => {
  it('stable fingerprint seed helper is deterministic per seat', () => {
    assert.equal(cloakFingerprintSeed('primary'), cloakFingerprintSeed('primary'))
    assert.notEqual(cloakFingerprintSeed('primary'), cloakFingerprintSeed('pool-2'))
  })
  it('default stealth args empty (binary auto-fingerprint)', () => {
    const a = cloakStealthArgs({ seatId: 'primary' })
    assert.equal(a.filter(x => x.startsWith('--fingerprint=')).length, 0)
  })
  it('forceFingerprint adds seed flags', () => {
    const a = cloakStealthArgs({ seatId: 'primary', forceFingerprint: true })
    assert.ok(a.some(x => x.startsWith('--fingerprint=')))
    assert.ok(a.includes('--fingerprint-platform=windows'))
  })
  it('adds webrtc + proxy flags when proxy set', () => {
    const a = cloakStealthArgs({ seatId: 'primary', proxy: 'http://127.0.0.1:8888' })
    assert.ok(a.some(x => x.includes('--proxy-server=')))
    assert.ok(a.includes('--fingerprint-webrtc-ip=auto'))
  })
  it('documents cloudflare notes on install hint', () => {
    const hint = getCloakInstallHint()
    assert.ok(Array.isArray(hint.cloudflareNotes) && hint.cloudflareNotes.length >= 3)
  })
  it('prefers official ~/.cloakbrowser binary when present', () => {
    const resolved = resolveBrowserEngine('cloak')
    const home = process.env.USERPROFILE || ''
    const official = join(home, '.cloakbrowser', 'chromium-146.0.7680.177.4', 'chrome.exe')
    if (existsSync(official) && resolved.path) {
      assert.ok(
        resolved.path.includes('.cloakbrowser') || resolved.path.includes('cloak-v146'),
        `path=${resolved.path}`,
      )
      // Prefer cache over SocialsHub when both exist
      if (existsSync(official)) {
        const rank = resolved.path.toLowerCase()
        assert.ok(
          rank.includes('.cloakbrowser') || rank.includes('cloakbrowser_path'),
          `expected official cache first, got ${resolved.path}`,
        )
      }
    }
  })
})

describe('scoreCdpExtensionTargets (shipped)', () => {
  const packs = ['a', 'b', 'c', 'd', 'e']
  it('fails when only one SW is visible (honest gate)', () => {
    const r = scoreCdpExtensionTargets([
      { type: 'service_worker', url: 'chrome-extension://jjhpflgflhnofpkkbakljkagfjelnlop/background.js' },
      { type: 'page', url: 'about:blank' },
    ], 5, packs)
    assert.equal(r.ok, false)
    assert.equal(r.uniqueExtensionIds.length, 1)
    assert.deepEqual(r.missingPackIds, packs)
  })
  it('passes when five unique extension IDs are present', () => {
    const ids = [
      'jjhpflgflhnofpkkbakljkagfjelnlop',
      'kpeloeongamilgpjaibcdmldenfmdngp',
      'nocgcjgldlpeffhdhfjejhcgjbgcmpgb',
      'jlhacppkbcmonaanlkbgipimelfbjgpb',
      'fnmijgmnjpealnnadjpjilaanhhambeb',
    ]
    const targets = ids.map(id => ({
      type: 'service_worker',
      url: `chrome-extension://${id}/service-worker-loader.js`,
    }))
    const r = scoreCdpExtensionTargets(targets, 5, packs)
    assert.equal(r.ok, true)
    assert.equal(r.uniqueExtensionIds.length, 5)
    assert.deepEqual(r.missingPackIds, [])
  })
})
