# dsh-ponytail 中文横幅 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 档位改存为 DSH 设置项，并在 DSH Web/桌面版输入框上方加一个跟随界面语言的 ponytail 横幅。

**Architecture:** 后端 `index.js` 的 `mode` 改为 `.volatile()` 配置项，规则注入读 `config.mode.get()`，`/ponytail` 通过 `ctx.settings.update` 写入。新增手写的浏览器端 `client.js`，使用 DSH 的 `window.__ModuleLoader__` 模块格式，不需要构建：用 `ctx.remote.settings` 读写档位，监听 `settings/document-updated` 和 `connection/reset` 刷新，在 `conversation.input.dock` 注册横幅组件，用 `ctx.locale` 注册中英文词典。

**Tech Stack:** 纯 JS（ESM 后端 + classic-script 风格的浏览器模块）、`node:test`、宿主提供的 `@deepseek-ai/schemastery`；浏览器端用宿主基座里的 `react`（只用 `createElement`、`useState`）。

**Spec:** `docs/superpowers/specs/2026-10-21-dsh-ponytail-banner-design.md`（前置 spec：`docs/superpowers/specs/2026-10-20-dsh-ponytail-design.md`）

## Global Constraints

- 设置命名空间和规则段名都是 `ponytail`，即本包 `cordis.patch.yml` 插入的条目 id。
- 档位合法值：`lite | full | ultra | off`。配置项 `mode` 默认 `full` 并标记 `.volatile()`；`sectionOrder` 默认 `10150`。删除 `defaultMode`。
- 删除 `lib/mode.js`、`$DSH_HOME/ponytail-mode` 文件和 `PONYTAIL_DEFAULT_MODE` 环境变量。
- 没有 Settings 服务时，带参数的 `/ponytail` 返回 error，文本固定为 `Settings service unavailable; set mode in cordis.yml`。
- 浏览器模块 id 为 `dsh-ponytail`，locale 命名空间为 `ponytail`，dock 条目 id 为 `ponytail`、`order: 30`。
- 词典 key 及中英文完全按 spec 的词典表。
- 横幅按钮：四个档位，`data-mode` 取值为 `lite|full|ultra|off`；两个动作，`data-action` 取值为 `review|audit`，分别 `setDraft('/ponytail-review ')`、`setDraft('/ponytail-audit ')`。
- 继续免构建：不引入 JSX、打包工具，也不加 `prepare` 脚本。
- 提交信息末尾加一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. `settings/document-updated` 连续到达，前一次 `describe` 比后一次晚返回：横幅应该显示最后一次读取的结果，不能被旧响应覆盖。→ Task 2。
2. 浏览器重连（服务重启，或桌面版休眠唤醒）：应该重新读取档位，不能停在旧值。→ Task 2 监听 `connection/reset`。
3. 设置里读到的 `mode` 不是合法值（比如手写进 patch 的 `ULTRA`，或者字段缺失）：横幅不显示，并 warn 一次，不渲染出没有高亮的半成品。→ Task 2。
4. profile 只读（`writable: false`）：四个档位按钮全部禁用，"审查"和"全库审计"仍然可以用。→ Task 3。
5. home patch 已经固定了 `mode`，Settings 拒绝写入：`/ponytail ultra` 返回 Settings 给出的原因，档位不变。→ Task 1。

---

### Task 1: 后端改用 Settings 保存档位

**Files:**
- Modify: `index.js`
- Delete: `lib/mode.js`、`test/mode.test.js`
- Modify: `test/plugin.test.js`（重写模式相关用例）

**Interfaces:**
- Produces:
  - `Config`：`z.object({ mode: z.union([...MODES]).default('full').volatile(), sectionOrder: z.number().default(10150) })`。真实调用时 `Config({}).mode` 是 `{ get(): Mode }`。
  - `apply(ctx, config)`：读 `config.mode.get()`，写 `ctx.get('settings').update('ponytail', { mode })`。
- 宿主 API：
  - `ctx.settings.update(ns: string, patch: object, expectedRevision?: number): Promise<void>`，拒绝时 reject；
  - volatile 引用只有 `get()`，新值由 DSH loader 在写入后提交。

