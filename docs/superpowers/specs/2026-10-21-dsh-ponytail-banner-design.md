# dsh-ponytail 中文横幅设计

日期：2026-10-21
状态：待审
前置：`2026-10-20-dsh-ponytail-design.md`（以下简称"原 spec"）。本 spec 改写了原 spec 的"档位状态"和"`/ponytail` 命令"两节，并删掉了"不做"列表里的"状态栏或横幅"一项。

## 目标

在 DSH Web 和桌面版的输入框上方显示 ponytail 横幅，界面语言为中文时显示中文。

**成功标准**：在 DSH Web 中把界面语言切到中文，进入一个会话后：

- 横幅显示当前档位，档位名用中文；
- 点击"极致"后横幅立即更新，下一轮注入的规则也是 ultra 档；
- 在另一个标签页或输入框里执行 `/ponytail lite`，横幅自动更新为"精简"；
- 点击"审查"，输入框里出现 `/ponytail-review `。

界面语言切回英文后，横幅显示英文。

## 约束

- 继续免构建：浏览器端代码手写成 DSH 的模块格式，不写 JSX、不用打包工具，用户仍然可以从 GitHub 直接安装。
- 档位状态只有一个来源，就是 DSH 设置项：后端注入、`/ponytail` 命令和横幅都读写它。
- 语言自动跟随 DSH 界面语言，不加单独的语言开关。

## 不做

- CLI/TUI 下的横幅（这两种界面没有对应的界面位置）。
- 新会话空白页（首条消息之前）上的横幅：这个界面位置按会话挂载，会话建立之前不显示。
- 花费、耗时、复用率、测试状态等统计项，以及"看板"和"详情"。
- 横幅的隐藏或折叠开关。

## 方案

档位改为插件的可热更新配置项，由 DSH Settings 服务负责读写和持久化。备选方案"复用命令加只读接口"和"Typert Remote"在讨论中被否决：前者档位状态有两份来源，后者需要构建步骤。

## 后端改动（`index.js`）

### 配置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mode` | `lite \| full \| ultra \| off`，`.volatile()` | `full` | 当前档位，修改后不需要重载插件 |
| `sectionOrder` | number | `10150` | 不变 |

删除 `defaultMode`。

### 规则注入

规则段的 `text` 改成 `() => buildRules(config.mode.get(), skillBody)`。`off` 档仍然注入撤销声明，这是终审后定下的行为。

### `/ponytail` 命令

- 用 `ctx.inject(['settings'], ...)` 按需取得 Settings 服务。
- 带合法参数时，调用 `ctx.settings.update(<本插件条目 id>, { mode })` 写入当前 profile 的 `cordis.patch.yml`。条目 id 取 `ponytail`，即本包 `cordis.patch.yml` 插入的那一行。
- 不带参数时：当前是 `off` 就写入 `full`，否则不写，只返回当前档位。
- 非法参数返回 error，写法不变。
- 写入失败时返回 `{ kind: 'error', text: '<Settings 返回的原因>' }`，档位保持不变。常见原因：home patch 或命令行 overlay 已经固定了 `mode`、profile 只读。
- 当前组合没有 Settings 服务时：`/ponytail` 带参数返回 error `Settings service unavailable; set mode in cordis.yml`；不带参数照常返回当前档位。

### 删除

`lib/mode.js`、`$DSH_HOME/ponytail-mode` 持久化文件、`PONYTAIL_DEFAULT_MODE` 环境变量，以及对应的测试。本包尚未发布，所以不需要迁移。

## 浏览器端（新增 `client.js`）

### 打包声明（`package.json`）

