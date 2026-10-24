/**
 * Memvault identities, MCP connections, and a per-session local ACL.
 *
 * One plugin activation owns everything memvault-related:
 *
 *  - Identities. Each identity is an agent id plus an identity directory that
 *    holds `private_key.pem`. A missing credential is created by redeeming a
 *    provisioning token with `memvault-mcp enroll` (the token travels in the
 *    child's environment, never argv, and is never written to disk).
 *  - Connections. Each enabled identity gets its own `mcp-client` child over
 *    stdio, so its tools appear as `mcp__<serverName>__<memvault tool>`.
 *  - Per-session ACL. A session may be bound to one identity, one bucket, and
 *    read-only or read-write access. The binding is stored locally and
 *    enforced in this process: the other identities' tools are hidden from the
 *    agent, read-only sessions lose every write tool, and a guard denies calls
 *    that name a bucket outside the binding.
 *
 * The right-sidebar panel (`client.js`) talks to the authenticated JSON routes
 * this module registers on `ctx.connection.fetch` under `/api/memvault/…`.
 *
 * @module @local/dsh-memvault
 */

import { spawn } from 'node:child_process'
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

/** Diagnostics label used by the Loader. */
export const name = 'memvault'

/** Services this plugin needs before it can activate. */
export const inject = ['tools', 'agents']

const DEFAULT_SERVER = 'http://127.0.0.1:8401'
const DEFAULT_AGENT_ID = 'dsh'
const DEFAULT_SERVER_NAME = 'memvault'
const DEFAULT_COMMAND = 'memvault-mcp'
const ENROLL_TIMEOUT_MS = 60_000
const KEY_FILE = 'private_key.pem'
const STATE_VERSION = 1
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const ACL_SECTION = 'memvault:session-acl'
const ACL_ORDER = 4200

/**
 * Memvault tools that only read. Everything in a bound identity's namespace
 * that is not listed here counts as a write and is hidden from read-only
 * sessions. Names are the raw MCP tool names, without the namespace prefix.
 */
const READ_TOOLS = new Set([
  'memvault_get',
  'memvault_search',
  'memvault_list',
  'memvault_list_all',
  'memvault_doc_history',
  'memvault_get_tags',
  'memvault_read_range',
  'memvault_extract_text',
  'memvault_file_info',
  'memvault_get_entity',
  'memvault_list_entities',
  'memvault_graph_query',
  'memvault_traverse',
  'memvault_edges',
  'memvault_vfs_ls',
  'memvault_vfs_tree',
  'memvault_vfs_resolve',
  'memvault_vfs_find',
  'memvault_skill_list',
  'memvault_skill_get',
  'memvault_bucket_list',
  'memvault_bucket_get',
  'memvault_bucket_grants_list',
  'memvault_bucket_merges',
  'memvault_view_list',
  'memvault_share_inbox',
  'memvault_share_outbox',
  'memvault_export',
  'memvault_export_vault',
  'memvault_status',
  'memvault_audit',
])

/** First defined non-empty string, so env fallbacks never shadow real values. */
function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** Platform data directory matching memvault's own `dirs::data_local_dir()`. */
function platformDataDir() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'memvault')
  if (process.platform === 'win32') {
    return join(firstString(process.env.LOCALAPPDATA) ?? join(homedir(), 'AppData', 'Local'), 'memvault')
  }
  return join(firstString(process.env.XDG_DATA_HOME) ?? join(homedir(), '.local', 'share'), 'memvault')
}

/** Lowercase namespace fragment derived from an identity id. */
function slug(value) {
  const text = String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return (text || 'agent').slice(0, 18)
}

/** Normalize one configured identity entry. */
function configuredIdentity(entry, settings, index, taken) {
  const agentId = firstString(entry.agentId, entry.id) ?? (index === 0 ? settings.agentId : undefined)
  if (agentId === undefined) throw new Error('memvault: every identity needs an agentId')
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new Error(`memvault: agentId "${agentId}" is not a valid agent name`)
  }
  const id = firstString(entry.id, agentId)
  const identityDir = entry.identityDir
    ? resolve(String(entry.identityDir))
    : join(
        entry.dataDir ? resolve(String(entry.dataDir)) : settings.dataDirRoot,
        'agents',
        agentId,
      )
  if (basename(identityDir) !== agentId) {
    throw new Error(
      `memvault: identityDir for "${id}" must end in the agent id "${agentId}" — memvault ` +
        `derives the agent's name from the directory basename`,
    )
  }
  const fallbackName = index === 0 ? settings.serverName : `${settings.serverName}_${slug(id)}`
  let serverName = firstString(entry.serverName, fallbackName)
  while (taken.has(serverName)) serverName = `${serverName.slice(0, 28)}_${randomBytes(2).toString('hex')}`
  taken.add(serverName)
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    throw new Error(`memvault: serverName "${serverName}" must match [A-Za-z0-9_-]{1,32}`)
  }
  return {
    id,
    label: firstString(entry.label, agentId),
    agentId,
    server: (firstString(entry.server, settings.server)).replace(/\/+$/, ''),
    identityDir,
    serverName,
    enabled: entry.enabled !== false,
    source: 'config',
  }
}