- [ ] **Step 1: 改写 `test/plugin.test.js`，写出失败用例**

  测试辅助函数的改动：
  - 删掉 `beforeEach` 里的 `DSH_HOME` 和环境变量处理；
  - `fakeCtx({ commands = true, skills = true, settings = true, mode = 'full' } = {})` 新增：
    - `ctx.state = { mode }`；
    - `ctx.config = { mode: { get: () => ctx.state.mode }, sectionOrder: 10150 }`；
    - 当 `settings` 为真时提供 `ctx.settings = { update: async (ns, patch) => { ctx.rec.updates.push([ns, patch]); ctx.state.mode = patch.mode } }`（`rec` 增加 `updates: []`）；
    - `ctx.get = name => ctx[name]`；
    - `run(input)` 改成返回 handler 的 Promise。
  - `apply(ctx, ctx.config)` 替换原来的 `apply(ctx, cfg())`。

```js
test('Config: mode is a volatile reference defaulting to full', () => {
  assert.equal(Config({}).mode.get(), 'full'); assert.equal(Config({}).sectionOrder, 10150)
  assert.throws(() => Config({ mode: 'loud' }))
})
test('rules follow the settings value', () => {
  const ctx = fakeCtx({ mode: 'lite' }); apply(ctx, ctx.config)
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: lite'))
  ctx.state.mode = 'off'; assert.match(ctx.rules(), /^PONYTAIL MODE OFF/)
})
test('/ponytail <level> writes the setting', async () => {
  const ctx = fakeCtx(); apply(ctx, ctx.config)
  assert.deepEqual(await ctx.run('  Ultra '), { kind: 'success', text: 'ponytail ultra' })
  assert.deepEqual(ctx.rec.updates, [['ponytail', { mode: 'ultra' }]])
  assert.ok(ctx.rules().includes('level: ultra'))
  await ctx.run(' ultra'); assert.equal(ctx.rec.updates.length, 2) // explicit same level still writes
})
test('bare /ponytail turns off into full and otherwise only reports', async () => {
  const off = fakeCtx({ mode: 'off' }); apply(off, off.config)
  assert.deepEqual(await off.run(''), { kind: 'success', text: 'ponytail full' })
  assert.deepEqual(off.rec.updates, [['ponytail', { mode: 'full' }]])
  const lite = fakeCtx({ mode: 'lite' }); apply(lite, lite.config)
  assert.deepEqual(await lite.run(''), { kind: 'success', text: 'ponytail lite' }); assert.equal(lite.rec.updates.length, 0)
})
test('invalid level is an error and writes nothing', async () => {
  const ctx = fakeCtx(); apply(ctx, ctx.config)
  const r = await ctx.run(' loud'); assert.equal(r.kind, 'error'); assert.match(r.text, /lite\|full\|ultra\|off/)
  assert.equal(ctx.rec.updates.length, 0)
})
test('a refused settings write returns its reason and keeps the level', async () => {
  const ctx = fakeCtx(); ctx.settings.update = async () => { throw new Error('mode is pinned by the home patch') }
  apply(ctx, ctx.config)
  assert.deepEqual(await ctx.run(' ultra'), { kind: 'error', text: 'mode is pinned by the home patch' })
  assert.ok(ctx.rules().includes('level: full'))
})
test('without a settings service: argument errors, bare reports', async () => {
  const ctx = fakeCtx({ settings: false }); apply(ctx, ctx.config)
  assert.deepEqual(await ctx.run(' ultra'), { kind: 'error', text: 'Settings service unavailable; set mode in cordis.yml' })
  assert.deepEqual(await ctx.run(''), { kind: 'success', text: 'ponytail full' })
})
```

  保留以下用例，只把调用改成 `apply(ctx, ctx.config)`：section 注册（name、order、interpolate）、6 个 skill、`ponytail` skill 仅用户可调用、register 抛错、无 commands/skills 服务。
  删除以下用例：持久化文件、重新 `apply` 读回档位、不可写的 `DSH_HOME`。

- [ ] **Step 2: 跑测试确认失败**

  Run: `node --test test/plugin.test.js`
  预期：FAIL。`Config({}).mode.get` 不是函数，以及 `rec.updates` 为空等断言失败。

