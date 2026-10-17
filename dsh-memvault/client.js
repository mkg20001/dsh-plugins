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
        width: 100%; max-width: 780px; align-self: center; }
      .dsmv h3 { margin: 0; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary); font-weight: 600; }
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
      .dsmv button { font: inherit; padding: 5px 9px; border-radius: 7px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); white-space: nowrap; }
      .dsmv button:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
      .dsmv button:disabled { opacity: .5; cursor: default; }
      .dsmv button.primary { background: var(--dsw-alias-brand-primary); color: #fff;
        border-color: transparent; }
      .dsmv button.danger { color: var(--dsw-alias-state-error-primary); }
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
      .dsmv-pre { margin: 0; max-height: 140px; overflow: auto; white-space: pre-wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px;
        background: var(--dsw-alias-bg-layer-2); padding: 6px; border-radius: 6px; }
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

    /** One identity card: status, check, enable toggle, redeem. */
    function IdentityCard({ identity, selected, onSelect, onChange, onRemoved, busy }) {
      const [redeeming, setRedeeming] = React.useState(false)
      const [removing, setRemoving] = React.useState(false)
      const [withKey, setWithKey] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [token, setToken] = React.useState('')
      const [check, setCheck] = React.useState(null)
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

      return h(
        'div',
        { className: `dsmv-identity${selected ? ' selected' : ''}` },
        h(
          'div',
          { className: 'dsmv-row' },
          h('span', { className: `dsmv-dot ${identity.status}`, title: identity.status }),
          h(
            'button',
            {
              type: 'button',
              className: 'dsmv-grow',
              style: { textAlign: 'left', border: 'none', background: 'transparent', padding: 0 },
              onClick: () => onSelect(identity.id),
              title: 'Use this identity for the session',
            },
            identity.label,
          ),
          h('span', { className: 'dsmv-badge' }, identity.status),
        ),
        h(
          'div',
          { className: 'dsmv-mono' },
          `agent ${identity.agentId} · ${identity.serverName} · ${identity.tools} tools`,
        ),
        h('div', { className: 'dsmv-mono' }, identity.server),
        error === null ? null : h('div', { className: 'dsmv-error' }, error),
        notice === null ? null : h('div', { className: 'dsmv-note' }, notice),
        check === null
          ? null
          : h(
              'div',
              { className: check.ok ? 'dsmv-ok' : 'dsmv-error' },
              check.ok
                ? `connected · ${describeStatus(check.status)}`
                : check.error,
            ),
        h(
          'div',
          { className: 'dsmv-row' },
          h(
            'button',
            {
              type: 'button',
              disabled: busy || working || identity.status === 'disabled',
              onClick: () =>
                run(async () => {
                  setCheck({ ok: false, error: 'checking…' })
                  const result = await api('check', { identityId: identity.id })
                  setCheck(result)
                }),
            },
            'Check',
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: busy || working,
              onClick: () =>
                run(async () => {
                  await api('enabled', { identityId: identity.id, enabled: identity.status === 'disabled' })
                  setCheck(null)
                  await onChange()
                }),
            },
            identity.status === 'disabled' ? 'Enable' : 'Disable',
          ),
          h(
            'button',
            { type: 'button', disabled: busy || working, onClick: () => setRedeeming(!redeeming) },
            'Redeem…',
          ),
          identity.source === 'config'
            ? h('span', { className: 'dsmv-note' }, 'from the plugin row')
            : h(
                'button',
                {
                  type: 'button',
                  className: 'danger',
                  disabled: busy || working,
                  onClick: () => { setRemoving(true); setRedeeming(false) },
                },
                'Remove…',
              ),
        ),
        redeeming
          ? h(
              'div',
              { className: 'dsmv-section' },
              h(
                'div',
                { className: 'dsmv-label' },
                'Provisioning token (mvjoin1:…) — single use, never stored',
              ),
              h('input', {
                type: 'password',
                value: token,
                placeholder: 'mvjoin1:…',
                autoComplete: 'off',
                onChange: (event) => setToken(event.target.value),
              }),
              h(
                'div',
                { className: 'dsmv-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'primary',
                    disabled: working || token.trim() === '',
                    onClick: () =>
                      run(async () => {
                        await api('redeem', { identityId: identity.id, token: token.trim() })
                        setToken('')
                        setRedeeming(false)
                        setCheck(null)
                        await onChange()
                      }),
                  },
                  'Redeem token',
                ),
                h(
                  'button',
                  { type: 'button', onClick: () => { setRedeeming(false); setToken('') } },
                  'Cancel',
                ),
              ),
            )
          : null,
        removing
          ? h(
              'div',
              { className: 'dsmv-section' },
              h('div', { className: 'dsmv-label' }, `Remove identity "${identity.label}"?`),
              h('div', { className: 'dsmv-note' },
                'The identity record, its connection, and any session bindings to it are removed. ' +
                  'Its agent id can be added again with a new token.'),
              h(
                'label',
                { className: 'dsmv-row' },
                h('input', {
                  type: 'checkbox',
                  checked: withKey,
                  onChange: (event) => setWithKey(event.target.checked),
                }),
                h('span', { className: 'dsmv-note' }, `also delete the private key at ${identity.identityDir}`),
              ),
              h(
                'div',
                { className: 'dsmv-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'danger',
                    disabled: working,
                    onClick: () =>
                      run(async () => {
                        const result = await api('remove', {
                          identityId: identity.id,
                          deleteCredential: withKey,
                        })
                        setRemoving(false)
                        setWithKey(false)
                        if (result.warning !== undefined) setNotice(result.warning)
                        else if (result.clearedSessions > 0) setNotice(`cleared ${result.clearedSessions} session binding(s)`)
                        onRemoved?.(identity.id)
                        await onChange()
                      }),
                  },
                  'Delete identity',
                ),
                h('button', { type: 'button', onClick: () => { setRemoving(false); setWithKey(false) } }, 'Cancel'),
              ),
            )
          : null,
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

    /** The moving parts of the panel. */
    function MemvaultPanel({ sessionId }) {
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [identity, setIdentity] = React.useState('')
      const [bucket, setBucket] = React.useState('')
      const [mode, setMode] = React.useState('write')
      const [buckets, setBuckets] = React.useState(null)
      const [newAgent, setNewAgent] = React.useState('')
      const [newServer, setNewServer] = React.useState('')
      const [newToken, setNewToken] = React.useState('')
      const [addOpen, setAddOpen] = React.useState(false)
      const acl = state?.acl ?? null

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

      React.useEffect(() => {
        if (acl === null) return
        setIdentity(acl.identity)
        setBucket(acl.bucket ?? '')
        setMode(acl.mode)
      }, [acl?.identity, acl?.bucket, acl?.mode])

      const ids = state?.identities ?? []
      const selected = ids.find((item) => item.id === identity) ?? null
      const defaultServer = ids[0]?.server ?? 'http://127.0.0.1:8401'

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

      const loadBuckets = () =>
        change(async () => {
          if (selected === null) throw new Error('choose an identity first')
          const result = await api('buckets', { identityId: selected.id })
          setBuckets(result.buckets ?? [])
        })

      const apply = () =>
        change(async () => {
          if (identity === '') throw new Error('choose an identity first')
          await api('session', {
            sessionId,
            acl: { identity, bucket: bucket.trim() === '' ? null : bucket.trim(), mode },
          })
        })

      return h(
        'div',
        { className: 'dsmv' },
        h('style', { 'data-plugin': '@local/memvault' }, PANEL_CSS),
        h('h3', null, 'Memvault session'),
        error === null ? null : h('div', { className: 'dsmv-error' }, error),

        h(
          'div',
          { className: 'dsmv-section' },
          h('h3', null, 'Session access'),
          acl === null
            ? h('div', { className: 'dsmv-note' }, 'No local ACL: every identity and bucket is available to this session.')
            : h(
                'div',
                { className: 'dsmv-note' },
                `Bound to ${acl.identity} · ${acl.bucket ?? 'agent default bucket'} · ${acl.mode === 'read' ? 'read-only' : 'read-write'}`,
              ),
          h('div', { className: 'dsmv-label' }, 'Identity'),
          h(
            'select',
            {
              value: identity,
              onChange: (event) => {
                setIdentity(event.target.value)
                setBuckets(null)
                setBucket('')
              },
            },
            h('option', { value: '' }, '— choose an identity —'),
            ...ids.map((item) =>
              h('option', { key: item.id, value: item.id }, `${item.label} (${item.agentId})`),
            ),
          ),
          h('div', { className: 'dsmv-label' }, 'Bucket'),
          h(
            'div',
            { className: 'dsmv-row' },
            h(
              'select',
              {
                className: 'dsmv-grow',
                value: bucket,
                onChange: (event) => setBucket(event.target.value),
              },
              h('option', { value: '' }, "Agent's own default bucket"),
              ...(buckets ?? []).map((item) =>
                h(
                  'option',
                  { key: item.id, value: item.id },
                  `${item.name || item.id.slice(0, 12)} · ${item.role} · ${item.items}`,
                ),
              ),
              bucket !== '' && (buckets ?? []).every((item) => item.id !== bucket)
                ? h('option', { value: bucket }, `manual: ${bucket.slice(0, 16)}…`)
                : null,
            ),
            h('button', { type: 'button', disabled: busy || selected === null, onClick: loadBuckets }, 'Load'),
          ),
          h('input', {
            type: 'text',
            value: bucket,
            placeholder: 'or paste a 64-hex bucket id (empty = agent default)',
            onChange: (event) => setBucket(event.target.value.trim()),
          }),
          h(
            'div',
            { className: 'dsmv-row' },
            h(
              'label',
              { className: 'dsmv-row' },
              h('input', {
                type: 'radio',
                name: 'dsmv-mode',
                checked: mode === 'read',
                onChange: () => setMode('read'),
              }),
              'read-only',
            ),
            h(
              'label',
              { className: 'dsmv-row' },
              h('input', {
                type: 'radio',
                name: 'dsmv-mode',
                checked: mode === 'write',
                onChange: () => setMode('write'),
              }),
              'read-write',
            ),
          ),
          h(
            'div',
            { className: 'dsmv-row' },
            h('button', { type: 'button', className: 'primary', disabled: busy, onClick: apply }, 'Apply to session'),
            h(
              'button',
              {
                type: 'button',
                disabled: busy || acl === null,
                onClick: () => change(() => api('session', { sessionId, acl: null })),
              },
              'Clear ACL',
            ),
          ),
          h(
            'div',
            { className: 'dsmv-note' },
            'Enforced locally: other identities’ tools are hidden, write tools are hidden in read-only mode, and calls naming another bucket are denied.',
          ),
        ),

        h('h3', null, 'Identities'),
        ids.length === 0
          ? h('div', { className: 'dsmv-note' }, 'No identities configured yet.')
          : ids.map((item) =>
              h(IdentityCard, {
                key: item.id,
                identity: item,
                selected: item.id === identity,
                onSelect: setIdentity,
                onChange: refresh,
                onRemoved: (id) => {
                  if (id === identity) {
                    setIdentity('')
                    setBucket('')
                    setBuckets(null)
                  }
                },
                busy,
              }),
            ),

        h(
          'div',
          { className: 'dsmv-section' },
          h('h3', null, 'Add an identity'),
          addOpen
            ? h(
                'div',
                { className: 'dsmv-section' },
                h('div', { className: 'dsmv-label' }, 'Agent id (also the identity directory name)'),
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
                h(
                  'div',
                  { className: 'dsmv-row' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'primary',
                      disabled: busy || newAgent === '' || newToken.trim() === '',
                      onClick: () =>
                        change(async () => {
                          await api('redeem', {
                            agentId: newAgent,
                            label: newAgent,
                            server: newServer.trim() === '' ? undefined : newServer.trim(),
                            token: newToken.trim(),
                          })
                          setNewAgent('')
                          setNewServer('')
                          setNewToken('')
                          setAddOpen(false)
                        }),
                    },
                    'Redeem and connect',
                  ),
                  h('button', { type: 'button', onClick: () => setAddOpen(false) }, 'Cancel'),
                ),
              )
            : h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    setNewServer(defaultServer)
                    setAddOpen(true)
                  },
                },
                'New identity…',
              ),
        ),
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