/** Normalize and validate the row's config. */
export function resolveSettings(config) {
  if (config === null || config === undefined) config = {}
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('memvault: config must be an object')
  }

  const server = firstString(config.server, process.env.MEMVAULT_URL, DEFAULT_SERVER).replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s]+$/i.test(server)) {
    throw new Error(`memvault: server must be an http(s) URL, got "${server}"`)
  }

  const agentId = firstString(config.agentId, process.env.MEMVAULT_AGENT_ID, DEFAULT_AGENT_ID)
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new Error(`memvault: agentId "${agentId}" is not a valid agent name`)
  }

  const dataDirRoot = config.dataDir
    ? resolve(String(config.dataDir))
    : firstString(process.env.MEMVAULT_DATA_DIR)
      ? resolve(String(process.env.MEMVAULT_DATA_DIR))
      : platformDataDir()
  const stateFile = config.stateFile
    ? resolve(String(config.stateFile))
    : join(dataDirRoot, 'dsh-state.json')

  const serverName = firstString(config.serverName, DEFAULT_SERVER_NAME)
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    throw new Error(`memvault: serverName "${serverName}" must match [A-Za-z0-9_-]{1,32}`)
  }

  const command = firstString(config.command, process.env.MEMVAULT_MCP_BIN, DEFAULT_COMMAND)
  const token = firstString(config.token, process.env.MEMVAULT_TOKEN, process.env.MEMVAULT_JOIN_TOKEN)

  let ttlSecs
  if (config.ttlSecs !== undefined && config.ttlSecs !== null) {
    ttlSecs = Number(config.ttlSecs)
    if (!Number.isSafeInteger(ttlSecs) || ttlSecs <= 0) {
      throw new Error(`memvault: ttlSecs must be a positive integer, got ${String(config.ttlSecs)}`)
    }
  }

  let defaultTags = []
  if (config.defaultTags !== undefined && config.defaultTags !== null) {
    if (!Array.isArray(config.defaultTags) || !config.defaultTags.every((tag) => typeof tag === 'string')) {
      throw new Error('memvault: defaultTags must be an array of "scope:label" strings')
    }
    defaultTags = config.defaultTags.map((tag) => tag.trim()).filter((tag) => tag !== '')
  }

  const visibility = firstString(config.defaultVisibility, 'internal')
  if (!['internal', 'federated', 'public'].includes(visibility)) {
    throw new Error(`memvault: defaultVisibility must be internal, federated, or public, got "${visibility}"`)
  }

  const base = {
    server,
    agentId,
    serverName,
    command,
    token,
    ttlSecs,
    defaultTags,
    visibility,
    dataDirRoot,
    stateFile,
    failOnStartupError: config.failOnStartupError === true,
    toolCallTimeoutMs:
      Number.isSafeInteger(config.toolCallTimeoutMs) && config.toolCallTimeoutMs > 0
        ? config.toolCallTimeoutMs
        : undefined,
    mcpClientModule: firstString(config.mcpClientModule),
  }

  const entries = Array.isArray(config.identities) ? config.identities : []
  const taken = new Set()
  const identities = entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`memvault: identities[${index}] must be an object`)
    }
    return configuredIdentity(entry, base, index, taken)
  })
  if (identities.length === 0) {
    identities.push(configuredIdentity({ agentId, label: config.label }, base, 0, taken))
  }

  return { ...base, identities }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Read the persisted state, tolerating a missing or unreadable file. */
async function loadState(file, identities) {
  let state = { version: STATE_VERSION, identities: [], sessions: {} }
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (parsed !== null && typeof parsed === 'object') {
      state = {
        version: STATE_VERSION,
        identities: Array.isArray(parsed.identities) ? parsed.identities : [],
        sessions: parsed.sessions !== null && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      }
    }
  } catch {
    // No state yet, or a corrupt file: start from the configured identities.
  }

  // Config identities are authoritative for their fields; a UI-added identity
  // keeps its own record. An identity that left the config and did not come
  // from the UI is dropped.
  const merged = []
  for (const configured of identities) {
    const previous = state.identities.find((item) => item.id === configured.id)
    merged.push({
      ...configured,
      enabled: configured.enabled !== false && previous?.enabled !== false,
      source: previous?.source === 'ui' ? 'ui' : 'config',
    })
  }
  for (const previous of state.identities) {
    if (previous.id === undefined || merged.some((item) => item.id === previous.id)) continue
    if (previous.source === 'ui') merged.push(previous)
  }
  state.identities = merged
  // Sessions stored before the scoped form are read as one bucket entry; an
  // entry that no longer normalizes is dropped.
  const sessions = {}
  for (const [sessionId, stored] of Object.entries(state.sessions)) {
    const normalized = normalizeAcl(stored)
    if (normalized !== undefined) sessions[sessionId] = stored.scope === undefined ? normalized : stored
  }
  state.sessions = sessions
  return state
}

