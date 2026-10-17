/**
 * Memvault agent connection.
 *
 * One activation does two things, in order:
 *   1. Provisioning — if the agent identity directory has no `private_key.pem`
 *      and a provisioning token is configured, redeem the token by running
 *      `memvault-mcp enroll`, which exchanges it at the cluster's
 *      `/api/v1/auth/enroll-agent` endpoint and writes the fresh keypair.
 *   2. Connection — load `@deepseek-ai/dsh-mcp-client` and register it as a
 *      child plugin over stdio, spawning `memvault-mcp` with that identity.
 *
 * Doing both here (instead of shipping a second mcp-client row) makes the
 * ordering deterministic: the child plugin is only started after enrollment
 * succeeded, so the MCP server never races the credential's creation.
 *
 * The agent id is derived from the identity directory's basename by
 * memvault-mcp, so `identityDir` must always end in `<agentId>`.
 *
 * @module @local/dsh-memvault
 */

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Diagnostics label used by the Loader. */
export const name = 'memvault'

const DEFAULT_SERVER = 'http://127.0.0.1:8401'
const DEFAULT_AGENT_ID = 'dsh'
const DEFAULT_SERVER_NAME = 'memvault'
const DEFAULT_COMMAND = 'memvault-mcp'
const ENROLL_TIMEOUT_MS = 60_000
const KEY_FILE = 'private_key.pem'
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

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

/** Normalize and validate the row's config, falling back to documented env vars. */
export function resolveSettings(config) {
  if (config === null || config === undefined) config = {}
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('memvault: config must be an object')
  }

  const server = (firstString(config.server, process.env.MEMVAULT_URL, DEFAULT_SERVER)).replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s]+$/i.test(server)) {
    throw new Error(`memvault: server must be an http(s) URL, got "${server}"`)
  }

  const agentId = firstString(config.agentId, process.env.MEMVAULT_AGENT_ID, DEFAULT_AGENT_ID)
  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new Error(
      `memvault: agentId "${agentId}" is not a valid agent name (letters, digits, '.', '_', '-'; max 64)`,
    )
  }

  const dataDir = firstString(config.dataDir, process.env.MEMVAULT_DATA_DIR)
  const identityDir = config.identityDir
    ? resolve(String(config.identityDir))
    : join(dataDir ? resolve(dataDir) : platformDataDir(), 'agents', agentId)
  if (basename(identityDir) !== agentId) {
    throw new Error(
      `memvault: identityDir must end in the agent id "${agentId}" — memvault derives the ` +
        `agent's name from the directory basename, got "${identityDir}"`,
    )
  }

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
    throw new Error(
      `memvault: defaultVisibility must be internal, federated, or public, got "${visibility}"`,
    )
  }

  return {
    server,
    agentId,
    identityDir,
    serverName,
    command,
    token,
    ttlSecs,
    defaultTags,
    visibility,
    failOnStartupError: config.failOnStartupError === true,
    toolCallTimeoutMs:
      Number.isSafeInteger(config.toolCallTimeoutMs) && config.toolCallTimeoutMs > 0
        ? config.toolCallTimeoutMs
        : undefined,
    mcpClientModule: firstString(config.mcpClientModule),
  }
}

/** True when the identity directory already holds a usable credential. */
async function hasIdentity(identityDir) {
  try {
    await access(join(identityDir, KEY_FILE))
    return true
  } catch {
    return false
  }
}

