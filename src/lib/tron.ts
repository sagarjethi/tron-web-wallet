import { TronWeb, Trx } from 'tronweb'
import { isTronAddress } from './address'
import type { Network, TokenPreset } from './networks'
import { TRX_DECIMALS } from './units'

const clients = new Map<string, TronWeb>()

/**
 * In the browser every call goes through the same-origin proxy (api/tron.ts), which adds the
 * TronGrid API key server side. Node (tests, scripts) talks to TronGrid directly.
 */
export function apiBase(network: Network): string {
  return typeof window === 'undefined' ? network.fullHost : `${window.location.origin}/api/tron/${network.id}`
}

export function getClient(network: Network): TronWeb {
  let client = clients.get(network.id)
  if (!client) {
    client = new TronWeb({ fullHost: apiBase(network) })
    clients.set(network.id, client)
  }
  return client
}

/** Rate limits, gateway errors and dropped connections: worth retrying, and never proof about the chain. */
export function isTransientError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /\b(429|500|502|503|504)\b|Network Error|Failed to fetch|fetch failed|ERR_NETWORK|ECONNRESET|ETIMEDOUT|timeout/i.test(m)
}

/** Runs a read with exponential backoff on transient failures only. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseDelayMs = 400): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= attempts || !isTransientError(e)) throw e
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5)))
    }
  }
}

/** Turns transport failures into sentences a wallet user can act on. */
export function describeError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/429/.test(m)) return 'The TRON network is busy right now. Wait a few seconds and try again.'
  if (/Network Error|Failed to fetch|ERR_NETWORK|502|503|504/i.test(m)) return 'Cannot reach the TRON network. Check your connection and try again.'
  if (/status code 403/.test(m)) return 'This request is not allowed by the wallet server.'
  return m
}

export { isTronAddress } from './address'

// ---------------------------------------------------------------- reads

export async function getBlockHeight(tw: TronWeb): Promise<number> {
  const block = await tw.trx.getCurrentBlock()
  return block.block_header.raw_data.number
}

export async function getTrxBalance(tw: TronWeb, address: string): Promise<bigint> {
  return (await getAccountState(tw, address)).balance
}

/** An address exists on chain only after it first receives TRX (or a TRC10 token). */
export async function getAccountState(tw: TronWeb, address: string): Promise<{ balance: bigint; activated: boolean }> {
  // Full node, not solidity: solidified state lags about a minute, which hides a send that just confirmed.
  const account = await tw.trx.getUnconfirmedAccount(address)
  return { balance: BigInt(account.balance ?? 0), activated: Boolean(account.address) }
}

export async function isActivated(tw: TronWeb, address: string): Promise<boolean> {
  const account = await tw.trx.getUnconfirmedAccount(address)
  return Boolean(account.address)
}

/**
 * Read-only contract call. The TVM needs an owner address for simulation;
 * the contract address itself always exists, so it is a safe default caller.
 */
async function constantCall(tw: TronWeb, contract: string, selector: string, params: { type: string; value: unknown }[] = [], caller = contract) {
  const res = await tw.transactionBuilder.triggerConstantContract(contract, selector, {}, params, caller)
  const ok = res.result?.result && res.constant_result?.[0] !== undefined
  if (!ok) throw new Error(decodeNodeMessage(res.result?.message) || `Call to ${selector} failed`)
  return { hex: res.constant_result[0] as string, energyUsed: Number(res.energy_used ?? 0), res }
}

export async function getTrc20Balance(tw: TronWeb, contract: string, owner: string): Promise<bigint> {
  const { hex } = await constantCall(tw, contract, 'balanceOf(address)', [{ type: 'address', value: owner }])
  return hex ? BigInt('0x' + hex) : 0n
}

/** The contract definitively is not a readable TRC20 token (as opposed to a failed request). */
export class NotATokenError extends Error {}

