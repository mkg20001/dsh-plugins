import { readFile, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = new URL('.', import.meta.url)
const plugin = await import(new URL('../index.js', here).href)

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
function eq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  ok(a === e, `${label} (got ${a})`)
}

const root = await mkdtemp(join(tmpdir(), 'reagent-test-'))
const stubModule = join(root, 'stub-mcp-client.mjs')
await writeFile(stubModule, 'export const name = "stub-mcp-client"\nexport function apply() {}\n')
const TOKEN_A = 'rgt_0123456789abcdef'
const TOKEN_B = 'rgt_fedcba9876543210'

/** A host context stub recording what the plugin registers. */
function makeHost() {
  const schema = []
  const children = []
  const routes = new Map()
  const executed = []
  const log = []
  const ctx = {
    schema,
    children,
    routes,
    executed,
    log,
    logger: {
      info: (message) => log.push(['info', String(message)]),
      error: (message) => log.push(['error', String(message)]),
    },
    tools: {
      schemas: () => schema.map((entry) => ({ name: entry.name })),
      get: (name) => schema.find((entry) => entry.name === name),
      execute: async (input) => {
        executed.push(input)
        const results = input.calls.map((call) => ({
          callId: call.id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify({ ran: call.name, args: JSON.parse(call.arguments) }),
            }],
          },
        }))
        return { results, additionalContexts: [], concluded: false }
      },
    },
    plugin(namespace, config) {
      const child = {
        namespace,
        config,
        disposed: false,
        async dispose() {
          child.disposed = true
        },
      }
      children.push(child)
      return child
    },
    effect(setup, label) {
      const result = setup()
      ctx.effects ??= []
      ctx.effects.push({ label, result })
      return () => {}
    },
    provide(name, value) {
      ctx.services ??= {}
      ctx.services[name] = value
    },
    inject(_names, callback) {
      callback(ctx)
    },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return async () => {}
        },
      },
    },
  }
  const addTools = (names) => {
    for (const name of names) schema.push({ name })
  }
  return { ctx, addTools }
}

async function start(config) {
  const host = makeHost()
  plugin.apply(host.ctx, { mcpClientModule: stubModule, ...config })
  const service = host.ctx.services.reagent
  await service.ready()
  return { host, service }
}

