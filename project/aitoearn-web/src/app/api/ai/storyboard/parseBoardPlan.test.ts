import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { autoBoardFromProduct } from './parseBoardPlan.ts'

describe('autoBoardFromProduct', () => {
  it('builds 3 shots and injects print lock into S01/S03', () => {
    const board = autoBoardFromProduct({
      productTitle: 'Cone Tee',
      printLock: 'Toy Story characters with traffic cones on Abbey Road',
      mood: 'gift smile',
    })
    assert.equal(board.shots.length, 3)
    assert.equal(board.aspectRatio, '9:16')
    assert.match(board.shots[0]!.scene, /traffic cones|Abbey Road|print/i)
    assert.match(board.shots[2]!.onFrameAction, /traffic cones|print/i)
    assert.ok(board.heroDetails?.some(h => /traffic cones/i.test(h)))
  })
})
