import readline from 'node:readline'
import { startStandalone } from '../standalone/service.mjs'

// The desktop shell only controls the service it started itself; stdin closing means the parent process has exited.
let service
let closing
let parentGone = false
const input = readline.createInterface({ input: process.stdin })
const stop = () => {
  parentGone = true
  if (closing || !service) return closing
  closing = service.close().catch(() => { process.exitCode = 1 }).finally(() => {
    input.close()
    process.stdin.destroy()
  })
  return closing
}
input.on('line', line => { if (line === 'shutdown') void stop() })
input.on('close', () => { void stop() })
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  const args = process.argv.slice(2)
  const options = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-refresh') options.refresh = false
    else if (args[i] === '--data-dir' && args[i + 1]) options.dataDir = args[++i]
    else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? '')) options.port = Number(args[++i])
    else throw new Error('Invalid desktop service startup arguments')
  }
  service = await startStandalone(options)
  if (parentGone) await stop()
  else process.stdout.write(JSON.stringify({
    protocol: 'ofm-desktop-ready/v1', product: service.product, pid: process.pid,
    port: service.port, managementUrl: service.managementUrl,
  }) + '\n')
} catch (error) {
  // Only the error code is passed on; startup information never leaks accounts, API keys or login tokens.
  process.stdout.write(JSON.stringify({ protocol: 'ofm-desktop-error/v1',
    code: error?.code === 'EEXIST' ? 'DATA_DIRECTORY_IN_USE' : 'START_FAILED' }) + '\n')
  process.exitCode = 1
  input.close()
  process.stdin.destroy()
}
