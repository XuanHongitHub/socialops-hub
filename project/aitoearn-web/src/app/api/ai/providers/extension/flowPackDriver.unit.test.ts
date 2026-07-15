import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seatDownloadRoots } from './flowPackDriver'

describe('flowPackDriver helpers', () => {
  it('maps chatgpt seat + CDP port to SocialsHub download roots', () => {
    const roots = seatDownloadRoots('chatgpt-4', 'http://127.0.0.1:9483')
    assert.ok(roots.some(r => /SocialsHub[\\/]chatgpt-4/i.test(r)))
    assert.ok(roots.some(r => /D:\\Download/i.test(r) || /Download/i.test(r)))
  })

  it('maps port 9480 → chatgpt-1 even without seat id', () => {
    const roots = seatDownloadRoots(undefined, 'http://127.0.0.1:9480')
    assert.ok(roots.some(r => /chatgpt-1/i.test(r)))
  })
})
