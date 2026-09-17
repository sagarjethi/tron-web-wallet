#!/usr/bin/env node
/**
 * Enforces this repository's commit identity rules (see AGENTS.md).
 *
 *   --commit          before a commit: the configured author and committer are allowed
 *   --msg <file>      commit message has no AI co-author or attribution lines
 *   --push            every commit being pushed (read from the pre-push hook's stdin) passes both checks
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const ALLOWED_EMAIL = 'sagar.jethi007@gmail.com'
const FORBIDDEN_NAME = /claude|anthropic/i
const FORBIDDEN_MESSAGE = [/co-authored-by:.*(claude|anthropic)/i, /noreply@anthropic\.com/i, /generated with \[?claude/i]
const FIELD_SEPARATOR = String.fromCharCode(31)

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const problems = []

function checkIdent(label, name, email) {
  if (email.toLowerCase() !== ALLOWED_EMAIL) problems.push(`${label} email is "${email}", expected ${ALLOWED_EMAIL}`)
  if (FORBIDDEN_NAME.test(name) || FORBIDDEN_NAME.test(email)) problems.push(`${label} "${name} <${email}>" must not be an AI identity`)
}

function checkMessage(label, message) {
  for (const re of FORBIDDEN_MESSAGE) if (re.test(message)) problems.push(`${label} message contains a forbidden line matching ${re}`)
}

const parseIdent = (ident) => {
  const m = /^(.*) <(.*)> \d+ [+-]\d{4}$/.exec(ident)
  return m ? { name: m[1], email: m[2] } : { name: ident, email: '' }
}

const args = process.argv.slice(2)

if (args[0] === '--commit') {
  const author = parseIdent(git('var', 'GIT_AUTHOR_IDENT'))
  const committer = parseIdent(git('var', 'GIT_COMMITTER_IDENT'))
  checkIdent('Author', author.name, author.email)
  checkIdent('Committer', committer.name, committer.email)
} else if (args[0] === '--msg') {
  checkMessage('Commit', readFileSync(args[1], 'utf8'))
} else if (args[0] === '--push') {
  const input = readFileSync(0, 'utf8').trim()
  for (const line of input ? input.split('\n') : []) {
    const [, localSha] = line.split(' ')
    if (!localSha || /^0+$/.test(localSha)) continue // branch deletion
    const shas = git('rev-list', localSha, '--not', '--remotes').split('\n').filter(Boolean)
    for (const sha of shas) {
      const [an, ae, cn, ce] = git('show', '-s', '--format=%an%x1f%ae%x1f%cn%x1f%ce', sha).split(FIELD_SEPARATOR)
      checkIdent(`Commit ${sha.slice(0, 7)} author`, an, ae)
      checkIdent(`Commit ${sha.slice(0, 7)} committer`, cn, ce)
      checkMessage(`Commit ${sha.slice(0, 7)}`, git('show', '-s', '--format=%B', sha))
    }
  }
} else {
  console.error('Usage: check-git-identity.mjs --commit | --msg <file> | --push')
  process.exit(2)
}

if (problems.length) {
  console.error('\nGit identity check failed:\n')
  for (const p of problems) console.error(`  ${p}`)
  console.error(`\nFix with: git config user.name "Sagar Jethi" && git config user.email ${ALLOWED_EMAIL}\n`)
  process.exit(1)
}
