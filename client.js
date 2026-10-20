// dsh-ponytail browser half: the ponytail banner above the composer.
// Hand-written in the module format DSH's own client builds emit, so the package
// still installs from GitHub without a build step.
window.__ModuleLoader__.load({
  id: 'dsh-ponytail',
  factory: (require) => {
    const React = require('react')

    const MODES = ['lite', 'full', 'ultra', 'off']
    // Profile entry id of the host plugin row; its `mode` field is the level.
    // The same id names this plugin's locale dictionary.
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
        // Every field below is host-supplied: a shape change hides the banner, never throws.
        if (!response?.ok) return hide(response?.error?.message ?? 'settings describe failed')
        const entry = response.value?.namespaces?.find(view => view.ns === NS)
        const mode = entry?.value?.mode
        if (!MODES.includes(mode)) return hide(entry ? `invalid mode ${JSON.stringify(mode)}` : 'no "ponytail" settings entry')
        set({ mode, writable: response.value.writable })
      }
      const setMode = async (mode) => {
        generation++
        let response
        try {
          response = await remote.settings.update(NS, { mode }, undefined)
        } catch (error) {
          return messageOf(error)
        }
        // A rejected write must return text: the banner clears `pending` from the result.
        if (!response?.ok) return response?.error?.message ?? 'switch failed'
        set({ mode: response.value?.value?.mode ?? mode, writable: snapshot?.writable ?? true })
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

    const h = React.createElement
    // Same width algorithm the composer card uses, so the banner edges line up with the input box.
    // Both variables are set by @deepseek-ai/dsh-client-ui-conversation on the conversation body;
    // they are not a public API, so a rename there shows up as a shifted banner, not an error.
    const rowStyle = {
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      gap: '8px',
      width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))',
      maxWidth: 'var(--dsh-composer-card-max-width, none)',
      margin: '0 auto',
      padding: '4px 12px',
      borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
      fontSize: '12px',
    }
    const buttonStyle = pressed => ({
      border: 'none',
      borderRadius: '6px',
      padding: '2px 8px',
      cursor: 'pointer',
      color: 'inherit',
      font: 'inherit',
      fontWeight: pressed ? 600 : 400,
      background: pressed ? 'var(--dsw-alias-fill-l2, rgba(127, 127, 127, 0.16))' : 'transparent',
    })

    // `input` is the composer's InputState, spread into the props by the dock's owner.
    function Banner({ usePonytail, setMode, inputActions, input, t }) {
      const [pending, setPending] = React.useState(false)
      const [error, setError] = React.useState(null)
      const state = usePonytail(snapshot => snapshot)
      if (!state) return null
      // setDraft replaces the whole draft and is not undoable: keep typed text, never drop reference chips.
      const draftCommand = (command) => {
        if (input?.occurrences?.length) return
        const draft = input?.draft ?? ''
        if (draft.startsWith(command.trim())) return
        inputActions.setDraft(draft.trim() === '' ? command : command + draft)
      }
      const choose = (mode) => {
        if (mode === state.mode) return
        setPending(true)
        setError(null)
        // Both arms clear `pending`: a rejected write must not leave the buttons disabled.
        setMode(mode).then(
          (failure) => { setPending(false); setError(failure) },
          (error) => { setPending(false); setError(messageOf(error)) },
        )
      }
      return h('div', { role: 'group', 'aria-label': t('level'), style: rowStyle },
        h('span', { style: { fontWeight: 600 } }, 'ponytail'),
        ...MODES.map(mode => h('button', {
          key: mode,
          type: 'button',
          'data-mode': mode,
          'aria-pressed': mode === state.mode,
          disabled: pending || !state.writable,
          onClick: () => choose(mode),
          style: buttonStyle(mode === state.mode),
        }, t('mode.' + mode))),
        h('span', { style: { flex: 1 } }),
        h('button', { type: 'button', 'data-action': 'review', onClick: () => draftCommand('/ponytail-review '), style: buttonStyle(false) }, t('review')),
        h('button', { type: 'button', 'data-action': 'audit', onClick: () => draftCommand('/ponytail-audit '), style: buttonStyle(false) }, t('audit')),
        error ? h('span', { role: 'alert', style: { color: 'var(--dsw-alias-text-error, #d33)' } }, t('switch.failed', { message: error })) : null,
      )
    }

    // Every Remote namespace the plugin touches must be injected, or DSH's service guard throws.
    const inject = ['remote', 'remote.settings', 'slots', 'locale']

    function apply(ctx) {
      const store = createModeStore(ctx.remote, ctx.logger)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-ponytail: dictionaries')
      ctx.effect(() => {
        const disposers = [
          ctx.remote.$on('settings/document-updated', (ns) => { if (ns === NS) void store.load() }),
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
