import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const here = new URL('.', import.meta.url)
const plugin = await import(new URL('../index.js', here).href)

let passes = 0
let failures = 0
function ok(condition, label) {
  if (condition) { passes += 1; console.log('  ok  ', label) }
  else { failures += 1; console.log('  FAIL', label) }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  ok(a === e, `${label} (got ${a})`)
}

const TOOLS = ['memvault_status', 'memvault_search', 'memvault_put', 'memvault_bucket_list', 'memvault_bucket_create']

/** A host context stub recording what the plugin registers. */
function makeHost({ stateFile, dataDir }) {
  const log = []
  const children = []
  const routes = new Map()
  const listeners = new Map()
  const agents = []
  const guardFns = []
  const sections = []
  const restrictions = []
  const schema = [
    ...TOOLS.map((raw) => ({ name: `mcp__memvault__${raw}` })),
    ...TOOLS.map((raw) => ({ name: `mcp__memvault_work__${raw}` })),
    { name: 'bash' },
  ]
  const executed = []

  const ctx = {
    log,
    children,
    routes,
    listeners,
    agents: { list: () => agents, get: (id) => agents.find((item) => item.id === id) },
    agentList: agents,
    guardFns,
    sections,
    restrictions,
    schema,
    executed,
    services: {},
    logger: {
      info: (message) => log.push(['info', String(message)]),
      error: (message) => log.push(['error', String(message)]),
    },
    effect(setup, label) {
      const disposer = setup()
      ctx.disposers ??= []
      ctx.disposers.push({ label, disposer })
      return () => {}
    },
    provide(name, value) { ctx.services[name] = value },
    plugin(ns, config) {
      const child = { ns, config, disposed: false }
      children.push(child)
      return { dispose() { child.disposed = true } }
    },
    on(event, fn) {
      listeners.set(event, [...(listeners.get(event) ?? []), fn])
      return () => {}
    },
    emit(event, payload) { for (const fn of listeners.get(event) ?? []) fn(payload) },
    tools: {
      schemas: () => schema,
      get: (name) => schema.find((item) => item.name === name),
      execute: async (input) => {
        executed.push(input)
        const raw = input.name.slice(input.name.lastIndexOf('__') + 2)
        if (raw === 'memvault_status') {
          return { content: [{ type: 'text', text: JSON.stringify({ doc_count: 3, peer_count: 1 }) }] }
        }
        if (raw === 'memvault_bucket_list') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify([
                { id: 'a'.repeat(64), name: 'Agent dsh', role: 'agent', envelope_count: 5, is_attached: true },
                { id: 'b'.repeat(64), name: 'Team', role: 'standard', envelope_count: 2, is_attached: true },
              ]),
            }],
          }
        }
        return { content: [{ type: 'text', text: 'error: boom' }] }
      },
    },
    inject(_names, callback) { callback(ctx) },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return async () => {}
        },
      },
    },
  }

  /** Live agent stub: agent.ctx carries the tools/systemPrompt faces the ACL uses. */
  const addAgent = (id) => {
    const agent = {
      id,
      ctx: {
        tools: {
          restrict(filter) {
            restrictions.push({ agent: id, filter })
            return () => {}
          },
          guard(fn) {
            guardFns.push({ agent: id, fn })
            return () => {}
          },
        },
        systemPrompt: {
          section(section) {
            sections.push({ agent: id, section })
            return () => {}
          },
        },
      },
    }
    agents.push(agent)
    return agent
  }

  return { ctx, addAgent }
}

async function waitFor(predicate, label, timeout = 4000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return true
    await new Promise((done) => setTimeout(done, 25))
  }
  console.log('  FAIL', `${label} (timed out)`)
  failures += 1
  return false
}

/** Write a minimal memvault-shaped key so the identity counts as enrolled. */
async function writeIdentity(dir) {
  await mkdir(dir, { recursive: true })
  const pem = '-----BEGIN ED25519 PRIVATE KEY-----\n' + Buffer.alloc(32, 7).toString('base64') + '\n-----END ED25519 PRIVATE KEY-----\n'
  await writeFile(join(dir, 'private_key.pem'), pem, { mode: 0o600 })
}

const root = await mkdtemp(join(tmpdir(), 'mv-'))
const dataDir = join(root, 'data')
const stateFile = join(dataDir, 'dsh-state.json')

