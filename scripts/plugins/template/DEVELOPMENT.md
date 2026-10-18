# Tau 插件开发指南

用 TypeScript 和 React 为 Tau 桌面端开发插件。模板自带一个可运行的计数器，演示命令、页面、侧边栏入口、设置和数据保存，可以在它的基础上改出自己的插件。

## 准备

- Node.js 22 或更高版本
- pnpm 11.9.0
- Tau 桌面客户端 0.59.0 或更高版本

## 跑通示例

在 GitHub 点击 **Use this template** 创建自己的仓库，克隆后在项目目录执行：

```sh
pnpm install
pnpm build
pnpm install:local
```

打开 Tau 的插件管理，点击「刷新列表」，启用「计数器示例」。然后点击侧边栏「日常」分组下的「计数器」，或按 Ctrl+K 执行「打开计数器」，点「增加并保存」。重启客户端后再打开，计数仍然保留。

## 改成自己的插件

1. 修改 `manifest.json` 的 `id`、`name`、`version`、`description`。`id` 用你自己的唯一名称，例如 `yourname.counter`。
2. 修改 `package.json` 的项目名称和版本。
3. 在 `src/index.tsx` 中实现功能，在 `src/styles.css` 中编写样式。
4. 把 `README.md` 改成给用户看的介绍和使用步骤；需要版本记录时再加 `CHANGELOG.md`。
5. 执行 `pnpm build`，按下文的方法安装到 Tau 中测试。

| 文件                              | 用途                                                 |
| --------------------------------- | ---------------------------------------------------- |
| `manifest.json`                   | 插件身份、版本和最低客户端版本                       |
| `README.md` / `CHANGELOG.md`      | 随插件包发布，显示在插件详情的「说明」和「更新日志」 |
| `src/index.tsx`                   | 插件入口，以及示例页面、设置与命令                   |
| `src/styles.css`                  | 插件样式                                             |
| `src/CounterIcon.tsx`             | 侧边栏 SVG 图标示例，使用 currentColor 跟随主题      |
| `API.md`                          | 命令、页面、侧边栏、设置、存储、网络等接口           |
| `EDITOR.md`                       | 在文档中添加自定义块、源码预览块和插件 Skill         |
| `AI.md`                           | AI 功能声明、用户模型分配、流式对话和统一用量审计    |
| `MCP.md`                          | 注册多个 MCP，复用应用的工具开关和服务器管理         |
| `SERVICES.md`                     | Tailwind、Typst、Markdown、TikZ、FFmpeg 编译转换服务 |
| `AGENTS.md`                       | 给 AI 编程助手的项目指引                             |
| `build.mjs` / `install-local.mjs` | 打包与本地安装脚本，日常开发通常不需要修改           |

插件详情页的名称、简介和版本取自 `manifest.json`，介绍取自 `README.md`，无需在网站上另外填写。`API.md`、`AGENTS.md` 等开发文档不会打进插件包。

## 打包与安装

`pnpm build` 先检查类型，再生成 `dist/<id>-<version>.zip`。这个 ZIP 就是完整的插件包，分享时不需要附带源码或 node_modules。

**首次安装**：`pnpm install:local` 把 ZIP 解压到 `~/.editor/plugins/<id>/`。也可以手动解压，最终结构应为：

```text
~/.editor/plugins/yourname.counter/
  manifest.json
  main.js
  main.css       # 使用 CSS 时生成
```

**更新**：提高 `manifest.json` 的 `version` 并重新构建，在 Tau 插件管理中选择「安装或更新 ZIP」。新版本在下次完全退出并重新启动后生效，生效前可以「取消待更新」；新版本启用失败时可以「恢复上一版」。恢复只换回代码，不回退已保存的数据，所以存储结构变化时要让新旧版本都能读懂。

`pnpm install:local` 只用于首次安装，目标目录已存在时会拒绝覆盖。插件 ID 不变，已保存的数据就会保留；改了 ID 会被当作另一个插件。

## 自动发布到 GitHub Release

模板内置 `.github/workflows/release.yml`。将版本 tag 推送到 GitHub 后，Actions 会冻结安装 pnpm 依赖、运行项目的 test 脚本（若已定义）、执行构建，再把 `dist/<id>-<version>.zip` 上传到对应 Release。

先同步修改 `manifest.json` 和 `package.json` 的版本并提交，再打 tag：

```sh
git add manifest.json package.json
git commit -m "chore: release 1.1.0"
git tag v1.1.0
git push origin HEAD
git push origin v1.1.0
```

tag 支持 `v1.1.0` 或 `1.1.0`，必须与两个文件的版本一致，否则发布失败。`v1.1.0-beta.1` 等预发布版本会自动标为 Pre-release。只在本机打 tag 不触发，必须推送到 GitHub。

无需配置额外密钥，工作流使用仓库自带的 GITHUB_TOKEN。仓库需启用 Actions，并允许工作流申请 contents:write 权限。发布结果和失败日志在 Actions 页面查看；修复临时错误后可重新运行失败任务，已有 Release 会更新同名 ZIP。代码修复应提高版本并发布新 tag，不移动已发布的版本 tag。

从旧模板创建的仓库不会自动获得新文件，需要同步该 workflow。此流程发布 GitHub Release，不会自动提交插件中心审核或发布 npm 包。

## 常用命令

| 命令                 | 用途                   |
| -------------------- | ---------------------- |
| `pnpm check`         | 检查 TypeScript 类型   |
| `pnpm build`         | 检查类型并生成 ZIP     |
| `pnpm install:local` | 首次安装最近构建的 ZIP |

## 排错

- **列表里没有插件**：点「刷新列表」，确认解压后没有多套一层目录，再看插件管理里的错误提示。
- **提示目标已存在**：改用客户端的「安装或更新 ZIP」，并提高插件版本。
- **修改没有生效**：重新构建并安装，然后刷新列表并启用。
- **启用失败**：查看错误提示，检查 `activate` 是否抛出异常；客户端提示需要重启时先重启再启用。
- **类型检查通过但功能异常**：类型检查不能代替实际测试，至少在 Tau 中试一遍启用、执行命令、保存数据、停用和重启。

本模板采用 [MIT 许可](LICENSE)。