- [ ] **Step 3: 实现**

  - `index.js` 内联 `const MODES = ['lite', 'full', 'ultra', 'off']` 和 `normalizeMode(value)`：trim、转小写，只认 `MODES` 里的值。去掉对 `lib/mode.js` 的 import，删除 `lib/mode.js` 和 `test/mode.test.js`。
  - handler 改成 async：
    - `current = config.mode.get()`；
    - 没有参数时：`current` 是 `off` 就把 `next` 设为 `'full'`，否则直接返回 `success`，不写入；
    - 有参数时：`next = normalizeMode(wanted)`，非法就返回原来的 usage error；
    - 需要写入时：`const settings = ctx.get('settings')`，不存在就返回固定的 error；否则 `await settings.update('ponytail', { mode: next })`，用 try/catch 包住，catch 时返回 `{ kind: 'error', text: e.message }`；
    - 最后返回 `{ kind: 'success', text: 'ponytail ' + next }`。

- [ ] **Step 4: 跑全部测试**

  Run: `npm test`
  预期：PASS（rules 6 + skills 5 + plugin 12 = 23；plugin 的 12 个是保留的 5 个加新增的 7 个）。

- [ ] **Step 5: 提交**

```bash
git rm lib/mode.js test/mode.test.js
git add index.js test/plugin.test.js
git commit -m "feat: keep the ponytail level in DSH settings"
```

### Task 2: `client.js`，模块骨架、词典、档位 store、注册

**Files:**
- Create: `client.js`
- Modify: `package.json`
- Test: `test/client.test.js`

**Interfaces:**
- Produces（`factory` 返回的 `module.exports`）：
  - `inject = ['remote', 'slots', 'locale']`、`apply(ctx)`
  - `zh`、`en`：词典对象
  - `createModeStore(remote, logger)`：返回 `{ getSnapshot(): { mode, writable } | undefined, subscribe(listener): () => void, load(): Promise<void>, setMode(mode): Promise<string | null> }`
  - `Banner(props)`：Task 3 实现，本任务先导出 `() => null` 占位
- 宿主浏览器 API（已对照 0.2.1-rc.2 产物确认）：
  - `ctx.remote.settings.describe()` 和 `ctx.remote.settings.update(ns, patch, rev)` 都 resolve 为 `{ ok: true, value } | { ok: false, error: { message, code } }`；
  - `describe` 的 value 为 `{ writable, namespaces: [{ ns, value, revision, ... }] }`；`update` 的 value 为 `SettingsNamespaceView`（其中的 `value` 是解析后的配置）；
  - `ctx.remote.$on(event, fn)` 和 `ctx.on('connection/reset', fn)` 都返回 disposer；
  - `ctx.locale.register(ns, { zh, en })` 返回 disposer；
  - `ctx.slots.inject(name, cb)`、`ctx.slots.register(def, Component)`；
  - `ctx.effect(fn, label)`。

- [ ] **Step 1: 写失败测试 `test/client.test.js`**

  加载方式：先设置 `globalThis.window = { __ModuleLoader__: { load: def => { loaded = def } } }`，再 `await import('../client.js')`，然后调用 `const mod = loaded.factory(name => name === 'react' ? fakeReact : undefined)`。
  其中 `fakeReact = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }), useState: init => [init, () => {}] }`。

  测试辅助函数：
  - `fakeRemote(responses)` 返回 `{ describes: 0, updates: [], updateResult, settings: { describe, update }, $on }`：
    - `settings.describe()` 每调用一次就 `describes++`，并按顺序返回 `responses` 里的下一项（可以是 `{ ok, value }`，也可以是一个 Promise）；
    - `settings.update(...a)` 把参数推入 `updates`，返回 `updateResult`；
    - `$on(event, fn)` 记录监听器并返回 disposer。
  - `fakeClientCtx(responses)` 返回 `{ remote: fakeRemote(responses), rec: { locale: [], slots: [] }, logger, emitRemote(event, ...args), emit(event, ...args), on, effect, locale: { register }, slots: { inject, register } }`：
    - `slots.inject` 立即调用回调；`effect` 立即执行并收集 disposer；
    - `locale.register` 和 `slots.register` 把参数推入 `rec`。
  - 共享小工具：`const logger = { warn() {} }`；`deferred()` 返回 `{ promise, resolve }`；`tick = () => new Promise(r => setImmediate(r))`；`find` 和 `findAll` 深度遍历元素树的 `children`。

