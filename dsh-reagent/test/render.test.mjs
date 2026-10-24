/**
 * Render smoke test for the Reagent tab.
 *
 * Mounts the registered panel with jsdom and a canned reagent, then walks
 * every tab. react/react-dom/jsdom are resolved from a harness installation
 * (DSH_HARNESS_ROOT, the current directory, or the node executable's
 * ancestors); the test skips cleanly when they are not installed.
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const here = new URL('.', import.meta.url)

function findBase() {
  const candidates = []
  if (process.env.DSH_HARNESS_ROOT) candidates.push(process.env.DSH_HARNESS_ROOT)
  candidates.push(process.cwd())
  let fromArgv = process.argv[1]
  if (fromArgv) {
    for (let depth = 0; depth < 8; depth += 1) {
      candidates.push(dirname(fromArgv))
      const parent = dirname(fromArgv)
      if (parent === fromArgv) break
      fromArgv = parent
    }
  }
  for (const base of candidates) {
    try {
      const manifest = join(base, 'package.json')
      if (!existsSync(manifest)) continue
      const req = createRequire(manifest)
      req.resolve('react')
      req.resolve('react-dom/client')
      req.resolve('jsdom')
      return manifest
    } catch {
      // Try the next base.
    }
  }
  return undefined
}

const base = findBase()
if (base === undefined) {
  console.log('skipped: react, react-dom and jsdom are not resolvable from this environment')
  process.exit(0)
}
const installRequire = createRequire(base)
const { JSDOM } = installRequire('jsdom')
const React = installRequire('react')
const { createRoot } = installRequire('react-dom/client')

let passes = 0
let failures = 0
function ok(condition, label) {
  if (condition) {
    passes += 1
    console.log('  ok  ', label)
  } else {
    failures += 1
    console.log('  FAIL', label)
  }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.MouseEvent = dom.window.MouseEvent

// ---------------------------------------------------------------------------
// Canned reagent
// ---------------------------------------------------------------------------

const now = Math.floor(Date.now() / 1000)
const TASK = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'Fix the thing',
  project: 'site',
  state: 'waiting',
  profile: 'default',
  created: now - 3600,
  updated: now - 120,
  cost: 0.12,
  tokens: 3456,
  origin: 'trigger:site/nightly',
  wait: { kind: 'question', question: 'Which one?', options: ['A', 'B'] },
  report: 'Report text from the task',
  subtasks: [{ id: 'child-1', title: 'Child task', state: 'running' }],
}
const NOTIFICATIONS = [
  { id: 9, at: now - 300, kind: 'done', title: 'Done thing', body: 'All good', seen: false },
  { id: 8, at: now - 900, kind: 'failed', title: 'Failed thing', body: 'Broke', seen: true },
]

const CALLS = {
  projects: [
    { slug: 'site', name: 'Site', active: 1 },
    { slug: 'infra', name: 'Infra', active: 0 },
  ],
  config: { profiles: [{ name: 'default' }, { name: 'deepseek' }] },
  inbox: {
    waiting: [
      {
        id: TASK.id,
        title: TASK.title,
        project: 'site',
        state: 'waiting',
        wait: { kind: 'question', question: 'Which one?', options: ['A', 'B'] },
      },
      {
        id: 'approval-1',
        title: 'Needs approval',
        project: 'site',
        state: 'waiting',
        wait: { kind: 'approval', call: { id: 'call-1', function: { name: 'shell__run', arguments: '{"cmd":"deploy"}' } } },
      },
      {
        id: 'merge-1',
        title: 'Needs merge',
        project: 'site',
        state: 'waiting',
        wait: { kind: 'merge', branch: 'task-branch', diffstat: '2 files changed' },
      },
      {
        id: 'budget-1',
        title: 'Needs budget',
        project: 'site',
        state: 'waiting',
        wait: { kind: 'budget', tokens: 100, cost: 1.5, minutes: 30, budget: {} },
      },
    ],
    failed: [{ id: 'failed-1', title: 'Old failure', project: 'infra' }],
    notifications: NOTIFICATIONS,
  },
  task_list: [
    TASK,
    { id: 'other-1', title: 'Second task', project: 'infra', state: 'running', updated: now - 4000, created: now - 5000 },
  ],
  task_get: TASK,
  task_transcript: {
    last: 'Working on it',
    messages: [
      { role: 'user', content: 'Do it' },
      { role: 'assistant', content: 'Working on it', tool_calls: [{ function: { name: 'shell__run', arguments: '{"cmd":"ls"}' } }] },
      { role: 'tool', content: 'file.txt' },
    ],
  },
  memory_read: { index: '# Global memory\n\n- [a](topics/a.md)', files: ['topics/a.md'], dir: '/var/lib/reagent/memory' },
  docs_list: [{ name: 'reagent', description: 'What reagent is' }],
  docs_read: { name: 'reagent', description: 'What reagent is', body: '# Reagent\n\nDoc body' },
  project_get: {
    slug: 'site',
    name: 'Site',
    path: '/srv/site',
    active: 1,
    merge: 'approve',
    profile: null,
    max_tasks: 1,
    devshell: 'auto',
    default_action: 'allow',
    worktree_sharing: 'shared',
  },
  project_services: {
    services: [
      {
        project: 'site',
        name: 'web',
        description: 'Dev server',
        script: 'exec npm run dev',
        health: 'curl -fs localhost:8080',
        notes: 'restart it when it hangs',
        enabled: true,
        state: { status: 'up', since: now - 4000, job: 'j17057', failures: 0 },
      },
    ],
    errors: [],
  },
  service_logs: { __text: 'listening on :8080\nready' },
  worktree_list: {
    worktrees: [
      { name: 'next', branch: 'next', path: '/tmp/wt-next', ahead: 2, changes: 1, active: 0, sharing_now: 'shared', missing: false },
    ],
    adoptable: [{ path: '/tmp/wt-hand', branch: 'hand' }],
  },
}

const STATE = {
  ok: true,
  config: {
    url: 'https://reagent.plan.ai',
    serverName: 'reagent',
    tokenSource: 'ui',
    tokenHint: 'rgt_…cdef',
    stateFile: '/home/me/.local/share/dsh-reagent/state.json',
    toolCallTimeoutMs: 60000,
  },
  connection: { status: 'connected', tools: 111, lastError: null },
  tools: Object.keys(CALLS),
}

async function fetchStub(input, init) {
  const url = String(input)
  if (url.endsWith('/api/reagent/state')) {
    return { ok: true, status: 200, json: async () => STATE }
  }
  if (url.endsWith('/api/reagent/call')) {
    const body = JSON.parse(String(init?.body ?? '{}'))
    if (body.name === 'memory_read' && body.args?.file !== undefined) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, isError: false, text: JSON.stringify({ file: body.args.file, text: '# Notes\nbody' }) }),
      }
    }
    const value = CALLS[body.name] ?? {}
    if (value.__text !== undefined) {
      return { ok: true, status: 200, json: async () => ({ ok: true, isError: false, text: value.__text }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, isError: false, text: JSON.stringify(value) }) }
  }
  if (url.endsWith('/api/reagent/connection') || url.endsWith('/api/reagent/reconnect') || url.endsWith('/api/reagent/forget')) {
    return { ok: true, status: 200, json: async () => STATE }
  }
  return { ok: false, status: 404, json: async () => ({ ok: false, error: 'not found' }) }
}
globalThis.fetch = fetchStub

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const source = await readFile(new URL('../client.js', here), 'utf8')
let registration
new Function('window', source)({ __ModuleLoader__: { load: (entry) => { registration = entry } } })
const plugin = registration.factory(() => React)

const dictionaries = []
const slots = []
const locale = {
  register(namespace, localeId, dictionary) {
    dictionaries.push({ namespace, localeId, dictionary })
    return () => {}
  },
  bind(namespace) {
    return (key, params) => {
      const dictionary = dictionaries.find((entry) => entry.namespace === namespace && entry.localeId === 'en')?.dictionary ?? {}
      const template = dictionary[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
    }
  },
  subscribe: () => () => {},
}
plugin.apply({
  effect: (setup) => {
    setup()
    return () => {}
  },
  locale,
  slots: {
    inject: (key, callback) => {
      callback()
      return () => {}
    },
    register: (definition, component) => {
      slots.push({ definition, component })
      return () => {}
    },
  },
})

const Component = slots[0].component
const container = document.getElementById('root')
const root = createRoot(container)
root.render(React.createElement(Component, { locale, sessionId: 's1' }))
await new Promise((done) => setTimeout(done, 120))

const text = () => {
  const clone = container.cloneNode(true)
  for (const style of clone.querySelectorAll('style')) style.remove()
  return clone.textContent ?? ''
}
const buttons = () => [...container.querySelectorAll('button')]

async function clickButton(label, predicate) {
  const button = buttons().find((candidate) => {
    const content = (candidate.textContent ?? '').trim()
    return predicate === undefined ? content === label : predicate(content)
  })
  if (button === undefined) throw new Error(`no button matching ${JSON.stringify(label)}`)
  button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await new Promise((done) => setTimeout(done, 120))
}

function has(fragment, label) {
  const found = text().includes(fragment)
  if (!found && process.env.DEBUG) console.log(`--- missing ${JSON.stringify(label ?? fragment)} ---\n${text().slice(0, 2500)}`)
  return found
}

ok(has('Reagent'), 'panel renders its title')
ok(has('Waiting for you'), 'inbox renders waiting tasks')
ok(has('Which one?'), 'a waiting question is shown')
ok(has('Waiting for approval'), 'an approval wait is shown')
ok(has('shell.run'), 'the approval names the call')
ok(has('task-branch'), 'a merge wait shows its branch')
ok(has('Waiting for a budget decision'), 'a budget wait renders')
ok(has('Done thing'), 'notifications are shown')
ok(has('Old failure'), 'failed tasks are shown')

await clickButton('Tasks')
ok(has('Fix the thing'), 'tasks list renders')
ok(has('Second task'), 'tasks list shows every task')
await clickButton('Fix the thing', (content) => content.includes('Fix the thing'))
ok(has('Report text from the task'), 'task detail renders the report')
ok(has('Conversation'), 'task detail renders the transcript section')
ok(has('Working on it'), 'transcript messages render')
ok(has('Child task'), 'subtasks render')

await clickButton('Projects')
ok(has('Site'), 'projects render')
ok(has('Start a task here'), 'project detail renders')

await clickButton('Memory')
ok(has('topics/a.md'), 'memory files render')
await clickButton('topics/a.md', (content) => content.includes('topics/a.md'))
const area = container.querySelector('textarea')
ok(area !== null && area.value.includes('# Notes'), 'memory file content loads into the editor')

await clickButton('Docs')
await clickButton('reagent', (content) => content.includes('What reagent is'))
ok(has('Doc body'), 'docs render')

await clickButton('Services')
ok(has('web'), 'services render')
ok(has('Dev server'), 'service description renders')
await clickButton('Logs')
ok(has('listening on :8080'), 'service logs render')

await clickButton('Worktrees')
ok(has('next'), 'worktrees render')
ok(has('hand'), 'adoptable worktrees render')

await clickButton('Settings')
ok(has('Connection'), 'settings render')
const urlInput = [...container.querySelectorAll('input')].find((input) => input.value === 'https://reagent.plan.ai')
ok(urlInput !== undefined, 'settings show the current URL')

console.log(`\n${passes} passed, ${failures} failed`)
root.unmount()
process.exit(failures === 0 ? 0 : 1)
