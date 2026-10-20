# Tau 插件开发指南

用 TypeScript 和 React 为 Tau 桌面端开发插件。模板自带一个可运行的计数器，演示命令、页面、侧边栏入口、设置和数据保存，可以在它的基础上改出自己的插件。

## 准备

- Node.js 22 或更高版本
- pnpm 11.9.0
- Tau 桌面客户端 0.59.0 或更高版本

模板锁定公开 SDK `@xiongtao.xt/tau-plugins@0.27.0` 和 UI `@xiongtao.xt/tau-ui@0.1.1`，通过 npm 别名安装为 `@tau/plugins`、`@tau/ui`。SDK 提供类型契约，运行实现由 Tau 注入；新领域能力还需包含相应实现的客户端构建，不能只依据客户端版本号判断。

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
   - `categories` 决定插件在插件中心出现在哪些分类下，可多选，也可不填：`sync` 同步、`upload` 资源上传、`editor` 编辑器、`whiteboard` 白板、`blog-template` 博客模板、`blog-publish` 博客发布、`ai` AI（Skill、MCP、聊天工具渲染、AI 功能、图片）、`voice` 语音、`video` 在线视频、`page` 页面（页面与侧边栏入口）。只提供命令或设置的插件可以不填。
   - `keywords` 最多 5 个、每个不超过 20 字，只用于插件中心搜索，例如 S3 插件可写 `MinIO`、`R2`。
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
| `MCP.md`                          | 注册 MCP、聊天工具渲染，复用工具开关与服务器管理     |
| `BACKEND.md`                      | 显式声明本机后台、启动策略与独立产物构建             |
| `FLASHCARDS.md`                   | 闪卡读写权限、宿主制卡窗口、插件 AI 与正文来源引用   |
| `WHITEBOARD.md`                   | 静态白板扩展、工具与发布边界                         |
| `SYNC.md`                         | 同步存储提供方、配置视图与取消                       |
| `UPLOAD.md`                       | 图片与附件上传、上传提供方与配置                     |
| `TTS.md`                          | 语音合成、音色复刻与多账号配置                       |
| `IMAGES.md`                       | 图片生成、参考图编辑与插件账号配置视图               |
| `VIDEO.md`                        | 视频来源的链接解析、播放源与账号配置视图             |
| `PUBLISH.md`                      | 博客发布提供方、文件上传与 Git 快照                  |
| `PUBLISH-DATA.md`                 | 独立站点读取发布数据与公开子入口的构建边界           |
| `SERVICES.md`                     | Tailwind、Markdown、FFmpeg 编译转换服务              |
| `AGENTS.md`                       | 给 AI 编程助手的项目指引                             |
| `build.mjs` / `install-local.mjs` | 打包与本地安装脚本，日常开发通常不需要修改           |

插件详情页的名称、简介和版本取自 `manifest.json`，介绍取自 `README.md`，无需在网站上另外填写。`API.md`、`AGENTS.md` 等开发文档不会打进插件包。

## 升级 SDK 与同步旧模板

