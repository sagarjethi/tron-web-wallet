import { addressUrl, contractUrl, txUrl, type Network } from '../lib/networks'
import { canSend, holdingToToken, type Holding, type Trust } from '../lib/portfolio'
import type { ActivityItem, Asset } from '../lib/tron'
import { formatBalance, fromBaseUnits, shortAddress, TRX_DECIMALS } from '../lib/units'
import type { ChainData } from '../state/chain'
import { useState } from 'react'
import { IconArrowIn, IconArrowOut, IconChevron, IconExternal, IconPlus, IconRefresh } from '../ui/icons'
import { Button, IconButton, Notice, Spinner } from '../ui/kit'

/** Shared by the wallet and the view-only address lookup; nothing here needs keys. */

const COLLAPSE_UNVERIFIED_ABOVE = 8

const TRUST_LABEL: Record<Trust, string> = {
  verified: 'Verified',
  custom: 'Custom',
  unverified: 'Unverified',
  lookalike: 'Look-alike',
}

const TRUST_TITLE: Record<Trust, string> = {
  verified: 'Contract listed by this wallet for this network',
  custom: 'Token you added by contract address',
  unverified: 'Found on chain. Anyone can create a token; check the contract before trusting it.',
  lookalike: 'Its name imitates a well-known token. Likely a scam: do not interact with it.',
}

// ---------------------------------------------------------------- resources

export function ResourceStrip({ chain, network }: { chain: ChainData; network: Network }) {
  if (chain.activated === false) {
    return <p className="slab-resources slab-inactive">Not active on {network.name} yet. An address activates when it receives its first TRX.</p>
  }
  if (!chain.resources) return null
  return (
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
  )
}

// ---------------------------------------------------------------- assets

export function AssetsPanel({ chain, network, onSend, onAddToken }: { chain: ChainData; network: Network; onSend?: (a: Asset) => void; onAddToken?: () => void }) {
  const holdings = chain.holdings
  const primary = holdings?.filter((h) => h.trust === 'verified' || h.trust === 'custom') ?? []
  const others = holdings?.filter((h) => h.trust === 'unverified' || h.trust === 'lookalike') ?? []
  const lookalikes = others.filter((h) => h.trust === 'lookalike').length
  // Unverified tokens are often spam airdrops: shown by default when few, collapsed when many.
  const [showOthers, setShowOthers] = useState<boolean | null>(null)
  const othersOpen = showOthers ?? others.length <= COLLAPSE_UNVERIFIED_ABOVE
  // Look-alikes are shown for transparency but never counted as real holdings.
  const tokenCount = holdings?.filter((h) => h.trust !== 'lookalike' && (h.balance ?? 0n) > 0n).length ?? 0
  return (
    <section className="panel" aria-labelledby="assets-h">
      <div className="panel-head">
        <h2 id="assets-h">
          Assets
          {holdings ? <span className="panel-count">{tokenCount + (chain.trx ? 1 : 0)}</span> : null}
        </h2>
        {onAddToken ? (
          <Button variant="ghost" size="sm" onClick={onAddToken}>
            <IconPlus /> Add token
          </Button>
        ) : null}
      </div>
      <ul className="assets">
        <li className="asset">
          <span className="asset-glyph asset-glyph-trx" aria-hidden>
            T
          </span>
          <span className="asset-id">
            <span className="asset-symbol">TRX</span>
            <span className="asset-name">TRON</span>
          </span>
          <Amount value={chain.trx} decimals={TRX_DECIMALS} error={chain.error ?? undefined} />
          {onSend ? (
            <Button variant="ghost" size="sm" className="asset-send" onClick={() => onSend({ kind: 'trx' })} disabled={!chain.trx}>
              Send
            </Button>
          ) : null}
        </li>
        {holdings === null ? (
          chain.error ? null : (
            <li className="asset asset-loading">
              <span className="asset-glyph" aria-hidden />
              <span className="asset-id">
                <span className="skeleton" style={{ width: '40%' }} />
                <span className="skeleton" style={{ width: '60%', marginTop: 6 }} />
              </span>
              <span className="asset-bal">
                <span className="skeleton" />
              </span>
            </li>
          )
        ) : (
          <>
            {primary.map((h) => (
              <HoldingRow key={`${h.kind}:${h.id}`} holding={h} network={network} onSend={onSend} />
            ))}
            {chain.discovering && others.length === 0 ? (
              <li className="asset-status" role="status">
                <Spinner /> Finding other tokens this address holds
              </li>
            ) : null}
            {others.length > 0 ? (
              <li className="asset-group">
                <button type="button" aria-expanded={othersOpen} onClick={() => setShowOthers(!othersOpen)}>
                  <IconChevron className="asset-group-chev" />
                  <span>Unverified tokens</span>
                  <span className="panel-count">{others.length}</span>
                  {lookalikes > 0 ? <span className="asset-tag asset-tag-lookalike">{lookalikes} look-alike</span> : null}
                  <span className="asset-group-hint">{othersOpen ? 'Hide' : 'Show'}</span>
                </button>
              </li>
            ) : null}
            {othersOpen ? others.map((h) => <HoldingRow key={`${h.kind}:${h.id}`} holding={h} network={network} onSend={onSend} />) : null}
          </>
        )}
      </ul>
      {chain.omittedTokens > 0 ? (
        <p className="field-hint panel-note">
          {chain.omittedTokens} more {chain.omittedTokens === 1 ? 'token is' : 'tokens are'} not shown. This address holds many unverified tokens, often spam airdrops.
        </p>
      ) : null}
    </section>
  )
}

