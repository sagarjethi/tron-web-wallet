import { describe, expect, it } from 'vitest'
import { decryptVault, encryptVault, WrongPasswordError } from '../vault'

describe('vault', () => {
  const secret = { mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', passphrase: '' }

  it('round-trips with the right password and hides the plaintext', async () => {
    const blob = await encryptVault(secret, 'correct horse', 1000)
    expect(JSON.stringify(blob)).not.toContain('abandon')
    expect(await decryptVault(blob, 'correct horse')).toEqual(secret)
  })

  it('rejects the wrong password', async () => {
    const blob = await encryptVault(secret, 'correct horse', 1000)
    await expect(decryptVault(blob, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('uses fresh salt and iv each time', async () => {
    const a = await encryptVault(secret, 'pw', 1000)
    const b = await encryptVault(secret, 'pw', 1000)
    expect(a.salt).not.toBe(b.salt)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })
})
