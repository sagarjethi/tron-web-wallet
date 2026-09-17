import type { TronWeb } from 'tronweb'
import type { Network, TokenPreset } from './networks'
import { shortAddress } from './units'
import { apiBase, decodeNodeMessage, getTokenMetadata, getTrc20Balance, isTransientError, NotATokenError, tronGridFetch, withRetry } from './tron'

/**
 * Everything an address holds on one network: TRX, every TRC20 token and every TRC10 token.
 *
 * Discovery uses TronGrid's account index (`/v1/accounts/{address}`), which lists every token
 * contract the address has touched. Each TRC20 balance is then read from the token contract
 * itself (`balanceOf`), so the number shown is the chain's, not the indexer's.
 * TRC10 balances come from the full node account record.
 */

export type HoldingKind = 'trc20' | 'trc10'

/**
 * verified   listed in this wallet's network presets
 * custom     added by the person
 * unverified discovered on chain; anyone can create a token
 * lookalike  unverified, and its symbol imitates a verified token or TRX
 */
export type Trust = 'verified' | 'custom' | 'unverified' | 'lookalike'

export interface Holding {
  kind: HoldingKind
  /** TRC20 contract address, or TRC10 token id. */
  id: string
  symbol: string
  name: string
  decimals: number
  balance: bigint | null
  trust: Trust
  error?: string
}

export interface Portfolio {
  trx: bigint
  activated: boolean
  holdings: Holding[]
  /** Discovered tokens not shown because the address holds more than MAX_DISCOVERED. */
  omitted: number
  /** False for the early partial result and for refreshes that skip discovery. */
  complete: boolean
}

/** Upper bound on discovered TRC20 plus TRC10 tokens read per scan; spam airdrops can list hundreds. */
export const MAX_DISCOVERED = 40
const CONCURRENCY = 6

export const holdingToToken = (h: Holding): TokenPreset => ({ contract: h.id, symbol: h.symbol, name: h.name, decimals: h.decimals })

/** TRC10 sends are not supported yet, and look-alike tokens are never sent from this wallet. */
export function canSend(h: Holding): boolean {
  return h.kind === 'trc20' && h.trust !== 'lookalike' && h.balance !== null && h.balance > 0n
}

// ------------------------------------------------------------------ labels

/** Control, zero-width and bidirectional override code points, used to disguise token names. */
const INVISIBLE_RANGES: [number, number][] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
]

const isInvisible = (codePoint: number) => INVISIBLE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to)

/** Removes invisible and direction-changing characters from on-chain labels, and caps their length. */
export function sanitizeLabel(value: string, max: number): string {
  return Array.from(value)
    .filter((ch) => !isInvisible(ch.codePointAt(0) ?? 0))
    .join('')
    .trim()
    .slice(0, max)
}

const skeleton = (symbol: string) => symbol.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function classifyTrust(kind: HoldingKind, id: string, symbol: string, network: Network, customContracts: Set<string>): Trust {
  if (kind === 'trc20' && network.tokens.some((t) => t.contract === id)) return 'verified'
  if (kind === 'trc20' && customContracts.has(id)) return 'custom'
  const s = skeleton(symbol)
  if (s === 'TRX' || network.tokens.some((t) => skeleton(t.symbol) === s)) return 'lookalike'
  return 'unverified'
}

const TRUST_ORDER: Record<Trust, number> = { verified: 0, custom: 1, unverified: 2, lookalike: 3 }

export function sortHoldings(holdings: Holding[], network: Network): Holding[] {
  const presetIndex = (h: Holding) => {
    const i = network.tokens.findIndex((t) => t.contract === h.id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...holdings].sort(
    (a, b) => TRUST_ORDER[a.trust] - TRUST_ORDER[b.trust] || presetIndex(a) - presetIndex(b) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id),
  )
}

// ------------------------------------------------------------------ metadata cache

interface Meta {
  symbol: string
  name: string
  decimals: number
}

const META_STORAGE_KEY = 'tron-wallet.token-meta.v1'
const memoryMeta = new Map<string, Meta>()

