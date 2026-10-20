# dsh-ponytail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ponytail 规则集做成 DeepSeek Harness 原生插件：每轮注入规则、`/ponytail` 切档、注册 6 个 skill。

**Architecture:** 纯 ESM JavaScript 的 Cordis 函数式插件，作为 DSH 组合包（`dsh.bundle`）发布。`index.js` 只负责接线，把三个纯逻辑模块接到 DSH 服务上：`lib/skills.js` 读 SKILL.md，`lib/rules.js` 按档位过滤规则，`lib/mode.js` 读写档位。各服务的接法：`systemPrompt` 声明为必需依赖；`commands` 和 `skills` 用 `ctx.inject([...], fn)` 按需挂载，这是 DSH 自带的 plan-mode 和 mcp-client 的写法。

**Tech Stack:** Node ≥22 ESM、`node:test`；宿主提供的 `@deepseek-ai/schemastery@^3.18.5`（peer + dev 依赖）。

**Spec:** `docs/superpowers/specs/2026-10-20-dsh-ponytail-design.md`

## Global Constraints

- 包名 `dsh-ponytail`，版本 `0.1.0`，`"type": "module"`，没有构建步骤，也没有 `prepare` 脚本。
- 唯一的运行时 import 是 `@deepseek-ai/schemastery`，声明在 `peerDependencies` 和 `devDependencies` 里，版本都是 `^3.18.5`。
- `engines.dsh`：`>=0.2.1-rc.2 <0.3.0`。
- 档位合法值只有 `lite | full | ultra | off`；配置项 `defaultMode` 默认 `full`，`sectionOrder` 默认 `10150`。
- 持久化文件：`<DSH_HOME>/ponytail-mode`，`DSH_HOME` 为空或只有空白时用 `~/.dsh`，开头的 `~` 要展开成用户主目录，与 DSH 的 `resolveDshHome` 行为一致。
- 规则段名称 `ponytail`，`interpolate: false`。档位为 `off` 时返回空字符串。
- skill 内容从 ponytail 5.3.2 原样复制，来源是 `~/.claude/plugins/marketplaces/ponytail`（commit `09c434a`）。LICENSE 里保留 `Copyright (c) 2026 DietrichGebert`。
- 提交信息末尾加一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. Windows 上 git 检出后 SKILL.md 变成 CRLF：解析 frontmatter 和过滤档位行时，结果应该与 LF 完全一样。→ Task 1、Task 2 各加一个 CRLF 用例。
2. 用户手动改过持久化文件，例如写成 `ULTRA\n` 或乱写：前者读成 `ultra`，后者视为没有保存过档位。→ Task 3。
3. `DSH_HOME` 是 `~/x`、带首尾空白，或是空字符串：解析出的路径应该与 DSH 一致。→ Task 3。
4. 用户输入 `/ponytail  Ultra `：DSH 给的 `rawInput` 保留了开头空白，应该切到 `ultra`。→ Task 4。
5. `DSH_HOME` 不可写，比如指向的是一个文件：`/ponytail ultra` 仍然成功，下一轮规则就是 ultra，同时只记一条 warn。→ Task 4。

---

### Task 1: 项目骨架、复制 skill、`lib/skills.js`

**Files:**
- Create: `package.json`、`.gitignore`（内容为 `node_modules/`）、`.gitattributes`（内容为 `* text=auto eol=lf`）、`LICENSE`
- Create: `skills/<6 个目录>/SKILL.md`（从 ponytail 原样复制）
- Create: `lib/skills.js`
- Test: `test/skills.test.js`

**Interfaces:**
- Produces:
  - `parseSkillFile(text: string): { name: string, description: string, content: string } | undefined`
  - `loadSkills(dir: string): { skills: Array<{ name, description, content, path }>, errors: string[] }`

