import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SOCIAL_OPS_CARD_CLASS,
  SOCIAL_OPS_EMPTY_WRAP_CLASS,
  SOCIAL_OPS_PILL_CLASS,
  SOCIAL_OPS_PRODUCT_CHIP_CLASS,
  SOCIAL_OPS_PRODUCT_THUMB_CLASS,
} from './socialOpsShell.ts'

describe('socialOpsShell tokens', () => {
  it('exports stable pill + chip classes for Generate/Photo parity', () => {
    assert.match(SOCIAL_OPS_PILL_CLASS, /rounded-full/)
    assert.match(SOCIAL_OPS_PILL_CLASS, /px-3/)
    assert.match(SOCIAL_OPS_CARD_CLASS, /rounded-2xl/)
    assert.match(SOCIAL_OPS_PRODUCT_CHIP_CLASS, /bg-background\/80/)
    assert.match(SOCIAL_OPS_PRODUCT_THUMB_CLASS, /h-12 w-12/)
    assert.match(SOCIAL_OPS_EMPTY_WRAP_CLASS, /py-14/)
  })
})
