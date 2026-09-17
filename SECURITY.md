# Security

This wallet handles two kinds of secrets.
User secrets (recovery phrases and private keys) never leave the person's browser.
Operator secrets (the TronGrid API key) never reach any browser.
This document explains how each is stored and which guards in code keep them from leaking.

## Reporting a vulnerability

Email sagar.jethi007@gmail.com with steps to reproduce.
Please do not open a public issue for security problems.

## Threat model in one table

| Asset | Where it lives | Main risks | Mitigations |
| --- | --- | --- | --- |
| Recovery phrase | Browser memory while unlocked; encrypted in `localStorage` otherwise | XSS, malicious extensions, shoulder surfing, clipboard snooping | Strict CSP, AES-256-GCM vault, auto-lock, reveal behind password, auto-hide, clipboard clearing |
| Private keys | Derived on demand from the phrase, never stored | Same as above | Derived per signature, shown only behind password, auto-hidden |
| TronGrid API key | Vercel Sensitive environment variable; `.env.local` for local development | Bundled into JavaScript, committed to git, echoed in logs or errors, quota abuse | Server-side proxy, build guard, secret scanner in hooks and build, error scrubbing, endpoint allowlist |
| Commit identity | Git config | Commits attributed to the wrong person or an AI tool | Identity checker in `commit-msg`, `pre-commit` and `pre-push` hooks |

## User secrets: phrase and private keys

- **Encryption at rest.**
  The phrase is encrypted with AES-256-GCM.
  The key comes from the password through PBKDF2-SHA256 with 600,000 iterations and a fresh 16-byte salt, following OWASP 2023 guidance.
  Only ciphertext, salt and IV are written to `localStorage` (`src/lib/vault.ts`).
- **In memory only while unlocked.**
  Locking, auto-lock after inactivity (15 minutes by default) and closing the tab drop the plaintext.
  JavaScript cannot zero strings in memory, so a compromised page while unlocked is out of scope; the CSP exists to prevent that.
- **Private keys are never stored.**
  They are derived from the phrase at signing time and checked against the stored address before use.
- **Tampered storage cannot redirect funds.**
  On unlock, every stored account address is re-derived from the phrase and path.
- **Reveal flows.**
  Showing the phrase or a private key requires the password again.
  Revealed secrets hide after 60 seconds or as soon as the tab is hidden.
  During wallet creation the words are not in the DOM until the person chooses to reveal them.
- **Clipboard.**
  Copied phrases and private keys are overwritten on the clipboard after 60 seconds.
- **Inputs.**
  Phrase fields disable autocomplete, autocapitalize and spellcheck, so words are not sent to cloud spellcheckers.
- **Message signing** uses TRON's prefixed format (`signMessageV2`), so a signed message can never be a valid transaction.

## Operator secret: the TronGrid API key

### Where it is stored

| Environment | Storage | Who writes it |
| --- | --- | --- |
| Production and preview on Vercel | Sensitive environment variable `TRONGRID_API_KEY` (encrypted, not readable after saving) | The project owner, through the Vercel dashboard or CLI prompt |
| Local development | `.env.local`, git-ignored, not uploaded to Vercel (`.vercelignore`), file mode 600 | The developer, in an editor |
| Browser | Never | |
| Git | Never | |
| Tests | Not needed: tests run anonymously against Shasta | |

The variable has no `VITE_` prefix on purpose.
Vite inlines every `VITE_` variable into public JavaScript.

### How it is used

Browsers call `/api/tron/{network}/{endpoint}` on the wallet's own origin.
The Vercel Function in `api/tron.ts` forwards the request to TronGrid and adds the key server side.

The proxy:

- forwards only an explicit allowlist of endpoints the wallet needs, so the key cannot be spent on arbitrary TronGrid calls;
- rejects requests whose `Origin` is another site, methods other than GET and POST, and bodies over 64 KB;
- never forwards upstream response headers, and scrubs the key from error bodies;
- does not log requests, headers or bodies;
- times out upstream calls after 20 seconds.

The page's Content Security Policy only allows `connect-src 'self'`, so even injected script cannot call TronGrid directly.

### Guards in code

These run automatically; a rule that only lives in documentation eventually gets missed.

| Guard | Where | What it stops |
| --- | --- | --- |
| Build guard | `vite.config.ts` | Building when any `VITE_` variable is named like a secret |
| Bundle scan | `npm run build` runs `scripts/check-secrets.mjs --dist` | Deploying a bundle that contains a known secret value or secret-shaped string |
| Pre-commit scan | `.githooks/pre-commit` | Committing `.env` files, known secret values, private keys, PEM blocks, GitHub, npm or Vercel tokens |
| Pre-push scan | `.githooks/pre-push` | Pushing anything the pre-commit hook would have caught |
| Git ignore | `.gitignore` | `.env`, `.env.*`, `*.local`, `*.pem`, `*.key` |
| Upload ignore | `.vercelignore` | Env files reaching Vercel's build machines |
| Error scrubbing test | `src/lib/__tests__/proxy.test.ts` | Regressions that echo the key or upstream headers |

The scanner learns real secret values from local env files and from secret-named environment variables (on Vercel, that includes `TRONGRID_API_KEY`), so it catches a leaked key whatever its format.
It prints only file, line and rule, never the matched value.

Hooks activate on `npm install` through the `prepare` script (`git config core.hooksPath .githooks`).

### Setting or rotating the key

Rotate immediately if the key has ever been pasted into a chat, ticket, screenshot or terminal history.

1. In the [TronGrid dashboard](https://www.trongrid.io/dashboard/keys), create a new key.
   Optionally restrict it to the contract and method allowlist the wallet uses.
2. Add it to Vercel without it touching your shell history.
   The CLI prompts for the value:

   ```bash
   vercel env add TRONGRID_API_KEY production --sensitive
   ```

   Repeat for `preview` if preview deployments should use a key.
3. Redeploy so the function picks up the new value:

   ```bash
   vercel deploy --prod
   ```

4. For local development, open `.env.local` in an editor and set `TRONGRID_API_KEY=`.
5. Delete the old key in the TronGrid dashboard.

Never type a key directly into a command, never `source` env files into a shell, and never paste keys into AI assistants or issue trackers.

## Web platform hardening

Set in `vercel.json` and mirrored by `vite preview`:

- `Content-Security-Policy`: `default-src 'self'`, scripts only from the origin, connections only to the origin, fonts only from Google Fonts, no framing, no plugins, no form posts, no `<base>` changes.
- `X-Frame-Options: DENY` and `frame-ancestors 'none'` against clickjacking.
- `Strict-Transport-Security` with preload.
- `Referrer-Policy: no-referrer`, so explorer links never reveal which wallet page they came from.
- `Permissions-Policy` disables camera, microphone, geolocation, payment and USB.
- `Cross-Origin-Opener-Policy: same-origin`.
- `X-Content-Type-Options: nosniff`.

## Known limits

- This is a hot wallet in a browser.
  Use it for testnets and small amounts; keep large holdings on a hardware wallet.
- A malicious browser extension with access to the page can read an unlocked wallet.
- The proxy's allowlist and origin check stop casual abuse, but a determined script can still spend API quota.
  Add a Vercel Firewall rate limit rule on `/api/tron` if that becomes a problem.
- Vercel's default Deployment Protection puts per-deployment URLs behind a Vercel login; only the production alias is public.
