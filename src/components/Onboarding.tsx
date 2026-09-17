import { useState, type FormEvent } from 'react'
import { createMnemonic, isValidMnemonic, mnemonicWordlist, normalizeMnemonic } from '../lib/derivation'
import { NETWORKS, NETWORK_ORDER } from '../lib/networks'
import { WrongPasswordError } from '../lib/vault'
import { useWallet } from '../state/wallet-context'
import { IconBack, IconCopy, IconShield, TronMark } from '../ui/icons'
import { Button, Field, Notice, Segmented, Sheet } from '../ui/kit'
import { useCopy } from '../ui/toast'

const MIN_PASSWORD = 8

function Brand() {
  return (
    <div className="brand">
      <TronMark className="brand-mark" />
      <span>Tron Wallet</span>
    </div>
  )
}

function NetworkLegend() {
  return (
    <ul className="legend" aria-label="Supported networks">
      {NETWORK_ORDER.map((id) => {
        const n = NETWORKS[id]
        return (
          <li key={id} data-network={id}>
            <span className="legend-swatch" aria-hidden />
            <span className="legend-name">{n.name}</span>
            <span className="legend-desc">{id === 'shasta' ? 'Test network, selected by default' : id === 'nile' ? 'Test network' : 'Real TRX and tokens'}</span>
          </li>
        )
      })}
    </ul>
  )
}

type Flow = { kind: 'choose' } | { kind: 'create' } | { kind: 'import' }

export function Onboarding() {
  const [flow, setFlow] = useState<Flow>({ kind: 'choose' })
  return (
    <div className="onboard" data-network="shasta">
      <section className="onboard-intro">
        <Brand />
        <div className="onboard-copy">
          <h1>Hold, send and sign on TRON.</h1>
          <p className="lede">
            A self-custody web wallet that starts on the Shasta test network. Your recovery phrase is encrypted with your password and stays in this browser.
          </p>
        </div>
        <NetworkLegend />
        <ul className="facts">
          <li>BIP-44 accounts on m/44'/195'/0'/0/n, plus any custom path</li>
          <li>TRX and TRC20 balances read straight from the token contracts</li>
          <li>Sign and verify messages with TRON's message format</li>
        </ul>
      </section>
      <section className="onboard-panel">
        {flow.kind === 'choose' ? <Choose onPick={setFlow} /> : null}
        {flow.kind === 'create' ? <CreateFlow onBack={() => setFlow({ kind: 'choose' })} /> : null}
        {flow.kind === 'import' ? <ImportFlow onBack={() => setFlow({ kind: 'choose' })} /> : null}
      </section>
    </div>
  )
}

function Choose({ onPick }: { onPick: (f: Flow) => void }) {
  return (
    <div className="panel-card">
      <h2>Get started</h2>
      <p className="muted">Create a fresh wallet, or bring one you already have from TronLink, Trust Wallet or any BIP-39 wallet.</p>
      <div className="stack-sm">
        <Button variant="net" block onClick={() => onPick({ kind: 'create' })}>
          Create a new wallet
        </Button>
        <Button variant="secondary" block onClick={() => onPick({ kind: 'import' })}>
          Import a recovery phrase
        </Button>
      </div>
    </div>
  )
}

function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="steps" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} aria-current={i === current ? 'step' : undefined} data-done={i < current || undefined}>
          <span className="step-n">{i + 1}</span>
          <span className="step-l">{l}</span>
        </li>
      ))}
    </ol>
  )
}

