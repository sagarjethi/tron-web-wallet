import { lazy, Suspense, useEffect, useState } from 'react'
import { Onboarding, Unlock } from './components/Onboarding'
import { useWallet } from './state/wallet-context'
import { Spinner } from './ui/kit'

// TronWeb is large; load it only once the wallet is unlocked.
const Wallet = lazy(() => import('./components/Wallet').then((m) => ({ default: m.Wallet })))
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
  const hash = useHash()

  useEffect(() => {
    document.documentElement.dataset.network = hasVault && unlocked ? network.id : 'shasta'
  }, [hasVault, unlocked, network.id])

  let screen
  if (hash === '#kit' && Kit) screen = <Kit />
  else if (!hasVault) screen = <Onboarding />
  else if (!unlocked) screen = <Unlock />
  else screen = <Wallet />

  return <Suspense fallback={<Loading />}>{screen}</Suspense>
}