/**
 * Spawn a child process, capture its output, and settle on exit, spawn
 * failure, or timeout. Never throws for a non-zero exit status.
 */
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
      settle({ code: -1, stdout: '', stderr: String(error?.message ?? error), error })
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
      settle({ code: -1, stdout, stderr: stderr || String(error?.message ?? error), error })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      settle({
        code: code ?? -1,
        signal,
        timedOut,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
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

/**
 * Redeem the provisioning token by running `memvault-mcp enroll`.
 * The token travels through the environment, never argv, so it does not
 * appear in the process list.
 */
async function redeem(settings, logger) {
  const args = [
    'enroll',
    '--server',
    settings.server,
    '--agent-id',
    settings.agentId,
    '--identity-dir',
    settings.identityDir,
  ]
  if (settings.ttlSecs !== undefined) args.push('--ttl-secs', String(settings.ttlSecs))

  const env = {
    MEMVAULT_URL: settings.server,
    MEMVAULT_TOKEN: settings.token,
    MEMVAULT_AGENT_ID: settings.agentId,
    MEMVAULT_IDENTITY_DIR: settings.identityDir,
  }

  logger.info(`memvault: redeeming provisioning token for agent "${settings.agentId}" at ${settings.server}`)
  const result = await runProcess(settings.command, args, env, ENROLL_TIMEOUT_MS)
  if (result.code !== 0) {
    throw new Error(
      `memvault: could not redeem the provisioning token (${describeFailure(result)}). ` +
        `Check the token, that ${settings.server} is a running memvault node, and that ` +
        `"${settings.command}" is installed.`,
    )
  }
  if (!(await hasIdentity(settings.identityDir))) {
    throw new Error(
      `memvault: "${settings.command} enroll" reported success but wrote no ${KEY_FILE} ` +
        `to ${settings.identityDir}`,
    )
  }
  logger.info(`memvault: enrolled agent "${settings.agentId}" (identity in ${settings.identityDir})`)
}

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

/** Build the stdio mcp-client config for the enrolled identity. */
function clientConfig(settings) {
  const env = {
    MEMVAULT_URL: settings.server,
    MEMVAULT_IDENTITY_DIR: settings.identityDir,
    MEMVAULT_AGENT_ID: settings.agentId,
    MEMVAULT_DEFAULT_VISIBILITY: settings.visibility,
  }
  const args = [
    '--url',
    settings.server,
    '--identity-dir',
    settings.identityDir,
    '--agent-id',
    settings.agentId,
    '--default-visibility',
    settings.visibility,
  ]
  if (settings.defaultTags.length > 0) {
    env.MEMVAULT_DEFAULT_TAGS = settings.defaultTags.join(',')
    args.push('--default-tags', settings.defaultTags.join(','))
  }

  return {
    serverName: settings.serverName,
    transport: 'stdio',
    command: settings.command,
    args,
    env,
    failOnStartupError: settings.failOnStartupError,
    ...(settings.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: settings.toolCallTimeoutMs }),
  }
}

/**
 * Redeem a provisioning token when the agent has no credential yet, then
 * connect memvault's MCP tools through the bundled stdio client.
 * @param ctx - owning Cordis context.
 * @param config - row config; see `resolveSettings`.
 */
export function apply(ctx, config) {
  const settings = resolveSettings(config)

  ctx.effect(async () => {
    let child
    try {
      if (!(await hasIdentity(settings.identityDir))) {
        if (settings.token === undefined) {
          ctx.logger.info(
            `memvault: no agent identity at ${settings.identityDir} and no provisioning token; ` +
              `set MEMVAULT_TOKEN or config.token to redeem one — memvault tools are disabled`,
          )
          return () => {}
        }
        await redeem(settings, ctx.logger)
      } else {
        ctx.logger.info(`memvault: using agent identity at ${settings.identityDir}`)
        if (settings.token !== undefined) {
          ctx.logger.info(
            `memvault: a provisioning token is configured but the agent is already enrolled; ` +
              `not redeeming it (remove ${settings.identityDir} to re-enroll)`,
          )
        }
      }

      const mcpClient = await loadMcpClient(settings.mcpClientModule)
      child = ctx.plugin(mcpClient, clientConfig(settings))
      ctx.logger.info(
        `memvault: connecting memvault-mcp as tools mcp__${settings.serverName}__* ` +
          `(agent "${settings.agentId}")`,
      )
    } catch (error) {
      ctx.logger.error(`memvault: ${String(error?.message ?? error)}`)
      throw error
    }

    return () => {
      child?.dispose?.()
    }
  }, 'memvault-connection')
}
