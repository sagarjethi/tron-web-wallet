import { describe, expect, it } from 'vitest'
import { NETWORKS } from '../networks'
import { classifyTrust, sanitizeLabel, sortHoldings, type Holding } from '../portfolio'

const nile = NETWORKS.nile
const USDT = nile.tokens[0].contract
const none = new Set<string>()

describe('classifyTrust', () => {
  it('marks presets verified and added tokens custom', () => {
    expect(classifyTrust('trc20', USDT, 'USDT', nile, none)).toBe('verified')
    expect(classifyTrust('trc20', 'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', 'JST', nile, new Set(['TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3']))).toBe('custom')
    expect(classifyTrust('trc20', 'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', 'JST', nile, none)).toBe('unverified')
  })

  it('flags tokens that imitate a verified symbol or TRX', () => {
    const boldUsdt = String.fromCodePoint(0x1d5e8, 0x1d5e6, 0x1d5d7, 0x1d5e7)
    expect(classifyTrust('trc20', 'TWkKQo8KidCEGXsH752bgmvuBa6b64Vo1Q', boldUsdt, nile, none)).toBe('lookalike')
    expect(classifyTrust('trc20', 'TWkKQo8KidCEGXsH752bgmvuBa6b64Vo1Q', 'usdt', nile, none)).toBe('lookalike')
    expect(classifyTrust('trc20', 'TWkKQo8KidCEGXsH752bgmvuBa6b64Vo1Q', 'U.S.D.T', nile, none)).toBe('lookalike')
    expect(classifyTrust('trc10', '1000001', 'TRX', nile, none)).toBe('lookalike')
  })
})

describe('sanitizeLabel', () => {
  it('removes invisible and direction override characters and caps length', () => {
    const rlo = String.fromCharCode(0x202e)
    const zwsp = String.fromCharCode(0x200b)
    const nul = String.fromCharCode(0)
    expect(sanitizeLabel(`US${zwsp}DT${rlo}${nul}`, 16)).toBe('USDT')
    expect(sanitizeLabel('x'.repeat(100), 16)).toHaveLength(16)
  })
})

describe('sortHoldings', () => {
  const h = (id: string, symbol: string, trust: Holding['trust']): Holding => ({ kind: 'trc20', id, symbol, name: '', decimals: 6, balance: 1n, trust })
  it('orders verified, custom, unverified, then look-alikes', () => {
    const sorted = sortHoldings([h('a', 'ZZZ', 'unverified'), h('b', 'USDT', 'lookalike'), h(USDT, 'USDT', 'verified'), h('c', 'AAA', 'custom'), h('d', 'BBB', 'unverified')], nile)
    expect(sorted.map((x) => x.id)).toEqual([USDT, 'c', 'd', 'a', 'b'])
  })
})
