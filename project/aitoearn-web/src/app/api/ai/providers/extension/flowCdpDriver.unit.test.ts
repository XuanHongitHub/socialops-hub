import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  flowBlobExtractExpression,
  flowMediaScanExpression,
  isArchivableFlowUrl,
  isJunkFlowMediaUrl,
  pickBestFlowMediaUrl,
} from './flowCdpDriver'

describe('flowCdpDriver media helpers', () => {
  it('prefers https mp4 over blob and rejects banners', () => {
    assert.equal(
      pickBestFlowMediaUrl([
        'blob:https://x/1',
        'https://www.gstatic.com/aitestkitchen/website/flow/banners/x.mp4',
        'https://cdn.example/v.mp4',
      ]),
      'https://cdn.example/v.mp4',
    )
  })

  it('falls back to blob when no https', () => {
    assert.equal(pickBestFlowMediaUrl(['blob:foo']), 'blob:foo')
    assert.equal(pickBestFlowMediaUrl([]), undefined)
  })

  it('detects archivable http(s) only (real media, not banners)', () => {
    assert.equal(isArchivableFlowUrl('https://storage.googleapis.com/x.mp4'), true)
    assert.equal(isArchivableFlowUrl('blob:https://labs.google/uuid'), false)
    assert.equal(isArchivableFlowUrl('https://www.gstatic.com/aitestkitchen/website/flow/banners/io.mp4'), false)
    assert.equal(isJunkFlowMediaUrl('https://www.gstatic.com/aitestkitchen/x.mp4'), true)
    assert.equal(isArchivableFlowUrl(''), false)
  })

  it('scan/blob expressions are non-empty IIFEs', () => {
    assert.match(flowMediaScanExpression(), /querySelectorAll\('video'\)/)
    assert.match(flowBlobExtractExpression(), /btoa/)
  })
})
