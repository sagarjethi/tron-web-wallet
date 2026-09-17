import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { defaultPath, deriveKey, normalizeMnemonic, validatePath } from '../lib/derivation'
import { NETWORKS, type NetworkId, type TokenPreset } from '../lib/networks'
import { decryptVault, encryptVault, type VaultBlob, type VaultSecret } from '../lib/vault'
import { WalletCtx, type Account, type WalletApi } from './wallet-context'

interface Persisted {
  version: 1
  vault: VaultBlob | null
  accounts: Account[]
  selectedId: string | null
  networkId: NetworkId
  customTokens: Record<NetworkId, TokenPreset[]>
  autoLockMinutes: number
}

const STORAGE_KEY = 'tron-wallet.v1'

const emptyState = (): Persisted => ({
  version: 1,
  vault: null,
  accounts: [],
  selectedId: null,
  networkId: 'shasta',
  customTokens: { shasta: [], nile: [], mainnet: [] },
  autoLockMinutes: 15,
})

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const { apiKey: _legacyApiKey, ...parsed } = JSON.parse(raw) as Partial<Persisted> & { apiKey?: string }
    return { ...emptyState(), ...parsed, customTokens: { ...emptyState().customTokens, ...parsed.customTokens } }
  } catch {
    return emptyState()
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: the in-memory session keeps working.
  }
}

const newId = () => crypto.randomUUID()

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load)
  const [secret, setSecret] = useState<VaultSecret | null>(null)

  useEffect(() => save(state), [state])

  // Another tab locking or resetting the wallet should be reflected here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const next = load()
      setState(next)
      if (!next.vault) setSecret(null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const lock = useCallback(() => setSecret(null), [])

  // Auto-lock after inactivity.
  useEffect(() => {
    if (!secret || state.autoLockMinutes <= 0) return
    let timer = setTimeout(lock, state.autoLockMinutes * 60_000)
    const bump = () => {
      clearTimeout(timer)
      timer = setTimeout(lock, state.autoLockMinutes * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [secret, state.autoLockMinutes, lock])

  const createWallet = useCallback(async (mnemonic: string, passphrase: string, password: string) => {
    const s: VaultSecret = { mnemonic: normalizeMnemonic(mnemonic), passphrase }
    const vault = await encryptVault(s, password)
    const path = defaultPath(0)
    const first: Account = { id: newId(), name: 'Account 1', path, address: deriveKey(s.mnemonic, path, s.passphrase).address }
    setState((prev) => ({ ...prev, vault, accounts: [first], selectedId: first.id }))
    setSecret(s)
  }, [])

  const verifyPassword = useCallback(
    async (password: string) => {
      if (!state.vault) throw new Error('No wallet on this device')
      return decryptVault(state.vault, password)
    },
    [state.vault],
  )

  const unlock = useCallback(
    async (password: string) => {
      const s = await verifyPassword(password)
      // Re-derive stored addresses so tampered storage can never redirect funds to a foreign address.
      setState((prev) => ({ ...prev, accounts: prev.accounts.map((a) => ({ ...a, address: deriveKey(s.mnemonic, a.path, s.passphrase).address })) }))
      setSecret(s)
    },
    [verifyPassword],
  )

  const resetWallet = useCallback(() => {
    setSecret(null)
    setState((prev) => ({ ...emptyState(), networkId: prev.networkId, customTokens: prev.customTokens }))
  }, [])

  const nextDefaultPath = useCallback(() => {
    const used = new Set(state.accounts.map((a) => a.path))
    let i = 0
    while (used.has(defaultPath(i))) i++
    return defaultPath(i)
  }, [state.accounts])

  const addAccount = useCallback(
    (opts: { path?: string; name?: string } = {}) => {
      const s = secret
      if (!s) throw new Error('Unlock the wallet first')
      const path = opts.path?.trim() || nextDefaultPath()
      const err = validatePath(path)
      if (err) throw new Error(err)
      const existing = state.accounts.find((a) => a.path === path)
      if (existing) throw new Error(`${existing.name} already uses this path`)
      const account: Account = {
        id: newId(),
        name: opts.name?.trim() || `Account ${state.accounts.length + 1}`,
        path,
        address: deriveKey(s.mnemonic, path, s.passphrase).address,
      }
      setState((prev) => ({ ...prev, accounts: [...prev.accounts, account], selectedId: account.id }))
      return account
    },
    [secret, state.accounts, nextDefaultPath],
  )

  const renameAccount = useCallback((id: string, name: string) => {
    setState((prev) => ({ ...prev, accounts: prev.accounts.map((a) => (a.id === id ? { ...a, name: name.trim() || a.name } : a)) }))
  }, [])

  const removeAccount = useCallback((id: string) => {
    setState((prev) => {
      if (prev.accounts.length <= 1) return prev
      const accounts = prev.accounts.filter((a) => a.id !== id)
      return { ...prev, accounts, selectedId: prev.selectedId === id ? accounts[0].id : prev.selectedId }
    })
  }, [])

  const selectAccount = useCallback((id: string) => setState((prev) => ({ ...prev, selectedId: id })), [])

  const privateKeyFor = useCallback(
    (account: Account) => {
      const s = secret
      if (!s) throw new Error('The wallet locked. Unlock it and try again.')
      const key = deriveKey(s.mnemonic, account.path, s.passphrase)
      if (key.address !== account.address) throw new Error('Account address does not match its derivation path')
      return key.privateKey
    },
    [secret],
  )

  const setNetwork = useCallback((networkId: NetworkId) => setState((prev) => ({ ...prev, networkId })), [])

  const addToken = useCallback((token: TokenPreset) => {
    setState((prev) => {
      const list = prev.customTokens[prev.networkId]
      if (list.some((t) => t.contract === token.contract) || NETWORKS[prev.networkId].tokens.some((t) => t.contract === token.contract)) return prev
      return { ...prev, customTokens: { ...prev.customTokens, [prev.networkId]: [...list, token] } }
    })
  }, [])

  const removeToken = useCallback((contract: string) => {
    setState((prev) => ({ ...prev, customTokens: { ...prev.customTokens, [prev.networkId]: prev.customTokens[prev.networkId].filter((t) => t.contract !== contract) } }))
  }, [])

  const setAutoLockMinutes = useCallback((autoLockMinutes: number) => setState((prev) => ({ ...prev, autoLockMinutes })), [])

  const api = useMemo<WalletApi>(() => {
    const network = NETWORKS[state.networkId]
    const customTokens = state.customTokens[state.networkId]
    return {
      hasVault: Boolean(state.vault),
      unlocked: Boolean(secret),
      accounts: state.accounts,
      account: state.accounts.find((a) => a.id === state.selectedId) ?? state.accounts[0] ?? null,
      network,
      tokens: [...network.tokens, ...customTokens],
      customTokens,
      autoLockMinutes: state.autoLockMinutes,
      createWallet,
      unlock,
      lock,
      verifyPassword,
      resetWallet,
      addAccount,
      renameAccount,
      removeAccount,
      selectAccount,
      nextDefaultPath,
      privateKeyFor,
      setNetwork,
      addToken,
      removeToken,
      setAutoLockMinutes,
    }
  }, [state, secret, createWallet, unlock, lock, verifyPassword, resetWallet, addAccount, renameAccount, removeAccount, selectAccount, nextDefaultPath, privateKeyFor, setNetwork, addToken, removeToken, setAutoLockMinutes])

  return <WalletCtx.Provider value={api}>{children}</WalletCtx.Provider>
}
