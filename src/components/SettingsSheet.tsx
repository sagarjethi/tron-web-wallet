import { useState, type FormEvent } from 'react'
import { useWallet } from '../state/wallet-context'
import { Button, CopyButton, Field, Notice, Sheet } from '../ui/kit'
import { useEphemeralSecret } from '../ui/toast'

const LOCK_OPTIONS = [5, 15, 30, 60, 0]

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const w = useWallet()
  const [revealPassword, setRevealPassword] = useState('')
  const [phrase, setPhrase] = useEphemeralSecret()
  const [revealError, setRevealError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetText, setResetText] = useState('')

  const reveal = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setRevealError(null)
    try {
      const s = await w.verifyPassword(revealPassword)
      setPhrase(s.mnemonic)
      setRevealPassword('')
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Settings">
      <section className="settings-group">
        <h3>Auto-lock</h3>
        <div className="chips">
          {LOCK_OPTIONS.map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={w.autoLockMinutes === m} onClick={() => w.setAutoLockMinutes(m)}>
              {m === 0 ? 'Never' : `${m} min`}
            </button>
          ))}
        </div>
        <p className="field-hint">Locks after this long without interaction. The phrase is cleared from memory when locked.</p>
      </section>

      <section className="settings-group">
        <h3>Recovery phrase</h3>
        {phrase ? (
          <>
            <Notice tone="danger">Anyone who sees these words can take every account in this wallet. They hide again after a minute.</Notice>
            <div className="with-action secret-box">
              <span className="mono">{phrase}</span>
              <CopyButton value={phrase} label="Copy phrase" toastText="Phrase copied" sensitive />
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPhrase(null)}>
              Hide phrase
            </Button>
          </>
        ) : (
          <form className="stack-sm" onSubmit={reveal} noValidate>
            <Field label="Password" error={revealError}>
              {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={revealPassword} onChange={(e) => setRevealPassword(e.target.value)} />}
            </Field>
            <Button type="submit" size="sm" busy={busy} disabled={!revealPassword}>
              Show recovery phrase
            </Button>
          </form>
        )}
      </section>

      <section className="settings-group">
        <h3>Remove wallet from this browser</h3>
        <p className="muted">Deletes the encrypted phrase and account list here. Funds stay on chain and come back when you import the phrase.</p>
        <Field label='Type "remove" to confirm'>
          {(p) => <input {...p} className="input" autoComplete="off" value={resetText} onChange={(e) => setResetText(e.target.value)} />}
        </Field>
        <Button size="sm" variant="danger" disabled={resetText.trim().toLowerCase() !== 'remove'} onClick={w.resetWallet}>
          Remove wallet
        </Button>
      </section>

      {import.meta.env.DEV ? (
        <p className="field-hint">
          <a className="text-link" href="#kit">
            Open the component kit
          </a>
        </p>
      ) : null}
    </Sheet>
  )
}
