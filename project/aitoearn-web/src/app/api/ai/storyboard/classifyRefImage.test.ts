import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyFromHints,
  pickStoryboardHero,
  scoreBoardChrome,
} from './classifyRefImage.ts'

describe('scoreBoardChrome', () => {
  it('hits BOARD-03 deck text', () => {
    const text = 'BOARD-03 CROSSING MEMORIES HERO DETAILS S01 0.0s-3.3s DO NOT CALL TO ACTION'
    const { score, hits } = scoreBoardChrome(text)
    assert.ok(score >= 4, `score=${score}`)
    assert.ok(hits.length >= 3)
  })

  it('low score on clean product caption', () => {
    const { score } = scoreBoardChrome('Comfort Colors orange tee toy story cones')
    assert.ok(score < 2)
  })
})

describe('classifyFromHints', () => {
  it('classifies tall chrome doc as board_plan', () => {
    const c = classifyFromHints({
      url: '/api/assets/board/file',
      ascii: 'BOARD-03 CROSSING MEMORIES HERO DETAILS S01 S02 S03 DO NOT PRODUCTION NOTES',
      width: 941,
      height: 1672,
    })
    assert.equal(c.role, 'board_plan')
    assert.ok(c.confidence >= 0.65)
  })

  it('classifies very tall page without ASCII as board_plan', () => {
    const c = classifyFromHints({
      url: '/api/assets/board2/file',
      ascii: '',
      width: 941,
      height: 1672,
    })
    assert.equal(c.role, 'board_plan')
  })

  it('classifies square product as product_hero', () => {
    const c = classifyFromHints({
      url: '/api/assets/product/file',
      ascii: 'Comfort Colors',
      width: 794,
      height: 794,
    })
    assert.equal(c.role, 'product_hero')
  })
})

describe('pickStoryboardHero', () => {
  it('never picks board when product exists', () => {
    const { hero, rejectedBoards, errorCode } = pickStoryboardHero([
      {
        url: '/board',
        role: 'board_plan',
        confidence: 0.99,
        reasons: [],
      },
      {
        url: '/product',
        role: 'product_hero',
        confidence: 0.8,
        reasons: [],
      },
    ])
    assert.equal(hero?.url, '/product')
    assert.equal(rejectedBoards.length, 1)
    assert.equal(errorCode, undefined)
  })

  it('errors HERO_WAS_BOARD when only board', () => {
    const { hero, errorCode } = pickStoryboardHero([
      { url: '/board', role: 'board_plan', confidence: 0.9, reasons: [] },
    ])
    assert.equal(hero, null)
    assert.equal(errorCode, 'HERO_WAS_BOARD')
  })
})
