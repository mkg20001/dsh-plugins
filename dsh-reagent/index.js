/**
 * Reagent: reagent's MCP API for the agent, and a Reagent tab for the person.
 *
 * One plugin activation owns the connection to reagent:
 *
 *  - Connection. A `@deepseek-ai/dsh-mcp-client` child connects to
 *    `<url>/mcp` over Streamable HTTP with `Authorization: Bearer <token>`,
 *    so reagent's tools appear as `mcp__reagent__<tool>` (task_start,
 *    task_transcript, memory_read, service_list, …).
 *  - Token. Read from the token pasted in the Reagent tab (persisted in
 *    `stateFile`, owner-only), else `token` in the row config, else
 *    `REAGENT_TOKEN`. The token is never logged and never returned to the
 *    browser in full.
 *  - Panel API. The Reagent tab reads and writes through authenticated JSON
 *    routes on `ctx.connection.fetch` under `/api/reagent/…`; every route
 *    calls the same service the tab uses, and tool calls go through the
 *    registry (`ctx.tools.execute`), not a second connection.
 *
 * The connection re-mounts when the URL or token changes, so a token pasted
 * into the tab takes effect without a restart.
 *
 * @module @local/reagent
 */

import { createRequire } from 'node:module'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Diagnostics label used by the Loader. */
export const name = 'reagent'

/** Services this plugin needs before it can activate. */
export const inject = ['tools']

/** Reagent's default public endpoint. */
export const DEFAULT_URL = 'https://reagent.plan.ai'

const DEFAULT_SERVER_NAME = 'reagent'
const DEFAULT_STATE_FILE = join(homedir(), '.local', 'share', 'dsh-reagent', 'state.json')
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000
const STATE_VERSION = 1
const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client'
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const TOOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const TOKEN_PATTERN = /^\S{1,2048}$/
const URL_PATTERN = /^https?:\/\/[^\s]+$/i
const TOOL_NAMESPACE_PREFIX = 'mcp__'

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** The first non-empty string among the candidates. */
function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

/** Expand a leading `~` against the home directory. */
export function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

/** Normalize an http(s) base URL: no trailing slashes, no whitespace. */
export function normalizeUrl(value) {
  const trimmed = String(value ?? '').trim().replace(/\/+$/, '')
  if (!URL_PATTERN.test(trimmed)) {
    throw new Error(`reagent: url must be an http(s) URL, got "${trimmed}"`)
  }
  return trimmed
}

/** Show only enough of a token to recognize it. */
export function maskToken(token) {
  if (typeof token !== 'string' || token === '') return null
  if (token.length <= 8) return '••••'
  return `${token.slice(0, 4)}…${token.slice(-4)}`
}

/**
 * Validate the row config and fill defaults.
 * @param config - the Loader row's `config` object.
 * @returns validated settings used by the rest of this module.
 */
export function resolveSettings(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}

  const url = normalizeUrl(firstString(raw.url, DEFAULT_URL))

  const serverName = firstString(raw.serverName, DEFAULT_SERVER_NAME)
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    throw new Error(`reagent: serverName "${serverName}" must match [A-Za-z0-9_-]{1,32}`)
  }

  const token = firstString(raw.token)
  if (token !== undefined && !TOKEN_PATTERN.test(token)) {
    throw new Error('reagent: token must be one line without spaces (rgt_…)')
  }

  let toolCallTimeoutMs = DEFAULT_TOOL_CALL_TIMEOUT_MS
  if (raw.toolCallTimeoutMs !== undefined && raw.toolCallTimeoutMs !== null) {
    const value = Number(raw.toolCallTimeoutMs)
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`reagent: toolCallTimeoutMs must be a positive integer, got ${String(raw.toolCallTimeoutMs)}`)
    }
    toolCallTimeoutMs = value
  }

  const dataDir = firstString(raw.dataDir)
  const stateFile = expandHome(
    firstString(raw.stateFile, dataDir === undefined ? undefined : join(expandHome(dataDir), 'state.json'), DEFAULT_STATE_FILE),
  )

  return {
    url,
    token,
    serverName,
    stateFile,
    toolCallTimeoutMs,
    failOnStartupError: raw.failOnStartupError === true,
    mcpClientModule: firstString(raw.mcpClientModule),
  }
}

// ---------------------------------------------------------------------------
// Token state
// ---------------------------------------------------------------------------

/** Read the persisted UI overrides, tolerating a missing or corrupt file. */
export async function loadState(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    if (parsed !== null && typeof parsed === 'object') {
      const state = { version: STATE_VERSION }
      if (typeof parsed.url === 'string' && parsed.url.trim() !== '') state.url = parsed.url.trim()
      if (typeof parsed.token === 'string' && parsed.token.trim() !== '') state.token = parsed.token.trim()
      return state
    }
  } catch {
    // No state yet, or unreadable: fall back to config and environment.
  }
  return { version: STATE_VERSION }
}

/** Atomically persist the state file with owner-only permissions. */
export async function saveState(file, state) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, file)
}

/**
 * Work out the effective connection: the UI's stored token wins over config,
 * which wins over REAGENT_TOKEN. Same order for the URL.
 */
