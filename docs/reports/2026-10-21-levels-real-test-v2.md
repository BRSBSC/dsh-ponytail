# dsh-ponytail 四档真实测试报告（off / lite / full / ultra）

测试时间：2026-10-21 01:43–02:02（Asia/Shanghai）
测试对象：`dsh-ponytail` 1.0.1，工作区 `J:\abu_workspace\claude\ponytail`，与已安装副本逐字节一致（5 个文件 SHA-256 全同）
宿主：DeepSeek Harness 桌面版 `0.2.1-rc.2`（`D:\Harness`），profile `desktop`
模型：`deepseek-v4.1-flash`（`aiproxy`，reasoningEffort: max）

> 这是第二轮测试。第一轮（`2026-10-21-levels-real-test.md`）的子代理不许落盘、不许用工具，行为数据是"描述"而非"产物"。本轮让四档各自真实写文件，规模数据可复核。

---

## 一、结论

1. **插件生效，四档全部到位**。四档的注入首行、`## Levels` 保留行，与 `buildRules()` 生成的文本逐字一致，无偏差。
2. **这次 lite 与 full/ultra 拉开了明显差距**，不再是上一轮的"三档无差别"：

   | 档位 | 文件数 | 代码文件 | 代码行 | 相对 off |
   |---|---|---|---|---|
   | off | 41 | 21 | **4226** | 100% |
   | lite | 12 | 3 | **419** | 9.9% |
   | full | 29 | 15 | **1892** | 44.8% |
   | ultra | 24 | 12 | **1775** | 42.0% |

   lite 压到了 off 的一成，full/ultra 压到四成出头。**lite 是四档里最省的**，与设计意图（"先给更小方案"）方向一致。
3. **ultra 的"质疑需求"仍未触发**。两轮测试、两次机会，一次都没出现 push back。
4. **`shortcut: <the limit>, <when to upgrade>` 这条共同规则，四档全部零执行**（0/4）。这是规则文本里少见的"写了但完全没落地"的条目。
5. **横幅在真机上验证通过**（上一轮未验证）。点按钮、敲命令，两条路径都真实改写了配置。
6. **off 与三档的差别依然是最可靠的信号**：off 会自作主张加 HTTP 服务、模板引擎、语法高亮、脚注解析、3 套主题、3 个示例插件——没人要过这些。

---

## 二、测了什么

### 2.1 机制层

| 项 | 方法 | 结果 |
|---|---|---|
| 单元测试 | `node --test`（Node v24.21.0） | 40 通过 / 0 失败 / 232ms |
| 注入文本 | 直接调 `buildRules(mode, skillBody)` | off 270 字符/5 行；lite 3087/45；full 3032/45；ultra 3101/45 |
| 已安装一致性 | `index.js`、`lib/rules.js`、`skills/ponytail/SKILL.md`、`cordis.patch.yml`、`client.js` 的 SHA-256 | 5/5 相同 |
| 生效位置 | `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` | `- id: ponytail … mode: ultra` |

### 2.2 注入层（逐字回报，四档各起一个全新子代理）

| 档位 | 首行 | `## Levels` 保留行 |
|---|---|---|
| off | `PONYTAIL MODE OFF — disregard ponytail rules from earlier system messages.` | 不存在（整段 `## Levels` 消失，也无 `## Before you write` / `## The smallest complete change`） |
| lite | `PONYTAIL MODE ACTIVE — level: lite` | `\| **lite** \| Build what was asked. Name the smaller option in one line and let the user pick. \|` |
| full | `PONYTAIL MODE ACTIVE — level: full` | `\| **full** \| The rules above. Default. \|` |
| ultra | `PONYTAIL MODE ACTIVE — level: ultra` | `\| **ultra** \| Also question the request: before building, push back on any part the need does not justify. \|` |

四档都与生成结果逐字吻合。子代理还确认：`## Levels` 表里只留自己那一行，其余两行被裁掉；`# Ponytail` 小节紧随首行。

**热重载延迟**：每次改完 `mode` 等 5 秒，全部生效，无需重启进程。

### 2.3 行为层

做法：改 `mode` → 等 5 秒 → 起一个全新子代理，工作目录指向 `test-runs/behavior-<档位>`，给同一个需求，要求真实落盘：

> 给我写一个 Markdown 转 HTML 的命令行工具，要支持插件系统、模板主题、增量缓存、多语言界面、watch 模式，输出到 out/ 目录。用 Node.js 写。

四档条件一致：同一 prompt、同一模型、允许工具调用、允许写文件、不许反问。

**方法学警告**：为了拿到可比数据，我在 prompt 里强制要求结尾汇报 `FILES / LOC / SKIPPED` 三行。这污染了"结尾汇报跳过项"这一项的观测——四档都给了 SKIPPED，包括 off。**因此下面"Skipped 汇报"一栏不能算插件效果**，只能算被 prompt 逼出来的。

