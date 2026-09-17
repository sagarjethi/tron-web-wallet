import { useEffect, useRef, useState } from 'react'
import { addressUrl, NETWORKS, NETWORK_ORDER, type NetworkId } from '../lib/networks'
import { lookupHref } from '../lib/routes'
import type { Asset } from '../lib/tron'
import { formatAmount, shortAddress, TRX_DECIMALS } from '../lib/units'
import { useChainData, type ChainData } from '../state/chain'
import { useWallet, type Account } from '../state/wallet-context'
import { IconChevron, IconDrop, IconLock, IconPlus, IconReceive, IconSearch, IconSend, IconSettings, IconSign, TronMark } from '../ui/icons'
import { Identicon } from '../ui/Identicon'
import { CopyButton, IconButton, Notice } from '../ui/kit'
import { AccountSheet, AddAccountSheet } from './AccountSheets'
import { ActivityPanel, AssetsPanel, ResourceStrip } from './Portfolio'
import { ReceiveSheet } from './ReceiveSheet'
import { SendSheet } from './SendSheet'
import { SettingsSheet } from './SettingsSheet'
import { SignSheet } from './SignSheet'
import { AddTokenSheet } from './TokenSheets'

type Open = null | { kind: 'send'; asset?: Asset } | { kind: 'receive' } | { kind: 'sign' } | { kind: 'add-account' } | { kind: 'account'; account: Account } | { kind: 'add-token' } | { kind: 'settings' }