- 新增 `"exports": { ".": "./index.js", "./client": "./client.js", "./package.json": "./package.json" }`。
- `files` 里加上 `client.js`。
- 新增 `dsh.client`：
  - `platform: 'web'`；
  - `inject`: `@deepseek-ai/dsh-api-remotes`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-conversation`。

### 模块格式

```js
window.__ModuleLoader__.load({
  id: 'dsh-ponytail',
  factory: (require) => { /* require('react') … */ return { inject, apply } },
})
```

这与 DSH 0.2.1-rc.2 自带客户端包的构建产物格式相同（例如 `dsh-client-ui-plan/lib/client.js`）。

### 注册

- `inject = ['remote', 'slots', 'locale']`。
- `apply(ctx)` 中：
  - 用 `ctx.locale.register('ponytail', { zh, en })` 注册中英文词典；
  - 用 `ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'ponytail', order: 30, locale: 'ponytail', inject: sessionId => ({ ... }) }, Banner))` 注册横幅。
- 注册都放在 effect 里，插件卸载时会自动撤销。

### 数据

- 用一个进程内共享的小型可观察 store 存放 `{ mode, writable }`。
- 读取：`ctx.remote.settings.describe()`，在 `namespaces` 里找 `ns === 'ponytail'` 的项，取 `value.mode`；`writable` 取返回结果顶层的 `writable`。
- 刷新时机：
  - 首次挂载时读一次；
  - 收到 `settings/document-updated` 且 `ns === 'ponytail'` 时重读。这个事件由 `dsh-api-remotes` 转发到浏览器端。
- 写入：`ctx.remote.settings.update('ponytail', { mode }, undefined)`。成功后用返回的视图更新 store；失败时在横幅内显示一行错误。
- 读取失败，或找不到 `ponytail` 命名空间时，横幅不显示，即组件返回 `null`。

### 界面

一行 flex 布局，从左到右：

1. `ponytail` 标识；
2. 四个档位按钮：lite 精简 / full 完整 / ultra 极致 / off 关闭。当前档位高亮；写入进行中或 `writable === false` 时全部禁用；
3. 弹性空白；
4. "审查"按钮：调用 `inputActions.setDraft('/ponytail-review ')`；
5. "全库审计"按钮：调用 `inputActions.setDraft('/ponytail-audit ')`。

样式用内联 style 加 DSH 的 CSS 变量，例如 `--dsw-alias-border-l1`，不另带 CSS 文件。

### 词典

| key | zh | en |
|---|---|---|
| `mode.lite` | 精简 | Lite |
| `mode.full` | 完整 | Full |
| `mode.ultra` | 极致 | Ultra |
| `mode.off` | 关闭 | Off |
| `review` | 审查 | Review |
| `audit` | 全库审计 | Audit |
| `level` | 档位 | Level |
| `switch.failed` | 切换失败：{message} | Switch failed: {message} |

## 错误处理

| 情况 | 行为 |
|---|---|
| Settings 写入被拒 | 命令返回 error 文本；横幅显示 `switch.failed` 并保持原档位 |
| profile 不可写 | 横幅的档位按钮禁用 |
| `describe` 失败，或没有 `ponytail` 命名空间 | 横幅不显示，并在浏览器控制台 `ctx.logger.warn` 一次 |
| 没有 Settings 服务（后端） | 见上文"`/ponytail` 命令" |

## 测试

后端，改写 `test/plugin.test.js`：fake ctx 增加 `settings`，`update` 会改写一个可变的 `mode` 引用，`get()` 读取它。用例：

1. 默认档位为 full；
2. `/ponytail  Ultra ` 会调用 `settings.update('ponytail', { mode: 'ultra' })`，规则段随之变为 ultra 档；
3. 不带参数时 off 会切到 full，其他档位保持不变且不写入；
4. 非法参数返回 error，不写入；
5. `settings.update` 抛错时，返回 error 文本，档位不变；
6. 没有 Settings 服务时，带参数返回 error，不带参数返回当前档位；
7. 原有的 skill 相关用例保留。

删除 `test/mode.test.js`。

浏览器端，新增 `test/client.test.js`：在 Node 里设置一个假的 `globalThis.window.__ModuleLoader__`，捕获 factory，再注入假的 `react`（`createElement` 返回普通对象，hooks 用最小桩实现）和假的 ctx：

1. 注册了 `conversation.input.dock` 条目，`id` 为 `ponytail`；
2. `zh` 和 `en` 两份词典的 key 集合完全相同，且覆盖上表所有 key；
3. store 初始读取会调用 `describe`，并取出 `mode` 和 `writable`；
4. 收到 `settings/document-updated('ponytail')` 后重读，收到其他 ns 时不重读；
5. 点击档位会调用 `settings.update('ponytail', { mode })`；
6. "审查"按钮会调用 `setDraft('/ponytail-review ')`。

真机冒烟（Web，DSH 0.2.1-rc.2，隔离的 DSH_HOME）：

- 界面切到中文，进入会话后横幅文字是中文；
- 点击"极致"后，profile 的 patch 里出现 `mode: ultra`；
- 输入 `/ponytail lite` 后横幅自动变成"精简"；
- 点击"审查"后输入框里出现 `/ponytail-review `；
- 切回英文后横幅显示英文。

## 风险

- `window.__ModuleLoader__` 是 DSH 的内部格式，升级后可能变化；`engines.dsh` 已经限定为 `<0.3.0`。
- 桌面版只做了代码层面的推断，没有真机验证。
