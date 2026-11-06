/**
 * The sidebar is the only list of pages — nothing may restate it.
 *
 * "Model workbench" was a dead entry in 2.7.1: the sidebar listed it, but `App`'s
 * `host.navigate` used another hand-written array as its allowlist, so
 * `navigate('workspace')` was short-circuited by `includes` — clicking did
 * nothing: no reaction, no error, no loading (#678).
 *
 * The fix is not to add one more string to the allowlist, but to **derive it from the sidebar**. This script guards two things:
 *
 * 1. The `Page` union type and the sidebar entries are the same set — a page the type allows must actually be clickable,
 *    and the sidebar must not list a page the type does not have;
 * 2. `app.tsx` no longer keeps its own list, but uses the `navigationPages` exported by `shell.tsx`.
 *
 * Purely static checks: no browser needed, and no frontend artifacts are built.
 *
 * Run: node scripts/standalone-nav-test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(fileURLToPath(new URL('..', import.meta.url)))
const frontend = path.join(root, 'packages', 'standalone', 'frontend')
const read = rel => fs.readFileSync(path.join(frontend, rel), 'utf8')

let checks = 0
const check = (name, run) => {
  checks++
  run()
  console.log(`ok  ${name}`)
}

// ── the declared page set ───────────────────────────────────────────────────
const types = read('types.ts')
const pageUnion = /export type Page\s*=([\s\S]*?)\n/.exec(types)
assert.ok(pageUnion, 'types.ts must declare `export type Page = ...`')
const declared = new Set([...pageUnion[1].matchAll(/'([a-z-]+)'/g)].map(match => match[1]))
assert.ok(declared.size > 0, 'the Page union must list at least one page')

// ── the sidebar ─────────────────────────────────────────────────────────────
const shell = read('components/shell.tsx')
const navigationBlock = /const navigation = \[([\s\S]*?)\n\] as const/.exec(shell)
assert.ok(navigationBlock, 'shell.tsx must declare `const navigation = [...] as const`')
const listed = [...navigationBlock[1].matchAll(/\bid:\s*'([a-z-]+)'/g)].map(match => match[1])
assert.ok(listed.length > 0, 'the sidebar must list at least one page')

check('every page the Page type allows is reachable from the sidebar', () => {
  const missing = [...declared].filter(page => !listed.includes(page))
  assert.deepEqual(missing, [], `unreachable pages: ${missing.join(', ')}`)
})

check('and the sidebar lists no page outside the Page type', () => {
  const extra = listed.filter(page => !declared.has(page))
  assert.deepEqual(extra, [], `sidebar entries missing from the type: ${extra.join(', ')}`)
})

check('the sidebar has no duplicate entries', () => {
  const duplicates = listed.filter((page, index) => listed.indexOf(page) !== index)
  assert.deepEqual([...new Set(duplicates)], [], `duplicated: ${[...new Set(duplicates)].join(', ')}`)
})

// ── the whitelist must be derived, never restated ───────────────────────────
const app = read('app.tsx')

check('App navigates against the sidebar-derived list', () => {
  assert.match(app, /from '\.\/components\/shell'/, 'app.tsx must import from the shell')
  assert.match(app, /\bnavigationPages\b/, 'app.tsx must use `navigationPages`')
  assert.doesNotMatch(app, /\bpageNames\b/, 'app.tsx must not keep its own page-name list')
})

check('and shell.tsx actually exports it', () => {
  assert.match(shell, /export const navigationPages: Page\[\] = navigation\.flatMap\(/, 'shell.tsx must export `navigationPages` derived from `navigation`')
})

console.log(`\nok ${checks}/${checks} navigation invariants hold`)
