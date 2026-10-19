# Typst 插件拆分调研与方案

2026-10-19。用户调整范围：采用简单迁移，保留现有 `services.typst.compile` 与原生编译器，不再推进 WASM 完整迁出。以下「当前实施方案」优先于后文保留的原始调研。

## 当前实施方案

- COMPLETE：Investigate/Triage/Understand the problem。三个桌面窗口共用 main.tsx；选择窗口/工作区服务作用域、插件贡献外层绑定和独立 usePluginServices。已恢复源码 hook 与 EditorKit 原样。
- COMPLETE：实现独立服务入口，验证归属、独立窗口与取消；Typst 真实原生编译、编辑缓存与博客回退验证通过。
- COMPLETE：SDK 0.16.0、独立仓库及 Release v0.1.1 已发布；公开作者模板已同步，真实下载包固定为测试夹具。博客模板暂不发布；后续上线前需协调客户端与博客模板的兼容版本，并由用户完成视觉验收，不自动部署公共模板或提交插件中心审核。
- 编译仍使用现有 `services.typst.compile`，但不从源码块 hook 获取。TypstPreview 只接收编译函数，服务的取得与作用域由插件宿主边界承担；独立窗口缺少 activate 的问题应在该边界处理。
- 节点、插入入口、Markdown codec、HTML serializer 和 Skill 迁入独立插件。保留 `type: "typst"` 及全部历史字段，主项目撤掉内置文档扩展和 codec。
- 博客只读消费匹配缓存或无来源标记的历史缓存，缺缓存显示源码；不运行原生编译，不承诺浏览器重新编译。
- 旧聊天、原生 IPC、编译服务、worker 与相关依赖保留，本轮不作其退役。移动端/浏览器扩展沿用未知节点保护。
- 停止 WASM M0，移除未完成的原型工程；此前仅安装研究依赖和 wasm32 编译目标，未替换业务代码。

### 接线纠偏记录

曾将 PluginServices 整体注入 EditorKit 并由 useSourceBlock 返回，职责划分错误，已撤回该 API、注入与相关测试。源码 hook 内部的防写改动也已撤回，确保源码 hook 和 EditorKit 与 master 完全相同。最终采用用户确认的独立 usePluginServices，窗口/工作区绑定归插件宿主，Typst 自己控制编辑结果的缓存写入。此前 SDK 0.16.0 原型发布被 EOTP 拒绝；本轮重新生成并经用户浏览器验证发布新的独立入口，公开 tarball 与本地字节一致。相比公开 0.15.0，仅 index.d.ts 和新增 service-access.d.ts 变化，services/source-editor 原声明完全保留。原型报告不作为当前交付证据。

### 当前实测结果

- SDK 88 项回归、独立入口 5 项桌面行为测试、Typst 5 项单测通过；覆盖调用方取消、窗口/工作区取消、旧句柄、跨窗口隔离、StrictMode 重复挂载和固定数据库的独立窗口。另有桌面既有编辑器接线、各端覆盖和纯包校验回归通过。
- 最终 Release 下载包的隔离 Electron 报告：`output/typst-plugin/7cef9d78-c2c5-4828-a567-891cf27da28b/report.json`。主窗口、独立编辑窗口、Markdown 窗口均在不调用 activate 的情况下通过真实 HTML、中文、行内/块公式、编辑缓存、取消不影响并行任务、只读挂载不写库和博客缓存/源码回退。额外模拟没有 usePluginServices 导出的运行时，组件仍显示缓存或源码。未启用插件的节点数据保留，所有窗口外部网络请求为零。
- 正式 ZIP 为 7,498 字节，SHA-256 `6f82cf12fcf79108454b9bac307bd6c17b99843043028b014f708a179237ae02`；公开 Release 与本地构建逐文件一致，干净 GitHub 克隆通过公开 SDK 的冻结安装、5 项单测、类型检查和构建。编译器和字体仍在宿主中，因此不将插件小体积解释为客户端体积减少。
- 缓存策略明确为：只对用户编辑源码后的匹配结果持久化；单纯查看预览不回写节点。已有缓存不迁移，博客缺缓存或缓存过期时展示源码。
- `useSourceBlock`、`source-editor-host` 和 `apps/desktop/src/services/editorKit.ts` 与 master 的 diff 为空；无 EditorKit 服务 token、无 Typst 专用服务协议。

### 发布记录与上线边界