// --- settings: one identity by default --------------------------------------
{
  const settings = plugin.resolveSettings({ dataDir })
  eq(settings.identities.length, 1, 'one default identity')
  eq(settings.identities[0].id, 'dsh', 'default identity id')
  eq(settings.identities[0].serverName, 'memvault', 'default namespace')
  ok(settings.stateFile === stateFile, 'state file under the data dir')

  const many = plugin.resolveSettings({
    dataDir,
    identities: [
      { id: 'dsh', agentId: 'dsh', label: 'Default' },
      { agentId: 'work' },
    ],
  })
  eq(many.identities.map((item) => item.serverName), ['memvault', 'memvault_work'], 'second identity gets its own namespace')
  eq(many.identities[1].identityDir, join(dataDir, 'agents', 'work'), 'identity dir follows the agent id')
}

// --- activation, connections, snapshot --------------------------------------
{
  await writeIdentity(join(dataDir, 'agents', 'dsh'))
  const host = makeHost({ stateFile, dataDir })
  plugin.apply(host.ctx, { dataDir })
  await waitFor(() => host.ctx.services.memvault !== undefined, 'service provided')
  await waitFor(() => host.ctx.children.length === 1, 'one connection started')
  eq(host.ctx.children[0]?.config.serverName, 'memvault', 'connection uses the identity namespace')
  eq(host.ctx.children[0]?.config.transport, 'stdio', 'stdio transport')
  ok(host.ctx.children[0]?.config.args.includes('--identity-dir'), 'passes the identity dir')
  ok(!JSON.stringify(host.ctx.children[0]?.config.env).includes('TOKEN'), 'no token in the connection env')

  const snapshot = host.ctx.services.memvault.snapshot('s1')
  eq(snapshot.identities[0]?.status, 'connected', 'identity reports connected when its tools exist')
  eq(snapshot.acl, null, 'no ACL by default')
  await waitFor(() => host.ctx.routes.size === 7, 'seven panel routes registered')
  ok(host.ctx.routes.has('/api/memvault/session'), 'session route registered')
  ok(host.ctx.routes.has('/api/memvault/remove'), 'remove route registered')

  // --- per-session ACL ------------------------------------------------------
  host.addAgent('s1')
  const applied = await host.ctx.services.memvault.setSessionAcl('s1', {
    identity: 'dsh',
    bucket: 'a'.repeat(64),
    mode: 'read',
  })
  eq(applied.acl?.identity, 'dsh', 'ACL bound to the identity')
  eq(host.ctx.restrictions.length, 1, 'restriction installed')
  const denied = host.ctx.restrictions[0].filter.deny
  ok(denied.includes('mcp__memvault__memvault_put'), 'write tools denied in read-only mode')
  ok(!denied.includes('mcp__memvault__memvault_search'), 'read tools stay visible')
  ok(!denied.includes('bash'), 'non-memvault tools stay visible')

  eq(host.ctx.sections.length, 1, 'prompt section registered')
  const prompt = host.ctx.sections[0].section.text()
  ok(prompt.includes('read-only'), 'prompt states read-only')
  ok(prompt.includes('a'.repeat(64)), 'prompt names the bound bucket')

  const guard = host.ctx.guardFns[0].fn
  ok(guard({ name: 'mcp__memvault__memvault_search', arguments: { bucket: 'a'.repeat(64) } }) === undefined, 'allowed bucket passes')
  ok(guard({ name: 'mcp__memvault__memvault_search', arguments: {} })?.includes('only use bucket'), 'missing bucket denied when one is bound')
  ok(guard({ name: 'mcp__memvault__memvault_search', arguments: { bucket: 'b'.repeat(64) } })?.includes('only use bucket'), 'other bucket denied')
  ok(guard({ name: 'mcp__memvault__memvault_put', arguments: { bucket: 'a'.repeat(64) } })?.includes('read-only'), 'write denied in read-only mode')
  ok(guard({ name: 'bash', arguments: {} }) === undefined, 'unrelated tools untouched')

  // --- panel API handlers ---------------------------------------------------
  const stateRoute = host.ctx.routes.get('/api/memvault/state')
  const stateResponse = await stateRoute.fetch(new Request('http://x/api/memvault/state?session=s1'))
  const stateBody = await stateResponse.json()
  eq(stateBody.acl?.identity, 'dsh', 'state route returns the session ACL')

  const sessionRoute = host.ctx.routes.get('/api/memvault/session')
  const clearResponse = await sessionRoute.fetch(new Request('http://x/api/memvault/session', {
    method: 'POST',
    body: JSON.stringify({ sessionId: 's1', acl: null }),
  }))
  const cleared = await clearResponse.json()
  eq(cleared.acl, null, 'clearing the ACL through the API')
  eq(host.ctx.restrictions.length, 1, 'no new restriction after clearing')

  // Re-bind with the agent's own bucket, read-write.
  await host.ctx.services.memvault.setSessionAcl('s1', { identity: 'dsh', bucket: null, mode: 'write' })
  const guard2 = host.ctx.guardFns.at(-1).fn
  ok(guard2({ name: 'mcp__memvault__memvault_search', arguments: {} }) === undefined, 'omitted bucket allowed for the default bucket')
  ok(guard2({ name: 'mcp__memvault__memvault_search', arguments: { bucket: 'b'.repeat(64) } })?.includes('default bucket'), 'explicit bucket denied for the default-bucket binding')
  ok(guard2({ name: 'mcp__memvault__memvault_put', arguments: {} }) === undefined, 'write allowed in read-write mode')

  // --- check + buckets through the tools registry --------------------------
  const check = await host.ctx.services.memvault.check('dsh')
  ok(check.ok === true, 'check succeeds')
  eq(check.status?.doc_count, 3, 'check returns the status payload')
  const buckets = await host.ctx.services.memvault.buckets('dsh')
  eq(buckets.length, 2, 'bucket list parsed')
  eq(buckets[1].name, 'Team', 'bucket name parsed')
  ok(host.ctx.executed.every((call) => call.name.startsWith('mcp__memvault__')), 'host calls run through the registry')

  // --- persistence ----------------------------------------------------------
  const saved = JSON.parse(await readFile(stateFile, 'utf8'))
  eq(saved.sessions.s1?.mode, 'write', 'ACL persisted')
  eq(saved.identities.length, 1, 'identity persisted')
}