function post(route, body) {
  return route.fetch(
    new Request('http://127.0.0.1:3080/api/reagent/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

// --- settings ---------------------------------------------------------------
{
  const settings = plugin.resolveSettings({})
  eq(settings.url, 'https://reagent.plan.ai', 'default url')
  eq(settings.serverName, 'reagent', 'default server name')
  ok(settings.stateFile.endsWith(join('.local', 'share', 'dsh-reagent', 'state.json')), 'default state file')
  eq(settings.toolCallTimeoutMs, 60_000, 'default tool timeout')
  eq(settings.token, undefined, 'no default token')

  const custom = plugin.resolveSettings({
    url: 'http://127.0.0.1:8800/',
    serverName: 'rgt',
    token: 'rgt_custom',
    toolCallTimeoutMs: 5000,
    failOnStartupError: true,
    mcpClientModule: '/tmp/x.js',
  })
  eq(custom.url, 'http://127.0.0.1:8800', 'url loses the trailing slash')
  eq(custom.serverName, 'rgt', 'custom namespace')
  eq(custom.token, 'rgt_custom', 'config token kept')
  eq(custom.toolCallTimeoutMs, 5000, 'custom timeout')
  eq(custom.failOnStartupError, true, 'startup failure policy')
  eq(custom.mcpClientModule, '/tmp/x.js', 'module override kept')

  for (const [label, config] of [
    ['bad url', { url: 'ftp://nope' }],
    ['bad namespace', { serverName: 'has space' }],
    ['bad token', { token: 'two words' }],
    ['bad timeout', { toolCallTimeoutMs: -1 }],
  ]) {
    let message
    try {
      plugin.resolveSettings(config)
    } catch (error) {
      message = String(error.message)
    }
    ok(message !== undefined, `${label} rejected`)
  }
}

// --- token masking and precedence -------------------------------------------
{
  eq(plugin.maskToken(''), null, 'empty token has no hint')
  eq(plugin.maskToken('short'), '••••', 'short token fully masked')
  eq(plugin.maskToken(TOKEN_A), 'rgt_…cdef', 'long token keeps a recognizable hint')

  const settings = { url: 'https://config.example', token: 'rgt_config' }
  eq(plugin.computeEffective(settings, {}, {}).tokenSource, 'config', 'config before environment')
  eq(plugin.computeEffective(settings, {}, { REAGENT_TOKEN: 'rgt_env' }).token, 'rgt_config', 'config beats env')
  const fromEnv = plugin.computeEffective({ url: 'https://config.example' }, {}, { REAGENT_TOKEN: 'rgt_env' })
  eq(fromEnv.token, 'rgt_env', 'environment token used last')
  eq(fromEnv.tokenSource, 'env', 'environment source reported')
  const stored = plugin.computeEffective(settings, { token: 'rgt_ui', url: 'https://ui.example' }, {})
  eq(stored.token, 'rgt_ui', 'stored token beats config')
  eq(stored.url, 'https://ui.example', 'stored url beats config')
  eq(stored.tokenSource, 'ui', 'stored source reported')
}

// --- no token: nothing connects, the panel still answers --------------------
{
  delete process.env.REAGENT_TOKEN
  const stateFile = join(root, 'empty-state.json')
  const { host, service } = await start({ url: 'https://reagent.example', stateFile })
  await new Promise((done) => setTimeout(done, 30))
  eq(host.ctx.children.length, 0, 'no token: no mcp-client child')
  const snap = service.snapshot()
  eq(snap.connection.status, 'unconfigured', 'status unconfigured')
  eq(snap.config.tokenHint, null, 'no token hint')

  const stateRoute = host.ctx.routes.get('/api/reagent/state')
  const state = await (await stateRoute.fetch(new Request('http://x/api/reagent/state'))).json()
  eq(state.ok, true, 'state route answers')
  eq(state.connection.status, 'unconfigured', 'state route reports unconfigured')
  ok(host.ctx.routes.has('/api/reagent/connection'), 'connection route registered')
  ok(host.ctx.routes.has('/api/reagent/call'), 'call route registered')
}

// --- connecting from the tab ------------------------------------------------
{
  const stateFile = join(root, 'connected-state.json')
  const { host, service } = await start({ url: 'https://reagent.example', stateFile })
  const saved = await service.connect({ url: 'https://reagent.example', token: TOKEN_A })
  await new Promise((done) => setTimeout(done, 30))

  eq(host.ctx.children.length, 1, 'one connection after a token')
  const child = host.ctx.children[0]
  eq(child.config.transport, 'streamable-http', 'Streamable HTTP transport')
  eq(child.config.url, 'https://reagent.example/mcp', 'MCP endpoint under the base URL')
  eq(child.config.serverName, 'reagent', 'namespace from settings')
  eq(child.config.headers.Authorization, `Bearer ${TOKEN_A}`, 'bearer token header')
  eq(saved.config.tokenHint, 'rgt_…cdef', 'snapshot hints the token')
  eq(saved.connection.status, 'connecting', 'connecting until tools appear')
  ok(!JSON.stringify(saved).includes(TOKEN_A), 'full token never in the snapshot')

  const persisted = JSON.parse(await readFile(stateFile, 'utf8'))
  eq(persisted.token, TOKEN_A, 'pasted token persisted')
  eq(persisted.url, 'https://reagent.example', 'url persisted')
  ok(!JSON.stringify(host.ctx.log).includes(TOKEN_A), 'token never logged')

  host.addTools(['mcp__reagent__projects', 'mcp__reagent__task_list', 'mcp__other__projects'])
  const connected = service.snapshot()
  eq(connected.connection.status, 'connected', 'status connected with reagent tools')
  eq(connected.connection.tools, 2, 'only the reagent namespace counts')
  eq(connected.tools, ['projects', 'task_list'], 'raw tool names listed')

  const callRoute = host.ctx.routes.get('/api/reagent/call')
  const good = await (await post(callRoute, { name: 'projects', args: {} })).json()
  eq(good.ok, true, 'call succeeds')
  ok(good.text.includes('mcp__reagent__projects'), 'call ran the namespaced tool')
  const executedCall = host.ctx.executed.at(-1).calls[0]
  eq(executedCall.name, 'mcp__reagent__projects', 'executed through the registry')
  eq(executedCall.type, 'tool-call', 'executed as a tool-call block')
  eq(JSON.parse(executedCall.arguments), {}, 'arguments travel as model JSON')

  const unknown = await post(callRoute, { name: 'nope', args: {} })
  eq(unknown.status, 503, 'unknown tool is 503')
  eq((await unknown.json()).ok, false, 'unknown tool reports an error')

  const traversal = await post(callRoute, { name: '../../etc/passwd', args: {} })
  eq(traversal.status, 400, 'malformed tool name is 400')

  const badArgs = await post(callRoute, { name: 'projects', args: [] })
  eq(badArgs.status, 400, 'array arguments rejected')

  await service.connect({ token: TOKEN_B })
  eq(host.ctx.children.length, 2, 'token change re-mounts the client')
  eq(host.ctx.children[0].disposed, true, 'previous connection disposed')
  eq(host.ctx.children[1].config.headers.Authorization, `Bearer ${TOKEN_B}`, 'new token in the header')
  eq(JSON.parse(await readFile(stateFile, 'utf8')).token, TOKEN_B, 'new token persisted')

  let invalid
  try {
    await service.connect({ url: 'ftp://nope' })
  } catch (error) {
    invalid = String(error.message)
  }
  ok(invalid?.includes('http(s) URL'), 'invalid URL rejected')
  eq(JSON.parse(await readFile(stateFile, 'utf8')).url, 'https://reagent.example', 'rejected URL leaves state alone')

  const forgotten = await service.forget()
  eq(forgotten.connection.status, 'unconfigured', 'forget disconnects when nothing else supplies a token')
  eq(host.ctx.children[1].disposed, true, 'forget disposes the connection')
  const afterForget = JSON.parse(await readFile(stateFile, 'utf8'))
  eq(afterForget.token, undefined, 'forget removes the stored token')
  eq(afterForget.url, undefined, 'forget removes the stored url')
}

// --- config token and environment token -------------------------------------
{
  const { host, service } = await start({ url: 'https://reagent.example', token: 'rgt_config', stateFile: join(root, 'config-state.json') })
  await new Promise((done) => setTimeout(done, 30))
  eq(host.ctx.children.length, 1, 'config token connects')
  eq(host.ctx.children[0].config.headers.Authorization, 'Bearer rgt_config', 'config token in the header')
  eq(service.snapshot().config.tokenSource, 'config', 'config source reported')

  process.env.REAGENT_TOKEN = 'rgt_environment'
  const env = await start({ url: 'https://reagent.example', stateFile: join(root, 'env-state.json') })
  await new Promise((done) => setTimeout(done, 30))
  eq(env.host.ctx.children.length, 1, 'environment token connects')
  eq(env.host.ctx.children[0].config.headers.Authorization, 'Bearer rgt_environment', 'env token in the header')
  eq(env.service.snapshot().config.tokenSource, 'env', 'env source reported')
  delete process.env.REAGENT_TOKEN
}

// --- a stored token survives a restart --------------------------------------
{
  const stateFile = join(root, 'restart-state.json')
  const first = await start({ url: 'https://reagent.example', stateFile })
  await first.service.connect({ token: TOKEN_A })
  await new Promise((done) => setTimeout(done, 30))

  const second = await start({ url: 'https://reagent.example', stateFile })
  await new Promise((done) => setTimeout(done, 30))
  eq(second.host.ctx.children.length, 1, 'stored token reconnects after a restart')
  eq(second.host.ctx.children[0].config.headers.Authorization, `Bearer ${TOKEN_A}`, 'stored token used')
  eq(second.service.snapshot().config.tokenSource, 'ui', 'stored source after restart')
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
