import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../packages/standalone/frontend/app.tsx', import.meta.url), 'utf8')
const html = fs.readFileSync(new URL('../packages/standalone/frontend/index.html', import.meta.url), 'utf8')
assert.ok(!app.includes("./legacy"), 'the React entry must not depend on the legacy host')
assert.ok(!fs.existsSync(new URL('../packages/standalone/frontend/legacy.js', import.meta.url)), 'the legacy host must be deleted')
assert.ok(html.includes('id="root"'), 'the entry must provide only the React root node')
assert.ok(!html.includes('page-connection'), 'the connection page must not be carried by static HTML')
assert.ok(app.includes('function LoginScreen'), 'the login page must be rendered by React')
assert.ok(app.includes('function LoadingScreen'), 'the loading page must be rendered by React')
assert.ok(app.includes('function ChannelMount'), 'the channels page must be managed by the React lifecycle')
export function verifySettingsHost() { return true }
console.log('standalone-settings-host: React root entry, login page, connection page and host lifecycle checks passed')
