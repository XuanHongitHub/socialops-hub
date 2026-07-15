import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { veoWatermarkInstallHint } from './veoWatermarkRemover'

describe('veoWatermarkRemover', () => {
  it('install hint mentions allenk releases and SocialsHub tools', () => {
    const h = veoWatermarkInstallHint()
    assert.match(h, /allenk\/VeoWatermarkRemover/)
    assert.match(h, /SocialsHub/)
    assert.match(h, /SOCIALOPS_VEO_WATERMARK/)
  })
})
