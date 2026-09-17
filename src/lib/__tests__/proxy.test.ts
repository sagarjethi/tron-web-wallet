import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTronProxy, resolveUpstream } from '../../../api/tron'

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
  afterEach(() => vi.restoreAllMocks())

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
