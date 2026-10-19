# HTML 行内与块级扩展插件化

## 任务

- COMPLETE：Investigate/Triage/Understand the problem。确认行内编辑需要补齐公开通用 API；发布与静态导出统一消费 styleSources，不能只迁 UI。
- COMPLETE：补齐通用行内源码 SDK 与静态样式导出接线，建立独立 HTML 插件。SDK 89 项、插件 8 项测试通过，公开 npm 0.17.0 已校验与本地产物一致。
- COMPLETE：迁出两类 HTML 节点，删除内置包与直接依赖，补齐缺包及宿主回归。桌面接线/浮层/发布 33 项、真实 codec/导出 4 项、博客 6 项、移动端与扩展各 7 项测试通过。
- COMPLETE：完成 GitHub Release、正式下载包及干净克隆验收。四端类型检查和生产构建、正式 ZIP 的四阶段 Electron 验证通过，结果随代码保留在 codex/html-plugin 分支，后续由用户进行视觉验收和产品发布。

## 边界

从本地 master 的 ABC 拆分提交创建新的 codex/html-plugin worktree。HTML 行内与块级节点归同一个独立插件，保留 html-block/html-inline、html、openEdit 和 children。客户端仍为 0.59.0，不修改原工作区的未提交内容。

## 实现与消费者

- 独立仓库为 [tau-plugin-html](https://github.com/LastKnightCoder/tau-plugin-html)，一个 tau.html 定义同时提供 html-block 与 html-inline、原生 HTML Markdown codec、源码编辑、插入二级菜单、Tailwind styleSources 和 HTML serializer。
- 删除 editor-extensions/html 整包、四端 Kit/codec 装配、依赖和 Tailwind 扫描入口；宿主接线与浮层测试显式加载真实插件夹具。移动端/扩展不加载插件，两类旧节点按未知节点保护保留，原生 HTML 输入作为文本保留。
- SDK 0.17.0 新增独立 useInlineSource、insertInlineSource、InlineSourceBoundary，运行时复用宿主 Slate 与提交守卫。行内只读/openEdit 不写库，空白确认删除，普通 Enter 与 Esc 确认，组合输入期间不提交。
- 块级仍复用 SourceBlockEditor；不改变 useSourceBlock 或 EditorKit 的职责，不将 Slate 或主项目私有路径打入插件。
- 博客发布按现有 pluginCatalog.styleSources 收集样式，删除 HTML 类型特判；静态导出也按通用 styleSources 编译并收集 CSS。插件缺失时以 pre/code 保留转义源码。
- 协作字段映射、字数、CLI、复习合并、标题文字提取及插件 README 过滤仍消费历史 HTML 数据，保留；标题/摘要不再绕过插件直接渲染原生 HTML。

## 验证记录

公开 SDK 0.17.0 与本地 tarball 逐字节一致，125,171 字节，摘要为 `sha512-CACysc6d6D0iH5NBm1kgQ5AA8uIKgnlMlUD4jL9A8bRTcajmoerhlEODKRLjaF9JOC/z7Xn9RaRQ/BoH2LhBfA==`。npm 首次发布要求二次验证；随后公共注册表已出现对应版本并完成字节核对，不再需要补 SDK 发布。

本地插件 ZIP 已通过独立 Electron initial/restart/disabled/restored 四阶段：两类真实渲染、行内 Enter/空白 Esc 删除、CodeMirror 块源码回写、只读 openEdit 保护、真实 Tailwind worker 编译、静态导出两类 CSS、发布快照及博客同包加载、未知节点/HTML 源码回退。报告为 `output/html-plugin/0b38a9c1-4556-490b-9b05-f2486b6419a8/report.json`，四阶段均无外部请求。弹层关闭按公共组件的 inert 状态判断，不要求已关闭浮层立即销毁 DOM。

四端生产构建及类型检查通过，桌面使用项目既有 8 GB Node 堆配置。扫描四端与桌面主进程 1,575 个 JS/CSS 文件，没有 HTML 插件 ID、渲染标记或插件样式残留。编辑器、数据库、白板及 antd 边界检查通过。

历史 Markdown 基准的 6 份快照通过独立 SnapshotClient 精确比对，未修改快照。标准 Vitest 执行其中两项时仍报 SnapshotClient.setup 状态缺失；相同问题在未修改的 master 基线（ABC worktree）复现，属于现有运行器状态问题，未为本次迁移修改全局测试配置。HTML codec/位置往返及真实包验证正常通过。

## 独立发布

- [v0.1.0 Release](https://github.com/LastKnightCoder/tau-plugin-html/releases/tag/v0.1.0)，对应源码提交 `7b94f3e85528a0b138a7ac1e7fe7a546df36fa1e`；后续 `ca6e954` 仅更新作者说明，不改变发布包。
- [发布工作流](https://github.com/LastKnightCoder/tau-plugin-html/actions/runs/39185048594)、[发布提交 CI](https://github.com/LastKnightCoder/tau-plugin-html/actions/runs/39184955966) 与 [说明更新 CI](https://github.com/LastKnightCoder/tau-plugin-html/actions/runs/39185174828) 均成功。
- 正式 ZIP 为 6,819 字节，展开 11,742 字节，共 7 个文件。SHA-256 为 `bff18b70ac2b86017c311c76f459fa9cf1bc92ed7cd879cd142fe9d55e0d1c7d`，与 GitHub 附件摘要一致；下载附件逐文件匹配本地产物，测试清单固定正式摘要。
- 正式下载 ZIP 再次通过四阶段 Electron，报告为 `output/html-plugin/e167c02e-4276-4646-93b7-f647bfe6dcc6/report.json`，四阶段均无外部资源请求。
- GitHub 干净克隆使用公开 npm SDK 0.17.0 冻结安装，8 项测试、类型检查及构建通过，不依赖主仓库或本机路径。
- 本地作者模板同步 SDK 0.17.0、行内 API 说明、锁文件与新版本等待期例外；未修改公共模板仓库。

主项目保留在新的 codex/html-plugin worktree，未合并 master。未操作用户真实插件目录，未提交插件中心审核，未部署博客模板或发布客户端；客户端仍为 0.59.0。按项目分工，视觉验收由用户后续完成。
