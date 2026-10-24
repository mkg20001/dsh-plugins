/**
 * Render smoke test for the client half.
 *
 * The bundle is a `window.__ModuleLoader__` registration; this test captures
 * the factory, mounts the registered panel with jsdom, feeds the panel API a
 * canned state (one connected identity plus a session ACL), and checks the
 * markup — the render path the host tests cannot cover.
 *
 * `react`, `react-dom`, and `jsdom` are not dependencies of this package: they
 * are resolved from the surrounding installation (a DSH checkout). When they
 * are unavailable the test prints a skip notice and exits successfully.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const here = new URL('.', import.meta.url)
const require = createRequire(join(process.cwd(), 'package.json'))

let React, createRoot, JSDOM
try {
  React = require('react')
  createRoot = require('react-dom/client').createRoot
  JSDOM = require('jsdom').JSDOM
} catch {
  console.log('skipped: react/react-dom/jsdom are not resolvable from this package')
  process.exit(0)
}

let passes = 0
let failures = 0
const ok = (condition, label) => {
  if (condition) { passes += 1; console.log('  ok  ', label) }
  else { failures += 1; console.log('  FAIL', label) }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const state = {
  identities: [
    {
      id: 'dsh',
      label: 'dsh',
      agentId: 'dsh',
      server: 'http://127.0.0.1:8401',
      serverName: 'memvault',
      identityDir: '/home/me/.local/share/memvault/agents/dsh',
      enabled: true,
      source: 'config',
      status: 'connected',
      tools: 62,
    },
    {
      id: 'work',
      label: 'Work',
      agentId: 'work',
      server: 'https://vault.example:9443',
      serverName: 'memvault_work',
      identityDir: '/home/me/.local/share/memvault/agents/work',
      enabled: true,
      source: 'ui',
      status: 'unconfigured',
      tools: 0,
    },
  ],
  acl: { identity: 'dsh', bucket: null, mode: 'read' },
  sessions: {},
}
const responses = {
  'state': state,
  'buckets': { ok: true, buckets: [
    { id: 'c'.repeat(64), name: 'agent:dsh', role: 'standard', items: 3 },
    { id: 'a'.repeat(64), name: 'Team', role: 'standard', items: 3 },
  ] },
  'check': { ok: true, status: { doc_count: 4, peer_count: 1 } },
}
const calls = []
dom.window.fetch = async (url, init) => {
  const path = String(url).split('?')[0].split('/').pop()
  calls.push(path)
  return { ok: true, status: 200, json: async () => responses[path] ?? { ok: true } }
}
globalThis.fetch = dom.window.fetch

let captured
dom.window.__ModuleLoader__ = { load: (registration) => { captured = registration } }
await import(pathToFileURL(new URL('../client.js', here).pathname).href)
ok(captured !== undefined, 'bundle registers a factory')

const exportsObject = captured.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error(`unexpected require: ${specifier}`)
})
ok(typeof exportsObject.apply === 'function', 'exports a plugin apply()')

let view
const ctx = {
  effect: (callback) => { callback(); return () => {} },
  slots: {
    inject: (name, callback) => { callback(); return () => {} },
    register: (options, component) => { view = { options, component }; return () => {} },
  },
}
exportsObject.apply(ctx)
ok(view?.options?.name === 'conversation.view', 'registers into conversation.view')
ok(view?.options?.label?.() === 'Memvault', 'tab label')
ok(typeof view?.component === 'function', 'registers a component')

const container = document.getElementById('root')
const root = createRoot(container)
root.render(React.createElement(view.component, { sessionId: 'session-1' }))
// The panel fetches its state from an effect, then pre-loads the bucket list
// for the bound identity; settle until the bucket table shows a row.
for (let turn = 0; turn < 80 && !container.innerHTML.includes('Team'); turn += 1) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}

const html = container.innerHTML
ok(html.includes('Memvault') && html.includes('Identities'), 'renders the panel heading and identity table')
ok(html.includes('Identity') && html.includes('Tools') && html.includes('Status'), 'identity table headers')
ok(html.includes('+ New identity'), 'identity add control sits in the list header')
ok(html.includes('Session access') && html.includes('Access'), 'renders the access block below the list')
ok(html.includes('dsh') && html.includes('Work'), 'renders both identity rows')
ok((html.match(/dsmv-badge/g) ?? []).length >= 2, 'identity rows carry a status badge')
ok(html.includes('>config<'), 'config identity is tagged')
ok(html.includes('Remove…'), 'panel identity is removable')
ok(html.includes('62'), 'renders the tool count')
ok(html.includes('Bound to') && html.includes('read-only'), 'renders the ACL summary')
ok(html.includes('Agent\'s own bucket') && html.includes('Team'), 'pre-loads and renders the bucket table')
ok((html.match(/type="radio"/g) ?? []).length === 2, 'the agent bucket is merged into the default row')
ok(html.includes('agent:dsh') === false, 'the agent bucket is not listed twice')
ok((html.match(/<svg/g) ?? []).length >= 2, 'bucket rows carry a database icon')
ok(html.includes('read-write') && html.includes('Apply to session'), 'renders the access mode and apply control')
ok(html.includes('Loading buckets') === false, 'bucket preload settled')
ok(html.includes('Redeem and connect') === false, 'the add form starts collapsed')
ok(calls.includes('state') && calls.includes('buckets'), 'panel used the state and buckets endpoints')

// The add form lives in the identity list and expands in place.
const addButton = [...container.querySelectorAll('button')].find((button) =>
  (button.textContent ?? '').includes('+ New identity'))
ok(addButton !== undefined, 'the add control is a button')
addButton.click()
await new Promise((resolve) => setTimeout(resolve, 30))
const withForm = container.innerHTML
ok(withForm.includes('Redeem and connect'), 'the add form expands inside the identity list')
ok(withForm.includes('Memvault server URL'), 'the add form keeps the server field')
ok((withForm.match(/dsmv-table/g) ?? []).length >= 2, 'identity and bucket tables share the table style')

root.unmount()
console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
