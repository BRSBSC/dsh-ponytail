# dsh-ponytail

把 [ponytail](https://github.com/DietrichGebert/ponytail)（"懒惰资深开发者"规则集）做成 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生插件。DSH 桌面版、Web 和 CLI 都能用。

- 每轮自动把 ponytail 规则注入系统提示词，并按当前档位过滤；
- `/ponytail lite|full|ultra|off` 切换档位，重启后不丢；
- 自带 ponytail 的 6 个 skill，可以输入 `/ponytail-review`、`/ponytail-audit` 等直接调用。

需要 DSH `>=0.2.1-rc.2 <0.3.0`。

## 安装

**Web / CLI**（`<owner>` 换成实际托管本仓库的 GitHub 用户名）：

```sh
dsh plugin --profile web add github:<owner>/dsh-ponytail
```

**桌面版**：先完全退出 DSH Desktop，然后运行：

```sh
dsh plugin --profile desktop add github:<owner>/dsh-ponytail
```

再重新打开 Desktop。`dsh` 命令可以在 Desktop 菜单的"管理 dsh 命令…"里安装。

建议安装时把 commit 写死，例如 `github:<owner>/dsh-ponytail#<sha>`，免得后续推送悄悄改变实际运行的代码。

装好后用 `dsh --profile web --dump-config` 检查，输出里应该有 `# == dsh-ponytail` 这一层。

卸载：`dsh plugin --profile web remove dsh-ponytail`。

## 使用

| 命令 | 效果 |
|---|---|
| `/ponytail ultra` | 切到 ultra 档：先质疑需求本身，再动手 |
| `/ponytail lite` | 切到 lite 档：照需求做，但用一行说明更小的方案 |
| `/ponytail full` | 默认档 |
| `/ponytail off` | 关闭，规则不再注入 |
| `/ponytail` | 当前关闭时按默认档位重新开启；否则显示当前档位 |
| `/ponytail-review` 等 | 调用对应的 skill |

档位对整个 DSH 进程全局生效，所有会话共用。持久化文件是 `$DSH_HOME/ponytail-mode`，默认在 `~/.dsh/ponytail-mode`。

启动时按这个顺序决定档位：持久化文件 → 环境变量 `PONYTAIL_DEFAULT_MODE` → 配置项 `defaultMode`。

## 配置

可以在 profile 的 `cordis.patch.yml` 里覆盖。DSH 的 patch 会整体替换 `config`，所以要把需要的字段都写上：

```yaml
- id: ponytail
  config:
    defaultMode: full     # lite | full | ultra | off
    sectionOrder: 10150   # 规则段在系统提示词中的排序值
```

## 已知限制

- 自带完整系统提示词的 preset（声明了 `complete` 段的，例如 `minimal`）会替换掉全部提示词段，ponytail 规则在其中不生效。
- skill 的优先级：项目里的 `.dsh/skills`、`.agents/skills` 下的同名 skill 会覆盖本插件的；本插件又会覆盖 `~/.dsh/skills`、`~/.agents/skills` 下的同名 skill。

## 同步上游 skill

`skills/` 是从 ponytail 5.3.2 原样复制来的。ponytail 升级后按以下步骤同步：

```sh
cp -r <ponytail 仓库>/skills/. skills/
rm -f skills/plugin.json   # 那是其他宿主用的清单，DSH 用不到
npm test
```

## 开发

```sh
npm install
npm test
```

## 许可

MIT。`skills/` 下的内容和规则文本 © DietrichGebert（[ponytail](https://github.com/DietrichGebert/ponytail)），适配代码 © brsbsc。见 [LICENSE](LICENSE)。
