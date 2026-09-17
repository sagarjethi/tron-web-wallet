import { useState } from 'react'
import { isTronAddress, recoverSigner, signMessage } from '../lib/tron'
import { useWallet } from '../state/wallet-context'
import { IconCheck, IconCopy, IconWarn } from '../ui/icons'
import { Button, Field, Notice, Segmented, Sheet } from '../ui/kit'
import { useCopy } from '../ui/toast'

type Mode = 'sign' | 'verify'
type Verdict = { ok: true; signer: string; name?: string } | { ok: false; signer?: string; reason: string }

export function SignSheet({ onClose }: { onClose: () => void }) {
  const { account, accounts, privateKeyFor } = useWallet()
  const copy = useCopy()
  const [mode, setModeRaw] = useState<Mode>('sign')
  const [message, setMessageRaw] = useState('')
  const [signature, setSignatureRaw] = useState('')
  const [expected, setExpectedRaw] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Any edit invalidates the previous result.
  const invalidate = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setVerdict(null)
    setError(null)
  }
  const setMode = invalidate(setModeRaw)
  const setMessage = (v: string) => {
    invalidate(setMessageRaw)(v)
    if (mode === 'sign') setSignatureRaw('')
  }
  const setExpected = invalidate(setExpectedRaw)
  const setSignature = setSignatureRaw

  if (!account) return null

  const sign = () => {
    setError(null)
    try {
      setSignature(signMessage(message, privateKeyFor(account)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const verify = () => {
    const want = expected.trim()
    if (want && !isTronAddress(want)) return setError('The expected signer must be a TRON address')
    try {
      const signer = recoverSigner(message, signature)
      const name = accounts.find((a) => a.address === signer)?.name
      if (want && want !== signer) setVerdict({ ok: false, signer, reason: 'Signed by a different address' })
      else setVerdict({ ok: true, signer, name })
    } catch (e) {
      setVerdict({ ok: false, reason: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <Sheet open onClose={onClose} title="Messages">
      <Segmented<Mode>
        label="Mode"
        value={mode}
        onChange={(m) => {
          setMode(m)
          if (m === 'verify' && !expected && signature) setExpected(account.address)
        }}
        options={[
          { value: 'sign', label: 'Sign' },
          { value: 'verify', label: 'Verify' },
        ]}
      />

      <Field label="Message" hint={mode === 'sign' ? 'Signed with the TRON message prefix (signMessageV2), so it can never be a transaction.' : undefined}>
        {(p) => <textarea {...p} className="textarea" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Text to sign" />}
      </Field>

      {mode === 'sign' ? (
        <>
          <p className="field-hint">
            Signing as <strong>{account.name}</strong> <span className="mono">{account.address}</span>
          </p>
          <Button variant="net" block disabled={!message} onClick={sign}>
            Sign message
          </Button>
          {signature ? (
            <div className="sig-out">
              <div className="field-label">
                <span>Signature</span>
              </div>
              <p className="mono break sig">{signature}</p>
              <div className="row">
                <Button size="sm" onClick={() => copy(signature, 'Signature copied')}>
                  <IconCopy /> Copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMode('verify')
                    setExpected(account.address)
                  }}
                >
                  Verify it
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <Field label="Signature">
            {(p) => <textarea {...p} className="textarea mono" rows={3} spellCheck={false} value={signature} onChange={(e) => invalidate(setSignature)(e.target.value)} placeholder="0x…" />}
          </Field>
          <Field label="Expected signer" aside="Optional">
            {(p) => <input {...p} className="input mono" spellCheck={false} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="T…" />}
          </Field>
          <Button variant="net" block disabled={!message || !signature} onClick={verify}>
            Verify signature
          </Button>
          {verdict ? (
            <div className={`verdict ${verdict.ok ? 'verdict-ok' : 'verdict-bad'}`} role="status">
              {verdict.ok ? <IconCheck /> : <IconWarn />}
              <div>
                <p className="verdict-title">{verdict.ok ? (verdict.name ? `Valid. Signed by ${verdict.name}` : 'Valid signature') : verdict.reason}</p>
                {verdict.signer ? <p className="mono break">{verdict.signer}</p> : null}
              </div>
            </div>
          ) : null}
        </>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Sheet>
  )
}
