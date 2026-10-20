// dsh-ponytail browser half: the ponytail banner above the composer.
// Hand-written in the module format DSH's own client builds emit, so the package
// still installs from GitHub without a build step.
window.__ModuleLoader__.load({
  id: 'dsh-ponytail',
  factory: (require) => {
    const React = require('react')

    const MODES = ['lite', 'full', 'ultra', 'off']
    // Profile entry id of the host plugin row; its `mode` field is the level.
    const SETTINGS_NS = 'ponytail'
    const NS = 'ponytail'

    const zh = {
      'mode.lite': '精简',
      'mode.full': '完整',
      'mode.ultra': '极致',
      'mode.off': '关闭',
      review: '审查',
      audit: '全库审计',
      level: '档位',
      'switch.failed': '切换失败：{message}',
    }

    const en = {
      'mode.lite': 'Lite',
      'mode.full': 'Full',
      'mode.ultra': 'Ultra',
      'mode.off': 'Off',
      review: 'Review',
      audit: 'Audit',
      level: 'Level',
      'switch.failed': 'Switch failed: {message}',
    }

    const messageOf = error => (error instanceof Error ? error.message : String(error))

    function createModeStore(remote, logger) {
      let snapshot
      let generation = 0
      let warned = false
      const listeners = new Set()
      const set = (next) => {
        snapshot = next
        for (const listener of [...listeners]) listener()
      }
      const hide = (reason) => {
        if (!warned) {
          warned = true
          logger.warn('dsh-ponytail: banner hidden: %s', reason)
        }
        set(undefined)
      }
      const load = async () => {
        const mine = ++generation
        let response
        try {
          response = await remote.settings.describe()
        } catch (error) {
          response = { ok: false, error: { message: messageOf(error) } }
        }
        // A newer load or a write superseded this read.
        if (mine !== generation) return
        if (!response.ok) return hide(response.error.message)
        const entry = response.value.namespaces.find(view => view.ns === SETTINGS_NS)
        const mode = entry?.value?.mode
        if (!MODES.includes(mode)) return hide(entry ? `invalid mode ${JSON.stringify(mode)}` : 'no "ponytail" settings entry')
        set({ mode, writable: response.value.writable })
      }
      const setMode = async (mode) => {
        generation++
        let response
        try {
          response = await remote.settings.update(SETTINGS_NS, { mode }, undefined)
        } catch (error) {
          return messageOf(error)
        }
        if (!response.ok) return response.error.message
        set({ mode: response.value.value.mode, writable: snapshot?.writable ?? true })
        return null
      }
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        load,
        setMode,
      }
    }

    function Banner() {
      return null
    }

    const inject = ['remote', 'slots', 'locale']

    function apply(ctx) {
      const store = createModeStore(ctx.remote, ctx.logger)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ponytail: dictionaries')
      ctx.effect(() => {
        const disposers = [
          ctx.remote.$on('settings/document-updated', (ns) => { if (ns === SETTINGS_NS) void store.load() }),
          ctx.on('connection/reset', () => { void store.load() }),
        ]
        void store.load()
        return () => { for (const dispose of disposers) dispose() }
      }, 'dsh-ponytail: level refresh')
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'ponytail',
        order: 30,
        locale: NS,
        inject: () => ({ hooks: { ponytail: store }, setMode: store.setMode }),
      }, Banner))
    }

    const exports = { inject, apply, zh, en, createModeStore, Banner }
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    return exports
  },
})