export function Wallet() {
  const w = useWallet()
  const account = w.account!
  const chain = useChainData(w.network, account.address, w.customTokens)
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)

  useEffect(() => {
    document.documentElement.dataset.network = w.network.id
  }, [w.network.id])

  return (
    <div className="app" data-network={w.network.id}>
      <header className="topbar">
        <div className="brand">
          <TronMark className="brand-mark" />
          <span>Tron Wallet</span>
        </div>
        <div className="topbar-actions">
          <NetworkSwitch height={chain.height} />
          <a className="icon-btn" href={lookupHref(w.network.id)} aria-label="Look up any address" title="Look up any address">
            <IconSearch />
          </a>
          <IconButton label="Settings" onClick={() => setOpen({ kind: 'settings' })}>
            <IconSettings />
          </IconButton>
          <IconButton label="Lock wallet" onClick={w.lock}>
            <IconLock />
          </IconButton>
        </div>
      </header>

      <div className="layout">
        <AccountsRail onAdd={() => setOpen({ kind: 'add-account' })} onManage={(a) => setOpen({ kind: 'account', account: a })} trx={chain.trx} />

        <main className="main">
          <Slab account={account} chain={chain} onSend={() => setOpen({ kind: 'send' })} onReceive={() => setOpen({ kind: 'receive' })} onSign={() => setOpen({ kind: 'sign' })} />

          {chain.error ? (
            <Notice tone="warn">
              {chain.error}{' '}
              <button type="button" className="text-link inline" onClick={chain.refresh}>
                Try again
              </button>
            </Notice>
          ) : null}

          <div className="columns">
            <AssetsPanel chain={chain} network={w.network} onSend={(asset) => setOpen({ kind: 'send', asset })} onAddToken={() => setOpen({ kind: 'add-token' })} />
            <ActivityPanel chain={chain} network={w.network} address={account.address} emptyHint="Share your address or use the faucet to receive your first TRX." />
          </div>
        </main>
      </div>

      {/* Sheets mount only while open, so each one starts from fresh state. */}
      {open?.kind === 'send' ? <SendSheet initialAsset={open.asset} onClose={close} chain={chain} /> : null}
      {open?.kind === 'receive' ? <ReceiveSheet onClose={close} /> : null}
      {open?.kind === 'sign' ? <SignSheet onClose={close} /> : null}
      {open?.kind === 'add-account' ? <AddAccountSheet onClose={close} /> : null}
      {open?.kind === 'account' ? <AccountSheet account={open.account} onClose={close} /> : null}
      {open?.kind === 'add-token' ? <AddTokenSheet onClose={close} /> : null}
      {open?.kind === 'settings' ? <SettingsSheet onClose={close} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------- network

function NetworkSwitch({ height }: { height: number | null }) {
  const { network, setNetwork } = useWallet()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (id: NetworkId) => {
    setNetwork(id)
    setOpen(false)
  }

  return (
    <div className="netswitch" ref={ref}>
      <button type="button" className="netswitch-btn" aria-label={`Network: ${network.name}${height ? `, block ${height}` : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="net-dot" aria-hidden />
        <span className="netswitch-name">{network.name}</span>
        <span className="netswitch-height mono" title="Latest block">
          {height ? `#${height.toLocaleString('en-US')}` : 'connecting'}
        </span>
        <IconChevron className="netswitch-chev" />
      </button>
      {open ? (
        <ul className="netswitch-menu" role="listbox" aria-label="Network">
          {NETWORK_ORDER.map((id) => {
            const n = NETWORKS[id]
            return (
              <li key={id} role="option" aria-selected={id === network.id} data-network={id}>
                <button type="button" onClick={() => pick(id)}>
                  <span className="net-dot" aria-hidden />
                  <span>
                    <span className="netswitch-opt-name">{n.name}</span>
                    <span className="netswitch-opt-desc">{n.kind === 'testnet' ? 'Test network. Tokens have no value.' : 'Real funds'}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- accounts

function AccountsRail({ onAdd, onManage, trx }: { onAdd: () => void; onManage: (a: Account) => void; trx: bigint | null }) {
  const { accounts, account, selectAccount } = useWallet()
  return (
    <nav className="rail" aria-label="Accounts">
      <div className="rail-head">
        <h2>Accounts</h2>
        <IconButton label="Add account" onClick={onAdd}>
          <IconPlus />
        </IconButton>
      </div>
      <ul className="rail-list">
        {accounts.map((a) => {
          const active = a.id === account?.id
          return (
            <li key={a.id}>
              <button type="button" className="rail-item" aria-label={`${a.name}, ${a.address}`} aria-current={active || undefined} onClick={() => selectAccount(a.id)} onDoubleClick={() => onManage(a)}>
                <Identicon address={a.address} />
                <span className="rail-text">
                  <span className="rail-name">{a.name}</span>
                  <span className="rail-addr mono">{shortAddress(a.address, 5, 4)}</span>
                </span>
                {active && trx !== null ? <span className="rail-bal">{formatAmount(trx, TRX_DECIMALS, 2)}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="rail-manage text-link" onClick={() => account && onManage(account)}>
        Manage {account?.name}
      </button>
    </nav>
  )
}

// ---------------------------------------------------------------- slab

function Slab({ account, chain, onSend, onReceive, onSign }: { account: Account; chain: ChainData; onSend: () => void; onReceive: () => void; onSign: () => void }) {
  const { network } = useWallet()
  const empty = chain.trx === 0n && (chain.holdings ?? []).every((h) => !h.balance)
  const [whole, frac] = chain.trx === null ? [null, null] : formatAmount(chain.trx, TRX_DECIMALS, 6).split('.')

  return (
    <section className="slab" aria-label={`${account.name} on ${network.name}`}>
      {network.kind === 'testnet' ? (
        <div className="slab-tape">
          <span>{network.name} test network. Tokens have no real value.</span>
        </div>
      ) : (
        <div className="slab-tape slab-tape-main">
          <span>Mainnet. Transactions move real funds.</span>
        </div>
      )}
      <div className="slab-body">
        <div className="slab-meta">
          <span className="slab-account">{account.name}</span>
          <span className="slab-path mono">{account.path}</span>
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
          <a className="mono" href={addressUrl(network, account.address)} target="_blank" rel="noreferrer" title="View on TRONSCAN">
            {account.address}
          </a>
          <CopyButton value={account.address} label="Copy address" toastText="Address copied" />
        </div>

        <div className="slab-actions">
          <button type="button" className="slab-action" onClick={onSend}>
            <IconSend />
            Send
          </button>
          <button type="button" className="slab-action" onClick={onReceive}>
            <IconReceive />
            Receive
          </button>
          <button type="button" className="slab-action" onClick={onSign}>
            <IconSign />
            Sign
          </button>
          {network.faucet && empty ? (
            <a className="slab-action slab-action-faucet" href={network.faucet.url} target="_blank" rel="noreferrer">
              <IconDrop />
              Get test TRX
            </a>
          ) : null}
        </div>
      </div>
      <ResourceStrip chain={chain} network={network} />
    </section>
  )
}
