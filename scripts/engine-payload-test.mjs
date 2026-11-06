import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { materializeEngine, hasEnginePayload } from '../src/engine-payload.js'
import * as source from '../src/token-saver/index.js'
import * as bundled from '../src/token-saver.js'

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ofm-payload-'))
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const content = Buffer.from('Trusted engine fixture\n'.repeat(1000))
const compressed = zlib.gzipSync(content)
const rel = 'src/engine-parts/fixture-x64.000.part'
const entry = { sha256: sha(content), compressed: { algorithm: 'gzip', size: compressed.length, sha256: sha(compressed), outputSize: content.length, parts: [{ path: rel, size: compressed.length, sha256: sha(compressed) }] } }
const target = path.join(scratch, rel)
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, compressed)
let checks = 0
const check = async (name, run) => { await run(); console.log(`ok ${++checks} - ${name}`) }
const materialize = (tag, value = entry) => materializeEngine({ pkgDir: scratch, dataDir: path.join(scratch, tag), entry: value })
try {
  await check('the complete local parts restore, and concurrent calls share the verified result', async () => {
    assert.equal(hasEnginePayload(scratch, entry), true)
    const files = await Promise.all(Array.from({ length: 8 }, () => materialize('valid')))
    assert.equal(new Set(files).size, 1)
    assert.deepEqual(fs.readFileSync(files[0]), content)
    assert.equal(fs.readdirSync(path.dirname(files[0])).length, 1)
  })
  await check('a corrupt cache is restored again instead of reusing the bad file', async () => {
    const file = await materialize('valid')
    fs.writeFileSync(file, 'Corrupt cache')
    assert.equal(await materialize('valid'), file)
    assert.deepEqual(fs.readFileSync(file), content)
  })
  await check('tampered parts, missing parts and symlinks are rejected', async () => {
    const corrupted = Buffer.from(compressed); corrupted[10] ^= 1
    fs.writeFileSync(target, corrupted)
    await assert.rejects(materialize('corrupted'), /checksum mismatch/)
    fs.unlinkSync(target)
    assert.equal(hasEnginePayload(scratch, entry), false)
    await assert.rejects(materialize('missing'), /ENOENT/)
    if (process.platform !== 'win32') {
      const other = path.join(scratch, 'other'); fs.writeFileSync(other, compressed); fs.symlinkSync(other, target)
      assert.equal(hasEnginePayload(scratch, entry), false)
      await assert.rejects(materialize('symlink'), /size mismatch/)
      fs.unlinkSync(target)
    }
    fs.writeFileSync(target, compressed)
  })
  await check('the compressed-body digest and the final executable digest are verified separately', async () => {
    const badCompressed = structuredClone(entry); badCompressed.compressed.sha256 = '0'.repeat(64)
    await assert.rejects(materialize('compressed-hash', badCompressed), /compressed checksum mismatch/)
    const badOutput = { ...entry, sha256: '0'.repeat(64) }
    await assert.rejects(materialize('output-hash', badOutput), /output checksum mismatch/)
  })
  await check('illegal paths, duplicate parts and invalid sizes never enter the restore flow', async () => {
    for (const mutate of [
      value => { value.compressed.parts[0].path = '../outside.part' },
      value => { value.compressed.parts.push(value.compressed.parts[0]) },
      value => { value.compressed.parts[0].size = 4 * 1024 * 1024 + 1 },
      value => { value.compressed.outputSize = 128 * 1024 * 1024 + 1 },
    ]) {
      const value = structuredClone(entry); mutate(value)
      await assert.rejects(materialize('invalid', value), /metadata is invalid/)
    }
  })
  await check('the decompressed output is bounded by the declared size, and a failure leaves no temp executable behind', async () => {
    const value = structuredClone(entry); value.compressed.outputSize--
    await assert.rejects(materialize('overflow', value), /exceeds/)
    assert.deepEqual(fs.readdirSync(path.join(scratch, 'overflow/engine-runtime')), [])
  })
  await check('the generated Token-saver code behaves identically to the source for every protocol', () => {
    assert.deepEqual(bundled.PROMPT_FAMILIES, source.PROMPT_FAMILIES)
    for (const settings of [{}, { tokenSaver: { rtk: true, caveman: 'medium', ponytail: 'medium' } }]) {
      const config = source.saverConfig(settings)
      assert.deepEqual(bundled.saverConfig(settings), config)
      for (const wire of ['openai', 'anthropic', 'responses']) {
        const payload = { model: 'fixture', messages: [{ role: 'user', content: '测试' }, { role: 'tool', tool_call_id: 'fixture', content: 'same output\n'.repeat(200) }], input: [{ role: 'user', content: '测试' }] }
        assert.deepEqual(bundled.applyTokenSavers(structuredClone(payload), wire, config), source.applyTokenSavers(structuredClone(payload), wire, config))
      }
    }
    const total = source.emptySavings()
    assert.equal(bundled.describeSavingsTotal(total), source.describeSavingsTotal(total))
  })
  console.log(`${checks}/${checks} engine parts and runtime packaging checks passed`)
} finally {
  if (!path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Cleanup path out of bounds')
  fs.rmSync(scratch, { recursive: true, force: true })
}