// --- restart restores the ACL and applies it to a new agent ------------------
{
  const host = makeHost({ stateFile, dataDir })
  plugin.apply(host.ctx, { dataDir })
  await waitFor(() => host.ctx.services.memvault !== undefined, 'service provided after restart')
  await waitFor(() => host.ctx.services.memvault.snapshot('s1').identities.length === 1, 'state restored after restart')
  const restored = host.ctx.services.memvault.snapshot('s1')
  eq(restored.acl?.mode, 'write', 'ACL restored from disk')
  host.addAgent('s1')
  host.ctx.emit('agent/created', { agent: host.ctx.agentList[0] })
  await waitFor(() => host.ctx.guardFns.length === 1, 'restored ACL applied to the agent')
  ok(host.ctx.sections.length === 1, 'prompt section restored')
}

// --- multi-identity isolation ----------------------------------------------
{
  const manyRoot = await mkdtemp(join(tmpdir(), 'mv-many-'))
  const manyData = join(manyRoot, 'data')
  await writeIdentity(join(manyData, 'agents', 'dsh'))
  await writeIdentity(join(manyData, 'agents', 'work'))
  const host = makeHost({ stateFile: join(manyData, 'dsh-state.json'), dataDir: manyData })
  plugin.apply(host.ctx, {
    dataDir: manyData,
    identities: [{ agentId: 'dsh' }, { agentId: 'work' }],
  })
  await waitFor(() => host.ctx.children.length === 2, 'both identities connect')
  eq(host.ctx.children.map((child) => child.config.serverName).sort(), ['memvault', 'memvault_work'], 'distinct namespaces')

  const agent = host.addAgent('s2')
  await host.ctx.services.memvault.setSessionAcl('s2', { identity: 'dsh', bucket: null, mode: 'write' })
  const deny = host.ctx.restrictions[0].filter.deny
  ok(deny.includes('mcp__memvault_work__memvault_search'), 'other identity tools hidden')
  ok(deny.includes('mcp__memvault_work__memvault_put'), 'other identity write tools hidden')

  const guard = host.ctx.guardFns[0].fn
  ok(guard({ name: 'mcp__memvault_work__memvault_search', arguments: {} })?.includes('other memvault identities'), 'calls to the other identity denied')
  ok(guard({ name: 'mcp__memvault__memvault_put', arguments: {} }) === undefined, 'own identity writes allowed')

  host.ctx.emit('tools/change')
  await new Promise((done) => setTimeout(done, 50))
  eq(host.ctx.restrictions.length, 1, 'tools/change does not loop or duplicate the restriction')
}

