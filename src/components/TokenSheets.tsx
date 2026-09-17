import { useState, type FormEvent } from 'react'
import type { TokenPreset } from '../lib/networks'
import { describeError, getClient, getTokenMetadata, isTronAddress } from '../lib/tron'
import { useWallet } from '../state/wallet-context'
import { Button, Field, Notice, Sheet } from '../ui/kit'
import { useToast } from '../ui/toast'

export function AddTokenSheet({ onClose }: { onClose: () => void }) {
  const { network, tokens, customTokens, addToken, removeToken } = useWallet()
  const toast = useToast()
  const [contract, setContract] = useState('')
  const [found, setFound] = useState<TokenPreset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lookup = async (e: FormEvent) => {
    e.preventDefault()
    const c = contract.trim()
    setFound(null)
    setError(null)
    if (!isTronAddress(c)) return setError('Enter the token contract address. It starts with T.')
    if (tokens.some((t) => t.contract === c)) return setError('This token is already in your list')
    setBusy(true)
    try {
      setFound(await getTokenMetadata(getClient(network), c))
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const lookalike = found && network.tokens.find((t) => t.symbol.toLowerCase() === found.symbol.normalize('NFKC').toLowerCase())
  const nonAscii = found && /[^\x20-\x7e]/.test(found.symbol + found.name)

  return (
    <Sheet open onClose={onClose} title={`Tokens on ${network.name}`}>
      <form className="stack" onSubmit={lookup} noValidate>
        <Field label="TRC20 contract address" error={error} hint="Name, symbol and decimals are read from the contract itself.">
          {(p) => <input {...p} className="input mono" spellCheck={false} autoComplete="off" value={contract} onChange={(e) => { setContract(e.target.value); setFound(null); setError(null) }} placeholder="T…" />}
        </Field>
        {!found ? (
          <Button type="submit" variant="primary" busy={busy} disabled={!contract}>
            Look up token
          </Button>
        ) : null}
      </form>

      {found ? (
        <div className="stack">
          <dl className="kv">
            <div><dt>Symbol</dt><dd>{found.symbol}</dd></div>
            <div><dt>Name</dt><dd>{found.name}</dd></div>
            <div><dt>Decimals</dt><dd>{found.decimals}</dd></div>
          </dl>
          {lookalike ? <Notice tone="danger">This is not the {lookalike.symbol} this wallet lists for {network.name}. Scam tokens copy well-known names. The real contract is <span className="mono break">{lookalike.contract}</span>.</Notice> : null}
          {!lookalike && nonAscii ? <Notice tone="warn">The name uses unusual characters, a common trick to imitate real tokens. Check the contract on TRONSCAN.</Notice> : null}
          <Button
            variant={lookalike ? 'secondary' : 'net'}
            onClick={() => {
              addToken(found)
              toast(`${found.symbol} added`)
              setContract('')
              setFound(null)
            }}
          >
            {lookalike ? 'Add anyway' : `Add ${found.symbol}`}
          </Button>
        </div>
      ) : null}

      {customTokens.length ? (
        <div className="stack-sm">
          <h3 className="sub-h">Your custom tokens</h3>
          <ul className="token-list">
            {customTokens.map((t) => (
              <li key={t.contract}>
                <span>
                  <strong>{t.symbol}</strong> <span className="mono muted">{t.contract}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeToken(t.contract)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  )
}
