import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
export const resourceDirectory = path.join(repositoryRoot, 'packages/desktop/src-tauri/resources')

/** Explicitly select application resources, excluding user directories, tool indexes, dependencies and build caches. */
export function stageDesktopService(destination, { requireWorkspace = false } = {}) {
  fs.mkdirSync(destination, { recursive: true })
  const copy = (relative, target = relative) => {
    const source = path.join(repositoryRoot, relative)
    if (!fs.lstatSync(source).isFile()) throw new Error(`Not a regular resource file: ${relative}`)
    const output = path.join(destination, target)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.copyFileSync(source, output)
  }
  const tree = (relative, allowed) => {
    for (const entry of fs.readdirSync(path.join(repositoryRoot, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`
      if (entry.isDirectory()) tree(child, allowed)
      else if (entry.isFile() && allowed(child)) copy(child)
    }
  }
  tree('src', file => /\.(js|json)$/.test(file))
  for (const name of ['cli', 'service', 'management', 'desktop-update', 'login-terminal', 'open-external', 'eac', 'workbench', 'providers', 'library', 'client-terminal', 'routing']) copy(`packages/standalone/${name}.mjs`)
  tree('packages/standalone/channels', file => file.endsWith('.mjs'))
  const web = 'packages/standalone/web'
  const assets = JSON.parse(fs.readFileSync(path.join(repositoryRoot, web, 'assets.json'), 'utf8'))
  if (!Array.isArray(assets) || assets.length === 0
    || assets.some(name => typeof name !== 'string' || !/^[\w-]+\.(js|css)$/.test(name))
    || new Set(assets).size !== assets.length) {
    throw new Error('Invalid desktop resource manifest')
  }
  for (const name of ['index.html', 'splash.html', 'assets.json', ...assets]) copy(`${web}/${name}`)
  copy('packages/standalone/package.json')
  copy('packages/desktop/service-host.mjs')
  for (const name of ['qoder-auth-wasm.wasm', 'LICENSE', 'NOTICE.md']) copy(`vendor/channel-pack/${name}`)
  // The model workspace runs the same pinned engine the plugin ships, so the
  // desktop build carries that binary and its manifest. `src/magpie-engine.js`
  // resolves `../vendor/magpie/` from its own directory, which inside this
  // staged tree is `resources/vendor/magpie/`.
  for (const name of ['engine.json', 'LICENSE', 'NOTICE.md']) copy(`vendor/magpie/${name}`, `../vendor/magpie/${name}`)
  const target = `${process.platform}-${process.arch}`
  const binaries = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'vendor/magpie/engine.json'), 'utf8')).binaries ?? {}
  const binary = binaries[target]
  if (binary && typeof binary.path === 'string') {
    copy(`vendor/magpie/${binary.path}`, `../vendor/magpie/${binary.path}`)
  } else if (requireWorkspace) {
    // A real installer without the engine ships a workspace page that can never
    // start, so packaging refuses. Staging alone (tests, source inspection) may
    // run on a platform with no pinned build.
    throw new Error(`The model workbench needs the engine binary for ${target}; run node scripts/build-magpie-engine.mjs first`)
  } else {
    console.log(`Note: ${target} has no engine binary; this run only generates service resources without the model workbench`)
  }
  copy('icon.svg', '../icon.svg')
  copy('LICENSE')
  copy('scripts/standalone-third-party.txt', 'THIRD_PARTY_NOTICES.txt')
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n')
}

export async function prepareDesktop({ nodeExecutable = process.execPath, nodeLicense = process.env.OFM_DESKTOP_NODE_LICENSE } = {}) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') throw new Error('The current desktop installer only supports Windows and macOS')
  const cleanEnv = { ...process.env }
  delete cleanEnv.NODE_OPTIONS
  delete cleanEnv.NODE_PATH
  const runtime = JSON.parse(execFileSync(nodeExecutable, ['-p', 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})'], { env: cleanEnv, encoding: 'utf8' }))
  const [major, minor] = runtime.version.slice(1).split('.').map(Number)
  if ((runtime.platform !== 'win32' && runtime.platform !== 'darwin') || runtime.arch !== process.arch || !(major === 22 && minor >= 19 || major >= 24)) {
    throw new Error('The Node runtime must match the local machine architecture and be 22.19+ or 24+')
  }
  const cache = path.join(repositoryRoot, 'packages/desktop/src-tauri/.node-license-cache', `${runtime.version}.txt`)
  let license
  if (nodeLicense) license = fs.readFileSync(nodeLicense)
  else if (fs.existsSync(cache)) license = fs.readFileSync(cache)
  else {
    const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${runtime.version}/LICENSE`, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error('Could not obtain the complete Node license; set OFM_DESKTOP_NODE_LICENSE')
    license = Buffer.from(await response.arrayBuffer())
  }
  if (!license.toString().startsWith('Node.js is licensed for use as follows:') || license.length < 20000) {
    throw new Error('You must provide the complete LICENSE for this Node version, including its third-party notices')
  }
  fs.mkdirSync(path.dirname(cache), { recursive: true })
  fs.writeFileSync(cache, license)
  // Only clean the fixed generated directory, never touch user data directories.
  fs.rmSync(resourceDirectory, { recursive: true, force: true })
  // Packaging an installer: the workspace has to work, so the engine is required.
  stageDesktopService(path.join(resourceDirectory, 'service'), { requireWorkspace: true })
  fs.mkdirSync(path.join(resourceDirectory, 'runtime'), { recursive: true })
  fs.copyFileSync(nodeExecutable, path.join(resourceDirectory, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'))
  fs.writeFileSync(path.join(resourceDirectory, 'runtime/LICENSE'), license)
  fs.writeFileSync(path.join(resourceDirectory, 'runtime/version.json'), JSON.stringify(runtime) + '\n')
  console.log(`Desktop resources generated: complete standalone service and Node ${runtime.version} ${runtime.arch}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await prepareDesktop() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
