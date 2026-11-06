#!/usr/bin/env node
import path from 'node:path'
import { startStandalone } from './service.mjs'

const usage = `Our Free Model standalone local service
Usage: node packages/standalone/cli.mjs [options]

  --port <port>       Listening port, default 18900 (an available port is chosen automatically on conflict)
  --data-dir <dir>    Data directory, default OFM_HOME or ~/.our-free-model
  --no-refresh        Skip the startup and periodic refresh; manual refresh and inference still work
  --probe             Deprecated (kept for compatibility): automatic probing sends no requests
  --lan               Enable and save the LAN inference relay (separate key; the management page stays local-only)
  --no-lan            Disable and save the LAN inference relay
  --lan-port <port>   Save the desired LAN port, default 0; does not enable the relay on its own
  --help              Show help
`

async function main() {
  const options = {}
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index]
    if (flag === '--help') { process.stdout.write(usage); return }
    if (flag === '--no-refresh') { options.refresh = false; continue }
    if (flag === '--probe') { options.probe = true; continue }
    if (flag === '--lan' || flag === '--no-lan') { options.lanEnabled = flag === '--lan'; continue }
    if (!['--port', '--data-dir', '--lan-port'].includes(flag) || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
      throw new Error(`Unknown option or missing argument: ${flag}`)
    }
    const value = process.argv[++index]
    if (flag === '--port' || flag === '--lan-port') {
      if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error('The port must be an integer between 0 and 65535')
      options[flag === '--port' ? 'port' : 'lanPort'] = Number(value)
    } else options.dataDir = path.resolve(value)
  }
  const service = await startStandalone(options)
  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    void service.close().catch(error => {
      process.stderr.write(`Shutdown failed: ${error.message}\n`)
      process.exitCode = 1
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  process.stdout.write(`${service.product} ${service.version}\nManagement page (one-time login, valid for 10 minutes):${service.managementUrl}\nAPI: ${service.url}/v1\nAPI Key is saved in:${service.keyFile}\n`)
  if (service.lan.running) {
    process.stdout.write(`LAN API: ${service.lan.baseUrls.join(', ') || `port ${service.lan.port}`}\nLAN Key: view it in the local management API (separate from the local API Key)\n`)
  } else if (service.lan.error) process.stderr.write(`${service.lan.error}\n`)
}

main().catch(error => {
  process.stderr.write(`Startup failed: ${error.code === 'EEXIST' ? 'A service is already running with this data directory, or the owner of service.lock cannot be confirmed; exit the existing service first. Windows and Linux automatically reclaim stale locks whose owning process has confirmedly exited.' : error.message}\n`)
  process.exitCode = 1
})
