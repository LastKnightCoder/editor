# Skill

Skill 是给 Tau 的 AI 助手看的使用说明：什么时候该做什么、按什么步骤做，必要时还可以附带参考资料和脚本。Tau 的 Skill 使用通用的 Agent Skills 目录格式，和 Claude Code、Codex 等工具里的 Skill 是同一种东西。

你可以用两种方式分发 Skill：

| 方式                                | 适合                                             | 用户看到的                       |
| ----------------------------------- | ------------------------------------------------ | -------------------------------- |
| [随插件附带](#随插件附带)           | 插件提供了块、工具或页面，需要教 AI 怎么配合使用 | Skill 随插件启用出现，停用后消失 |
| [独立的 Skill 包](#独立的-skill-包) | 一套写作规范、工作流程等，不需要任何插件代码     | 从插件中心安装后，Skill 直接可用 |

两种方式的 Skill 目录写法完全相同。

## 一个 Skill 目录

```text
skills/
  chart-authoring/
    SKILL.md            # 必需：说明正文
    references/         # 可选：参考资料，AI 需要时再读
      chart-types.md
    scripts/            # 可选：AI 可以执行的脚本
      validate.py
```

- `skills/` 下的每个子目录是一个 Skill，目录名就是 Skill 的 ID，只能使用字母、数字、点、横线和下划线。
- 一个包最多 32 个 Skill。
- 目录里的文件会原样打进插件包。以 `.` 开头的文件、`node_modules` 和 `__pycache__` 会被忽略；不能包含符号链接。

### SKILL.md

```markdown
---
name: 图表写作
description: 用户要在文档里插入或修改图表块时加载，说明图表块的数据格式和常见写法
---

# 图表写作

## 什么时候用

……

## 步骤

1. ……
```

开头的 front matter 决定 Skill 在 Tau 中如何显示和调用：

| 字段                       | 说明                                                           |
| -------------------------- | -------------------------------------------------------------- |
| `name`                     | 可选。Skill 页显示的名称，省略时使用目录名                     |
| `description`              | 必需。AI 根据它判断什么时候加载这份 Skill                      |
| `disable-model-invocation` | 可选。为 `true` 时 AI 不会自动加载，只在用户用 `$` 点名时使用  |
| `allowed-tools`            | 可选。与 Claude Code 的同名字段一致，列出 Skill 建议使用的工具 |

缺少 `description` 时构建会失败，插件中心也会拒绝提交。

### 附带文件与脚本

- **参考资料**：AI 加载 Skill 后，可以按需读取目录里的其他文件。在 SKILL.md 里写清楚什么情况下该读哪个文件，比把所有内容塞进 SKILL.md 更省上下文。
- **脚本**：AI 可以执行目录里的脚本，工作目录就是这个 Skill 目录。按扩展名选择解释器：`.py` 用 python3，`.js`、`.mjs`、`.cjs` 用 Node.js，`.sh` 用 bash，`.ts` 用 tsx；其他文件需要有可执行权限。
- 每次执行脚本前，Tau 都会请用户确认。单次执行最长 120 秒，输出最多保留 64 KiB。
- 脚本以用户身份运行，没有沙箱。Tau 不会替用户安装 Python 等运行环境，需要时在 README 里写清楚。
- **带脚本的版本需要插件中心人工审核**（包括 `scripts/` 下的任何文件，以及目录里的 `.js`、`.mjs`、`.cjs`、`.ts`、`.py`、`.sh` 文件），不能通过自动发布直接上架。只含文档的 Skill 不受此限制。

## 随插件附带

在插件项目根目录建一个 `skills/` 目录，放进你的 Skill，然后照常 `pnpm build`：

```text
my-plugin/
  manifest.json
  src/index.tsx
  skills/
    chart-authoring/
      SKILL.md
```

构建脚本会把 `skills/` 下的每个目录打进插件包，并在打包后的 manifest 中自动写入 `skills` 字段和文件摘要，你不需要改 manifest 或插件代码。

- 插件启用后，Skill 出现在 Tau 的 Skill 页，标注「插件 · 插件名」；插件停用后自动消失。
- 用户可以在 Skill 页调整它的调用方式（自动、仅手动、停用），或者复制一份到自己的 Skill 目录修改。
- AI 引用它时使用 `插件ID:目录名`，例如 `yourname.chart:chart-authoring`。
- 你的插件提供了 [MCP 工具](mcp.md)时，可以在 SKILL.md 里说明什么时候调用哪个工具、参数怎么填。

## 独立的 Skill 包

不需要任何插件代码时，把 Skill 单独做成一个包。用插件模板创建项目，删掉 `src/` 目录，把 `manifest.json` 改成：

```json
{
  "formatVersion": 1,
  "id": "yourname.writing-style",
  "name": "写作风格",
  "description": "让 AI 按统一的风格写文章和卡片。",
  "categories": ["skill"],
  "keywords": ["写作", "风格"],
  "version": "1.0.0",
  "minAppVersion": "0.59.0",
  "apiVersion": 1,
  "platform": "desktop"
}
```

和代码插件相比，Skill 包**没有** `main`、`format`，也不能声明 `permissions`、`backend`、`editor`、`whiteboard`。构建脚本看到 manifest 里没有 `main`，就会跳过代码打包，只打包 `skills/` 目录。

```text
writing-style/
  manifest.json
  README.md
  skills/
    writing-style/
      SKILL.md
```

- `pnpm build` 和 `pnpm install:local` 的用法与代码插件相同。安装后在插件页点「重新扫描」，Skill 就会出现在 Skill 页，标注「Skill 包 · 包名」。
- Skill 包不参与插件启停，用户在 Skill 页逐个调整调用方式或停用。
- 发布流程与代码插件完全相同，见[发布与更新](release.md)。分类建议填 `skill`。
- README 照样是给用户看的：这套 Skill 能让 AI 做什么，用户怎么点名使用。

## 写好一份 Skill

- **`description` 决定 AI 会不会在合适的时候用它**。写"在什么情况下加载"，而不是"这份文档是什么"。例如"用户要求生成周报时加载"，而不是"周报指南"。
- **正文写给 AI 看**：什么时候用、具体步骤、参数含义、正确与错误的例子。
- **只写与这件事相关的内容**。通用的写作建议对 AI 没有帮助，反而占用上下文。
- **大段参考资料放进单独的文件**，在 SKILL.md 中说明何时读取。
- **脚本要能独立运行**：参数通过命令行传入，结果打印到标准输出，失败时以非 0 退出码结束，并输出可读的错误信息。
