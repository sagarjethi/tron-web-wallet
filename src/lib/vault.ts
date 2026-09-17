import { bytesToHex, hexToBytes } from './hex'

/**
 * Password-encrypted seed storage.
 * PBKDF2-SHA256 (600k iterations, OWASP 2023 guidance) derives an AES-256-GCM key.
 * Only ciphertext ever touches storage; the plaintext phrase lives in memory while unlocked.
 */

export const PBKDF2_ITERATIONS = 600_000

export interface VaultBlob {
  version: 1
  kdf: 'pbkdf2-sha256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

export interface VaultSecret {
  mnemonic: string
  passphrase: string
}

async function deriveAesKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptVault(secret: VaultSecret, password: string, iterations = PBKDF2_ITERATIONS): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt, iterations)
  const plaintext = new TextEncoder().encode(JSON.stringify(secret))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  return { version: 1, kdf: 'pbkdf2-sha256', iterations, salt: bytesToHex(salt), iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) }
}

export class WrongPasswordError extends Error {
  constructor() {
    super('That password does not unlock this wallet')
  }
}

export async function decryptVault(blob: VaultBlob, password: string): Promise<VaultSecret> {
  const key = await deriveAesKey(password, hexToBytes(blob.salt), blob.iterations)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(blob.iv) }, key, hexToBytes(blob.ciphertext))
  } catch {
    throw new WrongPasswordError()
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as VaultSecret
}