---

## 三、四档实际产出

### 3.1 规模（我亲自数，不是子代理自报）

统计口径：排除 `out/` 产物目录；"代码行"只算 `.js/.mjs/.cjs`。

| 档位 | 全部文件 | 代码文件 | 代码行 | 文档行 | 自带测试 | `shortcut:` 注释 | 自报 LOC | 自报与实测是否吻合 |
|---|---|---|---|---|---|---|---|---|
| off | 41 | 21 | 4226 | 278 | `test/run.js`（50 用例） | 0 | 5919 | 吻合（自报含模板/CSS/数据） |
| lite | 12 | 3 | **419** | 56 | **无** | 0 | 698 | 吻合（自报含文档） |
| full | 29 | 15 | 1892 | 151 | `test/smoke.mjs`（12 用例） | 0 | 2160 | 吻合 |
| ultra | 24 | 12 | 1775 | 136 | `test/run-tests.js`（26 用例） | 0 | 1977 | 吻合 |

### 3.2 逐档描述

**off（4226 行 / 21 个代码文件）** — 规则整段消失，模型按默认工程习惯自由展开：

- 自研模板引擎（`if/unless/each/with/partial/raw`）
- 自研语法高亮（js/ts/python/bash/rust/go/c/cpp/java/sql/json/yaml/css/html 十几种语言）
- Markdown 解析器带脚注、GFM 表格、任务列表、引用式链接
- `watch --serve` 附带 HTTP 服务 + SSE 热重载
- 3 套主题（default / dark / minimal，含 partials）+ 3 个示例插件
- 50 条测试
- 中途还自己踩了个坑并报告："配置里 `output` 是目录字符串，输出行为选项我另开了 `outputOptions` 键——两者同名会在 `path.join` 处炸"

这份代码质量不低，但它正是 ponytail 要压制的东西：需求里没有一个字提到 HTTP 服务、语法高亮、脚注。

**lite（419 行 / 3 个代码文件）** — 单文件 `mdt.js`（446 行核心）+ 2 个插件，2 套主题模板。需求 5 项全部实现，实测全过（首次构建 2 写、二次 2 命中缓存、换主题全量重建、`--no-cache`/`--no-plugins` 生效、watch 去抖 150ms）。**唯一一档没写测试的**。

**full（1892 行 / 15 个代码文件）** — 模块化拆成 `cli/build/markdown/theme/cache/plugins/watch/i18n/scan/logger`，4 套主题、2 个示例插件、12 条 smoke 测试、frontmatter、`--minify`、`--base`、`--drafts`、`clean`/`locales` 子命令、SSE live reload。

**ultra（1775 行 / 12 个代码文件）** — 与 full 规模接近但更紧凑：8 个插件钩子、3 套主题、3 个示例插件、26 条测试、`build|watch|list` 子命令。**依然没有一句质疑需求**。

### 3.3 关键对照

| 观测项 | off | lite | full | ultra |
|---|---|---|---|---|
| 需求 5 项是否全实现 | 全实现+超发 | 全实现 | 全实现+超发 | 全实现+超发 |
| 是否单文件 | 否 | **是** | 否 | 否 |
| 自研 Markdown 解析器 | 是 | 是 | 是 | 是 |
| 超出需求的功能 | HTTP 服务、SSE、语法高亮、脚注、脚手架命令 | 无 | SSE live reload、`--minify`、frontmatter、4 语言 | 8 钩子、3 主题、3 插件 |
| 自带测试 | 有（50） | **无** | 有（12） | 有（26） |
| `shortcut:` 注释 | 0 | 0 | 0 | 0 |
| 质疑需求 | — | — | — | **无** |
| 提更小方案 | — | **无** | — | — |

---

## 四、规则执行情况（逐条核对）

`skills/ponytail/SKILL.md` 的规则，按"能不能在产物里验证"分成两类。

### 4.1 被执行的

| 规则 | 证据 |
|---|---|
| 最小实现、砍掉没人要的选项 | lite 419 行、单文件；三档都远小于 off |
| 复用已装依赖 / 标准库 | 四档全部零运行时依赖，用 `node:fs`、`node:crypto`、`node:path` |
| 代码移动/合并保留错误处理 | 四档都有参数校验、退出码、异常不中断构建 |
| 新非平凡逻辑留一个小测试 | off / full / ultra 有；**lite 没有**（3/4） |

### 4.2 没被执行的

| 规则 | 实测 |
|---|---|
| `shortcut: <the limit>, <when to upgrade>` 注释格式 | **0/4**。四档都写了"跳过了什么"的自然语言说明，但没人用这个格式。规则里给的是硬格式，模型当成了软建议。 |
| ultra：`before building, push back on any part the need does not justify` | **0/2**（两轮测试两次机会）。需求明列 5 项能力，模型一律判定全部 justified。 |
| lite：`Name the smaller option in one line and let the user pick` | **0/1**。lite 直接开写，SKIPPED 报的是 `NONE`。 |

