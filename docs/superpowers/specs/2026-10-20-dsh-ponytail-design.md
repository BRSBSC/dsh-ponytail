# dsh-ponytail 设计

日期：2026-10-20
状态：待审

## 目标

把 [ponytail](https://github.com/DietrichGebert/ponytail)（"懒惰资深开发者"规则集）做成 DeepSeek Harness（DSH）的原生插件，让 DSH 桌面版、Web 和 CLI 装上后：

- 每轮自动注入 ponytail 规则，按当前档位过滤；
- 用 `/ponytail lite|full|ultra|off` 切换档位，重启后档位不丢；
- ponytail 的 6 个 skill 可以用，并且能以 `/ponytail-review` 等方式调用。

**成功标准**：在 DSH 中用 `dsh plugin add github:<owner>/<repo>` 安装后新开会话，模型收到 ponytail 规则；`/ponytail off` 之后规则消失，`/ponytail ultra` 之后切换为 ultra 档。

## 约束

- 这是独立的新包，不放进 ponytail 上游仓库；ponytail 的 skill 文件复制进本包，并保留 MIT LICENSE。
- 发布在 GitHub 上，用户直接从 GitHub 安装。因此要用纯 ESM JavaScript，不需要构建步骤，也不需要 `prepare` 脚本，用户就不必为 pnpm 配置 `allowBuilds` 授权。
- 运行时依赖只用 DSH 宿主已有的包，按 DSH 约定声明为 `peerDependencies`。

## 不做

- 状态栏或横幅。
- 读取 ponytail 自己的 `~/.config/ponytail/config.json`：DSH 用插件的 `defaultMode` 配置项代替。
- 自动从上游同步 skill：在 README 里写明手动同步的步骤。
- 按会话保存档位：档位对整个 DSH 进程全局生效，与 ponytail 的 OpenCode 适配器一致。

## 方案选择

| 方案 | 结论 |
|---|---|
| 原生 Cordis 插件，调用 `systemPrompt`、`commands`、`skills` 服务 | **采用**。三端通用，能力完整 |
| 纯配置包，通过 patch 设置 `customSkillDirs` 和 `personaSuffix` | 否决：patch 会整行替换配置，冲掉用户设置；也无法切换档位 |
| 用 DSH 的 Claude Code 兼容桥复用 ponytail 原有 hook | 否决：桥接包还在实验或 alpha 阶段，需要用户额外启用 |

## 结构

包根目录就是本仓库根目录：

```
package.json        # name: dsh-ponytail；dsh.bundle.patch；engines.dsh；peerDependencies
cordis.patch.yml    # - insert: [{ id: ponytail, name: dsh-ponytail }]
index.js            # 插件本体，函数形式：name / Config / apply
skills/             # 从 ponytail 5.3.2 原样复制的 6 个 <name>/SKILL.md
LICENSE             # MIT，同时保留 ponytail 原作者的版权声明
README.md           # 安装、使用、同步 skill 的步骤
test/index.test.js  # node:test 单元测试
```

## 组件与行为

### 1. 规则注入

- `apply` 里注册一个系统提示词段：`ctx.systemPrompt.section({ name: 'ponytail', order, text })`，其中 `text` 每一轮按当前档位求值。
- 文本来自 `skills/ponytail/SKILL.md`：先去掉 frontmatter，再按档位过滤，只保留当前档位的表格行和示例行。过滤逻辑移植自 ponytail 的 `filterSkillBodyForMode`。文本开头加一行 `PONYTAIL MODE ACTIVE — level: <mode>`。
- 档位为 `off` 时返回空字符串。DSH 会自动去掉空段。
- `order` 放在 DSH 第一方段落之后、部署 persona 后缀（10200）之前，取 10150。具体数值写成配置项 `sectionOrder`，遵守 DSH "可调参数不写死"的约定。

### 2. 档位状态

- 档位只有四个合法值：`lite | full | ultra | off`。
- 启动时按这个顺序取档位：持久化文件 `$DSH_HOME/ponytail-mode`（`DSH_HOME` 为空时用 `~/.dsh`）→ 环境变量 `PONYTAIL_DEFAULT_MODE` → 配置项 `defaultMode`（默认 `full`）。非法值直接跳过，继续往下取。
- 档位保存在插件内存里，规则注入时读内存，所以切换后下一轮立即生效；同时写入持久化文件。写文件失败时只记日志，不让命令失败，因为当前进程内的切换已经生效。

### 3. `/ponytail` 命令

- 通过 `ctx.get('commands')` 按需获取命令服务；没有这个服务时（headless 或 ACP 环境）跳过注册，插件照常加载。
- 注册 `/ponytail`，输入提示为 `[lite|full|ultra|off]`：
  - 带合法参数：切换到该档位，返回 `success`，文本形如 `ponytail ultra`。
  - 不带参数：当前档位是 `off` 时，切换到默认档位（默认档位本身是 `off` 时用 `full`）；否则保持不变，并返回当前档位。
  - 非法参数：返回 `error`，列出合法值，档位不变。
- 命令本身不产生模型消息，这是 DSH 命令的固有行为。

### 4. Skills

- 通过 `ctx.get('skills')` 按需获取 skill 服务；没有就跳过。
- 启动时读取 `skills/*/SKILL.md`，解析 frontmatter 中的 `name` 和 `description`，正文作为 skill 内容，逐个调用 `ctx.skills.register(...)` 注册。
- 6 个 skill 都设为模型和用户均可调用，DSH 会自动提供 `/ponytail-review` 这类调用方式。`/ponytail` 和 skill `ponytail` 同名时，按 DSH 规则命令优先，即 `/ponytail` 走切换档位。
- 某个 SKILL.md 解析失败时，跳过这一个并记日志，其余照常注册。

### 5. 配置（Schemastery）

| 字段 | 默认值 | 含义 |
|---|---|---|
| `defaultMode` | `full` | 没有持久化档位、也没有环境变量时使用的档位 |
| `sectionOrder` | `10150` | 规则段在系统提示词中的排序值 |

## 错误处理

| 情况 | 行为 |
|---|---|
| `skills/ponytail/SKILL.md` 读不到 | 规则段改用内置的精简规则，内容与 ponytail `AGENTS.md` 一致，不能出现空规则 |
| 持久化文件读写失败 | 读失败时按顺序取下一个来源；写失败时记日志，进程内切换照常生效 |
| `commands` 或 `skills` 服务不存在 | 跳过对应功能，规则注入不受影响 |
| 配置非法 | 加载时由 schema 报错，这是 DSH 惯例 |

## 测试

用 `node --test` 跑，伪造一个包含 `systemPrompt`、`commands`、`skills`、`get` 的 `ctx`，把 `DSH_HOME` 指向临时目录：

1. 档位过滤：`lite`、`full`、`ultra` 各自只保留本档位的表格行和示例行，普通规则行全部保留。
2. `off` 档位时规则段文本为空。
3. `/ponytail ultra` 之后段文本变为 ultra 档，持久化文件内容为 `ultra`；重新 `apply` 后读回 `ultra`。
4. 不带参数和非法参数这两种情况，行为符合第 3 节的描述。
5. 6 个 skill 都完成注册，`name` 和 `description` 与 frontmatter 一致。
6. 没有 `commands` 和 `skills` 服务时，`apply` 不抛错，规则段照常注册。

真机冒烟（实施时先征得用户同意）：用 `npx @deepseek-ai/dsh` 启动 DSH（当前最新 `dsh-v0.2.1-rc.2`），执行 `dsh plugin --profile <临时 profile> add ./`，再用 `--dump-config` 确认配置层已加载；然后在 Web 端新开会话，验证规则生效和档位切换。

## 待实施时确认

以下是 API 细节，在实施计划阶段读 DSH 源码确认，不影响上面的设计：

- `systemPrompt.section` 的 `text` 按上下文求值时的确切函数签名；
- `skills.register` 的入参形状；
- `engines.dsh` 的具体范围，按实施时的 DSH 版本确定。