```js
const view = (mode, writable = true) => ({ ok: true, value: { writable, namespaces: [{ ns: 'other', value: {} }, { ns: 'ponytail', value: { mode }, revision: 1 }] } })
test('module id and exports', () => {
  assert.equal(loaded.id, 'dsh-ponytail'); assert.deepEqual(mod.inject, ['remote', 'slots', 'locale']); assert.equal(typeof mod.apply, 'function')
})
test('zh and en dictionaries share exactly the spec keys', () => {
  const keys = ['mode.lite', 'mode.full', 'mode.ultra', 'mode.off', 'review', 'audit', 'level', 'switch.failed']
  assert.deepEqual(Object.keys(mod.zh).sort(), [...keys].sort()); assert.deepEqual(Object.keys(mod.en).sort(), [...keys].sort())
  assert.equal(mod.zh['mode.ultra'], '极致'); assert.equal(mod.en.audit, 'Audit'); assert.match(mod.zh['switch.failed'], /\{message\}/)
})
test('store.load reads mode and writable; invalid or missing ns hides and warns once', async () => {
  const warns = []; const logger = { warn: (...a) => warns.push(a) }
  const s = mod.createModeStore(fakeRemote([view('ultra', false)]), logger); await s.load()
  assert.deepEqual(s.getSnapshot(), { mode: 'ultra', writable: false })
  const bad = mod.createModeStore(fakeRemote([view('ULTRA'), { ok: true, value: { writable: true, namespaces: [] } }]), logger)
  await bad.load(); assert.equal(bad.getSnapshot(), undefined); await bad.load(); assert.equal(warns.length, 1)
})
test('store.load keeps the newest response when an older one lands last', async () => {
  const first = deferred(); const second = deferred()
  const s = mod.createModeStore(fakeRemote([first.promise, second.promise]), logger)
  const a = s.load(); const b = s.load(); second.resolve(view('lite')); await b; first.resolve(view('ultra')); await a
  assert.equal(s.getSnapshot().mode, 'lite')
})
test('store.setMode writes and notifies; failure returns the message', async () => {
  const remote = fakeRemote([view('full')]); remote.updateResult = { ok: true, value: { ns: 'ponytail', value: { mode: 'ultra' } } }
  const s = mod.createModeStore(remote, logger); await s.load(); let hits = 0; s.subscribe(() => hits++)
  assert.equal(await s.setMode('ultra'), null); assert.deepEqual(remote.updates, [['ponytail', { mode: 'ultra' }, undefined]])
  assert.deepEqual(s.getSnapshot(), { mode: 'ultra', writable: true }); assert.equal(hits, 1)
  remote.updateResult = { ok: false, error: { message: 'pinned', code: 'settings/rejected' } }
  assert.equal(await s.setMode('lite'), 'pinned'); assert.equal(s.getSnapshot().mode, 'ultra')
})
test('apply registers dictionaries and the dock entry, and reloads on updates and reconnect', async () => {
  const ctx = fakeClientCtx([view('full'), view('lite'), view('ultra')]); mod.apply(ctx); await tick()
  assert.deepEqual(ctx.rec.locale, [['ponytail', { zh: mod.zh, en: mod.en }]])
  const [def, Component] = ctx.rec.slots[0]
  assert.equal(def.name, 'conversation.input.dock'); assert.equal(def.id, 'ponytail'); assert.equal(def.order, 30); assert.equal(def.locale, 'ponytail'); assert.equal(Component, mod.Banner)
  const injected = def.inject('session-1'); assert.equal(typeof injected.hooks.ponytail.getSnapshot, 'function'); assert.equal(typeof injected.setMode, 'function')
  ctx.emitRemote('settings/document-updated', 'other', 2); await tick(); assert.equal(ctx.remote.describes, 1)
  ctx.emitRemote('settings/document-updated', 'ponytail', 2); await tick(); assert.equal(ctx.remote.describes, 2)
  ctx.emit('connection/reset'); await tick(); assert.equal(ctx.remote.describes, 3)
  assert.equal(injected.hooks.ponytail.getSnapshot().mode, 'ultra')
})
```