### 4.3 无法归因的

- **结尾汇报跳过项**：四档全有，但被我的 prompt 强制要求，不能算规则生效。

---

## 五、横幅与命令（真机，本轮新增）

上一轮报告写"横幅只有单测覆盖，未在界面点过"。这次补上了。

### 5.1 环境

为了不污染 desktop profile，另建了临时 profile `ponytest`（从 `web` 模板复制），用 `dsh plugin --profile ponytest add file:J:/abu_workspace/claude/ponytail` 装本地插件，跑在 `127.0.0.1:3131`。用 Chromium 153 无头实例通过 CDP 操作。

### 5.2 横幅渲染

首屏 DOM 里 `[data-slot="conversation.input.dock"]` 下渲染出：

```
<div role="group" aria-label="Level">
  <span>ponytail</span>
  <button data-mode="lite">Lite</button>
  <button data-mode="full" aria-pressed="true">Full</button>
  <button data-mode="ultra">Ultra</button>
  <button data-mode="off">Off</button>
  <span style="flex:1"></span>
  <button data-action="review">Review</button>
  <button data-action="audit">Audit</button>
</div>
```

- 四个档位按钮齐全，当前档位 `aria-pressed="true"` 且加粗 + 底色。
- 位置在输入框上方，宽度用 `calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))` 对齐输入卡。
- 新会话空白页正常显示（README 说新会话空白页不显示——**这条说法与实际不符**，见 §7.1）。

### 5.3 点击切换

点 `[data-mode="ultra"]` → `profiles/ponytest/cordis.patch.yml` 新增：

```yaml
- id: ponytail
  name: dsh-ponytail
  config:
    mode: ultra
```

**通过**。同一次点击还写入了 `ui-settings-general` 的 `welcomeNoticeVersion`（关闭 Preview Notice 弹窗的副作用，与插件无关）。

### 5.4 命令切换

在输入框填 `/ponytail lite` 回车 → 配置文件变成 `mode: lite`。**通过**。

### 5.5 语言

`client.js` 有 `zh`/`en` 两套词条（`精简/完整/极致/关闭`、`审查`、`全库审计`）。但把浏览器 `locale` 设成 `zh-CN` 后界面仍显示 `Lite/Full/Ultra/Off`——DSH 的界面语言来自设置项，不跟浏览器 locale。**中文横幅这次没验到**，需要先把 DSH 设置里的语言改成中文。

---

## 六、每档该什么时候用

| 档位 | 实测效果 | 建议 |
|---|---|---|
| `off` | 等同没装插件（语言规则仍生效）。会主动加 HTTP 服务、语法高亮、脚手架这类没人要的东西。 | 做对照、或规则与当前任务冲突时 |
| `lite` | **最省的一档**：单文件、419 行、砍得最狠。代价是不写测试、不提更小方案。 | 要"够用就行"的小工具时用 |
| `full` | 默认值。模块化、有测试、有文档，规模是 off 的 45%。 | 日常保持 |
| `ultra` | 与 full 规模接近（42%），略紧凑。**"质疑需求"没生效**。 | 现在与 full 差别不大，不必专门选 |

一句话：**开 ponytail 有效，off 和其余三档是两个世界；三档之间 lite 明显更省，full 与 ultra 拉不开。**

---

## 七、发现的问题

### 7.1 README 说"新会话空白页不显示横幅"，实测显示

README 的"横幅"一节写：

> 以下情况不显示横幅：新会话的空白页（发出第一条消息之前）、CLI/TUI。

实测：全新会话、未发任何消息，横幅完整渲染在输入框上方。要么 README 写错了，要么代码在某个版本后改了行为没同步文档。**建议核对 `client.js` 的 `conversation.input.dock` slot 注册条件，再改文档。**

### 7.2 `shortcut:` 注释格式 0/4 执行

规则里写的是硬格式：

```
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.
```

四档全部写成自然语言（"零依赖；未做 Markdown 全语法…"），没有一条用这个格式。这个格式的价值在于可 grep，自然语言替代不了。**改法**：把这条从 `## The smallest complete change` 的 bullet 里提出来，单独成段并给一个正例（`// shortcut: no incremental cache, add one when >500 files`）。上一轮报告的建议（给每档补可判定动作）同样适用于它。

### 7.3 ultra 的 push back 仍无触发条件

`Also question the request: before building, push back on any part the need does not justify.`

两轮、两次、零次执行。需求把 5 项能力写死，模型判定"用户明确要了就是 justified"。规则没定义什么叫 "does not justify"，也没说"用户列了 N 项以上就该砍"。**改法**：给可判定条件，例如"请求列出 3 项以上独立能力时，先列出你会砍的那一项，再动手"。

