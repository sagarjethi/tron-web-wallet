import { useEffect, useRef, useState } from 'react'
import { addressUrl, contractUrl, NETWORKS, NETWORK_ORDER, txUrl, type NetworkId, type TokenPreset } from '../lib/networks'
import type { ActivityItem, Asset } from '../lib/tron'
import { formatAmount, shortAddress, TRX_DECIMALS } from '../lib/units'
import { useChainData, type ChainData } from '../state/chain'
import { useWallet, type Account } from '../state/wallet-context'
import { IconArrowIn, IconArrowOut, IconChevron, IconDrop, IconExternal, IconLock, IconPlus, IconReceive, IconRefresh, IconSend, IconSettings, IconSign, TronMark } from '../ui/icons'
import { Identicon } from '../ui/Identicon'
import { Button, CopyButton, IconButton, Notice } from '../ui/kit'
import { AccountSheet, AddAccountSheet } from './AccountSheets'
import { ReceiveSheet } from './ReceiveSheet'
import { SendSheet } from './SendSheet'
import { SettingsSheet } from './SettingsSheet'
import { SignSheet } from './SignSheet'
import { AddTokenSheet } from './TokenSheets'

type Open = null | { kind: 'send'; asset?: Asset } | { kind: 'receive' } | { kind: 'sign' } | { kind: 'add-account' } | { kind: 'account'; account: Account } | { kind: 'add-token' } | { kind: 'settings' }

export function Wallet() {
  const w = useWallet()
  const account = w.account!
  const chain = useChainData(w.network, account.address, w.tokens)
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
            <Assets chain={chain} onSend={(asset) => setOpen({ kind: 'send', asset })} onAddToken={() => setOpen({ kind: 'add-token' })} />
            <Activity chain={chain} address={account.address} />
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
  const empty = chain.trx === 0n && chain.tokens.every((t) => !t.balance)
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
      {chain.activated === false ? (
        <p className="slab-resources slab-inactive">Not active on {network.name} yet. The account activates when it receives its first TRX.</p>
      ) : chain.resources ? (
        <dl className="slab-resources">
          <div>
            <dt>Free bandwidth</dt>
            <dd>{chain.resources.freeBandwidth.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Staked bandwidth</dt>
            <dd>{chain.resources.stakedBandwidth.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Energy</dt>
            <dd>{chain.resources.energy.toLocaleString('en-US')}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------- assets

function Assets({ chain, onSend, onAddToken }: { chain: ChainData; onSend: (a: Asset) => void; onAddToken: () => void }) {
  const { network } = useWallet()
  const presetSet = new Set(network.tokens.map((t) => t.contract))
  return (
    <section className="panel" aria-labelledby="assets-h">
      <div className="panel-head">
        <h2 id="assets-h">Assets</h2>
        <Button variant="ghost" size="sm" onClick={onAddToken}>
          <IconPlus /> Add token
        </Button>
      </div>
      <ul className="assets">
        <AssetRow symbol="TRX" name="TRON" balance={chain.trx} decimals={TRX_DECIMALS} onSend={() => onSend({ kind: 'trx' })} />
        {chain.tokens.map(({ token, balance, error }) => (
          <AssetRow key={token.contract} symbol={token.symbol} name={token.name} balance={balance} decimals={token.decimals} error={error} token={token} verified={presetSet.has(token.contract)} onSend={() => onSend({ kind: 'trc20', token })} />
        ))}
      </ul>
    </section>
  )
}

function AssetRow({ symbol, name, balance, decimals, error, token, verified, onSend }: { symbol: string; name: string; balance: bigint | null; decimals: number; error?: string; token?: TokenPreset; verified?: boolean; onSend: () => void }) {
  const { network } = useWallet()
  return (
    <li className="asset">
      <span className="asset-glyph" aria-hidden>
        {symbol.slice(0, 1)}
      </span>
      <span className="asset-id">
        <span className="asset-symbol">
          {symbol}
          {token && verified ? <span className="asset-tag">Verified</span> : null}
          {token && !verified ? <span className="asset-tag asset-tag-custom">Custom</span> : null}
        </span>
        <span className="asset-name">
          {token ? (
            <a href={contractUrl(network, token.contract)} target="_blank" rel="noreferrer" className="mono">
              {shortAddress(token.contract, 6, 6)}
            </a>
          ) : (
            name
          )}
        </span>
      </span>
      <span className="asset-bal">{balance === null ? error ? <span className="asset-err" title={error}>Unavailable</span> : <span className="skeleton" /> : formatAmount(balance, decimals, 6)}</span>
      <Button variant="ghost" size="sm" className="asset-send" onClick={onSend} disabled={!balance}>
        Send
      </Button>
    </li>
  )
}

// ---------------------------------------------------------------- activity

const ACTIVITY_LIMIT = 20

const timeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function Activity({ chain, address }: { chain: ChainData; address: string }) {
  const { network } = useWallet()
  return (
    <section className="panel" aria-labelledby="activity-h">
      <div className="panel-head">
        <h2 id="activity-h">Activity</h2>
        <IconButton label="Refresh" onClick={chain.refresh}>
          <IconRefresh />
        </IconButton>
      </div>
      {chain.activityError ? <Notice tone="warn">{chain.activityError}</Notice> : null}
      {chain.activity === null ? (
        <div className="activity-empty">
          <span className="skeleton" style={{ width: '60%' }} />
          <span className="skeleton" style={{ width: '40%' }} />
        </div>
      ) : chain.activity.length === 0 ? (
        <div className="activity-empty">
          <p>No transactions on {network.name} yet.</p>
          <p className="muted">Share your address or use the faucet to receive your first TRX.</p>
        </div>
      ) : (
        <ul className="activity">
          {chain.activity.slice(0, ACTIVITY_LIMIT).map((item) => (
            <ActivityRow key={`${item.txid}-${item.symbol}-${item.counterparty}`} item={item} self={address} />
          ))}
        </ul>
      )}
      <a className="text-link panel-foot" href={addressUrl(network, address)} target="_blank" rel="noreferrer">
        {chain.activity && chain.activity.length > ACTIVITY_LIMIT ? 'Older transactions on TRONSCAN' : 'Full history on TRONSCAN'} <IconExternal />
      </a>
    </section>
  )
}

function ActivityRow({ item }: { item: ActivityItem; self: string }) {
  const { network } = useWallet()
  const incoming = item.direction === 'in'
  const title = item.amount > 0n || item.symbol ? `${incoming ? 'Received' : item.direction === 'self' ? 'Sent to self' : 'Sent'} ${item.symbol}` : item.label
  return (
    <li>
      <a className="act" href={txUrl(network, item.txid)} target="_blank" rel="noreferrer" data-dir={item.direction} data-failed={item.failed || undefined}>
        <span className="act-icon" aria-hidden>
          {incoming ? <IconArrowIn /> : <IconArrowOut />}
        </span>
        <span className="act-main">
          <span className="act-title">
            {item.label === 'Approval' ? `Approved ${item.symbol}` : title}
            {item.failed ? <span className="act-failed">Failed</span> : null}
          </span>
          <span className="act-sub">
            <span className="mono">{shortAddress(item.counterparty, 5, 5)}</span>
            <span>{timeFmt.format(item.timestamp)}</span>
          </span>
        </span>
        {item.symbol ? (
          <span className="act-amount">
            {incoming ? '+' : item.direction === 'out' ? '-' : ''}
            {formatAmount(item.amount, item.decimals, 4)}
          </span>
        ) : null}
      </a>
    </li>
  )
}
