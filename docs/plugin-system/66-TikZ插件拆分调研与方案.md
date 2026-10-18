# TikZ 插件拆分调研与方案

2026-10-18。TikZ 独立插件与宿主清理已实施，GitHub v0.1.0 和 npm SDK 0.14.0 已发布，公共注册表下载包与本地产物一致。

已基于 tau-plugin-template 建立独立仓库，将 TikZ 的文档块、Markdown codec、浏览器编译器、字体和使用 Skill 一起迁出。SDK 的 services.tikz.compile 及桌面适配已删除，不增加编译提供方接口。主项目保留通用编辑器、源码编辑容器与聊天预览壳，编译能力完全由插件内部持有。正式安装沿用插件中心，博客携带发布时的插件版本。

## 发布与验收记录

- 仓库：[tau-plugin-tikz](https://github.com/LastKnightCoder/tau-plugin-tikz)，源码提交 `53d223aad3a06ffeb76c8b02265de0cdb2feeb2d`；[v0.1.0 Release](https://github.com/LastKnightCoder/tau-plugin-tikz/releases/tag/v0.1.0) 与 [Actions](https://github.com/LastKnightCoder/tau-plugin-tikz/actions/runs/39135403578) 已成功。
- 官方 ZIP 为 7,687,061 字节，约 7.33 MiB；SHA-256 为 `6fe0ab3fddabff7632f1648b58af4c6784a587ddceb107345285f3c9e3d2e930`。下载后逐文件核对与本地构建一致；测试清单固定的是该 Release 摘要。
- GitHub 干净克隆通过冻结安装、10 项插件单测、类型检查和构建；SDK 77 项测试、diagram 34 项测试及相关桌面/各端回归通过。
- Release 下载包通过隔离 Electron 的 initial/restart/disabled/restored 四阶段，覆盖真实 WASM 出图与字体、宏包前言、Markdown 往返、旧聊天、博客、语法错误、卸载取消和未知节点数据保留。报告：`output/tikz-plugin/0006010d-4fcf-4b7a-8512-152080e7f35f/report.json`；没有外部资源请求。
- 四端生产构建通过，JS/CSS 产物不再含原编译器或字体。迁出前桌面产物有两份编译器 JS，共 14,018,182 字节；迁出后对应资源均消失。该数字不等于安装包最终压缩体积变化。
- 本分支已合入本地 master 的 TTS M1—M3；SDK 0.14.0 声明包与公开 0.13.0 对比，只有 services.d.ts 删除 TikZ，TTS、上传与其他声明逐字节保留。
- SDK 0.14.0 已完成本次账号二次验证，注册表回读及 tarball 字节校验通过；更新记录明确说明 API 移除。本地模板与公开模板同步该版本及插件端侧边界。
- 公开模板提交 `1d22a88`，使用 SDK 0.14.0 完成冻结安装、类型检查和构建。博客原 Vite 5 与当前 Tailwind 插件不兼容，已对齐桌面的 Vite 7.2.4 并重新构建通过。
- 扩展、数据库边界与 antd 检查通过；全仓白板边界检查命中工作区原有未跟踪文件 `apps/promo-video/src/app-kit/whiteboard/sketch.ts` 对私有 sketch/shape 的导入。按用户要求，本轮不处理该目录，仅提交 TikZ 相关改动并合入本地 master，其他任务的未提交内容保留；根锁文件仅暂存博客 Vite 所需变更。
- 未提交插件中心审核、未发布客户端安装包，也未操作用户真实插件目录。视觉验收留给用户。

## 调研任务

- COMPLETE：Investigate/Triage/Understand the problem。核对文档块、旧聊天、SDK 编译服务、各端原生装配与当前分发裁决。
- COMPLETE：核实模板构建、自动发布、插件中心容量和资源加载约束，完成文本资源嵌入试验。
- COMPLETE：独立仓库、完整插件、宿主迁出、SDK/模板同步与 Release 验收。后续由用户完成视觉验收、中心审核与客户端发布。

## 迁出前消费者与处理边界

| 能力          | 当前实现                                                                       | 拆分影响                                                          |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 文档块        | `editor-extensions/diagram/src/extensions/tikz/`，扩展 ID 为 `tau.tikz`        | 迁移节点声明、插入入口、源码编辑和预览                            |
| 文档数据      | `{type: "tikz", content, children}`                                            | 保留类型、字段和原始源码，不批量重写历史内容                      |
| Markdown      | `extensions/tikz/markdown.ts`，使用 tikz 围栏                                  | codec 归插件，并从内置集合移除                                    |
| 文档预览      | `renderers/TikZ/index.tsx`，动态执行 tikzjax，监听全局 DOM 变化                | 改为插件内统一编译函数，避免在页面全局安装编译器                  |
| 编译服务      | `renderers/TikZ/compile.ts`，单次隐藏 iframe，120 秒超时，输出带字体的 SVG     | 编译实现迁入插件，保留取消和上下文清理                            |
| SDK           | `packages/plugins/src/services.ts` 的 `services.tikz.compile`                  | 删除类型、绑定实现及相关示例/测试；在 SDK 版本说明中记录 API 移除 |
| 桌面适配      | `apps/desktop/src/app/plugins/services.ts` 直接导入 `@tau/editor-diagram/tikz` | 删除整个 tikz 服务适配                                            |
| 旧聊天预览    | `src/renderers/TikzBlockRenderer/index.tsx`，支持 tikz、latex-tikz、tex-tikz   | 保留卡片、缩放和别名，替换实际出图来源                            |
| HTML 静态导出 | `utils/html-serializers/block-serializers.ts` 当前输出转义源码                 | 首版保持源码导出，不新增异步 SVG 持久化                           |

迁出前，services.tikz.compile 的调用仅见 SDK 测试、作者契约样本、模板文档和 Electron 服务验收脚本，没有生产业务调用。TikZ 文档块和旧聊天直接使用原渲染组件，二者均不消费这个服务。SDK 更新记录明确说明 API 移除，不为假设调用者增加长期转发层。

### 端侧边界

以 [63 插件分发边界清理](63-插件分发边界清理.md) 和桌面 03 指南为准：

- 桌面：正式插件从插件中心获取，不预装，不把测试包放回生产构建。
- 博客：发布时收集用户已安装、启用的编辑器插件，携带同一入口和版本；渲染不依赖桌面 activate/context。
- 移动端与浏览器扩展：不加载插件。TikZ 已退出内置 diagramExtensions，使用通用未知节点保护保留数据，不再渲染 TikZ，也不提供另一份内置编译器。
- CLI：当前仅有 TikZ 源码展示，保留这一行为，不接入插件运行时。

模板 `EDITOR.md` 已修正为桌面与博客共用组件，移动端和浏览器扩展不加载插件。

旧聊天的 TikZ 属 D-057 保留预览能力。迁移后安装并启用插件可继续出图；缺包时保留源码并提示安装，不静默下载。它仍不进入新聊天的内置生成引导。

## 方案比较

| 方案                              | 改动与成本                                                  | 结果                                                                           |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 只拆文档 UI，插件继续调用宿主编译 | 最小，可直接使用当前 SDK                                    | 主项目仍携带约 11.3 MiB 编译器和字体，博客不能调用桌面服务，不满足完整拆出目标 |
| 完整拆分，编译服务转给插件        | 中等，需增加一个静态编译贡献并修改宿主接线                  | 没有现存生产服务消费者，不采用这层额外协议                                     |
| 完整拆分，同时删除 SDK TikZ API   | 编译插件简单，清理 SDK、适配和对应示例；发布时说明 API 移除 | 推荐；编译只属于插件，宿主不承担 TikZ 编译服务                                 |

采用第三种方案，不增加 tikzCompiler 静态贡献、提供方注册或插件互调机制。删除 API 减少的是宿主职责与维护面；迁走编译器和字体才带来主要体积收益。上一版委托方案也可以移走资源，删除 API 本身不会额外节省约 11.3 MiB。

## 独立仓库与模板复用

独立仓库为 `LastKnightCoder/tau-plugin-tikz`，插件 ID `tau.tikz`，首版 `0.1.0`，公开源码与 Release 已推送。

使用公开 [tau-plugin-template](https://github.com/LastKnightCoder/tau-plugin-template) 创建仓库，沿用 Node 22、pnpm 11.9.0、TypeScript、React、esbuild、单个 CJS 入口、ZIP 结构、摘要生成和 tag 发布工作流。TikZ 0.1.0 使用创建时模板的 SDK 0.12.0、UI 0.1.1，不依赖新增能力，与移除服务后的宿主兼容；通用模板更新到 SDK 0.14.0。

插件目录：

```text
tau-plugin-tikz/
  manifest.json
  package.json
  pnpm-lock.yaml
  build.mjs
  install-local.mjs
  .github/workflows/release.yml
  README.md
  CHANGELOG.md
  LICENSE
  THIRD_PARTY_NOTICES.md
  LICENSE-LPPL.md
  LICENSE-BAKOMA.txt
  TIKZ-DEVELOPMENT.md
  src/
    index.tsx
    editor/extension.tsx
    editor/TikzBlock.tsx
    editor/markdown.ts
    render/TikzPreview.tsx
    compiler/compile.ts
    compiler/source.ts
    vendor/tikzjax.js
    vendor/tikz.vendor.css
    skills/tikz.md
    __tests__/
```

入口沿用 `__PLUGIN_META__`，manifest 声明 `editor: true`、`platform: "desktop"`。移除模板计数器页面、设置和侧边栏；首版不需要账号、网络服务、独立工作台或私有内容存储。

文档块通过 SDK 的 `defineEditorExtension`、`defineEditorElement`、`SourceBlockEditor`、`useSourceBlock`、`useReportPreviewError`、`insertSourceBlock` 接入。不得复制源码编辑容器或把 Slate React 打进插件。图标等浏览器依赖按模板打包，React、SDK 和 UI 保持 external。

保留 `type: "tikz"` 是已有数据协议的延续，不更名成新的命名空间节点。主项目必须同时撤掉内置定义和 codec，防止重复装配。

## 插件内部编译与生命周期

`definePlugin` 只使用现有 `editorExtensions`、`editorCodecs`、`skills`。compile 是插件内部模块，接收 source 与可选 AbortSignal，返回 SVG；不暴露到宿主 services，也不创建新的 SDK 贡献协议。

模块顶层只定义函数和资源字符串，不能创建 Worker、读取 DOM 或执行编译器。Node codec 加载允许求值入口，但不调用编译方法。编辑器贡献依当前内容插件规则在重启后启停与升级，组件卸载或编译输入变化时取消任务并清理资源；博客使用同一组件与内部模块，不依赖 activate/context。

SDK 删除 PluginServices.tikz、bindPluginServices 中的绑定以及桌面适配，同步模板 SERVICES.md、作者契约样本、SDK 单测和 Electron 服务验收脚本。其他编译服务保持原协议。发布 SDK 时说明该 API 移除，最低客户端版本按插件实际使用的既有能力和验证结果填写，不因一个不存在的新贡献接口抬高要求。

### 共用实现

- 文档组件直接调用插件内的 compile，不调用桌面 context，以支持博客。
- 旧聊天渲染器保留宿主的卡片和 ZoomSurface，将聊天源码构造成内存中的 tikz 节点，通过现有 Editor 和包含插件贡献的 Kit 只读渲染；不写库，不直接导入插件私有编译模块。
- 旧聊天与文档由同一个插件节点组件出图。插件缺失时提供源码和安装提示；行为验收覆盖只读上下文、缩放、原有 SVG 导出以及任务清理，不扩大聊天插件协议。
- 编辑预览保留最近一次成功结果。快速修改、清空内容、卸载组件或取消时废弃旧任务，旧结果不能覆盖新源码。
- 首版保持单次独立 iframe 的执行模式和 120 秒超时，不新增常驻 Worker 池、磁盘缓存或编译服务器。多图并发的内存峰值纳入行为验收；若实测超出可接受范围，再增加简单并发限制。

当前文档预览原样提交清理后的源码，而现有服务会添加 document 环境，两条路径语义不同。合并前必须覆盖三类样本：裸 tikzpicture、已有 document 环境、已有宏包前言。只为未包含 document 环境的普通片段补包装，保留前言原有位置，不重复包装、不逐行 trim 或删除原始空行，不写回笔记。首版保留已有可用语法，不借拆分承诺完整 LaTeX 文档和任意宏包安装。

## 编译资源与包体积

当前编译服务依赖 Vite 的 `?url`、`?raw`，文档预览则动态 import 自执行脚本。模板是 esbuild 单 CJS，博客发布链路收集 main.js/CSS；直接复制原导入方式不能闭环。

建议在插件 build.mjs 中对这两个 vendor 文件配置精确匹配的 text loader，按 [esbuild 文本加载器](https://esbuild.github.io/content-types/#text) 将其嵌入入口。只在单次编译函数中用脚本文本创建 Blob URL，放进该任务 iframe 执行，结束后撤销 URL 并销毁上下文。字体随编译结果写入 SVG，不在插件启用时全局注入整个字体表。样式保留字体定义，去掉原 Obsidian 选择器。

继续使用单入口，避免为了 TikZ 增加 SDK assets 协议、额外 JS chunk 下载、CDN 或系统 TeX 依赖。源码必须用 textContent 写入脚本节点，不拼进可执行 HTML 模板。

### 已完成的容量试验

使用仓库已安装的 esbuild 0.25.12，在内存中构建仅导出资源访问函数的 CJS，未执行 vendor、未写生成文件：

| 项目                     | 实测字节数 | 说明                                          |
| ------------------------ | ---------- | --------------------------------------------- |
| 原始 tikzjax.js          | 7,064,246  | 约 6.74 MiB                                   |
| 原始字体 CSS             | 4,792,302  | 约 4.57 MiB                                   |
| 文本嵌入后的 CJS         | 11,858,939 | 约 11.31 MiB，仅含资源及少量包装              |
| 上述 CJS 的 Deflate 数据 | 7,669,920  | 约 7.31 MiB，不等于最终 ZIP                   |
| 中心 ZIP 上限            | 8,388,608  | 距离上述压缩数据只余 718,688 字节，约 702 KiB |
| 中心解压总量上限         | 33,554,432 | 32 MiB                                        |

原始编译器和字体合计 11,856,548 字节，约 11.3 MiB。清除文档预览、聊天渲染和 SDK 服务三条资源引用后，未安装插件的宿主不再携带这些文件；最终客户端压缩包和安装占用的减少量取决于构建、压缩与去重结果，需前后构建比较，不能直接等同于源文件大小。用户安装插件后仍需承担插件自己的资源占用。

因此首版有机会在现有上限内发布，但必须以最终 ZIP 实测为准，计入组件、依赖、许可证和 ZIP 元数据。CI 校验 ZIP ≤ 8 MiB、展开总量 ≤ 32 MiB，并调用门户包检查逻辑；不默认扩大插件中心上限。不能因为没有执行编译器，就假定约 11 MiB 字符串没有启动、Node codec 或博客加载成本，应测量真实包加载与首次编译。

隔离 Electron 和博客的行为测试要实际验证 Blob 脚本、Worker、WASM、字体、自包含资源及取消清理。容量试验只证明可打包，不证明 CSP、编译效果或生命周期已经通过。

## 迁移与删除清单

| 区域                                                                          | 实施处理                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| diagram 的 tikz 扩展、类型、codec、renderer、compile、vendor                  | 迁入独立仓库，消费者改完后从主项目删除                                                        |
| diagram 的 index、markdown、renderers、insert、augmentations、package exports | 去掉 TikZ 导出与内置集合；保留 Mermaid、ABC、PlantUML、Typst                                  |
| SDK、桌面服务及服务样本                                                       | 删除 TikZ 类型/绑定/适配，移除模板示例、契约样本与专用服务测试，不保留空壳转发                |
| 旧聊天渲染器                                                                  | 使用已装配插件的只读 Editor 渲染节点，去掉对原 TikZ renderer 的导入                           |
| 各端 diagramExtensions/diagramMarkdownCodecs                                  | 共用集合去掉 TikZ；桌面和博客由插件装配，移动端/扩展按未知节点处理                            |
| 文档内置语法 Skill、内容润色提示词                                            | 移除“无条件支持 TikZ”的引导；保留已有用户源码的通用不改写规则，插件 Skill 负责新建语法说明    |
| HTML 导出                                                                     | 插件声明转义源码 htmlSerializer；移除宿主对应专用实现，并核对服务 DISPLAY_FALLBACK 告警仍准确 |
| 字数统计、协作源码字段映射、CLI 文本展示、复习合并口径                        | 保留仍有历史数据消费者的纯数据规则；不能为清零字符串而删除                                    |
| CONTENT_ELEMENT_TYPES、覆盖测试、diagram 单测、边界脚本                       | 调整内置类型预期；未知数据和真实插件包分别验证，不能把所有 TikZ 断言直接删掉                  |
| tikzjax mocks 与 Vite/Vitest alias                                            | 包级测试迁移后，rg 确认无消费者再删除                                                         |
| 测试产物                                                                      | 可固定版本放 `tests/fixtures/plugins`，仅用于集成，不进入生产随包清单                         |

无需数据库 schema 变更或内容批量迁移。插件缺失时，旧节点和源代码保持不变，重新安装并重启后恢复显示；停用状态发布博客时不能偷偷补入未启用包，应沿用缺失贡献检查并提示处理。

## 来源与发布材料

上游 [Obsidian TikZJax](https://github.com/artisticat1/obsidian-tikzjax) 声明使用 drgrice1 的 TikZJax fork；其插件包装的 [LICENSE.md](https://github.com/artisticat1/obsidian-tikzjax/blob/main/LICENSE.md) 为 MIT，原 [TikZJax LICENSE.md](https://github.com/kisonecat/tikzjax/blob/master/LICENSE.md) 为 LPPL 1.3c。不能把包装项目的 MIT 自动当成所有内嵌引擎、宏包和字体的许可证。

迁出来源固定到 Tau 提交 `1e8ee22baf8388cc187c729eda1ba03f3a74106e`，原文件摘要和修改说明保存在 THIRD_PARTY_NOTICES.md；包内携带 LPPL 与 BaKoMa 许可证。引擎和宏包数据保持原样，vendor JS 仅把错误时的外部图片占位改为本地标记，字体 CSS 移除原 Obsidian 布局选择器。插件构建和本地安装白名单均已纳入这些许可文件。

发布流程继续使用模板的版本 tag → GitHub Actions → Release ZIP；tag、manifest、package 版本一致，提交 pnpm-lock.yaml，运行冻结安装、测试、类型检查和构建。GitHub Release 与插件中心审核是两个步骤；Release 成功后再提交中心，客户端迁出版本与可安装插件版本协调发布，避免先移除内置实现再让用户等待插件。

README 面向用户说明安装、tikz 围栏、离线能力、宏包边界、首次编译等待、停用后的数据行为和移动端限制；源码出处、资源更新办法与构建细节放开发文档。

## 实施阶段与验收

| 阶段                  | 交付                                                                                      | 退出条件                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| M1 模板与独立插件     | 基于模板建立仓库，迁移编辑块、codec、编译器、字体、Skill 和来源材料                       | 干净目录冻结安装、类型检查、单测、构建；最终 ZIP 容量及门户检查；Node 求值无 DOM/Worker 副作用            |
| M2 宿主接线与服务删除 | 删除 SDK TikZ 服务及样本，接通文档、旧聊天只读节点和博客                                  | 多窗口、缺包提示、任务取消、快速编辑保留成功预览；同一插件包可在博客实际编译；其他宿主服务回归通过        |
| M3 退役与发布         | 删除主项目 TikZ 实现，调整各端清单/测试，发布 GitHub Release 与 npm SDK；中心审核另行提交 | 主包不含原 vendor；真实 ZIP 加载、重启、停用与恢复；移动/扩展原数据保留；博客版本固定；视觉验收由用户完成 |

M1/M2 是同一拆分工作的中间阶段，最终交付不保留两份生产实现。测试分层如下：

1. 插件单测：Markdown 往返及位置、原始内容不被改写、包装语义、错误/超时/取消、旧结果不覆盖新任务。
2. SDK 与宿主：TikZ 服务及直接资源引用清零，其他服务签名与取消行为不变；插件静态装配、重启语义、窗口/工作区销毁与只读聊天节点。
3. 真实 Electron：从完整 ZIP 加载并真正产出 SVG，验证字体、无效语法、120 秒超时的可控测试、iframe/Worker/Blob 清理及无外部资源依赖。
4. 内容集成：旧文档无需迁移；停用后数据保留；带插件的博客离线编译；未安装端编辑相邻内容不损坏未知节点；HTML 导出正确转义源码。
5. 构建与结构：受影响类型检查、行为测试、桌面和博客构建、移动端和浏览器扩展构建、编辑器边界检查、中心包检查与干净克隆构建。

视觉验收依项目规范由用户完成，Agent 不进行截图对照或浏览器视觉走查。性能和生命周期使用计时、进程/Worker 状态与 DOM 行为断言验证。

核心取舍已落地：完整迁出编译器并删除 SDK TikZ API，插件内部完成编译；移动端/浏览器扩展按既定插件边界失去 TikZ 渲染但保留数据。中心审核、客户端安装包发布与用户视觉验收另行进行。
