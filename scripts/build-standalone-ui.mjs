/** Generate all local assets from the standalone sources; check mode writes no files. */
import './build-sponsor.mjs'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const project = fileURLToPath(new URL('../packages/standalone/', import.meta.url))
const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [project] })).href)
const result = await build({ configFile: `${project}/vite.config.mjs`, logLevel: 'warn' })
const output = Array.isArray(result) ? result.flatMap(value => value.output) : result.output
const files = new Map(output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source]))
const assets = [...files.keys()].filter(name => name !== 'index.html').sort()
if (assets.some(name => !/^[\w-]+\.(js|css)$/.test(name))) throw new Error('The build produced an unsupported asset path')
files.set('assets.json', JSON.stringify(assets, null, 2) + '\n')
const directory = new URL('../packages/standalone/web/', import.meta.url)
const manifest = new URL('assets.json', directory)
const previous = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : ['channels.js', 'channels.css']
const existing = fs.readdirSync(directory).filter(name => /^[\w-]+\.(js|css)$/.test(name))
const obsolete = existing.filter(name => !files.has(name))
if (process.argv.includes('--check') && obsolete.length > 0) {
  throw new Error(`The standalone build has unreferenced stale assets: ${obsolete.join(', ')}`)
}
for (const [name, content] of files) {
  const file = new URL(name, directory)
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(Buffer.from(content))) {
      throw new Error(`Standalone asset needs to be regenerated: ${name}`)
    }
  } else fs.writeFileSync(file, content)
}
if (!process.argv.includes('--check')) {
  for (const name of new Set([...previous, ...obsolete])) {
    if (/^[\w-]+\.(js|css)$/.test(name) && !files.has(name)) fs.rmSync(new URL(name, directory), { force: true })
  }
}
console.log(`Standalone pages generated consistently: ${assets.length} local assets`)
