import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dimensionsFromAspectLabel,
  isKnownImageBelowMinResolution,
  normalizeImageDimsForPublish,
  normalizeVideoDimsForSocial,
  SOCIAL_IMAGE_FALLBACK,
  SOCIAL_IMAGE_MIN_EDGE,
} from './publishReadyDims.ts'

describe('dimensionsFromAspectLabel', () => {
  it('maps 9:16 to portrait social pixels', () => {
    const d = dimensionsFromAspectLabel('9:16')
    assert.equal(d.width, 1080)
    assert.equal(d.height, 1920)
  })
})

describe('normalizeVideoDimsForSocial', () => {
  it('stamps 9:16 when width/height missing (avoids false publish warnings)', () => {
    const out = normalizeVideoDimsForSocial({
      width: 0,
      height: 0,
      duration: 0,
      size: 1,
      path: 'https://cdn.example/v.mp4',
      name: 'v.mp4',
    }, '9:16')
    assert.ok(out)
    assert.equal(out!.width, 1080)
    assert.equal(out!.height, 1920)
    assert.equal(out!.duration, 15)
  })

  it('keeps valid portrait dims untouched', () => {
    const video = {
      width: 720,
      height: 1280,
      duration: 12,
      size: 2,
      path: 'x',
      name: 'x',
    }
    const out = normalizeVideoDimsForSocial(video, '9:16')
    assert.equal(out, video)
    assert.equal(out!.width, 720)
  })

  it('fixes landscape metadata that would fail IG reel checks', () => {
    const out = normalizeVideoDimsForSocial({
      width: 1920,
      height: 1080,
      duration: 10,
      size: 1,
      path: 'x',
      name: 'x',
    }, '9:16')
    assert.equal(out!.width, 1080)
    assert.equal(out!.height, 1920)
    assert.equal(out!.duration, 10)
  })
})

describe('normalizeImageDimsForPublish', () => {
  it('stamps 1080×1080 when draft left 0×0 (no TikTok false block)', () => {
    const images = [
      { id: 'a', width: 0, height: 0, imgUrl: 'https://cdn.example/product.jpg' },
      { id: 'b', width: 0, height: 0, imgUrl: 'https://cdn.example/b.jpg' },
    ]
    const out = normalizeImageDimsForPublish(images)
    assert.ok(out)
    assert.notEqual(out, images)
    for (const img of out!) {
      assert.equal(img.width, SOCIAL_IMAGE_FALLBACK.width)
      assert.equal(img.height, SOCIAL_IMAGE_FALLBACK.height)
      assert.ok(img.width >= SOCIAL_IMAGE_MIN_EDGE)
      assert.ok(img.height >= SOCIAL_IMAGE_MIN_EDGE)
    }
  })

  it('keeps already-valid dims and same array ref', () => {
    const images = [{ width: 800, height: 800, imgUrl: 'x' }]
    const out = normalizeImageDimsForPublish(images)
    assert.equal(out, images)
  })

  it('repairs partial/undersized dims', () => {
    const out = normalizeImageDimsForPublish([
      { width: 200, height: 200 },
      { width: 1200, height: 0 },
    ])
    assert.equal(out![0]!.width, 1080)
    assert.equal(out![0]!.height, 1080)
    assert.equal(out![1]!.width, 1200)
    assert.equal(out![1]!.height, 1080)
  })
})

describe('isKnownImageBelowMinResolution', () => {
  it('unknown 0×0 is not a hard fail', () => {
    assert.equal(isKnownImageBelowMinResolution(0, 0), false)
    assert.equal(isKnownImageBelowMinResolution(undefined, undefined), false)
  })

  it('known tiny image is a real fail', () => {
    assert.equal(isKnownImageBelowMinResolution(100, 100), true)
    assert.equal(isKnownImageBelowMinResolution(800, 800), false)
  })
})

describe('ensure-ready image path contract', () => {
  it('0-dim images after normalize never trip TikTok min check helper', () => {
    const stamped = normalizeImageDimsForPublish([
      { width: 0, height: 0, ossUrl: 'https://product.cdn/photo.jpg' },
    ])!
    const blocks = stamped.some(img =>
      isKnownImageBelowMinResolution(img.width, img.height),
    )
    assert.equal(blocks, false)
    assert.ok(stamped[0]!.width >= 360 && stamped[0]!.height >= 360)
  })
})
