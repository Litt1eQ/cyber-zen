import { describe, expect, it } from 'vitest'
import {
  SPEED_TIER_META,
  effectiveIntervalMs,
  keepRecentKeyTimestamps,
  nextSpeedTier,
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

  it('exports UI metadata for all four speed tiers', () => {
    expect(SPEED_TIER_META).toEqual([
      { tier: 'slow', label: '慢速', color: '#5b8bff', rangeLabel: '> 780ms' },
      { tier: 'medium', label: '中速', color: '#7fff7f', rangeLabel: '440 – 780ms' },
      { tier: 'fast', label: '快速', color: '#ffd97f', rangeLabel: '240 – 440ms' },
      { tier: 'very_fast', label: '极快', color: '#ff7f7f', rangeLabel: '< 240ms' },
    ])
  })

  it('nextSpeedTier maps keyboard cadence to the expected tier without expression indices', () => {
    expect(nextSpeedTier([], 1000)).toEqual({
      tier: 'slow',
      timestamps: [1000],
    })

    expect(nextSpeedTier([1000], 1600)).toEqual({
      tier: 'medium',
      timestamps: [1000, 1600],
    })

    expect(nextSpeedTier([1000], 1300)).toEqual({
      tier: 'fast',
      timestamps: [1000, 1300],
    })

    expect(nextSpeedTier([1000], 1180)).toEqual({
      tier: 'very_fast',
      timestamps: [1000, 1180],
    })
  })
})
