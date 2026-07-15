import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildReferencePackForShot } from './buildReferencePack.ts'
import { buildExecutableShots } from './dualConstraint.ts'
import { r2vDualConstraintPrompt } from './r2vPrompt.ts'
import { defaultProductStoryboard } from './types.ts'
import type { ClassifiedRef } from './classifyRefImage.ts'

describe('r2vDualConstraintPrompt', () => {
  it('addresses IMAGE tags and try-on when lifestyle present', () => {
    const flat: ClassifiedRef = {
      url: '/flat',
      role: 'product_hero',
      confidence: 0.9,
      reasons: [],
    }
    const life: ClassifiedRef = {
      url: '/life',
      role: 'lifestyle',
      confidence: 0.9,
      reasons: [],
    }
    const board = defaultProductStoryboard({ productTitle: 'Cone Tee' })
    board.shots[1]!.scene = 'walking outdoors'
    const exec = buildExecutableShots(board, 'traffic cones Abbey Road', true)[1]!
    const pack = buildReferencePackForShot({
      classified: [flat, life],
      productHeroUrl: flat.url,
      exec,
    })
    const p = r2vDualConstraintPrompt({
      duration: 8,
      aspectRatio: '9:16',
      productTitle: 'Cone Tee',
      printLock: 'traffic cones Abbey Road',
      exec,
      pack,
      audioClause: 'AUDIO: soft bed full 8 seconds, no vocals.',
    })
    assert.match(p, /<IMAGE_1>/)
    assert.match(p, /<IMAGE_2>/)
    assert.match(p, /TRY-ON|wears the EXACT|MULTI-REF/i)
    assert.match(p, /CONSTRAINT A — SCENARIO/i)
    assert.match(p, /CONSTRAINT B — PRODUCT PRINT/i)
    assert.match(p, /AUDIO:/i)
  })
})