### 7.4 lite 的"提更小方案"也没执行

`Name the smaller option in one line and let the user pick.` —— lite 直接开写，SKIPPED 报 `NONE`。同时它是唯一没写测试的一档（规则要求"新非平凡逻辑留一个小测试"）。**lite 在实测里变成了"更省但更糙"，不是"更省且先问一句"。**

### 7.5 `~/.dsh/ponytail-mode` 是遗留文件

`%USERPROFILE%\.dsh\ponytail-mode` 内容 `ultra`，但仓库里没有任何代码引用这个文件名（`grep -r ponytail-mode` 在 `index.js`/`lib/`/`client.js` 里零命中）。档位真正的存储位置是 profile 的 `cordis.patch.yml`。**这个文件是早期版本或别的插件留下的，删掉不影响功能，留着容易让人以为档位存在那里。**

### 7.6 lite 不写测试

规则明确写"Lazy code without its check is unfinished"，lite 档的 419 行里零测试文件。这条与"lite 应该更省"是冲突的——测试不属于"可以砍的灵活性"。**可能是 lite 行的那句 "Build what was asked" 被理解成"别加没要的东西，包括测试"。** 若要保留这条约束，`Never cut` 清单里应该把"测试"写得更显眼。

### 7.7 一个正面发现（延续上轮）

`off` 的显式撤销声明工作正常，而且这次验证得更彻底：子代理确认 `## Levels`、`## Before you write`、`## The smallest complete change` 三个小节全部消失，只剩一行声明 + 语言规则。行为也确实放开（off 是唯一自建 HTTP 服务的档）。

---

## 八、未验证 / 边界

- 每档仍然 n=1。四档各一次，单模型、单任务。规模数据可复核，但不能当统计结论。
- 任务把 5 项需求写死，等于替模型关掉了"要不要砍"这个判断——这对 ultra 的 push back 是天然不利条件。
- **SKIPPED 汇报被 prompt 污染**，不能作为规则生效的证据。
- 中文横幅未验证（需先改 DSH 界面语言）。
- 未验证多 preset（`complete` 段 preset 会让 ponytail 整体失效）、未验证 web profile、未验证 CLI/TUI。
- 未测 `/ponytail-review`、`/ponytail-audit` 按钮往输入框塞命令的行为（`client.js` 的 `draftCommand`）。
- 横幅的 `writable: false`（profile 只读时按钮禁用）未验证。

---

## 九、复现步骤

```powershell
cd J:\abu_workspace\claude\ponytail

# 1. 单测
npm test

# 2. 生成四档注入文本
node --input-type=module -e @'
import fs from "node:fs"
import { parseSkillFile } from "./lib/skills.js"
import { buildRules } from "./lib/rules.js"
const body = parseSkillFile(fs.readFileSync("skills/ponytail/SKILL.md","utf8")).content
for (const m of ["off","lite","full","ultra"]) {
  const t = buildRules(m, body)
  console.log(m, t.length, "chars", t.split("\n").length, "lines")
}
'@

# 3. 切档（跑着的时候改，5 秒内新会话生效）
$f = "$env:USERPROFILE\.dsh\profiles\desktop\cordis.patch.yml"
Copy-Item $f "$f.bak"
(Get-Content $f -Raw) -replace '(?m)^(\s*mode:\s*)(lite|full|ultra|off)\s*$','${1}lite' |
  Set-Content -Encoding utf8 -NoNewline $f
# 还原（按字节，不要用 -replace 回写）
Copy-Item "$f.bak" $f -Force
```

> 注意：用 `-replace` 回写会改变文件末尾换行，SHA-256 与备份不一致。还原要用 `Copy-Item`。

---

## 十、本次对系统做的改动（已全部还原）

| 改动 | 状态 |
|---|---|
| `profiles/desktop/cordis.patch.yml` 的 `mode`（ultra→off→lite→full→ultra→lite→ultra） | 已按字节从备份还原，SHA-256 与备份一致，当前 `ultra` |
| 临时 profile `profiles/ponytest`（跑 3131 端口的 Web 实例，用于横幅验证） | 已整目录删除，`profiles/` 下只剩 `desktop`、`web`、`node_modules` |
| 临时备份文件 `cordis.patch.yml.ponytest.bak`、`cordis.patch.yml.probe2.bak` | 已删除 |
| 测试产物 `test-runs/behavior-{off,lite,full,ultra}/` | **保留**，用于复核 §3 的数字 |
| 测试产物 `test-runs/rules-*.txt` | **保留**，四份注入文本原文 |
| 会话级：9 个子代理会话（4 探测 + 4 行为 + 1 补测） | 保留在会话历史中 |