- [ ] **Step 1: 建骨架并装开发依赖**

  `package.json` 按 Global Constraints 填写，另加 `"main": "index.js"`、`"license": "MIT"`、`"scripts": { "test": "node --test" }`、`"files": ["index.js", "lib", "skills", "cordis.patch.yml", "LICENSE"]`、`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。
  LICENSE 用 MIT 模板，写两行版权：`Copyright (c) 2026 DietrichGebert`（skills/ 和规则文本）、`Copyright (c) 2026 brsbsc`（适配代码，名字取自 git 的 user.name）。
  然后运行 `cp -r ~/.claude/plugins/marketplaces/ponytail/skills/. skills/`，再运行 `npm install`。
  预期：`skills/` 下正好有 6 个目录，`node_modules/@deepseek-ai/schemastery` 存在。

- [ ] **Step 2: 写失败测试 `test/skills.test.js`**

```js
test('parseSkillFile reads single-line and folded frontmatter', () => {
  const s = parseSkillFile('---\nname: demo\ndescription: >\n  First line\n  second line.\nlicense: MIT\n---\n\n# Body\ntext\n')
  assert.deepEqual(s, { name: 'demo', description: 'First line second line.', content: '# Body\ntext\n' })
})
test('parseSkillFile handles CRLF the same as LF', () => {
  const lf = '---\nname: demo\ndescription: >\n  A b.\n---\n\nBody\n'
  assert.deepEqual(parseSkillFile(lf.replaceAll('\n', '\r\n')), parseSkillFile(lf))
})
test('parseSkillFile strips quotes and rejects missing name/description', () => {
  assert.equal(parseSkillFile('---\nname: "q"\ndescription: \'d\'\n---\nx').name, 'q')
  assert.equal(parseSkillFile('no frontmatter'), undefined)
  assert.equal(parseSkillFile('---\nname: only\n---\nx'), undefined)
})
test('loadSkills loads the 6 vendored skills', () => {
  const { skills, errors } = loadSkills(SKILLS_DIR) // path.join(import.meta.dirname, '..', 'skills')
  assert.deepEqual(errors, [])
  assert.deepEqual(skills.map(s => s.name).sort(),
    ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'])
  assert.ok(skills.every(s => s.description.length > 0 && s.content.length > 0 && path.isAbsolute(s.path)))
})
test('loadSkills reports a broken skill and keeps the rest', () => {
  // tmp dir with good/SKILL.md (valid) and bad/SKILL.md ('nope')
  const { skills, errors } = loadSkills(tmp)
  assert.deepEqual(skills.map(s => s.name), ['good'])
  assert.equal(errors.length, 1); assert.match(errors[0], /bad/)
})
```

- [ ] **Step 3: 跑测试确认失败**

  Run: `node --test test/skills.test.js`
  预期：FAIL，提示 `Cannot find module .../lib/skills.js`。

- [ ] **Step 4: 实现 `lib/skills.js`**

  - 先把 `\r\n` 统一成 `\n`。
  - frontmatter 只支持两种写法：单行的 `key: value`（去掉首尾的单引号或双引号），以及 `key: >` 或 `key: |` 后面跟缩进行（各行 trim 后用空格连接）。
  - `content` 是第二个 `---` 之后的正文，去掉开头的空行。
  - `loadSkills` 用 `fs.readdirSync(dir, { withFileTypes: true })` 只遍历子目录。读取失败或解析结果为 `undefined` 时，往 `errors` 里推一条 `"<目录名>: <原因>"`。

- [ ] **Step 5: 跑测试确认通过**

  Run: `node --test test/skills.test.js`
  预期：PASS，5 个用例全过。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json .gitignore .gitattributes LICENSE skills lib/skills.js test/skills.test.js
git commit -m "feat: scaffold package, vendor ponytail skills, add SKILL.md loader"
```

### Task 2: `lib/rules.js`，按档位生成规则文本

**Files:**
- Create: `lib/rules.js`
- Test: `test/rules.test.js`

**Interfaces:**
- Consumes: Task 1 产出的 `skills/ponytail/SKILL.md`（测试里用 `parseSkillFile` 读它的 `content`）。
- Produces:
  - `filterSkillBodyForMode(body: string, mode: 'lite'|'full'|'ultra'): string`
  - `buildRules(mode: 'lite'|'full'|'ultra'|'off', skillBody: string | undefined): string`
  - `FALLBACK_RULES: string`

- [ ] **Step 1: 写失败测试 `test/rules.test.js`**

```js
const body = parseSkillFile(fs.readFileSync(PONYTAIL_SKILL, 'utf8')).content
for (const [mode, kept, dropped] of [
  ['lite', '| **lite** |', ['| **full** |', '| **ultra** |']],
  ['full', '| **full** |', ['| **lite** |', '| **ultra** |']],
  ['ultra', '| **ultra** |', ['| **lite** |', '| **full** |']],
]) test(`filterSkillBodyForMode keeps only ${mode} rows`, () => {
  const out = filterSkillBodyForMode(body, mode)
  assert.ok(out.includes(kept)); for (const d of dropped) assert.ok(!out.includes(d))
  assert.ok(out.includes('## The smallest complete change')) // 普通规则行保留
})
test('filterSkillBodyForMode keeps a non-mode bullet that starts with a mode word', () => {
  assert.ok(filterSkillBodyForMode('- Full: keep me\n- lite: "drop me"\n', 'ultra').includes('- Full: keep me'))
})
test('filterSkillBodyForMode works on CRLF input', () => {
  assert.equal(filterSkillBodyForMode(body.replaceAll('\n', '\r\n'), 'lite').replaceAll('\r', ''), filterSkillBodyForMode(body, 'lite'))
})
test('buildRules', () => {
  assert.equal(buildRules('off', body), '')
  assert.ok(buildRules('ultra', body).startsWith('PONYTAIL MODE ACTIVE — level: ultra\n\n'))
  assert.equal(buildRules('full', undefined), 'PONYTAIL MODE ACTIVE — level: full\n\n' + FALLBACK_RULES)
})
```

- [ ] **Step 2: 跑测试确认失败**

  Run: `node --test test/rules.test.js`
  预期：FAIL，提示模块不存在。

- [ ] **Step 3: 实现 `lib/rules.js`**

  - `filterSkillBodyForMode`：逐行移植 `~/.claude/plugins/marketplaces/ponytail/hooks/ponytail-instructions.js` 里的同名函数，包括两个正则和保留原有注释的意图。档位名称的判断改用本地的 `['lite', 'full', 'ultra']`，大小写不敏感。
  - `FALLBACK_RULES`：逐字复制同一文件里 `getFallbackInstructions` 返回值中 `"You are a lazy senior developer..."` 起直到结尾的部分，并在开头加一行 ``Switch level: `/ponytail lite|full|ultra|off`.\n\n``。
  - `buildRules`：档位为 `off` 时返回 `''`；`skillBody` 为 `undefined` 时用 `FALLBACK_RULES`；其他情况返回 `'PONYTAIL MODE ACTIVE — level: ' + mode + '\n\n' + filterSkillBodyForMode(skillBody, mode)`。

- [ ] **Step 4: 跑测试确认通过**

  Run: `node --test test/rules.test.js`
  预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/rules.js test/rules.test.js
git commit -m "feat: port ponytail mode filter and rules builder"
```

### Task 3: `lib/mode.js`，档位解析与持久化

**Files:**
- Create: `lib/mode.js`
- Test: `test/mode.test.js`

**Interfaces:**
- Produces:
  - `MODES: readonly ['lite', 'full', 'ultra', 'off']`
  - `normalizeMode(value: unknown): Mode | undefined`：先 trim 再转小写，只认 `MODES` 里的值
  - `modeFilePath(env = process.env): string`
  - `readSavedMode(file: string): Mode | undefined`：读失败或内容非法都返回 `undefined`
  - `saveMode(file: string, mode: Mode): void`：先 `mkdir -p` 父目录再写文件，失败时**抛出**，由调用方记日志
  - `initialMode({ file: string, env: object, defaultMode: Mode }): Mode`

- [ ] **Step 1: 写失败测试 `test/mode.test.js`**

```js
test('normalizeMode', () => {
  assert.equal(normalizeMode(' ULTRA\n'), 'ultra'); assert.equal(normalizeMode('loud'), undefined); assert.equal(normalizeMode(undefined), undefined)
})
test('modeFilePath follows DSH_HOME rules', () => {
  const home = os.homedir()
  assert.equal(modeFilePath({ DSH_HOME: ' /x/h ' }), path.join('/x/h', 'ponytail-mode'))
  assert.equal(modeFilePath({ DSH_HOME: '~/h' }), path.join(home, 'h', 'ponytail-mode'))
  assert.equal(modeFilePath({ DSH_HOME: '   ' }), path.join(home, '.dsh', 'ponytail-mode'))
  assert.equal(modeFilePath({}), path.join(home, '.dsh', 'ponytail-mode'))
})
test('saveMode then readSavedMode round-trips; garbage reads as undefined', () => {
  const file = path.join(tmp, 'nested', 'ponytail-mode')
  saveMode(file, 'lite'); assert.equal(readSavedMode(file), 'lite')
  fs.writeFileSync(file, 'ULTRA\n'); assert.equal(readSavedMode(file), 'ultra')
  fs.writeFileSync(file, 'garbage'); assert.equal(readSavedMode(file), undefined)
  assert.equal(readSavedMode(path.join(tmp, 'missing')), undefined)
})
test('initialMode precedence: saved > env > defaultMode', () => {
  const file = path.join(tmp, 'm')
  assert.equal(initialMode({ file, env: {}, defaultMode: 'lite' }), 'lite')
  assert.equal(initialMode({ file, env: { PONYTAIL_DEFAULT_MODE: 'ultra' }, defaultMode: 'lite' }), 'ultra')
  assert.equal(initialMode({ file, env: { PONYTAIL_DEFAULT_MODE: 'bogus' }, defaultMode: 'lite' }), 'lite')
  saveMode(file, 'off')
  assert.equal(initialMode({ file, env: { PONYTAIL_DEFAULT_MODE: 'ultra' }, defaultMode: 'lite' }), 'off')
})
```

- [ ] **Step 2: 跑测试确认失败**

  Run: `node --test test/mode.test.js`
  预期：FAIL，提示模块不存在。

- [ ] **Step 3: 实现 `lib/mode.js`**

  `modeFilePath`：`const raw = (env.DSH_HOME ?? '').trim()`；`raw` 为空时用 `path.join(os.homedir(), '.dsh')`；`raw` 是 `~` 或以 `~/`、`~\` 开头时，把 `~` 换成 `os.homedir()`；最后拼上 `'ponytail-mode'`。

- [ ] **Step 4: 跑测试确认通过**

  Run: `node --test test/mode.test.js`
  预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/mode.js test/mode.test.js
git commit -m "feat: add mode resolution and persistence"
```

### Task 4: `index.js` 插件接线与 `cordis.patch.yml`

**Files:**
- Create: `index.js`、`cordis.patch.yml`
- Test: `test/plugin.test.js`

**Interfaces:**
- Consumes: Task 1 的 `loadSkills`，Task 2 的 `buildRules`，Task 3 的 `normalizeMode`、`modeFilePath`、`initialMode`、`saveMode`。
- Produces（DSH 加载器读取这些导出）：
  - `name = 'dsh-ponytail'`、`inject = ['systemPrompt']`
  - `Config`：`z.object({ defaultMode: z.union(['lite','full','ultra','off']).default('full'), sectionOrder: z.number().default(10150) })`，其中 `z` 是 `import z from '@deepseek-ai/schemastery'`
  - `apply(ctx, config): void`
- DSH 侧的 API（已对照 dsh 0.2.1-rc.2 源码确认）：
  - `ctx.systemPrompt.section({ name, order, text: (assembleCtx) => string, interpolate })`
  - `ctx.inject(['commands'], (inner) => inner.commands.register({ name, description, input: { hint }, handler: ({ rawInput }) => ({ kind: 'success', text } | { kind: 'error', text }) }))`
  - `ctx.inject(['skills'], (inner) => inner.skills.register({ name, description, content, path, source }))`：名称非法时会抛错
  - `ctx.logger.warn(fmt, ...args)`

- [ ] **Step 1: 写失败测试 `test/plugin.test.js`**

  测试辅助函数 `fakeCtx({ commands = true, skills = true })` 返回一个对象 `ctx`。服务和记录要分开放，因为 `ctx.skills` 在 DSH 里是服务本身：
  - 记录：`ctx.rec = { sections: [], commands: [], skills: [], warnings: [] }`；
  - `ctx.systemPrompt.section(s)`：推入 `rec.sections`；
  - `ctx.commands.register(d)`：推入 `rec.commands`；传 `commands: false` 时不提供这个服务；
  - `ctx.skills.register(s)`：推入 `rec.skills`；传 `skills: false` 时不提供这个服务；
  - `ctx.logger.warn(...a)`：推入 `rec.warnings`；
  - `ctx.inject(names, fn)`：`names` 列出的服务都存在时，立即调用 `fn(ctx)`；
  - `ctx.rules()`：等于 `rec.sections[0].text({})`；
  - `ctx.run(input)`：等于 `rec.commands[0].handler({ rawInput: input })`。

  每个用例开始前，把 `process.env.DSH_HOME` 设为新的临时目录，并删除 `PONYTAIL_DEFAULT_MODE`。

```js
const cfg = () => Config({})
test('Config defaults and validation', () => {
  assert.deepEqual(Config({}), { defaultMode: 'full', sectionOrder: 10150 })
  assert.throws(() => Config({ defaultMode: 'loud' }))
})
test('registers the rules section at full by default', () => {
  const ctx = fakeCtx(); apply(ctx, cfg()); const [s] = ctx.rec.sections
  assert.equal(s.name, 'ponytail'); assert.equal(s.order, 10150); assert.equal(s.interpolate, false)
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: full'))
})
test('/ponytail switches, persists, and survives re-apply', () => {
  const ctx = fakeCtx(); apply(ctx, cfg())
  assert.deepEqual(ctx.run('  Ultra '), { kind: 'success', text: 'ponytail ultra' })
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: ultra'))
  assert.equal(fs.readFileSync(path.join(process.env.DSH_HOME, 'ponytail-mode'), 'utf8'), 'ultra')
  const again = fakeCtx(); apply(again, cfg()); assert.ok(again.rules().includes('level: ultra'))
  assert.deepEqual(ctx.run(' off'), { kind: 'success', text: 'ponytail off' }); assert.equal(ctx.rules(), '')
})
test('bare /ponytail turns on from off, otherwise keeps the level', () => {
  const ctx = fakeCtx(); apply(ctx, Config({ defaultMode: 'lite' }))
  assert.deepEqual(ctx.run(''), { kind: 'success', text: 'ponytail lite' })
  ctx.run(' off'); assert.deepEqual(ctx.run(''), { kind: 'success', text: 'ponytail lite' })
  const offDefault = fakeCtx(); apply(offDefault, Config({ defaultMode: 'off' }))
  assert.deepEqual(offDefault.run(''), { kind: 'success', text: 'ponytail full' })
})
test('invalid level is an error and keeps the level', () => {
  const ctx = fakeCtx(); apply(ctx, cfg())
  const r = ctx.run(' loud'); assert.equal(r.kind, 'error'); assert.match(r.text, /lite\|full\|ultra\|off/)
  assert.ok(ctx.rules().includes('level: full'))
})
test('unwritable DSH_HOME still switches in-process and warns once', () => {
  const blocker = path.join(process.env.DSH_HOME, 'file'); fs.writeFileSync(blocker, '')
  process.env.DSH_HOME = blocker
  const ctx = fakeCtx(); apply(ctx, cfg())
  assert.equal(ctx.run(' ultra').kind, 'success'); assert.ok(ctx.rules().includes('level: ultra'))
  assert.equal(ctx.rec.warnings.length, 1)
})
test('registers all 6 skills with source runtime', () => {
  const ctx = fakeCtx(); apply(ctx, cfg())
  assert.equal(ctx.rec.skills.length, 6); assert.ok(ctx.rec.skills.every(s => s.source === 'runtime' && s.content && s.description))
})
test('a throwing skills.register is logged and the rest still register', () => {
  const ctx = fakeCtx(); let n = 0
  ctx.skills.register = (s) => { if (n++ === 0) throw new Error('boom'); ctx.rec.skills.push(s) }
  apply(ctx, cfg()); assert.equal(ctx.rec.skills.length, 5); assert.equal(ctx.rec.warnings.length, 1)
})
test('loads without commands and skills services', () => {
  const ctx = fakeCtx({ commands: false, skills: false })
  assert.doesNotThrow(() => apply(ctx, cfg())); assert.ok(ctx.rules().includes('level: full'))
})
```

- [ ] **Step 2: 跑测试确认失败**

  Run: `node --test test/plugin.test.js`
  预期：FAIL，提示模块不存在。

- [ ] **Step 3: 实现 `index.js` 和 `cordis.patch.yml`**

  `apply` 的步骤：
  1. 用 `loadSkills(path.join(import.meta.dirname, 'skills'))` 读取 skill，每条 `errors` 都调用一次 `ctx.logger.warn`。
  2. 从结果里找出名为 `ponytail` 的 skill，取它的 `content` 作为 `skillBody`。
  3. `let mode = initialMode({ file: modeFilePath(), env: process.env, defaultMode: config.defaultMode })`。
  4. 注册规则段，`text: () => buildRules(mode, skillBody)`。
  5. 注册命令，描述为 `'Switch ponytail level'`，输入提示为 `'[lite|full|ultra|off]'`。handler 的逻辑：
     - `rawInput.trim()` 为空：当前档位是 `off` 时，切到 `config.defaultMode`（它本身是 `off` 就切到 `full`）；否则保持当前档位。
     - 非空：先 `normalizeMode`，结果非法就返回 `{ kind: 'error', text: 'Usage: /ponytail [lite|full|ultra|off]' }`。
     - 档位有变化时调用 `saveMode`，用 try/catch 包住，失败调用一次 `ctx.logger.warn`。
     - 最后返回 `{ kind: 'success', text: 'ponytail ' + mode }`。
  6. 逐个注册 skill，传入 `{ ...skill, source: 'runtime' }`。每次 register 单独 try/catch，失败调用一次 `ctx.logger.warn`。

  `cordis.patch.yml` 的完整内容：

```yaml
- insert:
    - id: ponytail
      name: dsh-ponytail
```

- [ ] **Step 4: 跑全部测试**

  Run: `npm test`
  预期：PASS，4 个测试文件的用例全过。

- [ ] **Step 5: 提交**

```bash
git add index.js cordis.patch.yml test/plugin.test.js
git commit -m "feat: wire ponytail into DSH system prompt, commands and skills"
```

### Task 5: README 与 DSH 真机冒烟

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 `README.md`**

  内容包括：
  - 一句话说明这个包做什么；
  - 安装命令：`dsh plugin --profile web add github:<owner>/dsh-ponytail`；桌面版要先退出 Desktop，再用 `--profile desktop` 安装；
  - `/ponytail` 的用法；
  - `cordis.yml` 中两个配置项的说明；
  - 持久化文件的位置；
  - 已知限制：
    - 带 `complete` 完整提示词的 preset（例如 `minimal`）里规则段不生效；
    - 项目里的 `.agents/skills/ponytail*` 会覆盖本包同名的 skill；
  - skill 同步步骤：从 ponytail 仓库复制 `skills/`，再跑 `npm test`；
  - 来源与 MIT 许可说明。

- [ ] **Step 2: 冒烟测试，执行前先征得用户同意，因为要下载 DSH**

  为了不碰用户真实的 DSH 配置，所有命令都设置 `DSH_HOME=<scratchpad>/dsh-home`。
  - Run: `npx -y @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web add <repo 绝对路径>`，再运行 `npx -y @deepseek-ai/dsh@0.2.1-rc.2 --profile web --dump-config`。
    预期：输出里有 `# == dsh-ponytail` 这一层，并且有 `id: ponytail` 这一行。
  - Run: `npx -y @deepseek-ai/dsh@0.2.1-rc.2 --profile web --no-open`，后台运行。用内置浏览器打开它打印出的 URL，输入 `/ponytail ultra`。
    预期：返回 `ponytail ultra`，`<DSH_HOME>/ponytail-mode` 的内容为 `ultra`；输入 `/` 时建议列表里出现 `ponytail-review`；启动日志里没有 `dsh-ponytail` 相关的报错。
  - 验证模型是否真的收到规则需要 DeepSeek 账号或 API key，这一步交给用户自己做，不代填凭据。

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: add README with install, usage and sync steps"
```
