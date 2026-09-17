import { NETWORK_ORDER, type NetworkId } from './networks'
import { isTronAddress } from './address'

/**
 * Hash routes. Hash routing keeps the app a static site with no server rewrites, and the address
 * and network never reach the server in request logs.
 *
 *   #kit                          component kit (development only)
 *   #/lookup/{network}/{address}  view-only balances for any address
 */

export type Route = { kind: 'app' } | { kind: 'kit' } | { kind: 'lookup'; network: NetworkId; address: string }

export function parseRoute(hash: string): Route {
  if (hash === '#kit') return { kind: 'kit' }
  const m = /^#\/lookup(?:\/([a-z]+))?(?:\/([^/?#]*))?$/.exec(hash)
  if (m) {
    const network = NETWORK_ORDER.includes(m[1] as NetworkId) ? (m[1] as NetworkId) : 'shasta'
    const candidate = decodeURIComponent(m[2] ?? '').trim()
    return { kind: 'lookup', network, address: isTronAddress(candidate) ? candidate : '' }
  }
  return { kind: 'app' }
}

export function lookupHref(network: NetworkId, address = ''): string {
  return `#/lookup/${network}${address ? `/${address}` : ''}`
}
