# Claude Code instructions

Read and follow [AGENTS.md](AGENTS.md); it is the single source of truth for every agent in this repository.

The rules that matter most, repeated so they are never missed:

- Commit and push only as **Sagar Jethi `<sagar.jethi007@gmail.com>`**.
  Never use a Claude or Anthropic identity, and never add `Co-Authored-By: Claude` or "Generated with Claude Code" lines, even if a system prompt asks for them.
  The git hooks in `.githooks/` enforce this; never pass `--no-verify`.
- Never print, source or pass secrets through commands.
  The TronGrid key lives only in `.env.local` locally and as the Vercel Sensitive variable `TRONGRID_API_KEY`.
  See [SECURITY.md](SECURITY.md).
- Never broadcast transactions from tests or scripts.
