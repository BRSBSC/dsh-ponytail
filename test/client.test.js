import { test } from 'node:test'
import assert from 'node:assert/strict'

// client.js is a DSH browser module: it hands its factory to window.__ModuleLoader__.
let loaded
globalThis.window = { __ModuleLoader__: { load: (def) => { loaded = def } } }
await import('../client.js')

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: init => [init, () => {}],
}
const mod = loaded.factory(name => (name === 'react' ? fakeReact : undefined))

const logger = { warn() {} }
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}
const view = (mode, writable = true) => ({
  ok: true,
  value: { writable, namespaces: [{ ns: 'other', value: {} }, { ns: 'ponytail', value: { mode }, revision: 1 }] },
})

function fakeRemote(responses) {
  const queue = [...responses]
  const remote = {
    describes: 0,
    updates: [],
    updateResult: undefined,
    listeners: {},
    settings: {
      describe: async () => { remote.describes++; return queue.shift() },
      update: async (...a) => { remote.updates.push(a); return remote.updateResult },
    },
    $on: (event, fn) => { (remote.listeners[event] ??= []).push(fn); return () => {} },
  }
  return remote
}

function fakeClientCtx(responses, declared = mod.inject) {
  const raw = fakeRemote(responses)
  // Mirrors DSH's service guard: a Remote namespace is reachable only when the plugin injects it.
  const remote = new Proxy(raw, {
    get: (target, key) => {
      if (key === 'settings' && !declared.includes('remote.settings')) throw new Error('remote.settings is not declared in inject')
      return target[key]
    },
  })
  const listeners = {}
  const rec = { locale: [], slots: [] }
  return {
    remote,
    rec,
    logger,
    on: (event, fn) => { (listeners[event] ??= []).push(fn); return () => {} },
    emit: (event, ...args) => { for (const fn of listeners[event] ?? []) fn(...args) },
    emitRemote: (event, ...args) => { for (const fn of remote.listeners[event] ?? []) fn(...args) },
    effect: (fn) => { fn() },
    locale: { register: (ns, dicts) => { rec.locale.push([ns, dicts]); return () => {} } },
    slots: {
      inject: (name, cb) => cb(),
      register: (def, Component) => { rec.slots.push([def, Component]); return () => {} },
    },
  }
}

function findAll(node, pred, out = []) {
  if (node && typeof node === 'object') {
    if (pred(node)) out.push(node)
    for (const child of node.children ?? []) findAll(child, pred, out)
  }
  return out
}
const find = (node, pred) => findAll(node, pred)[0]

function render(snapshot, overrides = {}) {
  return mod.Banner({
    usePonytail: select => select(snapshot),
    setMode: async () => null,
    inputActions: { setDraft() {} },
    t: (key, params) => (params ? key + ':' + JSON.stringify(params) : key),
    ...overrides,
  })
}

test('Banner renders nothing without a snapshot', () => {
  assert.equal(render(undefined), null)
})

test('Banner shows four levels with the current one pressed and localized labels', () => {
  const tree = render({ mode: 'ultra', writable: true })
  const levels = findAll(tree, e => e.props?.['data-mode'])
  assert.deepEqual(levels.map(e => e.props['data-mode']), ['lite', 'full', 'ultra', 'off'])
  assert.deepEqual(levels.map(e => e.props['aria-pressed']), [false, false, true, false])
  assert.deepEqual(levels.map(e => e.children.join('')), ['mode.lite', 'mode.full', 'mode.ultra', 'mode.off'])
})

test('clicking a level calls setMode; clicking the current one does not', async () => {
  const calls = []
  const tree = render({ mode: 'full', writable: true }, { setMode: async (m) => { calls.push(m); return null } })
  find(tree, e => e.props?.['data-mode'] === 'ultra').props.onClick()
  find(tree, e => e.props?.['data-mode'] === 'full').props.onClick()
  await tick()
  assert.deepEqual(calls, ['ultra'])
})

test('review and audit fill the composer', () => {
  const drafts = []
  const tree = render({ mode: 'full', writable: true }, { inputActions: { setDraft: t => drafts.push(t) } })
  find(tree, e => e.props?.['data-action'] === 'review').props.onClick()
  find(tree, e => e.props?.['data-action'] === 'audit').props.onClick()
  assert.deepEqual(drafts, ['/ponytail-review ', '/ponytail-audit '])
})

test('review keeps a plain-text draft after the command instead of wiping it', () => {
  const drafts = []
  const withDraft = draft => ({ inputActions: { setDraft: t => drafts.push(t) }, input: { draft, occurrences: [] } })
  find(render({ mode: 'full', writable: true }, withDraft('src/foo.js')), e => e.props?.['data-action'] === 'review').props.onClick()
  find(render({ mode: 'full', writable: true }, withDraft('/ponytail-review src/foo.js')), e => e.props?.['data-action'] === 'review').props.onClick()
  assert.deepEqual(drafts, ['/ponytail-review src/foo.js'])
})

test('review leaves a draft with reference chips untouched', () => {
  const drafts = []
  const tree = render({ mode: 'full', writable: true }, {
    inputActions: { setDraft: t => drafts.push(t) },
    input: { draft: 'look at foo', occurrences: [{ kind: 'file' }] },
  })
  find(tree, e => e.props?.['data-action'] === 'audit').props.onClick()
  assert.deepEqual(drafts, [])
})

test('read-only profile disables levels but not review/audit', () => {
  const tree = render({ mode: 'full', writable: false })
  const levels = findAll(tree, e => e.props?.['data-mode'])
  const actions = findAll(tree, e => e.props?.['data-action'])
  assert.equal(levels.length, 4)
  assert.equal(actions.length, 2)
  assert.ok(levels.every(e => e.props.disabled === true))
  assert.ok(actions.every(e => !e.props.disabled))
})

