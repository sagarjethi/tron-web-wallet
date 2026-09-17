/**
 * TronGrid proxy (Vercel Function).
 *
 *   /api/tron/{network}/{path}  ->  {TronGrid host}/{path}
 *
 * Why it exists:
 * - The TronGrid API key stays on the server (TRONGRID_API_KEY) and never ships in browser code.
 * - Only the endpoints the wallet uses are forwarded, so the key cannot be spent on arbitrary calls.
 * - Upstream headers are never passed back, error bodies are scrubbed of the key, and nothing is logged.
 * - TronGrid allows 15 requests per second per key and suspends the key after a burst. Token metadata,
 *   which never changes, is cached in memory and in the Vercel Runtime Cache (shared by every function
 *   instance in the region), and while the key is suspended requests are answered locally with
 *   Retry-After instead of extending it.
 *
 * Kept free of relative imports so Vercel can compile it on its own; vite.config.ts reuses
 * `handleTronProxy` for the local dev server.
 */

import { getCache } from '@vercel/functions'

export const UPSTREAMS = {
  mainnet: 'https://api.trongrid.io',
  shasta: 'https://api.shasta.trongrid.io',
  nile: 'https://nile.trongrid.io',
} as const

export type ProxyNetwork = keyof typeof UPSTREAMS

const ADDRESS = '[1-9A-HJ-NP-Za-km-z]{34}'

/** Every endpoint the wallet (and TronWeb on its behalf) calls. Anything else is refused. */
export const ALLOWED_PATHS: RegExp[] = [
  /^wallet\/(getnowblock|getblock|getaccount|getaccountresource|getchainparameters|triggerconstantcontract|triggersmartcontract|createtransaction|broadcasttransaction|gettransactioninfobyid|gettransactionbyid|getassetissuebyid)$/,
  /^walletsolidity\/(getnowblock|getblock|getaccount|gettransactioninfobyid|gettransactionbyid)$/,
  new RegExp(`^v1/accounts/${ADDRESS}(/transactions(/trc20)?)?$`),
]

const MAX_BODY_BYTES = 64 * 1024
const METADATA_TTL_MS = 6 * 60 * 60 * 1000
const METADATA_CACHE_MAX = 2000
const METADATA_SELECTORS = new Set(['symbol()', 'name()', 'decimals()'])

interface CachedResponse {
  body: string
  contentType: string
  expires: number
}

const METADATA_TAG = 'trongrid-metadata'
const metadataCache = new Map<string, CachedResponse>()
let suspendedUntil = 0

/** Shared across instances on Vercel; an in-memory stand-in locally. Cache trouble never fails a request. */
const sharedCache = () => getCache({ namespace: 'tron-proxy' })

async function readShared(key: string): Promise<CachedResponse | undefined> {
  try {
    return ((await sharedCache().get(key)) as CachedResponse | undefined) ?? undefined
  } catch {
    return undefined
  }
}

function writeShared(key: string, value: CachedResponse) {
  sharedCache()
    .set(key, value, { ttl: METADATA_TTL_MS / 1000, tags: [METADATA_TAG], name: METADATA_TAG })
    .catch(() => {})
}

function rememberLocally(key: string, value: CachedResponse) {
  if (metadataCache.size >= METADATA_CACHE_MAX) metadataCache.delete(metadataCache.keys().next().value!)
  metadataCache.set(key, value)
}

/** Test hook: clears both cache layers and the suspension state. */
export async function resetProxyState() {
  metadataCache.clear()
  suspendedUntil = 0
  await sharedCache().expireTag(METADATA_TAG).catch(() => {})
}

/** Cache key for requests whose answer never changes, or null if the request must not be cached. */
function metadataCacheKey(network: string, path: string, body: string | undefined): string | null {
  if (!body) return null
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body) as Record<string, unknown>
  } catch {
    return null
  }
  if (path === 'wallet/getassetissuebyid' && typeof payload.value === 'string') return `${network}|asset|${payload.value}`
  if (
    path === 'wallet/triggerconstantcontract' &&
    typeof payload.contract_address === 'string' &&
    typeof payload.function_selector === 'string' &&
    METADATA_SELECTORS.has(payload.function_selector) &&
    !payload.parameter
  ) {
    return `${network}|meta|${payload.contract_address}|${payload.function_selector}`
  }
  return null
}

function isCacheableAnswer(path: string, text: string): boolean {
  try {
    const data = JSON.parse(text) as { result?: { result?: boolean }; constant_result?: string[]; name?: string }
    return path === 'wallet/getassetissuebyid' ? Boolean(data.name) : data.result?.result === true && Array.isArray(data.constant_result)
  } catch {
    return false
  }
}
const MAX_ERROR_BODY_BYTES = 16 * 1024
const UPSTREAM_TIMEOUT_MS = 20_000

export function resolveUpstream(network: string, path: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(UPSTREAMS, network)) return null
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
  const [, network, path] = match
  const upstream = resolveUpstream(network, path)
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

  const cacheKey = metadataCacheKey(network, path.replace(/^\/+/, ''), body)
  if (cacheKey) {
    const cachedHeaders = (contentType: string, layer: string) => ({ 'content-type': contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-proxy-cache': layer })
    const local = metadataCache.get(cacheKey)
    if (local && local.expires > Date.now()) return new Response(local.body, { status: 200, headers: cachedHeaders(local.contentType, 'hit') })
    if (local) metadataCache.delete(cacheKey)
    const shared = await readShared(cacheKey)
    if (shared && shared.expires > Date.now()) {
      rememberLocally(cacheKey, shared)
      return new Response(shared.body, { status: 200, headers: cachedHeaders(shared.contentType, 'shared-hit') })
    }
  }

  // The key is suspended: answer locally so waiting clients do not extend the suspension.
  const now = Date.now()
  if (now < suspendedUntil) {
    const seconds = Math.ceil((suspendedUntil - now) / 1000)
    return new Response(JSON.stringify({ error: 'TronGrid is rate limiting this wallet. Try again shortly.' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': String(seconds) },
    })
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

  if (res.ok && cacheKey) {
    const text = await res.text()
    if (isCacheableAnswer(path, text)) {
      const entry = { body: text, contentType: responseHeaders['content-type'], expires: Date.now() + METADATA_TTL_MS }
      rememberLocally(cacheKey, entry)
      writeShared(cacheKey, entry)
    }
    return new Response(text, { status: res.status, headers: { ...responseHeaders, 'x-proxy-cache': 'miss' } })
  }

  // Successful bodies stream straight through.
  if (res.ok) return new Response(res.body, { status: res.status, headers: responseHeaders })

  // Error bodies are small; scrub them in case an upstream error ever echoes request headers back.
  const text = (await res.text()).slice(0, MAX_ERROR_BODY_BYTES)
  const safe = apiKey ? text.split(apiKey).join('[redacted]') : text
  if (res.status === 429) {
    // "The key exceeds the frequency limit(15), and the query server is suspended for 2s"
    const seconds = Math.min(Number(/suspended for (\d+)/i.exec(text)?.[1] ?? 2), 60)
    suspendedUntil = Math.max(suspendedUntil, Date.now() + seconds * 1000)
    return new Response(safe, { status: 429, headers: { ...responseHeaders, 'retry-after': String(seconds) } })
  }
  return new Response(safe, { status: res.status, headers: responseHeaders })
}

// Read through globalThis so the file type-checks under Vercel's default compiler settings (no Node types).
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

const handler = (request: Request) => handleTronProxy(request, env.TRONGRID_API_KEY)

export const GET = handler
export const POST = handler
