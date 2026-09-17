/**
 * Every wallet flow against live Shasta, routed through the real /api/tron handler.
 * Fails if TronWeb needs an endpoint the proxy allowlist refuses. Nothing is broadcast.
 * Run with: npm run test:network
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { TronWeb, Trx } from 'tronweb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleTronProxy } from '../../../api/tron'
import { createMnemonic, defaultPath, deriveKey } from '../derivation'
import { NETWORKS, type Network } from '../networks'
import { getPortfolio } from '../portfolio'
import { checkConfirmation, getAccountState, getActivity, getBlockHeight, getResources, getTokenMetadata, getTrc20Balance, prepareSend } from '../tron'

const run = process.env.TRON_NETWORK_TESTS === '1'
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const HOLDER_TX = '5e02fae50a2e7dda1b4c13c2d30d9f454e7c95f36d9f1406a68649fd16d04e32'

describe.runIf(run)('Shasta through the /api/tron proxy', { timeout: 60_000 }, () => {
  let server: Server
  let network: Network
  let tw: TronWeb
  const seen: { path: string; status: number }[] = []

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const body = req.method === 'POST' ? (Readable.toWeb(req) as ReadableStream) : undefined
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body, duplex: 'half' } as RequestInit)
      const response = await handleTronProxy(request, undefined) // Tests never need secrets; Shasta works anonymously.
      seen.push({ path: req.url!.split('?')[0], status: response.status })
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as AddressInfo
    network = { ...NETWORKS.shasta, fullHost: `http://127.0.0.1:${port}/api/tron/shasta` }
    tw = new TronWeb({ fullHost: network.fullHost })
  })

  afterAll(() => {
    server?.close()
    const blocked = seen.filter((s) => s.status === 403 || s.status === 404)
    expect(blocked, `proxy refused: ${blocked.map((b) => b.path).join(', ')}`).toEqual([])
  })

  it('reads chain, account, resources, tokens and activity', async () => {
    const sender = deriveKey(ABANDON, defaultPath(0)).address
    expect(await getBlockHeight(tw)).toBeGreaterThan(1_000_000)
    expect((await getAccountState(tw, sender)).activated).toBe(true)
    expect((await getResources(tw, sender)).freeBandwidth).toBeGreaterThanOrEqual(0)
    expect(await getTrc20Balance(tw, network.tokens[0].contract, sender)).toBeGreaterThanOrEqual(0n)
    expect((await getTokenMetadata(tw, network.tokens[0].contract)).symbol).toBe('USDT')
    expect(Array.isArray(await getActivity(network, sender))).toBe(true)
  })

  it('discovers TRC20 and TRC10 holdings through the proxy', async () => {
    const nile = { ...NETWORKS.nile, fullHost: network.fullHost.replace('/shasta', '/nile') }
    const p = await getPortfolio(new TronWeb({ fullHost: nile.fullHost }), nile, deriveKey(ABANDON, defaultPath(0)).address)
    expect(p.holdings.some((h) => h.kind === 'trc10')).toBe(true)
    expect(p.holdings.filter((h) => h.kind === 'trc20').length).toBeGreaterThan(1)
  })

  it('builds and signs TRX and TRC20 transfers (never broadcast)', async () => {
    const sender = deriveKey(ABANDON, defaultPath(0))
    const fresh = deriveKey(createMnemonic(), defaultPath(0)).address

    const trx = await prepareSend(tw, network, sender.address, fresh, 1n, { kind: 'trx' }).catch((e: Error) => e)
    if (trx instanceof Error) expect(trx.message).toMatch(/balance|TRX/i)
    else expect(Trx.ecRecover(await tw.trx.sign(trx.tx, sender.privateKey))).toBe(sender.address)

    const usdt = await prepareSend(tw, network, sender.address, fresh, 10n ** 30n, { kind: 'trc20', token: network.tokens[0] }).catch((e: Error) => e)
    expect(usdt).toBeInstanceOf(Error)
  })

  it('looks up a confirmation', async () => {
    const c = await checkConfirmation(tw, HOLDER_TX)
    expect(c.status).not.toBe('pending')
  })
})
