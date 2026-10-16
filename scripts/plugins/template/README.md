# Tau 插件模板

使用 TypeScript 和 React 开发 Tau 桌面插件。模板包含一个可运行的计数器，演示命令、页面、设置和数据保存。

## 开始

准备 Node.js 22+、pnpm 11.9.0，以及在设置中提供“插件管理”的 Tau 桌面客户端。

在 GitHub 点击 **Use this template** 创建自己的仓库，克隆后进入项目目录：

```sh
pnpm install
pnpm build
pnpm install:local
```

打开 Tau 的插件管理，点击“刷新列表”，启用“独立计数插件”。点击侧边栏“日常”分组下的“独立计数”，或通过 Ctrl+K 执行“打开独立计数插件”，点击“增加并保存”。重启客户端后，插件会恢复启用和侧边栏入口；在同一工作区打开页面，计数仍然保留。此模板需要支持插件侧边栏的 Tau 客户端；旧客户端请先更新。

## 编写自己的插件

1. 修改 `manifest.json` 的 `id`、`name`、`version`。ID 使用你自己的唯一名称，例如 `yourname.counter`；不要与其他插件重复。
2. 修改 `package.json` 的项目名称和版本。
3. 在 `src/index.tsx` 中实现功能，在 `src/styles.css` 中编写样式。
4. 执行 `pnpm build`，按下面的更新步骤重新安装并验收。

| 文件                              | 用途                                             |
| --------------------------------- | ------------------------------------------------ |
| `manifest.json`                   | 插件身份与版本                                   |
| `src/index.tsx`                   | 插件入口，以及示例页面、设置与命令               |
| `src/styles.css`                  | 插件样式                                         |
| `API.md`                          | API 参数、返回值、示例与使用约束                 |
| `AGENTS.md`                       | AI 编程助手的项目指引                            |
| `build.mjs` / `install-local.mjs` | 已配置的打包与本地安装工具，日常开发通常无需修改 |

入口使用 `definePlugin`，元信息从 manifest 自动获得。完整接口见 [API 文档](API.md)，可直接对照示例修改。开发时保持模板中 React 和 SDK 的依赖版本，插件需要在 Tau 中运行和测试。

## 打包与安装

`pnpm build` 先检查类型，再生成 `dist/<id>-<version>.zip`。这个 ZIP 就是可分发的插件包，分享时无需附带源码或 node_modules。

`pnpm install:local` 把 ZIP 安装到 `~/.editor/plugins/<id>/`。也可以手动解压到 `~/.editor/plugins/`；确认最终结构为：

```text
~/.editor/plugins/yourname.counter/
  manifest.json
  main.js
  main.css       # 使用 CSS 时生成
```

更新已有插件时：先在 Tau 中停用，将旧插件目录移到插件目录之外备份，运行 `pnpm install:local`，再刷新列表并启用。安装工具拒绝覆盖已有目录。保持插件 ID 不变，同一工作区的已保存数据会保留；修改 ID 会被视为新插件。

## 开发命令与排错

| 命令                 | 用途                       |
| -------------------- | -------------------------- |
| `pnpm check`         | 检查 TypeScript 类型       |
| `pnpm build`         | 检查类型并生成 ZIP         |
| `pnpm install:local` | 安装最近构建的当前版本 ZIP |

- **列表里没有插件**：刷新列表，确认没有多套一层解压目录，并查看插件管理中的错误提示。
- **提示目标已存在**：先停用并备份旧目录，再安装；不要直接覆盖运行中的插件。
- **修改没有生效**：重新构建和安装，然后刷新并启用。
- **启用失败**：查看错误提示，检查 `activate` 中是否抛出异常；定位后重新构建。若客户端提示需要重启，先重启再启用。
- **类型检查通过但功能异常**：类型检查不能替代客户端测试。至少验证启用、命令执行、保存数据、停用和重启恢复。

本模板采用 [MIT 许可](LICENSE)。
