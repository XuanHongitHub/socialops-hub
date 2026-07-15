import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aspectRatioLabelToNumeric,
  platformsConstrainVideoAspect,
  resolvePublishReadyGenParams,
} from './publishReadyParams.ts'

describe('aspectRatioLabelToNumeric', () => {
  it('parses common ratios', () => {
    assert.ok(Math.abs((aspectRatioLabelToNumeric('9:16') ?? 0) - 0.5625) < 0.001)
    assert.equal(aspectRatioLabelToNumeric('nope'), null)
  })
})

describe('resolvePublishReadyGenParams', () => {
  it('auto-corrects 1:1 → 9:16 when Instagram is selected', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['instagram', 'tiktok', 'facebook'],
      preferredAspect: '1:1',
      preferredDuration: 15,
      modelRatios: ['9:16', '1:1', '16:9'],
      forceSocialPortrait: false,
    })
    assert.equal(ready.aspectRatio, '9:16')
    assert.equal(ready.aspectCorrected, true)
    assert.ok(ready.notes.some(n => /instagram|4:5|9:16/i.test(n)))
  })

  it('keeps 1:1 when only unconstrained platforms (e.g. TikTok)', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['tiktok'],
      preferredAspect: '1:1',
      preferredDuration: 15,
      modelRatios: ['9:16', '1:1', '16:9'],
    })
    assert.equal(ready.aspectRatio, '1:1')
    assert.equal(ready.aspectCorrected, false)
  })

  it('forces 9:16 when forceSocialPortrait is set', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['instagram', 'tiktok', 'facebook'],
      preferredAspect: '1:1',
      preferredDuration: 15,
      modelRatios: ['9:16', '1:1', '16:9'],
      forceSocialPortrait: true,
    })
    assert.equal(ready.aspectRatio, '9:16')
    assert.ok(ready.notes.some(n => /forced 9:16/i.test(n)))
  })

  it('fitPlatforms=false keeps preferred even if IG selected', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['instagram'],
      preferredAspect: '1:1',
      modelRatios: ['9:16', '1:1'],
      fitPlatforms: false,
    })
    assert.equal(ready.aspectRatio, '1:1')
  })

  it('clamps duration into platform intersection', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['facebook'],
      preferredDuration: 200,
      modelDurationMin: 6,
      modelDurationMax: 15,
    })
    assert.equal(ready.duration, 15)
  })

  it('uses topicMax from platform map when provided', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['instagram', 'twitter'],
      topicMaxByPlatform: { instagram: 5, twitter: 3 },
    })
    assert.equal(ready.topicMax, 3)
  })

  it('defaults topicMax 5 when no platforms', () => {
    const ready = resolvePublishReadyGenParams({ platforms: [] })
    assert.equal(ready.topicMax, 5)
  })
})

describe('platformsConstrainVideoAspect', () => {
  it('detects Instagram and YouTube aspect rules', () => {
    assert.equal(platformsConstrainVideoAspect(['instagram', 'youtube']), true)
    assert.equal(platformsConstrainVideoAspect(['youtube', 'tiktok']), true)
    assert.equal(platformsConstrainVideoAspect(['tiktok']), false)
  })
})

describe('IG + YouTube multi-post', () => {
  it('picks 9:16 as intersection (not 16:9)', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['instagram', 'youtube', 'tiktok'],
      preferredAspect: '16:9',
      modelRatios: ['9:16', '1:1', '16:9'],
    })
    assert.equal(ready.aspectRatio, '9:16')
    assert.equal(ready.aspectCorrected, true)
  })

  it('allows 16:9 for YouTube-only', () => {
    const ready = resolvePublishReadyGenParams({
      platforms: ['youtube'],
      preferredAspect: '16:9',
      modelRatios: ['9:16', '16:9', '1:1'],
    })
    assert.equal(ready.aspectRatio, '16:9')
    assert.equal(ready.aspectCorrected, false)
  })
})
