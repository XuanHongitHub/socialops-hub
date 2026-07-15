import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildReferencePackForShot,
  collectVisualRefs,
  describePackForPrompt,
  imageTag,
} from './buildReferencePack.ts'
import type { ClassifiedRef } from './classifyRefImage.ts'
import { buildExecutableShots } from './dualConstraint.ts'
import { defaultProductStoryboard } from './types.ts'

const flat: ClassifiedRef = {
  url: '/api/assets/flat.jpg',
  role: 'product_hero',
  confidence: 0.95,
  reasons: [],
}
const life: ClassifiedRef = {
  url: '/api/assets/life.jpg',
  role: 'lifestyle',
  confidence: 0.9,
  reasons: [],
}
const board: ClassifiedRef = {
  url: '/api/assets/board.png',
  role: 'board_plan',
  confidence: 0.99,
  reasons: ['chrome'],
}

describe('collectVisualRefs', () => {
  it('excludes board_plan and puts product first', () => {
    const v = collectVisualRefs([board, life, flat], flat.url)
    assert.equal(v[0]!.role, 'product')
    assert.equal(v[0]!.url, flat.url)
    assert.ok(v.some(x => x.role === 'lifestyle'))
    assert.ok(!v.some(x => x.url === board.url))
  })
})

describe('buildReferencePackForShot', () => {
  it('multi-ref on onbody beat with lifestyle', () => {
    const boardPlan = defaultProductStoryboard({ productTitle: 'Tee' })
    boardPlan.shots[1]!.scene = 'wearer walks outdoors with friends'
    const exec = buildExecutableShots(boardPlan, 'cone print', true)[1]!
    const pack = buildReferencePackForShot({
      classified: [flat, life, board],
      productHeroUrl: flat.url,
      exec,
    })
    assert.equal(pack.isMultiRef, true)
    assert.equal(pack.urls.length, 2)
    assert.equal(pack.productIndex, 1)
    assert.equal(pack.lifestyleIndex, 2)
    assert.match(describePackForPrompt(pack), /IMAGE_1/)
    assert.match(describePackForPrompt(pack), /IMAGE_2/)
  })

  it('product-only when no lifestyle on print_safe beat', () => {
    const boardPlan = defaultProductStoryboard({})
    const exec = buildExecutableShots(boardPlan, 'print', false)[0]!
    const pack = buildReferencePackForShot({
      classified: [flat, board],
      productHeroUrl: flat.url,
      exec,
    })
    assert.equal(pack.urls.length, 1)
    assert.equal(pack.isMultiRef, false)
  })
})

describe('imageTag', () => {
  it('matches xAI docs format', () => {
    assert.equal(imageTag(1), '<IMAGE_1>')
    assert.equal(imageTag(2), '<IMAGE_2>')
  })
})
