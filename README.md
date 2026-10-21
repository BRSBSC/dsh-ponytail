# dsh-ponytail

把 [ponytail](https://github.com/DietrichGebert/ponytail)（"懒惰资深开发者"规则集）做成 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生插件。DSH 桌面版、Web 和 CLI 都能用。

- 每轮自动把 ponytail 规则注入系统提示词，并按当前档位过滤；
- `/ponytail lite|full|ultra|off` 切换档位，档位保存在 DSH 设置里；
- 在 Web 和桌面版的输入框上方显示 ponytail 横幅，文字跟随 DSH 界面语言显示中文或英文；
- 自带 ponytail 的 6 个 skill，可以输入 `/ponytail-review`、`/ponytail-audit` 等直接调用。

需要 DSH `>=0.2.1-rc.2 <0.3.0`。

## 安装

**Web / CLI**（`BRSBSC` 是本仓库的 GitHub 账号）：

```sh
dsh plugin --profile web add github:BRSBSC/dsh-ponytail
```

**桌面版**：先完全退出 DSH Desktop，然后运行：

```sh
dsh plugin --profile desktop add github:BRSBSC/dsh-ponytail
```

再重新打开 Desktop。这里的 `dsh` 必须是 Desktop 自带的那个：在 Desktop 菜单的"管理 dsh 命令…"里安装，或者直接运行安装目录下的 `resources\runtime\cli\bin\dsh.cmd`。npm 全局安装的 `dsh` 不能管理桌面版的 profile，会报错 `profile "desktop" is managed exclusively by the Electron application`。

建议安装时把 commit 写死，例如 `github:BRSBSC/dsh-ponytail#<sha>`，免得后续推送悄悄改变实际运行的代码。

装好后用 `dsh --profile web --dump-config` 检查，输出里应该有 `# == dsh-ponytail` 这一层。

卸载：`dsh plugin --profile web remove dsh-ponytail`。

## 使用

| 命令 | 效果 |
|---|---|
| `/ponytail ultra` | 切到 ultra 档：动手前先指出哪些需求理由不足（都合理就不说），但仍然照做，除非你说不要 |
| `/ponytail lite` | 切到 lite 档：照需求做；有更小的方案时，动手前先用一行说出来、能省什么 |
| `/ponytail full` | 默认档 |
| `/ponytail off` | 关闭。模型会收到一行撤销声明，让它忽略之前的 ponytail 规则；中文回复的要求仍然保留 |
| `/ponytail` | 当前关闭时切回 full；否则显示当前档位 |
| `/ponytail-review` 等 | 调用对应的 skill |

lite 和 ultra 下，如果模型第一步没说那一句就直接调用了工具，插件会在下一步附上一行提醒，让它补上。工具调用之后本来就有下一步，所以不会多发请求。

档位就是本插件的设置项 `mode`，保存在当前 profile 的 `cordis.patch.yml` 里（例如 `$DSH_HOME/profiles/web/cordis.patch.yml`）。因此 web、desktop、CLI 各自保存自己的档位。

## 横幅

在 Web 和桌面版里，输入框上方会显示一行横幅：

- 四个档位按钮"精简 / 完整 / 极致 / 关闭"，当前档位高亮，点击即切换；鼠标悬停在任一按钮上会显示一句说明；
- "审查"和"全库审计"会把 `/ponytail-review ` 或 `/ponytail-audit ` 放到输入框开头，已经写好的文字会保留在命令后面，作为审查范围，回车发送；草稿里有文件或会话引用时不会改动草稿，避免丢失引用；
- 文字跟随 DSH 设置里的界面语言，在中文和英文之间切换；
- 不管是在别的标签页切换，还是输入 `/ponytail` 命令切换，横幅都会自动更新。

CLI/TUI 里不显示横幅。profile 只读时，四个档位按钮会禁用。

## 配置

可以在 profile 的 `cordis.patch.yml` 里覆盖。DSH 的 patch 会整体替换 `config`，所以要把需要的字段都写上：

```yaml
- id: ponytail
  name: dsh-ponytail
  config:
    mode: full            # lite | full | ultra | off，横幅和 /ponytail 也读写这个字段
    sectionOrder: 10150   # 规则段在系统提示词中的排序值
```

如果在 `$DSH_HOME/cordis.patch.yml`（home 级）或 `--patch` overlay 里固定了 `mode`，`/ponytail` 和横幅的切换会被 DSH 拒绝，并显示原因。

## 已知限制

- 自带完整系统提示词的 preset（声明了 `complete` 段的，例如 `minimal`）会替换掉全部提示词段，ponytail 规则在其中不生效。
- skill 优先级：Web 和桌面版里，每个 preset 自己挂载的 skill 来源（包括项目里的 `.dsh/skills`、`.agents/skills`，以及 `~/.dsh/skills`、`~/.agents/skills`）都会覆盖本插件注册的同名 skill。只有在单层组合（例如 TUI）里，本插件才优先于用户目录。
- 浏览器端 `client.js` 手写成 DSH 内部的模块格式（`window.__ModuleLoader__`），DSH 升级后可能需要跟着调整，所以 `engines.dsh` 限定在 `<0.3.0`。
- 横幅只在 Web 版实测过（2026-10-21，无头 Chromium）：渲染、点击切换、`/ponytail` 命令都正常。桌面版用的是同一份 `client.js`，但还没有在桌面版里实际点过。

### 与上游 ponytail 的差异

`skills/` 的主体复制自上游，只改掉了上游宿主专属的说法：

- 规则里的退出方式写成 `/ponytail off`（上游让模型听一句 "stop ponytail"，在 DSH 里切不了档位）。
- help 卡片里的 `/plugin`、`PONYTAIL_DEFAULT_MODE`、`~/.config/ponytail/config.json`、`/ponytail band`、`$ponytail:` 前缀，换成了 DSH 的 `/ponytail`、设置项和重装方式。
- `ponytail` 规则和 help 卡片里 lite、ultra 两档的说明，按 DSH 上的实测结果改写过（见 `docs/reports/2026-10-21-levels-real-test-v3.md`）。ultra 改成"指出理由不足的需求，但仍然照做"：原来的 push back 和 `Never cut: … anything the user asked for` 冲突，模型每次都选择照做。两档的专属动作都要求在调用任何工具或写代码之前完成：模型都记得这条规则，但在长任务里会把它拖到结尾，然后忘掉。两档各带一句示例；没有更小方案、需求也都合理时，就不说这一句，免得小任务里硬编。上游没有"漏说时补一行提醒"这一步，是本插件加的。

6 个 skill 都注册成只能用斜杠命令调用（`modelInvocable: false`）：它们的正文带着同一套规则，让模型自己加载会在 `/ponytail off` 之后把规则带回来。

## 同步上游 skill

`skills/` 复制自 ponytail 5.3.2，上面那几处 DSH 改动是手改的。ponytail 升级后按以下步骤同步，再把这些改动补回去：

```sh
cp -r <ponytail 仓库>/skills/. skills/
rm -f skills/plugin.json   # 那是其他宿主用的清单，DSH 用不到
git diff skills/           # 把退出方式、help 卡片、gain 来源改回 DSH 版本
npm test
```

## 开发

```sh
npm install
npm test
```

## 许可

MIT。`skills/` 下的内容和规则文本 © DietrichGebert（[ponytail](https://github.com/DietrichGebert/ponytail)），适配代码 © brsbsc。见 [LICENSE](LICENSE)。