- [ ] **Step 2: 跑测试确认失败**

  Run: `node --test test/client.test.js`
  预期：FAIL。`import` 找不到 `client.js`。

- [ ] **Step 3: 实现 `client.js`，并修改 `package.json`**

  - 文件整体是一次 `window.__ModuleLoader__.load({ id: 'dsh-ponytail', factory: (require) => { ...; return module.exports } })` 调用。factory 内用 `const React = require('react')`；不 import 任何 dsh 包，服务都通过 ctx 拿。
  - `createModeStore`：
    - `load` 用自增 generation，只采纳最新一次调用的结果；
    - `describe` 不 ok、找不到 `ponytail` 命名空间，或 `value.mode` 不在 `MODES` 里时，都把快照设为 `undefined`，并且整个 store 生命周期内只 `logger.warn` 一次；
    - `setMode` 成功时用 `update` 返回视图的 `value.mode` 加上原来的 `writable` 更新快照；失败时返回 `error.message`，`update` 抛出的异常转成它的 message；
    - 每次快照变化都通知所有 subscriber。
  - `apply`：
    - `ctx.effect` 里注册词典；
    - 另一个 `ctx.effect` 里订阅 `settings/document-updated`（只在 `ns === 'ponytail'` 时 `load`）和 `connection/reset`，然后先调用一次 `load`，返回的 disposer 负责退订；
    - 最后调用 `ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({...}, Banner))`，其中 `inject: () => ({ hooks: { ponytail: store }, setMode: store.setMode })`。
  - `package.json` 的改动：
    - 新增 `"exports": { ".": "./index.js", "./client": "./client.js", "./package.json": "./package.json" }`；
    - `files` 里加 `"client.js"`；
    - `dsh` 下新增 `"client": { "platform": "web", "inject": ["@deepseek-ai/dsh-api-remotes", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-conversation"] }`。

- [ ] **Step 4: 跑测试确认通过**

  Run: `node --test test/client.test.js`
  预期：PASS，6 个用例。然后跑 `npm test`，预期全部通过。

- [ ] **Step 5: 提交**

```bash
git add client.js package.json test/client.test.js
git commit -m "feat: add browser module with settings-backed level store"
```

### Task 3: `Banner` 组件

**Files:**
- Modify: `client.js`（实现 `Banner`）
- Test: `test/client.test.js`（追加用例）

**Interfaces:**
- Consumes：Task 2 的 store 快照 `{ mode, writable }`，以及 inject 进来的 `setMode(mode): Promise<string | null>`。
- 组件 props：
  - `usePonytail(selector)`：DSH 由 `hooks.ponytail` 生成；
  - `setMode`；
  - `inputActions.setDraft(text)`：会话标准 props；
  - `t(key, params?)`：由 `locale: 'ponytail'` 生成。

- [ ] **Step 1: 追加失败测试**

  辅助函数：`render(snapshot, overrides)` 调用 `mod.Banner({ usePonytail: sel => sel(snapshot), setMode, inputActions: { setDraft }, t: (k, p) => p ? k + ':' + JSON.stringify(p) : k, ...overrides })`；`find(tree, pred)` 深度遍历元素树（看 `children`）。

```js
test('Banner renders nothing without a snapshot', () => { assert.equal(render(undefined), null) })
test('Banner shows four levels with the current one pressed and localized labels', () => {
  const tree = render({ mode: 'ultra', writable: true })
  const levels = findAll(tree, e => e.props?.['data-mode'])
  assert.deepEqual(levels.map(e => e.props['data-mode']), ['lite', 'full', 'ultra', 'off'])
  assert.deepEqual(levels.map(e => e.props['aria-pressed']), [false, false, true, false])
  assert.deepEqual(levels.map(e => e.children.join('')), ['mode.lite', 'mode.full', 'mode.ultra', 'mode.off'])
})
test('clicking a level calls setMode; clicking the current one does not', async () => {
  const calls = []; const tree = render({ mode: 'full', writable: true }, { setMode: async m => { calls.push(m); return null } })
  find(tree, e => e.props?.['data-mode'] === 'ultra').props.onClick()
  find(tree, e => e.props?.['data-mode'] === 'full').props.onClick()
  await tick(); assert.deepEqual(calls, ['ultra'])
})
test('review and audit fill the composer', () => {
  const drafts = []; const tree = render({ mode: 'full', writable: true }, { inputActions: { setDraft: t => drafts.push(t) } })
  find(tree, e => e.props?.['data-action'] === 'review').props.onClick()
  find(tree, e => e.props?.['data-action'] === 'audit').props.onClick()
  assert.deepEqual(drafts, ['/ponytail-review ', '/ponytail-audit '])
})
test('read-only profile disables levels but not review/audit', () => {
  const tree = render({ mode: 'full', writable: false })
  assert.ok(findAll(tree, e => e.props?.['data-mode']).every(e => e.props.disabled === true))
  assert.ok(findAll(tree, e => e.props?.['data-action']).every(e => !e.props.disabled))
})
```

