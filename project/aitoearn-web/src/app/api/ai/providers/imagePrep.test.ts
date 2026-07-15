import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import sharp from 'sharp'
import {
  nearestAspectLabel,
  parseAspectRatioLabel,
  pickProductVideoAspect,
  prepareProductRefForI2V,
} from './imagePrep.ts'

describe('imagePrep aspect helpers', () => {
  it('parses aspect labels', () => {
    assert.ok(Math.abs((parseAspectRatioLabel('3:4') ?? 0) - 0.75) < 0.001)
    assert.ok(Math.abs((parseAspectRatioLabel('9:16') ?? 0) - (9 / 16)) < 0.001)
    assert.equal(parseAspectRatioLabel('bad'), null)
  })

  it('defaults to source aspect (no silent 9:16 force)', () => {
    // Square mockup + soft 9:16 request → 1:1 (match photo)
    assert.equal(pickProductVideoAspect('9:16', 1000, 1000), '1:1')
    // 4:3 product → 4:3
    assert.equal(pickProductVideoAspect('9:16', 1200, 900), '4:3')
    // Mild portrait product shot → 3:4
    assert.equal(pickProductVideoAspect('9:16', 900, 1200), '3:4')
    // Already tall source may keep 9:16
    assert.equal(pickProductVideoAspect('9:16', 720, 1280), '9:16')
  })

  it('force=true honors requested 9:16 (letterbox path, never stretch)', () => {
    assert.equal(pickProductVideoAspect('9:16', 1000, 1000, { force: true }), '9:16')
    assert.equal(pickProductVideoAspect('9:16', 1200, 900, { force: true }), '9:16')
    // Non-force still respects explicit non-9:16 only when no source... with source, source wins
    assert.equal(pickProductVideoAspect('16:9', 1000, 1000, { force: false }), '1:1')
    assert.equal(pickProductVideoAspect('16:9', 1000, 1000, { force: true }), '16:9')
  })

  it('nearestAspectLabel prefers closest common ratio', () => {
    assert.equal(nearestAspectLabel(1000, 1000), '1:1')
    assert.equal(nearestAspectLabel(900, 1200), '3:4')
  })
})

describe('prepareProductRefForI2V studio letterbox', () => {
  it('pads square product to 9:16 without stretch and without blur bands', async () => {
    // Solid product color — if we used blur bars, top band would still be noisy product-ish.
    // Studio pad must be smooth gradient near sampled fill; center stays product red.
    const productRgb = { r: 210, g: 40, b: 40 }
    const src = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: productRgb,
      },
    }).jpeg().toBuffer()
    const dataUrl = `data:image/jpeg;base64,${src.toString('base64')}`

    const prepared = await prepareProductRefForI2V(dataUrl, '9:16', { maxSide: 640 })
    assert.equal(prepared.letterboxed, true)
    assert.ok(prepared.height > prepared.width, 'portrait frame')
    assert.ok(Math.abs((prepared.width / prepared.height) - (9 / 16)) < 0.02)

    const outBuf = Buffer.from(prepared.dataUrl.split(',')[1]!, 'base64')
    const { data, info } = await sharp(outBuf).raw().toBuffer({ resolveWithObject: true })
    const channels = info.channels
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * channels
      return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! }
    }

    // Top-center pad row: studio fill (NOT pure product red stretched)
    const top = at(Math.floor(info.width / 2), 2)
    // Center product
    const mid = at(Math.floor(info.width / 2), Math.floor(info.height / 2))

    // Product center stays strongly red
    assert.ok(mid.r > 150 && mid.r > mid.g + 40, `center product red-ish, got ${JSON.stringify(mid)}`)

    // Top pad is softer/lighter studio (not identical product red edge stretch)
    // Mean of square red is ~210 → sampleStudioColor lightens; pad should differ from pure product
    const topDiffFromProduct = Math.abs(top.r - productRgb.r) + Math.abs(top.g - productRgb.g) + Math.abs(top.b - productRgb.b)
    assert.ok(topDiffFromProduct > 5 || top.r < productRgb.r, `top pad should be studio fill, got ${JSON.stringify(top)}`)

    // Horizontal neighbor variance in top band is low (gradient/solid, not blur texture of product edge)
    const topL = at(4, 4)
    const topR = at(info.width - 5, 4)
    const horizSpread = Math.abs(topL.r - topR.r) + Math.abs(topL.g - topR.g) + Math.abs(topL.b - topR.b)
    assert.ok(horizSpread < 40, `top band should be smooth studio, spread=${horizSpread}`)
  })

  it('near-matching aspect skips letterbox flag', async () => {
    const src = await sharp({
      create: {
        width: 360,
        height: 640,
        channels: 3,
        background: { r: 20, g: 120, b: 200 },
      },
    }).jpeg().toBuffer()
    const dataUrl = `data:image/jpeg;base64,${src.toString('base64')}`
    const prepared = await prepareProductRefForI2V(dataUrl, '9:16', { maxSide: 640 })
    assert.equal(prepared.letterboxed, false)
  })
})