export function computeEffective(settings, state, env = process.env) {
  const stored = state !== null && typeof state === 'object' ? state : {}
  const url = normalizeUrl(stored.url ?? settings.url)
  const configToken = firstString(settings.token)
  const envToken = firstString(env.REAGENT_TOKEN)
  const token = firstString(stored.token, configToken, envToken) ?? ''
  const tokenSource =
    firstString(stored.token) !== undefined
      ? 'ui'
      : configToken !== undefined
        ? 'config'
        : envToken !== undefined
          ? 'env'
          : 'none'
  return { url, token, tokenSource }
}

// ---------------------------------------------------------------------------
// MCP client
// ---------------------------------------------------------------------------

/** Resolve and import the mcp-client package from the harness installation. */
export async function loadMcpClient(override) {
  const specifier = firstString(override) ?? MCP_CLIENT
  if (/^(?:file:|\.{0,2}\/|\/)/.test(specifier)) {
    return import(pathToFileURL(resolve(specifier)).href)
  }

  let lastError
  try {
    return await import(specifier)
  } catch (error) {
    lastError = error
  }

  // A bundled plugin lives outside the harness's module tree, so bare import
  // fails there. Resolve from the process directory and from the CLI entry
  // (that is where the harness's own node_modules lives).
  const bases = new Set()
  const add = (directory) => {
    if (typeof directory === 'string' && directory !== '') bases.add(join(directory, 'package.json'))
  }
  add(process.cwd())
  if (typeof process.argv[1] === 'string' && process.argv[1] !== '') {
    let directory = dirname(resolve(process.argv[1]))
    for (let depth = 0; depth < 10; depth += 1) {
      add(directory)
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
  }

  for (const base of bases) {
    try {
      const resolved = createRequire(base).resolve(specifier)
      return await import(pathToFileURL(resolved).href)
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(
    `reagent: cannot resolve "${specifier}". Start dsh from its installation, put the bundled ` +
      `mcp-client on NODE_PATH, or set "mcpClientModule" to its absolute path. ` +
      `(${String(lastError?.message ?? lastError)})`,
  )
}

/** Build the mcp-client config for the effective connection. */
export function clientConfig(settings, effective) {
  return {
    transport: 'streamable-http',
    serverName: settings.serverName,
    url: `${effective.url}/mcp`,
    headers: { Authorization: `Bearer ${effective.token}` },
    toolCallTimeoutMs: settings.toolCallTimeoutMs,
    failOnStartupError: settings.failOnStartupError,
    // Reagent may be down for a while (a restart, a deploy); keep trying.
    reconnect: { enabled: true, initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 1_000 },
  }
}

/** Raw reagent tool names currently registered by the mcp-client child. */
export function toolNames(ctx, serverName) {
  const prefix = `${TOOL_NAMESPACE_PREFIX}${serverName}__`
  return ctx.tools
    .schemas()
    .map((schema) => schema.name)
    .filter((tool) => typeof tool === 'string' && tool.startsWith(prefix))
    .map((tool) => tool.slice(prefix.length))
    .sort()
}

/** Concatenate a tool result's text blocks. */
function textOf(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** A failure the panel route should report with a specific status. */
function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

// ---------------------------------------------------------------------------
// Panel API helpers
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
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Connect to reagent, expose its tools, and serve the Reagent tab's API.
 * @param ctx - owning Cordis context.
 * @param config - row config; see `resolveSettings`.
 */
export function apply(ctx, config) {
  const settings = resolveSettings(config)

  /** UI overrides persisted between starts. */
  let state = { version: STATE_VERSION }
  /** The URL and token this activation actually uses. */
  let effective = computeEffective(settings, state)
  /** Live mcp-client fiber, when a token is available. */
  let connection
  /** Effective connection the live fiber was mounted with. */
  let connectionSignature
  let lastError
  let saving = Promise.resolve()
  let linkQueue = Promise.resolve()

  let markReady
  /** Settles once the persisted state has been read. */
  const ready = new Promise((resolveReady) => {
    markReady = resolveReady
  })

  const persist = () => {
    saving = saving.then(() => saveState(settings.stateFile, state)).catch((error) => {
      ctx.logger.error(`reagent: could not persist state: ${String(error?.message ?? error)}`)
    })
    return saving
  }

  const disposeConnection = async () => {
    const previous = connection
    connection = undefined
    connectionSignature = undefined
    if (previous !== undefined) {
      try {
        await previous.dispose?.()
      } catch (error) {
        ctx.logger.error(`reagent: could not dispose the old connection: ${String(error?.message ?? error)}`)
      }
    }
  }

  const doConnect = async (force) => {
    const signature = effective.token === '' ? '' : `${effective.url}\n${effective.token}`
    if (force !== true && signature === connectionSignature && connection !== undefined) return
    await disposeConnection()
    connectionSignature = signature
    lastError = undefined
    if (effective.token === '') return

    try {
      const mcpClient = await loadMcpClient(settings.mcpClientModule)
      connection = ctx.plugin(mcpClient, clientConfig(settings, effective))
      ctx.logger.info(`reagent: connecting to ${effective.url} as tools mcp__${settings.serverName}__*`)
    } catch (error) {
      lastError = String(error?.message ?? error)
      ctx.logger.error(`reagent: could not connect to ${effective.url}: ${lastError}`)
    }
    // Let the client release its server-name reservation before a rapid remount.
    await new Promise((done) => setTimeout(done, 20))
  }

  const connect = (force) => {
    const run = linkQueue.then(() => doConnect(force))
    linkQueue = run.catch(() => {})
    return run
  }

  const snapshot = () => {
    const tools = toolNames(ctx, settings.serverName)
    const status =
      effective.token === ''
        ? 'unconfigured'
        : tools.length > 0
          ? 'connected'
          : 'connecting'
    return {
      ok: true,
      config: {
        url: effective.url,
        serverName: settings.serverName,
        tokenSource: effective.tokenSource,
        tokenHint: maskToken(effective.token),
        stateFile: settings.stateFile,
        toolCallTimeoutMs: settings.toolCallTimeoutMs,
      },
      connection: { status, tools: tools.length, lastError: lastError ?? null },
      tools,
    }
  }

  const service = {
    ready: () => ready,
    settings: () => settings,
    snapshot,

    /**
     * Persist URL/token changes (a missing field keeps its stored value), then
     * reconnect. `forget: true` clears both stored overrides.
     */
    async connect(changes = {}) {
      await ready
      const next = { ...state }
      if (changes.forget === true) {
        delete next.url
        delete next.token
      } else {
        if (changes.url !== undefined) {
          if (changes.url === null || String(changes.url).trim() === '') delete next.url
          else next.url = normalizeUrl(changes.url)
        }
        if (changes.token !== undefined) {
          const token = String(changes.token).trim()
          if (token === '') {
            delete next.token
          } else {
            if (!TOKEN_PATTERN.test(token)) {
              throw new Error('reagent: a token is one line without spaces (rgt_…)')
            }
            next.token = token
          }
        }
      }
      state = { ...next, version: STATE_VERSION }
      effective = computeEffective(settings, state)
      await persist()
      await connect(false)
      return snapshot()
    },

    async forget() {
      return service.connect({ forget: true })
    },

    async reconnect() {
      await ready
      await connect(true)
      return snapshot()
    },

    /** Run one reagent tool through the registry, by its raw name. */
    async call(tool, args = {}) {
      await ready
      if (typeof tool !== 'string' || !TOOL_PATTERN.test(tool)) {
        throw httpError('reagent: invalid tool name', 400)
      }
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw httpError('reagent: tool arguments must be an object', 400)
      }
      const available = toolNames(ctx, settings.serverName)
      const toolName = `${TOOL_NAMESPACE_PREFIX}${settings.serverName}__${tool}`
      if (!available.includes(tool) || ctx.tools.get(toolName) === undefined) {
        throw httpError(
          available.length === 0
            ? `reagent is not connected${effective.token === '' ? ' (no token)' : ''}${
                lastError === undefined ? '' : `: ${lastError}`
              } — check the URL and token`
            : `reagent has no tool named "${tool}"`,
          503,
        )
      }
      // The registry executes whole batches; one panel action is a one-call batch.
      const callId = `reagent:${randomBytes(6).toString('hex')}`
      const batch = await ctx.tools.execute({
        calls: [{ type: 'tool-call', id: callId, name: toolName, arguments: JSON.stringify(args) }],
        signal: new AbortController().signal,
      })
      const result = batch?.results?.find((entry) => entry.callId === callId)?.result
      return { isError: result?.isError === true, text: textOf(result) }
    },
  }

  ctx.provide('reagent', service)

  // Restore the stored token, then connect with it.
  ctx.effect(async () => {
    state = await loadState(settings.stateFile)
    effective = computeEffective(settings, state)
    markReady()
    await persist()
    await connect(false)
    return () => {
      markReady()
      void disposeConnection()
    }
  }, 'reagent: connection')

  // The tab's API: authenticated, origin-fenced JSON routes under /api.
  ctx.inject(['connection'], (connectionCtx) => {
    const register = (path, methods, fetch) =>
      connectionCtx.effect(
        () => connectionCtx.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch }),
        `reagent: ${path}`,
      )

    register('/api/reagent/state', ['GET'], async () => json(service.snapshot()))

    register('/api/reagent/connection', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        return json({ ok: true, ...(await service.connect(body)) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/reagent/forget', ['POST'], async () => {
      try {
        return json({ ok: true, ...(await service.forget()) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/reagent/reconnect', ['POST'], async () => {
      try {
        return json({ ok: true, ...(await service.reconnect()) })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, 400)
      }
    })

    register('/api/reagent/call', ['POST'], async (request) => {
      const body = await bodyOf(request)
      if (body === undefined) return json({ ok: false, error: 'invalid JSON body' }, 400)
      try {
        const result = await service.call(body.name, body.args ?? {})
        return json({ ok: true, ...result })
      } catch (error) {
        return json({ ok: false, error: String(error?.message ?? error) }, error?.status ?? 502)
      }
    })
  })
}
