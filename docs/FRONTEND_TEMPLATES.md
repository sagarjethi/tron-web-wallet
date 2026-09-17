# Frontend templates

The design system, the building blocks, and copy-ready templates for new screens.
Run `npm run dev` and open `/#kit` to see every piece live, in light and dark.
The kit uses sample data, so it is excluded from production builds.

## Design principles

1. **The network is the color.**
   Neutrals carry the whole interface.
   The only saturated color comes from the active network: teal for Shasta, indigo for Nile, red for mainnet.
   A person should know which network they are on before reading a word.
2. **One loud element per screen.**
   On the wallet it is the network panel (`.slab`).
   Everything else stays quiet: white panels, thin lines, no gradients, no decorative shadows.
3. **Money is exact.**
   Amounts are `bigint` base units end to end (`src/lib/units.ts`).
   Display truncates, never rounds up, so a balance is never overstated.
4. **Say what happens.**
   Buttons name their action ("Send TRX", "Remove wallet").
   Errors say what went wrong and how to fix it ("You need 0.6 more TRX to cover the amount and fee").
5. **Danger costs a step.**
   Mainnet sends use a red confirm button and a warning.
   Secrets need the password again.
   Destructive actions need typed confirmation.

## Tokens

All tokens live in `src/index.css` on `:root` and are redefined for dark mode.

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f2f3f0` | `#1b1f27` | Page background |
| `--surface` | `#ffffff` | `#232833` | Panels, sheets, inputs |
| `--surface-2` | `#e9ebe7` | `#2c3240` | Hover, chips, secret boxes |
| `--ink` | `#171a21` | `#eceef2` | Primary text, primary button |
| `--ink-2` | `#5d6573` | `#a3abb9` | Secondary text |
| `--line` | `#d9dcd6` | `#353c4a` | Borders, dividers |
| `--shasta` | `#0b7f6e` | `#0c806f` | Shasta network |
| `--nile` | `#4650c4` | `#5a63d6` | Nile network |
| `--mainnet` | `#d9142b` | `#dc2a3f` | Mainnet network |
| `--net` | set by `data-network` | | The active network color |
| `--danger`, `--ok`, `--warn` | | | Status only, never decoration |

White text on every network color meets WCAG AA (4.5:1 or better) in both themes.

Set `data-network="shasta" | "nile" | "mainnet"` on any container to recolor everything inside it that uses `--net`.

### Type

| Token | Size | Use |
| --- | --- | --- |
| `--t-hero` | 40 to 68px fluid | Balance |
| `--t-2xl` | 29.3px | Screen titles |
| `--t-xl` | 23.4px | Kit section titles, amount input |
| `--t-lg` | 18.75px | Panel and sheet titles |
| `--t-md` | 15px | Body |
| `--t-sm` | 13.5px | Labels, hints, list secondary text |
| `--t-xs` | 12px | Metadata |

- Schibsted Grotesk for all readable text.
- IBM Plex Mono (`.mono`) only for addresses, derivation paths, hashes, signatures and phrase words, where telling characters apart matters.
- Tabular figures only on numbers that update in place (block height, resources).
  Applied more widely, this font also widens commas and periods.

### Shape

| Token | Value | Use |
| --- | --- | --- |
| `--r-slab` | 22px | Network panel |
| `--r-panel` | 14px | Panels |
| `--r-control` | 10px | Buttons, inputs, notices |
| pill | 999px | Chips, network switch |

Radius steps down with importance, so hierarchy reads even without color.

## Components

All in `src/ui/kit.tsx` unless noted.

| Component | Purpose | Notes |
| --- | --- | --- |
| `Button` | Actions | `variant`: `net` (main action for the current network), `primary`, `secondary`, `ghost`, `danger`. `busy` shows a spinner and disables. |
| `IconButton` | Icon-only actions | `label` is required and becomes `aria-label` and tooltip. |
| `Field` | Label, control, hint, error | Render-prop child receives `id`, `aria-invalid`, `aria-describedby`. |
| `Segmented` | Two to four exclusive options | Uses `aria-pressed`. |
| `Notice` | Inline info, warning, danger | Danger notices use `role="alert"`. |
| `Sheet` | Every multi-step task | Native `<dialog>`; Escape and backdrop click close; becomes a bottom sheet under 560px. Mount it only while open so state starts fresh. |
| `ToastProvider`, `useToast` (`src/ui/toast.ts`) | Short confirmations | Errors stay 6 seconds, successes 2.6. |
| `CopyButton`, `useCopy` | Copy to clipboard | Confirms with a toast, explains failure. |
| `Identicon` (`src/ui/Identicon.tsx`) | Recognize accounts at a glance | Deterministic from the address. |
| Icons (`src/ui/icons.tsx`) | 24px stroke icons | Stroke 1.8, round caps, `aria-hidden`. |

