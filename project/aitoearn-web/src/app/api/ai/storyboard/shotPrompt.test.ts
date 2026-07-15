import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildStoryboardShotPrompt } from './shotPrompt.ts'
import { defaultProductStoryboard, shotDurationSeconds, shotGenDuration } from './types.ts'

describe('defaultProductStoryboard', () => {
  it('returns 3 shots totaling ~10s at 9:16', () => {
    const board = defaultProductStoryboard({ productTitle: 'BugSell Retro Tee' })
    assert.equal(board.shots.length, 3)
    assert.equal(board.aspectRatio, '9:16')
    assert.equal(board.duration, 10)
    assert.ok(board.shots[0]!.id === 'S01')
    assert.ok(board.shots[2]!.id === 'S03')
    assert.ok(board.shots[2]!.tEnd >= 9.5)
  })
})

describe('shotDurationSeconds / shotGenDuration', () => {
  it('clamps beat length and pads gen duration to Grok min 6s', () => {
    const board = defaultProductStoryboard({})
    const s01 = board.shots[0]!
    const beat = shotDurationSeconds(s01)
    assert.ok(beat >= 3 && beat <= 8)
    const gen = shotGenDuration(s01)
    assert.ok(gen >= 6 && gen <= 10)
    assert.ok(gen >= beat)
  })
})

describe('buildStoryboardShotPrompt', () => {
  it('includes YouMind-ish structure and trailing AUDIO:', () => {
    const board = defaultProductStoryboard({
      productTitle: 'Nostalgia Tee',
      mood: 'warm gift smile',
    })
    const prompt = buildStoryboardShotPrompt({
      board,
      shot: board.shots[0]!,
      productTitle: 'Nostalgia Tee',
      hasHeroImage: true,
    })
    assert.match(prompt, /SCENE:/i)
    assert.match(prompt, /CAMERA:/i)
    assert.match(prompt, /IMAGE-TO-VIDEO|source of truth|print/i)
    assert.match(prompt, /AUDIO:/i)
    assert.match(prompt, /no voiceover|no TTS|no vocals/i)
    assert.match(prompt, /DO NOT/i)
    assert.ok(prompt.length <= 1400, `prompt too long: ${prompt.length}`)
    const idx = prompt.lastIndexOf('AUDIO:')
    assert.ok(idx > prompt.length * 0.25, 'AUDIO: should appear toward the end')
  })

  it('differs per shot title/action', () => {
    const board = defaultProductStoryboard({ productTitle: 'Tee' })
    const p1 = buildStoryboardShotPrompt({ board, shot: board.shots[0]!, hasHeroImage: true })
    const p3 = buildStoryboardShotPrompt({ board, shot: board.shots[2]!, hasHeroImage: true })
    assert.notEqual(p1, p3)
    assert.match(p1, /First Glance|Warm Nostalgia/i)
    assert.match(p3, /Close Connection|Shared Smile/i)
  })
})
