import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Network, TokenPreset } from '../lib/networks'
import { getPortfolio, type Holding } from '../lib/portfolio'
import { describeError as friendly, getActivity, getBlockHeight, getClient, getResources, type ActivityItem, type Resources } from '../lib/tron'

export interface ChainData {
  height: number | null
  trx: bigint | null
  /** null until known */
  activated: boolean | null
  resources: Resources | null
  /** Every TRC20 and TRC10 token the address holds, plus verified and custom tokens at zero. null until loaded. */
  holdings: Holding[] | null
  /** Discovered tokens left out because the address holds too many to read at once. */
  omittedTokens: number
  activity: ActivityItem[] | null
  activityError: string | null
  error: string | null
  refreshedAt: number | null
  refresh: () => void
}

type Snapshot = Omit<ChainData, 'refresh'> & { scope: string }

const POLL_MS = 15_000
const MIN_REFRESH_GAP_MS = 5_000

const empty = (scope: string): Snapshot => ({
  scope,
  height: null,
  trx: null,
  activated: null,
  resources: null,
  holdings: null,
  omittedTokens: 0,
  activity: null,
  activityError: null,
  error: null,
  refreshedAt: null,
})

/**
 * Balances, tokens, resources and activity for any address on one network, polled while the tab is visible.
 * Needs no keys, so it serves both the wallet and the view-only address lookup.
 * Every snapshot is tagged with its scope, so numbers from a previous address or network never render.
 */
export function useChainData(network: Network, address: string | undefined, customTokens: TokenPreset[] = []): ChainData {
  const scope = `${network.id}|${address}`
  const [snap, setSnap] = useState<Snapshot>(() => empty(scope))
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const tokenKey = customTokens.map((t) => t.contract).join(',')
  const lastLoad = useRef(0)

  const load = useEffectEvent(async (isCurrent: () => boolean) => {
    if (!address) return
    const tw = getClient(network)
    const update = (fn: (s: Snapshot) => Snapshot) => {
      if (isCurrent()) setSnap((s) => fn(s.scope === scope ? s : empty(scope)))
    }

    const [height, portfolio, resources] = await Promise.allSettled([getBlockHeight(tw), getPortfolio(tw, network, address, customTokens), getResources(tw, address)])
    const failure = [portfolio, height, resources].find((r) => r.status === 'rejected')
    update((s) => ({
      ...s,
      height: height.status === 'fulfilled' ? height.value : s.height,
      trx: portfolio.status === 'fulfilled' ? portfolio.value.trx : s.trx,
      activated: portfolio.status === 'fulfilled' ? portfolio.value.activated : s.activated,
      holdings: portfolio.status === 'fulfilled' ? portfolio.value.holdings : s.holdings,
      omittedTokens: portfolio.status === 'fulfilled' ? portfolio.value.omitted : s.omittedTokens,
      resources: resources.status === 'fulfilled' ? resources.value : s.resources,
      error: failure ? friendly(failure.reason) : null,
      refreshedAt: Date.now(),
    }))

    try {
      const activity = await getActivity(network, address)
      update((s) => ({ ...s, activity, activityError: null }))
    } catch (e) {
      // Keep the last known list (or none): a failed request must never read as "no transactions".
      update((s) => ({ ...s, activityError: friendly(e) }))
    }
  })

  useEffect(() => {
    let cancelled = false
    lastLoad.current = Date.now()
    void load(() => !cancelled)
    return () => {
      cancelled = true
    }
  }, [scope, tokenKey, tick])

  useEffect(() => {
    if (!address) return
    const id = setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS)
    // Returning to the tab refreshes only if the data is stale, so rapid tab switching cannot flood TronGrid.
    const onVisible = () => document.visibilityState === 'visible' && Date.now() - lastLoad.current > MIN_REFRESH_GAP_MS && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [address, refresh])

  return { ...(snap.scope === scope ? snap : empty(scope)), refresh }
}
