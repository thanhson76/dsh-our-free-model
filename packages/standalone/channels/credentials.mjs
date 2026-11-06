import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { restrictPermissions } from '../../../src/open-external.js'

/** The standalone application's credential store. Writes are synchronous and atomic, failures propagate; it never reads DSH files. */
export function createCredentials(dataDir) {
  const file = path.join(dataDir, 'channel-credentials.json')
  let values = {}
  if (fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('The standalone credential file is malformed')
    values = loaded
  }
  let closed = false
  const key = ref => {
    if (typeof ref !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(ref)) throw new TypeError('Invalid credential reference')
    return ref
  }
  const save = next => {
    if (closed) throw new Error('The credential store has been stopped')
    const temp = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
    try {
      fs.writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' })
      restrictPermissions(temp)
      fs.renameSync(temp, file)
      values = next
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }
  return {
    async resolve(ref) {
      const value = values[key(ref)]
      return typeof value === 'string' ? { value, source: 'local' } : undefined
    },
    async describe(ref) { return { source: typeof values[key(ref)] === 'string' ? 'local' : undefined } },
    async set(ref, value) {
      if (typeof value !== 'string') throw new TypeError('The credential must be a string')
      save({ ...values, [key(ref)]: value })
    },
    async unset(ref) {
      const next = { ...values }
      delete next[key(ref)]
      save(next)
    },
    dispose() { closed = true; values = {} },
  }
}
