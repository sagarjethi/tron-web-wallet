# Tron Wallet

A self-custody web wallet for TRON.
It starts on the Shasta test network and also supports Nile and mainnet.

## Features

- **Send** TRX and any TRC20 token (USDT and others), with a review step that itemizes bandwidth, energy and account activation costs before signing.
- **BIP-44 derivation** on `m/44'/195'/0'/0/n` (TronLink compatible), account-level `m/44'/195'/n'/0/0` (Ledger Live compatible), or any custom TRON path.
- **Multiple accounts** from one recovery phrase, with names, identicons and per-account private key export.
- **TRC20 balances** read directly from each token contract with `balanceOf`, plus custom tokens by contract address with look-alike scam detection.
- **Message signing and verification** with TRON's `signMessageV2` format.
- **Receive** with QR code, testnet faucet shortcuts, and live activity from TronGrid.
- **Security**: the phrase is encrypted with AES-256-GCM under a PBKDF2 (600,000 iterations) key from your password, kept in memory only while unlocked, and cleared on auto-lock.

## Quick start

```bash
npm install
```

```bash
cp .env.example .env.local
```

Optionally put a TronGrid key after `TRONGRID_API_KEY=` in `.env.local` using your editor (never paste it into a terminal command), then start the app:

```bash
npm run dev
```

Open http://localhost:5173, create a wallet, copy your address from Receive, and request test TRX and USDT from the [Shasta faucet](https://shasta.tronex.io/join/getJoinPage).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type check, production build into `dist/`, then scan the bundle for leaked secrets |
| `npm run check:secrets` | Scan every file git would track for secrets |
| `npm run lint` | oxlint |
| `npm test` | Unit tests (offline) |
| `npm run test:network` | Read-only integration tests against live Shasta; signs locally, never broadcasts |

## Project layout

```
src/
  lib/            chain and crypto logic, no React
    networks.ts   networks, endpoints, verified token contracts
    derivation.ts BIP-39 and BIP-44
    address.ts    TRON address encoding without TronWeb
    vault.ts      password encryption
    tron.ts       balances, fees, send, confirmations, history, message signing
    units.ts      exact bigint amount math
  state/          wallet session and chain data hooks
  ui/             design system primitives
  components/     screens and sheets
docs/
  RESOURCES.md            endpoints, faucets, contracts, standards, fees
  FRONTEND_TEMPLATES.md   design tokens, components, page templates
api/
  tron.ts         TronGrid proxy (Vercel Function); holds the API key server side
scripts/
  check-secrets.mjs        leak scanner used by hooks and the build
  check-git-identity.mjs   commit identity rules used by hooks
.githooks/        pre-commit, commit-msg and pre-push guards
```

## Security notes

- This is a hot wallet in a browser.
  Use it for testnets and small amounts; keep large holdings on a hardware wallet.
- Anything with access to this origin's JavaScript can reach an unlocked wallet, so host it only from a domain you control, with a strict Content Security Policy.
- The TronGrid API key never reaches the browser; it lives in server-side environment variables only.
  Read [SECURITY.md](SECURITY.md) for the full model.

## Deployment

The app is a Vite build plus one Vercel Function (`api/tron.ts`), hosted on Vercel as the `tron-wallet` project (`sagarjethis-projects` scope).
Production: https://tron-wallet-vert.vercel.app

```bash
vercel deploy --prod
```

- `vercel.json` sets a strict Content Security Policy (the page may only connect to its own origin), blocks framing, and caches hashed assets for a year.
  `npm run preview` serves the same headers locally, so test CSP changes there first.
- `.vercelignore` keeps `.env.local` out of uploads.
- The TronGrid key is a Vercel Sensitive environment variable named `TRONGRID_API_KEY`; see [SECURITY.md](SECURITY.md) for how to set or rotate it.
