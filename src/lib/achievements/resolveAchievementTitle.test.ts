import { describe, expect, it } from 'vitest'
import { resolveAchievementTitle } from './engine'

const fakeT = (key: string) => key

describe('resolveAchievementTitle', () => {
  it('returns custom name when set', () => {
    expect(resolveAchievementTitle('daily_108', 'a.key', undefined, {}, { daily_108: '我的成就' }, fakeT)).toBe('我的成就')
  })

  it('falls back to t() result when custom name is empty string', () => {
    expect(resolveAchievementTitle('daily_108', 'a.key', undefined, {}, { daily_108: '' }, fakeT)).toBe('a.key')
  })

  it('falls back to t() result when no entry in customNames', () => {
    expect(resolveAchievementTitle('daily_108', 'a.key', undefined, {}, {}, fakeT)).toBe('a.key')
  })

  it('ignores whitespace-only custom names', () => {
    expect(resolveAchievementTitle('daily_108', 'a.key', undefined, {}, { daily_108: '   ' }, fakeT)).toBe('a.key')
  })

  it('passes titleArgs and fmtArgs to t() when falling back', () => {
    const capturedArgs: Record<string, unknown>[] = []
    const spyT = (_key: string, args?: Record<string, unknown>) => {
      if (args) capturedArgs.push(args)
      return 'result'
    }

    resolveAchievementTitle('daily_108', 'a.key', { target: 108 }, { extra: 1 }, {}, spyT)

    expect(capturedArgs[0]).toEqual({ target: 108, extra: 1 })
  })
})
