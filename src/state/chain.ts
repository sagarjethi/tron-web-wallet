import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Network, TokenPreset } from '../lib/networks'
import { describeError as friendly, getAccountState, getActivity, getBlockHeight, getClient, getResources, getTrc20Balance, type ActivityItem, type Resources } from '../lib/tron'

export interface TokenBalance {
  token: TokenPreset
  balance: bigint | null
  error?: string
}

export interface ChainData {
  height: number | null
  trx: bigint | null
  /** null until known */
  activated: boolean | null
  resources: Resources | null
  tokens: TokenBalance[]
  activity: ActivityItem[] | null
  activityError: string | null
  error: string | null
  refreshedAt: number | null
  refresh: () => void
}

type Snapshot = Omit<ChainData, 'refresh' | 'tokens'> & { scope: string; tokens: Map<string, TokenBalance> }

const POLL_MS = 15_000
const MIN_REFRESH_GAP_MS = 5_000

const empty = (scope: string): Snapshot => ({ scope, height: null, trx: null, activated: null, resources: null, tokens: new Map(), activity: null, activityError: null, error: null, refreshedAt: null })

/**
 * Balances, resources and activity for one account on one network, polled while the tab is visible.
 * Every snapshot is tagged with its scope, so numbers from a previous account or network never render.
 */
export function useChainData(network: Network, address: string | undefined, tokens: TokenPreset[]): ChainData {
  const scope = `${network.id}|${address}`
  const [snap, setSnap] = useState<Snapshot>(() => empty(scope))
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const tokenKey = tokens.map((t) => t.contract).join(',')
  const lastLoad = useRef(0)

  const load = useEffectEvent(async (isCurrent: () => boolean) => {
    if (!address) return
    const tw = getClient(network)
    const update = (fn: (s: Snapshot) => Snapshot) => {
      if (isCurrent()) setSnap((s) => fn(s.scope === scope ? s : empty(scope)))
    }

    const [height, trx, resources, ...tokenResults] = await Promise.allSettled([getBlockHeight(tw), getAccountState(tw, address), getResources(tw, address), ...tokens.map((t) => getTrc20Balance(tw, t.contract, address))])
    const failure = [height, trx, resources].find((r) => r.status === 'rejected')
    update((s) => {
      const nextTokens = new Map(s.tokens)
      tokens.forEach((token, i) => {
        const r = tokenResults[i]
        if (r.status === 'fulfilled') nextTokens.set(token.contract, { token, balance: r.value })
        else nextTokens.set(token.contract, { token, balance: s.tokens.get(token.contract)?.balance ?? null, error: friendly(r.reason) })
      })
      return {
        ...s,
        height: height.status === 'fulfilled' ? height.value : s.height,
        trx: trx.status === 'fulfilled' ? trx.value.balance : s.trx,
        activated: trx.status === 'fulfilled' ? trx.value.activated : s.activated,
        resources: resources.status === 'fulfilled' ? resources.value : s.resources,
        tokens: nextTokens,
        error: failure ? friendly(failure.reason) : null,
        refreshedAt: Date.now(),
      }
    })

    try {
      const activity = await getActivity(network, address)
      update((s) => ({ ...s, activity, activityError: null }))
    } catch (e) {
      update((s) => ({ ...s, activity: s.activity ?? [], activityError: friendly(e) }))
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

  const current = snap.scope === scope ? snap : empty(scope)
  return {
    ...current,
    tokens: tokens.map((token) => current.tokens.get(token.contract) ?? { token, balance: null }),
    refresh,
  }
}
