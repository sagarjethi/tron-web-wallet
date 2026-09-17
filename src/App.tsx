import { lazy, Suspense, useEffect, useState } from 'react'
import { Onboarding, Unlock } from './components/Onboarding'
import { parseRoute } from './lib/routes'
import { useWallet } from './state/wallet-context'
import { Spinner } from './ui/kit'

// TronWeb is large; load it only on screens that talk to the chain.
const Wallet = lazy(() => import('./components/Wallet').then((m) => ({ default: m.Wallet })))
const AddressLookup = lazy(() => import('./components/AddressLookup').then((m) => ({ default: m.AddressLookup })))
// The component kit renders sample balances and activity, so it exists only in development builds.
const Kit = import.meta.env.DEV ? lazy(() => import('./components/Kit').then((m) => ({ default: m.Kit }))) : null

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

function Loading() {
  return (
    <div className="unlock">
      <Spinner />
    </div>
  )
}

export default function App() {
  const { hasVault, unlocked, network } = useWallet()
  const route = parseRoute(useHash())

  // The lookup page colors itself by the network it is showing.
  useEffect(() => {
    if (route.kind === 'app') document.documentElement.dataset.network = hasVault && unlocked ? network.id : 'shasta'
  }, [route.kind, hasVault, unlocked, network.id])

  useEffect(() => {
    if (route.kind === 'lookup') window.scrollTo(0, 0)
  }, [route.kind])

  let screen
  if (route.kind === 'lookup') screen = <AddressLookup network={route.network} address={route.address} />
  else if (route.kind === 'kit' && Kit) screen = <Kit />
  else if (!hasVault) screen = <Onboarding />
  else if (!unlocked) screen = <Unlock />
  else screen = <Wallet />

  return <Suspense fallback={<Loading />}>{screen}</Suspense>
}
