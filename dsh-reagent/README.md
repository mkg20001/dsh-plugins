# Reagent

Talks to [reagent](https://git.plan.ai/plan-ai/reagent) over its MCP API.

The plugin does two things:

- **Reagent's tools for the agent.** A `dsh-mcp-client` child connects to
  `<url>/mcp` with `Authorization: Bearer <token>`, so reagent's tools register
  as `mcp__reagent__<tool>`: `task_start`, `task_list`, `task_transcript`,
  `task_answer`, `task_merge`, `memory_read`, `service_list`,
  `worktree_list`, … (111 tools on reagent's current API).
- **A Reagent tab.** A conversation View tab next to Chat and Trajectory: the
  inbox (questions, approvals, merge and budget decisions, failed tasks,
  notifications), tasks (start, follow a transcript, message, pause, resume,
  retry, cancel), projects, memory read/write, reagent's docs, services and
  persistent worktrees.

The tab talks to reagent through the host half's authenticated JSON routes
(`/api/reagent/…`); the tool calls run through the same registry the agent
uses, so there is one connection, not two. The token never reaches the
browser: the tab only shows a masked hint.

## Token

Create one on the machine running reagent:

```sh
reagent token add dsh
```

It is shown once (`rgt_…`) and sent as `Authorization: Bearer`. The plugin
takes the token from, in order:

1. the Reagent tab's **Connection** view (pasted there; stored in `stateFile`
   with mode 600),
2. `token` in the plugin row,
3. `REAGENT_TOKEN` in the harness environment.

The URL follows the same order (`url` in the tab, then the row, then
`https://reagent.plan.ai`). Saving a new URL or token reconnects without a
restart.

## Configuration

```yaml
- insert:
    - id: reagent
      name: '@local/reagent'
      config:
        url: 'https://reagent.plan.ai'
        serverName: 'reagent'          # tools become mcp__reagent__*
        # token: 'rgt_…'               # prefer the tab or REAGENT_TOKEN
        # stateFile: '~/.local/share/dsh-reagent/state.json'
        # toolCallTimeoutMs: 60000
        # failOnStartupError: false     # true: an unreachable reagent blocks activation
        # mcpClientModule: '/path/to/@deepseek-ai/dsh-mcp-client/lib/index.js'
```

`stateFile` holds only the URL and token pasted in the tab; it is rewritten
atomically with owner-only permissions, and the token is never logged.

## Notes

- The connection registers all of reagent's tools globally, so every agent in
  the profile sees `mcp__reagent__*`. That is a large tool surface; reagent's
  docs (`docs_list`) describe when to use which.
- Reagent may be down: the client reconnects in the background, and the tab
  shows the status plus the last error.
- The tab is per conversation but reagent itself is global: tasks, projects,
  memory and services are reagent's, not the session's.

## Development

```sh
node test/host.test.mjs      # settings, token precedence, state, routes
node test/client.test.mjs    # bundle registration, slot id/order/label
node test/render.test.mjs    # every tab rendered with jsdom and a canned reagent
```

The render test resolves react/react-dom/jsdom from a harness installation
(`DSH_HARNESS_ROOT`, the current directory, or the node executable's
ancestors) and skips when they are absent. The client half is plain
JavaScript in the `window.__ModuleLoader__` format; the host half resolves
`@deepseek-ai/dsh-mcp-client` from the running harness.
