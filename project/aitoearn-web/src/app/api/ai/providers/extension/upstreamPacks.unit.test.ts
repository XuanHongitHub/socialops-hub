/**
 * Run: node --experimental-strip-types --test src/app/api/ai/providers/extension/upstreamPacks.unit.test.ts
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HUB_CONFIG_BASES,
  UPSTREAM_CONFIG_BASES,
  UPSTREAM_PACKS,
  getUpstreamPack,
  summarizeRemoteConfig,
} from './upstreamPacks.ts'

describe('upstream packs inventory (shipped)', () => {
  it('lists all 4 niche packs with secrets + paths', () => {
    assert.equal(UPSTREAM_PACKS.length, 4)
    for (const p of UPSTREAM_PACKS) {
      assert.ok(p.configPath)
      assert.ok(p.clientSecret.startsWith('YES_THAT'))
      assert.ok(p.platforms.length >= 1)
      assert.ok(p.capabilities.length >= 1)
    }
    assert.ok(getUpstreamPack('grok-automation'))
    assert.ok(getUpstreamPack('flow-automation'))
    assert.equal(getUpstreamPack('nope'), null)
  })
  it('hub bases are local SocialOps mirror paths', () => {
    assert.ok(HUB_CONFIG_BASES.some(b => b.includes('127.0.0.1:6061')))
    assert.ok(HUB_CONFIG_BASES.every(b => b.includes('/extension/mirror')))
  })
  it('upstream bases are author CDNs (final fallback)', () => {
    assert.ok(UPSTREAM_CONFIG_BASES.includes('https://configs.kylenguyen.me'))
    assert.ok(UPSTREAM_CONFIG_BASES.includes('https://extension-config.onegreen.workers.dev'))
  })
  it('summarizeRemoteConfig counts selectors', () => {
    const s = summarizeRemoteConfig({
      version: '1.0.0',
      hash: 'abc',
      selectors: { a: '1', b: '2', c: '3' },
      shareUrlTemplate: 'x',
    })
    assert.equal(s.selectorCount, 3)
    assert.equal(s.hasSelectors, true)
    assert.deepEqual(s.extraKeys, ['shareUrlTemplate'])
  })
})
