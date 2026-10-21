# dsh-ponytail 四档实测报告（off / lite / full / ultra）

测试日期：2026-10-21
测试对象：`dsh-ponytail` 1.0.1（`github:BRSBSC/dsh-ponytail`），工作区 `J:\abu_workspace\claude\ponytail` 与已安装副本逐字节一致
宿主：DeepSeek Harness 桌面版（Electron，`D:\Harness`），profile `desktop`，Web UI `127.0.0.1:3123`
模型：本会话默认模型，未显式指定

---

## 一、结论先讲

1. **插件在 DSH 上是生效的**：规则段真实进入了系统提示，四档的标签、表格行、撤销声明都与代码生成结果逐字吻合；改配置后 4 秒内新会话即读到新档位，不需要重启。
2. **档位差异的真实来源只有一行表格**（外加首行 `level: x` 标签）。lite / full / ultra 三份注入文本各有 45 行，其中 43 行完全相同。
3. **行为层面，off 与其余三档差异显著**：同一个任务，off 档产出 10 个文件、约 700 行的多模块工程；lite / full / ultra 都收敛成 1 个文件的单脚本（约 270–420 行）。这证明插件的主效果——压制过度工程——是真实的。
4. **lite / full / ultra 三档之间的行为差异，在本次测试中没有被观察到**。三档都照做了全部 5 项需求，都没质疑需求，都没给出"更小的方案"。ultra 的 `push back` 规则没有执行。
5. 结论：**现在的插件更像"ponytail 开 / 关"两档**。三档强度是设计意图，不是可测量的行为差异。

---

## 二、测了什么，怎么测的

### 2.1 机制层（可完全复现）

| 测试 | 方法 | 结果 |
|---|---|---|
| 单元测试 | `npm test`（node v24.21.0，`node --test`） | 40 通过 / 0 失败 / 228ms |
| 注入文本生成 | 直接调用 `buildRules(mode, skillBody)` 输出四份文本 | off 270 字符/5 行；lite 3087/45；full 3032/45；ultra 3101/45 |
| 已安装副本一致性 | 对 `index.js`、`lib/rules.js`、`skills/ponytail/SKILL.md`、`cordis.patch.yml` 做 SHA-256 比对 | 4/4 完全相同（版本 1.0.1） |
| 生效位置 | `profiles/desktop/cordis.patch.yml` 中的 `- id: ponytail … mode: ultra` | 存在，当前值 ultra |

### 2.2 运行时层（真实端到端）

做法：把 `profiles/desktop/cordis.patch.yml` 的 `mode` 依次改成 lite → full → ultra → off，每次等 4 秒，然后启一个子代理会话（同一进程、同一 profile、全新上下文），让它做两件事：

1. 逐字抄出系统提示里 `PONYTAIL MODE` 段的第一行，以及 `## Levels` 表格保留的那一行；
2. 回答同一个任务：

> 给我写一个 Node 的代码行数统计 CLI：支持配置文件、可插拔的语言解析器、彩色输出、并发扫描、JSON 导出。直接给可运行代码。

这一步同时验证"注入是否到达模型"和"模型拿到档位后怎么干"。四档条件完全一致（同一 prompt、同一模型、同样禁止调用工具）。

### 2.3 证据等级说明

- 第 1 层（机制）：**直接观测**，可复现。
- 第 2 层（运行时注入）：**直接观测**——模型逐字回报的首行就是它上下文里的原文。
- 第 3 层（行为）：**单样本观测**，每档 n=1，单模型、单任务。只能说明"这次是这样"，不能证明因果强度。下面所有行为结论都按这个强度读。

---

## 三、四档注入到什么（逐字）

### 3.1 首行与表格行

| 档位 | 系统提示首行（模型逐字回报） | `## Levels` 保留行 |
|---|---|---|
| off | `PONYTAIL MODE OFF — disregard ponytail rules from earlier system messages.` | **不存在**（整段 `## Levels` 消失） |
| lite | `PONYTAIL MODE ACTIVE — level: lite` | `\| **lite** \| Build what was asked. Name the smaller option in one line and let the user pick. \|` |
| full | `PONYTAIL MODE ACTIVE — level: full` | `\| **full** \| The rules above. Default. \|` |
| ultra | `PONYTAIL MODE ACTIVE — level: ultra` | `\| **ultra** \| Also question the request: before building, push back on any part the need does not justify. \|` |

### 3.2 差异有多大

以 full 为基准逐行比对（按行内容，不是按行号对齐）：

- **full → lite**：换 2 行——首行 `level: full` → `level: lite`，`| **full** | …` → `| **lite** | …`。其余 43 行内容逐字相同。
- **full → ultra**：同样只换这 2 行（ultra 版本）。其余 43 行内容逐字相同。
- **full → off**：full 的 45 行里有 25 行内容在 off 中完全不存在（首行 + 24 行规则正文），off 只多出 1 行撤销声明。

