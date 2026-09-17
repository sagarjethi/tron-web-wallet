import { mnemonicToSeedSync } from '@scure/bip39'
import { TronWeb } from 'tronweb'
import { describe, expect, it } from 'vitest'
import { accountLevelPath, createMnemonic, defaultPath, deriveKey, isValidMnemonic, validatePath } from '../derivation'

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('BIP-44 TRON derivation', () => {
  it('matches the widely published vector for the test phrase', () => {
    expect(deriveKey(ABANDON, defaultPath(0)).address).toBe('TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH')
    expect(deriveKey(ABANDON, defaultPath(1)).address).toBe('TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK')
    expect(deriveKey(ABANDON, accountLevelPath(1)).address).toBe('TLrpNTBuCpGMrB9TyVwgEhNVRhtWEQPHh4')
  })

  it("agrees with TronWeb's own ethers-based derivation", () => {
    const phrase = createMnemonic()
    for (const path of [defaultPath(0), defaultPath(7), accountLevelPath(3), "m/44'/195'/2'/1/5"]) {
      const ours = deriveKey(phrase, path)
      const theirs = TronWeb.fromMnemonic(phrase, path)
      expect(ours.address).toBe(theirs.address)
      expect('0x' + ours.privateKey).toBe(theirs.privateKey)
    }
  })

  it('applies the optional BIP-39 passphrase', () => {
    expect(deriveKey(ABANDON, defaultPath(0), 'extra').address).not.toBe(deriveKey(ABANDON, defaultPath(0)).address)
    expect(mnemonicToSeedSync(ABANDON, 'extra')).not.toEqual(mnemonicToSeedSync(ABANDON))
  })

  it('validates mnemonics, tolerating spacing and case', () => {
    expect(isValidMnemonic(`  ${ABANDON.toUpperCase()}  `)).toBe(true)
    expect(isValidMnemonic(ABANDON.replace('about', 'abandon'))).toBe(false)
    expect(createMnemonic(256).split(' ')).toHaveLength(24)
  })

  it('validates paths', () => {
    expect(validatePath(defaultPath(0))).toBeNull()
    expect(validatePath("m/44'/60'/0'/0/0")).toMatch(/TRON/)
    expect(validatePath("m/44'/195'/0'/2/0")).toMatch(/Change/)
    expect(validatePath("m/44'/195'/2147483648'/0/0")).toMatch(/2\^31/)
    expect(() => deriveKey(ABANDON, "m/44'/195'/0/0/0")).toThrow()
  })
})

describe('address encoding', () => {
  it('matches TronWeb for random keys', async () => {
    const { addressFromPrivateKey, isTronAddress } = await import('../address')
    const { hexToBytes } = await import('../hex')
    for (let i = 0; i < 25; i++) {
      const pk = crypto.getRandomValues(new Uint8Array(32))
      const hex = Array.from(pk, (b) => b.toString(16).padStart(2, '0')).join('')
      const ours = addressFromPrivateKey(hexToBytes(hex))
      expect(ours).toBe(TronWeb.address.fromPrivateKey(hex))
      expect(isTronAddress(ours)).toBe(TronWeb.isAddress(ours))
    }
  })
})
