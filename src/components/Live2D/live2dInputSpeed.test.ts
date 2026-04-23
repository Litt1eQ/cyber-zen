import { describe, expect, it } from 'vitest'
import {
  effectiveIntervalMs,
  keepRecentKeyTimestamps,
  nextSpeedTierState,
} from './live2dInputSpeed.ts'

describe('live2dInputSpeed', () => {
  it('effectiveIntervalMs returns Infinity with fewer than two samples', () => {
    expect(effectiveIntervalMs([])).toBe(Number.POSITIVE_INFINITY)
    expect(effectiveIntervalMs([1200])).toBe(Number.POSITIVE_INFINITY)
  })

  it('effectiveIntervalMs lets the latest burst pull the speed tier upward', () => {
    const timestamps = [0, 700, 1400, 1600]
    expect(Math.abs(effectiveIntervalMs(timestamps) - 220)).toBeLessThan(1e-9)
  })

  it('keepRecentKeyTimestamps trims samples by time window and max count', () => {
    const timestamps = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400]
    expect(keepRecentKeyTimestamps(timestamps, 2400)).toEqual([200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400])
  })

  it('nextSpeedTierState maps keyboard cadence to the expected expression index', () => {
    expect(nextSpeedTierState([], 1000)).toEqual({
      expressionIndex: 0,
      tier: 'slow',
      timestamps: [1000],
    })

    expect(nextSpeedTierState([1000], 1600)).toEqual({
      expressionIndex: 1,
      tier: 'medium',
      timestamps: [1000, 1600],
    })

    expect(nextSpeedTierState([1000], 1300)).toEqual({
      expressionIndex: 2,
      tier: 'fast',
      timestamps: [1000, 1300],
    })

    expect(nextSpeedTierState([1000], 1180)).toEqual({
      expressionIndex: 3,
      tier: 'very_fast',
      timestamps: [1000, 1180],
    })
  })
})
