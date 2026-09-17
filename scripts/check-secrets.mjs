#!/usr/bin/env node
/**
 * Secret leak scanner. Reports file, line and rule only; matched text is never printed.
 *
 *   node scripts/check-secrets.mjs            scan every file git would track (or the tree, outside git)
 *   node scripts/check-secrets.mjs --staged   scan staged content (pre-commit hook)
 *   node scripts/check-secrets.mjs --dist     scan the production bundle (runs after `vite build`)
 *
 * It looks for:
 * 1. Real secret values, learned from local .env files and secret-named environment variables
 *    (for example TRONGRID_API_KEY on Vercel), so a leaked key is caught whatever its format.
 * 2. Well-known secret shapes: private keys, PEM blocks, GitHub, Vercel and npm tokens, API key assignments.
 * 3. Secret-named VITE_ variables, which Vite would inline into public JavaScript.
 * 4. Committed .env files.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const mode = process.argv.includes('--staged') ? 'staged' : process.argv.includes('--dist') ? 'dist' : 'tree'

const SECRET_NAME = /(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|MNEMONIC|CREDENTIAL)/i
const MIN_SECRET_LENGTH = 12

// ------------------------------------------------------------------ known secret values

function parseEnvFile(path) {
  const out = []
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2')
    if (SECRET_NAME.test(m[1]) && value.length >= MIN_SECRET_LENGTH) out.push({ name: m[1], value })
  }
  return out
}

const knownSecrets = []
for (const file of readdirSync(root)) {
  if (/^\.env(\..+)?$/.test(file) && file !== '.env.example') knownSecrets.push(...parseEnvFile(join(root, file)))
}
for (const [name, value] of Object.entries(process.env)) {
  if (SECRET_NAME.test(name) && value && value.length >= MIN_SECRET_LENGTH && !/^(true|false|\d+)$/.test(value)) knownSecrets.push({ name, value })
}

// ------------------------------------------------------------------ shape rules

const RULES = [
  { id: 'pem-private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'github-token', re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'vercel-token', re: /\b(VERCEL_TOKEN|vercel_token)\s*[:=]\s*['"]?[A-Za-z0-9]{24,}/ },
  { id: 'tron-api-key-assignment', re: /(TRON-PRO-API-KEY|TRONGRID_API_KEY)['"]?\s*[:=,]\s*['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i },
  { id: 'hex-private-key-assignment', re: /(private_?key|privkey|secret)['"]?\s*[:=]\s*['"](0x)?[0-9a-f]{64}['"]/i },
  { id: 'secret-named-vite-variable', re: /\bVITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE|MNEMONIC)[A-Z0-9_]*\b/ },
]

/** Test fixtures and this scanner may legitimately mention patterns. */
const RULE_ALLOW = [
  { file: /^scripts\/check-secrets\.mjs$/, rules: ['secret-named-vite-variable', 'tron-api-key-assignment', 'hex-private-key-assignment', 'vercel-token'] },
  { file: /^vite\.config\.ts$/, rules: ['secret-named-vite-variable'] },
  { file: /^(docs|README\.md|SECURITY\.md|AGENTS\.md|CLAUDE\.md)/, rules: ['secret-named-vite-variable'] },
]

const allowed = (file, rule) => RULE_ALLOW.some((a) => a.file.test(file) && a.rules.includes(rule))

// ------------------------------------------------------------------ file sources

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const inGit = (() => {
  try {
    return git('rev-parse', '--is-inside-work-tree').trim() === 'true'
  } catch {
    return false
  }
})()

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.claude'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (st.size < 5 * 1024 * 1024) out.push(relative(root, full))
  }
  return out
}

function listFiles() {
  if (mode === 'dist') return existsSync(join(root, 'dist')) ? walk(join(root, 'dist')).map((f) => f) : []
  if (mode === 'staged') return git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean)
  if (inGit) return git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean)
  return walk(root)
}

function readContent(file) {
  if (mode === 'staged') return git('show', `:${file}`)
  return readFileSync(join(root, file), 'utf8')
}

// ------------------------------------------------------------------ scan

const findings = []
const files = listFiles()

for (const file of files) {
  const base = file.split('/').pop()
  if (mode !== 'dist' && /^\.env(\..+)?$/.test(base) && base !== '.env.example') {
    // Inside git, an env file in this list means git would commit it. Outside git there is no
    // ignore information, so local env files are skipped rather than reported.
    if (inGit) findings.push({ file, line: 0, rule: 'env-file-in-repository' })
    continue
  }
  let content
  try {
    content = readContent(file)
  } catch {
    continue
  }
  if (content.includes('\u0000')) continue // binary

  const lines = content.split('\n')
  lines.forEach((text, i) => {
    for (const s of knownSecrets) {
      if (text.includes(s.value)) findings.push({ file, line: i + 1, rule: `value-of-${s.name}` })
    }
    for (const r of RULES) {
      if (r.re.test(text) && !allowed(file, r.id)) findings.push({ file, line: i + 1, rule: r.id })
    }
  })
}

if (findings.length) {
  console.error(`\nSecret scan (${mode}) found ${findings.length} problem(s). Values are not shown.\n`)
  for (const f of findings) console.error(`  ${f.file}${f.line ? `:${f.line}` : ''}  ${f.rule}`)
  console.error('\nRemove the secret, keep it in .env.local or a Vercel Sensitive variable, and rotate it if it was ever shared.\n')
  process.exit(1)
}

console.log(`Secret scan (${mode}): ${files.length} files clean, ${knownSecrets.length} known secret value(s) checked.`)