function PasswordFields({ password, confirm, setPassword, setConfirm, showErrors }: { password: string; confirm: string; setPassword: (v: string) => void; setConfirm: (v: string) => void; showErrors: boolean }) {
  const tooShort = password.length < MIN_PASSWORD
  const mismatch = confirm !== password
  return (
    <>
      <Field label="Password" hint={`At least ${MIN_PASSWORD} characters. It unlocks the wallet on this device only.`} error={showErrors && tooShort ? `Use at least ${MIN_PASSWORD} characters` : null}>
        {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
      </Field>
      <Field label="Confirm password" error={showErrors && mismatch ? 'Passwords do not match' : null}>
        {(p) => <input {...p} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
    </>
  )
}

function pickPositions(count: number, total: number): number[] {
  const set = new Set<number>()
  const rnd = new Uint32Array(count * 4)
  crypto.getRandomValues(rnd)
  for (const r of rnd) {
    set.add(r % total)
    if (set.size === count) break
  }
  return [...set].sort((a, b) => a - b)
}

function freshPhrase(bits: 128 | 256) {
  const mnemonic = createMnemonic(bits)
  return { mnemonic, positions: pickPositions(3, mnemonic.split(' ').length) }
}

function CreateFlow({ onBack }: { onBack: () => void }) {
  const { createWallet } = useWallet()
  const copy = useCopy()
  const [step, setStep] = useState(0)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [strength, setStrength] = useState<128 | 256>(128)
  const [{ mnemonic, positions }, setPhrase] = useState(() => freshPhrase(128))
  const [revealed, setRevealed] = useState(false)
  const words = mnemonic.split(' ')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    setShowErrors(true)
    if (password.length >= MIN_PASSWORD && password === confirm) setStep(1)
  }

  const changeStrength = (s: '12' | '24') => {
    const bits = s === '24' ? 256 : 128
    setStrength(bits)
    setPhrase(freshPhrase(bits))
    setRevealed(false)
    setAnswers({})
  }

  const allCorrect = positions.every((i) => answers[i]?.trim().toLowerCase() === words[i])

  const finish = async (e: FormEvent) => {
    e.preventDefault()
    if (!allCorrect) {
      setError('One or more words do not match. Check your written copy.')
      return
    }
    setBusy(true)
    try {
      await createWallet(mnemonic, '', password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="panel-card">
      <button type="button" className="back-link" onClick={step === 0 ? onBack : () => setStep(step - 1)}>
        <IconBack /> Back
      </button>
      <h2>Create a new wallet</h2>
      <Steps current={step} labels={['Set a password', 'Save your phrase', 'Confirm it']} />

      {step === 0 ? (
        <form className="stack" onSubmit={submitPassword} noValidate>
          <PasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} showErrors={showErrors} />
          <Button variant="net" block type="submit">
            Continue
          </Button>
        </form>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          <div className="row-between">
            <p className="muted">Write these words down in order. Anyone with them controls the funds.</p>
            <Segmented label="Phrase length" value={strength === 256 ? '24' : '12'} onChange={changeStrength} options={[{ value: '12', label: '12 words' }, { value: '24', label: '24 words' }]} />
          </div>
          <div className={`phrase ${revealed ? '' : 'phrase-hidden'}`} data-count={words.length}>
            <ol>
              {words.map((w, i) => (
                <li key={i}>
                  <span className="phrase-n">{i + 1}</span>
                  {/* Real words enter the DOM only after reveal, out of reach of screen scrapers and extensions. */}
                  <span className="mono">{revealed ? w : 'xxxxxx'.slice(0, 3 + ((i * 7) % 4))}</span>
                </li>
              ))}
            </ol>
            {!revealed ? (
              <button type="button" className="phrase-cover" onClick={() => setRevealed(true)}>
                <IconShield />
                <span>Reveal phrase</span>
                <span className="muted">Make sure nobody can see your screen</span>
              </button>
            ) : null}
          </div>
          <div className="row-between">
            <Button variant="ghost" size="sm" disabled={!revealed} onClick={() => copy(mnemonic, 'Phrase copied', { sensitive: true })}>
              <IconCopy /> Copy
            </Button>
          </div>
          <Button variant="net" block disabled={!revealed} onClick={() => setStep(2)}>
            I wrote it down
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <form className="stack" onSubmit={finish} noValidate>
          <p className="muted">Enter the words at these positions to confirm your copy is correct.</p>
          <div className="confirm-grid">
            {positions.map((i) => (
              <Field key={i} label={`Word ${i + 1}`}>
                {(p) => (
                  <input
                    {...p}
                    className="input mono"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={answers[i] ?? ''}
                    onChange={(e) => {
                      setError(null)
                      setAnswers({ ...answers, [i]: e.target.value })
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button variant="net" block type="submit" busy={busy}>
            Create wallet
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function ImportFlow({ onBack }: { onBack: () => void }) {
  const { createWallet } = useWallet()
  const [phrase, setPhrase] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalized = normalizeMnemonic(phrase)
  const words = normalized ? normalized.split(' ') : []
  const unknown = words.filter((w) => !mnemonicWordlist.includes(w))
  const valid = isValidMnemonic(normalized)
  const phraseError = (() => {
    if (!showErrors && !phrase) return null
    if (unknown.length) return `Not in the BIP-39 word list: ${unknown.slice(0, 3).join(', ')}`
    if (![12, 15, 18, 21, 24].includes(words.length)) return showErrors ? `Recovery phrases have 12 to 24 words. This has ${words.length}.` : null
    if (!valid) return 'The checksum does not match. One word is probably wrong or out of order.'
    return null
  })()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setShowErrors(true)
    if (!valid || password.length < MIN_PASSWORD || password !== confirm) return
    setBusy(true)
    try {
      await createWallet(normalized, passphrase, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="panel-card">
      <button type="button" className="back-link" onClick={onBack}>
        <IconBack /> Back
      </button>
      <h2>Import a recovery phrase</h2>
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Recovery phrase" aside={words.length ? `${words.length} words` : undefined} error={phraseError} hint="Separate words with spaces.">
          {(p) => <textarea {...p} className="textarea mono" rows={4} autoComplete="off" autoCapitalize="none" spellCheck={false} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus />}
        </Field>
        {advanced ? (
          <Field label="BIP-39 passphrase" hint="Only if your original wallet used one. A different passphrase opens a different wallet.">
            {(p) => <input {...p} className="input" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}
          </Field>
        ) : (
          <button type="button" className="text-link" onClick={() => setAdvanced(true)}>
            My wallet uses a BIP-39 passphrase
          </button>
        )}
        <PasswordFields password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} showErrors={showErrors} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button variant="net" block type="submit" busy={busy}>
          Import wallet
        </Button>
      </form>
    </div>
  )
}

export function Unlock() {
  const { unlock, accounts, resetWallet } = useWallet()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [understood, setUnderstood] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) return setError('Enter your password')
    setBusy(true)
    setError(null)
    try {
      await unlock(password)
    } catch (err) {
      setError(err instanceof WrongPasswordError ? err.message : `Could not unlock: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(false)
    }
  }

  return (
    <div className="unlock">
      <form className="unlock-card" onSubmit={submit} noValidate>
        <Brand />
        <div>
          <h1 className="unlock-title">Welcome back</h1>
          <p className="muted">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} on this device
          </p>
        </div>
        <Field label="Password" error={error}>
          {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
        </Field>
        <Button variant="primary" block type="submit" busy={busy}>
          Unlock
        </Button>
        <button type="button" className="text-link center" onClick={() => setResetOpen(true)}>
          Forgot password?
        </button>
      </form>

      <Sheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset this wallet"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={!understood} onClick={resetWallet}>
              Remove wallet
            </Button>
          </>
        }
      >
        <p>Passwords cannot be recovered. Removing the wallet from this browser lets you import your recovery phrase again with a new password.</p>
        <Notice tone="danger">Without the recovery phrase, funds in these accounts are lost for good.</Notice>
        <label className="check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I have my recovery phrase</span>
        </label>
      </Sheet>
    </div>
  )
}