function HoldingRow({ holding: h, network, onSend }: { holding: Holding; network: Network; onSend?: (a: Asset) => void }) {
  return (
    <li className="asset" data-trust={h.trust}>
      <span className="asset-glyph" aria-hidden>
        {h.symbol.slice(0, 1).toUpperCase()}
      </span>
      <span className="asset-id">
        <span className="asset-symbol">
          <span className="asset-symbol-text" title={h.name || h.symbol}>
            {h.symbol}
          </span>
          <span className={`asset-tag asset-tag-${h.trust}`} title={TRUST_TITLE[h.trust]}>
            {TRUST_LABEL[h.trust]}
          </span>
          {h.kind === 'trc10' ? <span className="asset-tag asset-tag-kind">TRC10</span> : null}
        </span>
        <span className="asset-name">
          {h.kind === 'trc20' ? (
            <a href={contractUrl(network, h.id)} target="_blank" rel="noreferrer" className="mono" title="View contract on TRONSCAN">
              {shortAddress(h.id, 6, 6)}
            </a>
          ) : (
            <a href={`${network.explorer}/token/${h.id}`} target="_blank" rel="noreferrer" className="mono" title="View token on TRONSCAN">
              ID {h.id}
            </a>
          )}
        </span>
      </span>
      <Amount value={h.balance} decimals={h.decimals} error={h.error} />
      {onSend ? (
        <Button
          variant="ghost"
          size="sm"
          className="asset-send"
          onClick={() => onSend({ kind: 'trc20', token: holdingToToken(h) })}
          disabled={!canSend(h)}
          title={h.kind === 'trc10' ? 'Sending TRC10 tokens is not supported yet' : h.trust === 'lookalike' ? 'Look-alike tokens cannot be sent from this wallet' : undefined}
        >
          Send
        </Button>
      ) : null}
    </li>
  )
}

function Amount({ value, decimals, error }: { value: bigint | null; decimals: number; error?: string }) {
  if (value === null) {
    return <span className="asset-bal">{error ? <span className="asset-err" title={error}>Unavailable</span> : <span className="skeleton" />}</span>
  }
  const exact = fromBaseUnits(value, decimals)
  return (
    <span className="asset-bal" title={exact}>
      {formatBalance(value, decimals)}
    </span>
  )
}

// ---------------------------------------------------------------- activity

const ACTIVITY_LIMIT = 20

const timeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function ActivityPanel({ chain, network, address, emptyHint }: { chain: ChainData; network: Network; address: string; emptyHint: string }) {
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
        chain.activityError ? null : (
          <div className="activity-empty">
            <span className="skeleton" style={{ width: '60%' }} />
            <span className="skeleton" style={{ width: '40%' }} />
          </div>
        )
      ) : chain.activity.length === 0 ? (
        <div className="activity-empty">
          <p>No transactions on {network.name} yet.</p>
          <p className="muted">{emptyHint}</p>
        </div>
      ) : (
        <ul className="activity">
          {chain.activity.slice(0, ACTIVITY_LIMIT).map((item) => (
            <ActivityRow key={`${item.txid}-${item.symbol}-${item.counterparty}`} item={item} network={network} />
          ))}
        </ul>
      )}
      <a className="text-link panel-foot" href={addressUrl(network, address)} target="_blank" rel="noreferrer">
        {chain.activity && chain.activity.length > ACTIVITY_LIMIT ? 'Older transactions on TRONSCAN' : 'Full history on TRONSCAN'} <IconExternal />
      </a>
    </section>
  )
}

function ActivityRow({ item, network }: { item: ActivityItem; network: Network }) {
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
          <span className="act-amount" title={fromBaseUnits(item.amount, item.decimals)}>
            {incoming ? '+' : item.direction === 'out' ? '-' : ''}
            {formatBalance(item.amount, item.decimals)}
          </span>
        ) : null}
      </a>
    </li>
  )
}