// --- redeeming a new identity ----------------------------------------------
{
  const stub = join(root, 'stub-enroll.mjs')
  await writeFile(stub, `#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const argv = process.argv.slice(2)
const index = argv.indexOf('--identity-dir')
const dir = argv[index + 1]
await mkdir(dir, { recursive: true })
await writeFile(join(dir, 'private_key.pem'), 'stub\\n')
`)
  await chmod(stub, 0o755)

  const host = makeHost({ stateFile, dataDir })
  plugin.apply(host.ctx, { dataDir, command: stub })
  await waitFor(() => host.ctx.services.memvault !== undefined, 'service for redeem')
  const result = await host.ctx.services.memvault.redeem({
    agentId: 'work',
    label: 'Work',
    server: 'https://vault.example:9443',
    token: 'mvjoin1:secret',
  })
  eq(result.identities.length, 2, 'new identity added')
  const added = result.identities.find((item) => item.agentId === 'work')
  eq(added?.status, 'connected', 'new identity reports its tools')
  ok(host.ctx.children.some((child) => child.config.serverName === 'memvault_work'), 'new identity spawned its own namespace')
  ok(result.identities.some((item) => item.serverName === 'memvault_work'), 'namespace derived from the agent id')
  eq(added?.server, 'https://vault.example:9443', 'identity keeps its own server')
  ok(
    host.ctx.children.some(
      (child) =>
        child.config.serverName === 'memvault_work' &&
        child.config.args.includes('https://vault.example:9443'),
    ),
    'connection targets the identity server',
  )
  let badServer
  try {
    await host.ctx.services.memvault.redeem({ agentId: 'bad', token: 'mvjoin1:x', server: 'ftp://nope' })
  } catch (failure) { badServer = String(failure.message) }
  ok(badServer?.includes('http(s) URL'), 'invalid server rejected')
  eq(host.ctx.services.memvault.snapshot().identities.length, 2, 'rejected server adds no identity')
  ok(!JSON.stringify(host.ctx.log).includes('mvjoin1:secret'), 'token never logged')
  const saved = JSON.parse(await readFile(stateFile, 'utf8'))
  eq(saved.identities.length, 2, 'new identity persisted')
  ok(!JSON.stringify(saved).includes('mvjoin1:secret'), 'token never persisted')

  // --- removing the identity -------------------------------------------------
  await host.ctx.services.memvault.setSessionAcl('s3', { identity: 'work', bucket: null, mode: 'read' })
  eq(host.ctx.services.memvault.snapshot('s3').acl?.identity, 'work', 'session bound to the new identity')
  const removed = await host.ctx.services.memvault.remove('work', { deleteCredential: true })
  eq(removed.identities.length, 1, 'identity record removed')
  eq(removed.clearedSessions, 1, 'session binding cleared')
  eq(removed.acl, null, 'cleared session has no ACL')
  ok(removed.warning === undefined, 'credential directory removed without a warning')
  let keyGone = false
  try { await access(join(dataDir, 'agents', 'work', 'private_key.pem')) } catch { keyGone = true }
  ok(keyGone, 'private key deleted on request')
  ok(
    host.ctx.children
      .filter((child) => child.config.serverName === 'memvault_work')
      .every((child) => child.disposed === true),
    'the removed identity connection was disposed',
  )
  eq(
    JSON.parse(await readFile(stateFile, 'utf8')).sessions.s3,
    undefined,
    'cleared binding persisted',
  )

  let configError
  try { await host.ctx.services.memvault.remove('dsh') } catch (failure) { configError = String(failure.message) }
  ok(configError?.includes('defined by the plugin configuration'), 'configured identity cannot be removed')

  let unknownError
  try { await host.ctx.services.memvault.remove('nope') } catch (failure) { unknownError = String(failure.message) }
  ok(unknownError?.includes('unknown identity'), 'unknown identity rejected')
}

// --- API rejects a bad ACL --------------------------------------------------
{
  const host = makeHost({ stateFile, dataDir })
  plugin.apply(host.ctx, { dataDir })
  await waitFor(() => host.ctx.services.memvault !== undefined, 'service for validation')
  let error
  try {
    await host.ctx.services.memvault.setSessionAcl('s1', { identity: 'nope', bucket: null, mode: 'read' })
  } catch (failure) { error = String(failure.message) }
  ok(error?.includes('unknown identity'), 'unknown identity rejected')
  error = undefined
  try {
    await host.ctx.services.memvault.setSessionAcl('s1', { identity: 'dsh', bucket: 'xyz', mode: 'read' })
  } catch (failure) { error = String(failure.message) }
  ok(error?.includes('64 lowercase hex'), 'malformed bucket rejected')
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
