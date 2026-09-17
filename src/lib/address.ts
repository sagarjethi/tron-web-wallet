import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { createBase58check } from '@scure/base'

/**
 * TRON address derivation without TronWeb, so onboarding can run before the heavy SDK loads.
 * address = base58check(0x41 || last20(keccak256(uncompressedPubKey[1:])))
 */

const base58check = createBase58check(sha256)
export const TRON_ADDRESS_PREFIX = 0x41

export function addressFromPrivateKey(privateKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privateKey, false).subarray(1)
  const hash = keccak_256(pub)
  const payload = new Uint8Array(21)
  payload[0] = TRON_ADDRESS_PREFIX
  payload.set(hash.subarray(12), 1)
  return base58check.encode(payload)
}

/** Structural check: base58check-valid, 21 bytes, TRON prefix. */
export function isTronAddress(value: string): boolean {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return false
  try {
    const bytes = base58check.decode(value)
    return bytes.length === 21 && bytes[0] === TRON_ADDRESS_PREFIX
  } catch {
    return false
  }
}