test('module id and exports', () => {
  assert.equal(loaded.id, 'dsh-ponytail')
  assert.deepEqual(mod.inject, ['remote', 'remote.settings', 'slots', 'locale'])
  assert.equal(typeof mod.apply, 'function')
})

test('zh and en dictionaries share exactly the spec keys', () => {
  const keys = ['mode.lite', 'mode.full', 'mode.ultra', 'mode.off', 'review', 'audit', 'level', 'switch.failed'].sort()
  assert.deepEqual(Object.keys(mod.zh).sort(), keys)
  assert.deepEqual(Object.keys(mod.en).sort(), keys)
  assert.equal(mod.zh['mode.ultra'], '极致')
  assert.equal(mod.en.audit, 'Audit')
  assert.match(mod.zh['switch.failed'], /\{message\}/)
})

test('store.load reads mode and writable; invalid or missing ns hides and warns once', async () => {
  const s = mod.createModeStore(fakeRemote([view('ultra', false)]), logger)
  await s.load()
  assert.deepEqual(s.getSnapshot(), { mode: 'ultra', writable: false })
  const warns = []
  const bad = mod.createModeStore(
    fakeRemote([view('ULTRA'), { ok: true, value: { writable: true, namespaces: [] } }]),
    { warn: (...a) => warns.push(a) },
  )
  await bad.load()
  assert.equal(bad.getSnapshot(), undefined)
  await bad.load()
  assert.equal(bad.getSnapshot(), undefined)
  assert.equal(warns.length, 1)
})

test('store.load keeps the newest response when an older one lands last', async () => {
  const first = deferred()
  const second = deferred()
  const s = mod.createModeStore(fakeRemote([first.promise, second.promise]), logger)
  const a = s.load()
  const b = s.load()
  second.resolve(view('lite'))
  await b
  first.resolve(view('ultra'))
  await a
  assert.equal(s.getSnapshot().mode, 'lite')
})

test('store.setMode writes and notifies; failure returns the message', async () => {
  const remote = fakeRemote([view('full')])
  remote.updateResult = { ok: true, value: { ns: 'ponytail', value: { mode: 'ultra' } } }
  const s = mod.createModeStore(remote, logger)
  await s.load()
  let hits = 0
  s.subscribe(() => hits++)
  assert.equal(await s.setMode('ultra'), null)
  assert.deepEqual(remote.updates, [['ponytail', { mode: 'ultra' }, undefined]])
  assert.deepEqual(s.getSnapshot(), { mode: 'ultra', writable: true })
  assert.equal(hits, 1)
  remote.updateResult = { ok: false, error: { message: 'pinned', code: 'settings/rejected' } }
  assert.equal(await s.setMode('lite'), 'pinned')
  assert.equal(s.getSnapshot().mode, 'ultra')
})

test('store.load hides instead of throwing when describe returns nothing or rejects', async () => {
  const empty = mod.createModeStore({ settings: { describe: async () => undefined } }, logger)
  await empty.load()
  assert.equal(empty.getSnapshot(), undefined)
  const broken = mod.createModeStore({ settings: { describe: async () => { throw new Error('offline') } } }, logger)
  await broken.load()
  assert.equal(broken.getSnapshot(), undefined)
})

test('store.setMode returns text for a rejecting or shapeless update', async () => {
  const withUpdate = update => mod.createModeStore({ settings: { describe: async () => view('full'), update } }, logger)
  assert.equal(await withUpdate(async () => { throw new Error('offline') }).setMode('ultra'), 'offline')
  assert.equal(await withUpdate(async () => ({ ok: false })).setMode('ultra'), 'switch failed')
  assert.equal(await withUpdate(async () => undefined).setMode('ultra'), 'switch failed')
  assert.equal(await withUpdate(async () => ({ ok: true })).setMode('ultra'), null)
})

test('a click whose write rejects clears pending instead of leaking a rejection', async () => {
  const tree = render({ mode: 'full', writable: true }, { setMode: async () => { throw new Error('boom') } })
  find(tree, e => e.props?.['data-mode'] === 'ultra').props.onClick()
  await tick()
})

test('apply registers dictionaries and the dock entry, and reloads on updates and reconnect', async () => {
  const ctx = fakeClientCtx([view('full'), view('lite'), view('ultra')])
  mod.apply(ctx)
  await tick()
  assert.deepEqual(ctx.rec.locale, [['ponytail', { zh: mod.zh, en: mod.en }]])
  const [def, Component] = ctx.rec.slots[0]
  assert.equal(def.name, 'conversation.input.dock')
  assert.equal(def.id, 'ponytail')
  assert.equal(def.order, 30)
  assert.equal(def.locale, 'ponytail')
  assert.equal(Component, mod.Banner)
  const injected = def.inject('session-1')
  assert.equal(typeof injected.hooks.ponytail.getSnapshot, 'function')
  assert.equal(typeof injected.setMode, 'function')
  assert.equal(ctx.remote.describes, 1)
  ctx.emitRemote('settings/document-updated', 'other', 2)
  await tick()
  assert.equal(ctx.remote.describes, 1)
  ctx.emitRemote('settings/document-updated', 'ponytail', 2)
  await tick()
  assert.equal(ctx.remote.describes, 2)
  ctx.emit('connection/reset')
  await tick()
  assert.equal(ctx.remote.describes, 3)
  assert.equal(injected.hooks.ponytail.getSnapshot().mode, 'ultra')
})