也就是说，lite / full / ultra 的注入**只差 2 行**，其中一行只是档位名字。三档共同体的规则（"最小改动"六条优先级、scope 检查、`shortcut:` 注释格式、结尾汇报跳过项、Never cut 清单）逐字相同。

`off` 不是"少一条规则"，是规则的整段消失，只剩一行否认声明 + 语言规则。

### 3.3 off 的那一行为什么必须存在

DSH 的模型在历史里保留旧的 system 快照。off 不能靠"不注入"实现——那样旧规则还在上下文里生效。所以 `lib/rules.js` 用 `OFF_NOTICE` 显式撤销，这一行在实测里被模型逐字读到，也观测到了行为放开（见下）。

---

## 四、四档实际干了什么

同一任务的四份产物：

| 档位 | 产物形态 | 代码规模 | 结尾"跳过了什么/风险" | `shortcut:` 注释 | 质疑需求 | 提更小方案 |
|---|---|---|---|---|---|---|
| off | 10 文件工程：`package.json` + `bin/` + 8 个 `src/` 模块（worker 池、扫描器、报告器、配置、语言表…） | 约 700 行 | 无 | 无 | 无 | 无 |
| lite | 单文件 `cloc.mjs` | 约 300 行 | 有 | 有 | 无 | 无（只在结尾提了没做的项） |
| full | 单文件 `loc.js`（CJS） | 约 420 行 | 有 | 有 | 无 | 无 |
| ultra | 单文件 `loc.js`（CJS）+ 内置 `--self-test` | 约 270 行 | 有 | 有 | **无** | 无 |

（代码行数为人工目测估算，误差约 ±10%；"约"是因为四份回答都没有落盘，只在对话里。）

### 4.1 逐档描述

**off** —— 规则整段消失，模型按默认倾向自由发挥：拆成 10 个文件、引入 worker_threads 线程池、字符级状态机、glob 编译器、JSON 注释剥离器、自动向上查找配置、`--max-size`、`--sort`……没有人要求这些。这份代码本身质量不差，但它正是 ponytail 存在理由的反面教材。语言规则仍然生效，输出是中文。

**lite** —— 一上来就给完整实现，5 项需求全部满足，单文件。差了规则里明确要求的那一步：`Name the smaller option in one line and let the user pick`。只在结尾列了"没做 glob 过滤、没做增量缓存、没按 .gitignore 排除"。

**full** —— 与 lite 几乎同样形态，规模稍大（多了 `--include/--exclude/--verbose` 等开关），配置查找、插件契约、彩色表格、JSON 导出齐全。结尾有跳过项与风险（"字符串里出现 `//` 会误判注释，行数属于估算级"），有 `shortcut:` 注释。

**ultra** —— 输出更紧凑（合并了语言表、砍了部分开关），多给了内置自检。但规则里那句 `before building, push back on any part the need does not justify` 完全没执行：没有一句话质疑"为什么需要 5 项能力"，也没有指出哪一项可以不要。

### 4.2 观察到的规律

- 共同规则（结尾汇报、`shortcut:` 注释、最小实现、单文件）**被执行**，且在 lite/full/ultra 三档一致。
- 档位专属规则（lite 的"提更小方案"、ultra 的"质疑需求"）**一条都没被执行**。
- off 与其余三档的差别，大到肉眼可分（10 文件 vs 1 文件）。

---

## 五、每档到底该在什么时候用

基于上面的实测，给出使用建议（不是设计意图的复述）：

| 档位 | 实测效果 | 建议 |
|---|---|---|
| `off` | 等同于没装插件，只保留中文回复。模型会按默认习惯加东西。 | 想在别处做对比、或插件规则跟当前任务冲突时用 |
| `lite` | 实测与 full 无差别。照任务做，结尾汇报跳过项。 | 目前不必专门选它 |
| `full` | 默认值。实测是最稳的一档：收敛、有跳过项、有 shortcut 注释。 | 日常保持 |
| `ultra` | 实测与 full 无差别，多出来的"质疑需求"没生效。 | 想要"先反问再动手"的话，现在给不了 |

一句话：**开 ponytail 有效，四档里真正有区别的是"开"和"关"**。

---

## 六、发现的问题

### 6.1 三档差异只有一个表格行，信号太弱（主要问题）

`skills/ponytail/SKILL.md` 的 `## Levels` 表只有三行，`filterSkillBodyForMode` 每档只留自己那行。于是档位之间唯一的区别是 15 个英文单词的一句话，被埋在 3000 字符的规则正文中间，而且位置靠后（`sectionOrder: 10150`）。实测里模型完全没对这句话作出反应。

