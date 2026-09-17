/**
 * Compares discovered holdings with TRONSCAN, an independent indexer, on the live test networks.
 * Read only. Run with: npm run test:network
 */
import { describe, expect, it } from 'vitest'
import { NETWORKS, type NetworkId } from '../networks'
import { getPortfolio } from '../portfolio'
import { getClient, getTrc20Balance } from '../tron'

const run = process.env.TRON_NETWORK_TESTS === '1'
const ADDRESS = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'
const TRONSCAN: Partial<Record<NetworkId, string>> = { nile: 'https://nileapi.tronscan.org', shasta: 'https://shastapi.tronscan.org' }

interface ScanToken {
  tokenId: string
  tokenType: string
  tokenDecimal: number
  balance: string
}

async function tronscanHoldings(network: NetworkId): Promise<ScanToken[]> {
  const res = await fetch(`${TRONSCAN[network]}/api/account/tokens?address=${ADDRESS}&start=0&limit=100&hidden=0&show=0&sortType=0`)
  const body = (await res.json()) as { data: ScanToken[] }
  return body.data.filter((t) => t.tokenId !== '_' && BigInt(t.balance) > 0n)
}

describe.runIf(run)('portfolio discovery matches TRONSCAN', { timeout: 90_000 }, () => {
  it(`finds every token ${ADDRESS} holds on nile with exact balances and decimals`, async () => {
    const network = NETWORKS.nile
    const [portfolio, scan] = await Promise.all([getPortfolio(getClient(network), network, ADDRESS), tronscanHoldings('nile')])
    expect(scan.length).toBeGreaterThan(0)

    for (const token of scan) {
      const kind = token.tokenType === 'trc10' ? 'trc10' : 'trc20'
      const holding = portfolio.holdings.find((h) => h.kind === kind && h.id === token.tokenId)
      expect(holding, `${kind} ${token.tokenId} missing`).toBeDefined()
      expect(holding!.balance, `${token.tokenId} balance`).toBe(BigInt(token.balance))
      expect(holding!.decimals, `${token.tokenId} decimals`).toBe(token.tokenDecimal)
    }

    for (const preset of network.tokens) expect(portfolio.holdings.some((h) => h.id === preset.contract && h.trust === 'verified')).toBe(true)
    expect(portfolio.holdings.filter((h) => h.trust !== 'verified' && h.trust !== 'custom').every((h) => (h.balance ?? 0n) > 0n)).toBe(true)
  })

  // TRONSCAN's Shasta index lists no tokens for this address, so Shasta is checked against each
  // contract's own balanceOf, the same source the wallet displays.
  it(`finds every token ${ADDRESS} holds on shasta`, async () => {
    const network = NETWORKS.shasta
    const [portfolio, indexed] = await Promise.all([
      getPortfolio(getClient(network), network, ADDRESS),
      fetch(`${network.fullHost}/v1/accounts/${ADDRESS}`).then((r) => r.json() as Promise<{ data: { trc20?: Record<string, string>[] }[] }>),
    ])
    const entries = (indexed.data[0]?.trc20 ?? []).flatMap((e) => Object.entries(e)).filter(([, v]) => v !== '0')
    expect(entries.length).toBeGreaterThan(0)
    const tw = getClient(network)
    for (const [contract] of entries) {
      const onChain = await getTrc20Balance(tw, contract, ADDRESS)
      const holding = portfolio.holdings.find((h) => h.id === contract)
      if (onChain === 0n) expect(holding, `${contract} holds nothing on chain but is shown`).toBeUndefined()
      else expect(holding?.balance, `${contract} balance`).toBe(onChain)
    }
    expect(portfolio.holdings.filter((h) => h.trust === 'unverified').length).toBeGreaterThan(0)
  })

  it('reports TRX and verified tokens first, then the full scan', async () => {
    const network = NETWORKS.nile
    const partials: Awaited<ReturnType<typeof getPortfolio>>[] = []
    const full = await getPortfolio(getClient(network), network, ADDRESS, { onProgress: (p) => partials.push(p) })
    expect(partials).toHaveLength(1)
    expect(partials[0].complete).toBe(false)
    expect(partials[0].trx).toBe(full.trx)
    expect(partials[0].holdings.every((h) => h.trust === 'verified')).toBe(true)
    expect(full.complete).toBe(true)
    expect(full.holdings.length).toBeGreaterThan(partials[0].holdings.length)
  })

  it('skips discovery when asked, reading only verified and custom tokens', async () => {
    const network = NETWORKS.nile
    const jst = { contract: 'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', symbol: 'JST', name: 'JST', decimals: 18 }
    const p = await getPortfolio(getClient(network), network, ADDRESS, { discover: false, customTokens: [jst] })
    expect(p.complete).toBe(true)
    expect(p.holdings.map((h) => h.trust).sort()).toEqual(['custom', 'verified'])
    expect(p.holdings.find((h) => h.id === jst.contract)?.balance).toBe(66n * 10n ** 18n)
  })

  it('returns an empty portfolio for a never-used address on mainnet', async () => {
    const network = NETWORKS.mainnet
    const p = await getPortfolio(getClient(network), network, 'TLrpNTBuCpGMrB9TyVwgEhNVRhtWEQPHh4')
    expect(p.activated).toBe(typeof p.activated === 'boolean')
    expect(p.holdings.filter((h) => h.trust === 'verified')).toHaveLength(network.tokens.length)
  })
})