## Page templates

### 1. Sheet task (form, review, result)

Use for any action that changes state: send, add account, add token.

```tsx
export function ExampleSheet({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<'form' | 'review' | 'done'>('form')
  const [error, setError] = useState<string | null>(null)

  if (stage === 'form')
    return (
      <Sheet open onClose={onClose} title="Do the thing" footer={<Button variant="net" type="submit" form="example">Review</Button>}>
        <form id="example" className="stack" onSubmit={(e) => { e.preventDefault(); setStage('review') }} noValidate>
          <Field label="Recipient" error={error}>
            {(p) => <input {...p} className="input mono" placeholder="T…" />}
          </Field>
        </form>
      </Sheet>
    )

  if (stage === 'review')
    return (
      <Sheet open onClose={onClose} title="Review" footer={<><Button onClick={() => setStage('form')}>Edit</Button><Button variant="net" onClick={() => setStage('done')}>Confirm</Button></>}>
        <dl className="kv">
          <div><dt>From</dt><dd>Account 1</dd></div>
        </dl>
      </Sheet>
    )

  return <Sheet open onClose={onClose} title="Done" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>…</Sheet>
}
```

Open it from the parent with `{open?.kind === 'example' ? <ExampleSheet onClose={close} /> : null}`.

### 2. Split landing (onboarding)

```
+---------------------------+----------------------+
| brand                     |                      |
|                           |   Get started        |
| Headline, two lines       |   [ primary action ] |
| Lede, 44ch max            |   [ second action ]  |
|                           |                      |
| legend rows               |                      |
| supporting facts          |                      |
+---------------------------+----------------------+
```

The left half is painted with `--net`; the right half is `--bg`.
Under 860px the halves stack.
Classes: `.onboard`, `.onboard-intro`, `.onboard-copy`, `.legend`, `.onboard-panel`, `.panel-card`.

### 3. App shell

```
+----------------------------------------------------------+
| brand                      [network #block] [set] [lock] |
+-----------+----------------------------------------------+
| Accounts  |  .slab (network panel)                       |
|  item     |                                              |
|  item     +----------------------+-----------------------+
|  + add    |  .panel Assets       |  .panel Activity      |
+-----------+----------------------+-----------------------+
```

- Under 1080px the two panels stack.
- Under 820px the account rail becomes a horizontal scroller above the network panel.
- Under 560px slab actions become a three-column grid of tall buttons.

Classes: `.app`, `.topbar`, `.layout`, `.rail`, `.main`, `.slab`, `.columns`, `.panel`.

### 4. Centered card (unlock, simple gates)

Classes: `.unlock`, `.unlock-card`.
One title, one field, one primary button, one quiet text link.

### 5. List rows

- Assets: `.assets > .asset` with glyph, identity, balance, row action.
- Activity: `.activity > li > a.act[data-dir="in|out|self"][data-failed]`.
- Key and value: `.kv > div > dt + dd`.

## Copy rules

- Sentence case everywhere, no all-caps labels.
- No em dashes; use a period or a plain dash.
- Name things the way a wallet user would: "recovery phrase", "activate", "network fee", not "mnemonic", "account creation contract", "fee_limit".
- An action keeps its name through a flow: the "Send TRX" button leads to "Transfer sent".
- Empty states say what to do next ("Share your address or use the faucet to receive your first TRX").

## Accessibility checklist

- Every icon-only control has `aria-label`.
- Every field has a real `<label>` and its hint or error in `aria-describedby`.
- Focus is always visible (`:focus-visible` outline).
- Motion respects `prefers-reduced-motion`.
- Mobile inputs are 16px so iOS does not zoom.
- Secret words enter the DOM only after the person chooses to reveal them.