另外，`lib/rules.js` 文件头注释提到 "worked examples"（`- lite: "..."` 形式的例子会被按档过滤），但当前 `SKILL.md` 里已经没有例子行了。过滤能力在，素材没了——这个能力目前空转。

修复方向（都属于改 `skills/ponytail/SKILL.md`，不动代码）：

1. 给每档补一条**可判定的动作**，不是形容词。例如：
   - lite：`Under 15 lines of answer, before the code: the smaller option and what it saves.`
   - ultra：`Before writing code, list what the request asks for and name the one item you would cut, then build.`
2. 把档位行从表格里提出来，单独成段放在正文最前面（紧跟首行标签），别埋在第 40 行。
3. 补回几个例子（`- lite: "..."`），`filterSkillBodyForMode` 已经支持按档过滤。

### 6.2 ultra 的"push back"没有触发条件

`Also question the request: before building, push back on any part the need does not justify.` —— 没有定义什么算 "does not justify"，模型面对"用户明确列了 5 项需求"时自动判定全部 justified。需要给出触发条件（例如"用户一次列出 3 项以上能力时"）。

### 6.3 只做了 n=1 的样本

四档各一次，单模型，单任务。要判断"lite 和 full 是否真无差别"，需要每档跑 3–5 次同一任务、再换 2–3 个任务（尤其是"小而模糊"的请求，让砍需求有发挥空间——本次任务把 5 项需求写死，等于替模型把"要不要砍"这个判断关掉了）。

### 6.4 README 的已知限制仍然成立

- 桌面版横幅"只做了代码层面的推断，没有真机验证"——本次也没验证到，我无法操作 GUI。横幅逻辑（`client.js` 的 `conversation.input.dock` slot + `settings.describe`）只有单测覆盖。
- preset 声明 `complete` 段会整体替换系统提示，此时 ponytail 不生效。本次会话用的是 `standard` preset，所以可见。

### 6.5 一个正面发现

`off` 的显式撤销声明是必要的，而且工作正常：模型逐字读到 `PONYTAIL MODE OFF — disregard ponytail rules from earlier system messages.`，`## Levels` 整段不存在，行为也确实放开了。这条设计经得起实测。

---

## 七、未验证 / 边界

- 每档只跑一次，行为结论是单样本观测，不是统计结论。
- 未在 GUI 里点击横幅按钮、未输入 `/ponytail` 命令实测。测试走的是"直接改 profile 配置"这条路径——它和命令路径共用同一份 settings 文档（`plugin.test.js` 里 4 个用例覆盖命令的写入/校验/失败分支），但没有在界面上真点过一次。
- 未测热重载的最小生效延迟（本次每次固定等 4 秒，全部生效）。
- 未测多 preset、多 profile（web / headless）下的档位隔离，只测了 desktop。
- 子代理被要求"不要读写文件、不要运行命令"，这本身会压低"真实工程行为"的展开程度，但四档条件相同，横向可比。

---

## 八、复现步骤

```powershell
# 1. 单测
cd J:\abu_workspace\claude\ponytail
npm test

# 2. 生成四份注入文本（可直接看差异）
node --input-type=module -e @'
import fs from "node:fs"
import { parseSkillFile } from "./lib/skills.js"
import { buildRules } from "./lib/rules.js"
const body = parseSkillFile(fs.readFileSync("skills/ponytail/SKILL.md","utf8")).content
for (const m of ["off","lite","full","ultra"]) {
  const t = buildRules(m, body)
  console.log(`== ${m}: ${t.length} chars / ${t.split("\n").length} lines`)
  fs.writeFileSync(`rules-${m}.txt`, t)
}
'@

# 3. 切换档位（桌面版跑着的时候改，4 秒内新会话生效）
#    备份 → 改 mode → 起新会话观察首行与行为 → 还原
$f = "C:\Users\19952\.dsh\profiles\desktop\cordis.patch.yml"
Copy-Item $f "$f.bak"
(Get-Content $f -Raw) -replace '(?m)^(\s*mode:\s*)(lite|full|ultra|off)\s*$','${1}lite' | Set-Content -Encoding utf8 $f
# 还原：Copy-Item "$f.bak" $f -Force
```

---

## 九、本次测试对系统做的改动（已全部还原）

| 改动 | 状态 |
|---|---|
| `profiles/desktop/cordis.patch.yml` 的 `mode`（ultra → lite → full → ultra → off） | 已从备份还原，SHA-256 与备份一致，当前 `ultra` |
| 新建的 `profiles/headless`（安装本地插件用于 CLI 测试，后因缺 API key 放弃） | 已整目录删除，`profiles/` 下只剩 `desktop`、`web` |
| 临时文件（patch overlay、注入文本、扫描脚本） | 在 `%TEMP%\ponytail-report`，可随时删 |
| 会话级：本报告的四个子代理会话 | 保留在会话历史中，可复查 |
