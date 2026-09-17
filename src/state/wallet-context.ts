import { createContext, useContext } from 'react'
import type { Network, NetworkId, TokenPreset } from '../lib/networks'
import type { VaultSecret } from '../lib/vault'

export interface Account {
  id: string
  name: string
  path: string
  address: string
}

export interface WalletApi {
  hasVault: boolean
  unlocked: boolean
  accounts: Account[]
  account: Account | null
  network: Network
  tokens: TokenPreset[]
  customTokens: TokenPreset[]
  autoLockMinutes: number

  createWallet: (mnemonic: string, passphrase: string, password: string) => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => void
  verifyPassword: (password: string) => Promise<VaultSecret>
  resetWallet: () => void

  addAccount: (opts?: { path?: string; name?: string }) => Account
  renameAccount: (id: string, name: string) => void
  removeAccount: (id: string) => void
  selectAccount: (id: string) => void
  nextDefaultPath: () => string
  privateKeyFor: (account: Account) => string

  setNetwork: (id: NetworkId) => void
  addToken: (token: TokenPreset) => void
  removeToken: (contract: string) => void
  setAutoLockMinutes: (m: number) => void
}

export const WalletCtx = createContext<WalletApi | null>(null)

export function useWallet(): WalletApi {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}
