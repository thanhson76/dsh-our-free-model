/** Inline the shared sponsor component and local images into the zero-build plugin; --check is for CI. */
import fs from 'node:fs'
const root = new URL('../', import.meta.url)
// Git release files uniformly use LF, so Windows workspaces must also generate identical bytes.
const readText = file => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
const source = readText(new URL('src/sponsor.js', root)).replace(/^export /gm, '')
const css = readText(new URL('src/sponsor.css', root))
const image = fs.readFileSync(new URL('docs/images/sponsor-beichen-examples.jpg', root)).toString('base64')
const block = `    // BEGIN GENERATED SPONSOR\n${source}\n    const SPONSOR_CSS = ${JSON.stringify(css)}\n    const SPONSOR_IMAGE = 'data:image/jpeg;base64,${image}'\n    const { SponsorPage, SponsorNotice } = createSponsorUI(React, SPONSOR_IMAGE, ReactDOM.createPortal)\n    // END GENERATED SPONSOR`
const file = new URL('client.js', root)
const old = readText(file)
if (!old.includes('    // BEGIN GENERATED SPONSOR')) {
  console.log('The sponsor component has been removed from the plugin, skipping sponsor inlining')
} else {
const next = old.replace(/    \/\/ BEGIN GENERATED SPONSOR[\s\S]*?    \/\/ END GENERATED SPONSOR/, block)
if (next === old && !old.includes(block)) throw new Error('Sponsor inline location does not exist')
if (process.argv.includes('--check')) { if (next !== old) throw new Error('Run node scripts/build-sponsor.mjs to update the plugin sponsor component') }
else fs.writeFileSync(file, next)
console.log('The shared sponsor component matches the content inlined in the plugin')
}
