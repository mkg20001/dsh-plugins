# @local/memvault

DeepSeek Harness plugin for memvault: it owns one or more **agent identities**,
connects each as an MCP server, and enforces a **per-session local ACL** over
identities and buckets. A right-sidebar panel (tab type `memvault`) is the UI.

## What it does

1. **Provisioning.** An identity is an agent id plus its identity directory
   (`<dataDir>/agents/<agentId>/`, holding `private_key.pem`). A missing
   credential is created by redeeming a provisioning token with
   `memvault-mcp enroll`, which generates a fresh ed25519 keypair locally and
   exchanges the token at the cluster's `POST /api/v1/auth/enroll-agent`
   endpoint. The token travels in the child's environment, is never written to
   disk, and is never forwarded to the long-lived server process.
2. **Connections.** Each enabled identity gets its own
   `@deepseek-ai/dsh-mcp-client` child over stdio, spawning
   `memvault-mcp --url … --identity-dir … --agent-id …`. Its tools appear as
   `mcp__<serverName>__<memvault tool>`. The first identity uses `serverName`
   (default `memvault`); later ones use `memvault_<slug(id)>`.
3. **Session ACL.** A session can be bound to one identity, one bucket, and
   read-only or read-write access. Applying a binding to a live agent:
   - installs a `ctx.tools.restrict({ deny })` mask in that **agent scope**, so
     the other identities' tools and (in read-only mode) the write tools are
     not offered to the model at all;
   - installs a monotonic `tools.guard` that denies a call naming another
     bucket than the bound one, and denies write tools if one becomes visible
     later;
   - adds an agent-scoped system-prompt section naming the identity, bucket, and
     access, so the model knows which `bucket` to pass.

   Bindings are stored per session id in `dsh-state.json` and re-applied when
   the agent starts. An unbound session sees every identity (no restriction).

## Panel

Right sidebar → `+` → **Memvault** (the tab type also contributes a guide
entry). The panel shows each identity with its status
(`connected`/`pending`/`disabled`/`unconfigured`), tool count, **Check**
(executes `memvault_status`), **Enable/Disable**, **Redeem…** (single-use
token), an identity picker, a bucket picker (loaded through
`memvault_bucket_list`, plus a manual 64-hex field), a read-only/read-write
switch, **Apply to session**, and **Clear ACL**. Polling is every 3 s.

The panel talks to the host half over authenticated JSON routes under
`/api/memvault/…` registered through `ctx.connection.fetch` (same-origin cookie,
Connection's owner peer and origin fence). Routes: `state`, `redeem`,
`enabled`, `check`, `buckets`, `session`.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `server` | `http://127.0.0.1:8401` (env `MEMVAULT_URL`) | Memvault node HTTP API |
| `agentId` | `dsh` (env `MEMVAULT_AGENT_ID`) | Agent id of the default identity |
| `identities` | — | Optional list of `{ id, agentId, label, server, identityDir, serverName, enabled }`; defaults to the single `agentId` |
| `token` | env `MEMVAULT_TOKEN`, then `MEMVAULT_JOIN_TOKEN` | Provisioning token redeemed at activation |
| `identityDir` | `<dataDir>/agents/<agentId>` | Must end in `<agentId>` — memvault derives the agent name from the basename |
| `dataDir` | platform data dir (env `MEMVAULT_DATA_DIR`) | Base for identity dirs and the state file |
| `stateFile` | `<dataDir>/dsh-state.json` | Identity records + per-session ACLs (0600, atomic writes) |
| `serverName` | `memvault` | Namespace of the first identity |
| `command` | `memvault-mcp` (env `MEMVAULT_MCP_BIN`) | The Rust MCP server binary |
| `defaultTags` | `[]` | `scope:label` tags applied to writes that omit tags |
| `defaultVisibility` | `internal` | `internal`, `federated`, `public` |
| `ttlSecs` | never expires | Attestation lifetime requested at enrollment |
| `failOnStartupError` | `false` | Mark a connection failed when memvault is unreachable |
| `mcpClientModule` | — | Absolute path to `@deepseek-ai/dsh-mcp-client` when it is not on the host's `NODE_PATH` |

## Issuing a token

```bash
# on the cluster (daemon running)
memctl token issue --agent-role agent-host --label dsh
# → mvjoin1:…
```

Redeem it from the panel (per identity, or "New identity…" with an agent id),
or set `MEMVAULT_TOKEN` in the environment that launches dsh (env is read at
activation, so a running host needs a restart), or put `token:` in the row
config for one-shot activation-time provisioning. An enrolled agent is never
re-enrolled: remove `<dataDir>/agents/<agentId>/` first (the cluster side may
need a new token).

## Semantics and limits

- **Bucket scoping is a guard, not a rewrite.** `tools/pre-execute` cannot
  rewrite arguments, so a bound bucket must be passed by the model
  (`bucket: "<hex>"`) — which the prompt section asks for — and the guard
  denies anything else, including omitting the bucket when one is bound. Tools
  that take no `bucket` still use the identity's own agent bucket server-side.
- **Read-only** hides and denies everything not in the read allowlist
  (`memvault_get`, `search`, `list`, `status`, bucket/skill/VFS listings,
  export, audit, …).
- **Isolation is per live agent.** Tools are registered globally by the MCP
  client, then masked per agent. A later connection finishing changes the
  visible set; the plugin re-applies bindings on `tools/change` (deduplicated
  by signature), so the mask follows.
- The row exports no Config schema; `resolveSettings` validates the YAML and
  reports precise errors.
- Without an identity and without a token the plugin logs one line and leaves
  memvault tools disabled; it does not fail the profile.
