import { useEffect, useState, type FormEvent } from 'react'
import { isTronAddress } from '../lib/address'
import { addressUrl, NETWORKS, NETWORK_ORDER, type NetworkId } from '../lib/networks'
import { lookupHref } from '../lib/routes'
import { formatAmount, TRX_DECIMALS } from '../lib/units'
import { useChainData } from '../state/chain'
import { useWallet } from '../state/wallet-context'
import { IconBack, IconEye, IconExternal, IconSearch, TronMark } from '../ui/icons'
import { Button, CopyButton, Field, Notice, Segmented } from '../ui/kit'
import { ActivityPanel, AssetsPanel, ResourceStrip } from './Portfolio'

/**
 * View-only balances for any TRON address on any network. Needs no wallet and no keys:
 * everything shown is public chain data.
 */
export function AddressLookup({ network: networkId, address }: { network: NetworkId; address: string }) {
  const { hasVault, unlocked, accounts } = useWallet()
  const [draft, setDraft] = useState(address)
  const [error, setError] = useState<string | null>(null)
  const network = NETWORKS[networkId]

  useEffect(() => {
    document.documentElement.dataset.network = networkId
  }, [networkId])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = draft.trim()
    if (!isTronAddress(value)) {
      setError('Enter a TRON address. It starts with T and has 34 characters.')
      return
    }
    setError(null)
    window.location.hash = lookupHref(networkId, value)
  }

  const switchNetwork = (id: NetworkId) => {
    window.location.hash = lookupHref(id, address)
  }

  const ownAccount = accounts.find((a) => a.address === address)
  const backLabel = hasVault ? (unlocked ? 'Back to wallet' : 'Back to unlock') : 'Back'

  return (
    <div className="app lookup" data-network={networkId}>
      <header className="topbar">
        <a className="brand brand-link" href="#" aria-label="Tron Wallet home">
          <TronMark className="brand-mark" />
          <span>Tron Wallet</span>
        </a>
        <a className="btn btn-ghost btn-sm" href="#">
          <IconBack /> {backLabel}
        </a>
      </header>

      <main className="lookup-main">
        <div className="lookup-intro">
          <h1>Look up an address</h1>
          <p className="muted">See TRX and every token balance for any TRON address. View only: no wallet or private key needed.</p>
        </div>

        <form className="lookup-form" onSubmit={submit} noValidate>
          <Segmented<NetworkId> label="Network" value={networkId} onChange={switchNetwork} options={NETWORK_ORDER.map((id) => ({ value: id, label: NETWORKS[id].name }))} />
          <div className="lookup-row">
            <Field label="Address" error={error}>
              {(p) => (
                <input
                  {...p}
                  className="input mono"
                  placeholder="T…"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setError(null)
                  }}
                  autoFocus={!address}
                />
              )}
            </Field>
            <Button variant="net" type="submit">
              <IconSearch /> Look up
            </Button>
          </div>
        </form>

        {address ? <LookupResult key={`${networkId}:${address}`} networkId={networkId} address={address} ownName={ownAccount?.name} /> : null}
        {!address ? (
          <p className="lookup-empty muted">
            <IconEye /> Balances come straight from the {network.name} chain and token contracts.
          </p>
        ) : null}
      </main>
    </div>
  )
}

function LookupResult({ networkId, address, ownName }: { networkId: NetworkId; address: string; ownName?: string }) {
  const network = NETWORKS[networkId]
  const chain = useChainData(network, address)
  const [whole, frac] = chain.trx === null ? [null, null] : formatAmount(chain.trx, TRX_DECIMALS, 6).split('.')

  return (
    <>
      <section className="slab" aria-label={`Balances for ${address} on ${network.name}`}>
        <div className={`slab-tape ${network.kind === 'mainnet' ? 'slab-tape-main' : ''}`}>
          <span>View only on {network.name}{network.kind === 'testnet' ? '. Test tokens have no real value.' : '.'}</span>
        </div>
        <div className="slab-body">
          <div className="slab-meta">
            <span className="slab-account">{ownName ? `${ownName} (your account)` : 'Address'}</span>
            {chain.height ? <span className="slab-path mono">block #{chain.height.toLocaleString('en-US')}</span> : null}
          </div>
          <p className="slab-balance" aria-live="polite">
            {whole === null ? (
              <span className="skeleton slab-skel" aria-label="Loading balance" />
            ) : (
              <>
                <span className="slab-whole">{whole}</span>
                {frac ? <span className="slab-frac">.{frac}</span> : null}
                <span className="slab-unit">TRX</span>
              </>
            )}
          </p>
          <div className="slab-address">
            <span className="mono slab-address-text">{address}</span>
            <CopyButton value={address} label="Copy address" toastText="Address copied" />
          </div>
          <div className="slab-actions slab-actions-single">
            <a className="slab-action" href={addressUrl(network, address)} target="_blank" rel="noreferrer">
              <IconExternal />
              View on TRONSCAN
            </a>
          </div>
        </div>
        <ResourceStrip chain={chain} network={network} />
      </section>

      {chain.error ? (
        <Notice tone="warn">
          {chain.error}{' '}
          <button type="button" className="text-link inline" onClick={chain.refresh}>
            Try again
          </button>
        </Notice>
      ) : null}

      <div className="columns">
        <AssetsPanel chain={chain} network={network} />
        <ActivityPanel chain={chain} network={network} address={address} emptyHint="Transfers to and from this address will appear here." />
      </div>
    </>
  )
}
