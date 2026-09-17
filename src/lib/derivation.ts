import { HDKey } from '@scure/bip32'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { addressFromPrivateKey } from './address'
import { bytesToHex } from './hex'

/** SLIP-44 coin type registered for TRON. */
export const TRON_COIN_TYPE = 195

/** BIP-44 path used by TronLink and most TRON wallets: m/44'/195'/0'/0/{index}. */
export const defaultPath = (index: number) => `m/44'/${TRON_COIN_TYPE}'/0'/0/${index}`

/** Alternate account-level scheme (Ledger Live style): m/44'/195'/{account}'/0/0. */
export const accountLevelPath = (account: number) => `m/44'/${TRON_COIN_TYPE}'/${account}'/0/0`

const MAX_INDEX = 0x7fffffff
const PATH_RE = /^m\/44'\/195'\/(\d+)'\/(\d+)\/(\d+)$/

export function validatePath(path: string): string | null {
  const m = PATH_RE.exec(path.trim())
  if (!m) return "Use the BIP-44 TRON form m/44'/195'/account'/change/index"
  if (m.slice(1).some((n) => Number(n) > MAX_INDEX)) return 'Each path segment must be below 2^31'
  if (m[2] !== '0' && m[2] !== '1') return 'Change must be 0 (external) or 1 (internal)'
  return null
}

export function createMnemonic(strength: 128 | 256 = 128): string {
  return generateMnemonic(wordlist, strength)
}

export function normalizeMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(' ')
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist)
}

export const mnemonicWordlist = wordlist

export interface DerivedKey {
  path: string
  address: string
  privateKey: string
}

export function deriveKey(mnemonic: string, path: string, passphrase = ''): DerivedKey {
  const error = validatePath(path)
  if (error) throw new Error(error)
  const seed = mnemonicToSeedSync(normalizeMnemonic(mnemonic), passphrase)
  const node = HDKey.fromMasterSeed(seed).derive(path)
  if (!node.privateKey) throw new Error('Derivation produced no private key')
  return { path, address: addressFromPrivateKey(node.privateKey), privateKey: bytesToHex(node.privateKey) }
}
