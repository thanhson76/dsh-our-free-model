/** Boundary checks for the daily sponsor notice rules, fully offline. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { SPONSOR, SPONSOR_DAY_KEY, sponsorLocalDay, claimSponsorDay } from '../src/sponsor.js'
const memory = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
let shows = 0
const storage = memory()
let date = new Date(2026, 9, 19, 23, 59, 59)
const options = { storage, now: () => date, show: () => { shows++ } }
assert.equal(sponsorLocalDay(new Date(2026, 9, 19, 0, 1)), '2026-10-19')
assert.equal(await claimSponsorDay(options), true)
assert.equal(await claimSponsorDay(options), false)
assert.equal(shows, 1, 'A same-day refresh or remount must not show it again')
date = new Date(2026, 9, 20, 0, 0, 1)
assert.equal(await claimSponsorDay(options), true)
assert.equal(shows, 2, 'The first visit after local midnight should show it')
const broken = { getItem() { throw new Error('private storage') } }
assert.equal(await claimSponsorDay({ ...options, storage: broken }), false)
assert.equal(await claimSponsorDay({ ...options, storage: { getItem: () => null, setItem() { throw new Error('quota') } } }), false)
assert.equal(shows, 2, 'A storage failure must not cause it to nag on every open')
const cancelled = memory()
assert.equal(await claimSponsorDay({ ...options, storage: cancelled, eligible: () => false }), false)
assert.equal(cancelled.getItem(SPONSOR_DAY_KEY), null, 'Hiding, cancelling or unmounting must not consume the showing for that day')
const failed = memory()
assert.equal(await claimSponsorDay({ ...options, storage: failed, show: () => { throw new Error('another dialog is open') } }), false)
assert.equal(failed.getItem(SPONSOR_DAY_KEY), null, 'A failure to open the notice must not be recorded as shown')
let queue = Promise.resolve()
const locks = { request: (_name, callback) => { const next = queue.then(callback); queue = next.catch(() => {}); return next } }
const concurrent = memory()
let concurrentShows = 0
const claims = await Promise.all(Array.from({ length: 30 }, () => claimSponsorDay({ storage: concurrent, locks, show: () => concurrentShows++ })))
assert.equal(claims.filter(Boolean).length, 1)
assert.equal(concurrentShows, 1, 'Only one of multiple same-origin windows may show it')
assert.equal(new URL(SPONSOR.url).searchParams.get('aff'), SPONSOR.invite)
assert.equal(SPONSOR.paragraphs.length, 6)
assert.equal(fs.readFileSync(new URL('../docs/images/sponsor-beichen-examples.jpg', import.meta.url)).length, 59507)
execFileSync(process.execPath, [fileURLToPath(new URL('./build-sponsor.mjs', import.meta.url)), '--check'], { stdio: 'pipe' })
console.log('sponsor: date, day rollover, remount, concurrent windows, storage failures, cancelled showing and shared content checks passed')
