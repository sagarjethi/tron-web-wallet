import { describe, expect, it } from 'vitest'
import { defaultPath, deriveKey } from '../derivation'
import { decodeNodeMessage, isTronAddress, recoverSigner, signMessage } from '../tron'

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('message signing', () => {
  const key = deriveKey(ABANDON, defaultPath(0))

  it('signs and recovers the signer', () => {
    const sig = signMessage('hello tron', key.privateKey)
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/)
    expect(recoverSigner('hello tron', sig)).toBe(key.address)
    expect(recoverSigner('hello tron', sig.slice(2))).toBe(key.address)
  })

  it('recovers a different address when the message changes', () => {
    const sig = signMessage('hello tron', key.privateKey)
    expect(recoverSigner('hello tron!', sig)).not.toBe(key.address)
  })

  it('rejects malformed signatures', () => {
    expect(() => recoverSigner('x', '0x1234')).toThrow(/65 bytes/)
  })
})

describe('helpers', () => {
  it('validates base58 addresses only', () => {
    expect(isTronAddress('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH')).toBe(true)
    expect(isTronAddress('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdh')).toBe(false)
    expect(isTronAddress('41a614f803b6fd780986a42c78ec9c7f77e6ded13c')).toBe(false)
  })

  it('decodes hex node messages', () => {
    expect(decodeNodeMessage('636f6e7472616374')).toBe('contract')
    expect(decodeNodeMessage('plain text')).toBe('plain text')
  })
})

describe('contract labels', () => {
  it('names common contract types in plain language', async () => {
    const { contractLabel } = await import('../tron')
    expect(contractLabel('TriggerSmartContract')).toBe('Contract call')
    expect(contractLabel('FreezeBalanceV2Contract')).toBe('Stake TRX')
    expect(contractLabel('SomeFutureThingContract')).toBe('Some Future Thing')
  })
})
