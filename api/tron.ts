/**
 * TronGrid proxy (Vercel Function).
 *
 *   /api/tron/{network}/{path}  ->  {TronGrid host}/{path}
 *
 * Why it exists:
 * - The TronGrid API key stays on the server (TRONGRID_API_KEY) and never ships in browser code.
 * - Only the endpoints the wallet uses are forwarded, so the key cannot be spent on arbitrary calls.
 * - Upstream headers are never passed back, error bodies are scrubbed of the key, and nothing is logged.
 *
 * Kept free of relative imports so Vercel can compile it on its own; vite.config.ts reuses
 * `handleTronProxy` for the local dev server.
 */

export const UPSTREAMS = {
  mainnet: 'https://api.trongrid.io',
  shasta: 'https://api.shasta.trongrid.io',
  nile: 'https://nile.trongrid.io',
} as const

export type ProxyNetwork = keyof typeof UPSTREAMS

const ADDRESS = '[1-9A-HJ-NP-Za-km-z]{34}'

/** Every endpoint the wallet (and TronWeb on its behalf) calls. Anything else is refused. */
export const ALLOWED_PATHS: RegExp[] = [
  /^wallet\/(getnowblock|getblock|getaccount|getaccountresource|getchainparameters|triggerconstantcontract|triggersmartcontract|createtransaction|broadcasttransaction|gettransactioninfobyid|gettransactionbyid)$/,
  /^walletsolidity\/(getnowblock|getblock|getaccount|gettransactioninfobyid|gettransactionbyid)$/,
  new RegExp(`^v1/accounts/${ADDRESS}/transactions(/trc20)?$`),
]

const MAX_BODY_BYTES = 64 * 1024
const MAX_ERROR_BODY_BYTES = 16 * 1024
const UPSTREAM_TIMEOUT_MS = 20_000

export function resolveUpstream(network: string, path: string): string | null {
  if (!Object.hasOwn(UPSTREAMS, network)) return null
  const clean = path.replace(/^\/+/, '')
  if (!ALLOWED_PATHS.some((re) => re.test(clean))) return null
  return `${UPSTREAMS[network as ProxyNetwork]}/${clean}`
}

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/**
 * @param request incoming request whose URL is /api/tron/{network}/{path}?query
 * @param apiKey TronGrid key, or empty to call anonymously
 */
export async function handleTronProxy(request: Request, apiKey: string | undefined): Promise<Response> {
  const url = new URL(request.url)
  // Vercel rewrites /api/tron/:route* to /api/tron?route=:route*; the dev server passes the path as-is.
  const route = url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/tron\/?/, '')
  url.searchParams.delete('route')
  const match = /^([a-z]+)\/(.+)$/.exec(route)
  if (!match) return json(404, 'Unknown route')
  const upstream = resolveUpstream(match[1], match[2])
  if (!upstream) return json(403, 'Endpoint not allowed')

  if (request.method !== 'GET' && request.method !== 'POST') return json(405, 'Method not allowed')

  // Browsers always send Origin on cross-site POSTs; refuse other sites using this proxy from a page.
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== url.host) return json(403, 'Cross-origin requests are not allowed')

  let body: string | undefined
  if (request.method === 'POST') {
    body = await request.text()
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json(413, 'Request body too large')
  }

  const headers: Record<string, string> = { accept: 'application/json' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey

  let res: Response
  try {
    res = await fetch(upstream + (url.searchParams.size ? `?${url.searchParams}` : ''), { method: request.method, headers, body, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch {
    return json(502, 'TronGrid did not respond')
  }

  const responseHeaders = {
    'content-type': res.headers.get('content-type') ?? 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }

  // Successful bodies stream straight through. Error bodies are small; scrub them in case an
  // upstream error ever echoes request headers back.
  if (res.ok || !apiKey) return new Response(res.body, { status: res.status, headers: responseHeaders })
  const text = (await res.text()).slice(0, MAX_ERROR_BODY_BYTES)
  return new Response(text.split(apiKey).join('[redacted]'), { status: res.status, headers: responseHeaders })
}

const handler = (request: Request) => handleTronProxy(request, process.env.TRONGRID_API_KEY)

export const GET = handler
export const POST = handler
