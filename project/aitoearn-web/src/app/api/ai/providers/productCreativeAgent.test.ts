import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildProductCreativeAgentPrompt,
  composeMotionPromptFromAgent,
} from './productCreativeAgentCore.ts'

describe('buildProductCreativeAgentPrompt', () => {
  it('asks for vision + multi-channel SEO + motion JSON', () => {
    const p = buildProductCreativeAgentPrompt({
      productTitle: 'Dad Photo Tee',
      platforms: ['tiktok', 'instagram', 'pinterest'],
      duration: 12,
      aspectRatio: '1:1',
      imageUrl: 'https://cdn.example.com/tee.jpg',
      hasReferenceImage: true,
      topicMax: 5,
      titleMax: 80,
    })
    assert.match(p, /SEE the product photo|vision|reference image/i)
    assert.match(p, /channelAngles/i)
    assert.match(p, /motionPrompt/i)
    assert.match(p, /tiktok|instagram|pinterest/i)
    assert.match(p, /native audio|soundtrack|never silent|AUDIO/i)
  })

  it('does not force BugSell marketplace when only ref images', () => {
    const p = buildProductCreativeAgentPrompt({
      imageUrl: 'data:image/jpeg;base64,xx',
      hasReferenceImage: true,
      bugsellCatalog: false,
      duration: 10,
      aspectRatio: '9:16',
    })
    assert.match(p, /reference images only|NOT invent|Marketplace Finds/i)
    assert.match(p, /no bugsell|Do NOT invent/i)
  })

  it('enables BugSell CTA when catalog product selected', () => {
    const p = buildProductCreativeAgentPrompt({
      productTitle: 'Dad Tee',
      productUrl: 'https://bugsell.com/p/dad-tee',
      imageUrl: 'https://cdn.example.com/tee.jpg',
      hasReferenceImage: true,
      bugsellCatalog: true,
      duration: 12,
    })
    assert.match(p, /BugSell marketplace|Find it on BugSell/i)
  })
})

describe('composeMotionPromptFromAgent', () => {
  it('keeps agent visual and ends with AUDIO: clause', () => {
    const p = composeMotionPromptFromAgent({
      agentMotionPrompt: 'Slow orbit around a cotton dad gift tee in soft window light.',
      vision: { printHasFaces: true, printOrArtwork: 'photo of child on chest', mood: 'gift' },
      productTitle: 'Best Dad Tee',
      duration: 15,
      aspectRatio: '1:1',
      hasReferenceImage: true,
      motionBrief: {
        audioBed: 'warm acoustic guitar gift bed with living room tone',
        camera: 'micro push-in',
      },
    })
    assert.match(p, /Slow orbit around a cotton dad gift tee/i)
    assert.match(p, /AUDIO:/i)
    assert.match(p, /static|print/i)
    assert.match(p, /acoustic|guitar/i)
    const idx = p.lastIndexOf('AUDIO:')
    assert.ok(idx > p.length * 0.35, 'AUDIO: should trail the visual')
    assert.ok(p.length < 1400)
  })

  it('builds from brief when agent draft is empty', () => {
    const p = composeMotionPromptFromAgent({
      productTitle: 'Mug',
      duration: 10,
      aspectRatio: '9:16',
      hasReferenceImage: true,
      motionBrief: {
        scene: 'Hands holding ceramic mug on kitchen table',
        camera: 'slow push-in',
        audioBed: 'soft lo-fi guitar',
      },
    })
    assert.match(p, /Hands holding ceramic mug/i)
    assert.match(p, /AUDIO:/i)
    assert.match(p, /lo-fi/i)
  })
})
