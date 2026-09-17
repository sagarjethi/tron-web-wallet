/**
 * Read-only checks against the public Shasta testnet. Nothing is signed or broadcast.
 * Run with: npm run test:network
 */
import { describe, expect, it } from 'vitest'
import { createMnemonic, defaultPath, deriveKey } from '../derivation'
import { NETWORKS } from '../networks'
import { Trx } from 'tronweb'
import { getActivity, getBlockHeight, getClient, getTokenMetadata, getTrc20Balance, getTrxBalance, prepareSend } from '../tron'

const run = process.env.TRON_NETWORK_TESTS === '1'
const shasta = NETWORKS.shasta
const usdt = shasta.tokens[0]
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const KNOWN = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'

describe.runIf(run)('Shasta (read-only)', { timeout: 30_000 }, () => {
  const tw = getClient(shasta)
  const fresh = deriveKey(createMnemonic(), defaultPath(0)).address

  it('reads block height', async () => {
    expect(await getBlockHeight(tw)).toBeGreaterThan(1_000_000)
  })

  it('reads preset token metadata from chain', async () => {
    const meta = await getTokenMetadata(tw, usdt.contract)
    expect({ ...meta, name: usdt.name }).toEqual(usdt)
  })

  it('reports a clear error for a non-contract address', async () => {
    await expect(getTokenMetadata(tw, fresh)).rejects.toThrow(/No contract|TRC20/)
  })

  it('reads balances for a brand new, never-activated address', async () => {
    expect(await getTrxBalance(tw, fresh)).toBe(0n)
    expect(await getTrc20Balance(tw, usdt.contract, fresh)).toBe(0n)
  })

  it('estimates a TRX send to an inactive account including activation', async () => {
    expect(await getTrxBalance(tw, KNOWN)).toBeGreaterThan(200_000n)
    const p = await prepareSend(tw, shasta, KNOWN, fresh, 100_000n, { kind: 'trx' })
    expect(p.recipientActivated).toBe(false)
    expect(p.estimate.activationSun).toBeGreaterThan(0n)
    expect(p.estimate.bandwidthBytes).toBeGreaterThan(200)
    expect(p.tx.raw_data.contract[0].type).toBe('TransferContract')
  })

  it('estimates energy for a TRC20 transfer from a real holder', async () => {
    const items = await getActivity(shasta, KNOWN)
    const candidates = [...new Set(items.filter((i) => i.symbol === 'USDT').map((i) => i.counterparty))]
    let holder: string | undefined
    for (const c of candidates) {
      if ((await getTrc20Balance(tw, usdt.contract, c)) > 1n && (await getTrxBalance(tw, c)) > 0n) { holder = c; break }
    }
    expect(holder, 'no Shasta USDT holder found in recent activity').toBeDefined()
    const p = await prepareSend(tw, shasta, holder!, fresh, 1n, { kind: 'trc20', token: usdt })
    expect(p.estimate.energyUsed).toBeGreaterThan(10_000)
    expect(p.feeLimitSun).toBeGreaterThanOrEqual(10_000_000)
    expect(p.tx.raw_data.contract[0].type).toBe('TriggerSmartContract')
  })

  it('signs a node-built transaction that recovers to the sender (never broadcast)', async () => {
    const sender = deriveKey(ABANDON, defaultPath(0))
    expect(sender.address).toBe(KNOWN)
    const p = await prepareSend(tw, shasta, sender.address, 'TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK', 1n, { kind: 'trx' })
    const signed = await tw.trx.sign(p.tx, sender.privateKey)
    expect(signed.signature).toHaveLength(1)
    expect(Trx.ecRecover(signed)).toBe(sender.address)
  })

  it('refuses a TRC20 transfer larger than the balance before signing', async () => {
    await expect(prepareSend(tw, shasta, fresh, KNOWN, 10n ** 30n, { kind: 'trc20', token: usdt })).rejects.toThrow()
  })

  it('loads activity', async () => {
    const items = await getActivity(shasta, KNOWN)
    expect(Array.isArray(items)).toBe(true)
  })
})
