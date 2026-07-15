import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyFidelityShotRecipes, normalizePrintLock } from './fidelityShots.ts'
import { defaultProductStoryboard } from './types.ts'

describe('normalizePrintLock', () => {
  it('expands cone/abbey print into geometry lock', () => {
    const p = normalizePrintLock('Toy Story traffic cones Abbey Road')
    assert.match(p, /traffic cone/i)
    assert.match(p, /zebra|crosswalk/i)
    assert.match(p, /product photo/i)
  })
})

describe('applyFidelityShotRecipes', () => {
  it('rewrites walking outdoor S02 into chest-hero print-safe framing', () => {
    const board = defaultProductStoryboard({ productTitle: 'Cone Tee' })
    // Simulate board-parse invent-heavy S02
    board.shots[1]!.scene = 'The wearer walks confidently down a sunny park path'
    board.shots[1]!.onFrameAction = 'Friends laugh and point'
    board.shots[1]!.camera = 'full body tracking shot'
    const fixed = applyFidelityShotRecipes(board, 'traffic cones Abbey Road print')
    assert.match(fixed.shots[1]!.scene, /chest|print|medium close|torso/i)
    assert.doesNotMatch(fixed.shots[1]!.scene, /walks confidently down/i)
    assert.match(fixed.shots[0]!.scene, /folded|tabletop|product photo/i)
    assert.match(fixed.shots[2]!.camera, /close-up|print/i)
  })
})
