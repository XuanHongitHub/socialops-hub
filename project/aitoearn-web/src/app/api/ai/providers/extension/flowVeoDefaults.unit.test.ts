import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FLOW_VEO_DEFAULTS,
  clampFlowDurationSeconds,
  flowSettingsForBridgeJob,
  mergeFlowVeoDefaults,
  secondsToFlowVideoOption,
  videoOptionToSeconds,
} from './flowVeoDefaults'

describe('flowVeoDefaults (VEO Automation v3.2.x)', () => {
  it('maps video options to 6 or 10 seconds only', () => {
    assert.equal(videoOptionToSeconds('6s'), 6)
    assert.equal(videoOptionToSeconds('10s'), 10)
    assert.equal(videoOptionToSeconds('6sConcat'), 6)
    assert.equal(videoOptionToSeconds('10sConcat'), 10)
  })

  it('clamps 15s SEO duration to Flow 10s', () => {
    assert.equal(clampFlowDurationSeconds(15), 10)
    assert.equal(clampFlowDurationSeconds(8), 10)
    assert.equal(clampFlowDurationSeconds(6), 6)
    assert.equal(clampFlowDurationSeconds(5), 6)
    assert.equal(secondsToFlowVideoOption(15), '10s')
  })

  it('merges pack settings like extension Settings UI', () => {
    const m = mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, {
      defaultMode: 'imageToVideo',
      defaultVideoOption: '6s',
      maxRetries: 5,
      autoDownloadQualityVideo: '1080p',
      aspectRatio: '9:16',
    })
    assert.equal(m.defaultMode, 'imageToVideo')
    assert.equal(m.defaultVideoOption, '6s')
    assert.equal(m.maxRetries, 5)
    assert.equal(m.packVersion, '3.2.1')
  })

  it('product defaults match Settings panel baseline', () => {
    assert.equal(FLOW_VEO_DEFAULTS.defaultMode, 'textToVideo')
    assert.equal(FLOW_VEO_DEFAULTS.aspectRatio, '9:16')
    assert.equal(FLOW_VEO_DEFAULTS.defaultVideoOption, '10s')
    assert.equal(FLOW_VEO_DEFAULTS.defaultImageModeOption, 'createNew')
    assert.equal(FLOW_VEO_DEFAULTS.maxRetries, 5)
    assert.equal(FLOW_VEO_DEFAULTS.autoDownloadQualityVideo, '1080p')
    assert.equal(FLOW_VEO_DEFAULTS.autoDownloadQualityImage, '1K')
    assert.equal(FLOW_VEO_DEFAULTS.language, 'vi')
    assert.equal(FLOW_VEO_DEFAULTS.outputCount, 1)
    assert.equal(FLOW_VEO_DEFAULTS.concurrentPrompts, 1)
    assert.equal(FLOW_VEO_DEFAULTS.model, 'Veo 3.1 - Lite')
  })

  it('clamps concurrentPrompts to 1–6', () => {
    assert.equal(mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, { concurrentPrompts: 3 }).concurrentPrompts, 3)
    assert.equal(mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, { concurrentPrompts: 99 }).concurrentPrompts, 6)
    assert.equal(mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, { concurrentPrompts: 0 }).concurrentPrompts, 1)
  })

  it('embeds flowVeo block for bridge jobs without inventing 15s', () => {
    const job = flowSettingsForBridgeJob(FLOW_VEO_DEFAULTS, { duration: 15, aspectRatio: '9:16' })
    assert.equal(job.duration, 10)
    assert.equal(job.defaultVideoOption, '10s')
    assert.equal(job.aspectRatio, '9:16')
    assert.equal(job.maxRetries, 5)
    assert.equal(job.outputCount, 1)
    assert.equal(job.pack, 'flow-automation')
  })

  it('defaults outputCount to 1 (not pack stock 2)', () => {
    assert.equal(FLOW_VEO_DEFAULTS.outputCount, 1)
    const m = mergeFlowVeoDefaults(FLOW_VEO_DEFAULTS, { outputCount: 2 })
    assert.equal(m.outputCount, 2)
  })
})

