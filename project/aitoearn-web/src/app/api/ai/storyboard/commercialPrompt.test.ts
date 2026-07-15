import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCommercialStoryboardPrompt } from './commercialPrompt.ts'
import { defaultProductStoryboard } from './types.ts'

describe('buildCommercialStoryboardPrompt', () => {
  it('emits multi-scene commercial structure and print lock', () => {
    const board = defaultProductStoryboard({ productTitle: 'Cone Parade Tee' })
    board.shots[0]!.tStart = 0
    board.shots[0]!.tEnd = 3.3
    board.shots[1]!.tStart = 3.3
    board.shots[1]!.tEnd = 6.7
    board.shots[2]!.tStart = 6.7
    board.shots[2]!.tEnd = 10
    const p = buildCommercialStoryboardPrompt({
      duration: 10,
      aspectRatio: '9:16',
      productTitle: 'vintage-washed orange crewneck with cartoon parade print',
      printLock: 'traffic cone hats Abbey Road zebra print',
      board,
      audioClause: 'AUDIO: soft bed full 10 seconds, no vocals.',
    })
    assert.match(p, /10-second vertical fashion commercial/i)
    assert.match(p, /Scene 1 \(0\.0-3\.3s\)/i)
    assert.match(p, /Scene 2 \(3\.3-6\.7s\)/i)
    assert.match(p, /Scene 3 \(6\.7-10\.0s\)/i)
    assert.match(p, /traffic cone|Abbey|print/i)
    assert.match(p, /9:16 vertical/i)
    assert.match(p, /no text|no subtitles/i)
    assert.match(p, /AUDIO:/i)
    assert.ok(!/IMAGE_1|reference.?image|try-on from/i.test(p))
    assert.ok(p.length <= 1600)
  })

  it('scales scene windows for 15s duration', () => {
    const board = defaultProductStoryboard({ productTitle: 'Tee' })
    board.shots[0]!.tStart = 0
    board.shots[0]!.tEnd = 5
    board.shots[1]!.tStart = 5
    board.shots[1]!.tEnd = 10
    board.shots[2]!.tStart = 10
    board.shots[2]!.tEnd = 15
    const p = buildCommercialStoryboardPrompt({
      duration: 15,
      aspectRatio: '9:16',
      productTitle: 'Tee',
      printLock: 'cone print',
      board,
    })
    assert.match(p, /15-second vertical fashion commercial/i)
    assert.match(p, /Scene 1 \(0\.0-5\.0s\)/i)
    assert.match(p, /Scene 3 \(10\.0-15\.0s\)/i)
  })
})