/** Atomically persist the state file with owner-only permissions. */
async function saveState(file, state) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

/** True when the identity directory already holds a credential. */
async function hasIdentity(identityDir) {
  try {
    await access(join(identityDir, KEY_FILE))
    return true
  } catch {
    return false
  }
}

/**
 * Remove the credential directory of a deleted identity, but only the default
 * one for its agent id and only while it holds nothing but the private key.
 */
async function removeCredentialDir(identity, settings) {
  const target = resolve(identity.identityDir)
  const expected = resolve(join(settings.dataDirRoot, 'agents', identity.agentId))
  if (target !== expected) {
    throw new Error(
      `kept the credential: ${target} is not the default identity directory for "${identity.agentId}"`,
    )
  }
  let entries
  try {
    entries = await readdir(target)
  } catch {
    return
  }
  const unexpected = entries.filter((name) => name !== KEY_FILE)
  if (unexpected.length > 0) {
    throw new Error(`kept the credential: ${target} still contains ${unexpected.join(', ')}`)
  }
  await rm(target, { recursive: true, force: true })
}

/** Spawn a child process, capture its output, and settle on exit, failure, or timeout. */
function runProcess(command, args, env, timeoutMs) {
  return new Promise((settle) => {
    let child
    try {
      child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      settle({ code: -1, stdout: '', stderr: String(error?.message ?? error) })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      settle({ code: -1, stdout, stderr: stderr || String(error?.message ?? error) })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      settle({ code: code ?? -1, signal, timedOut, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

/** Compact a child's failure output for one log line. */
function describeFailure(result) {
  if (result.timedOut) return 'timed out'
  const detail = result.stderr || result.stdout
  if (detail) return detail.split('\n').slice(-6).join(' | ')
  return result.signal ? `terminated by ${result.signal}` : `exit code ${result.code}`
}

/** Redeem a provisioning token for one identity with `memvault-mcp enroll`. */
async function redeem(identity, token, settings, logger) {
  const args = [
    'enroll',
    '--server',
    identity.server,
    '--agent-id',
    identity.agentId,
    '--identity-dir',
    identity.identityDir,
  ]
  if (settings.ttlSecs !== undefined) args.push('--ttl-secs', String(settings.ttlSecs))

  const env = {
    MEMVAULT_URL: identity.server,
    MEMVAULT_TOKEN: token,
    MEMVAULT_AGENT_ID: identity.agentId,
    MEMVAULT_IDENTITY_DIR: identity.identityDir,
  }

  logger.info(`memvault: redeeming a provisioning token for agent "${identity.agentId}" at ${identity.server}`)
  const result = await runProcess(settings.command, args, env, ENROLL_TIMEOUT_MS)
  if (result.code !== 0) {
    throw new Error(
      `memvault: could not redeem the provisioning token (${describeFailure(result)}). ` +
        `Check the token, that ${identity.server} is a running memvault node, and that ` +
        `"${settings.command}" is installed.`,
    )
  }
  if (!(await hasIdentity(identity.identityDir))) {
    throw new Error(
      `memvault: "${settings.command} enroll" reported success but wrote no ${KEY_FILE} ` +
        `to ${identity.identityDir}`,
    )
  }
  logger.info(`memvault: enrolled agent "${identity.agentId}" (identity in ${identity.identityDir})`)
}

// ---------------------------------------------------------------------------
// MCP client children
// ---------------------------------------------------------------------------

/** Resolve the mcp-client module through CommonJS paths, then import it as ESM. */
async function loadMcpClient(override) {
  const specifier = override ?? '@deepseek-ai/dsh-mcp-client'
  if (/^(?:file:|\.{0,2}\/|\/)/.test(specifier)) return import(pathToFileURL(resolve(specifier)).href)
  let resolved
  try {
    resolved = createRequire(import.meta.url).resolve(specifier)
  } catch (error) {
    throw new Error(
      `memvault: cannot resolve "${specifier}". Run dsh from its installation (the bundled ` +
        `mcp-client must be on NODE_PATH), or set "mcpClientModule" to its absolute path. ` +
        `(${String(error?.message ?? error)})`,
    )
  }
  return import(pathToFileURL(resolved).href)
}

/** Build the stdio mcp-client config for one enrolled identity. */
function clientConfig(identity, settings) {
  const env = {
    MEMVAULT_URL: identity.server,
    MEMVAULT_IDENTITY_DIR: identity.identityDir,
    MEMVAULT_AGENT_ID: identity.agentId,
    MEMVAULT_DEFAULT_VISIBILITY: settings.visibility,
  }
  const args = [
    '--url',
    identity.server,
    '--identity-dir',
    identity.identityDir,
    '--agent-id',
    identity.agentId,
    '--default-visibility',
    settings.visibility,
  ]
  if (settings.defaultTags.length > 0) {
    env.MEMVAULT_DEFAULT_TAGS = settings.defaultTags.join(',')
    args.push('--default-tags', settings.defaultTags.join(','))
  }

  return {
    serverName: identity.serverName,
    transport: 'stdio',
    command: settings.command,
    args,
    env,
    failOnStartupError: settings.failOnStartupError,
    ...(settings.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: settings.toolCallTimeoutMs }),
  }
}

// ---------------------------------------------------------------------------
// Tool helpers
// ---------------------------------------------------------------------------

/** Concatenate a tool result's text blocks. */
function textOf(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** Run one tool through the registry and return its text projection. */
async function callTool(ctx, toolName, args) {
  const result = await ctx.tools.execute({
    callId: `memvault:${randomBytes(4).toString('hex')}`,
    name: toolName,
    arguments: args,
    signal: new AbortController().signal,
  })
  return { text: textOf(result), isError: result?.isError === true }
}

/** Tool names registered for one identity namespace. */
function namespaceTools(ctx, identity) {
  const prefix = `mcp__${identity.serverName}__`
  return ctx.tools
    .schemas()
    .map((schema) => schema.name)
    .filter((toolName) => toolName.startsWith(prefix))
    .map((toolName) => toolName.slice(prefix.length))
}

// ---------------------------------------------------------------------------
// Per-session ACL
// ---------------------------------------------------------------------------

/**
 * Normalize a stored or submitted session binding. The scoped form has a
 * `scope` of `all`, `identities`, or `buckets`; the older single-identity
 * shape ({ identity, bucket, mode }) is read as one bucket entry.
 */
function normalizeAcl(acl) {
  if (acl === null || acl === undefined || typeof acl !== 'object') return undefined
  const mode = acl.mode === 'read' ? 'read' : 'write'
  if (acl.scope === 'all') return { scope: 'all', mode, identities: [], buckets: [] }

  if (acl.scope === 'identities' && Array.isArray(acl.identities)) {
    const names = [...new Set(acl.identities.filter((id) => typeof id === 'string' && id !== ''))]
    return { scope: 'identities', mode, identities: names, buckets: [] }
  }

  if (acl.scope === 'buckets' && Array.isArray(acl.buckets)) {
    const buckets = []
    for (const entry of acl.buckets) {
      if (entry === null || typeof entry !== 'object') continue
      if (typeof entry.identity !== 'string' || entry.identity === '') continue
      const bucket =
        typeof entry.bucket === 'string' && entry.bucket.trim() !== ''
          ? entry.bucket.trim().toLowerCase()
          : null
      if (bucket !== null && !/^[0-9a-f]{64}$/.test(bucket)) continue
      if (buckets.some((item) => item.identity === entry.identity && item.bucket === bucket)) continue
      buckets.push({ identity: entry.identity, bucket })
    }
    return {
      scope: 'buckets',
      mode,
      identities: [...new Set(buckets.map((entry) => entry.identity))],
      buckets,
    }
  }

  // Legacy single-identity binding.
  if (typeof acl.identity === 'string' && acl.identity !== '') {
    const bucket =
      typeof acl.bucket === 'string' && acl.bucket.trim() !== '' ? acl.bucket.trim().toLowerCase() : null
    return {
      scope: 'buckets',
      mode,
      identities: [acl.identity],
      buckets: [{ identity: acl.identity, bucket }],
    }
  }
  return undefined
}

/** Human list for guard messages. */
function labelsOf(list) {
  return list.map((item) => item.label ?? item.id).join(', ')
}

/**
 * Work out what one session's binding hides: the tools of identities outside
 * the scope, the write tools of a read-only session, and the bucket guard.
 * Pure, so the caller can compare the signature before touching a live agent.
 */
function planSessionAcl(ctx, rawAcl, identities) {
  const acl = normalizeAcl(rawAcl)
  if (acl === undefined) return undefined

  const allowedIds = acl.scope === 'all' ? identities.map((item) => item.id) : acl.identities
  const allowedSet = new Set(allowedIds)
  const allowed = identities.filter((item) => allowedSet.has(item.id))
  const excluded = identities.filter((item) => !allowedSet.has(item.id))
  const known = new Set(ctx.tools.schemas().map((schema) => schema.name))

  const foreign = new Set()
  for (const identity of excluded) {
    for (const raw of namespaceTools(ctx, identity)) foreign.add(`mcp__${identity.serverName}__${raw}`)
  }
  const prefixes = new Map(allowed.map((identity) => [identity.id, `mcp__${identity.serverName}__`]))
  const deny = [...foreign]
  if (acl.mode === 'read') {
    for (const identity of allowed) {
      const prefix = prefixes.get(identity.id)
      for (const raw of namespaceTools(ctx, identity)) {
        if (!READ_TOOLS.has(raw)) deny.push(`${prefix}${raw}`)
      }
    }
  }
  // `restrict()` rejects names that are not currently registered global tools.
  const restrictable = [...new Set(deny)].filter((toolName) => known.has(toolName)).sort()
  const signature = JSON.stringify([
    acl.scope,
    acl.mode,
    allowed.map((item) => item.id).sort(),
    acl.buckets.map((entry) => `${entry.identity}:${entry.bucket ?? ''}`).sort(),
    restrictable,
  ])
  return { acl, allowed, prefixes, foreign, restrictable, signature }
}

/**
 * Install one planned binding on a live agent: a deny mask that hides the
 * tools outside the scope, a monotonic guard that enforces the read-only and
 * bucket rules, and a prompt section that tells the model what the session
 * may do.
 */
function installSessionAcl(agent, plan) {
  const { acl, allowed, prefixes, foreign, restrictable } = plan
  const disposers = []
  if (restrictable.length > 0) disposers.push(agent.ctx.tools.restrict({ deny: restrictable }))

  const identityOf = (name) => {
    for (const identity of allowed) {
      const prefix = prefixes.get(identity.id)
      if (name.startsWith(prefix)) return { identity, prefix }
    }
    return undefined
  }

  disposers.push(
    agent.ctx.tools.guard((exec) => {
      if (typeof exec.name !== 'string') return undefined
      if (foreign.has(exec.name)) {
        return (
          `memvault ACL: this session allows ${labelsOf(allowed) || 'no identity'}; ` +
          `other memvault identities are unavailable`
        )
      }
      const match = identityOf(exec.name)
      if (match === undefined) return undefined
      const raw = exec.name.slice(match.prefix.length)
      if (acl.mode === 'read' && !READ_TOOLS.has(raw)) {
        return `memvault ACL: this session is read-only, so ${raw} is not available`
      }
      if (acl.scope !== 'buckets') return undefined

      const args = exec.arguments !== null && typeof exec.arguments === 'object' ? exec.arguments : {}
      const bucket =
        typeof args.bucket === 'string' && args.bucket.trim() !== '' ? args.bucket.trim().toLowerCase() : undefined
      const allowedBuckets = acl.buckets.filter((entry) => entry.identity === match.identity.id)
      if (bucket === undefined) {
        if (allowedBuckets.some((entry) => entry.bucket === null)) return undefined
        const wanted = allowedBuckets.map((entry) => entry.bucket).filter((id) => id !== null)
        return (
          `memvault ACL: this session may only use ${wanted.length > 0 ? `bucket(s) ${wanted.join(', ')}` : 'the selected buckets'} ` +
          `on ${match.identity.label}; pass "bucket"`
        )
      }
      if (allowedBuckets.some((entry) => entry.bucket === bucket)) return undefined
      return (
        `memvault ACL: bucket ${bucket} is not available to this session on ${match.identity.label}; ` +
        `allowed: ${allowedBuckets.map((entry) => entry.bucket ?? 'agent default bucket').join(', ')}`
      )
    }),
  )

  disposers.push(
    agent.ctx.systemPrompt.section({
      name: ACL_SECTION,
      order: ACL_ORDER,
      text: () => {
        const access = acl.mode === 'read' ? 'read-only (write tools are disabled)' : 'read-write'
        const scope =
          acl.scope === 'all'
            ? 'Every memvault identity and bucket is available.'
            : acl.scope === 'identities'
              ? `Only identities ${labelsOf(allowed)} are available, with all their buckets.`
              : `Only these buckets are available: ${acl.buckets
                  .map((entry) => {
                    const owner = allowed.find((item) => item.id === entry.identity)
                    return `${entry.bucket ?? 'agent default bucket'} (${owner?.label ?? entry.identity})`
                  })
                  .join('; ')}.`
        return [
          'Memvault session ACL (local, enforced by the harness):',
          `- ${scope}`,
          acl.scope === 'all' ? '' : '- Other memvault identities are unavailable to this session.',
          acl.scope === 'all'
            ? `- MCP tools look like \`mcp__<namespace>__<tool>\`.`
            : `- MCP tools look like ${[...prefixes.values()].map((prefix) => `\`${prefix}*\``).join(', ')}.`,
          `- Access: ${access}.`,
        ]
          .filter((line) => line !== '')
          .join('\n')
      },
    }),
  )
  return disposers
}

// ---------------------------------------------------------------------------
// Panel API
// ---------------------------------------------------------------------------

/** JSON response helper. */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Read and validate one request body. */
async function bodyOf(request) {
  try {
    const value = await request.json()
    return value !== null && typeof value === 'object' ? value : {}
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Provision identities, connect them, and expose the session ACL panel API.
 * @param ctx - owning Cordis context.
 * @param config - row config; see `resolveSettings`.
 */
export function apply(ctx, config) {
  const settings = resolveSettings(config)
  /** @type {{identities: any[], sessions: Record<string, any>}} */
  let state = { identities: [], sessions: {} }
  /** Persisted identity records keyed by id. */
  let identities = []
  /** Live mcp-client child fibers keyed by identity id. */
  const connections = new Map()
  /** ACL disposers keyed by session id. */
  const aclDisposers = new Map()
  /** Applied-binding signatures keyed by session id, to skip redundant re-registration. */
  const aclSignatures = new Map()
  let saving = Promise.resolve()
  /** Settles once the persisted state has been loaded; every panel call waits for it. */
  let markReady
  const ready = new Promise((resolveReady) => {
    markReady = resolveReady
  })
  const whenReady = () => ready

  const persist = () => {
    state.identities = identities
    saving = saving.then(() => saveState(settings.stateFile, state)).catch((error) => {
      ctx.logger.error(`memvault: could not persist state: ${String(error?.message ?? error)}`)
    })
    return saving
  }

  const statusOf = (identity) => {
    if (!identity.enabled) return 'disabled'
    if (!connections.has(identity.id)) return 'unconfigured'
    return namespaceTools(ctx, identity).length > 0 ? 'connected' : 'pending'
  }

  const snapshot = (sessionId) => ({
    identities: identities.map((identity) => ({
      id: identity.id,
      label: identity.label,
      agentId: identity.agentId,
      server: identity.server,
      serverName: identity.serverName,
      identityDir: identity.identityDir,
      enabled: identity.enabled,
      source: identity.source,
      status: statusOf(identity),
      tools: namespaceTools(ctx, identity).length,
    })),
    acl: sessionId ? (state.sessions[sessionId] ?? null) : null,
    sessions: state.sessions,
  })

  /** Start (or restart) one identity's MCP connection. */
  const connect = async (identity) => {
    const previous = connections.get(identity.id)
    if (previous !== undefined) {
      connections.delete(identity.id)
      await previous.dispose()
    }
    if (!identity.enabled) return
    if (!(await hasIdentity(identity.identityDir))) return
    try {
      const mcpClient = await loadMcpClient(settings.mcpClientModule)
      const child = ctx.plugin(mcpClient, clientConfig(identity, settings))
      connections.set(identity.id, child)
      ctx.logger.info(
        `memvault: connecting identity "${identity.id}" as tools mcp__${identity.serverName}__*`,
      )
    } catch (error) {
      ctx.logger.error(`memvault: identity "${identity.id}" could not start: ${String(error?.message ?? error)}`)
    }
  }

  /** Drop the registrations of one session's applied binding. */
  const disposeAcl = (sessionId) => {
    const disposers = aclDisposers.get(sessionId) ?? []
    aclDisposers.delete(sessionId)
    aclSignatures.delete(sessionId)
    for (const disposer of disposers) {
      try {
        disposer()
      } catch {
        // A disposed agent's registrations are already gone.
      }
    }
  }

  /** Re-apply the stored binding to one live agent; a no-op when nothing changed. */
  const applyAcl = (agent, sessionId) => {
    const acl = state.sessions[sessionId]
    if (acl === undefined || acl === null) {
      disposeAcl(sessionId)
      return
    }
    let plan
    try {
      plan = planSessionAcl(ctx, acl, identities)
    } catch (error) {
      ctx.logger.error(`memvault: could not plan the session ACL for ${sessionId}: ${String(error?.message ?? error)}`)
      return
    }
    if (plan === undefined) return
    if (aclDisposers.has(sessionId) && aclSignatures.get(sessionId) === plan.signature) return
    try {
      const disposers = installSessionAcl(agent, plan)
      disposeAcl(sessionId)
      aclDisposers.set(sessionId, disposers)
      aclSignatures.set(sessionId, plan.signature)
    } catch (error) {
      ctx.logger.error(`memvault: could not apply the session ACL for ${sessionId}: ${String(error?.message ?? error)}`)
    }
  }

  /** Re-apply every live agent's binding (identities or bindings changed). */
  const reapplyAll = () => {
    for (const agent of ctx.agents.list()) applyAcl(agent, agent.id)
  }

  const removeAcl = (sessionId) => {
    disposeAcl(sessionId)
    delete state.sessions[sessionId]
  }

  const service = {
    snapshot: (sessionId) => snapshot(sessionId),
    state: () => state,

    async redeem({ identityId, id, agentId, label, server, token, ttlSecs } = {}) {
      await whenReady()
      if (typeof token !== 'string' || token.trim() === '') {
        throw new Error('memvault: a provisioning token (mvjoin1:…) is required')
      }
      let identity = identities.find((item) => item.id === identityId)
      if (identity === undefined) {
        const nextAgentId = firstString(agentId, id)
        if (nextAgentId === undefined) throw new Error('memvault: choose an identity or name a new agent id')
        if (!AGENT_ID_PATTERN.test(nextAgentId)) throw new Error('memvault: invalid agent id')
        if (identities.some((item) => item.agentId === nextAgentId)) {
          throw new Error(`memvault: an identity for agent "${nextAgentId}" already exists`)
        }
        const index = identities.length
        const chosenServer = firstString(server, settings.server).replace(/\/+$/, '')
        if (!/^https?:\/\/[^\s]+$/i.test(chosenServer)) {
          throw new Error(`memvault: server must be an http(s) URL, got "${chosenServer}"`)
        }
        const base = {
          server: chosenServer,
          agentId: nextAgentId,
          serverName:
            index === 0 ? settings.serverName : `${settings.serverName}_${slug(nextAgentId)}`,
        }
        identity = {
          id: firstString(id, nextAgentId),
          label: firstString(label, nextAgentId),
          agentId: nextAgentId,
          server: base.server,
          identityDir: join(settings.dataDirRoot, 'agents', nextAgentId),
          serverName: base.serverName,
          enabled: true,
          source: 'ui',
        }
        if (identities.some((item) => item.serverName === identity.serverName)) {
          identity.serverName = `${settings.serverName}_${slug(identity.id)}_${randomBytes(2).toString('hex')}`
        }
        const localTtl = ttlSecs ?? settings.ttlSecs
        const effective = { ...settings, ttlSecs: localTtl }
        identities.push(identity)
        await persist()
        try {
          await redeem(identity, token.trim(), effective, ctx.logger)
        } catch (error) {
          identities = identities.filter((item) => item.id !== identity.id)
          await persist()
          throw error
        }
      } else {
        if (await hasIdentity(identity.identityDir)) {
          throw new Error(
            `memvault: agent "${identity.agentId}" already has a credential at ${identity.identityDir}; ` +
              `remove that directory to re-enroll`,
          )
        }
        await redeem(identity, token.trim(), { ...settings, ttlSecs: ttlSecs ?? settings.ttlSecs }, ctx.logger)
      }
      identity.enabled = true
      await persist()
      await connect(identity)
      reapplyAll()
      return snapshot()
    },

    async setEnabled(identityId, enabled) {
      await whenReady()
      const identity = identities.find((item) => item.id === identityId)
      if (identity === undefined) throw new Error(`memvault: unknown identity "${identityId}"`)
      identity.enabled = enabled === true
      await persist()
      await connect(identity)
      reapplyAll()
      return snapshot()
    },

    async check(identityId) {
      await whenReady()
      const identity = identities.find((item) => item.id === identityId)
      if (identity === undefined) throw new Error(`memvault: unknown identity "${identityId}"`)
      if (!identity.enabled) throw new Error(`memvault: identity "${identity.id}" is disabled`)
      const tool = `mcp__${identity.serverName}__memvault_status`
      if (ctx.tools.get(tool) === undefined) {
        throw new Error(
          `memvault: identity "${identity.id}" has no memvault tools yet — it is not connected ` +
            `(is ${identity.server} reachable and the credential valid?)`,
        )
      }
      const { text, isError } = await callTool(ctx, tool, {})
      if (isError) return { ok: false, error: text || 'tool call failed' }
      if (text.startsWith('error:')) return { ok: false, error: text.slice('error:'.length).trim() }
      try {
        return { ok: true, status: JSON.parse(text) }
      } catch {
        return { ok: true, status: { raw: text } }
      }
    },

    async buckets(identityId) {
      await whenReady()
      const identity = identities.find((item) => item.id === identityId)
      if (identity === undefined) throw new Error(`memvault: unknown identity "${identityId}"`)
      const tool = `mcp__${identity.serverName}__memvault_bucket_list`
      if (ctx.tools.get(tool) === undefined) {
        throw new Error(`memvault: identity "${identity.id}" is not connected`)
      }
      const { text, isError } = await callTool(ctx, tool, {})
      if (isError) throw new Error(text || 'bucket listing failed')
      if (text.startsWith('error:')) throw new Error(text.slice('error:'.length).trim())
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(`memvault: unexpected bucket listing: ${text.slice(0, 200)}`)
      }
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.buckets) ? parsed.buckets : []
      return list.map((bucket) => ({
        id: String(bucket.id ?? ''),
        name: String(bucket.name ?? ''),
        role: bucket.role === undefined ? 'standard' : String(bucket.role),
        items: Number(bucket.envelope_count ?? 0),
        attached: bucket.is_attached !== false,
      }))
    },

    async remove(identityId, { deleteCredential = false } = {}) {
      await whenReady()
      const identity = identities.find((item) => item.id === identityId)
      if (identity === undefined) throw new Error(`memvault: unknown identity "${identityId}"`)
      if (identity.source === 'config') {
        throw new Error(
          `memvault: "${identity.id}" is defined by the plugin configuration — disable it here, ` +
            `or remove its entry from the row config`,
        )
      }
      const child = connections.get(identity.id)
      connections.delete(identity.id)
      await child?.dispose?.()
      let clearedSessions = 0
      for (const [sessionId, acl] of Object.entries(state.sessions)) {
        const bound =
          acl.identity === identity.id ||
          (Array.isArray(acl.identities) && acl.identities.includes(identity.id))
        if (!bound) continue
        removeAcl(sessionId)
        clearedSessions += 1
      }
      identities = identities.filter((item) => item.id !== identity.id)
      await persist()
      let warning
      if (deleteCredential === true) {
        try {
          await removeCredentialDir(identity, settings)
        } catch (error) {
          warning = String(error?.message ?? error)
        }
      }
      return {
        ...snapshot(),
        clearedSessions,
        ...(warning === undefined ? {} : { warning }),
      }
    },

    async setSessionAcl(sessionId, rawAcl) {
      await whenReady()
      if (typeof sessionId !== 'string' || sessionId === '') {
        throw new Error('memvault: a session id is required')
      }
      if (rawAcl === null || rawAcl === undefined) {
        removeAcl(sessionId)
        await persist()
        reapplyAll()
        return snapshot(sessionId)
      }
      const acl = normalizeAcl(rawAcl)
      if (acl === undefined) {
        throw new Error('memvault: scope must be "all", "identities", or "buckets"')
      }
      if (acl.scope === 'identities') {
        if (acl.identities.length === 0) throw new Error('memvault: choose at least one identity')
      }
      if (acl.scope === 'buckets' && acl.buckets.length === 0) {
        throw new Error('memvault: choose at least one bucket')
      }
      for (const id of acl.identities) {
        if (!identities.some((item) => item.id === id)) {
          throw new Error(`memvault: unknown identity "${id}"`)
        }
      }
      for (const entry of acl.buckets) {
        if (!identities.some((item) => item.id === entry.identity)) {
          throw new Error(`memvault: unknown identity "${entry.identity}"`)
        }
        if (entry.bucket !== null && !/^[0-9a-f]{64}$/.test(entry.bucket)) {
          throw new Error('memvault: a bucket id is 64 lowercase hex characters')
        }
      }
      state.sessions[sessionId] = { ...acl, updatedAt: Date.now() }
      await persist()
      reapplyAll()
      return snapshot(sessionId)
    },
  }

  ctx.provide('memvault', service)

  // Restore state, connect identities, then apply bindings to live agents.
  ctx.effect(async () => {
    state = await loadState(settings.stateFile, settings.identities)
    identities = state.identities
    markReady()
    await persist()
    for (const identity of identities) await connect(identity)
    for (const agent of ctx.agents.list()) applyAcl(agent, agent.id)
    return () => {
      markReady()
      for (const sessionId of [...aclDisposers.keys()]) disposeAcl(sessionId)
      for (const child of connections.values()) void child.dispose?.()
      connections.clear()
    }
  }, 'memvault: identities')

  // A session that starts later gets its stored binding when its agent appears.
  ctx.on('agent/created', ({ agent }) => {
    void whenReady().then(() => {
      if (state.sessions[agent.id] !== undefined) applyAcl(agent, agent.id)
    })
  })
  ctx.on('agent/disposed', ({ agent }) => {
    disposeAcl(agent.id)
  })

  // A connection that finishes after its binding was applied changes the
  // visible tool set; re-apply with the new deny mask. A restriction change
  // emits the same event, so the signature check keeps this from looping.
  let reapplyPending = false
  ctx.on('tools/change', () => {
    if (reapplyPending) return
    reapplyPending = true
    queueMicrotask(() => {
      reapplyPending = false
      reapplyAll()
    })
  })

  // The panel API: authenticated, origin-fenced JSON routes under /api.
  ctx.inject(['connection'], (connectionCtx) => {
    const register = (path, methods, fetch) =>
      connectionCtx.effect(
        () => connectionCtx.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch }),
        `memvault: ${path}`,
      )

    register('/api/memvault/state', ['GET'], async (request) => {
      const sessionId = new URL(request.url).searchParams.get('session') ?? undefined
      return json(service.snapshot(sessionId))
    })

    register('/api/memvault/redeem', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json({ ok: true, ...(await service.redeem(body)) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/memvault/enabled', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json({ ok: true, ...(await service.setEnabled(body.identityId, body.enabled === true)) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/memvault/check', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json(await service.check(body.identityId))
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/memvault/buckets', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json({ ok: true, buckets: await service.buckets(body.identityId) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/memvault/remove', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json({ ok: true, ...(await service.remove(body.identityId, { deleteCredential: body.deleteCredential === true })) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/memvault/session', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json({ ok: true, ...(await service.setSessionAcl(body.sessionId, body.acl ?? null)) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })
  })
}
