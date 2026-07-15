import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FLOW_VEO_DEFAULTS } from './flowVeoDefaults'
import {
  buildPackStoragePatches,
  mapImageQualityToPack,
  mapVideoQualityToPack,
} from './extensionSettingsPush'

describe('extensionSettingsPush', () => {
  it('maps Hub qualities to pack storage enums', () => {
    assert.equal(mapVideoQualityToPack('1080p'), '1080')
    assert.equal(mapVideoQualityToPack('720p'), '720')
    assert.equal(mapVideoQualityToPack('4K'), '4k')
    assert.equal(mapImageQualityToPack('2K'), '2k')
    assert.equal(mapImageQualityToPack('1K'), '1k')
  })

  it('forces outputCount=1 for Flow and sibling packs', () => {
    const patches = buildPackStoragePatches({
      flowVeo: { ...FLOW_VEO_DEFAULTS, outputCount: 1, aspectRatio: '9:16', defaultVideoOption: '10s' },
    })
    assert.equal(patches['flow-automation'].outputCount, 1)
    assert.equal(patches['flow-automation'].aspectRatio, '9:16')
    assert.equal(patches['flow-automation'].defaultVideoOption, '10s')
    assert.equal(patches['flow-automation'].autoDownloadVideoQuality, '1080')
    assert.equal(patches['flow-automation'].promptDelaySecondsMin, 20)
    assert.equal(patches['flow-automation'].promptDelaySecondsMax, 30)
    assert.equal(patches['flow-automation'].concurrentPrompts, 1)
    assert.equal(patches['chatgpt-automation'].outputCount, 1)
    assert.equal(patches['gemini-automation'].outputCount, 1)
    assert.equal(patches['gemini-automation'].imageOutputCount, 1)
    assert.equal(patches['grok-automation'].outputCount, 1)
    assert.equal(patches['grok-automation'].imageOutputCount, 1)
  })
})
