# Agent instructions

Rules for any AI coding agent (Claude Code, Codex, Cursor and others) working in this repository.
`CLAUDE.md` points here, so this file is the single source of truth.

## Git identity (non-negotiable)

- Every commit must be authored and committed as **Sagar Jethi `<sagar.jethi007@gmail.com>`**.
- Never commit or push as an AI identity: no `Claude`, `Anthropic` or similar in the author name, committer name or email.
- Never add AI co-author trailers (`Co-Authored-By: Claude ...`), `noreply@anthropic.com`, or "Generated with Claude Code" lines to commit messages or pull request descriptions.
- Before the first commit in a clone, set the identity for this repository only:

  ```bash
  git config user.name "Sagar Jethi"
  ```

  ```bash
  git config user.email sagar.jethi007@gmail.com
  ```

- Before every push, verify it:

  ```bash
  git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD
  ```

- These rules are enforced in code by `scripts/check-git-identity.mjs` through the `pre-commit`, `commit-msg` and `pre-push` hooks in `.githooks/`.
  `npm install` activates the hooks.
  Never bypass them with `--no-verify`.

The remote is `https://github.com/sagarjethi/tron-web-wallet`.
Push only when the owner asks.

## Secrets (non-negotiable)

- Never print, echo, `cat`, `source` or pass secret values through shell commands, logs, test output or chat.
  Read `SECURITY.md` before touching anything related to keys.
- The TronGrid key is `TRONGRID_API_KEY`: a Vercel Sensitive variable in deployments and `.env.local` locally.
  It is read only by `api/tron.ts` (and the Vite dev server that reuses it).
- Never give a secret a `VITE_` prefix; Vite would bundle it into public JavaScript and the build refuses it.
- Never commit `.env` files other than `.env.example`.
- Tests must not require secrets.
- To check for leaks, run `npm run check:secrets` (tree) or `npm run build` (bundle); both report file and rule only.
- If a secret has been exposed anywhere, tell the owner to rotate it following `SECURITY.md`.

## Engineering

- Stack: React 19, Vite 8, TypeScript 6, TronWeb 6, Vitest, oxlint, one Vercel Function.
- Chain and crypto logic lives in `src/lib` without React; keep it that way.
- Amounts are `bigint` base units; never use floating point for money.
- Before finishing any change run:

  ```bash
  npm run lint
  ```

  ```bash
  npm test
  ```

  ```bash
  npm run build
  ```

- Changes to TronGrid calls or `api/tron.ts` also need the live read-only suite (never broadcasts):

  ```bash
  npm run test:network
  ```

- Never broadcast transactions from tests or scripts.
- Verify UI changes in a real browser, on desktop and at 375px width, in light and dark mode.
- Follow `docs/FRONTEND_TEMPLATES.md` for design tokens, components and copy rules.
- No sample or placeholder data may ship to production.
  Sample content belongs only in the development-only component kit (`src/components/Kit.tsx`) and in tests.
- Never use the em dash character in code, copy or docs.

## Deployment

- Vercel project `tron-wallet` (scope `sagarjethis-projects`), production alias https://tron-wallet-vert.vercel.app.
- The project has no Git integration, so `vercel deploy` goes straight to production.
  Confirm with the owner before deploying.
