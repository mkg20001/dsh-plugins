/**
 * Registration smoke test for the client half.
 *
 * The bundle is a `window.__ModuleLoader__` registration. This test captures
 * the factory, runs it with a stub React and a stub Cordis context, and checks
 * the tab registration, locale dictionaries and styling rules. Rendering the
 * panel needs react/react-dom/jsdom from a harness installation; that part is
 * covered by the live slot registration instead.
 */
import { readFile } from 'node:fs/promises'

const here = new URL('.', import.meta.url)
const source = await readFile(new URL('../client.js', here), 'utf8')

let passes = 0
let failures = 0
function ok(condition, label) {
  if (condition) {
    passes += 1
    console.log('  ok  ', label)
  } else {
    failures += 1
    console.log('  FAIL', label)
  }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  ok(a === e, `${label} (got ${a})`)
}

const React = {
  createElement: () => null,
  createContext: () => ({ Provider: null }),
  Fragment: Symbol('Fragment'),
  useState: () => [null, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useContext: (context) => context,
}

let registration
const window = {
  __ModuleLoader__: {
    load(entry) {
      registration = entry
    },
  },
}

new Function('window', source)(window)

eq(registration?.id, '@local/reagent', 'bundle registers under the package name')
const plugin = registration.factory((specifier) => {
  ok(specifier === 'react', 'the bundle requires only React')
  return React
})
ok(Array.isArray(plugin.inject), 'the plugin declares inject')
ok(plugin.inject.includes('slots') && plugin.inject.includes('locale'), 'injects slots and locale')

const dictionaries = []
const slots = []
let injectedKey
const ctx = {
  effect(setup, label) {
    const dispose = setup()
    ok(typeof dispose === 'function' || typeof dispose === 'undefined', `effect ${label} returns a disposer`)
    return () => {}
  },
  locale: {
    register(namespace, locale, dictionary) {
      dictionaries.push({ namespace, locale, dictionary })
      return () => {}
    },
    bind(namespace) {
      const find = (locale) => dictionaries.find((entry) => entry.namespace === namespace && entry.locale === locale)?.dictionary ?? {}
      return (key, params) => {
        const template = find('en')[key] ?? key
        if (params === undefined) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
      }
    },
  },
  slots: {
    inject(key, callback) {
      injectedKey = key
      callback()
      return () => {}
    },
    register(definition, component) {
      slots.push({ definition, component })
      return () => {}
    },
  },
}

plugin.apply(ctx)

eq(injectedKey, 'conversation.view', 'injects the conversation view slot')
eq(dictionaries.map((entry) => entry.locale).sort(), ['de', 'en'], 'registers English and German copy')
ok(dictionaries.every((entry) => entry.namespace === 'reagent'), 'dictionaries use one namespace')
const en = dictionaries.find((entry) => entry.locale === 'en').dictionary
const de = dictionaries.find((entry) => entry.locale === 'de').dictionary
eq(en['tab'], 'Reagent', 'English tab label')
eq(de['nav.tasks'], 'Aufgaben', 'German tab label')
ok(Object.keys(de).length > 20, 'German copy is not a token stub')
ok(Object.keys(en).every((key) => typeof en[key] === 'string' && en[key] !== ''), 'every English entry is a non-empty string')
ok(Object.keys(de).every((key) => key in en), 'German keys exist in English (the fallback)')

const slot = slots[0]
eq(slot?.definition.name, 'conversation.view', 'registers into conversation.view')
eq(slot?.definition.id, 'reagent', 'slot id names the tab')
eq(slot?.definition.order, 30, 'tab sits after Chat (0), Trajectory (10) and Memvault (20)')
eq(slot?.definition.label(), 'Reagent', 'label thunk resolves')
eq(typeof slot?.component, 'function', 'panel component is registered')

ok(!source.includes('dangerouslySetInnerHTML'), 'no raw HTML injection')
ok(!source.includes("require('@deepseek-ai/"), 'no Harness Client package is required')
ok(!source.includes('document.body'), 'nothing is appended to document.body')

const tokens = [...source.matchAll(/--[A-Za-z0-9_-]+/g)]
  .map((match) => match[0])
  .filter((token) => !/^--[-]+$/.test(token))
const foreign = tokens.filter((token) => !token.startsWith('--dsw-'))
eq(foreign, [], 'styles use only --dsw- theme tokens')

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
