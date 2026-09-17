import { describe, expect, it } from 'vitest'
import { formatAmount, fromBaseUnits, shortAddress, toBaseUnits } from '../units'

describe('units', () => {
  it('parses decimal strings exactly', () => {
    expect(toBaseUnits('1', 6)).toBe(1_000_000n)
    expect(toBaseUnits('0.000001', 6)).toBe(1n)
    expect(toBaseUnits('.5', 6)).toBe(500_000n)
    expect(toBaseUnits('123456789.123456789123456789', 18)).toBe(123456789123456789123456789n)
  })

  it('rejects invalid input and excess precision', () => {
    expect(() => toBaseUnits('', 6)).toThrow()
    expect(() => toBaseUnits('1e5', 6)).toThrow()
    expect(() => toBaseUnits('-1', 6)).toThrow()
    expect(() => toBaseUnits('0.0000001', 6)).toThrow(/6 decimal/)
  })

  it('round-trips base units', () => {
    for (const v of [0n, 1n, 999_999n, 1_000_000n, 123_456_789_012_345n]) expect(toBaseUnits(fromBaseUnits(v, 6), 6)).toBe(v)
    expect(fromBaseUnits(1_500_000n, 6)).toBe('1.5')
    expect(fromBaseUnits(7n, 0)).toBe('7')
  })

  it('formats with grouping and truncates without rounding up', () => {
    expect(formatAmount(1_234_567_899_999n, 6, 2)).toBe('1,234,567.89')
    expect(formatAmount(10n ** 18n, 18)).toBe('1')
  })

  it('shortens addresses', () => {
    expect(shortAddress('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH')).toBe('TUEZSd…WYdH')
  })
})

describe('formatBalance', () => {
  it('never renders a non-zero balance as zero', async () => {
    const { formatBalance } = await import('../units')
    expect(formatBalance(1n, 18)).toBe('<0.000001')
    expect(formatBalance(2717908992n, 18)).toBe('<0.000001')
    expect(formatBalance(1n, 2)).toBe('0.01')
    expect(formatBalance(0n, 18)).toBe('0')
    expect(formatBalance(30000230000000002717908992n, 18)).toBe('30,000,230')
    expect(formatBalance(19589654444n, 6)).toBe('19,589.654444')
  })
})
