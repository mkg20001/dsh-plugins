/**
 * Client half of the Reagent plugin: a conversation View tab (next to Chat
 * and Trajectory) for reagent's tasks, inbox, projects, memory, docs,
 * services and worktrees.
 *
 * The tab reads and writes through the authenticated JSON routes the host
 * half mounts under `/api/reagent/…` (same-origin fetch; the Connection
 * carrier supplies the cookie and the origin fence). The reagent token never
 * reaches the browser: the host only reports a masked hint.
 *
 * @module @local/reagent/client
 */
window.__ModuleLoader__.load({
  id: '@local/reagent',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'reagent'
    const API = '/api/reagent'

    // -----------------------------------------------------------------------
    // Copy
    // -----------------------------------------------------------------------

    const EN = {
      'tab': 'Reagent',
      'subtitle': 'Tasks and the rest of reagent, over its MCP API.',
      'nav.inbox': 'Inbox',
      'nav.tasks': 'Tasks',
      'nav.projects': 'Projects',
      'nav.memory': 'Memory',
      'nav.docs': 'Docs',
      'nav.services': 'Services',
      'nav.worktrees': 'Worktrees',
      'nav.settings': 'Connection',
      'common.refresh': 'Refresh',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.loading': 'Loading…',
      'common.retry': 'Retry',
      'common.open': 'Open',
      'common.all': 'All projects',
      'common.confirm': 'Confirm',
      'common.details': 'Details',
      'common.hide': 'Hide',
      'common.add': 'Add',
      'common.remove': 'Remove',
      'common.delete': 'Delete',
      'common.send': 'Send',
      'common.none': 'none',
      'common.settings': 'Settings',
      'common.empty': 'Nothing here yet.',
      'status.connected': 'connected',
      'status.connecting': 'connecting',
      'status.unconfigured': 'no token',
      'status.tools': '{n} tools',
      'banner.connecting': 'Connecting to reagent. If this lasts, check the URL and token.',
      'banner.noToken': 'No reagent token yet. Paste one in Connection, or set REAGENT_TOKEN.',
      'settings.title': 'Connection',
      'settings.intro': 'Reagent’s MCP API is at /mcp. Create a token with `reagent token add dsh` on the machine running reagent; it is shown once.',
      'settings.url': 'Reagent URL',
      'settings.token': 'Token',
      'settings.tokenPlaceholder': 'rgt_… (leave empty to keep the current token)',
      'settings.save': 'Save and connect',
      'settings.clearToken': 'Clear saved token',
      'settings.forget': 'Forget URL and token',
      'settings.reconnect': 'Reconnect',
      'settings.source': 'Token source',
      'settings.source.ui': 'pasted in this tab',
      'settings.source.config': 'plugin config',
      'settings.source.env': 'REAGENT_TOKEN',
      'settings.source.none': 'none',
      'settings.hint': 'Current token',
      'settings.stateFile': 'State file',
      'settings.saved': 'Saved; reconnecting.',
      'settings.reconnected': 'Reconnected.',
      'settings.cleared': 'Stored token cleared; using config or environment.',
      'settings.forgotten': 'Stored URL and token forgotten.',
      'settings.lastError': 'Last error',
      'tasks.title': 'Tasks',
      'tasks.new': 'New task',
      'tasks.start': 'Start task',
      'tasks.starting': 'Starting…',
      'tasks.project': 'Project',
      'tasks.name': 'Title',
      'tasks.namePlaceholder': 'Short name (empty: the task names itself)',
      'tasks.prompt': 'Prompt',
      'tasks.promptPlaceholder': 'What should it do? Everything it needs to know.',
      'tasks.worktree': 'Worktree',
      'tasks.worktreePlaceholder': 'optional persistent worktree',
      'tasks.profile': 'Profile',
      'tasks.profileDefault': 'default profile',
      'tasks.activeOnly': 'Only tasks going on',
      'tasks.listEmpty': 'No tasks match.',
      'tasks.pick': 'Pick a task to see its conversation and steer it.',
      'tasks.updated': 'updated {when}',
      'tasks.state': 'State',
      'tasks.id': 'Id',
      'tasks.projectLabel': 'Project',
      'tasks.profileLabel': 'Profile',
      'tasks.worktreeLabel': 'Worktree',
      'tasks.origin': 'Origin',
      'tasks.created': 'Created',
      'tasks.cost': 'Cost',
      'tasks.tokens': 'Tokens',
      'tasks.report': 'Report',
      'tasks.transcript': 'Conversation',
      'tasks.noTranscript': 'No messages yet.',
      'tasks.message': 'Message',
      'tasks.messagePlaceholder': 'Read before the task’s next step…',
      'tasks.pause': 'Pause',
      'tasks.resume': 'Resume',
      'tasks.retry': 'Retry',
      'tasks.cancel': 'Cancel task',
      'tasks.cancelConfirm': 'Cancel this task and its commands?',
      'tasks.subtasks': 'Subtasks',
      'tasks.parent': 'Parent',
      'tasks.answer': 'Answer',
      'tasks.answerPlaceholder': 'Your answer…',
      'tasks.sent': 'Sent.',
      'tasks.question': 'Waiting for an answer',
      'tasks.approval': 'Waiting for approval',
      'tasks.approveOnce': 'Allow once',
      'tasks.approveAlways': 'Always allow',
      'tasks.deny': 'Deny',
      'tasks.merge': 'Waiting for a merge decision',
      'tasks.mergeDo': 'Merge',
      'tasks.mergeSendBack': 'Send back',
      'tasks.mergeReason': 'Why not?',
      'tasks.budget': 'Waiting for a budget decision',
      'tasks.raiseBudget': 'Raise budget',
      'tasks.tokensField': 'tokens',
      'tasks.costField': 'cost',
      'tasks.minutesField': 'minutes',
      'tasks.call': 'Call',
      'inbox.title': 'Inbox',
      'inbox.waiting': 'Waiting for you',
      'inbox.failed': 'Failed',
      'inbox.notifications': 'Notifications',
      'inbox.noWaiting': 'Nothing waits for you.',
      'inbox.noFailed': 'No failed tasks.',
      'inbox.noNotifications': 'No notifications.',
      'inbox.markSeen': 'Mark seen',
      'inbox.seen': 'seen',
      'projects.title': 'Projects',
      'projects.empty': 'Reagent has no projects yet.',
      'projects.path': 'Path',
      'projects.active': 'Active tasks',
      'projects.merge': 'Merge',
      'projects.profile': 'Default profile',
      'projects.maxTasks': 'Max tasks',
      'projects.devshell': 'Dev shell',
      'projects.defaultAction': 'Default action',
      'projects.worktreeSharing': 'Worktree sharing',
      'projects.startTask': 'Start a task here',
      'projects.memory': 'Open memory',
      'projects.services': 'Services',
      'projects.worktrees': 'Worktrees',
      'projects.pick': 'Pick a project.',
      'memory.title': 'Memory',
      'memory.scope': 'Scope',
      'memory.global': 'Global',
      'memory.files': 'Files',
      'memory.index': 'Index',
      'memory.newFile': 'New file name',
      'memory.filePlaceholder': 'e.g. topics/notes.md',
      'memory.about': 'Index line',
      'memory.aboutPlaceholder': 'What is it about?',
      'memory.content': 'Content',
      'memory.contentPlaceholder': '# Notes\n\n…',
      'memory.noFiles': 'This memory has no files yet.',
      'memory.select': 'Pick a file, or name a new one.',
      'memory.saved': 'Memory written.',
      'memory.deleted': 'Memory file removed.',
      'memory.deleteConfirm': 'Remove this memory file?',
      'memory.dir': 'Directory',
      'docs.title': 'Docs',
      'docs.empty': 'reagent has no docs.',
      'docs.pick': 'Pick a doc.',
      'services.title': 'Services',
      'services.empty': 'This project has no services.',
      'services.pickProject': 'Pick a project.',
      'services.status': 'State',
      'services.since': 'Since',
      'services.failures': 'Failures',
      'services.lastError': 'Last error',
      'services.script': 'Script',
      'services.health': 'Health',
      'services.notes': 'Notes',
      'services.logs': 'Logs',
      'services.start': 'Start',
      'services.stop': 'Stop',
      'services.restart': 'Restart',
      'services.noLogs': 'No output.',
      'services.unreadable': 'Repo services that could not be read',
      'worktrees.title': 'Worktrees',
      'worktrees.empty': 'This project has no persistent worktrees.',
      'worktrees.add': 'Add worktree',
      'worktrees.name': 'Name',
      'worktrees.branch': 'Branch',
      'worktrees.base': 'Base',
      'worktrees.sharing': 'Sharing',
      'worktrees.ahead': 'Ahead',
      'worktrees.changes': 'Changes',
      'worktrees.activeTasks': 'Tasks',
      'worktrees.missing': 'Folder missing',
      'worktrees.merge': 'Merge',
      'worktrees.mergeConfirm': 'Merge this worktree into its base?',
      'worktrees.remove': 'Remove',
      'worktrees.removeConfirm': 'Remove this worktree and its branch?',
      'worktrees.adopt': 'Adopt',
      'worktrees.adoptable': 'Worktrees git has that could be adopted',
      'worktrees.detail': 'Show',
      'worktrees.added': 'Worktree added.',
      'worktrees.merged': 'Merged.',
      'worktrees.removed': 'Worktree removed.',
      'worktrees.pickProject': 'Pick a project.',
      'time.justNow': 'just now',
      'time.minutes': '{n}m ago',
      'time.hours': '{n}h ago',
      'error.generic': 'Request failed.',
      'error.unexpected': 'Unexpected response from reagent.',
    }

    const DE = {
      'tab': 'Reagent',
      'subtitle': 'Aufgaben und der Rest von reagent, über die MCP-API.',
      'nav.inbox': 'Posteingang',
      'nav.tasks': 'Aufgaben',
      'nav.projects': 'Projekte',
      'nav.memory': 'Speicher',
      'nav.docs': 'Doku',
      'nav.services': 'Dienste',
      'nav.worktrees': 'Worktrees',
      'nav.settings': 'Verbindung',
      'common.refresh': 'Aktualisieren',
      'common.save': 'Speichern',
      'common.cancel': 'Abbrechen',
      'common.close': 'Schließen',
      'common.loading': 'Lädt…',
      'common.retry': 'Erneut',
      'common.open': 'Öffnen',
      'common.all': 'Alle Projekte',
      'common.confirm': 'Bestätigen',
      'common.details': 'Details',
      'common.hide': 'Ausblenden',
      'common.add': 'Hinzufügen',
      'common.remove': 'Entfernen',
      'common.delete': 'Löschen',
      'common.send': 'Senden',
      'common.settings': 'Einstellungen',
      'common.empty': 'Noch nichts vorhanden.',
      'status.connected': 'verbunden',
      'status.connecting': 'verbindet',
      'status.unconfigured': 'kein Token',
      'status.tools': '{n} Werkzeuge',
      'banner.connecting': 'Verbindung zu reagent. Wenn das bleibt: URL und Token prüfen.',
      'banner.noToken': 'Noch kein reagent-Token. In „Verbindung“ einfügen oder REAGENT_TOKEN setzen.',
      'settings.title': 'Verbindung',
      'settings.url': 'reagent-URL',
      'settings.token': 'Token',
      'settings.save': 'Speichern und verbinden',
      'settings.clearToken': 'Gespeichertes Token löschen',
      'settings.forget': 'URL und Token vergessen',
      'settings.reconnect': 'Neu verbinden',
      'settings.source': 'Token-Quelle',
      'settings.source.ui': 'in diesem Tab eingefügt',
      'settings.source.config': 'Plugin-Konfiguration',
      'settings.source.env': 'REAGENT_TOKEN',
      'settings.source.none': 'keine',
      'settings.hint': 'Aktuelles Token',
      'settings.stateFile': 'Statusdatei',
      'settings.saved': 'Gespeichert; verbindet neu.',
      'settings.reconnected': 'Neu verbunden.',
      'settings.cleared': 'Gespeichertes Token gelöscht; Konfiguration oder Umgebung gilt.',
      'settings.forgotten': 'Gespeicherte URL und Token vergessen.',
      'settings.lastError': 'Letzter Fehler',
      'tasks.title': 'Aufgaben',
      'tasks.new': 'Neue Aufgabe',
      'tasks.start': 'Aufgabe starten',
      'tasks.project': 'Projekt',
      'tasks.name': 'Titel',
      'tasks.prompt': 'Prompt',
      'tasks.activeOnly': 'Nur laufende Aufgaben',
      'tasks.listEmpty': 'Keine passenden Aufgaben.',
      'tasks.pick': 'Aufgabe wählen, um Verlauf zu sehen und zu steuern.',
      'tasks.report': 'Bericht',
      'tasks.transcript': 'Verlauf',
      'tasks.message': 'Nachricht',
      'tasks.pause': 'Pausieren',
      'tasks.resume': 'Fortsetzen',
      'tasks.retry': 'Erneut versuchen',
      'tasks.cancel': 'Aufgabe abbrechen',
      'tasks.answer': 'Antworten',
      'tasks.approveOnce': 'Einmal erlauben',
      'tasks.approveAlways': 'Immer erlauben',
      'tasks.deny': 'Ablehnen',
      'tasks.mergeDo': 'Merge',
      'tasks.mergeSendBack': 'Zurückschicken',
      'tasks.raiseBudget': 'Budget erhöhen',
      'inbox.title': 'Posteingang',
      'inbox.waiting': 'Wartet auf dich',
      'inbox.failed': 'Fehlgeschlagen',
      'inbox.notifications': 'Benachrichtigungen',
      'inbox.noWaiting': 'Nichts wartet auf dich.',
      'inbox.noFailed': 'Keine fehlgeschlagenen Aufgaben.',
      'inbox.noNotifications': 'Keine Benachrichtigungen.',
      'inbox.markSeen': 'Gesehen',
      'inbox.seen': 'gesehen',
      'projects.title': 'Projekte',
      'projects.empty': 'reagent hat noch keine Projekte.',
      'memory.title': 'Speicher',
      'memory.scope': 'Bereich',
      'memory.global': 'Global',
      'memory.files': 'Dateien',
      'memory.index': 'Index',
      'memory.newFile': 'Neuer Dateiname',
      'memory.about': 'Indexzeile',
      'memory.content': 'Inhalt',
      'memory.saved': 'Speicher geschrieben.',
      'memory.deleted': 'Speicherdatei entfernt.',
      'docs.title': 'Doku',
      'services.title': 'Dienste',
      'services.logs': 'Logs',
      'services.start': 'Starten',
      'services.stop': 'Stoppen',
      'services.restart': 'Neustart',
      'worktrees.title': 'Worktrees',
      'worktrees.merge': 'Merge',
      'worktrees.remove': 'Entfernen',
      'worktrees.adopt': 'Übernehmen',
      'worktrees.add': 'Worktree anlegen',
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

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
        // A non-JSON answer (an auth page) is reported by status below.
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? `request failed (${response.status})`)
      }
      return payload
    }

    /** Run one reagent tool through the host's registry. */
    function callTool(name, args) {
      return api('call', { name, args: args ?? {} })
    }

    /** Run a tool and throw its error text as an exception. */
    async function runTool(name, args) {
      const result = await callTool(name, args)
      if (result.isError) throw new Error(result.text || `${name} failed`)
      return result
    }

    function parseJson(text) {
      if (typeof text !== 'string') return undefined
      try {
        return JSON.parse(text)
      } catch {
        return undefined
      }
    }

    async function fetchJson(name, args) {
      const result = await callTool(name, args)
      if (result.isError) throw new Error(result.text || `${name} failed`)
      const value = parseJson(result.text)
      if (value === undefined) throw new Error(`unexpected ${name} response: ${clamp(result.text, 200)}`)
      return value
    }

    function messageOf(failure) {
      return String(failure?.message ?? failure ?? 'request failed')
    }

    function clamp(text, limit) {
      const value = String(text ?? '')
      return value.length > limit ? `${value.slice(0, limit)}…` : value
    }

    function fmtWhen(seconds, t) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
      const date = new Date(seconds * 1000)
      const diff = Date.now() - date.getTime()
      if (diff < 45_000) return t('time.justNow')
      const minutes = Math.round(diff / 60_000)
      if (minutes < 60) return t('time.minutes', { n: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 36) return t('time.hours', { n: hours })
      return date.toLocaleDateString()
    }

    function fmtDate(seconds) {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
      return new Date(seconds * 1000).toLocaleString()
    }

    function contentText(content) {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .map((part) =>
            typeof part === 'string' ? part : part !== null && typeof part === 'object' && typeof part.text === 'string' ? part.text : '',
          )
          .filter((piece) => piece !== '')
          .join('\n')
      }
      if (content !== null && typeof content === 'object') return JSON.stringify(content)
      return ''
    }

    function callLabel(call) {
      if (call === null || typeof call !== 'object') return String(call ?? '')
      const fn = call.function !== null && typeof call.function === 'object' ? call.function : call
      const name = typeof fn.name === 'string' ? fn.name.replaceAll('__', '.') : ''
      const args = typeof fn.arguments === 'string' ? fn.arguments : fn.arguments === undefined ? '' : JSON.stringify(fn.arguments)
      return args === '' ? name : `${name} ${clamp(args, 800)}`
    }

    /** The index line a memory file already has, so edits keep their summary. */
    function aboutFromIndex(index, file) {
      if (typeof index !== 'string') return ''
      for (const line of index.split('\n')) {
        const match = line.match(/^\s*[-*]\s*\[[^\]]*\]\(([^)]+)\)\s*(?:[—–-]\s*)?(.*)$/)
        if (match !== null && match[1].trim() === file) return match[2].trim()
      }
      return ''
    }

    function shortId(id) {
      return typeof id === 'string' && id.length > 8 ? id.slice(0, 8) : String(id ?? '')
    }

    const STATE_TONE = {
      running: 'success',
      waiting: 'warn',
      queued: 'idle',
      paused: 'warn',
      done: 'idle',
      failed: 'error',
      cancelled: 'idle',
    }

    function stateTone(state) {
      return STATE_TONE[state] ?? 'idle'
    }

    // -----------------------------------------------------------------------
    // Hooks
    // -----------------------------------------------------------------------

    /** Load once and (optionally) refresh on an interval. */
    function useLoad(load, deps, intervalMs) {
      const [state, setState] = React.useState({ data: null, error: null, loading: true })
      const loadRef = React.useRef(load)
      loadRef.current = load
      const [tick, setTick] = React.useState(0)
      const reload = React.useCallback(() => setTick((value) => value + 1), [])
      React.useEffect(() => {
        let alive = true
        const run = async () => {
          try {
            const value = await loadRef.current()
            if (alive) setState({ data: value, error: null, loading: false })
          } catch (failure) {
            if (alive) setState((previous) => ({ data: previous.data, error: messageOf(failure), loading: false }))
          }
        }
        void run()
        if (!(typeof intervalMs === 'number' && intervalMs > 0)) {
          return () => {
            alive = false
          }
        }
        const timer = setInterval(() => {
          if (!document.hidden) void run()
        }, intervalMs)
        return () => {
          alive = false
          clearInterval(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [...deps, tick, intervalMs])
      return { ...state, reload }
    }

    /** One user action: busy flag plus an error or success notice. */
    function useAction() {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const run = React.useCallback(async (task, success) => {
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
          const result = await task()
          if (success !== undefined) setNotice(success)
          return result
        } catch (failure) {
          setError(messageOf(failure))
          return undefined
        } finally {
          setBusy(false)
        }
      }, [])
      return { busy, error, notice, run, setError, setNotice }
    }

    const Loc = React.createContext((key) => key)
    function useT() {
      return React.useContext(Loc)
    }

    // -----------------------------------------------------------------------
    // Atoms
    // -----------------------------------------------------------------------

    function Dot({ tone }) {
      return h('span', { className: `dshr-dot ${tone}`, 'aria-hidden': true })
    }

    function Pill({ tone, children }) {
      return h('span', { className: `dshr-pill ${tone ?? 'idle'}` }, children)
    }

    function Btn({ primary, danger, disabled, onClick, children, title, className }) {
      return h(
        'button',
        {
          type: 'button',
          className: `dshr-btn${primary ? ' primary' : ''}${danger ? ' danger' : ''}${className ? ` ${className}` : ''}`,
          disabled,
          onClick,
          title,
        },
        children,
      )
    }

    function ConfirmBtn({ onConfirm, children, confirmLabel, disabled, danger }) {
      const t = useT()
      const [armed, setArmed] = React.useState(false)
      React.useEffect(() => {
        if (!armed) return undefined
        const timer = setTimeout(() => setArmed(false), 4000)
        return () => clearTimeout(timer)
      }, [armed])
      return h(
        Btn,
        {
          danger,
          disabled,
          onClick: () => {
            if (armed) {
              setArmed(false)
              void onConfirm()
            } else {
              setArmed(true)
            }
          },
        },
        armed ? (confirmLabel ?? t('common.confirm')) : children,
      )
    }

    function Input(props) {
      return h('input', { type: 'text', ...props, className: `dshr-input${props.className ? ` ${props.className}` : ''}` })
    }

    function Area(props) {
      return h('textarea', { ...props, className: `dshr-textarea${props.className ? ` ${props.className}` : ''}` })
    }

    function Select({ value, onChange, children, className, disabled }) {
      return h('select', { className: `dshr-select${className ? ` ${className}` : ''}`, value, onChange, disabled }, children)
    }

    function Field({ label, hint, children }) {
      return h(
        'label',
        { className: 'dshr-field' },
        h('span', { className: 'dshr-label' }, label),
        children,
        hint === undefined ? null : h('span', { className: 'dshr-note' }, hint),
      )
    }

    function Notice({ error, notice }) {
      return h(
        React.Fragment,
        null,
        error === null || error === undefined ? null : h('div', { className: 'dshr-error', role: 'alert' }, error),
        notice === null || notice === undefined ? null : h('div', { className: 'dshr-ok' }, notice),
      )
    }

    function Text({ value, muted }) {
      if (value === null || value === undefined || value === '') return null
      return h('div', { className: `dshr-text${muted ? ' muted' : ''}` }, String(value))
    }

    function Raw({ value }) {
      return h('pre', { className: 'dshr-pre' }, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
    }

    function KeyValue({ label, value }) {
      if (value === null || value === undefined || value === '') return null
      const shown = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return h(
        'div',
        { className: 'dshr-kv' },
        h('span', { className: 'dshr-kv-key' }, label),
        h('span', { className: 'dshr-kv-val' }, shown),
      )
    }

    function Empty({ children }) {
      return h('div', { className: 'dshr-empty' }, children)
    }

    function Loading() {
      const t = useT()
      return h('div', { className: 'dshr-note' }, t('common.loading'))
    }

    function Split({ list, detail }) {
      return h('div', { className: 'dshr-split' }, h('div', { className: 'dshr-list' }, list), h('div', { className: 'dshr-detail' }, detail))
    }

    // -----------------------------------------------------------------------
    // Task wait controls (question, approval, merge, budget)
    // -----------------------------------------------------------------------

    function TaskWait({ taskId, wait, onChange }) {
      const t = useT()
      const action = useAction()
      const [answer, setAnswer] = React.useState('')
      const [reason, setReason] = React.useState('')
      const [always, setAlways] = React.useState(false)
      const [tokens, setTokens] = React.useState('')
      const [cost, setCost] = React.useState('')
      const [minutes, setMinutes] = React.useState('')

      if (wait === null || wait === undefined || typeof wait !== 'object') return null

      const finish = (task, success) =>
        action.run(async () => {
          await task()
          setAnswer('')
          setReason('')
          onChange?.()
        }, success)

      let body
      if (wait.kind === 'question') {
        body = h(
          'div',
          { className: 'dshr-wait' },
          h('div', { className: 'dshr-wait-head' }, h(Dot, { tone: 'warn' }), t('tasks.question')),
          h(Text, { value: wait.question }),
          Array.isArray(wait.options) && wait.options.length > 0
            ? h(
                'div',
                { className: 'dshr-btnrow' },
                ...wait.options.map((option) =>
                  h(
                    Btn,
                    {
                      key: option,
                      disabled: action.busy,
                      onClick: () => finish(() => runTool('task_answer', { task: taskId, text: option }), t('tasks.sent')),
                    },
                    option,
                  ),
                ),
              )
            : null,
          h(Area, {
            rows: 3,
            value: answer,
            placeholder: t('tasks.answerPlaceholder'),
            onChange: (event) => setAnswer(event.target.value),
          }),
          h(
            'div',
            { className: 'dshr-btnrow' },
            h(
              Btn,
              {
                primary: true,
                disabled: action.busy || answer.trim() === '',
                onClick: () => finish(() => runTool('task_answer', { task: taskId, text: answer.trim() }), t('tasks.sent')),
              },
              t('tasks.answer'),
            ),
          ),
        )
      } else if (wait.kind === 'approval') {
        const call = wait.call ?? {}
        body = h(
          'div',
          { className: 'dshr-wait' },
          h('div', { className: 'dshr-wait-head' }, h(Dot, { tone: 'warn' }), t('tasks.approval')),
          h('div', { className: 'dshr-mono' }, callLabel(call)),
          h(
            'label',
            { className: 'dshr-row' },
            h('input', { type: 'checkbox', checked: always, onChange: (event) => setAlways(event.target.checked) }),
            h('span', { className: 'dshr-note' }, t('tasks.approveAlways')),
          ),
          h(
            'div',
            { className: 'dshr-btnrow' },
            h(
              Btn,
              {
                primary: true,
                disabled: action.busy,
                onClick: () =>
                  finish(
                    () => runTool('task_approve', { task: taskId, call_id: call.id, approved: true, always }),
                    t('tasks.sent'),
                  ),
              },
              always ? t('tasks.approveAlways') : t('tasks.approveOnce'),
            ),
            h(
              Btn,
              {
                danger: true,
                disabled: action.busy,
                onClick: () =>
                  finish(
                    () => runTool('task_approve', { task: taskId, call_id: call.id, approved: false }),
                    t('tasks.sent'),
                  ),
              },
              t('tasks.deny'),
            ),
          ),
        )
      } else if (wait.kind === 'merge') {
        body = h(
          'div',
          { className: 'dshr-wait' },
          h('div', { className: 'dshr-wait-head' }, h(Dot, { tone: 'warn' }), t('tasks.merge')),
          wait.branch === undefined ? null : h('div', { className: 'dshr-mono' }, String(wait.branch)),
          h(Text, { value: wait.diffstat ?? wait.summary }),
          h(Area, {
            rows: 2,
            value: reason,
            placeholder: t('tasks.mergeReason'),
            onChange: (event) => setReason(event.target.value),
          }),
          h(
            'div',
            { className: 'dshr-btnrow' },
            h(
              Btn,
              {
                primary: true,
                disabled: action.busy,
                onClick: () => finish(() => runTool('task_merge', { task: taskId, merge: true }), t('tasks.sent')),
              },
              t('tasks.mergeDo'),
            ),
            h(
              Btn,
              {
                danger: true,
                disabled: action.busy || reason.trim() === '',
                onClick: () =>
                  finish(() => runTool('task_merge', { task: taskId, merge: false, message: reason.trim() }), t('tasks.sent')),
              },
              t('tasks.mergeSendBack'),
            ),
          ),
        )
      } else if (wait.kind === 'budget') {
        body = h(
          'div',
          { className: 'dshr-wait' },
          h('div', { className: 'dshr-wait-head' }, h(Dot, { tone: 'warn' }), t('tasks.budget')),
          h(
            'div',
            { className: 'dshr-cols' },
            h(Field, { label: t('tasks.tokensField') }, h(Input, { value: tokens, onChange: (e) => setTokens(e.target.value) })),
            h(Field, { label: t('tasks.costField') }, h(Input, { value: cost, onChange: (e) => setCost(e.target.value) })),
            h(Field, { label: t('tasks.minutesField') }, h(Input, { value: minutes, onChange: (e) => setMinutes(e.target.value) })),
          ),
          h(
            'div',
            { className: 'dshr-btnrow' },
            h(
              Btn,
              {
                primary: true,
                disabled: action.busy,
                onClick: () => {
                  const args = { task: taskId }
                  for (const [field, raw] of [['tokens', tokens], ['cost', cost], ['minutes', minutes]]) {
                    if (raw.trim() === '') continue
                    const value = Number(raw)
                    if (Number.isFinite(value)) args[field] = value
                  }
                  finish(() => runTool('task_raise_budget', args), t('tasks.sent'))
                },
              },
              t('tasks.raiseBudget'),
            ),
          ),
        )
      } else {
        body = h('div', { className: 'dshr-wait' }, h('div', { className: 'dshr-wait-head' }, t('tasks.state')), h(Raw, { value: wait }))
      }

      return h(React.Fragment, null, body, h(Notice, { error: action.error, notice: action.notice }))
    }

    // -----------------------------------------------------------------------
    // Task detail
    // -----------------------------------------------------------------------

    function TaskDetail({ taskId, onSelectTask, onChanged }) {
      const t = useT()
      const action = useAction()
      const [message, setMessage] = React.useState('')
      React.useEffect(() => setMessage(''), [taskId])
      const data = useLoad(
        async () => {
          const task = await fetchJson('task_get', { task: taskId })
          let transcript = null
          try {
            transcript = await fetchJson('task_transcript', { task: taskId, tail: 30 })
          } catch {
            transcript = null
          }
          return { task, transcript }
        },
        [taskId],
        10_000,
      )

      if (data.error !== null) {
        return h('div', { className: 'dshr-section' }, h(Notice, { error: data.error }))
      }
      if (data.data === null) return h(Loading)

      const task = data.data.task ?? {}
      const transcript = data.data.transcript ?? {}
      const wait = task.wait ?? task.waits_for
      const state = task.state ?? 'unknown'
      const messages = Array.isArray(transcript.messages) ? transcript.messages : []

      const act = (name, args) =>
        action.run(async () => {
          await runTool(name, args)
          data.reload()
          onChanged?.()
        })

      return h(
        'div',
        { className: 'dshr-section dshr-taskdetail' },
        h(
          'div',
          { className: 'dshr-row' },
          h(Pill, { tone: stateTone(state) }, state),
          h('div', { className: 'dshr-grow dshr-tasktitle' }, task.title || h('span', { className: 'dshr-note' }, '(untitled)')),
          h(Btn, { onClick: data.reload, disabled: data.loading }, t('common.refresh')),
        ),
        h(
          'div',
          { className: 'dshr-meta' },
          h('span', { className: 'dshr-mono' }, shortId(task.id)),
          task.project === undefined ? null : h('span', null, task.project),
          task.profile === undefined || task.profile === null ? null : h('span', null, `${t('tasks.profileLabel')}: ${task.profile}`),
          task.worktree === undefined || task.worktree === null ? null : h('span', null, `${t('tasks.worktreeLabel')}: ${task.worktree}`),
          typeof task.updated === 'number' ? h('span', null, t('tasks.updated', { when: fmtWhen(task.updated, t) })) : null,
        ),
        h(
          'div',
          { className: 'dshr-kvs' },
          h(KeyValue, { label: t('tasks.id'), value: task.id }),
          h(KeyValue, { label: t('tasks.projectLabel'), value: task.project }),
          h(KeyValue, { label: t('tasks.created'), value: fmtDate(task.created) }),
          h(KeyValue, { label: t('tasks.origin'), value: task.origin }),
          h(KeyValue, { label: t('tasks.cost'), value: typeof task.cost === 'number' ? task.cost.toFixed(4) : task.cost }),
          h(KeyValue, { label: t('tasks.tokens'), value: task.tokens }),
          h(KeyValue, { label: t('tasks.parent'), value: task.parent }),
        ),
        wait === null || wait === undefined
          ? null
          : h(TaskWait, { taskId: task.id, wait, onChange: () => { data.reload(); onChanged?.() } }),
        h(
          'div',
          { className: 'dshr-btnrow' },
          state === 'paused'
            ? h(Btn, { disabled: action.busy, onClick: () => act('task_resume', { task: task.id }) }, t('tasks.resume'))
            : h(
                Btn,
                {
                  disabled: action.busy || !['running', 'waiting', 'queued'].includes(state),
                  onClick: () => act('task_pause', { task: task.id }),
                },
                t('tasks.pause'),
              ),
          h(
            Btn,
            { disabled: action.busy || state !== 'failed', onClick: () => act('task_retry', { task: task.id }) },
            t('tasks.retry'),
          ),
          h(
            ConfirmBtn,
            {
              danger: true,
              disabled: action.busy || ['done', 'cancelled', 'failed'].includes(state),
              onConfirm: () => act('task_cancel', { task: task.id }),
              confirmLabel: t('tasks.cancelConfirm'),
            },
            t('tasks.cancel'),
          ),
        ),
        h(Notice, { error: action.error, notice: action.notice }),
        task.prompt === undefined || task.prompt === null || task.prompt === ''
          ? null
          : h(
              'details',
              { className: 'dshr-subsection' },
              h('summary', { className: 'dshr-h' }, t('tasks.prompt')),
              h(Raw, { value: task.prompt }),
            ),
        task.report === undefined || task.report === null
          ? null
          : h(
              'div',
              { className: 'dshr-subsection' },
              h('div', { className: 'dshr-h' }, t('tasks.report')),
              h(Raw, { value: task.report }),
            ),
        h(
          'div',
          { className: 'dshr-subsection' },
          h('div', { className: 'dshr-h' }, t('tasks.transcript')),
          messages.length === 0
            ? h('div', { className: 'dshr-note' }, t('tasks.noTranscript'))
            : h(
                'div',
                { className: 'dshr-messages' },
                ...messages.map((item, index) => {
                  const role = String(item.role ?? 'message')
                  const text = contentText(item.content)
                  return h(
                    'div',
                    { className: `dshr-msg role-${role}`, key: `${role}-${index}` },
                    h('div', { className: 'dshr-msg-head' }, role),
                    text === '' ? null : h('div', { className: 'dshr-text' }, clamp(text, 6000)),
                    Array.isArray(item.tool_calls)
                      ? h(
                          'div',
                          { className: 'dshr-mono' },
                          ...item.tool_calls.map((call, callIndex) =>
                            h('div', { key: callIndex }, `→ ${clamp(callLabel(call), 400)}`),
                          ),
                        )
                      : null,
                  )
                }),
              ),
        ),
        Array.isArray(task.subtasks) && task.subtasks.length > 0
          ? h(
              'div',
              { className: 'dshr-subsection' },
              h('div', { className: 'dshr-h' }, t('tasks.subtasks')),
              ...task.subtasks.map((child) =>
                h(
                  Btn,
                  {
                    key: typeof child === 'string' ? child : child.id,
                    onClick: () => onSelectTask?.(typeof child === 'string' ? child : child.id),
                  },
                  typeof child === 'string' ? child : `${child.title ?? child.id} (${child.state ?? '?'})`,
                ),
              ),
            )
          : null,
        h(
          'div',
          { className: 'dshr-subsection' },
          h('div', { className: 'dshr-h' }, t('tasks.message')),
          h(Area, {
            rows: 2,
            value: message,
            placeholder: t('tasks.messagePlaceholder'),
            onChange: (event) => setMessage(event.target.value),
          }),
          h(
            'div',
            { className: 'dshr-btnrow' },
            h(
              Btn,
              {
                primary: true,
                disabled: action.busy || message.trim() === '',
                onClick: () =>
                  action.run(async () => {
                    await runTool('task_message', { task: task.id, text: message.trim() })
                    setMessage('')
                    data.reload()
                    onChanged?.()
                  }, t('tasks.sent')),
              },
              t('common.send'),
            ),
          ),
        ),
      )
    }

    // -----------------------------------------------------------------------
    // Tasks
    // -----------------------------------------------------------------------

    function TasksView({ projects, profiles, route, onRouteConsumed, onOpenTask }) {
      const t = useT()
      const action = useAction()
      const [project, setProject] = React.useState(route?.project ?? '')
      const [activeOnly, setActiveOnly] = React.useState(true)
      const [selected, setSelected] = React.useState(route?.taskId ?? null)
      const [startOpen, setStartOpen] = React.useState(route?.newTask === true)
      const [form, setForm] = React.useState({ project: route?.project ?? '', title: '', prompt: '', worktree: '', profile: '' })

      React.useEffect(() => {
        if (route === null || route === undefined) return
        if (route.project !== undefined) {
          setProject(route.project)
          setForm((current) => ({ ...current, project: route.project }))
        }
        if (route.taskId !== undefined) setSelected(route.taskId)
        if (route.newTask === true) setStartOpen(true)
        onRouteConsumed?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [route?.nonce])

      const list = useLoad(
        async () => {
          const args = { limit: 60 }
          if (project !== '') args.project = project
          if (activeOnly) args.active = true
          const value = await fetchJson('task_list', args)
          return Array.isArray(value) ? value : []
        },
        [project, activeOnly],
        12_000,
      )

      const start = () =>
        action.run(async () => {
          if (form.project === '') throw new Error(t('tasks.project'))
          if (form.prompt.trim() === '') throw new Error(t('tasks.prompt'))
          const args = { project: form.project, prompt: form.prompt.trim() }
          if (form.title.trim() !== '') args.title = form.title.trim()
          if (form.worktree.trim() !== '') args.worktree = form.worktree.trim()
          if (form.profile !== '') args.profile = form.profile
          const result = await callTool('task_start', args)
          if (result.isError) throw new Error(result.text)
          const started = parseJson(result.text)
          setStartOpen(false)
          setForm({ project: form.project, title: '', prompt: '', worktree: '', profile: '' })
          if (started !== undefined && typeof started.id === 'string') setSelected(started.id)
          list.reload()
        }, t('tasks.sent'))

      const items = list.data ?? []
      const detail = selected === null
        ? h(Empty, null, t('tasks.pick'))
        : h(TaskDetail, { taskId: selected, onSelectTask: (id) => setSelected(id), onChanged: list.reload })

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dshr-toolbar' },
          h(
            Select,
            {
              value: project,
              onChange: (event) => {
                setProject(event.target.value)
                setSelected(null)
              },
            },
            h('option', { value: '' }, t('common.all')),
            ...projects.map((item) => h('option', { key: item.slug, value: item.slug }, item.name || item.slug)),
          ),
          h(
            'label',
            { className: 'dshr-row' },
            h('input', {
              type: 'checkbox',
              checked: activeOnly,
              onChange: (event) => setActiveOnly(event.target.checked),
            }),
            h('span', { className: 'dshr-note' }, t('tasks.activeOnly')),
          ),
          h('div', { className: 'dshr-grow' }),
          h(
            Btn,
            {
              onClick: () => {
                setStartOpen(!startOpen)
                setForm((current) => ({ ...current, project: project === '' ? current.project : project }))
              },
            },
            startOpen ? t('common.hide') : `+ ${t('tasks.new')}`,
          ),
        ),
        startOpen
          ? h(
              'div',
              { className: 'dshr-section' },
              h('div', { className: 'dshr-h' }, t('tasks.start')),
              h(
                'div',
                { className: 'dshr-cols' },
                h(
                  Field,
                  { label: t('tasks.project') },
                  h(
                    Select,
                    {
                      value: form.project,
                      onChange: (event) => setForm({ ...form, project: event.target.value }),
                    },
                    h('option', { value: '' }, '—'),
                    ...projects.map((item) => h('option', { key: item.slug, value: item.slug }, item.name || item.slug)),
                  ),
                ),
                h(
                  Field,
                  { label: t('tasks.profile') },
                  h(
                    Select,
                    {
                      value: form.profile,
                      onChange: (event) => setForm({ ...form, profile: event.target.value }),
                    },
                    h('option', { value: '' }, t('tasks.profileDefault')),
                    ...(profiles ?? []).map((profile) => h('option', { key: profile, value: profile }, profile)),
                  ),
                ),
              ),
              h(
                Field,
                { label: t('tasks.name') },
                h(Input, {
                  value: form.title,
                  placeholder: t('tasks.namePlaceholder'),
                  onChange: (event) => setForm({ ...form, title: event.target.value }),
                }),
              ),
              h(
                Field,
                { label: t('tasks.prompt') },
                h(Area, {
                  rows: 5,
                  value: form.prompt,
                  placeholder: t('tasks.promptPlaceholder'),
                  onChange: (event) => setForm({ ...form, prompt: event.target.value }),
                }),
              ),
              h(
                Field,
                { label: t('tasks.worktree') },
                h(Input, {
                  value: form.worktree,
                  placeholder: t('tasks.worktreePlaceholder'),
                  onChange: (event) => setForm({ ...form, worktree: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'dshr-btnrow' },
                h(Btn, { primary: true, disabled: action.busy, onClick: start }, action.busy ? t('tasks.starting') : t('tasks.start')),
                h(Btn, { onClick: () => setStartOpen(false) }, t('common.cancel')),
              ),
              h(Notice, { error: action.error, notice: action.notice }),
            )
          : null,
        h(Split, {
          list: h(
            React.Fragment,
            null,
            h(Notice, { error: list.error }),
            items.length === 0
              ? h(Empty, null, t('tasks.listEmpty'))
              : h(
                  'div',
                  { className: 'dshr-listscroll' },
                  ...items.map((task) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        key: task.id,
                        className: `dshr-listbtn${task.id === selected ? ' active' : ''}`,
                        onClick: () => setSelected(task.id),
                      },
                      h(
                        'div',
                        { className: 'dshr-listbtn-top' },
                        h(Dot, { tone: stateTone(task.state) }),
                        h('span', { className: 'dshr-listbtn-title' }, task.title || '(untitled)'),
                      ),
                      h(
                        'div',
                        { className: 'dshr-listbtn-sub' },
                        h('span', null, task.project ?? ''),
                        h('span', null, task.state ?? ''),
                        h('span', null, fmtWhen(task.updated ?? task.created, t)),
                      ),
                    ),
                  ),
                ),
          ),
          detail,
        }),
      )
    }

    // -----------------------------------------------------------------------
    // Inbox
    // -----------------------------------------------------------------------

    function InboxView({ onOpenTask }) {
      const t = useT()
      const inbox = useLoad(() => fetchJson('inbox'), [], 15_000)
      const action = useAction()

      const data = inbox.data ?? {}
      const waiting = Array.isArray(data.waiting) ? data.waiting : []
      const failed = Array.isArray(data.failed) ? data.failed : []
      const notifications = Array.isArray(data.notifications) ? data.notifications : []

      return h(
        React.Fragment,
        null,
        h(Notice, { error: inbox.error }),
        h(
          'div',
          { className: 'dshr-section' },
          h('div', { className: 'dshr-h' }, `${t('inbox.waiting')} (${waiting.length})`),
          waiting.length === 0
            ? h('div', { className: 'dshr-note' }, t('inbox.noWaiting'))
            : h(
                React.Fragment,
                null,
                ...waiting.map((task) =>
                  h(
                    'div',
                    { key: task.id, className: 'dshr-card' },
                    h(
                      'div',
                      { className: 'dshr-row' },
                      h(Pill, { tone: stateTone(task.state) }, task.state ?? 'waiting'),
                      h('div', { className: 'dshr-grow dshr-tasktitle' }, task.title || '(untitled)'),
                      h('span', { className: 'dshr-note' }, task.project ?? ''),
                    ),
                    h(TaskWait, {
                      taskId: task.id,
                      wait: task.wait ?? task.waits_for,
                      onChange: inbox.reload,
                    }),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'dshr-section' },
          h('div', { className: 'dshr-h' }, `${t('inbox.failed')} (${failed.length})`),
          failed.length === 0
            ? h('div', { className: 'dshr-note' }, t('inbox.noFailed'))
            : h(
                React.Fragment,
                null,
                ...failed.map((task) =>
                  h(
                    'div',
                    { key: task.id, className: 'dshr-card' },
                    h(
                      'div',
                      { className: 'dshr-row' },
                      h(Dot, { tone: 'error' }),
                      h('div', { className: 'dshr-grow dshr-tasktitle' }, task.title || '(untitled)'),
                      h('span', { className: 'dshr-note' }, task.project ?? ''),
                    ),
                    h(
                      'div',
                      { className: 'dshr-btnrow' },
                      h(Btn, { onClick: () => onOpenTask?.(task.id, task.project) }, t('common.open')),
                      h(
                        Btn,
                        {
                          disabled: action.busy,
                          onClick: () =>
                            action.run(async () => {
                              await runTool('task_retry', { task: task.id })
                              inbox.reload()
                            }),
                        },
                        t('common.retry'),
                      ),
                    ),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'dshr-section' },
          h('div', { className: 'dshr-h' }, `${t('inbox.notifications')} (${notifications.length})`),
          notifications.length === 0
            ? h('div', { className: 'dshr-note' }, t('inbox.noNotifications'))
            : h(
                React.Fragment,
                null,
                ...notifications.slice(0, 12).map((note) =>
                  h(
                    'div',
                    { key: note.id, className: 'dshr-card' },
                    h(
                      'div',
                      { className: 'dshr-row' },
                      h(Dot, { tone: note.seen ? 'idle' : 'warn' }),
                      h('div', { className: 'dshr-grow dshr-tasktitle' }, note.title ?? note.kind ?? ''),
                      h('span', { className: 'dshr-note' }, fmtWhen(note.at, t)),
                    ),
                    note.body === undefined || note.body === null ? null : h(Raw, { value: clamp(note.body, 1200) }),
                    note.seen === true
                      ? h('span', { className: 'dshr-note' }, t('inbox.seen'))
                      : h(
                          Btn,
                          {
                            disabled: action.busy,
                            onClick: () =>
                              action.run(async () => {
                                await runTool('notifications_seen', { id: note.id })
                                inbox.reload()
                              }),
                          },
                          t('inbox.markSeen'),
                        ),
                  ),
                ),
              ),
          h(Notice, { error: action.error, notice: action.notice }),
        ),
      )
    }

    // -----------------------------------------------------------------------
    // Projects
    // -----------------------------------------------------------------------

    function ProjectsView({ projects, onStartTask, onOpenMemory, onOpenServices, onOpenWorktrees }) {
      const t = useT()
      const [selected, setSelected] = React.useState(projects[0]?.slug ?? null)
      const detail = useLoad(() => (selected === null ? null : fetchJson('project_get', { project: selected })), [selected, projects.length], 0)
      const project = detail.data

      return h(Split, {
        list:
          projects.length === 0
            ? h(Empty, null, t('projects.empty'))
            : h(
                'div',
                { className: 'dshr-listscroll' },
                ...projects.map((item) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      key: item.slug,
                      className: `dshr-listbtn${item.slug === selected ? ' active' : ''}`,
                      onClick: () => setSelected(item.slug),
                    },
                    h(
                      'div',
                      { className: 'dshr-listbtn-top' },
                      h(Dot, { tone: item.active > 0 ? 'success' : 'idle' }),
                      h('span', { className: 'dshr-listbtn-title' }, item.name || item.slug),
                    ),
                    h(
                      'div',
                      { className: 'dshr-listbtn-sub' },
                      h('span', null, item.slug),
                      h('span', null, `${item.active ?? 0} ${t('projects.active').toLowerCase()}`),
                    ),
                  ),
                ),
              ),
        detail:
          selected === null
            ? h(Empty, null, t('projects.pick'))
            : h(
                'div',
                { className: 'dshr-section' },
                h('div', { className: 'dshr-h' }, project?.name ?? selected),
                h(Notice, { error: detail.error }),
                project === null
                  ? h(Loading)
                  : h(
                      React.Fragment,
                      null,
                      h(
                        'div',
                        { className: 'dshr-kvs' },
                        h(KeyValue, { label: t('projects.path'), value: project.path }),
                        h(KeyValue, { label: t('projects.active'), value: project.active }),
                        h(KeyValue, { label: t('projects.merge'), value: project.merge }),
                        h(KeyValue, { label: t('projects.profile'), value: project.profile }),
                        h(KeyValue, { label: t('projects.maxTasks'), value: project.max_tasks }),
                        h(KeyValue, { label: t('projects.devshell'), value: project.devshell }),
                        h(KeyValue, { label: t('projects.defaultAction'), value: project.default_action }),
                        h(KeyValue, { label: t('projects.worktreeSharing'), value: project.worktree_sharing }),
                      ),
                      h(
                        'div',
                        { className: 'dshr-btnrow' },
                        h(Btn, { primary: true, onClick: () => onStartTask?.(selected) }, t('projects.startTask')),
                        h(Btn, { onClick: () => onOpenMemory?.(selected) }, t('projects.memory')),
                        h(Btn, { onClick: () => onOpenServices?.(selected) }, t('projects.services')),
                        h(Btn, { onClick: () => onOpenWorktrees?.(selected) }, t('projects.worktrees')),
                      ),
                    ),
              ),
      })
    }

    // -----------------------------------------------------------------------
    // Memory
    // -----------------------------------------------------------------------

    function MemoryView({ projects, scope: initialScope }) {
      const t = useT()
      const [scope, setScope] = React.useState(initialScope ?? 'global')
      React.useEffect(() => {
        if (initialScope !== undefined) setScope(initialScope)
      }, [initialScope])
      const [file, setFile] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [about, setAbout] = React.useState('')
      const [newFile, setNewFile] = React.useState('')
      const action = useAction()

      const index = useLoad(() => fetchJson('memory_read', { scope }), [scope], 0)
      const content = useLoad(
        () => (file === null ? null : fetchJson('memory_read', { scope, file })),
        [scope, file],
        0,
      )

      React.useEffect(() => {
        if (content.data !== null && typeof content.data === 'object' && file !== null) {
          setDraft(typeof content.data.text === 'string' ? content.data.text : '')
          setAbout(aboutFromIndex(index.data?.index, file))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [content.data, index.data?.index, file])

      const files = Array.isArray(index.data?.files) ? index.data.files : []
      const targetFile = newFile.trim() !== '' ? newFile.trim() : file

      const open = (name) => {
        setFile(name)
        setNewFile('')
        setAbout('')
      }

      const save = () =>
        action.run(async () => {
          if (targetFile === null || targetFile.trim() === '') throw new Error(t('memory.newFile'))
          if (about.trim() === '') throw new Error(t('memory.about'))
          await runTool('memory_write', { scope, file: targetFile.trim(), text: draft, about: about.trim() })
          setNewFile('')
          setFile(targetFile.trim())
          setAbout('')
          index.reload()
          content.reload()
        }, t('memory.saved'))

      const remove = () =>
        action.run(async () => {
          if (file === null) return
          await runTool('memory_remove', { scope, file })
          setFile(null)
          setDraft('')
          setAbout('')
          index.reload()
        }, t('memory.deleted'))

      const scopes = ['global', ...projects.map((item) => item.slug)]

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dshr-toolbar' },
          h(
            Select,
            {
              value: scope,
              onChange: (event) => {
                setScope(event.target.value)
                setFile(null)
                setDraft('')
                setNewFile('')
              },
            },
            ...scopes.map((item) => h('option', { key: item, value: item }, item === 'global' ? t('memory.global') : item)),
          ),
          h('span', { className: 'dshr-mono' }, index.data?.dir ?? ''),
        ),
        h(Notice, { error: index.error }),
        h(Split, {
          list: h(
            React.Fragment,
            null,
            h('div', { className: 'dshr-h' }, t('memory.files')),
            files.length === 0
              ? h('div', { className: 'dshr-note' }, t('memory.noFiles'))
              : h(
                  'div',
                  { className: 'dshr-listscroll' },
                  ...files.map((name) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        key: name,
                        className: `dshr-listbtn${name === file ? ' active' : ''}`,
                        onClick: () => open(name),
                      },
                      h('span', { className: 'dshr-listbtn-title' }, name),
                    ),
                  ),
                ),
            h(
              'div',
              { className: 'dshr-subsection' },
              h('div', { className: 'dshr-label' }, t('memory.newFile')),
              h(Input, {
                value: newFile,
                placeholder: t('memory.filePlaceholder'),
                onChange: (event) => setNewFile(event.target.value),
              }),
              h(
                Btn,
                {
                  onClick: () => {
                    setFile(null)
                    setDraft('')
                    setAbout('')
                  },
                },
                t('common.add'),
              ),
            ),
            index.data?.index === undefined
              ? null
              : h(
                  'details',
                  { className: 'dshr-subsection' },
                  h('summary', null, t('memory.index')),
                  h(Raw, { value: index.data.index }),
                ),
          ),
          detail: h(
            'div',
            { className: 'dshr-section' },
            h('div', { className: 'dshr-h' }, targetFile ?? t('memory.title')),
            targetFile === null || targetFile === ''
              ? h(Empty, null, t('memory.select'))
              : h(
                  React.Fragment,
                  null,
                  h(Notice, { error: content.error }),
                  h(
                    Field,
                    { label: t('memory.about'), hint: t('memory.aboutPlaceholder') },
                    h(Input, { value: about, onChange: (event) => setAbout(event.target.value) }),
                  ),
                  h(
                    Field,
                    { label: t('memory.content') },
                    h(Area, {
                      rows: 16,
                      value: draft,
                      placeholder: t('memory.contentPlaceholder'),
                      onChange: (event) => setDraft(event.target.value),
                    }),
                  ),
                  h(
                    'div',
                    { className: 'dshr-btnrow' },
                    h(Btn, { primary: true, disabled: action.busy, onClick: save }, t('common.save')),
                    file === null
                      ? null
                      : h(
                          ConfirmBtn,
                          {
                            danger: true,
                            disabled: action.busy,
                            onConfirm: remove,
                            confirmLabel: t('memory.deleteConfirm'),
                          },
                          t('common.delete'),
                        ),
                  ),
                  h(Notice, { error: action.error, notice: action.notice }),
                ),
          ),
        }),
      )
    }

    // -----------------------------------------------------------------------
    // Docs
    // -----------------------------------------------------------------------

    function DocsView() {
      const t = useT()
      const list = useLoad(() => fetchJson('docs_list'), [], 0)
      const [name, setName] = React.useState(null)
      const doc = useLoad(() => (name === null ? null : fetchJson('docs_read', { name })), [name], 0)
      const docs = Array.isArray(list.data) ? list.data : []

      return h(Split, {
        list:
          docs.length === 0
            ? h(Empty, null, t('docs.empty'))
            : h(
                'div',
                { className: 'dshr-listscroll' },
                ...docs.map((item) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      key: item.name,
                      className: `dshr-listbtn${item.name === name ? ' active' : ''}`,
                      onClick: () => setName(item.name),
                    },
                    h('span', { className: 'dshr-listbtn-title' }, item.name),
                    h('span', { className: 'dshr-listbtn-sub' }, clamp(item.description, 120)),
                  ),
                ),
              ),
        detail:
          name === null
            ? h(Empty, null, t('docs.pick'))
            : h(
                'div',
                { className: 'dshr-section' },
                h('div', { className: 'dshr-h' }, doc.data?.name ?? name),
                h(Notice, { error: doc.error }),
                doc.data === null ? h(Loading) : h(Raw, { value: doc.data.body ?? doc.data }),
              ),
      })
    }

    // -----------------------------------------------------------------------
    // Services
    // -----------------------------------------------------------------------

    function ServicesView({ projects, project: initialProject }) {
      const t = useT()
      const [project, setProject] = React.useState(initialProject ?? projects[0]?.slug ?? '')
      React.useEffect(() => {
        if (initialProject !== undefined) setProject(initialProject)
      }, [initialProject])
      const [logs, setLogs] = React.useState({})
      const action = useAction()

      const data = useLoad(() => (project === '' ? null : fetchJson('project_services', { project })), [project], 15_000)
      const services = Array.isArray(data.data?.services) ? data.data.services : []

      const act = (name, args) =>
        action.run(async () => {
          await runTool(name, args)
          data.reload()
        })

      const loadLogs = (name) =>
        action.run(async () => {
          const result = await callTool('service_logs', { project, name, lines: 200 })
          setLogs((current) => ({ ...current, [name]: result.text }))
        })

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dshr-toolbar' },
          h(
            Select,
            { value: project, onChange: (event) => setProject(event.target.value) },
            ...projects.map((item) => h('option', { key: item.slug, value: item.slug }, item.name || item.slug)),
          ),
          h(Btn, { onClick: data.reload }, t('common.refresh')),
          h('div', { className: 'dshr-grow' }),
          h(Notice, { error: action.error, notice: action.notice }),
        ),
        h(Notice, { error: data.error }),
        project === ''
          ? h(Empty, null, t('services.pickProject'))
          : services.length === 0
            ? h(Empty, null, t('services.empty'))
            : h(
                React.Fragment,
                null,
                ...services.map((service) => {
                  const state = service.state ?? {}
                  const tone = state.status === 'up' ? 'success' : state.status === 'backoff' || state.status === 'failing' ? 'error' : state.status === 'waiting' || state.status === 'starting' ? 'warn' : 'idle'
                  return h(
                    'div',
                    { key: service.name, className: 'dshr-section' },
                    h(
                      'div',
                      { className: 'dshr-row' },
                      h(Pill, { tone }, state.status ?? (service.enabled ? 'on' : 'off')),
                      h('div', { className: 'dshr-grow dshr-tasktitle' }, service.name),
                      state.since === undefined ? null : h('span', { className: 'dshr-note' }, `${t('services.since')} ${fmtWhen(state.since, t)}`),
                    ),
                    service.description === undefined || service.description === '' ? null : h(Text, { value: service.description, muted: true }),
                    h(
                      'div',
                      { className: 'dshr-kvs' },
                      h(KeyValue, { label: t('services.failures'), value: state.failures }),
                      h(KeyValue, { label: t('services.lastError'), value: state.last_error }),
                      h(KeyValue, { label: t('services.health'), value: service.health }),
                      h(KeyValue, { label: 'Job', value: state.job }),
                    ),
                    h(
                      'details',
                      { className: 'dshr-subsection' },
                      h('summary', null, t('services.script')),
                      h(Raw, { value: service.script ?? '' }),
                      service.notes === undefined ? null : h(Raw, { value: service.notes }),
                    ),
                    h(
                      'div',
                      { className: 'dshr-btnrow' },
                      state.status === 'waiting'
                        ? h(
                            React.Fragment,
                            null,
                            h(
                              Btn,
                              {
                                primary: true,
                                disabled: action.busy,
                                onClick: () => act('service_approve', { project, name: service.name, approved: true }),
                              },
                              t('tasks.approveOnce'),
                            ),
                            h(
                              Btn,
                              {
                                danger: true,
                                disabled: action.busy,
                                onClick: () => act('service_approve', { project, name: service.name, approved: false }),
                              },
                              t('tasks.deny'),
                            ),
                          )
                        : null,
                      h(
                        Btn,
                        {
                          disabled: action.busy,
                          onClick: () => act('service_start', { project, name: service.name }),
                        },
                        t('services.start'),
                      ),
                      h(
                        Btn,
                        {
                          disabled: action.busy,
                          onClick: () => act('service_stop', { project, name: service.name }),
                        },
                        t('services.stop'),
                      ),
                      h(
                        Btn,
                        {
                          disabled: action.busy,
                          onClick: () => act('service_restart', { project, name: service.name }),
                        },
                        t('services.restart'),
                      ),
                      h(
                        Btn,
                        {
                          disabled: action.busy,
                          onClick: () => loadLogs(service.name),
                        },
                        t('services.logs'),
                      ),
                    ),
                    logs[service.name] === undefined
                      ? null
                      : h(Raw, { value: logs[service.name] === '' ? t('services.noLogs') : logs[service.name] }),
                  )
                }),
              ),
        Array.isArray(data.data?.errors) && data.data.errors.length > 0
          ? h(
              'div',
              { className: 'dshr-section' },
              h('div', { className: 'dshr-h' }, t('services.unreadable')),
              h(Raw, { value: data.data.errors }),
            )
          : null,
      )
    }

    // -----------------------------------------------------------------------
    // Worktrees
    // -----------------------------------------------------------------------

    function WorktreesView({ projects, project: initialProject }) {
      const t = useT()
      const [project, setProject] = React.useState(initialProject ?? projects[0]?.slug ?? '')
      React.useEffect(() => {
        if (initialProject !== undefined) setProject(initialProject)
      }, [initialProject])
      const [form, setForm] = React.useState({ name: '', branch: '', base: '' })
      const [detail, setDetail] = React.useState({})
      const action = useAction()

      const data = useLoad(() => (project === '' ? null : fetchJson('worktree_list', { project })), [project], 15_000)
      const worktrees = Array.isArray(data.data?.worktrees) ? data.data.worktrees : []
      const adoptable = Array.isArray(data.data?.adoptable) ? data.data.adoptable : []

      const act = (name, args, success) =>
        action.run(async () => {
          await runTool(name, args)
          data.reload()
        }, success)

      const inspect = (name) =>
        action.run(async () => {
          const value = await fetchJson('worktree_get', { project, name })
          setDetail((current) => ({ ...current, [name]: value }))
        })

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dshr-toolbar' },
          h(
            Select,
            { value: project, onChange: (event) => setProject(event.target.value) },
            ...projects.map((item) => h('option', { key: item.slug, value: item.slug }, item.name || item.slug)),
          ),
          h(Btn, { onClick: data.reload }, t('common.refresh')),
          h('div', { className: 'dshr-grow' }),
          h(Notice, { error: action.error, notice: action.notice }),
        ),
        h(Notice, { error: data.error }),
        project === ''
          ? h(Empty, null, t('worktrees.pickProject'))
          : h(
              React.Fragment,
              null,
              h(
                'div',
                { className: 'dshr-section' },
                h('div', { className: 'dshr-h' }, t('worktrees.add')),
                h(
                  'div',
                  { className: 'dshr-cols' },
                  h(Field, { label: t('worktrees.name') }, h(Input, { value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) })),
                  h(Field, { label: t('worktrees.branch') }, h(Input, { value: form.branch, onChange: (e) => setForm({ ...form, branch: e.target.value }) })),
                  h(Field, { label: t('worktrees.base') }, h(Input, { value: form.base, onChange: (e) => setForm({ ...form, base: e.target.value }) })),
                ),
                h(
                  'div',
                  { className: 'dshr-btnrow' },
                  h(
                    Btn,
                    {
                      primary: true,
                      disabled: action.busy || form.name.trim() === '',
                      onClick: () => {
                        const args = { project, name: form.name.trim() }
                        if (form.branch.trim() !== '') args.branch = form.branch.trim()
                        if (form.base.trim() !== '') args.base = form.base.trim()
                        action.run(async () => {
                          await runTool('worktree_add', args)
                          setForm({ name: '', branch: '', base: '' })
                          data.reload()
                        }, t('worktrees.added'))
                      },
                    },
                    t('common.add'),
                  ),
                ),
              ),
              worktrees.length === 0
                ? h(Empty, null, t('worktrees.empty'))
                : h(
                    React.Fragment,
                    null,
                    ...worktrees.map((tree) => {
                      const name = tree.name ?? tree.branch ?? tree.path ?? ''
                      return h(
                        'div',
                        { key: name, className: 'dshr-section' },
                        h(
                          'div',
                          { className: 'dshr-row' },
                          h(Dot, { tone: tree.missing ? 'error' : tree.active > 0 ? 'success' : 'idle' }),
                          h('div', { className: 'dshr-grow dshr-tasktitle' }, name),
                          h('span', { className: 'dshr-mono' }, tree.branch ?? ''),
                          tree.sharing_now === undefined ? null : h(Pill, { tone: 'idle' }, tree.sharing_now),
                        ),
                        h(
                          'div',
                          { className: 'dshr-kvs' },
                          h(KeyValue, { label: t('projects.path'), value: tree.path }),
                          h(KeyValue, { label: t('worktrees.ahead'), value: tree.ahead }),
                          h(KeyValue, { label: t('worktrees.changes'), value: tree.changes }),
                          h(KeyValue, { label: t('worktrees.activeTasks'), value: tree.active }),
                          tree.missing ? h(KeyValue, { label: t('worktrees.missing'), value: 'yes' }) : null,
                        ),
                        h(
                          'div',
                          { className: 'dshr-btnrow' },
                          h(Btn, { disabled: action.busy, onClick: () => inspect(name) }, t('common.details')),
                          h(
                            ConfirmBtn,
                            {
                              disabled: action.busy,
                              onConfirm: () => act('worktree_merge', { project, name }, t('worktrees.merged')),
                              confirmLabel: t('worktrees.mergeConfirm'),
                            },
                            t('worktrees.merge'),
                          ),
                          h(
                            ConfirmBtn,
                            {
                              danger: true,
                              disabled: action.busy,
                              onConfirm: () => act('worktree_remove', { project, name }, t('worktrees.removed')),
                              confirmLabel: t('worktrees.removeConfirm'),
                            },
                            t('worktrees.remove'),
                          ),
                        ),
                        detail[name] === undefined ? null : h(Raw, { value: detail[name] }),
                      )
                    }),
                  ),
              adoptable.length === 0
                ? null
                : h(
                    'div',
                    { className: 'dshr-section' },
                    h('div', { className: 'dshr-h' }, t('worktrees.adoptable')),
                    ...adoptable.map((item) =>
                      h(
                        'div',
                        { key: item.path, className: 'dshr-row' },
                        h('span', { className: 'dshr-mono dshr-grow' }, `${item.branch} — ${item.path}`),
                        h(
                          Btn,
                          {
                            disabled: action.busy,
                            onClick: () =>
                              act(
                                'worktree_add',
                                { project, name: item.branch, path: item.path },
                                t('worktrees.added'),
                              ),
                          },
                          t('worktrees.adopt'),
                        ),
                      ),
                    ),
                  ),
            ),
      )
    }

    // -----------------------------------------------------------------------
    // Connection settings
    // -----------------------------------------------------------------------

    function SettingsView({ snapshot, onChanged }) {
      const t = useT()
      const config = snapshot?.config ?? {}
      const connection = snapshot?.connection ?? {}
      const [url, setUrl] = React.useState(config.url ?? '')
      const [token, setToken] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)

      React.useEffect(() => {
        setUrl(config.url ?? '')
      }, [config.url])

      const run = async (path, body, success) => {
        setBusy(true)
        setError(null)
        setNotice(null)
        try {
          await api(path, body)
          setNotice(success)
          await onChanged?.()
          return true
        } catch (failure) {
          setError(messageOf(failure))
          return false
        } finally {
          setBusy(false)
        }
      }

      const save = async () => {
        const body = { url: url.trim() }
        if (token.trim() !== '') body.token = token.trim()
        const ok = await run('connection', body, t('settings.saved'))
        if (ok === true) setToken('')
      }

      const sourceKey = `settings.source.${config.tokenSource ?? 'none'}`

      return h(
        'div',
        { className: 'dshr-section' },
        h('div', { className: 'dshr-h' }, t('settings.title')),
        h(Text, { value: t('settings.intro'), muted: true }),
        h(
          'div',
          { className: 'dshr-row' },
          h(Dot, { tone: connection.status === 'connected' ? 'success' : connection.status === 'connecting' ? 'warn' : 'idle' }),
          h('span', null, t(`status.${connection.status ?? 'unconfigured'}`)),
          h('span', { className: 'dshr-note' }, t('status.tools', { n: connection.tools ?? 0 })),
        ),
        connection.lastError === null || connection.lastError === undefined
          ? null
          : h('div', { className: 'dshr-error' }, `${t('settings.lastError')}: ${connection.lastError}`),
        connection.status === 'connecting'
          ? h('div', { className: 'dshr-note' }, t('banner.connecting'))
          : null,
        h(
          Field,
          { label: t('settings.url') },
          h(Input, { value: url, placeholder: 'https://reagent.plan.ai', onChange: (event) => setUrl(event.target.value) }),
        ),
        h(
          Field,
          {
            label: t('settings.token'),
            hint: config.tokenHint === null || config.tokenHint === undefined ? undefined : `${t('settings.hint')}: ${config.tokenHint} · ${t(sourceKey)}`,
          },
          h('input', {
            type: 'password',
            className: 'dshr-input',
            value: token,
            placeholder: t('settings.tokenPlaceholder'),
            autoComplete: 'off',
            onChange: (event) => setToken(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'dshr-btnrow' },
          h(Btn, { primary: true, disabled: busy, onClick: save }, t('settings.save')),
          h(Btn, { disabled: busy, onClick: () => run('reconnect', {}, t('settings.reconnected')) }, t('settings.reconnect')),
          h(
            Btn,
            {
              disabled: busy,
              onClick: () => run('connection', { token: '' }, t('settings.cleared')),
            },
            t('settings.clearToken'),
          ),
          h(
            ConfirmBtn,
            { danger: true, disabled: busy, onConfirm: () => run('forget', {}, t('settings.forgotten')) },
            t('settings.forget'),
          ),
        ),
        h(Notice, { error, notice }),
        h(KeyValue, { label: t('settings.stateFile'), value: config.stateFile }),
      )
    }

    // -----------------------------------------------------------------------
    // Panel
    // -----------------------------------------------------------------------

    const TABS = [
      ['inbox', 'nav.inbox'],
      ['tasks', 'nav.tasks'],
      ['projects', 'nav.projects'],
      ['memory', 'nav.memory'],
      ['docs', 'nav.docs'],
      ['services', 'nav.services'],
      ['worktrees', 'nav.worktrees'],
    ]

    function Panel({ locale }) {
      const [localeTick, setLocaleTick] = React.useState(0)
      React.useEffect(() => {
        const unsubscribe = locale.subscribe(() => setLocaleTick((value) => value + 1))
        return unsubscribe
      }, [locale])
      const t = React.useMemo(() => {
        const bound = locale.bind(NS)
        return (key, params) => {
          try {
            const text = bound(key, params)
            return typeof text === 'string' ? text : key
          } catch {
            return key
          }
        }
      }, [locale, localeTick])

      const [tab, setTab] = React.useState('inbox')
      const [route, setRoute] = React.useState(null)

      const snapshot = useLoad(() => api('state'), [], 12_000)
      const snap = snapshot.data
      const connected = snap?.connection?.status === 'connected'

      const projects = useLoad(
        async () => {
          if (!connected) return []
          const value = await fetchJson('projects')
          return Array.isArray(value) ? value : []
        },
        [connected],
        30_000,
      )
      const config = useLoad(async () => (connected ? fetchJson('config') : null), [connected], 0)

      const refreshAll = React.useCallback(async () => {
        snapshot.reload()
        projects.reload()
      }, [snapshot, projects])

      const openTask = (taskId, project) => {
        setRoute({ view: 'tasks', taskId, project, nonce: Date.now() })
        setTab('tasks')
      }

      const startTask = (project) => {
        setRoute({ view: 'tasks', project, newTask: true, nonce: Date.now() })
        setTab('tasks')
      }

      const navigate = (next, payload) => {
        if (payload !== undefined) setRoute({ view: next, ...payload, nonce: Date.now() })
        setTab(next)
      }

      const status = snap?.connection?.status ?? 'connecting'
      const statusLabel = t(`status.${status}`)

      let body
      if (tab === 'settings') {
        body = h(SettingsView, { snapshot: snap, onChanged: refreshAll })
      } else if (!connected) {
        body = h(
          'div',
          { className: 'dshr-banner' },
          h(Dot, { tone: status === 'connecting' ? 'warn' : 'idle' }),
          h('div', { className: 'dshr-grow' }, status === 'unconfigured' ? t('banner.noToken') : t('banner.connecting')),
          h(Btn, { onClick: () => setTab('settings') }, t('common.settings')),
        )
      } else if (tab === 'inbox') {
        body = h(InboxView, { onOpenTask: openTask })
      } else if (tab === 'tasks') {
        body = h(TasksView, {
          projects: projects.data ?? [],
          profiles: Array.isArray(config.data?.profiles) ? config.data.profiles.map((profile) => profile.name) : [],
          route,
          onRouteConsumed: () => setRoute(null),
          onOpenTask: openTask,
        })
      } else if (tab === 'projects') {
        body = h(ProjectsView, {
          projects: projects.data ?? [],
          onStartTask: startTask,
          onOpenMemory: (project) => navigate('memory', { project }),
          onOpenServices: (project) => navigate('services', { project }),
          onOpenWorktrees: (project) => navigate('worktrees', { project }),
        })
      } else if (tab === 'memory') {
        body = h(MemoryView, { projects: projects.data ?? [], scope: route?.project })
      } else if (tab === 'docs') {
        body = h(DocsView)
      } else if (tab === 'services') {
        body = h(ServicesView, { projects: projects.data ?? [], project: route?.project })
      } else if (tab === 'worktrees') {
        body = h(WorktreesView, { projects: projects.data ?? [], project: route?.project })
      } else {
        body = h(Empty, null, t('common.empty'))
      }

      return h(
        Loc.Provider,
        { value: t },
        h(
        'div',
        { className: 'dshr' },
        h('style', { 'data-plugin': '@local/reagent' }, CSS),
        h(
          'div',
          { className: 'dshr-top' },
          h(
            'div',
            { className: 'dshr-brand' },
            h('span', { className: 'dshr-mark', 'aria-hidden': true }, 'R'),
            h(
              'div',
              null,
              h('div', { className: 'dshr-name' }, t('tab')),
              h('div', { className: 'dshr-sub' }, t('subtitle')),
            ),
          ),
          h(
            'div',
            { className: 'dshr-status' },
            h(Dot, { tone: connected ? 'success' : status === 'connecting' ? 'warn' : 'idle' }),
            h('span', { className: 'dshr-statuslabel' }, statusLabel),
            snap?.config?.url === undefined ? null : h('span', { className: 'dshr-mono' }, snap.config.url),
            h(Btn, { onClick: refreshAll, disabled: snapshot.loading }, t('common.refresh')),
            h(Btn, { onClick: () => setTab('settings'), title: t('nav.settings') }, t('common.settings')),
          ),
        ),
        h(Notice, { error: snapshot.error }),
        h(
          'nav',
          { className: 'dshr-nav', 'aria-label': t('tab') },
          ...TABS.map(([id, key]) =>
            h(
              'button',
              {
                type: 'button',
                key: id,
                className: `dshr-navbtn${tab === id ? ' active' : ''}`,
                'aria-pressed': tab === id,
                onClick: () => {
                  setTab(id)
                  setRoute(null)
                },
              },
              t(key),
            ),
          ),
        ),
        body,
        ),
      )
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const CSS = `
      .dshr { display: flex; flex-direction: column; gap: 12px;
        width: 100%; max-width: 1100px; align-self: center; box-sizing: border-box;
        padding: 18px 20px 56px; font-size: 12.5px; line-height: 1.45;
        color: var(--dsw-alias-label-primary); }
      .dshr-top { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
      .dshr-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .dshr-mark { width: 30px; height: 30px; border-radius: 9px; flex: none;
        display: flex; align-items: center; justify-content: center; font-weight: 700;
        color: #fff; background: var(--dsw-alias-brand-primary); font-size: 14px; }
      .dshr-name { font-weight: 600; font-size: 14px; }
      .dshr-sub { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dshr-status { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
      .dshr-statuslabel { color: var(--dsw-alias-label-secondary); }
      .dshr-dot { width: 8px; height: 8px; border-radius: 50%; flex: none;
        background: var(--dsw-alias-state-idle-primary); }
      .dshr-dot.success { background: var(--dsw-alias-state-success-primary); }
      .dshr-dot.warn { background: var(--dsw-alias-state-warn-primary); }
      .dshr-dot.error { background: var(--dsw-alias-state-error-primary); }
      .dshr-nav { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .dshr-navbtn { font: inherit; padding: 6px 10px; border: none; cursor: pointer;
        background: transparent; color: var(--dsw-alias-label-secondary);
        border-bottom: 2px solid transparent; margin-bottom: -1px; }
      .dshr-navbtn:hover { color: var(--dsw-alias-label-primary); }
      .dshr-navbtn.active { color: var(--dsw-alias-label-primary);
        border-bottom-color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .dshr-banner { display: flex; align-items: center; gap: 9px; padding: 10px 12px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1); }
      .dshr-section { display: flex; flex-direction: column; gap: 8px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 11px;
        background: var(--dsw-alias-bg-layer-1); }
      .dshr-subsection { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
      .dshr-h { font-size: 11px; letter-spacing: .07em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary); font-weight: 600; }
      .dshr-row { display: flex; gap: 8px; align-items: center; }
      .dshr-row > * { min-width: 0; }
      .dshr-cols { display: flex; gap: 8px; flex-wrap: wrap; }
      .dshr-cols > * { flex: 1 1 180px; }
      .dshr-grow { flex: 1; }
      .dshr-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .dshr-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dshr-field { display: flex; flex-direction: column; gap: 4px; }
      .dshr-note { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dshr-error { color: var(--dsw-alias-state-error-primary); white-space: pre-wrap; }
      .dshr-ok { color: var(--dsw-alias-state-success-primary); }
      .dshr-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10.5px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
      .dshr-input, .dshr-textarea, .dshr-select {
        width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1); font: inherit;
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
      .dshr-select { width: auto; min-width: 140px; }
      .dshr-textarea { resize: vertical; }
      .dshr-btn { font: inherit; padding: 5px 9px; border-radius: 7px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary); white-space: nowrap; }
      .dshr-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
      .dshr-btn:disabled { opacity: .5; cursor: default; }
      .dshr-btn.primary { background: var(--dsw-alias-brand-primary); color: #fff; border-color: transparent; }
      .dshr-btn.danger { color: var(--dsw-alias-state-error-primary); }
      .dshr-btnrow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .dshr-pill { font-size: 10px; padding: 1px 7px; border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .dshr-pill.success { color: var(--dsw-alias-state-success-primary); border-color: currentColor; }
      .dshr-pill.warn { color: var(--dsw-alias-state-warn-primary); border-color: currentColor; }
      .dshr-pill.error { color: var(--dsw-alias-state-error-primary); border-color: currentColor; }
      .dshr-split { display: grid; grid-template-columns: minmax(240px, 340px) minmax(0, 1fr); gap: 12px; align-items: start; }
      @media (max-width: 760px) { .dshr-split { grid-template-columns: 1fr; } }
      .dshr-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .dshr-listscroll { display: flex; flex-direction: column; gap: 4px; max-height: 460px; overflow: auto; }
      .dshr-listbtn { display: flex; flex-direction: column; gap: 2px; text-align: left;
        font: inherit; padding: 7px 9px; border-radius: 8px; cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary); }
      .dshr-listbtn:hover { border-color: var(--dsw-alias-border-l2); }
      .dshr-listbtn.active { border-color: var(--dsw-alias-brand-primary); }
      .dshr-listbtn-top { display: flex; align-items: center; gap: 6px; }
      .dshr-listbtn-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dshr-listbtn-sub { display: flex; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 10.5px; }
      .dshr-detail { min-width: 0; }
      .dshr-tasktitle { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
      .dshr-meta { display: flex; gap: 8px; flex-wrap: wrap; color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dshr-kvs { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 3px 10px; }
      .dshr-kv { display: contents; }
      .dshr-kv-key { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .dshr-kv-val { min-width: 0; overflow-wrap: anywhere; font-size: 11.5px; }
      .dshr-text { white-space: pre-wrap; overflow-wrap: anywhere; }
      .dshr-text.muted { color: var(--dsw-alias-label-secondary); }
      .dshr-pre { margin: 0; max-height: 320px; overflow: auto; white-space: pre-wrap;
        overflow-wrap: anywhere; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10.5px; background: var(--dsw-alias-bg-layer-2); padding: 7px; border-radius: 7px; }
      .dshr-empty { color: var(--dsw-alias-label-secondary); padding: 14px; text-align: center;
        border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; }
      .dshr-card { display: flex; flex-direction: column; gap: 6px; padding: 9px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px;
        background: var(--dsw-alias-bg-base); }
      .dshr-wait { display: flex; flex-direction: column; gap: 7px; padding: 9px;
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px;
        background: var(--dsw-alias-bg-layer-2); }
      .dshr-wait-head { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 11.5px; }
      .dshr-messages { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow: auto; }
      .dshr-msg { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px;
        border-radius: 7px; background: var(--dsw-alias-bg-layer-2); }
      .dshr-msg-head { font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
        color: var(--dsw-alias-label-secondary); }
      .dshr-msg.role-user { border-left: 2px solid var(--dsw-alias-brand-primary); }
    `

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'reagent: english copy')
        ctx.effect(() => ctx.locale.register(NS, 'de', DE), 'reagent: german copy')
        // The tab lives in the conversation's View ring, next to Chat and
        // Trajectory. `inject` waits for the owner's slot declaration, so a
        // plugin load order that precedes ui-conversation still lands here.
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.view', () =>
              ctx.slots.register(
                {
                  name: 'conversation.view',
                  id: 'reagent',
                  order: 30,
                  label: () => {
                    try {
                      return ctx.locale.bind(NS)('tab')
                    } catch {
                      return 'Reagent'
                    }
                  },
                },
                (props) => h(Panel, { ...props, locale: ctx.locale }),
              ),
            ),
          'reagent: conversation view',
        )
      },
    }
  },
})