- [ ] **Step 2: 跑测试确认失败**

  Run: `node --test test/client.test.js`
  预期：FAIL（`Banner` 还是返回 `null` 的占位）。

- [ ] **Step 3: 实现 `Banner`**

  - 两个 `useState` 放在任何提前 return 之前：`pending` 初始为 `false`，`error` 初始为 `null`。
  - 先 `const s = usePonytail(x => x)`，`s` 为空就返回 `null`。
  - 根元素是一个 `div`，`role: 'group'`，`aria-label: t('level')`，内联 style 为横向 flex，`gap: 8px`，`padding: 4px 12px`，`border-bottom` 使用 `var(--dsw-alias-border-l1)`。
  - 子元素依次是：`span` 显示 `ponytail`；四个 `button`，`data-mode`、`aria-pressed`、`disabled: pending || !s.writable`，文字为 `t('mode.' + m)`；一个 `flex: 1` 的 `span`；两个 `button`，`data-action` 分别为 `review` 和 `audit`。
  - 有 `error` 时，在末尾追加 `span`，文字为 `t('switch.failed', { message: error })`。
  - 档位按钮的 `onClick`：点的就是当前档位时直接 return；否则 `setPending(true)`，调用 `setMode(m)`，结束后 `setPending(false)`、`setError(err)`。

- [ ] **Step 4: 跑测试确认通过**

  Run: `npm test`
  预期：全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add client.js test/client.test.js
git commit -m "feat: render the ponytail banner above the composer"
```

### Task 4: README 与 DSH 真机冒烟

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

  - "使用"一节：持久化改成写入 profile 的 `cordis.patch.yml`；删掉 `ponytail-mode` 文件和环境变量的说明；注明 web、desktop、CLI 各自独立保存档位。
  - 新增"横幅"一节：横幅的位置、按钮，跟随界面语言，只在会话内显示，CLI/TUI 没有横幅。
  - "配置"一节：示例改为 `mode` 和 `sectionOrder`。
  - "已知限制"一节：
    - 修正 skill 优先级的说法：Web/Desktop 下，各 preset 自己的 skill 层（包括 `~/.dsh/skills`、`~/.agents/skills`）会覆盖本插件注册的同名 skill；
    - 新增"与上游的差异"：说一句 "stop ponytail" 不会切换档位；`config.json`、`/ponytail band` 等上游功能在 DSH 下不存在；
    - 新增：浏览器端使用 DSH 内部模块格式。

- [ ] **Step 2: 冒烟，复用上一里程碑在 scratchpad 里安装的 dsh 0.2.1-rc.2 和隔离 DSH_HOME**

  - Run: `npx`/本地 `dsh --profile web --no-open`，后台运行。用内置浏览器打开它打印的 URL。
  - 在 DSH 设置里把界面语言切到中文，进入一个会话。
    预期：横幅显示"精简 / 完整 / 极致 / 关闭 / 审查 / 全库审计"。
  - 点"极致"。
    预期：`<DSH_HOME>/profiles/web/cordis.patch.yml` 里出现 `mode: ultra`，横幅高亮"极致"。
  - 在输入框执行 `/ponytail lite`。
    预期：横幅自动变成"精简"。
  - 点"审查"。
    预期：输入框里是 `/ponytail-review `。
  - 把界面语言切回英文。
    预期：横幅显示英文。
  - 检查浏览器控制台。
    预期：没有 `dsh-ponytail` 相关的报错。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: document settings-backed level and the banner"
```
