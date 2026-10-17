# @local/dsh-memvault

DeepSeek Harness plugin that gives the agent memvault's MCP tools
(`mcp__memvault__memvault_*`). One row configures both halves:

1. **Provisioning** — when the agent identity directory has no
   `private_key.pem` and a provisioning token is configured, the plugin runs
   `memvault-mcp enroll`, which generates a fresh ed25519 keypair locally and
   exchanges the token at the cluster's `POST /api/v1/auth/enroll-agent`
   endpoint for an agent attestation. Only the private key is persisted.
2. **Connection** — the plugin then loads the bundled
   `@deepseek-ai/dsh-mcp-client` and registers it as a child plugin over
   stdio, spawning `memvault-mcp --url <server> --identity-dir <dir>
   --agent-id <id>`. Tools appear as `mcp__memvault__<tool>`.

Ordering is deterministic: the MCP server is spawned only after redemption
succeeded, so it never races the credential write.

## Configuration

Set these on the `memvault` row (Settings → Plugins, or the profile patch):

| Field | Default | Meaning |
|---|---|---|
| `server` | `http://127.0.0.1:8401` (env `MEMVAULT_URL`) | Memvault node HTTP API |
| `token` | env `MEMVAULT_TOKEN`, then `MEMVAULT_JOIN_TOKEN` | `mvjoin1:…` provisioning token; only used when the agent has no identity |
| `agentId` | `dsh` (env `MEMVAULT_AGENT_ID`) | Agent name; also the bucket label |
| `identityDir` | `<data-dir>/agents/<agentId>` | Must end in `<agentId>` — memvault derives the name from the basename |
| `dataDir` | platform data dir (env `MEMVAULT_DATA_DIR`) | Base directory used to derive `identityDir` |
| `serverName` | `memvault` | MCP tool namespace (`mcp__<serverName>__*`) |
| `command` | `memvault-mcp` (env `MEMVAULT_MCP_BIN`) | The Rust MCP server binary |
| `defaultTags` | `[]` | `scope:label` tags applied to writes that omit tags |
| `defaultVisibility` | `internal` | `internal`, `federated`, or `public` |
| `ttlSecs` | never expires | Attestation lifetime requested at enrollment |
| `failOnStartupError` | `false` | Mark the plugin failed when memvault is unreachable |
| `mcpClientModule` | — | Absolute path to `@deepseek-ai/dsh-mcp-client` when it is not on the host's `NODE_PATH` |

## Issuing a token and enrolling

```bash
# on the cluster (daemon running)
memctl token issue --agent-role agent-host --label dsh
# → mvjoin1:…

# start dsh with the token in its environment
export MEMVAULT_TOKEN='mvjoin1:…'
```

The plugin redeems it on the next activation. An enrolled agent is not
re-enrolled: remove `<data-dir>/agents/<agentId>/` first (the cluster side may
also need a new token).

`memvault-mcp enroll` runs with the token in its environment, never in argv,
and the token is not forwarded to the long-lived MCP server process.

## Notes

- The row exports no Config schema, so Settings edits the YAML/JSON block
  directly; `resolveSettings` validates it at activation and reports precise
  errors (bad URL, bad agent id, `identityDir` not ending in the agent id).
- Without an identity and without a token the plugin logs one line and leaves
  memvault tools disabled; it does not fail the profile.
