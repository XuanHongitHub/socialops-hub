import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildYouMindStyleProductVisual,
  grokCameraPhrase,
  YOUMIND_GROK_IMAGINE_RULES,
} from './grokImaginePromptCraft.ts'
import { productVideoMotionPrompt } from './productVideoMotion.ts'

describe('grokImaginePromptCraft (YouMind-inspired)', () => {
  it('names explicit camera moves like YouMind examples', () => {
    assert.match(grokCameraPhrase('slow_dolly_in'), /dolly-in|push-in/i)
    assert.match(grokCameraPhrase('gentle_orbit'), /orbit/i)
  })

  it('orders scene → camera → lighting → subject', () => {
    const v = buildYouMindStyleProductVisual({
      duration: 12,
      aspectRatio: '4:3',
      productTitle: 'Dad Dog Tee',
      scene: 'Father and son on a beige sofa wearing matching black tees',
      camera: 'slow_dolly_in',
      lighting: 'soft warm window light',
      mood: 'Father\'s Day gift',
      hasReferenceImage: true,
      printHasFaces: false,
    })
    const sceneIdx = v.search(/Father and son/i)
    const camIdx = v.search(/Camera:/i)
    const lightIdx = v.search(/Lighting:/i)
    const refIdx = v.search(/Image-to-video|source of truth/i)
    assert.ok(sceneIdx >= 0 && camIdx > sceneIdx && lightIdx > camIdx)
    assert.ok(refIdx > lightIdx)
    assert.match(v, /dolly-in|push-in/i)
    assert.match(v, /static|DTG|print/i)
  })

  it('documents YouMind craft rules for the agent', () => {
    assert.match(YOUMIND_GROK_IMAGINE_RULES, /SCENE/i)
    assert.match(YOUMIND_GROK_IMAGINE_RULES, /CAMERA/i)
    assert.match(YOUMIND_GROK_IMAGINE_RULES, /AUDIO/i)
  })
})

describe('productVideoMotionPrompt + YouMind', () => {
  it('ends with AUDIO and includes camera + scene order', () => {
    const p = productVideoMotionPrompt({
      productTitle: 'Personalized Best Dad Ever Shirt',
      productNotes: 'Father Day gift lifestyle',
      hasReferenceImage: true,
      letterboxed: false,
      aspectRatio: '4:3',
      duration: 12,
      mood: 'gift dad',
      camera: 'slow_dolly_in',
    })
    assert.match(p, /Camera:/i)
    assert.match(p, /Lighting:/i)
    assert.match(p, /AUDIO:/i)
    assert.ok(p.lastIndexOf('AUDIO:') > p.search(/Camera:/i))
    assert.ok(p.length < 1200)
  })
})
