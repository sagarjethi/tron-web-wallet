import { useState, type FormEvent } from 'react'
import { accountLevelPath, defaultPath, deriveKey, validatePath } from '../lib/derivation'
import { useWallet, type Account } from '../state/wallet-context'
import { Button, CopyButton, Field, Notice, Segmented, Sheet } from '../ui/kit'
import { useEphemeralSecret } from '../ui/toast'
import { useToast } from '../ui/toast'

type Scheme = 'next' | 'account' | 'custom'

export function AddAccountSheet({ onClose }: { onClose: () => void }) {
  const { addAccount, nextDefaultPath, accounts } = useWallet()
  const toast = useToast()
  const [scheme, setScheme] = useState<Scheme>('next')
  const [name, setName] = useState('')
  const [accountIndex, setAccountIndex] = useState(() => {
    const used = new Set(accounts.map((a) => a.path))
    let i = 1
    while (used.has(accountLevelPath(i))) i++
    return String(i)
  })
  const [custom, setCustom] = useState(nextDefaultPath)
  const [error, setError] = useState<string | null>(null)

  const path = scheme === 'next' ? nextDefaultPath() : scheme === 'account' ? (/^\d+$/.test(accountIndex) ? accountLevelPath(Number(accountIndex)) : '') : custom.trim()
  const pathError = scheme === 'next' ? null : scheme === 'account' && !/^\d+$/.test(accountIndex) ? 'Enter a whole number' : validatePath(path)
  const clash = accounts.find((a) => a.path === path)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pathError || clash) return
    try {
      const a = addAccount({ path, name })
      toast(`${a.name} added`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add account"
      footer={
        <Button variant="net" type="submit" form="add-account" disabled={Boolean(pathError || clash)}>
          Add account
        </Button>
      }
    >
      <form id="add-account" className="stack" onSubmit={submit} noValidate>
        <p className="muted">Every account comes from your one recovery phrase. Restoring the phrase restores them all, as long as you use the same paths.</p>
        <Field label="Name" aside="Optional">
          {(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Account ${accounts.length + 1}`} maxLength={32} />}
        </Field>
        <div className="field">
          <span className="field-label">Derivation path</span>
          <Segmented<Scheme>
            label="Derivation scheme"
            value={scheme}
            onChange={setScheme}
            options={[
              { value: 'next', label: 'Next index' },
              { value: 'account', label: 'By account' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        {scheme === 'next' ? <p className="path-preview mono">{path}</p> : null}
        {scheme === 'account' ? (
          <Field label="Account number" hint={`Ledger Live style: ${accountLevelPath(Number(accountIndex) || 0)}`} error={pathError}>
            {(p) => <input {...p} className="input" inputMode="numeric" value={accountIndex} onChange={(e) => setAccountIndex(e.target.value.trim())} />}
          </Field>
        ) : null}
        {scheme === 'custom' ? (
          <Field label="Path" hint={`TronLink uses ${defaultPath(0)} and increments the last number.`} error={pathError}>
            {(p) => <input {...p} className="input mono" spellCheck={false} value={custom} onChange={(e) => setCustom(e.target.value)} />}
          </Field>
        ) : null}
        {clash ? <Notice tone="warn">{clash.name} already uses this path.</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </form>
    </Sheet>
  )
}

export function AccountSheet({ account, onClose }: { account: Account; onClose: () => void }) {
  const { renameAccount, removeAccount, accounts, verifyPassword } = useWallet()
  const toast = useToast()
  const [name, setName] = useState(account.name)
  const [revealStep, setRevealStep] = useState<'idle' | 'password'>('idle')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useEphemeralSecret()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reveal = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const s = await verifyPassword(password)
      setPrivateKey(deriveKey(s.mnemonic, account.path, s.passphrase).privateKey)
      setRevealStep('idle')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={account.name}>
      <form
        className="row-end"
        onSubmit={(e) => {
          e.preventDefault()
          renameAccount(account.id, name)
          toast('Name saved')
        }}
      >
        <Field label="Name">{(p) => <input {...p} className="input" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />}</Field>
        <Button type="submit" disabled={!name.trim() || name === account.name}>
          Save name
        </Button>
      </form>

      <dl className="kv">
        <div>
          <dt>Address</dt>
          <dd className="with-action">
            <span className="mono break">{account.address}</span>
            <CopyButton value={account.address} toastText="Address copied" />
          </dd>
        </div>
        <div>
          <dt>Derivation path</dt>
          <dd className="mono">{account.path}</dd>
        </div>
      </dl>

      <div className="danger-zone">
        <h3>Private key</h3>
        {revealStep === 'idle' && privateKey === null ? (
          <>
            <p className="muted">Export this single account to another wallet. The key controls this account's funds on every TRON network.</p>
            <Button size="sm" onClick={() => setRevealStep('password')}>
              Show private key
            </Button>
          </>
        ) : null}
        {revealStep === 'password' ? (
          <form className="stack-sm" onSubmit={reveal} noValidate>
            <Field label="Password" error={error}>
              {(p) => <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
            </Field>
            <Button type="submit" size="sm" busy={busy} disabled={!password}>
              Confirm
            </Button>
          </form>
        ) : null}
        {privateKey !== null ? (
          <>
            <Notice tone="danger">Never paste this into a website or share it. Anyone with it can take the funds.</Notice>
            <div className="with-action secret-box">
              <span className="mono break">{privateKey}</span>
              <CopyButton value={privateKey} label="Copy private key" toastText="Private key copied" sensitive />
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setPrivateKey(null) }}>
              Hide
            </Button>
          </>
        ) : null}
      </div>

      {accounts.length > 1 ? (
        <div className="danger-zone">
          <h3>Hide account</h3>
          <p className="muted">Removes it from this list. The funds stay on chain and you can add the same path again at any time.</p>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              removeAccount(account.id)
              toast(`${account.name} hidden`)
              onClose()
            }}
          >
            Hide {account.name}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}
