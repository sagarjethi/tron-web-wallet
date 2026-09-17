import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTronProxy, resetProxyState, resolveUpstream } from '../../../api/tron'

const ADDR = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'

describe('resolveUpstream', () => {
  it('maps allowed endpoints to the right TronGrid host', () => {
    expect(resolveUpstream('shasta', 'wallet/getnowblock')).toBe('https://api.shasta.trongrid.io/wallet/getnowblock')
    expect(resolveUpstream('nile', 'walletsolidity/gettransactioninfobyid')).toBe('https://nile.trongrid.io/walletsolidity/gettransactioninfobyid')
    expect(resolveUpstream('mainnet', `v1/accounts/${ADDR}/transactions/trc20`)).toBe(`https://api.trongrid.io/v1/accounts/${ADDR}/transactions/trc20`)
    expect(resolveUpstream('nile', `v1/accounts/${ADDR}`)).toBe(`https://nile.trongrid.io/v1/accounts/${ADDR}`)
    expect(resolveUpstream('nile', 'wallet/getassetissuebyid')).toBe('https://nile.trongrid.io/wallet/getassetissuebyid')
  })

  it('refuses unknown networks and endpoints', () => {
    expect(resolveUpstream('ropsten', 'wallet/getnowblock')).toBeNull()
    expect(resolveUpstream('toString', 'wallet/getnowblock')).toBeNull()
    expect(resolveUpstream('shasta', 'wallet/createwitness')).toBeNull()
    expect(resolveUpstream('shasta', 'wallet/getnowblock/../../admin')).toBeNull()
    expect(resolveUpstream('shasta', 'v1/accounts/not-an-address/transactions')).toBeNull()
    expect(resolveUpstream('shasta', 'jsonrpc')).toBeNull()
    expect(resolveUpstream('shasta', `v1/accounts/${ADDR}/resources`)).toBeNull()
  })
})

describe('handleTronProxy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetProxyState()
  })

  const upstream = () =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))

  it('forwards with the server-side key, from both route forms', async () => {
    const spy = upstream()
    const direct = await handleTronProxy(new Request('https://w.example/api/tron/shasta/wallet/getnowblock'), 'secret')
    const rewritten = await handleTronProxy(new Request(`https://w.example/api/tron?route=mainnet/v1/accounts/${ADDR}/transactions&limit=30`), 'secret')
    expect(direct.status).toBe(200)
    expect(rewritten.status).toBe(200)
    const [url1, init1] = spy.mock.calls[0]
    const [url2] = spy.mock.calls[1]
    expect(url1).toBe('https://api.shasta.trongrid.io/wallet/getnowblock')
    expect((init1!.headers as Record<string, string>)['TRON-PRO-API-KEY']).toBe('secret')
    expect(url2).toBe(`https://api.trongrid.io/v1/accounts/${ADDR}/transactions?limit=30`)
  })

  it('passes POST bodies through', async () => {
    const spy = upstream()
    await handleTronProxy(new Request('https://w.example/api/tron/nile/wallet/getaccount', { method: 'POST', body: '{"address":"x"}' }), undefined)
    expect(spy.mock.calls[0][1]!.body).toBe('{"address":"x"}')
    expect((spy.mock.calls[0][1]!.headers as Record<string, string>)['TRON-PRO-API-KEY']).toBeUndefined()
  })

  it('blocks disallowed endpoints, other origins, methods and huge bodies without calling TronGrid', async () => {
    const spy = upstream()
    expect((await handleTronProxy(new Request('https://w.example/api/tron/shasta/wallet/createwitness'), 'k')).status).toBe(403)
    expect((await handleTronProxy(new Request('https://w.example/api/tron/shasta/wallet/getnowblock', { headers: { origin: 'https://evil.example' } }), 'k')).status).toBe(403)
    expect((await handleTronProxy(new Request('https://w.example/api/tron/shasta/wallet/getnowblock', { method: 'PUT' }), 'k')).status).toBe(405)
    expect((await handleTronProxy(new Request('https://w.example/api/tron/shasta/wallet/getaccount', { method: 'POST', body: 'x'.repeat(70_000) }), 'k')).status).toBe(413)
    expect(spy).not.toHaveBeenCalled()
  })

  it('never echoes the key back and never forwards upstream headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"Error":"bad key s3cr3t-key-value"}', { status: 401, headers: { 'content-type': 'application/json', 'set-cookie': 'x=1', 'x-internal': 'y' } }),
    )
    const res = await handleTronProxy(new Request('https://w.example/api/tron/mainnet/wallet/getnowblock'), 's3cr3t-key-value')
    const body = await res.text()
    expect(res.status).toBe(401)
    expect(body).not.toContain('s3cr3t-key-value')
    expect(body).toContain('[redacted]')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-internal')).toBeNull()
  })

  it('reports an unreachable upstream as 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    expect((await handleTronProxy(new Request('https://w.example/api/tron/shasta/wallet/getnowblock'), 'k')).status).toBe(502)
  })
})

describe('rate limit protection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetProxyState()
  })

  const post = (path: string, body: unknown) =>
    new Request(`https://w.example/api/tron/mainnet/${path}`, { method: 'POST', body: JSON.stringify(body) })

  it('serves token metadata from cache after the first read', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"result":{"result":true},"constant_result":["06"]}', { status: 200 }))
    const req = () => post('wallet/triggerconstantcontract', { contract_address: 'TXYZ', function_selector: 'decimals()' })
    const first = await handleTronProxy(req(), 'k')
    const second = await handleTronProxy(req(), 'k')
    expect(first.headers.get('x-proxy-cache')).toBe('miss')
    expect(second.headers.get('x-proxy-cache')).toBe('hit')
    expect(await second.text()).toContain('constant_result')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('never caches balances or failed reads', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"result":{"result":true},"constant_result":["01"]}', { status: 200 }))
    const balance = () => post('wallet/triggerconstantcontract', { contract_address: 'TXYZ', function_selector: 'balanceOf(address)', parameter: 'ab' })
    await handleTronProxy(balance(), 'k')
    await handleTronProxy(balance(), 'k')
    expect(spy).toHaveBeenCalledTimes(2)

    spy.mockImplementation(async () => new Response('{"result":{"code":"CONTRACT_VALIDATE_ERROR"}}', { status: 200 }))
    const symbol = () => post('wallet/triggerconstantcontract', { contract_address: 'TBAD', function_selector: 'symbol()' })
    await handleTronProxy(symbol(), 'k')
    await handleTronProxy(symbol(), 'k')
    expect(spy).toHaveBeenCalledTimes(4)
  })

  it('stops forwarding while TronGrid has suspended the key, and tells clients how long to wait', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"Error":"The key exceeds the frequency limit(15), and the query server is suspended for 3s"}', { status: 429 }))
    const first = await handleTronProxy(new Request('https://w.example/api/tron/mainnet/wallet/getnowblock'), 'k')
    expect(first.status).toBe(429)
    expect(first.headers.get('retry-after')).toBe('3')

    const second = await handleTronProxy(new Request('https://w.example/api/tron/nile/wallet/getnowblock'), 'k')
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
