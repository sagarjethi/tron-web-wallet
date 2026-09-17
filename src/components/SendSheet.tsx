import { useEffect, useEffectEvent, useState, type FormEvent } from 'react'
import { txUrl } from '../lib/networks'
import { assetDecimals, assetSymbol, checkConfirmation, describeError, getClient, isTronAddress, prepareSend, signAndBroadcast, type Asset, type Confirmation, type PreparedSend } from '../lib/tron'
import { formatAmount, formatBalance, fromBaseUnits, shortAddress, toBaseUnits, TRX_DECIMALS } from '../lib/units'
import type { ChainData } from '../state/chain'
import { useWallet } from '../state/wallet-context'
import { IconCheck, IconExternal, IconWarn } from '../ui/icons'
import { Button, Field, Notice, Sheet, Spinner } from '../ui/kit'
import { holdingToToken } from '../lib/portfolio'

type Stage = { kind: 'form' } | { kind: 'review'; prepared: PreparedSend } | { kind: 'sent'; txid: string; prepared: PreparedSend; confirmation: Confirmation }

const assetKey = (a: Asset) => (a.kind === 'trx' ? 'trx' : a.token.contract)

export function SendSheet({ onClose, initialAsset, chain }: { onClose: () => void; initialAsset?: Asset; chain: ChainData }) {
  const { network, account, accounts, privateKeyFor } = useWallet()
  const [asset, setAsset] = useState<Asset>(initialAsset ?? { kind: 'trx' })
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const tw = getClient(network)
  const decimals = assetDecimals(asset)
  const symbol = assetSymbol(asset)
  // Every TRC20 token the address holds, except look-alikes of verified tokens.
  const sendable = (chain.holdings ?? []).filter((h) => h.kind === 'trc20' && h.trust !== 'lookalike')
  const selected = asset.kind === 'trc20' ? sendable.find((h) => h.id === asset.token.contract) : undefined
  const balance = asset.kind === 'trx' ? chain.trx : (selected?.balance ?? null)

  // Poll for confirmation after broadcast.
  const sentTxid = stage.kind === 'sent' && stage.confirmation.status === 'pending' ? stage.txid : null
  const lookup = useEffectEvent((txid: string) => checkConfirmation(tw, txid))
  const settled = useEffectEvent((confirmation: Confirmation) => {
    setStage((s) => (s.kind === 'sent' ? { ...s, confirmation } : s))
    chain.refresh()
  })
  useEffect(() => {
    if (!sentTxid) return
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      attempts++
      try {
        const confirmation = await lookup(sentTxid)
        if (cancelled) return
        if (confirmation.status !== 'pending') return settled(confirmation)
      } catch {
        // Transient lookup failure; keep polling.
      }
      if (!cancelled && attempts < 40) setTimeout(poll, 3000)
    }
    const id = setTimeout(poll, 3000)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [sentTxid])

  if (!account) return null

  const toError = touched && to && !isTronAddress(to.trim()) ? 'Enter a TRON address. It starts with T and has 34 characters.' : null
  let amountError: string | null = null
  let parsed: bigint | null = null
  if (amount) {
    try {
      parsed = toBaseUnits(amount, decimals)
      if (parsed === 0n) amountError = 'Amount must be greater than zero'
      else if (balance !== null && parsed > balance) amountError = `You have ${formatAmount(balance, decimals)} ${symbol}`
    } catch (e) {
      amountError = e instanceof Error ? e.message : String(e)
    }
  }

  const review = async (e?: FormEvent, override?: bigint) => {
    e?.preventDefault()
    setTouched(true)
    const value = override ?? parsed
    if (!isTronAddress(to.trim()) || value === null || (amountError && override === undefined)) return
    setBusy(true)
    setError(null)
    try {
      const prepared = await prepareSend(tw, network, account.address, to.trim(), value, asset)
      setStage({ kind: 'review', prepared })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (stage.kind !== 'review') return
    setBusy(true)
    setError(null)
    try {
      const txid = await signAndBroadcast(tw, stage.prepared, privateKeyFor(account))
      setStage({ kind: 'sent', txid, prepared: stage.prepared, confirmation: { status: 'pending' } })
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const ownAccount = (address: string) => accounts.find((a) => a.address === address)

  // ------------------------------------------------ form
  if (stage.kind === 'form') {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`Send on ${network.name}`}
        footer={
          <Button variant="net" type="submit" form="send-form" busy={busy} disabled={!to || !amount || Boolean(amountError)}>
            Review
          </Button>
        }
      >
        <form id="send-form" className="stack" onSubmit={review} noValidate>
          <Field label="Asset">
            {(p) => (
              <select
                {...p}
                className="select input"
                value={assetKey(asset)}
                onChange={(e) => {
                  const h = sendable.find((x) => x.id === e.target.value)
                  setAsset(h ? { kind: 'trc20', token: holdingToToken(h) } : { kind: 'trx' })
                  setError(null)
                }}
              >
                <option value="trx">TRX{chain.trx !== null ? `, ${formatBalance(chain.trx, TRX_DECIMALS)}` : ''}</option>
                {sendable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.symbol}
                    {h.trust === 'unverified' ? ' (unverified)' : ''}
                    {h.balance !== null ? `, ${formatBalance(h.balance, h.decimals)}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Recipient" error={toError} hint={accounts.length > 1 ? 'Or pick one of your accounts below.' : undefined}>
            {(p) => <input {...p} className="input mono" placeholder="T…" autoComplete="off" autoCapitalize="none" spellCheck={false} value={to} onChange={(e) => setTo(e.target.value)} onBlur={() => setTouched(true)} />}
          </Field>
          {accounts.length > 1 ? (
            <div className="chips">
              {accounts
                .filter((a) => a.id !== account.id)
                .map((a) => (
                  <button key={a.id} type="button" className="chip" aria-pressed={to === a.address} onClick={() => setTo(a.address)}>
                    {a.name}
                  </button>
                ))}
            </div>
          ) : null}

          <Field label="Amount" aside={balance !== null ? `Balance ${formatBalance(balance, decimals)} ${symbol}` : undefined} error={amountError}>
            {(p) => (
              <div className="input-group">
                <input {...p} className="input amount-input" inputMode="decimal" placeholder="0.00" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
                <span className="input-suffix">
                  <Button size="sm" variant="ghost" disabled={!balance} onClick={() => balance && setAmount(fromBaseUnits(balance, decimals))}>
                    Max
                  </Button>
                </span>
              </div>
            )}
          </Field>

          {error ? <Notice tone="danger">{error}</Notice> : null}
        </form>
      </Sheet>
    )
  }

  // ------------------------------------------------ review
  if (stage.kind === 'review') {
    const p = stage.prepared
    const est = p.estimate
    const trxBalance = chain.trx ?? 0n
    const trxNeeded = est.totalSun + (p.asset.kind === 'trx' ? p.amount : 0n)
    const shortBy = trxNeeded > trxBalance ? trxNeeded - trxBalance : 0n
    const maxAfterFees = p.asset.kind === 'trx' ? trxBalance - est.totalSun : 0n
    const recipientName = ownAccount(p.to)?.name

    return (
      <Sheet
        open
        onClose={onClose}
        title="Review transfer"
        footer={
          <>
            <Button onClick={() => setStage({ kind: 'form' })} disabled={busy}>
              Edit
            </Button>
            <Button variant={network.kind === 'mainnet' ? 'danger' : 'net'} onClick={confirm} busy={busy} disabled={shortBy > 0n}>
              Send {symbol}
            </Button>
          </>
        }
      >
        {network.kind === 'mainnet' ? <Notice tone="danger">This is mainnet. The transfer moves real funds and cannot be reversed.</Notice> : null}
        {selected?.trust === 'unverified' ? (
          <Notice tone="warn">This token is not verified by this wallet. Sending it runs the token contract's own code, which can behave unexpectedly. Check the contract on TRONSCAN first.</Notice>
        ) : null}

        <div className="review-amount">
          <span className="review-value">{formatAmount(p.amount, decimals, decimals)}</span>
          <span className="review-symbol">{symbol}</span>
        </div>

        <dl className="kv">
          <div>
            <dt>From</dt>
            <dd>
              {account.name} <span className="mono muted">{shortAddress(p.from, 6, 6)}</span>
            </dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>
              {recipientName ? `${recipientName} ` : ''}
              <span className="mono break">{p.to}</span>
            </dd>
          </div>
          {p.asset.kind === 'trc20' ? (
            <div>
              <dt>Token contract</dt>
              <dd className="mono break">{p.asset.token.contract}</dd>
            </div>
          ) : null}
          <div>
            <dt>Network</dt>
            <dd>{network.name}</dd>
          </div>
        </dl>

        <div className="fees">
          <h3>Estimated network fee</h3>
          <dl className="kv kv-tight">
            <div>
              <dt>Bandwidth</dt>
              <dd>
                {est.activationSun > 0n ? 'Included in activation' : est.bandwidthBurnSun === 0n ? 'Covered by your bandwidth' : `${formatAmount(est.bandwidthBurnSun, TRX_DECIMALS)} TRX`}
                <span className="muted"> ({est.bandwidthBytes} bytes)</span>
              </dd>
            </div>
            {p.asset.kind === 'trc20' ? (
              <div>
                <dt>Energy</dt>
                <dd>
                  {est.energyBurnSun === 0n ? 'Covered by staked energy' : `${formatAmount(est.energyBurnSun, TRX_DECIMALS)} TRX`}
                  <span className="muted"> ({est.energyUsed.toLocaleString('en-US')} energy)</span>
                </dd>
              </div>
            ) : null}
            {est.activationSun > 0n ? (
              <div>
                <dt>New account activation</dt>
                <dd>{formatAmount(est.activationSun, TRX_DECIMALS)} TRX</dd>
              </div>
            ) : null}
            <div className="kv-total">
              <dt>Total fee</dt>
              <dd>{formatAmount(est.totalSun, TRX_DECIMALS)} TRX</dd>
            </div>
          </dl>
          {p.feeLimitSun ? <p className="field-hint">Fee limit set to {formatAmount(BigInt(p.feeLimitSun), TRX_DECIMALS)} TRX. You only pay for energy actually used.</p> : null}
        </div>

        {!p.recipientActivated && p.asset.kind === 'trx' ? <Notice tone="info">This address has never been used on {network.name}. Sending TRX activates it.</Notice> : null}
        {!p.recipientActivated && p.asset.kind === 'trc20' ? <Notice tone="warn">This address has never been used on {network.name}. Token transfers to new addresses use more energy.</Notice> : null}

        {shortBy > 0n ? (
          <Notice tone="danger">
            You need {formatAmount(shortBy, TRX_DECIMALS)} more TRX to cover {p.asset.kind === 'trx' ? 'the amount and fee' : 'the network fee'}.
            {p.asset.kind === 'trx' && maxAfterFees > 0n ? (
              <>
                {' '}
                <button
                  type="button"
                  className="text-link inline"
                  onClick={() => {
                    setAmount(fromBaseUnits(maxAfterFees, TRX_DECIMALS))
                    void review(undefined, maxAfterFees)
                  }}
                >
                  Send {formatAmount(maxAfterFees, TRX_DECIMALS)} TRX instead
                </button>
              </>
            ) : null}
          </Notice>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Sheet>
    )
  }

  // ------------------------------------------------ sent
  const c = stage.confirmation
  return (
    <Sheet
      open
      onClose={onClose}
      title={c.status === 'confirmed' ? 'Transfer confirmed' : c.status === 'failed' ? 'Transfer failed' : 'Transfer sent'}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={`result result-${c.status}`}>
        <span className="result-icon">{c.status === 'pending' ? <Spinner /> : c.status === 'confirmed' ? <IconCheck /> : <IconWarn />}</span>
        <p className="result-title">
          {formatAmount(stage.prepared.amount, decimals, decimals)} {symbol} to <span className="mono">{shortAddress(stage.prepared.to, 6, 6)}</span>
        </p>
        <p className="muted">
          {c.status === 'pending' ? 'Waiting for the network to include it in a block. This usually takes a few seconds.' : null}
          {c.status === 'confirmed' ? `Included in block ${c.block.toLocaleString('en-US')}. Fee paid: ${formatAmount(c.feeSun, TRX_DECIMALS)} TRX.` : null}
          {c.status === 'failed' ? `The transaction was included but did not succeed: ${c.reason}` : null}
        </p>
      </div>
      <a className="btn btn-secondary btn-block" href={txUrl(network, stage.txid)} target="_blank" rel="noreferrer">
        View on TRONSCAN <IconExternal />
      </a>
      <p className="field-hint mono break">{stage.txid}</p>
    </Sheet>
  )
}
