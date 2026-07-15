import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildGrokNativeAudioClause,
  productCaptionPackPrompt,
  productVideoMotionPrompt,
} from './productVideoMotion.ts'

describe('productVideoMotionPrompt', () => {
  it('follows YouMind order and ends with AUDIO:', () => {
    const prompt = productVideoMotionPrompt({
      productTitle: 'BugSell Tee',
      hasReferenceImage: true,
      letterboxed: true,
      aspectRatio: '9:16',
      duration: 15,
      mood: 'Father gift',
    })
    assert.match(prompt, /Camera:/i)
    assert.match(prompt, /Lighting:/i)
    assert.match(prompt, /Image-to-video|source of truth|static|DTG/i)
    assert.match(prompt, /AUDIO:/i)
    assert.match(prompt, /acoustic|lo-fi|guitar|piano|room tone/i)
    assert.ok(prompt.length < 1200, `prompt too long: ${prompt.length}`)
    const idx = prompt.lastIndexOf('AUDIO:')
    assert.ok(idx > prompt.length * 0.35, 'AUDIO: should appear toward the end')
  })

  it('names continuous native audio with no VO', () => {
    const prompt = productVideoMotionPrompt({
      productTitle: 'Gift Mug',
      hasReferenceImage: true,
      letterboxed: false,
      aspectRatio: '1:1',
      duration: 12,
    })
    assert.match(prompt, /AUDIO:/i)
    assert.match(prompt, /full 12 seconds|12 seconds/i)
    assert.match(prompt, /no voiceover|no TTS|no vocals/i)
  })

  it('locks printed faces static', () => {
    const prompt = productVideoMotionPrompt({
      productTitle: 'Dad Photo Tee',
      hasReferenceImage: true,
      letterboxed: false,
      aspectRatio: '1:1',
      duration: 15,
    })
    assert.match(prompt, /static|DTG/i)
    assert.match(prompt, /dolly-in|orbit|continuous/i)
  })

  it('strips marketing CTA phrases from notes', () => {
    const prompt = productVideoMotionPrompt({
      productTitle: 'Gift',
      productNotes: 'Shop now Surprise Dad #sale',
      hasReferenceImage: false,
    })
    assert.doesNotMatch(prompt, /Shop now Surprise/i)
  })
})

describe('buildGrokNativeAudioClause', () => {
  it('uses gift acoustic bed for dad mood', () => {
    const a = buildGrokNativeAudioClause({ duration: 10, mood: 'Father Day gift' })
    assert.match(a, /^AUDIO:/)
    assert.match(a, /acoustic|piano/i)
    assert.match(a, /10 seconds/)
  })
})

describe('productCaptionPackPrompt', () => {
  it('caps hashtags to topicMax', () => {
    const text = productCaptionPackPrompt({ topicMax: 3, titleMax: 80, productTitle: 'X' })
    assert.match(text, /EXACTLY 3 items max/)
  })

  it('brands public CTA as BugSell marketplace not seller shop', () => {
    const text = productCaptionPackPrompt({
      topicMax: 5,
      productTitle: 'Dad Tee',
      productNotes: 'Marketplace brand: BugSell · Seller (internal only, never name in CTA): City Cats',
    })
    assert.match(text, /BugSell/i)
    assert.match(text, /NEVER "Shop now at/i)
    assert.match(text, /Seller \(internal only/i)
  })
})