GitHub 模板创建的仓库不会自动跟随模板更新。已有项目先提交或备份自己的改动，再按需同步 [上游模板](https://github.com/LastKnightCoder/tau-plugin-template) 的构建脚本、开发文档和 `.github/workflows/release.yml`，保留自己的插件 ID、入口、用户说明与版本记录。

先在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 中增加新 SDK 的精确例外 `@xiongtao.xt/tau-plugins@0.27.0`，暂时保留旧锁文件所需的已核实例外，再更新依赖及锁文件：

```sh
pnpm add @tau/plugins@npm:@xiongtao.xt/tau-plugins@0.27.0 --save-exact
pnpm install --frozen-lockfile
pnpm build
```

成功后移除已不再使用的旧版例外，再运行一次 `pnpm install --frozen-lockfile`，提交 `package.json`、`pnpm-lock.yaml` 和 `pnpm-workspace.yaml`。先移除旧版例外会使 pnpm 在读取旧锁文件时拒绝升级。发布等待例外只针对已核实的 SDK/UI 版本，不关闭全部依赖的供应链策略；保留 `allowBuilds.esbuild: true`。React 继续使用模板锁定的版本，避免和宿主的共享实例不兼容。

从旧 SDK 升级时，重点核对：

| 版本          | 变化与对应文档                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| 0.17.0        | 行内源码接口，见 EDITOR.md                                                                             |
| 0.18.0        | 图片生成与编辑提供方，见 IMAGES.md                                                                     |
| 0.19.0–0.20.0 | 发布数据子入口、站点级数据归清单、分类与关键词，见 PUBLISH-DATA.md 与 API.md                           |
| 0.21.0        | 博客发布提供方、配置与 Git 快照服务，见 PUBLISH.md                                                     |
| 0.22.0        | 视频提供方与视频页面信息查询，见 VIDEO.md                                                              |
| 0.23.0        | 删除 `ffmpeg.probe` 与 `MediaInfo`；`ffmpeg.run` 保留，见 SERVICES.md                                  |
| 0.24.0        | 删除 `services.typst`；Typst 编译由独立插件实现，见 SERVICES.md                                        |
| 0.25.0        | 数据读写与权限、正文组件、插件实体、宿主动作、存储随库同步，见 API.md；本机后台双入口见 BACKEND.md     |
| 0.26.0        | 闪卡创建、读写授权、插件 AI 制卡与 contentRef 来源引用，见 FLASHCARDS.md                               |
| 0.27.0        | 通用 requestCapability 开放全部内置大模型功能分配，分别以 ai:<能力名> 授权；闪卡复用同一机制，见 AI.md |

更早版本的完整变更见已安装包的 `node_modules/@tau/plugins/CHANGELOG.md`。需要本地媒体元数据时自行实现，不能把视频页面解析当作本地文件探测。SDK 根入口、白板/同步契约、UI 和 React 由 Tau 提供，保持模板的 external 配置；普通第三方库由构建打入 ZIP。独立站点数据子入口的用途另见 PUBLISH-DATA.md。

构建通过后，在对应客户端验证启用、功能执行、保存、停用与重启；涉及静态编辑器或白板扩展时也验证重启后的贡献，以及发布内容的回退。构建成功只证明类型和打包通过。

## 打包与安装

`pnpm build` 先检查类型，再生成 `dist/<id>-<version>.zip`。这个 ZIP 就是完整的插件包，分享时不需要附带源码或 node_modules。

**开发调试首次安装**：`pnpm install:local` 把 ZIP 解压到 `~/.editor/plugins/<id>/`。正式用户从插件中心安装；作者也可以手动解压调试，最终结构应为：

```text
~/.editor/plugins/yourname.counter/
  manifest.json
  main.js
  main.css       # 使用 CSS 时生成
```

**更新**：提高 `manifest.json` 的 `version` 并重新构建，正式版本提交插件中心审核后由用户更新；开发版客户端可从插件页的 ZIP 入口调试。新版本在下次完全退出并重新启动后生效，生效前可以「取消待更新」；新版本启用失败时可以「恢复上一版」。恢复只换回代码，不回退已保存的数据，所以存储结构变化时要让新旧版本都能读懂。

`pnpm install:local` 只用于首次安装，目标目录已存在时会拒绝覆盖。插件 ID 不变，已保存的数据就会保留；改了 ID 会被当作另一个插件。

## 写更新日志

`CHANGELOG.md` 显示在插件详情的「更新日志」里，发布时也会作为 GitHub Release 的说明，读者是使用插件的人，不是开发者。

- 每个版本以 `## 1.2.0` 开头，下面逐条写；发布时取与 tag 版本相同的小节，找不到时才用 GitHub 自动生成的提交列表。
- 写用户能感知的变化：新增了什么能力、修好了什么问题、升级后要注意什么。用界面上的叫法，比如「设置 → 同步」。
- 不写 SDK 版本、构建方式、仓库迁移、测试或内部字段。确实没有可感知的变化，就写「维护更新，使用上没有变化」。

```markdown
## 1.2.0

- 书架可以按「有笔记」筛选了。
- 修复同步中途断网后，部分划线不显示的问题。
```

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

Release 的说明取自 `CHANGELOG.md` 中对应版本的小节。Release 发布后，工作流会把同一个 ZIP 提交到插件中心：用 GitHub Actions 的短期身份令牌证明发布来自哪个仓库，不需要配置任何密钥。

- **首次发布**仍需在 [插件中心](https://plugins.taunote.app) 网页上传并提交一次，用来把插件 ID 绑定到你的仓库。未绑定时这一步只给出提醒，不让工作流失败。
- **之后每次推送 tag**，新版本自动进入审核队列，不用再打开网页；插件 ID 只接受来自已绑定仓库的提交，fork 无法冒充。
- 预发布版本（如 `v1.1.0-beta.1`）只发 GitHub Release，不提交插件中心。
- 同一 tag 重跑是安全的；同一版本号换了内容会被拒绝，需要提高版本号。

从旧模板创建的仓库不会自动获得新文件，需要同步该 workflow（包括 `id-token: write` 权限）。此流程不发布 npm 包。

## 常用命令

| 命令                 | 用途                   |
| -------------------- | ---------------------- |
| `pnpm check`         | 检查 TypeScript 类型   |
| `pnpm build`         | 检查类型并生成 ZIP     |
| `pnpm install:local` | 首次安装最近构建的 ZIP |

## 排错

- **列表里没有插件**：点「刷新列表」，确认解压后没有多套一层目录，再看插件管理里的错误提示。
- **提示目标已存在**：提高插件版本后，在开发版客户端使用 ZIP 更新；正式用户使用插件中心更新。
- **修改没有生效**：重新构建并安装，然后刷新列表并启用。
- **启用失败**：查看错误提示，检查 `activate` 是否抛出异常；客户端提示需要重启时先重启再启用。
- **类型检查通过但功能异常**：类型检查不能代替实际测试，至少在 Tau 中试一遍启用、执行命令、保存数据、停用和重启。

本模板采用 [MIT 许可](LICENSE)。