- 独立仓库：[tau-plugin-typst](https://github.com/LastKnightCoder/tau-plugin-typst)，提交 `aba15ca3488d94d07db238bf3cf97df86ff42d45`；[v0.1.1 Release](https://github.com/LastKnightCoder/tau-plugin-typst/releases/tag/v0.1.1) 与 [Actions](https://github.com/LastKnightCoder/tau-plugin-typst/actions/runs/39148048364) 成功。0.1.0 原始发布保留，不移动标签或覆盖已发布版本。
- SDK：[0.16.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.16.0)；作者模板更新提交 [`dcb356fdb632a5f1c10c7b2c1d6b58beb0426e79`](https://github.com/LastKnightCoder/tau-plugin-template/commit/dcb356fdb632a5f1c10c7b2c1d6b58beb0426e79)，使用公共依赖完成冻结安装、类型检查与构建。
- 正式下载包固定在 `tests/fixtures/plugins/releases/tau.typst/0.1.1`，catalog.json 记录同一来源提交及摘要，仅供测试，不进入生产随包目录。
- 四端类型检查和相关构建通过；桌面使用项目既定的 8 GiB Node 堆配置。博客 Vite 的标准 ESM 路径解析修复拆为独立提交，不属于 Typst 迁移；以下博客构建预检基于包含该修复的工作区。编辑器边界、antd、数据库、白板边界和 refactor baseline 通过；按项目约定未作视觉验收。
- 博客服务入口缺失时的组件回退，不等于旧内置节点集合兼容：仍内置 Typst 的模板不能再同时装配 tau.typst 插件。应与客户端一起发布移除内置 Typst 的配套博客模板，不静默 override 重复声明。
- 博客模板暂不发布。此前配套模板候选 `1.14.3` 已构建并通过 `publish-blog --dry-run --skip-build` 预检，仅保留本地验证记录：`output/typst-blog-template/blog-template-1.14.3.zip`，5,238,865 字节，SHA-256 `c02fb695c3c00f481f3e9551ed90c39c091c37d0baa8f995508a2363d887e570`。没有上传 R2 或更新公共 latest 清单，博客 package.json 版本仍为 `1.14.2`；也未发布客户端安装包、提交中心审核或操作用户插件目录。已有网站需要重新发布才会换模板。

## 原始完整迁出调研（历史参考，已停止执行）

## 调研任务

- COMPLETE：Investigate/Triage/Understand the problem。已核对文档块、缓存、旧聊天、SDK/IPC、原生打包、各端装配、公开模板与 WASM 包体积。
- COMPLETE：确定目标边界、可行性关卡和分阶段迁移方案，列出独立 GitHub 仓库的发布与验收要求。
- COMPLETE：复核方案中的源码路径、远程版本、删除边界与实施前置条件，补充专题入口。调研交付完成，下一步为 M0；实施阶段尚未启动。

## M0 执行任务

- STOPPED：用户选择复用既有服务，不再推进 WASM 编译器迁出。

## 工作基线

- 从本地 `master` 的 `fb887ea9bfe34397d4ce3fe7ce524478e6ad90c0` 创建独立 worktree。
- 分支：`codex/typst-plugin-migration`。
- 原工作区的未提交内容保留，不带入本次调研。

## 结论与推荐

目标参照 [TikZ 拆分](66-TikZ插件拆分调研与方案.md)：独立仓库 `LastKnightCoder/tau-plugin-typst`，插件 ID `tau.typst`，文档节点继续使用 `type: "typst"`，编译、预览、Markdown codec 和使用 Skill 归插件。桌面从插件中心安装，博客携带发布时启用的同一插件，移动端与浏览器扩展保持通用未知节点保护。

但 Typst 不能直接复制 TikZ 的实现：现有编译器是原生 Node 模块，输出 HTML，并有持久化缓存；TikZ 原本就是浏览器编译器。公开 WASM 的容量和 HTML 能力尚不能满足直接替换条件。

**推荐先做 M0 编译与打包原型，达到 HTML 等价、离线资源、博客兼容和容量门槛，再执行完整迁出。** 这是一条带明确退出条件的实施路线，不能把完整迁出写成已验证可行。M0 失败时保留现有可用链路，根据实测结果单独裁决资源协议或包体积限制；不先删除原生编译器，也不发布只能展示缓存的正式插件。

## 现状与消费者

| 区域             | 已核实的实现                                                                                                     | 迁移影响                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 文档节点         | `editor-extensions/diagram/src/extensions/typst/`，扩展 ID `tau.typst`，void block，支持拖拽、插入和源码编辑     | 迁入插件，用 SDK 编辑器贡献重建                              |
| 数据协议         | `src/types/typst.ts`：`content`、可选 `html`、`compiledFrom`、`compiledAt`、`children`                           | 原样保留，不改库表或批量重写正文                             |
| Markdown         | `extensions/typst/markdown.ts` 的 typst 围栏；从 `diagram/markdown.ts` 汇总                                      | codec 迁插件，撤掉内置注册，防止重复                         |
| 文档编译注入     | `diagram/services.ts` 的 `ITypstCompiler`；桌面 `editorRegistry.ts` / `editorServiceImplementations.ts` 注册实现 | 完整迁出后删除 token、类型、注册与适配                       |
| 预览             | `diagram/src/renderers/Typst/index.tsx`：200ms 防抖，消费编译回调，可显示旧缓存，失败时保留最近结果              | 迁插件，补任务取消和旧结果隔离                               |
| 缓存写回         | `extensions/typst/components/Typst/index.tsx` 编译成功写 `html/compiledFrom/compiledAt`；编辑源码清缓存          | 需要可编辑/只读边界，避免博客与旧聊天写回                    |
| 旧聊天           | `apps/desktop/src/renderers/TypstBlockRenderer/index.tsx`，别名 `typ`，`legacy: true`，白色预览面板和缩放容器    | 参照 TikZ，壳层保留，内存节点交插件只读渲染                  |
| 桌面旧命令       | `apps/desktop/src/commands/typst.ts` → IPC `compile-typst` → `main/modules/typst.ts`                             | 文档/聊天切换后清理整条链与模块初始化                        |
| SDK 服务         | `packages/plugins/src/services.ts` 的 `services.typst.compile`，支持 source、inputs、files、取消，返回 `{html}`  | 最终按 TikZ 删除 API；有公开契约变更，须发 SDK 并写说明      |
| SDK 桌面适配     | `src/app/plugins/services.ts` → `invokeCompiler` → `main/services/plugin-compilers.ts`                           | 删除 Typst 分支，保留 Tailwind、Markdown、FFmpeg             |
| 原生编译器       | `main/workers/plugin-typst.worker.ts`，`NodeCompiler.tryHtml()`，前置公式 `html.frame()` 规则                    | 浏览器替代必须覆盖相同 HTML 与数学语义                       |
| 原生分发         | `apps/desktop/package.json`、`vite.config.mts`、`electron-builder.yml`、原生裁剪和 runtime 验证脚本              | 迁出后删除各平台 Typst 包、worker 入口与打包专属规则         |
| 浏览器扩展       | `src/services/editorRegistry.tsx` 仍有 `compiler.typst` RPC 适配                                                 | 去掉注册与专属测试，不为迁出的节点保留远程编译支路           |
| HTML/EPUB 导出   | 桌面 `utils/html-serializers/block-serializers.ts` 优先输出缓存 HTML，否则转义源码                               | 迁为插件 `htmlSerializers`，保持同步接口，不在导出时临时编译 |
| AI 引导          | `constants/prompts/content-polish.ts` 仍无条件列出 typst 可生成语法                                              | 改为已启用插件 Skill 提供新建语法；保留既有源码不改写约束    |
| 历史纯数据消费者 | 协作 `packages/collaboration/src/document.ts` 的 content/code 映射，CLI Typst 源码展示，复习合并类型列表         | 仍有消费者，保留，不追求 Typst 字符串清零                    |

本次全仓检索 `services.typst`、`compileTypst`、`ITypstCompiler`、`compiler.typst`：生产编译消费者为内置文档、旧聊天和浏览器扩展适配；SDK 调用见作者契约样本、模板与服务验收脚本，没有发现本仓库其他插件业务调用。仓库外第三方调用无法由此排除，因此 API 移除需要发布说明，不能宣称对所有插件无影响。

博客和移动端原本没有注入 Typst 编译服务，已有节点可依赖缓存 HTML 显示；完整迁出后移动端/扩展不再专门渲染 Typst，这个变化须在客户端更新说明中明确，源码和所有缓存字段仍由未知节点保护保留。浏览器扩展的 RPC 字符串适配存在，本次未找到对应的主进程字符串处理器，不能把它当作已验证可用的端到端能力。

## 与 TikZ 相同与不同的部分

可以复用 TikZ 的仓库结构、编辑器贡献、插入入口、源码容器、错误上报、旧聊天桥接、插件中心分发、博客收集和四阶段真实包验收。使用 `definePlugin` 的静态 `editorExtensions`、`editorCodecs`、`skills`，组件不依赖 `activate/context` 才能渲染。

需要重新解决的是编译器载体、HTML 输出与缓存。**SVG 包在 HTML 字符串里不等于现有的 Typst HTML 正文输出**；不能为了套用 TikZ 模板直接改成分页 SVG，并将语义变化标为等价迁移。首版不增加 PDF 导出、独立排版工作台、系统 Typst 安装或通用插件互调协议。

| 方案                                                | 实施成本与适用情况                                                    | 判断                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 只迁编辑器块，继续调用宿主 `services.typst.compile` | 最小；桌面沿用原生能力，博客只能消费缓存，客户端仍携带原生包          | 可作为明确缩小范围后的交付；不符合完整迁出目标，不是默认终态     |
| 在插件中携带原生 Node 编译器                        | 需要多平台二进制、Node 执行入口和另一套博客策略                       | 当前模板是 browser/CJS，公开运行时没有这种 Node 插件入口；不采用 |
| 插件自持浏览器 WASM，宿主删除专属编译服务           | 桌面/博客统一、边界最完整；需要先解决 HTML 等价、字体、容量与执行环境 | 推荐目标，先经过 M0 验证                                         |
| 插件加载远程 CDN 或编译服务器                       | 包体积较小，但增加联网、离线失败与版本/隐私边界                       | 不作为默认替代方案，不向远端发送笔记源码                         |

## 最新模板与版本基线

2026-10-18 通过 GitHub API 读取公开模板 `main`，提交为 [`1d22a881833467c7fada43fbbbd0cdf0fdb04ad5`](https://github.com/LastKnightCoder/tau-plugin-template/commit/1d22a881833467c7fada43fbbbd0cdf0fdb04ad5)。公开 [package.json](https://github.com/LastKnightCoder/tau-plugin-template/blob/1d22a881833467c7fada43fbbbd0cdf0fdb04ad5/package.json) 使用 SDK `0.14.0`、UI `0.1.1`、React `19.2.0`、pnpm `11.9.0`、Node ≥22、TypeScript `5.8.3`、esbuild `0.25.12`。

同次读取 npm registry 的 `@xiongtao.xt/tau-plugins`，latest 已是 `0.15.0`；本次 master 的 `scripts/plugins/template/package.json` 也已锁到 `0.15.0`。公开模板尚未同步这一更新。TikZ 仓库创建时使用 SDK `0.12.0`，不能把 TikZ 的锁文件作为“最新模板”。

实施时从**当时公开模板最新 main**创建独立仓库并记录完整提交；保留其构建和 tag 工作流，依赖对齐当时已公开且兼容的 SDK，重新生成并提交锁文件。如果需要本方案提出的只读 API 或删除 Typst 服务，先发布相应 SDK，再让独立仓库依赖公开版本，禁止引用主仓库路径、workspace 链接或本地 tgz 作为正式依赖。

沿用公开 [release.yml](https://github.com/LastKnightCoder/tau-plugin-template/blob/1d22a881833467c7fada43fbbbd0cdf0fdb04ad5/.github/workflows/release.yml) 的冻结安装、测试、类型检查、tag/manifest/package 三者版本校验与 GitHub Release ZIP 发布；插件仓库补容量检查和第三方材料复制。许可证文件的存在检查不能替代第三方资源许可核查。

## WASM 可行性与实测容量

### 候选一：typst.ts 0.7.0

上游 [typst.ts](https://github.com/Myriad-Dreamin/typst.ts) 支持浏览器编译、向量与渲染能力；默认示例会联网获取字体，不能照抄为离线插件。公开 `@myriaddreamin/typst.ts@0.7.0` 的 `TypstWorld.compileHtml()` 可触发 HTML 编译，但公开 wrapper 的产物接口列出 vector/pdf，尚未验证能得到与 `NodeCompiler.tryHtml().body()` 相同的正文片段。M0 必须验证真实 HTML 导出，不能仅凭方法名判断可替代。

本次从 [npm 精确版本](https://registry.npmjs.org/@myriaddreamin/typst-ts-web-compiler/0.7.0) 下载 tarball，在内存读取 WASM，用 Python `zlib` level 9 测量 Deflate；Base64 使用标准编码，没有换行。以下只测资源，不是最终插件 ZIP：

| 项目                            |     字节数 |
| ------------------------------- | ---------: |
| npm tarball                     | 10,855,680 |
| `typst_ts_web_compiler_bg.wasm` | 28,325,178 |
| WASM 单独 Deflate               | 10,733,177 |
| WASM Base64 文本                | 37,766,904 |
| Base64 文本单独 Deflate         | 14,418,624 |
| 插件中心 ZIP 上限               |  8,388,608 |
| 插件中心展开上限                | 33,554,432 |

WASM SHA-256：`1fc968438a672366dfec39c96c842c26ed29caff4eb1bcaab19a6c60867de5fd`。容量上限来自 `apps/plugin-portal/contracts/index.ts`、门户 `api/package.ts` 和桌面 `main/services/plugin-center.ts`。

**这个版本按上述原样 Deflate 或直接 Base64 嵌入方案均不满足限制。** 还没有计入 JS、字体和许可证。不能将 npm tarball、单资源 Deflate 或源文件大小当作最终安装包体积；更换编码、预压缩或裁剪后需要重新构建完整插件测量。

### 候选二：typst-wasm 1.0.0

[官方浏览器示例](https://typst-wasm.github.io/typst-wasm/packages/typst-wasm/getting-started/browser/) 明确使用 `format: "html"`。其 [运行要求](https://typst-wasm.github.io/typst-wasm/packages/typst-wasm/deployment/browser-requirements/) 说明 Worker 后端依赖 growable SharedArrayBuffer、Atomics.wait 与跨源隔离；JSPI 可在支持的浏览器使用，但不能代表所有博客访客环境。为博客全站增加 COOP/COEP 会影响图片、字体、iframe 等第三方资源，不属于无影响的插件内部变更。

本次从 [npm 精确版本](https://registry.npmjs.org/typst-wasm/1.0.0) 下载测量：主 core WASM 为 22,795,811 字节，Deflate 后 8,249,001 字节；另两个 core 分别为 159/121 字节。主 core 距 8 MiB 仅余 139,607 字节，尚未计字体、JS、ZIP 结构；其 Base64 文本压缩后 10,919,611 字节。整个 npm tarball 为 8,577,169 字节，但含 sourcemap 和未使用的 Node 入口，不能直接作为插件大小结论。

`@typst-wasm/fonts@1.0.0` 的 registry 展开总量为 9,762,305 字节，并不代表必须携带全部字体。主 core SHA-256：`d88e986c1772b86b5efd947050fdc77c295f239991c2911dec649ea83f15ddeb`。

这个候选有明确 HTML 接口，值得参与 M0；其容量与浏览器要求仍未通过本项目验证，不能现在定为正式引擎。不能默认依赖浏览器实验标志或仅支持当前机器上的 Chromium。

### M0 的选型顺序与退出条件

1. 先验证两种公开候选的真实 HTML 输出；若需裁剪或增加 HTML 导出绑定，固定上游提交、构建参数与许可证，在插件仓库维护可复现的 HTML 用途构建，不直接维护一份不明来源的 WASM。
2. 保留现有公式前导规则和首版 HTML 能力；通过普通段落/标题、中文、行内与块公式、`sys.inputs`、内存附件 read/include/image、语法错误样本。对比语义与资源完整性，不要求新旧编译器逐字节 HTML 相等。
3. 最小字体集覆盖正文、数学与中文样本；HTML 普通文本可由浏览器排版，不等于公式 `html.frame()` 无需字体。不扫描系统字体，不默认从 CDN 拉取，不宣称支持任意字体/宏包。现有字体与宏包能力先做样本盘点；发生实质缩减时必须列为待裁决差异。
4. 优先使用插件内部可终止的独立 Worker，验证 CSP、Blob URL 与 WASM 能执行；不为单个插件全站开启跨源隔离。若必须使用 JSPI，先验证桌面、目标博客浏览器及不支持环境的处理，不能以此默默缩窄博客支持范围。
5. 实测最终 ZIP ≤8 MiB、展开总量 ≤32 MiB，经过门户 `inspectPackage()`。验证 Node 端求值 codec 不创建 Worker、不编译、不联网；验证博客正常加载同一版本与资源。

当前模板仅构建 CJS 主入口及可选 CSS，博客收集流程围绕同一入口；单纯在 ZIP 多放一个 wasm 文件不会自动解决加载。优先试插件内部的资源预压缩、延迟解码与裁剪，不在模块顶层解码整个 WASM。需要独立 assets 时，必须先定义通用资源清单、摘要、桌面取址和博客复制/部署协议，并测试 Node codec 求值，不能仅增加 `?url` 导入。

**退出规则**：上述语义、执行环境和最终容量有任一项不通过，M0 结束时提交实测差异与备选成本，不进入宿主删除阶段。容量优化不足时，另行裁决通用 assets 或中心上限变更；修改中心上限还须同步门户上传、ZIP 检查、客户端下载与相关测试，不能只改一个常量。不因 GitHub 允许上传大附件就绕过正式中心分发。

本轮只完成公开契约核验与资源测量。临时 Node WASM 探针观察到模块可初始化、数学样本缺字体，并未形成可确认等价的 HTML 正文验证，因此不列为通过的编译验收。浏览器执行、博客兼容、最终插件包与编译器裁剪均留待 M0。

## 插件结构与行为

拟建仓库 `LastKnightCoder/tau-plugin-typst`，公开、首版 `0.1.0`，插件 ID 与已有扩展 ID 均为 `tau.typst`。基于最新公开模板创建，不用 submodule，不在主项目保留另一份插件源码。

```text
tau-plugin-typst/
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
  TYPST-DEVELOPMENT.md
  src/
    index.tsx
    editor/extension.tsx
    editor/TypstBlock.tsx
    editor/markdown.ts
    compiler/compile.ts
    compiler/worker.ts
    compiler/prelude.ts
    vendor/
    skills/typst.md
    __tests__/
```

`vendor/` 的最终内容由 M0 决定；不预设所有字体或引擎都能直接装入当前模板。迁出来源固定到本次 master 提交，记录引擎、字体和本地修改的来源/摘要。typst.ts 包声明 Apache-2.0，typst-wasm 包声明 MIT，内含引擎与字体须分别核对，不能用包装包许可证覆盖所有资源。

manifest 保留 `formatVersion: 1`、`apiVersion: 1`、`platform: "desktop"`、`format: "cjs"`、`main: "main.js"`，并声明 `editor: true`。移除计数器页面、设置、侧边栏和私有存储示例；最低客户端版本由最终 SDK/资源能力实际验证决定，不直接复制 TikZ 的最低版本。

文档块使用 SDK 的 `defineEditorExtension`、`defineEditorElement`、`SourceBlockEditor`、`useSourceBlock`、`useReportPreviewError`、`insertSourceBlock`。React、SDK、UI 按模板 external；普通图标与浏览器依赖打包，不导入宿主私有路径，不复制 Slate/源码编辑容器。

### 编译生命周期与持久缓存

- 插件内部 `compile(source, {inputs, files, signal})` 返回 HTML 正文片段，不暴露新的全局 Typst 服务。表格、数学、样式与内嵌资源需要自包含或明确同源策略；处理 HTML 必须保留现有内容安全边界，不能把普通源码拼进可执行 Worker 文本。
- 保留防抖；每次请求带序号或源码快照。输入变化、清空、组件卸载与插件停用应取消任务并废弃结果；Worker 中同步 WASM 计算不能只靠 AbortSignal 中断，需终止对应 Worker。首版采用有界并发，不让每个块永久常驻一个编译器。
- 对 `compiledFrom === content` 的缓存直接显示；无 `compiledFrom` 的历史缓存可先显示并在有编译器时重编。源码不匹配的缓存只能作为明确过期的旧结果，不能冒充本次编译成功。
- 保留 `content/html/compiledFrom/compiledAt` 协议；源码修改使缓存失效，最新请求成功后才写回。`compiledAt` 不参与判断源码是否一致，也不在每次只读挂载时改写。
- 当前 `useSourceBlock.update` 无只读检查，且未向作者暴露只读状态。为保留自动缓存写回，实施时给该公共 hook 增补只读状态，并让宿主更新函数尊重只读；插件在只读预览只保存内存结果。这个通用 SDK 变更需类型/行为测试和公开发布，不能让插件私自导入 Slate hook。
- 博客与旧聊天不更新持久节点；编辑失败保留最近一次成功结果，并通过统一错误条说明。首次错误、缺字体与宏包不可用分别提示，不用永久 Loading 掩盖。

HTML/EPUB 的插件 serializer 仅在 `compiledFrom === content` 时输出匹配缓存；没有匹配缓存就转义源码。没有来源标记的历史缓存先保留在节点，在可编辑桌面成功重编后补齐来源；这类旧数据导出回退需写入更新说明。Markdown 只序列化源码，不因编译结果改变围栏内容。`plugin-markdown.ts` 的 `DISPLAY_FALLBACK` 文案也要反映缓存或源码输出的真实情况。

### 端侧与缺包行为

- 桌面：插件中心安装、启用并按内容插件既有规则重启后装配；缺失/停用时通用未知节点保护所有原字段，不自动下载。
- 旧聊天：保留 `typ` 别名、legacy 标记、白色画布与缩放壳。参照 `TikzBlockRenderer` 构造只读内存节点；缺包时展示原源码与插件中心入口，不直接导入插件私有编译器。
- 博客：发布用户已启用的同一版本、入口和资源；运行时可用缓存并按最终编译策略工作，不依赖 Electron/context。停用时发布含 Typst 的文章走现有缺失贡献检查，不偷偷补入插件。
- 移动端/浏览器扩展：依据 [63 分发边界](63-插件分发边界清理.md) 不加载插件，也不增加替代 Typst 渲染器或编译服务；未知节点保留数据。
- CLI：保持源码文本展示，不引入插件或 Typst 编译器。

## 实施阶段与验收门槛

下列是后续实施清单，均未执行；每阶段按可独立验证的小提交推进，不以某个半接线提交替代完整可用的阶段交付。

| 阶段                | 工作单元                                                                              | 完成条件                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| M0 编译与打包原型   | HTML/字体/附件/inputs 等价；可终止执行；候选裁剪及最终包；桌面/博客环境验证           | 通过上文全部退出条件，确定引擎、资源策略、最低客户端；不通过则提交实测与待裁决项                                             |
| M1 独立插件         | 从最新模板创建独立仓库；节点、codec、Skill、缓存与 serializer；必要只读 SDK 能力      | npm 公开依赖下冻结安装、类型检查、行为测试、构建通过；Node codec 无 DOM/网络；先在隔离宿主去掉内置 Typst 后装配测试          |
| M2 宿主迁出         | 旧聊天改接插件，内置节点/codec 移除；SDK/IPC/native/RPC 清理；文档同步                | 四端类型和构建、编辑器数据保护与编译生命周期回归通过；未安装插件的产物不携带编译器；无重复 type/codec                        |
| M3 发布与真实包验收 | SDK/模板按最终契约更新；插件源码、版本 tag 与 Release；干净克隆、下载摘要、中心包检查 | GitHub Actions 成功；Release ZIP 与本地逐文件一致；隔离 Electron 四阶段和博客发布真实包通过；正式中心审核/客户端发布分别记录 |

M1 的宿主不得同时装配内置 Typst 与插件 Typst，不能靠 `override` 隐藏重复贡献。M2 迁出文件删除前，按桌面 04 清单记录消费者与保留边界；桌面协议变更同步 03 指南，新增裁决记录到 DECISIONS，而非写在代码注释里。

### M2 删除与保留清单

| 位置                                                                                                            | 处理                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| diagram 的 typst 扩展、renderer、types、insert、augmentations、markdown 汇总                                    | 删除 Typst 专属代码与导出；其余 Mermaid、ABC、PlantUML 保留                                |
| `diagram/services.ts` 与 package `./services` export                                                            | 目前只承载 Typst；消费者清零后整文件/出口删除，并调整边界脚本                              |
| 桌面 `editorRegistry` / `editorServiceImplementations`                                                          | 删除 Typst DI、适配及相关导入                                                              |
| 桌面 `commands/typst.ts` / commands index / `main/modules/typst.ts` / module-config                             | 删除专属命令、IPC 和启动项，不留不可调用空壳                                               |
| SDK `services.ts`、desktopPluginServices、CompilerRequest、plugin-compilers                                     | 删除 Typst 契约、绑定和 worker 分支；保留通用 compilerFiles 与其他服务                     |
| `plugin-typst.worker.ts`、Vite worker/external、package 原生依赖、builder 解包、原生裁剪和 native-runtime 验证  | 专属内容删除，同步根锁文件；比较各平台构建资源，不能将一个平台二进制大小当作全部安装包收益 |
| `scripts/plugins/fixtures/author-contract-check.ts`、模板 SERVICES、服务验收 renderer 与 verify-plugin-services | 删除宿主 Typst 调用，其他真实服务继续验收                                                  |
| browser-extension editorRegistry / compilerServices 测试                                                        | 删除 Typst RPC 注册，保留 Tailwind RPC                                                     |
| 桌面 HTML serializer、Wechat 样式与 plugin-markdown 告警                                                        | serializer 归插件；样式按仍存在的输出消费者处理，不机械删 CSS；告警与真实降级一致          |
| diagram/desktop/mobile/blog/browser-extension 的覆盖测试、拖拽/懒加载/markdown 测试、边界脚本                   | 内置集合移除 Typst；新增真实插件包覆盖和未知节点保留断言，不能仅删全部 Typst 断言          |
| 协作 content/code 映射、CLI 展示、复习合并口径、聊天通用语法识别                                                | 保留历史数据消费者；新增能力只从已启用插件引导                                             |
| `tests/fixtures/plugins`                                                                                        | 可固定已发布版本做集成，禁止生产构建、默认安装或随包读取                                   |

无需数据库 schema 变更；不运行内容格式迁移，不删除历史缓存。SDK 删除服务与只读 hook 增补合并到实施时的下一兼容版本计划，版本号以当时公开版本为准，避免预占与其他任务冲突。

### 行为验证矩阵

| 场景         | 必须验证                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| 数据与编辑   | 历史含缓存/无缓存/过期缓存节点，插入、拖拽、编辑、复制、Markdown 往返；source 和 children 原样保留            |
| 编译语义     | 中文、标题表格、行内/块公式、原公式前导规则、变量、文件读取/包含、图片、缺字体/缺包与语法错误；资源不意外联网 |
| 生命周期     | 快速修改 A→B 时 A 不覆盖 B；清空/卸载/取消时无后写；多块有界并发；Worker/Blob URL 回收                        |
| 只读与导出   | 博客、旧聊天、预览挂载不写库；静态导出不执行编译器；匹配缓存与源码回退准确                                    |
| 启停与缺失   | Release 真实 ZIP 的 initial/restart/disabled/restored 四阶段；缺包时节点 JSON 保留，恢复后可渲染              |
| 加载与发布   | 主进程 codec 求值无 DOM/Worker/网络；博客携带同版本资源，禁用插件不能静默补包；最低客户端拒绝逻辑             |
| 结构与包体积 | 门户包检查、ZIP/展开限制、清理后客户端产物不含 Typst 原生模块/worker/测试包；保留其他编译服务                 |

实施时运行独立插件 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm check`、`pnpm build`，主仓库执行 diagram/SDK/桌面与受影响各端的行为测试、类型检查、四端生产构建和编辑器扩展/antd 边界检查。参考并扩展 `apps/desktop/scripts/verify-tikz-plugin.mjs`，新增 Typst 真实包的隔离 Electron 与博客发布验收，不把 mock 编译通过当作 WASM 执行通过。

遵循项目分工：Agent 不做视觉验收、截图对照或浏览器视觉走查，外观由用户后续验收；行为与构建验证仍须完成。

## 独立 GitHub 发布交付

1. M0 通过后，从实施时最新 `tau-plugin-template` 创建公开 `LastKnightCoder/tau-plugin-typst`；记录模板 SHA，主分支 main，插件首版建议 0.1.0。当前调研尚未创建该仓库。
2. 提交源码、冻结锁文件、构建说明、来源/许可证、README 与 CHANGELOG。README 面向用户说明 Typst 块、安装、语法范围、离线/字体/宏包限制和最低客户端，开发细节放独立文档。
3. 以已验证的 commit 创建 `v0.1.0` tag，交模板 Actions 生成 `tau.typst-0.1.0.zip`。补容量门禁与所需第三方文件复制；不移动已发布 tag、不覆盖同版本已审核产物。
4. 从 GitHub 干净克隆，使用公共 npm 冻结安装、类型/测试/构建；下载实际 Release ZIP，记录 ZIP SHA-256、字节数、展开量、源码提交与 Actions URL，并与本地产物逐文件比对。
5. GitHub Release 与插件中心是两个发布动作。中心需提交同一源码提交与 ZIP、通过检查和审核；正式桌面安装继续走中心。记录各自实际状态，不能把 Release 成功写成中心已上线。
6. 插件、SDK/模板与包含宿主退役的客户端需要协调发布。最低客户端必须指向通过最终集成验证的版本，避免新插件安装到仍内置同 type 的旧客户端；不以修改 apiVersion 代替最低客户端检查。

本轮没有实施迁移、创建 GitHub 仓库、发布 SDK/插件、修改插件中心限制或用户插件目录。下一步是 M0；其输出将决定完整迁出能否沿用当前发布合同，以及是否需要进一步裁决。
