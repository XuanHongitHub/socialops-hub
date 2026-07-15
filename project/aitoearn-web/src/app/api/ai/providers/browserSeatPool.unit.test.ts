import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { POOL_SEAT_PORTS } from './browserSeatPool'

describe('browserSeatPool', () => {
  it('maps chatgpt-1..4 to ports 9480–9483', () => {
    assert.deepEqual(
      POOL_SEAT_PORTS.map(s => [s.seatId, s.port]),
      [
        ['chatgpt-1', 9480],
        ['chatgpt-2', 9481],
        ['chatgpt-3', 9482],
        ['chatgpt-4', 9483],
      ],
    )
  })
})
