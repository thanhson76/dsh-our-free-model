/** Loaded by test processes only, via --import: real channel requests are redirected to a local fixture. */
import { lane } from '../../src/eac.js'

const original = globalThis.fetch
const fixture = process.env.OFM_TEST_UPSTREAM
if (!fixture || new URL(fixture).hostname !== '127.0.0.1') throw new Error('The channel fixture must be a local HTTP service')
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input))
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return original(input, options)
  if (url.protocol !== 'https:') throw new Error('External network access is forbidden in tests')
  const headers = new Headers(options.headers)
  headers.set('x-ofm-fixture-host', url.hostname)
  // The external target has been replaced with a local one; the test machine's environment or system proxy is not carried to the isolated server.
  const { dispatcher, ...localOptions } = options
  return original(`${fixture}/remote${url.pathname}${url.search}`, { ...localOptions, headers, redirect: 'manual' })
}
lane.fetch = globalThis.fetch