function readStoredMeta(): Record<string, Meta> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(META_STORAGE_KEY) ?? '{}') as Record<string, Meta>
  } catch {
    return {}
  }
}

function storeMeta(key: string, meta: Meta) {
  memoryMeta.set(key, meta)
  try {
    const all = readStoredMeta()
    all[key] = meta
    globalThis.localStorage?.setItem(META_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage unavailable: the in-memory cache still works for this session.
  }
}

function cachedMeta(key: string): Meta | undefined {
  const hit = memoryMeta.get(key) ?? readStoredMeta()[key]
  if (hit && typeof hit.decimals === 'number') memoryMeta.set(key, hit)
  return hit
}

async function trc20Meta(tw: TronWeb, network: Network, contract: string, known: TokenPreset[]): Promise<Meta> {
  const preset = known.find((t) => t.contract === contract)
  if (preset) return preset
  const key = `${network.id}:trc20:${contract}`
  const hit = cachedMeta(key)
  if (hit) return hit
  // name() is skipped for discovered tokens: the symbol is enough, and it saves a call per token.
  const meta = await withRetry(() => getTokenMetadata(tw, contract, { withName: false }))
  const clean = { symbol: sanitizeLabel(meta.symbol, 16) || '?', name: sanitizeLabel(meta.name, 48), decimals: meta.decimals }
  if (!Number.isInteger(clean.decimals) || clean.decimals < 0 || clean.decimals > 77) throw new Error('Token reports invalid decimals')
  storeMeta(key, clean)
  return clean
}

interface AssetIssue {
  name?: string
  abbr?: string
  precision?: number
}

async function trc10Meta(tw: TronWeb, network: Network, id: string): Promise<Meta> {
  const key = `${network.id}:trc10:${id}`
  const hit = cachedMeta(key)
  if (hit) return hit
  const issue = (await withRetry(() => tw.fullNode.request('wallet/getassetissuebyid', { value: id }, 'post'))) as AssetIssue
  if (!issue?.name) throw new Error('Unknown TRC10 token')
  const name = sanitizeLabel(decodeNodeMessage(issue.name), 48)
  const meta = { symbol: sanitizeLabel(decodeNodeMessage(issue.abbr) || name, 16) || id, name, decimals: issue.precision ?? 0 }
  storeMeta(key, meta)
  return meta
}

// ------------------------------------------------------------------ discovery

interface IndexedAccount {
  trc20?: Record<string, string>[]
}

async function fetchIndexedAccount(network: Network, address: string): Promise<IndexedAccount | null> {
  const res = await tronGridFetch(`${apiBase(network)}/v1/accounts/${address}`)
  if (!res.ok) throw new Error(`TronGrid request failed with status code ${res.status}`)
  const body = (await res.json()) as { data?: IndexedAccount[] }
  return body.data?.[0] ?? null
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

export interface PortfolioOptions {
  customTokens?: TokenPreset[]
  /**
   * Find and read every other token the address holds. When false, only TRX, TRC10 balances,
   * verified and custom tokens are read; callers keep their previously discovered holdings.
   */
  discover?: boolean
  /** Called once TRX and verified/custom balances are known, before discovery finishes. */
  onProgress?: (partial: Portfolio) => void
}

export async function getPortfolio(tw: TronWeb, network: Network, address: string, opts: PortfolioOptions = {}): Promise<Portfolio> {
  const { customTokens = [], discover = true, onProgress } = opts
  const known = [...network.tokens, ...customTokens]
  const customContracts = new Set(customTokens.map((t) => t.contract))

  // Phase 1: the account itself and the tokens this wallet vouches for.
  const indexedPromise = discover ? withRetry(() => fetchIndexedAccount(network, address)).catch(() => null) : Promise.resolve(null)
  const account = (await withRetry(() => tw.trx.getUnconfirmedAccount(address))) as { address?: string; balance?: number; assetV2?: { key: string; value: number }[] }
  const trx = BigInt(account.balance ?? 0)
  const activated = Boolean(account.address)

  const knownHoldings = (await mapLimit(known, CONCURRENCY, (t) => readTrc20(tw, network, address, t.contract, known, customContracts, true))).filter(isHolding)
  const partial: Portfolio = { trx, activated, holdings: sortHoldings(knownHoldings, network), omitted: 0, complete: !discover }
  if (!discover) return partial
  onProgress?.(partial)

  // Phase 2: everything else the address holds, capped so spam airdrops cannot stall the page.
  const indexed = await indexedPromise
  const discoveredTrc20: string[] = []
  for (const entry of indexed?.trc20 ?? []) {
    for (const [contract, value] of Object.entries(entry)) {
      if (value !== '0' && !known.some((t) => t.contract === contract) && !discoveredTrc20.includes(contract)) discoveredTrc20.push(contract)
    }
  }
  const trc10Entries = (account.assetV2 ?? []).filter((a) => a.value > 0)
  const trc20Slots = Math.min(discoveredTrc20.length, MAX_DISCOVERED)
  const trc10Slots = Math.min(trc10Entries.length, MAX_DISCOVERED - trc20Slots)
  const omitted = discoveredTrc20.length - trc20Slots + (trc10Entries.length - trc10Slots)

  const [trc20, trc10] = await Promise.all([
    mapLimit(discoveredTrc20.slice(0, trc20Slots), CONCURRENCY, (contract) => readTrc20(tw, network, address, contract, known, customContracts, false)),
    mapLimit(trc10Entries.slice(0, trc10Slots), CONCURRENCY, ({ key, value }) => readTrc10(tw, network, key, BigInt(value), customContracts)),
  ])

  return {
    trx,
    activated,
    holdings: sortHoldings([...knownHoldings, ...trc20.filter(isHolding), ...trc10], network),
    omitted,
    complete: true,
  }
}

const isHolding = (h: Holding | null): h is Holding => h !== null

async function readTrc20(tw: TronWeb, network: Network, address: string, contract: string, known: TokenPreset[], customContracts: Set<string>, alwaysShown: boolean): Promise<Holding | null> {
  let meta: Meta
  try {
    meta = await trc20Meta(tw, network, contract, known)
  } catch (e) {
    // A contract that is definitively not a TRC20 token is not a holding. Any other failure keeps the
    // token listed without a balance (decimals are unknown), so nothing the address owns silently vanishes.
    if (e instanceof NotATokenError && !alwaysShown) return null
    return {
      kind: 'trc20',
      id: contract,
      symbol: shortAddress(contract, 4, 4),
      name: '',
      decimals: 0,
      balance: null,
      trust: customContracts.has(contract) ? 'custom' : 'unverified',
      error: e instanceof NotATokenError ? e.message : 'Could not load this token. Refresh to try again.',
    }
  }

  // Displayed balances always come from the contract. If it cannot be read, the row shows
  // "Unavailable" rather than the indexer's number, which may lag behind the chain.
  let balance: bigint | null
  let error: string | undefined
  try {
    balance = await withRetry(() => getTrc20Balance(tw, contract, address))
  } catch (e) {
    balance = null
    error = isTransientError(e) ? 'Could not read the balance. Refresh to try again.' : errorText(e)
  }
  if (!alwaysShown && balance === 0n) return null
  return { kind: 'trc20', id: contract, symbol: meta.symbol, name: meta.name, decimals: meta.decimals, balance, trust: classifyTrust('trc20', contract, meta.symbol, network, customContracts), error }
}

async function readTrc10(tw: TronWeb, network: Network, id: string, balance: bigint, customContracts: Set<string>): Promise<Holding> {
  try {
    const meta = await trc10Meta(tw, network, id)
    return { kind: 'trc10', id, symbol: meta.symbol, name: meta.name, decimals: meta.decimals, balance, trust: classifyTrust('trc10', id, meta.symbol, network, customContracts) }
  } catch {
    // Without precision the amount cannot be scaled, so it is shown as unavailable rather than guessed.
    return { kind: 'trc10', id, symbol: `Token ${id}`, name: 'TRC10 token', decimals: 0, balance: null, trust: 'unverified', error: 'Could not load this token. Refresh to try again.' }
  }
}
