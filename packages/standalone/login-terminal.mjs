import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const encode = command => Buffer.from(command, 'utf16le').toString('base64')
const quote = value => `'${value.replaceAll("'", "''")}'`
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`

/** Runs only the fixed local token-retrieval action; it accepts no path or command from the web page. */
export async function openLoginTerminal(dataDir, {
  platform = process.platform, exec = runFile, execPath = process.execPath,
  systemRoot = process.env.SystemRoot ?? 'C:\\Windows',
} = {}) {
  const keyFile = (platform === 'win32' ? path.win32 : path.posix).join(dataDir, 'settings.json')
  if (platform === 'darwin') {
    const copy = [
      'const fs = require("node:fs");',
      'const { execFileSync } = require("node:child_process");',
      'const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const key = settings.managementKey ?? settings.forwardKey;',
      'if (typeof key !== "string" || !key.trim()) throw new Error("missing login token");',
      'execFileSync("/usr/bin/pbcopy", [], { input: key, timeout: 5000, stdio: ["pipe", "ignore", "ignore"] });',
    ].join(' ')
    // The command line contains only the fixed script and config path; the token reaches pbcopy only via stdin.
    const command = [
      `if ${shellQuote(execPath)} -e ${shellQuote(copy)} ${shellQuote(keyFile)} 2>/dev/null; then`,
      `  printf '%s\\n' ${shellQuote('Login token copied. Go back to the web page and paste it into the login token field.')}`,
      `  printf '%s\\n' ${shellQuote('You can close this window when done. Do not share the token with anyone.')}`,
      'else',
      `  printf '%s\\n' ${shellQuote('Failed to get the token; check the local settings.json or use the manual entry point on the page.')}`,
      'fi',
    ].join('\n')
    const script = [
      'on run argv',
      '  tell application "Terminal"',
      '    do script (item 1 of argv)',
      '    activate',
      '  end tell',
      'end run',
    ].join('\n')
    await exec('/usr/bin/osascript', ['-e', script, `/bin/sh -c ${shellQuote(command)}`], { timeout: 10000 })
    return
  }
  if (platform !== 'win32') {
    throw Object.assign(new Error('Automatically opening a terminal is supported on Windows and macOS only; follow the instructions on the page to get the token manually.'), { statusCode: 400 })
  }
  const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const command = [
    "$Host.UI.RawUI.WindowTitle = 'Our Free Model - Get login token'",
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  $ofmLoginSettings = Get-Content -LiteralPath ${quote(keyFile)} -Raw -Encoding UTF8 | ConvertFrom-Json`,
    '  $ofmLoginKey = $ofmLoginSettings.managementKey',
    '  if ([string]::IsNullOrWhiteSpace($ofmLoginKey)) { $ofmLoginKey = $ofmLoginSettings.forwardKey }',
    "  if ([string]::IsNullOrWhiteSpace($ofmLoginKey)) { throw 'The config file contains no login token' }",
    '  Set-Clipboard -Value $ofmLoginKey',
    '  $ofmLoginKey = $null',
    "  Write-Host 'Login token copied. Go back to the web page and paste it into the login token field.' -ForegroundColor Green",
    "  Write-Host 'You can close this window when done. Do not share the token with anyone.'",
    "} catch { Write-Host 'Failed to get the token; check the local settings.json or use the manual entry point on the page.' -ForegroundColor Red }",
  ].join('\n')
  const launch = `Start-Process -FilePath ${quote(powershell)} -WindowStyle Normal -ArgumentList '-NoProfile -STA -NoExit -EncodedCommand ${encode(command)}' -ErrorAction Stop`
  await exec(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(launch)], {
    windowsHide: true, timeout: 10000,
  })
}