export async function getTokenMetadata(tw: TronWeb, contract: string): Promise<TokenPreset> {
  if (!isTronAddress(contract)) throw new Error('That is not a TRON contract address')
  const decode = (hex: string, type: string) => tw.utils.abi.decodeParams([], [type], '0x' + hex)[0]
  // Most tokens return string; some older ones return bytes32 padded with zero bytes.
  const decodeText = (hex: string) => {
    try {
      return String(decode(hex, 'string'))
    } catch {
      const bytes = (hex.slice(0, 64).match(/../g) ?? []).map((h) => parseInt(h, 16)).filter((b) => b !== 0)
      return new TextDecoder().decode(new Uint8Array(bytes))
    }
  }
  try {
    const [symbol, name, decimals] = await Promise.all([
      constantCall(tw, contract, 'symbol()').then((r) => decodeText(r.hex)),
      constantCall(tw, contract, 'name()').then((r) => decodeText(r.hex)),
      constantCall(tw, contract, 'decimals()').then((r) => Number(decode(r.hex, 'uint8'))),
    ])
    return { contract, symbol, name, decimals }
  } catch (e) {
    if (isTransientError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (/not exist/i.test(msg)) throw new NotATokenError('No contract exists at this address on this network')
    throw new NotATokenError('This contract does not look like a TRC20 token')
  }
}

export interface Resources {
  freeBandwidth: number
  stakedBandwidth: number
  energy: number
}

export async function getResources(tw: TronWeb, address: string): Promise<Resources> {
  const r = await tw.trx.getAccountResources(address)
  return {
    freeBandwidth: Math.max(0, (r.freeNetLimit ?? 0) - (r.freeNetUsed ?? 0)),
    stakedBandwidth: Math.max(0, (r.NetLimit ?? 0) - (r.NetUsed ?? 0)),
    energy: Math.max(0, (r.EnergyLimit ?? 0) - (r.EnergyUsed ?? 0)),
  }
}

interface ChainPrices {
  energySun: number
  bandwidthSun: number
  /** Flat fee for creating an account through a TRX transfer. */
  createAccountSun: number
  /** Burned instead when the sender has no staked bandwidth for the account-creation transfer. */
  createAccountBandwidthSun: number
}

const priceCache = new Map<string, Promise<ChainPrices>>()

function getPrices(tw: TronWeb, network: Network): Promise<ChainPrices> {
  let p = priceCache.get(network.id)
  if (!p) {
    p = tw.trx.getChainParameters().then((params) => {
      const get = (key: string, fallback: number) => params.find((x) => x.key === key)?.value ?? fallback
      return {
        energySun: get('getEnergyFee', 100),
        bandwidthSun: get('getTransactionFee', 1000),
        createAccountSun: get('getCreateNewAccountFeeInSystemContract', 1_000_000),
        createAccountBandwidthSun: get('getCreateAccountFee', 100_000),
      }
    })
    p.catch(() => priceCache.delete(network.id))
    priceCache.set(network.id, p)
  }
  return p
}

// ---------------------------------------------------------------- sends

export type Asset = { kind: 'trx' } | { kind: 'trc20'; token: TokenPreset }

export const assetDecimals = (a: Asset) => (a.kind === 'trx' ? TRX_DECIMALS : a.token.decimals)
export const assetSymbol = (a: Asset) => (a.kind === 'trx' ? 'TRX' : a.token.symbol)

type UnsignedTx = Awaited<ReturnType<TronWeb['transactionBuilder']['sendTrx']>>

export interface PreparedSend {
  tx: UnsignedTx
  from: string
  to: string
  amount: bigint
  asset: Asset
  recipientActivated: boolean
  estimate: {
    bandwidthBytes: number
    bandwidthBurnSun: bigint
    energyUsed: number
    energyBurnSun: bigint
    activationSun: bigint
    totalSun: bigint
  }
  feeLimitSun?: number
}

/** Signature (65 bytes) plus protobuf framing added when the tx is signed and wrapped. */
const SIGNATURE_OVERHEAD_BYTES = 69
const MAX_FEE_LIMIT_SUN = 1_000_000_000 // 1,000 TRX hard cap

export async function prepareSend(tw: TronWeb, network: Network, from: string, to: string, amount: bigint, asset: Asset): Promise<PreparedSend> {
  if (!isTronAddress(to)) throw new Error('Recipient must be a TRON address starting with T')
  if (to === from) throw new Error('Recipient is the same as the sending account')
  if (amount <= 0n) throw new Error('Amount must be greater than zero')

  const [prices, resources, recipientActivated] = await Promise.all([getPrices(tw, network), getResources(tw, from), isActivated(tw, to)])

  let tx: UnsignedTx
  let energyUsed = 0
  let feeLimitSun: number | undefined

  if (asset.kind === 'trx') {
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large')
    tx = await tw.transactionBuilder.sendTrx(to, Number(amount), from)
  } else {
    const params = [
      { type: 'address', value: to },
      { type: 'uint256', value: amount.toString() },
    ]
    const sim = await tw.transactionBuilder.triggerConstantContract(asset.token.contract, 'transfer(address,uint256)', {}, params, from)
    const reverted = !sim.result?.result || (sim as { transaction?: { ret?: { ret?: string }[] } }).transaction?.ret?.[0]?.ret === 'FAILED'
    if (reverted) {
      const reason = decodeNodeMessage(sim.result?.message)
      throw new Error(reason ? `The token contract rejected this transfer: ${reason}` : 'The token contract rejected this transfer. Check the token balance.')
    }
    energyUsed = Number(sim.energy_used ?? 0)
    const worstCase = Math.ceil(energyUsed * prices.energySun * 1.5)
    feeLimitSun = Math.min(MAX_FEE_LIMIT_SUN, Math.max(worstCase, 10_000_000))
    const built = await tw.transactionBuilder.triggerSmartContract(asset.token.contract, 'transfer(address,uint256)', { feeLimit: feeLimitSun }, params, from)
    if (!built.result?.result) throw new Error(decodeNodeMessage(built.result?.message) || 'Could not build the transaction')
    tx = built.transaction as unknown as UnsignedTx
  }

  const bandwidthBytes = tx.raw_data_hex.length / 2 + SIGNATURE_OVERHEAD_BYTES
  const energyBurnSun = BigInt(Math.max(0, energyUsed - resources.energy) * prices.energySun)

  // A TRX transfer that creates an account costs a flat fee, and its bandwidth can only come
  // from staked bandwidth; free daily bandwidth does not apply, so 0.1 TRX burns instead.
  const createsAccount = asset.kind === 'trx' && !recipientActivated
  let bandwidthBurnSun = 0n
  let activationSun = 0n
  if (createsAccount) {
    activationSun = BigInt(prices.createAccountSun) + (resources.stakedBandwidth >= bandwidthBytes ? 0n : BigInt(prices.createAccountBandwidthSun))
  } else if (Math.max(resources.freeBandwidth, resources.stakedBandwidth) < bandwidthBytes) {
    bandwidthBurnSun = BigInt(bandwidthBytes * prices.bandwidthSun)
  }

  return {
    tx,
    from,
    to,
    amount,
    asset,
    recipientActivated,
    feeLimitSun,
    estimate: {
      bandwidthBytes,
      bandwidthBurnSun,
      energyUsed,
      energyBurnSun,
      activationSun,
      totalSun: bandwidthBurnSun + energyBurnSun + activationSun,
    },
  }
}

export async function signAndBroadcast(tw: TronWeb, prepared: PreparedSend, privateKey: string): Promise<string> {
  const signed = await tw.trx.sign(prepared.tx, privateKey)
  const result = await tw.trx.sendRawTransaction(signed)
  if (!('result' in result) || !result.result) {
    const r = result as { code?: string; message?: string }
    throw new Error(humanizeBroadcastError(r.code, decodeNodeMessage(r.message)))
  }
  return signed.txID
}

export type Confirmation = { status: 'confirmed'; feeSun: bigint; block: number } | { status: 'failed'; reason: string } | { status: 'pending' }

export async function checkConfirmation(tw: TronWeb, txid: string): Promise<Confirmation> {
  const info = (await tw.trx.getTransactionInfo(txid)) as {
    blockNumber?: number
    fee?: number
    receipt?: { result?: string }
    result?: string
    resMessage?: string
  }
  if (!info || info.blockNumber === undefined) return { status: 'pending' }
  const receipt = info.receipt?.result
  if (info.result === 'FAILED' || (receipt && receipt !== 'SUCCESS')) {
    return { status: 'failed', reason: decodeNodeMessage(info.resMessage) || receipt || 'Execution failed' }
  }
  return { status: 'confirmed', feeSun: BigInt(info.fee ?? 0), block: info.blockNumber }
}

function humanizeBroadcastError(code: string | undefined, message: string): string {
  if (/balance is not sufficient|balance is insufficient/i.test(message)) return 'Not enough TRX to cover the amount and network fee'
  if (/bandwidth/i.test(message)) return 'Not enough bandwidth or TRX to pay for it'
  if (/Contract validate error/i.test(message)) return message.replace(/^Contract validate error\s*:\s*/i, '')
  if (code === 'TRANSACTION_EXPIRATION_ERROR') return 'The transaction expired before it reached the network. Try again.'
  return message || code || 'The network rejected the transaction'
}

/** Node error messages arrive hex encoded. */
export function decodeNodeMessage(message?: string): string {
  if (!message) return ''
  if (!/^[0-9a-f]+$/i.test(message) || message.length % 2) return message
  try {
    return new TextDecoder().decode(new Uint8Array(message.match(/../g)!.map((h) => parseInt(h, 16))))
  } catch {
    return message
  }
}

// ---------------------------------------------------------------- messages

export function signMessage(message: string, privateKey: string): string {
  return Trx.signMessageV2(message, privateKey)
}

/** Returns the base58 address that produced the signature. */
export function recoverSigner(message: string, signature: string): string {
  const sig = signature.trim()
  if (!/^(0x)?[0-9a-f]{130}$/i.test(sig)) throw new Error('A signature is 65 bytes: 130 hex characters, optionally prefixed with 0x')
  return Trx.verifyMessageV2(message, sig.startsWith('0x') ? sig : '0x' + sig)
}

// ---------------------------------------------------------------- history

const CONTRACT_LABELS: Record<string, string> = {
  TriggerSmartContract: 'Contract call',
  TransferAssetContract: 'TRC10 transfer',
  AccountCreateContract: 'Account activation',
  FreezeBalanceContract: 'Stake TRX',
  FreezeBalanceV2Contract: 'Stake TRX',
  UnfreezeBalanceContract: 'Unstake TRX',
  UnfreezeBalanceV2Contract: 'Unstake TRX',
  WithdrawExpireUnfreezeContract: 'Withdraw unstaked TRX',
  CancelAllUnfreezeV2Contract: 'Cancel unstaking',
  DelegateResourceContract: 'Delegate resources',
  UnDelegateResourceContract: 'Reclaim resources',
  VoteWitnessContract: 'Vote',
  WithdrawBalanceContract: 'Claim rewards',
  AccountPermissionUpdateContract: 'Update permissions',
  CreateSmartContract: 'Deploy contract',
}

export function contractLabel(type: string): string {
  return CONTRACT_LABELS[type] ?? type.replace(/Contract$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}

export interface ActivityItem {
  txid: string
  timestamp: number
  direction: 'in' | 'out' | 'self'
  counterparty: string
  symbol: string
  decimals: number
  amount: bigint
  label: string
  failed: boolean
}

interface GridTx {
  txID: string
  block_timestamp: number
  ret?: { contractRet?: string }[]
  raw_data: { contract: { type: string; parameter: { value: Record<string, unknown> } }[] }
}

interface GridTrc20 {
  transaction_id: string
  block_timestamp: number
  from: string
  to: string
  value: string
  type: string
  token_info: { symbol: string; decimals: number; address: string }
}

async function grid<T>(network: Network, path: string): Promise<T[]> {
  const res = await fetch(`${apiBase(network)}${path}`)
  if (!res.ok) throw new Error(`TronGrid request failed with status code ${res.status}`)
  const body = (await res.json()) as { data?: T[]; success?: boolean }
  return body.data ?? []
}

export async function getActivity(network: Network, address: string): Promise<ActivityItem[]> {
  const [native, tokens] = await Promise.all([
    grid<GridTx>(network, `/v1/accounts/${address}/transactions?limit=30`),
    grid<GridTrc20>(network, `/v1/accounts/${address}/transactions/trc20?limit=30`),
  ])
  const tokenTxids = new Set(tokens.map((t) => t.transaction_id))
  const direction = (from: string, to: string): ActivityItem['direction'] => (from === to ? 'self' : from === address ? 'out' : 'in')

  const items: ActivityItem[] = tokens.map((t) => ({
    txid: t.transaction_id,
    timestamp: t.block_timestamp,
    direction: direction(t.from, t.to),
    counterparty: t.from === address ? t.to : t.from,
    symbol: t.token_info.symbol,
    decimals: t.token_info.decimals,
    amount: BigInt(t.value),
    label: t.type === 'Approval' ? 'Approval' : 'Transfer',
    failed: false,
  }))

  for (const tx of native) {
    if (!tx.raw_data || tokenTxids.has(tx.txID)) continue
    const contract = tx.raw_data.contract[0]
    const v = contract.parameter.value
    const failed = Boolean(tx.ret?.[0]?.contractRet && tx.ret[0].contractRet !== 'SUCCESS')
    const owner = typeof v.owner_address === 'string' ? TronWeb.address.fromHex(v.owner_address) : ''
    if (contract.type === 'TransferContract') {
      const to = TronWeb.address.fromHex(String(v.to_address))
      items.push({
        txid: tx.txID,
        timestamp: tx.block_timestamp,
        direction: direction(owner, to),
        counterparty: owner === address ? to : owner,
        symbol: 'TRX',
        decimals: TRX_DECIMALS,
        amount: BigInt(Number(v.amount ?? 0)),
        label: 'Transfer',
        failed,
      })
    } else {
      const target = typeof v.contract_address === 'string' ? TronWeb.address.fromHex(v.contract_address) : owner
      items.push({
        txid: tx.txID,
        timestamp: tx.block_timestamp,
        direction: owner === address ? 'out' : 'in',
        counterparty: target,
        symbol: '',
        decimals: 0,
        amount: 0n,
        label: contractLabel(contract.type),
        failed,
      })
    }
  }
  return items.sort((a, b) => b.timestamp - a.timestamp)
}
