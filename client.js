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
      'hint.lite': '照需求做；有更小的方案就先说一句',
      'hint.full': '默认：最小完整改动，结尾交代跳过了什么',
      'hint.ultra': '动手前点名理由不足的需求，仍然照做',
      'hint.off': '不注入 ponytail 规则',
      'hint.review': '在输入框开头放入 /ponytail-review',
      'hint.audit': '在输入框开头放入 /ponytail-audit',
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
      'hint.lite': 'Builds what you ask; names a smaller option first when there is one',
      'hint.full': 'Default: the smallest complete change, ending with what was skipped',
      'hint.ultra': "Names the parts the need doesn't justify, then builds them anyway",
      'hint.off': 'Ponytail rules off',
      'hint.review': 'Puts /ponytail-review at the start of the composer',
      'hint.audit': 'Puts /ponytail-audit at the start of the composer',
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
    // A stylesheet rather than inline styles: hover and keyboard focus have no inline form.
    // Colors and radii are DSH theme tokens (@deepseek-ai/dsh-client-ui-theme), so both themes follow.
    // The row width is the composer card's own algorithm, so the banner edges line up with the input box.
    // Both width variables are set by @deepseek-ai/dsh-client-ui-conversation on the conversation body;
    // they are not a public API, so a rename there shows up as a shifted banner, not an error.
    const CSS = `
.dsh-ponytail{display:flex;flex-wrap:wrap;align-items:center;box-sizing:border-box;gap:8px;
  width:calc(100% - 2 * var(--dsh-composer-side-clearance, 16px));max-width:var(--dsh-composer-card-max-width, none);
  margin:0 auto;padding:4px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l1);font-size:12px}
.dsh-ponytail-name{font-weight:500;color:var(--dsw-alias-label-secondary)}
.dsh-ponytail-name[data-off]{color:var(--dsw-alias-label-tertiary)}
.dsh-ponytail-levels{display:inline-flex;gap:2px;padding:2px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm, 8px)}
.dsh-ponytail-levels[aria-busy=true]{opacity:.6}
.dsh-ponytail button{display:inline-flex;align-items:center;min-height:24px;padding:0 10px;border:none;
  border-radius:calc(var(--dsw-radius-sm, 8px) - 2px);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}
.dsh-ponytail button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-ponytail button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-active, rgba(127, 127, 127, 0.16));color:var(--dsw-alias-label-primary);font-weight:500}
.dsh-ponytail button:disabled{cursor:default}
.dsh-ponytail button:disabled:not([aria-pressed=true]){color:var(--dsw-alias-label-tertiary)}
.dsh-ponytail button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dsh-ponytail-sep{width:0.5px;height:14px;background:var(--dsw-alias-border-l2)}
.dsh-ponytail-error{flex-basis:100%;color:var(--dsw-alias-state-error-primary, #d33)}
`

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
      // The group holds only the levels; review and audit are commands, so they sit outside it.
      return h('div', { className: 'dsh-ponytail' },
        h('style', null, CSS),
        h('span', { className: 'dsh-ponytail-name', 'data-off': state.mode === 'off' || undefined }, 'ponytail'),
        h('span', { className: 'dsh-ponytail-levels', role: 'group', 'aria-label': t('level'), 'aria-busy': pending },
          ...MODES.map(mode => h('button', {
            key: mode,
            type: 'button',
            'data-mode': mode,
            'aria-pressed': mode === state.mode,
            title: t('hint.' + mode),
            disabled: pending || !state.writable,
            onClick: () => choose(mode),
          }, t('mode.' + mode)))),
        h('span', { style: { flex: 1 } }),
        h('button', { type: 'button', 'data-action': 'review', title: t('hint.review'), onClick: () => draftCommand('/ponytail-review ') }, t('review')),
        h('span', { className: 'dsh-ponytail-sep', 'aria-hidden': true }),
        h('button', { type: 'button', 'data-action': 'audit', title: t('hint.audit'), onClick: () => draftCommand('/ponytail-audit ') }, t('audit')),
        error ? h('span', { role: 'alert', className: 'dsh-ponytail-error' }, t('switch.failed', { message: error })) : null,
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
