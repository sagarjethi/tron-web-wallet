import { useState } from 'react'
import { NETWORKS, NETWORK_ORDER } from '../lib/networks'
import { IconArrowIn, IconArrowOut, IconDrop, IconReceive, IconSend, IconSign, TronMark } from '../ui/icons'
import { Button, Field, Notice, Segmented, Sheet } from '../ui/kit'
import { Identicon } from '../ui/Identicon'

const SAMPLE = 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH'

/**
 * Living component kit. Every block here uses the same classes as the product,
 * so it doubles as a copy-paste template source for new screens.
 */
export function Kit() {
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('a')
  const [sheet, setSheet] = useState(false)
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')

  const applyTheme = (t: typeof theme) => {
    setTheme(t)
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
  }

  return (
    <div className="kit" data-network="shasta">
      <header className="kit-head">
        <a className="brand" href="#" style={{ textDecoration: 'none' }}>
          <TronMark className="brand-mark" />
          <span>Tron Wallet</span>
        </a>
        <h1>Component kit</h1>
        <p className="muted">Tokens, primitives and page templates used across the wallet. Read docs/FRONTEND_TEMPLATES.md for the rules behind them.</p>
        <Segmented
          label="Theme"
          value={theme}
          onChange={applyTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </header>

      <section className="kit-section">
        <h2>Color</h2>
        <p>Neutrals carry the interface. The active network supplies the only saturated color, so Shasta, Nile and mainnet can never be confused.</p>
        <div className="kit-grid">
          {[
            ['--bg', 'Background'],
            ['--surface', 'Surface'],
            ['--surface-2', 'Surface 2'],
            ['--ink', 'Ink'],
            ['--ink-2', 'Ink 2'],
            ['--line', 'Line'],
            ['--shasta', 'Shasta'],
            ['--nile', 'Nile'],
            ['--mainnet', 'Mainnet'],
            ['--danger', 'Danger'],
            ['--ok', 'Success'],
            ['--warn', 'Warning'],
          ].map(([token, label]) => (
            <div className="kit-swatch" key={token}>
              <span style={{ background: `var(${token})` }} />
              <strong>{label}</strong>
              <code className="mono muted">{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="kit-section">
        <h2>Type</h2>
        <p>Schibsted Grotesk for everything readable, with tabular figures on. IBM Plex Mono only for addresses, paths, hashes and signatures.</p>
        <div className="kit-type">
          <div><code>--t-hero</code><span style={{ fontSize: 'var(--t-hero)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>1,284.50</span></div>
          <div><code>--t-2xl</code><span style={{ fontSize: 'var(--t-2xl)', fontWeight: 800 }}>Create a new wallet</span></div>
          <div><code>--t-lg</code><span style={{ fontSize: 'var(--t-lg)', fontWeight: 700 }}>Activity</span></div>
          <div><code>--t-md</code><span>Every account comes from your one recovery phrase.</span></div>
          <div><code>--t-sm</code><span style={{ fontSize: 'var(--t-sm)' }} className="muted">Raises rate limits for mainnet and Nile.</span></div>
          <div><code>mono</code><span className="mono" style={{ fontSize: 'var(--t-sm)' }}>{SAMPLE}</span></div>
        </div>
      </section>

      <section className="kit-section">
        <h2>Controls</h2>
        <div className="kit-demo">
          <div className="row">
            <Button variant="net">Network action</Button>
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="net" busy>
              Sending
            </Button>
            <Button size="sm">Small</Button>
          </div>
          <Segmented label="Example" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Next index' }, { value: 'b', label: 'By account' }, { value: 'c', label: 'Custom' }]} />
          <div className="chips">
            <button type="button" className="chip" aria-pressed="true">15 min</button>
            <button type="button" className="chip">30 min</button>
            <button type="button" className="chip">Never</button>
          </div>
        </div>
      </section>

      <section className="kit-section">
        <h2>Fields and notices</h2>
        <div className="kit-demo">
          <Field label="Recipient" hint="A TRON address starts with T.">
            {(p) => <input {...p} className="input mono" placeholder="T…" />}
          </Field>
          <Field label="Amount" aside="Balance 1,284.5 TRX" error="You have 1,284.5 TRX">
            {(p) => <input {...p} className="input amount-input" defaultValue="2000" />}
          </Field>
          <Notice tone="info">This address has never been used on Shasta. Sending TRX activates it.</Notice>
          <Notice tone="warn">The name uses unusual characters, a common trick to imitate real tokens.</Notice>
          <Notice tone="danger">This is mainnet. The transfer moves real funds and cannot be reversed.</Notice>
          <div className="row">
            <Button variant="primary" onClick={() => setSheet(true)}>
              Open a sheet
            </Button>
          </div>
        </div>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet template" footer={<><Button onClick={() => setSheet(false)}>Cancel</Button><Button variant="net" onClick={() => setSheet(false)}>Confirm</Button></>}>
          <p>Sheets hold every multi-step task. They become bottom sheets under 560px.</p>
          <dl className="kv">
            <div><dt>From</dt><dd>Account 1</dd></div>
            <div><dt>Network</dt><dd>Shasta</dd></div>
          </dl>
        </Sheet>
      </section>

      <section className="kit-section">
        <h2>Network panel</h2>
        <p>The one loud element on the page. Its color and tape change with the network.</p>
        <div className="kit-slabs">
          {NETWORK_ORDER.map((id) => {
            const n = NETWORKS[id]
            return (
              <section key={id} className="slab" data-network={id} style={{ ['--net' as string]: `var(--${id})` }}>
                <div className={`slab-tape ${n.kind === 'mainnet' ? 'slab-tape-main' : ''}`}>
                  <span>{n.kind === 'testnet' ? `${n.name} test network. Tokens have no real value.` : 'Mainnet. Transactions move real funds.'}</span>
                </div>
                <div className="slab-body">
                  <div className="slab-meta">
                    <span className="slab-account">Account 1</span>
                    <span className="slab-path mono">m/44'/195'/0'/0/0</span>
                  </div>
                  <p className="slab-balance">
                    <span className="slab-whole">1,284</span>
                    <span className="slab-frac">.5</span>
                    <span className="slab-unit">TRX</span>
                  </p>
                  <div className="slab-address">
                    <span className="mono" style={{ fontSize: 'var(--t-sm)' }}>{SAMPLE}</span>
                  </div>
                  <div className="slab-actions">
                    <span className="slab-action"><IconSend />Send</span>
                    <span className="slab-action"><IconReceive />Receive</span>
                    <span className="slab-action"><IconSign />Sign</span>
                    {n.faucet ? <span className="slab-action slab-action-faucet"><IconDrop />Get test TRX</span> : null}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className="kit-section">
        <h2>Lists</h2>
        <div className="columns">
          <section className="panel">
            <div className="panel-head"><h2>Assets</h2></div>
            <ul className="assets">
              <li className="asset"><span className="asset-glyph">T</span><span className="asset-id"><span className="asset-symbol">TRX</span><span className="asset-name">TRON</span></span><span className="asset-bal">1,284.5</span><span /></li>
              <li className="asset"><span className="asset-glyph">U</span><span className="asset-id"><span className="asset-symbol">USDT<span className="asset-tag">Verified</span></span><span className="asset-name mono">TG3XXy…BjEUVCq3</span></span><span className="asset-bal">250</span><span /></li>
              <li className="asset"><span className="asset-glyph">J</span><span className="asset-id"><span className="asset-symbol">JST<span className="asset-tag asset-tag-custom">Custom</span></span><span className="asset-name mono">TF17BgPa…2rWQX</span></span><span className="asset-bal">12.75</span><span /></li>
            </ul>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Activity</h2></div>
            <ul className="activity">
              <li><span className="act" data-dir="in"><span className="act-icon"><IconArrowIn /></span><span className="act-main"><span className="act-title">Received USDT</span><span className="act-sub"><span className="mono">TJFiy…u3Fz9</span><span>Sep 17, 11:42</span></span></span><span className="act-amount">+250</span></span></li>
              <li><span className="act" data-dir="out"><span className="act-icon"><IconArrowOut /></span><span className="act-main"><span className="act-title">Sent TRX</span><span className="act-sub"><span className="mono">TSeJk…6NQZK</span><span>Sep 16, 18:03</span></span></span><span className="act-amount">-20</span></span></li>
              <li><span className="act" data-dir="out" data-failed><span className="act-icon"><IconArrowOut /></span><span className="act-main"><span className="act-title">Sent USDT<span className="act-failed">Failed</span></span><span className="act-sub"><span className="mono">TLrpN…PHh4</span><span>Sep 15, 09:12</span></span></span><span className="act-amount">-5</span></span></li>
            </ul>
          </section>
        </div>
        <div className="kit-demo">
          <div className="rail-list" style={{ maxWidth: 260 }}>
            <button type="button" className="rail-item" aria-current="true"><Identicon address={SAMPLE} /><span className="rail-text"><span className="rail-name">Account 1</span><span className="rail-addr mono">TUEZS…GYdH</span></span><span className="rail-bal">1,284.5</span></button>
            <button type="button" className="rail-item"><Identicon address="TSeJkUh4Qv67VNFwY8LaAxERygNdy6NQZK" /><span className="rail-text"><span className="rail-name">Savings</span><span className="rail-addr mono">TSeJk…6NQZK</span></span></button>
          </div>
        </div>
      </section>
    </div>
  )
}
