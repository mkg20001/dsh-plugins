/**
 * Client half of the memvault plugin: a conversation View tab (next to Chat
 * and Trajectory) with the identity list, connection checks, token redemption,
 * and the per-session ACL picker.
 *
 * The panel reads and writes the host state through the authenticated JSON
 * routes the host half mounts under `/api/memvault/…` (same-origin fetch, the
 * Connection carrier supplies the cookie and the origin fence).
 *
 * @module @local/memvault/client
 */
window.__ModuleLoader__.load({
  id: '@local/memvault',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const VIEW_ID = 'memvault'
    const API = '/api/memvault'
    const PANEL_CSS = `
      .dsmv { display: flex; flex-direction: column; gap: 14px;
        padding: 18px 20px 40px; font-size: 12.5px; line-height: 1.45;
        color: var(--dsw-alias-label-primary); box-sizing: border-box;
        width: 100%; max-width: 820px; align-self: center; }
      .dsmv h3 { margin: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary); font-weight: 600; }
      .dsmv-title { font-size: 15px; font-weight: 600; }
      .dsmv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .dsmv-section { display: flex; flex-direction: column; gap: 8px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 11px;
        background: var(--dsw-alias-bg-layer-1); }
      .dsmv-row { display: flex; gap: 8px; align-items: center; }
      .dsmv-row > * { min-width: 0; }
      .dsmv-grow { flex: 1; }
      .dsmv-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dsmv select, .dsmv input[type=text], .dsmv input[type=password] {
        width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1); font: inherit;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .dsmv input[type=radio], .dsmv input[type=checkbox] { accent-color: var(--dsw-alias-brand-primary); }
      .dsmv button { font: inherit; padding: 5px 9px; border-radius: 7px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); white-space: nowrap; }
      .dsmv button:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
      .dsmv button:disabled { opacity: .5; cursor: default; }
      .dsmv button.primary { background: var(--dsw-alias-brand-primary); color: #fff;
        border-color: transparent; }
      .dsmv button.danger { color: var(--dsw-alias-state-error-primary); }
      .dsmv button.dsmv-iconbtn { padding: 5px 8px; line-height: 1; }
      .dsmv-identities { display: flex; flex-direction: column; gap: 8px; }
      .dsmv-identity { display: flex; flex-direction: column; gap: 6px; padding: 9px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px;
        background: var(--dsw-alias-bg-base); }
      .dsmv-identity.selected { border-color: var(--dsw-alias-brand-primary); }
      .dsmv-dot { width: 8px; height: 8px; border-radius: 50%; flex: none;
        background: var(--dsw-alias-state-idle-primary); }
      .dsmv-dot.connected { background: var(--dsw-alias-state-success-primary); }
      .dsmv-dot.pending { background: var(--dsw-alias-state-warn-primary); }
      .dsmv-dot.disabled { background: var(--dsw-alias-state-idle-primary); opacity: .5; }
      .dsmv-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10.5px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
      .dsmv-error { color: var(--dsw-alias-state-error-primary); }
      .dsmv-ok { color: var(--dsw-alias-state-success-primary); }
      .dsmv-note { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dsmv-badge { font-size: 10px; padding: 1px 6px; border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
      .dsmv-panel { display: flex; flex-direction: column; gap: 12px; }
      .dsmv-block { display: flex; flex-direction: column; gap: 8px; }
      .dsmv-blockhead { display: flex; align-items: center; gap: 8px; }
      .dsmv-table .nowrap { width: 1%; white-space: nowrap; }
      .dsmv-table td.actions { text-align: right; white-space: nowrap; }
      .dsmv-table tbody tr.dsmv-detail { cursor: default; }
      .dsmv-table tbody tr.dsmv-detail:hover { background: var(--dsw-alias-bg-layer-1); }
      .dsmv-table tr.dsmv-detail td { background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; }
      .dsmv button.dsmv-mini { padding: 3px 7px; font-size: 11.5px; }
      .dsmv-tag { margin-left: 6px; font-size: 10px; padding: 0 5px; border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
      .dsmv-indent { padding-left: 18px; margin-top: 2px; }
      .dsmv-inline { display: flex; flex-direction: column; gap: 8px; }
      .dsmv-inline input { max-width: 420px; }
      .dsmv-addform { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        padding: 11px; background: var(--dsw-alias-bg-base); }
      .dsmv-addform input { max-width: 460px; }
      .dsmv-panelhead { display: flex; flex-direction: column; gap: 2px; }
      .dsmv-paneltitle { font-weight: 600; }
      .dsmv-tablewrap { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        overflow: hidden; background: var(--dsw-alias-bg-base); }
      .dsmv-table { width: 100%; border-collapse: collapse; }
      .dsmv-table th { text-align: left; font-size: 10.5px; letter-spacing: .06em;
        text-transform: uppercase; color: var(--dsw-alias-label-secondary); font-weight: 600;
        padding: 7px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1); }
      .dsmv-table td { padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .dsmv-table tr:last-child td { border-bottom: none; }
      .dsmv-table tbody tr { cursor: pointer; }
      .dsmv-table tbody tr:hover { background: var(--dsw-alias-bg-layer-1); }
      .dsmv-table tbody tr.selected {
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
      .dsmv-table .num { width: 1%; text-align: right; white-space: nowrap;
        font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
      .dsmv-table .pick { width: 1%; text-align: right; }
      .dsmv-cell { display: flex; align-items: center; gap: 9px; }
      .dsmv-cell svg { flex: none; color: var(--dsw-alias-label-secondary); }
      .dsmv-celltext { min-width: 0; }
      .dsmv-cellname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dsmv-cellid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px; color: var(--dsw-alias-label-secondary); }
      .dsmv-controls { display: flex; align-items: center; justify-content: space-between;
        gap: 10px; flex-wrap: wrap; }
      .dsmv-actions { display: flex; gap: 8px; align-items: center; }
      .dsmv-seg { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px; overflow: hidden; }
      .dsmv button.dsmv-segbtn { border: none; border-radius: 0; background: transparent;
        padding: 5px 10px; color: var(--dsw-alias-label-secondary); }
      .dsmv button.dsmv-segbtn.active { background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); }
      .dsmv-empty { padding: 18px 12px; text-align: center; color: var(--dsw-alias-label-secondary); }
      .dsmv-form { display: flex; flex-direction: column; gap: 8px; }
    `


    /** JSON request helper; throws the server's message on failure. */
    async function api(path, body) {
      const init =
        body === undefined
          ? { headers: { accept: 'application/json' } }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(body),
            }
      const response = await fetch(`${API}/${path}`, init)
      let payload = {}
      try {
        payload = await response.json()
      } catch {
        // A non-JSON answer (auth failure page) is reported by status below.
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? `request failed (${response.status})`)
      }
      return payload
    }

    /** Compact id for a table cell. */
    function shortId(id) {
      return typeof id === 'string' && id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
    }

    /** Database glyph drawn before one bucket row's name. */
    function DbIcon() {
      return h('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' },
        h('ellipse', { cx: 12, cy: 6, rx: 7, ry: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
      )
    }

    /** Compact one-line rendering of a memvault_status payload. */
    function describeStatus(status) {
      if (status === null || typeof status !== 'object') return 'ok'
      const parts = []
      if (status.doc_count !== undefined) parts.push(`${status.doc_count} docs`)
      if (status.block_count !== undefined) parts.push(`${status.block_count} blocks`)
      if (status.peer_count !== undefined) parts.push(`${status.peer_count} peers`)
      return parts.length > 0 ? parts.join(' · ') : 'ok'
    }

    /** One identity row: status, check, enable toggle, redeem, remove. */
    function IdentityRow({ identity, selected, onSelect, onChange, onRemoved, busy }) {
      const [mode, setMode] = React.useState(null)
      const [token, setToken] = React.useState('')
      const [withKey, setWithKey] = React.useState(false)
      const [check, setCheck] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [working, setWorking] = React.useState(false)

      const run = async (task) => {
        setWorking(true)
        setError(null)
        try {
          await task()
        } catch (failure) {
          setError(String(failure.message ?? failure))
        } finally {
          setWorking(false)
        }
      }

      const action = (label, onClick, danger = false) =>
        h('button', {
          type: 'button',
          className: `dsmv-mini${danger ? ' danger' : ''}`,
          disabled: busy || working,
          onClick: (event) => {
            event.stopPropagation()
            onClick()
          },
        }, label)

      return h(React.Fragment, null,
        h('tr', {
          className: selected ? 'selected' : '',
          onClick: () => onSelect(identity.id),
          title: 'Use this identity for the session',
        },
          h('td', null,
            h('div', { className: 'dsmv-cell' },
              h('span', { className: `dsmv-dot ${identity.status}`, title: identity.status }),
              h('div', { className: 'dsmv-celltext' },
                h('div', { className: 'dsmv-cellname' }, identity.label),
                h('div', { className: 'dsmv-cellid' }, `${identity.agentId} · ${identity.serverName}`),
              ),
            ),
            h('div', { className: 'dsmv-cellid dsmv-indent' }, identity.server),
            error === null ? null : h('div', { className: 'dsmv-error dsmv-indent' }, error),
            check === null
              ? null
              : h('div', {
                  className: `${check.ok ? 'dsmv-ok' : 'dsmv-error'} dsmv-indent`,
                }, check.ok ? `ok · ${describeStatus(check.status)}` : check.error),
            notice === null ? null : h('div', { className: 'dsmv-note dsmv-indent' }, notice),
          ),
          h('td', { className: 'num' }, String(identity.tools)),
          h('td', { className: 'nowrap' },
            h('span', { className: 'dsmv-badge' }, identity.status),
            identity.source === 'config' ? h('span', { className: 'dsmv-tag' }, 'config') : null,
          ),
          h('td', { className: 'actions', onClick: (event) => event.stopPropagation() },
            action('Check', () =>
              run(async () => {
                setCheck({ ok: false, error: 'checking…' })
                setCheck(await api('check', { identityId: identity.id }))
              })),
            action(identity.status === 'disabled' ? 'Enable' : 'Disable', () =>
              run(async () => {
                await api('enabled', { identityId: identity.id, enabled: identity.status === 'disabled' })
                setCheck(null)
                await onChange()
              })),
            action('Redeem…', () => {
              setMode(mode === 'redeem' ? null : 'redeem')
              setToken('')
              setError(null)
            }),
            identity.source === 'config'
              ? null
              : action('Remove…', () => {
                  setMode(mode === 'remove' ? null : 'remove')
                  setError(null)
                }, true),
          ),
        ),
        mode === 'redeem'
          ? h('tr', { className: 'dsmv-detail' }, h('td', { colSpan: 4 },
              h('div', { className: 'dsmv-inline' },
                h('div', { className: 'dsmv-label' },
                  'Provisioning token (mvjoin1:…) — single use, never stored'),
                h('input', {
                  type: 'password',
                  value: token,
                  placeholder: 'mvjoin1:…',
                  autoComplete: 'off',
                  onChange: (event) => setToken(event.target.value),
                }),
                h('div', { className: 'dsmv-row' },
                  h('button', {
                    type: 'button',
                    className: 'primary',
                    disabled: working || token.trim() === '',
                    onClick: () =>
                      run(async () => {
                        await api('redeem', { identityId: identity.id, token: token.trim() })
                        setToken('')
                        setMode(null)
                        setCheck(null)
                        await onChange()
                      }),
                  }, 'Redeem token'),
                  h('button', {
                    type: 'button',
                    disabled: working,
                    onClick: () => {
                      setMode(null)
                      setToken('')
                    },
                  }, 'Cancel'),
                ),
              ),
            ))
          : null,
        mode === 'remove'
          ? h('tr', { className: 'dsmv-detail' }, h('td', { colSpan: 4 },
              h('div', { className: 'dsmv-inline' },
                h('div', { className: 'dsmv-label' }, `Remove identity "${identity.label}"?`),
                h('div', { className: 'dsmv-note' },
                  'The identity record, its connection, and any session bindings to it are removed. ' +
                  'Its agent id can be added again with a new token.'),
                h('label', { className: 'dsmv-row' },
                  h('input', {
                    type: 'checkbox',
                    checked: withKey,
                    onChange: (event) => setWithKey(event.target.checked),
                  }),
                  h('span', { className: 'dsmv-note' },
                    `also delete the private key at ${identity.identityDir}`),
                ),
                h('div', { className: 'dsmv-row' },
                  h('button', {
                    type: 'button',
                    className: 'danger',
                    disabled: working,
                    onClick: () =>
                      run(async () => {
                        const result = await api('remove', {
                          identityId: identity.id,
                          deleteCredential: withKey,
                        })
                        setMode(null)
                        setWithKey(false)
                        if (result.warning !== undefined) setNotice(result.warning)
                        else if (result.clearedSessions > 0) {
                          setNotice(`cleared ${result.clearedSessions} session binding(s)`)
                        }
                        onRemoved?.(identity.id)
                        await onChange()
                      }),
                  }, 'Delete identity'),
                  h('button', {
                    type: 'button',
                    disabled: working,
                    onClick: () => {
                      setMode(null)
                      setWithKey(false)
                    },
                  }, 'Cancel'),
                ),
              ),
            ))
          : null,
      )
    }

    /** The moving parts of the panel: identity table, then the session access table. */
    function MemvaultPanel({ sessionId }) {
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [identity, setIdentity] = React.useState('')
      const [bucket, setBucket] = React.useState('')
      const [mode, setMode] = React.useState('write')
      const [bucketCache, setBucketCache] = React.useState({})
      const [addOpen, setAddOpen] = React.useState(false)
      const [newAgent, setNewAgent] = React.useState('')
      const [newServer, setNewServer] = React.useState('')
      const [newToken, setNewToken] = React.useState('')

      const acl = state?.acl ?? null
      const ids = state?.identities ?? []
      const selected = ids.find((item) => item.id === identity) ?? null
      const buckets = bucketCache[identity] ?? { loading: false, items: null, error: null }
      const defaultServer = ids[0]?.server ?? 'http://127.0.0.1:8401'
      // The identity's agent bucket is the same thing as "no bucket argument";
      // it is shown once, as the default row.
      const ownBucketId = (buckets.items ?? []).find(
        (item) => selected !== null && item.name === `agent:${selected.agentId}`,
      )?.id
      const defaultSelected = bucket === '' || (ownBucketId !== undefined && bucket === ownBucketId)
      const visibleBuckets = (buckets.items ?? []).filter((item) => item.id !== ownBucketId)

      const refresh = React.useCallback(async () => {
        try {
          const next = await api(`state?session=${encodeURIComponent(sessionId)}`)
          setState(next)
          setError(null)
        } catch (failure) {
          setError(String(failure.message ?? failure))
        }
      }, [sessionId])

      React.useEffect(() => {
        void refresh()
        const timer = setInterval(() => void refresh(), 3000)
        return () => clearInterval(timer)
      }, [refresh])

      // With no binding, start on a usable identity so the access table pre-loads.
      React.useEffect(() => {
        if (identity !== '' || ids.length === 0) return
        const usable = ids.find((item) => item.status === 'connected') ?? ids[0]
        setIdentity(usable.id)
      }, [identity, ids])

      // Follow a binding when it changes (it may have been set elsewhere).
      React.useEffect(() => {
        if (acl === null || acl === undefined) return
        setIdentity(acl.identity)
        setBucket(acl.bucket ?? '')
        setMode(acl.mode)
      }, [acl?.identity, acl?.bucket, acl?.mode])

      const loadBuckets = React.useCallback(async (id, force = false) => {
        if (id === '') return
        setBucketCache((previous) => {
          if (!force && previous[id] !== undefined) return previous
          return { ...previous, [id]: { loading: true, items: null, error: null } }
        })
        try {
          const result = await api('buckets', { identityId: id })
          setBucketCache((previous) => ({
            ...previous,
            [id]: { loading: false, items: result.buckets ?? [], error: null },
          }))
        } catch (failure) {
          setBucketCache((previous) => ({
            ...previous,
            [id]: { loading: false, items: null, error: String(failure.message ?? failure) },
          }))
        }
      }, [])

      // Pre-load the bucket list as soon as an identity is selected.
      React.useEffect(() => {
        if (identity === '') return
        void loadBuckets(identity)
      }, [identity, loadBuckets])

      const change = async (task) => {
        setBusy(true)
        setError(null)
        try {
          await task()
        } catch (failure) {
          setError(String(failure.message ?? failure))
        } finally {
          setBusy(false)
          await refresh()
        }
      }

      const applyAcl = () =>
        change(async () => {
          if (identity === '') throw new Error('Choose an identity first.')
          await api('session', {
            sessionId,
            acl: { identity, bucket: defaultSelected ? null : bucket, mode },
          })
        })

      const clearAcl = () => change(() => api('session', { sessionId, acl: null }))

      const rowSelected = (id) => (id === '' ? defaultSelected : !defaultSelected && bucket === id)
      const bucketRow = (row) =>
        h('tr', {
          key: row.id === '' ? 'default' : row.id,
          className: rowSelected(row.id) ? 'selected' : '',
          onClick: () => setBucket(row.id),
        },
          h('td', null,
            h('div', { className: 'dsmv-cell' },
              h(DbIcon, null),
              h('div', { className: 'dsmv-celltext' },
                h('div', { className: 'dsmv-cellname' }, row.name),
                h('div', { className: 'dsmv-cellid' }, row.id === '' ? row.sub : shortId(row.id)),
              ),
            ),
          ),
          h('td', { className: 'num' }, row.items === null || row.items === undefined ? '—' : String(row.items)),
          h('td', { className: 'pick' },
            h('input', {
              type: 'radio',
              name: 'dsmv-bucket',
              checked: rowSelected(row.id),
              'aria-label': `Use ${row.name}`,
              onChange: () => setBucket(row.id),
            }),
          ),
        )

      const addForm = h('div', { className: 'dsmv-addform' },
        h('div', { className: 'dsmv-form' },
          h('div', { className: 'dsmv-paneltitle' }, 'New identity'),
          h('div', { className: 'dsmv-label' }, 'Agent id (identity directory name)'),
          h('input', {
            type: 'text',
            value: newAgent,
            placeholder: 'e.g. work',
            onChange: (event) => setNewAgent(event.target.value.trim()),
          }),
          h('div', { className: 'dsmv-label' }, 'Memvault server URL (the node that issues the token)'),
          h('input', {
            type: 'text',
            value: newServer,
            placeholder: defaultServer,
            onChange: (event) => setNewServer(event.target.value.trim()),
          }),
          h('div', { className: 'dsmv-label' }, 'Provisioning token (mvjoin1:…)'),
          h('input', {
            type: 'password',
            value: newToken,
            placeholder: 'mvjoin1:…',
            autoComplete: 'off',
            onChange: (event) => setNewToken(event.target.value),
          }),
          h('div', { className: 'dsmv-actions' },
            h('button', {
              type: 'button',
              className: 'primary',
              disabled: busy || newAgent === '' || newToken.trim() === '',
              onClick: () =>
                change(async () => {
                  const added = newAgent
                  await api('redeem', {
                    agentId: added,
                    label: added,
                    server: newServer.trim() === '' ? undefined : newServer.trim(),
                    token: newToken.trim(),
                  })
                  setNewAgent('')
                  setNewServer('')
                  setNewToken('')
                  setAddOpen(false)
                  setIdentity(added)
                  setBucket('')
                }),
            }, 'Redeem and connect'),
            h('button', {
              type: 'button',
              disabled: busy,
              onClick: () => setAddOpen(false),
            }, 'Cancel'),
          ),
        ),
      )

      const accessPanel = h('section', { className: 'dsmv-block' },
        h('div', { className: 'dsmv-blockhead' },
          h('h3', null, 'Session access'),
          h('div', { className: 'dsmv-grow' }),
          selected === null ? null : h('span', { className: 'dsmv-note' }, `identity: ${selected.label}`),
        ),
        selected === null
          ? h('div', { className: 'dsmv-tablewrap' },
              h('div', { className: 'dsmv-empty' }, 'Select an identity above to manage this session’s access.'))
          : h(React.Fragment, null,
              h('div', { className: 'dsmv-note' },
                acl === null
                  ? 'No local ACL — every identity and bucket is available to this session.'
                  : `Bound to ${acl.identity}, ` +
                    `${acl.bucket === null ? 'agent default bucket' : shortId(acl.bucket)}, ` +
                    `${acl.mode === 'read' ? 'read-only' : 'read-write'}.`),
              h('div', { className: 'dsmv-tablewrap' },
                h('table', { className: 'dsmv-table' },
                  h('thead', null, h('tr', null,
                    h('th', null, 'Bucket'),
                    h('th', { className: 'num' }, 'Items'),
                    h('th', { className: 'pick' }, 'Use'),
                  )),
                  h('tbody', null,
                    bucketRow({ id: '', name: "Agent's own bucket", sub: `${selected.agentId} · default`, items: null }),
                    ...(buckets.loading
                      ? [h('tr', { key: 'loading' }, h('td', { colSpan: 3, className: 'dsmv-empty' }, 'Loading buckets…'))]
                      : buckets.error !== null && buckets.error !== undefined
                        ? [h('tr', { key: 'error' }, h('td', { colSpan: 3, className: 'dsmv-empty dsmv-error' }, buckets.error))]
                        : visibleBuckets.map((item) =>
                            bucketRow({ id: item.id, name: item.name, sub: '', items: item.items }))),
                  ),
                ),
              ),
              h('div', { className: 'dsmv-controls' },
                h('div', { className: 'dsmv-row' },
                  h('div', { className: 'dsmv-label' }, 'Access'),
                  h('div', { className: 'dsmv-seg', role: 'group', 'aria-label': 'Access mode' },
                    h('button', {
                      type: 'button',
                      className: `dsmv-segbtn${mode === 'read' ? ' active' : ''}`,
                      'aria-pressed': mode === 'read',
                      onClick: () => setMode('read'),
                    }, 'read-only'),
                    h('button', {
                      type: 'button',
                      className: `dsmv-segbtn${mode === 'write' ? ' active' : ''}`,
                      'aria-pressed': mode === 'write',
                      onClick: () => setMode('write'),
                    }, 'read-write'),
                  ),
                  h('button', {
                    type: 'button',
                    className: 'dsmv-iconbtn',
                    title: 'Reload buckets',
                    'aria-label': 'Reload buckets',
                    disabled: buckets.loading,
                    onClick: () => loadBuckets(identity, true),
                  }, '↻'),
                ),
                h('div', { className: 'dsmv-actions' },
                  h('button', { type: 'button', className: 'primary', disabled: busy, onClick: applyAcl }, 'Apply to session'),
                  h('button', { type: 'button', disabled: busy || acl === null, onClick: clearAcl }, 'Clear'),
                ),
              ),
              h('div', { className: 'dsmv-note' },
                'Enforced locally: the other identities’ tools are hidden, write tools are hidden in read-only mode, ' +
                'and calls naming another bucket are denied.'),
            ),
      )

      return h('div', { className: 'dsmv' },
        h('style', { 'data-plugin': '@local/memvault' }, PANEL_CSS),
        h('div', { className: 'dsmv-head' },
          h('div', null,
            h('div', { className: 'dsmv-title' }, 'Memvault'),
            h('div', { className: 'dsmv-note' },
              `session ${typeof sessionId === 'string' ? sessionId.slice(0, 8) : '—'} · ` +
              `${ids.length} identit${ids.length === 1 ? 'y' : 'ies'}`),
          ),
        ),
        error === null ? null : h('div', { className: 'dsmv-error' }, error),

        h('section', { className: 'dsmv-block' },
          h('div', { className: 'dsmv-blockhead' },
            h('h3', null, 'Identities'),
            h('div', { className: 'dsmv-grow' }),
            selected === null ? null : h('span', { className: 'dsmv-note' }, `selected: ${selected.label}`),
            h('button', {
              type: 'button',
              className: 'dsmv-mini',
              onClick: () => setAddOpen(!addOpen),
            }, addOpen ? 'Cancel' : '+ New identity'),
          ),
          h('div', { className: 'dsmv-tablewrap' },
            h('table', { className: 'dsmv-table' },
              h('thead', null, h('tr', null,
                h('th', null, 'Identity'),
                h('th', { className: 'num' }, 'Tools'),
                h('th', { className: 'nowrap' }, 'Status'),
                h('th', { className: 'actions' }, ''),
              )),
              h('tbody', null,
                ids.length === 0
                  ? h('tr', null, h('td', { colSpan: 4, className: 'dsmv-empty' },
                      'No identities yet — add one with “+ New identity”.'))
                  : ids.map((item) =>
                      h(IdentityRow, {
                        key: item.id,
                        identity: item,
                        selected: item.id === identity,
                        onSelect: setIdentity,
                        onChange: refresh,
                        onRemoved: (id) => {
                          if (id !== identity) return
                          setIdentity('')
                          setBucket('')
                          setBucketCache((previous) => {
                            const next = { ...previous }
                            delete next[id]
                            return next
                          })
                        },
                        busy,
                      })),
              ),
            ),
          ),
          addOpen ? addForm : null,
        ),

        accessPanel,
      )
    }


    return {
      inject: ['slots'],
      apply(ctx) {
        // The tab lives in the conversation's View ring, next to Chat and
        // Trajectory. `inject` waits for the owner's slot declaration, so a
        // plugin load order that precedes ui-conversation still lands here.
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.view', () =>
              ctx.slots.register(
                {
                  name: 'conversation.view',
                  id: VIEW_ID,
                  order: 20,
                  label: () => 'Memvault',
                },
                MemvaultPanel,
              ),
            ),
          'memvault: conversation view',
        )
      },
    }
  },
})
