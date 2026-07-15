import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildExecutableShots,
  detectShotRisk,
  dualConstraintPrompt,
  normalizePrintLock,
  pickHeroForShot,
} from './dualConstraint.ts'
import { defaultProductStoryboard } from './types.ts'

describe('detectShotRisk', () => {
  it('flags outdoor walk as onbody_risk', () => {
    assert.equal(
      detectShotRisk({
        id: 'S02',
        tStart: 3,
        tEnd: 7,
        title: 'Stepping Out',
        scene: 'wearer walks in park',
        onFrameAction: 'friends laugh',
        camera: 'tracking steadicam',
        audioCues: [],
      }),
      'onbody_risk',
    )
  })
})

describe('buildExecutableShots dual goals', () => {
  it('keeps board title intent on S02 while forbidding fashion invent without lifestyle hero', () => {
    const board = defaultProductStoryboard({ productTitle: 'Cone Tee' })
    board.shots[1]!.title = 'Stepping Out—Playful in Public'
    board.shots[1]!.scene = 'Tee in action: the wearer walks confidently'
    board.shots[1]!.camera = 'tracking shot steadicam'
    const exec = buildExecutableShots(board, 'traffic cones Abbey Road', false)
    assert.equal(exec.length, 3)
    assert.match(exec[1]!.scenarioIntent, /Stepping Out|Playful/i)
    assert.match(exec[1]!.scene, /board|outdoor|public|energy|print/i)
    assert.match(exec[1]!.scene, /Do NOT invent a fashion model|print must match|immutable/i)
    assert.equal(exec[1]!.heroPref, 'flat_product')
  })

  it('uses lifestyle hero pref when available for onbody beat', () => {
    const board = defaultProductStoryboard({ productTitle: 'Cone Tee' })
    board.shots[1]!.scene = 'walking outdoors with friends'
    const exec = buildExecutableShots(board, 'cones', true)
    assert.equal(exec[1]!.heroPref, 'lifestyle_worn')
  })
})

describe('pickHeroForShot', () => {
  it('falls back to flat hero when no lifestyle', () => {
    const board = defaultProductStoryboard({})
    const exec = buildExecutableShots(board, 'cones', false)[1]!
    const h = pickHeroForShot(exec, '/flat', [
      { url: '/flat', role: 'product_hero', confidence: 0.9, reasons: [] },
    ])
    assert.equal(h.url, '/flat')
  })
})

describe('dualConstraintPrompt', () => {
  it('contains both SCENARIO and PRODUCT PRINT constraints', () => {
    const board = defaultProductStoryboard({ productTitle: 'Tee' })
    const exec = buildExecutableShots(board, 'traffic cones Abbey', false)[0]!
    const p = dualConstraintPrompt({
      duration: 8,
      aspectRatio: '9:16',
      productTitle: 'Tee',
      printLock: 'traffic cones Abbey',
      exec,
      hasHeroImage: true,
      audioClause: 'AUDIO: soft bed full 8 seconds, no vocals.',
    })
    assert.match(p, /CONSTRAINT A — SCENARIO/i)
    assert.match(p, /CONSTRAINT B — PRODUCT PRINT/i)
    assert.match(p, /IMAGE-TO-VIDEO/i)
    assert.match(p, /AUDIO:/i)
  })
})

describe('normalizePrintLock', () => {
  it('geometry lock for cone prints', () => {
    const p = normalizePrintLock('Toy Story cones')
    assert.match(p, /traffic cone/i)
    assert.match(p, /product photo/i)
  })
})
