# Android / iOS 共用移动插件方案：静态 Spike

目标：沿用 Tau 插件中心与作者体系，让 Android、iOS 至少支持可下载的编辑器扩展和 React 自定义页面，明确复用边界、必要改造与下一轮实机验证条件。

本次只调查、设计并执行已有回归测试，没有编写产品代码或新验证程序，没有部署门户、发布 SDK、安装到手机或提交商店审核。结论属于源码与契约层面的可行性判断，不是移动运行验收。

- 基线：`3ed4f9a389487366ed4a4495159e8a6d6d5a2cd7`，从当前 `master` 已提交状态创建。
- 分支：`codex/mobile-plugin-spike`。
- 工作目录：`/Users/t.xiong/.codex/worktrees/mobile-plugin-spike/editor`。
- 主工作区当时未提交的插件详情页和 Tabs 修改未复制进来。
- 用户约束：先不写代码；以现有插件体系为基础；Android/iOS 共用；优先编辑器扩展与自定义页面。
- 文档归属：一次性调研快照，唯一位置为本文件，不是当前架构事实。冻结后随时可删除，不由活文档或代码引用；真正实施时将当时确认的方案纳入自含任务文档，落地后再更新架构事实。

## 结论与建议

**技术上有明确可行路径：共用 Web 插件运行协议、React 组件与编辑器扩展定义，分别适配移动路由、存储和原生宿主能力。首轮选择可信、经过中心审核的前台插件，不新增 Node 运行时，不追求桌面 SDK 全量兼容。**

编辑器扩展与自定义页面不应退化成另一套 JSON UI，也不需要把每个编辑器节点塞进 iframe。两端已有相同的 React/Slate 编辑器基础；真正缺少的是移动端的加载、宿主服务、触摸入口和分发兼容链。

这里的“可信”沿用桌面现实：插件与应用前端处于同一个执行环境，API 白名单、数据授权和包摘要都不是恶意代码沙箱。此路线适合受审核的扩展生态；如果需求变成执行任意来源的不可信插件，需要另一个隔离项目，不能宣称本方案已经满足。

| 判断                             | 本次结论                                    | 尚缺的证据                                     |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Android/iOS 共用一个 JS 插件实现 | 可设计，现有 CJS + React 契约可延续         | 两端真实 WebView 的安装、加载和恢复            |
| 插件自定义 React 页面            | 复用空间大，接入移动 router 即可形成路径    | 返回仲裁、弹窗、页面身份、内存回收验证         |
| 部分编辑器扩展                   | 可行，静态贡献、源码组件和 codec 都已有入口 | 中文输入、选区、撤销、移动插入入口和持久化验证 |
| 所有现有桌面 ZIP 原样安装        | 不支持；旧包只有 desktop 声明               | 作者需发布明确支持移动的新版本                 |
| App Store / Google Play 正式发布 | 存在政策路径，不能从源码推导审核结果        | 真实审核与完整分发责任落实                     |
| 开放恶意代码隔离                 | 不满足                                      | 独立执行环境和新 UI 通信协议                   |

## 1. 已核实的现状

### 1.1 可复用的核心

| 现有部分            | 复用方式                                                                                                 | 依据                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `PluginHost`        | 生命周期、命令命名空间、signal、资源逆序回收、工作区绑定；构造器已经接受 pages/storage/settings 等适配器 | [host.ts](/packages/plugins/src/host.ts)                                                             |
| 插件定义与 CJS 求值 | 保留 `definePlugin`、`create/activate/deactivate`、共享 React 实例；改平台校验和可用模块集合             | [contract.ts](/packages/plugins/src/contract.ts)、[rendering.ts](/packages/plugins/src/rendering.ts) |
| 静态编辑器贡献      | 沿用 `editorExtensions`、`editorCodecs`、`ContentPluginRegistry` 的快照和冲突检查                        | [content.ts](/packages/plugins/src/content.ts)                                                       |
| 编辑器作者 API      | `defineEditorExtension`、`defineEditorElement`、commands、blockPanel、behaviorsFor 等已有契约            | [editor.ts](/packages/plugins/src/editor.ts)、[字段白名单](/packages/plugins/src/editor-fields.ts)   |
| 源码/节点组件注入   | `source-editor-host` 已将共享 editor/source 接到 SDK，可作为移动适配起点                                 | [source-editor-host.tsx](/packages/plugins/src/source-editor-host.tsx)                               |
| 页面作者契约        | 保留 `context.pages.register`、React component、params、pageContext、page handle                         | [pages.ts](/packages/plugins/src/pages.ts)                                                           |
| 插件私有数据语义    | 保留插件 ID + 工作区 ID + key、失效 signal 和写入前就绪检查                                              | [storage.ts](/packages/plugins/src/storage.ts)                                                       |
| 插件中心            | 发布者、审核、版本、R2 文件、包摘要、评论/喜欢、版本撤回机制继续使用                                     | [releases.ts](/apps/plugin-portal/api/releases.ts)、[包检查](/apps/plugin-portal/api/package.ts)     |

### 1.2 不能照搬的部分

- 移动端目前没有 `@tau/plugins` 依赖，包校验只接受 `platform: desktop`。这不是启用一个开关即可恢复的能力。
- 桌面 `app/plugins/runtime.ts` 绑定桌面导航和大量业务服务，不能整体 import 到 mobile。应复用 `PluginHost`，在移动端实现宿主适配器；仅抽取确有双端消费者的纯逻辑。
- 桌面包下载使用 Electron `net`，安装事务使用 Node 文件 API；移动端由 Rust/Tauri 实现下载、解压、校验、暂存和替换。
- `shared-modules.ts` 直接汇入 whiteboard、sync 和完整 UI，不宜未经依赖审计直接作为移动入口。移动模块表保持既有模块名，但只提供已声明的运行配置；不为节省体积制作返回假结果的兼容对象。
- `PluginContext` 的类型列出了很多接口，移动端不因此具备对应能力。首版能力必须显式声明，不可只让作者靠 try/catch 猜。
- `@tau/ui` 可复用基础组件和主题，但 Dialog 当前用 DOM Escape 处理关闭，`UiProvider` 会创建 body portal；都不能自动满足移动路由返回和转场挂载要求。
- SDK 的 `ContentEditor` / `ContentPreview` 是宿主注入接口，当前注入实现在桌面。移动自定义页面若要嵌入业务正文，需要额外的移动正文组件与授权适配，不是第一轮计数器页面的前置条件。
- 现有文档部分段落仍描述早期开发台状态。判断生产静态扩展时以当前代码与最新分发边界为准，不依据 `scene: workbench` 的旧注释认定移动端必须走开发台。

现有移动边界见 [分发边界](/docs/architecture/plugin-system/63-插件分发边界清理.md)。本调研未将“移动不加载插件”的当前事实改成已经支持。

## 2. 运行架构：共用什么、平台分别负责什么

从上到下分为四层，不新增独立插件产品或第二个中心：

1. **作者层**：TypeScript/React，使用已有 `@tau/plugins`、受支持的 `@tau/ui` 导出；产出一个经过校验的 Web 插件 ZIP。
2. **公共运行层**：包解析、版本兼容判断、CJS 加载、共享模块、PluginHost、内容扩展快照、命令和私有存储契约。
3. **移动宿主层**：Android/iOS 共用的 TypeScript 实现；绑定现有 router、EditorKit、主题、插入面板、插件设置和错误页。
4. **平台适配层**：Tauri/Rust 的包文件事务、私有持久化和应用生命周期。平台特有的目录、URL scheme、WebView 行为由宿主吸收，插件不调用裸 Tauri invoke。

首版编辑器与插件页面处于现有 WebView 内，共享 React 实例；不向插件提供 Electron、Node、Shell、任意本机文件路径或通用原生调用接口。禁止插件从外部继续下载执行依赖，普通依赖应在作者构建时打包；此禁令在同环境方案中依赖审核与规则，不是完整运行时隔离。

### 2.1 三条路线比较

| 路线                         | 编辑器与页面复用                                               | 改造成本                             | 结论               |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------ | ------------------ |
| 可信 Web 插件，同 React 环境 | 能保留 React render、hooks、Slate 上下文                       | 中等，主要是宿主适配和分发           | 本方案建议         |
| 独立 WebView / iframe + RPC  | 独立页面可以；编辑器节点很难保持选区、同步回调和 React Context | 高，需新渲染协议、焦点和资源隔离设计 | 不作为首轮前置条件 |
| 声明式 UI / JSON 配置        | 简单表单容易；现有 React 插件不能直接使用                      | 中高，形成另一套作者 API             | 不满足本次主要目标 |

Worker 可辅助纯计算，但没有 DOM；不能拿它直接执行现有 React 编辑器 render。ErrorBoundary 能处理部分 React 渲染异常，不能终止同步死循环；同环境生命周期超时也无法抢占主线程。

### 2.2 建议的首版能力范围

以下名称为待实现的协议草案，不是现有字段：公共运行配置叫 `portable-web-v1`；能力是可用性声明，不是安全授权。

| 能力                                                                     | 首版范围                                                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| lifecycle / commands                                                     | 复用实例、signal、注册、清理与错误语义；只提供前台可用性                                                    |
| storage                                                                  | 插件工作区私有 KV；沿用现有语义，持久化由移动 Rust 适配；先核对当前 schema 再接命令，不为 KV 复制一套数据表 |
| pages / settings                                                         | React 页面和设置组件，参数规范化，宿主导航、入口和浮层仲裁                                                  |
| editor.elements / editor.commands / editor.codecs                        | 正文场景的节点渲染、修改、插入与 Markdown 转换；不开放原始 Slate 包装器                                     |
| editor.source                                                            | 按需接 `useSourceBlock`、`SourceBlockEditor`，供 ABC 等源码扩展使用                                         |
| media / ContentEditor / 业务 data API                                    | 后续能力；图库或正文页面需要时单独加入，未接通时不宣称兼容                                                  |
| backend / whiteboard / publish / sync / 本地 MCP / 系统通知 / Skill 脚本 | 不进入首版移动运行配置                                                                                      |

可新增只读宿主环境描述，提供 platform、hostProfile、capabilities；必需能力在执行代码之前检查，缺失就拒绝启用。可选功能由作者明确检测后分支；不把桌面后台接口伪装成移动可用。

## 3. 编辑器扩展如何真正接入

### 3.1 装配顺序

1. 启动时先读取安装记录与完整包快照，验证平台、版本、能力与摘要，不因打开插件中心而求值代码。
2. 仅对已启用、兼容且被用户信任的版本求值定义。静态内容定义不依赖页面激活或桌面 Node 服务。
3. 用 `ContentPluginRegistry` 收集扩展、codec 和资源声明；在创建 EditorKit 前冻结本次会话快照。
4. `getMobileContentKit()` 合并正文插件扩展；移动 Markdown 使用同一份 registry 的 codecs。编辑、预览、粘贴、复制导出须使用同一会话版本。
5. UI 实例激活后登记页面/命令/设置；静态内容加载失败的插件不得只激活另一半能力。启动恢复页仍可使用。

当前 [editorKit.ts](/apps/mobile/src/services/editorKit.ts) 按 extras 的 ID 缓存；相同 ID 换版本不会自动换 kit。首版不支持内容插件会话中热替换：更新和启停进入待生效状态，在保存完成后的完整前端重建或下次冷启动切换，届时重建 registry、kit、codec 和组件注入。不要只替换 JS 文件而保留旧 kit。

### 3.2 “能显示”之外必须补的内容

- **移动插入入口**：把插件 `blockPanel` 和适合触摸的命令接到现有移动插入/更多面板；保存打开面板前的选区，执行命令时恢复。当前底部工具栏有固定动作清单，登记扩展不会自动出现按钮。
- **菜单与交互**：菜单贡献映射到移动 Sheet；不能把右键、hover 或快捷键作为唯一入口。外接键盘可继续使用适用的快捷键。
- **源码编辑**：优先复用共享源码组件，再接移动端已有的 editor overlay dismiss；验证软键盘、安全区、选区和只读行为。重型代码编辑器不成为简单文本源码编辑的硬依赖。
- **类型冲突**：拒绝插件覆盖宿主内置类型与其他插件类型。当前 kit 的 `override: true` 服务于图片等宿主覆盖，不应被插件利用来覆盖正文内核。
- **场景边界**：首版仅普通正文及其预览，保持同文档编辑/预览一致；不自动把所有扩展装进闪卡、短文本或白板 kit。
- **未知节点保真**：未安装、停用、版本不支持或加载失败时保留 type、字段和 children，沿用现有未知节点保护。不能为“显示正常”静默改成段落或删除字段。
- **修改与协作**：插件通过现有节点访问与编辑器操作修改当前正文，保留 undo/redo、只读保护与协作操作；不能直接持久化整个旧快照覆盖其他端编辑。
- **移动端 Rust 的转换消费者**：查清搜索摘要、导出、索引等路径是否需要插件语义。首版不声称 Rust 能运行 JS codec；原始正文保真与应用内渲染优先，无法解释的派生结果必须明确降级。后续接入真实消费者时再设计异步转换服务。

现有 [编辑器边界测试](/apps/mobile/src/services/__tests__/editor-boundary.test.ts) 明确断言不装配插件。实施时应改为“默认不装配；显式启用兼容插件才装配”，同时保留所有未知节点保真用例，不能直接删掉边界测试。

### 3.3 真实样本优先级

以下是仓库固定测试包快照，不代表中心最新版本，也不是在手机上已经通过：

| 样本                      | 已核实依赖或行为                                                                                       | 建议                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 计数器模板页面            | pages、storage、settings、sidebar、基础 UI、Dialog                                                     | 首个页面样本；业务逻辑可复用，Dialog/入口必须适配                                          |
| `tau.abc@0.1.0`           | 静态节点 + codec，包内 abcjs；源码组件；main.js 约 0.50 MiB，README 明确无需服务器编译，无音频播放功能 | 首个真实源码块样本；需要作者重新声明移动兼容，不能把现有 desktop manifest 偷改后当正式发行 |
| `tau.image-gallery@0.1.1` | 节点 API、媒体、上传/资源预览、工具栏                                                                  | 第二批，待媒体宿主和触摸操作接通                                                           |
| `tau.html@0.1.0`          | HTML 渲染与源码组件、UI                                                                                | 后续单独审查文档 HTML 内容与宿主隔离，不把不可信文档内容等同可信插件                       |
| `tau.typst@0.1.1`         | 组件实际调用 `services.typst.compile`；包小不代表独立可运行                                            | 不作为首个样本；要么明确只读预览，要么另外落实编译服务                                     |
| `tau.tikz@0.1.0`          | 约 11.3 MiB JS，含编译相关代码与 WebAssembly 使用线索                                                  | 后置做内存、启动与 WebView 性能实测，不能简单归类为“需要 Node”                             |
| `tau.custom-block@1.0.8`  | 约 3.62 MiB JS，动态内容编译/渲染复杂                                                                  | 后置；“支持编辑器扩展”不等于立即开放文档中任意 TSX 执行                                    |
| `tau.questions@0.1.1`     | React 页面与网络等业务接入                                                                             | 可作为复杂页面后续样本，先逐项审计其 SDK 调用                                              |

样本依据：[固定包目录](/tests/fixtures/plugins/catalog.json)、[计数器模板](/scripts/plugins/template/src/index.tsx)、[ABC 使用说明](/tests/fixtures/plugins/releases/tau.abc/0.1.0/README.md)。包文本检索只用于筛选，字符串或 require 文本出现不等于实际执行依赖；不得据此宣称完成依赖安全审计。

## 4. 自定义页面如何兼容现有 SDK

### 4.1 只增加一个宿主路由容器

仿照桌面已有 plugin-page 模式，移动端新增一个通过 `definePage` 声明的通用插件页。插件仍调用 `context.pages.register`，不会直接调用 router 注册函数。

路由参数包含 pluginId、pageId、instanceId、序列化 params；业务参数仍限制为字符串、有限数字和布尔值。host 先 normalize，页面还要验证 JSON 长度、格式与所属插件。history 不存 React 组件、闭包、凭据或敏感正文。

页面身份：`single` 由 pluginId + pageId 标识；`params` 再加入作者 getId 或规范化参数。移动 router 的 bringToTop/返回语义保持原样，不为了和桌面栈机内部一致而改底层导航。

页面组件继续收到 `context / params / pageContext`，由宿主包裹错误边界、主题和插件组件作用域。停用后，旧页面实例不再运行失效 context，保留可返回的“插件不可用”页面；更新后的新实例使用新 mount 身份。

### 4.2 返回、浮层与生命周期

- `pageContext.isActive()` 要判断真实可见顶页、应用前后台与插件 signal，不能仅以组件是否挂载判断。
- `registerDismiss` 在移动端映射到已有 `useBackHandler` / Sheet 返回链。Android 系统返回与 iOS 手势先关闭插件浮层，再进行页面返回；插件不自行监听 history 或系统返回键。
- 现有 Dialog 的 Esc 行为不能代替上述映射。建议在 UI 包增加平台无关的浮层注册/portal 宿主注入点，由 mobile 提供具体实现；UI 包不依赖 mobile/router。
- 页面 portal 挂到当前页或宿主控制的浮层区域，避免 body portal 脱离页面转场、被隐藏页面留下弹窗。
- 页面被压栈与应用退后台是不同事件。Activity hidden 会清理 effect，但应用切后台不保证触发同样的 React 生命周期；宿主需要单独处理暂停/恢复通知与异步失效。
- 首版页面采用及时持久化的表单/计数器；若允许未保存草稿，须补明确的离开守卫契约，不能把“关闭浮层”接口假装成保存守卫。LRU、进程回收不保证内存 state 永远保留。
- `context.sidebar.registerItem` 的可移植导航项映射为移动“插件工具”列表及详情页入口，分组作为逻辑分类，不复制桌面侧边栏尺寸与拖拽布局。不支持的桌面分隔项/折叠交互不得静默冒充实现。

路径依据：[移动 router](/docs/architecture/mobile.md)、[桌面通用插件页](/apps/desktop/src/features/plugins/pages/plugin-page.page.tsx)、[页面宿主组件](/apps/desktop/src/features/plugins/views/PluginPageView.tsx)、[UiProvider](/packages/ui/src/UiProvider.tsx)。

## 5. 包格式与现有插件中心的兼容方案

### 5.1 保留旧包，新增明确的可移植包格式

建议新格式 `formatVersion: 3`，保留当前定义 API 1 与 CJS 单入口；新增 `platform: portable`、targets、hostProfile、requiredCapabilities。具体字段由实施前的协议评审定稿，不在本轮修改 SDK。

| 字段                      | 建议语义                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| targets                   | Android、iOS，以及可选 desktop；每个平台有自己的最低客户端版本，不能拿桌面版本号判断移动兼容 |
| hostProfile               | `portable-web-v1`，由客户端/中心共同识别的稳定能力配置版本                                   |
| requiredCapabilities      | 必需能力集合，未知或缺失时在执行前拒绝；运行配置保证一个明确的 SDK/UI 导出集合               |
| main / styles / integrity | 延续单入口、预编译 CSS、包内资源完整性校验                                                   |
| editor                    | 延续静态内容贡献声明，参与启动快照和重载规则                                                 |
| backend                   | 首版格式 3 禁止；需要 Node 的旧格式 2 继续桌面专属                                           |

首版一个版本只有一个 ZIP、一个 main.js，同时覆盖 Android/iOS；可响应式布局和基于公开能力做分支。不引入同版本多平台产物树，保留现有 `UNIQUE(plugin_id, version)`，避免扩展整个审核、摘要与撤回身份模型。

已有格式 1/2 默认为 desktop，不自动推断“没有 backend 就兼容手机”。作者发布新版本来声明支持；既有 ZIP、releaseId、摘要、来源与已安装版本保持不变。

跨桌面/移动的普通 JS 插件可以逐步改发格式 3，但桌面和博客的 validator/加载器必须先支持它，才允许该版本声明 desktop。Node 插件本轮不强求同 ID 同版本同时提供移动形态；另做轻量版本的需求出现后再设计产物分支，不为未知需求扩展首版。

### 5.2 中心继续共用，增加平台感知的读接口

推荐新客户端使用 `/v2/catalog` 与 `/v2/releases` 的平台感知查询，保留 `/v1` 的旧客户端视图；既有按 releaseId 的详情/下载地址、审核上传链和存储对象继续复用。

请求至少包含 target、该端 appVersion、支持的包格式和 hostProfile。客户端实际能力配置由版本内置；中心只做兼容选择，不能把客户端传来的能力当授权依据。

兼容选择顺序：

1. 过滤已发布、未撤回且可见的版本。
2. 过滤发行版的目标平台与该平台审核资格。
3. 检查包格式、目标平台最低版本、hostProfile 和必需能力。
4. 在剩余版本中选语义版本最高的可安装版本；新版不兼容时仍可返回较旧兼容版。
5. 详情显示本平台 latest 与 compatible；其他平台版本可以单独展示，但不能变成默认安装按钮。

**兼容过滤必须进入候选集、分页、分类计数和游标语义，不能先全量分页后在手机隐藏不兼容条目。**游标应绑定 target、appVersion、格式/profile、搜索排序等条件，避免翻页丢失或混用。

`/v1/catalog` 和 `/v1/releases` 对未声明能力的旧客户端继续只返回旧规则下可识别的 desktop 格式；模板与 Skill 包保留原有类别行为。不能让旧客户端把移动版标为最新版后下载失败。直接打开新 releaseId 时，新客户端二次检查；旧客户端现有 validator 应明确拒绝新格式，不尝试执行。

门户上传校验扩展格式 3；D1 增加 release-target 元信息与平台审核结果/撤回状态，或等价的可索引结构。每项归属同一个 immutable releaseId 和摘要；作者声明平台不等于平台已经获准发布。旧记录默认 desktop，以后采用增量迁移，不重写初始化表或线上旧包。

移动安装必须在客户端重复兼容与摘要校验，不能只相信目录过滤。按 ID 的直链、已下载文件和待生效更新都走同一检查。

兼容示例：同一插件已有桌面 1.0.0，作者发移动 1.1.0；旧桌面目录仍看到 1.0.0，手机看到 1.1.0。后续 1.2.0 提高移动最低版本，旧手机仍选择 1.1.0。支持格式 3 的桌面与博客就绪后，再发布声明三端的 1.3.0。各版本仍各有唯一包，不覆盖已有文件。

### 5.3 安装与更新的移动语义

- 保留中心下载、来源记录、摘要校验、暂存目录、待生效更新、上一版恢复的产品语义；Rust 重写文件适配，不能运行 Electron 安装器。
- 解压前后都检查压缩/解压大小、条目数、路径穿越、重复项、链接和声明文件；目录必须在应用私有容器内。SHA-256 验完整性，来源信任沿用 HTTPS 中心元数据；不宣称现有包已经有独立签名。
- 下载过程遇到后台暂停或系统杀进程，下次启动识别事务并恢复旧可用版本，不留下半安装状态。
- 代码替换只在插件会话未运行时提交。已有编辑器/页面先 flush，结束异步操作，再重建整个前端会话；不要求应用调用 exit，也不把页面普通返回当成“完整重启”。
- 恢复旧代码不自动回滚私有数据；作者需要向后兼容数据结构。涉及不可逆迁移时拒绝无条件回退承诺。
- 启用意图按设备保存，不能把桌面启用状态同步成手机自动授权。插件私有数据是否参与已有同步需单独核实，首版不承诺跨设备同步。
- 包无法启用时保留插件管理和安全启动入口；同环境死循环无法靠普通超时恢复，下一次启动需支持跳过插件。启动标记只作恢复线索，不把所有系统回收误判为插件错误。

## 6. Android / iOS 平台边界

两端共用插件协议和功能清单；平台分支留在下载、持久化、资源 URL、前后台事件和返回输入适配中。Android 允许的额外系统能力不自动加入共同运行配置。

- Apple §4.7 允许特定非内置软件，包括插件；§2.5.2 仍是代码下载的一般限制。§4.7.2 对向插件暴露原生 API/技术有事先许可要求，§4.7.3 要求向具体软件共享数据或隐私权限时明确同意；另外有软件目录及通用链接、内容治理、年龄和支付要求。JS、中心审核或用户点击“信任”都不自动获得这些豁免。[Apple 官方规则](https://developer.apple.com/app-store/review/guidelines/)
- Play 对外部 dex/JAR/so 下载有限制，对 WebView JavaScript 等解释执行代码有例外，但宿主仍负责整体政策合规。本方案不用下载原生模块。[Google 官方规则](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en)
- Tauri capabilities 以窗口/WebView 为主要授权边界，不隔离同页面的每个插件。特别是同环境脚本可能越过 SDK 接触宿主全局对象；不暴露裸 invoke 的作者规则不能被描述成安全保证。[Tauri 官方说明](https://v2.tauri.app/security/capabilities/)

首个 iOS 送审样本宜限制为当前文档内的 ABC 渲染/编辑与插件自有计数器页面；业务数据读取、原生网络代理、系统功能桥接分别梳理，不凭“宿主代调用”推定合规。最小样本通过也不等于以后增加任意能力都自动通过。

## 7. 改造清单与实施顺序

| 改造点        | 现有入口                                             | 具体变更                                                                         |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| 公共包协议    | packages/plugins/src/package.ts、template.ts         | 新格式、按平台最低版本、profile/能力检查；保留旧格式含义                         |
| 公共运行时    | host.ts、rendering.ts、shared-modules.ts             | 复用生命周期，拆出经过依赖审计的移动模块表与能力描述；不复制整个 SDK             |
| 移动包管理    | apps/mobile/src-tauri                                | 私有目录、下载校验、ZIP 安装事务、来源与故障恢复；复用现有 schema 前先查接口缺口 |
| 移动宿主      | apps/mobile/src 的插件功能域/服务                    | 宿主初始化、storage/pages/settings/commands 适配、工作区切换与失活               |
| 页面容器      | features 插件页 + router 公共接口                    | 单一通用路由页，页面身份、参数恢复、停用错误页；不修改纯栈机业务边界             |
| 编辑器        | services/editorKit.ts、editorMarkdown.ts、移动工具栏 | registry 快照、源码组件、codec、一致预览、触摸插入/菜单                          |
| UI 公共基础件 | packages/ui 的 Provider/Dialog 等                    | 平台无关 portal 和关闭注册注入，移动适配由调用方提供                             |
| 中心          | contracts、api/package.ts、api/releases.ts、D1       | 格式校验、v2 兼容筛选、平台审核、旧 v1 视图保护、按平台版本展示                  |
| 作者工具链    | scripts/plugins/template 及公开 SDK 文档             | 声明平台与能力、发布新版本、禁止隐式桌面依赖、平台样本与构建目标                 |
| 桌面/博客     | 现有包验证、渲染和发布收集                           | 当格式 3 声明 desktop 时一起升级，保证同一已安装版本仍可发布                     |

建议下一轮按以下顺序实施，不能把第一步成功写成整体上线：

1. **最小运行闭环**：开发专用临时包输入，单个计数器页面、私有 KV、前后台恢复；Android/iOS 均使用真实 WebView。不接生产中心，不扩业务数据。
2. **真实编辑器闭环**：ABC 新的移动声明版本，插入 → 编辑源码 → SVG 预览 → 撤销 → 保存 → 冷启动 → 未安装端保真；然后才评估图库。
3. **中心与安装闭环**：平台感知查询、真实测试发布版本、包校验、升级/中断/回退、旧桌面兼容。使用测试环境，生产发布另行安排。
4. **分发验收**：正式构建、平台审核最小路径、资源预算实测；达到条件才扩首版能力集。

开发临时包入口只供刺探，不恢复生产 ZIP 侧载或测试包预装。这与“正式插件只来自中心”的现有方向一致。

## 8. 下一轮可执行的通过/失败判据

| 验证项           | 通过判据                                                                                                            | 失败意味着什么                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 同一个包双端运行 | Android 和 iOS 加载相同包摘要；无 Node/桌面 import；共享 React hooks 正常                                           | 需修依赖/加载协议，不能宣称包级复用        |
| 页面             | 计数器存储可恢复；参数页去重正确；停用后旧 context 不写数据                                                         | 页面/存储适配未完成                        |
| 返回与浮层       | Android 返回、iOS 手势先关 Dialog 再退页；隐藏页无遗留 portal                                                       | UI 宿主适配未完成，不等于 React 方案不可行 |
| 编辑器           | ABC 能插入、编辑、撤销、保存、重开；只读不写；桌面/移动节点结构一致                                                 | 编辑链路未完成，不以截图有 SVG 替代        |
| 未知节点与 codec | 缺插件时原始数据保留；已启用时 Markdown 进出保持语义；不覆盖内置类型                                                | 跨端数据风险，禁止扩大灰度                 |
| 版本切换         | 同 ID 新版代码、样式、kit、codec 一起切换；断电/杀进程后仍有可用版本                                                | 安装事务或会话边界错误                     |
| 中心兼容         | 旧 v1 不被移动版本污染；分页/分类与 target 一致；直链也二次校验                                                     | 中心协议不能发布                           |
| 性能             | 记录低配 Android/iPhone 的包加载、首屏/首块耗时、长文滚动、峰值内存、恢复时间，比较同文档无插件基线；按结果制定预算 | 不能凭桌面表现承诺移动体验                 |
| 正式分发         | 平台审核明确接受实际能力和目录/数据授权流程                                                                         | 开发可行与商店可交付应分别记录             |

Agent 执行类型、行为、构建和必要结构检查；触摸视觉、布局和实际编辑手感由用户验收。原生 WebView 行为测试不能用 jsdom 或桌面浏览器结果替代。

## 9. 本次证据、结果与下一步

当前环境未提供任务列表工具，本次按阶段记录：

- COMPLETE：Investigate/Triage/Understand the problem。核对 SDK、移动 router/EditorKit、中心版本选择、包唯一性、真实固定样本与平台规则。
- COMPLETE：共用方案与兼容设计。确定建议路线、复用矩阵、格式/中心草案、页面和编辑器接线、下一轮通过判据。
- COMPLETE：现有基线回归与文档检查。只运行已有测试，未新增产品或测试代码。

已执行：

| 检查                                                 | 结果                          | 能证明的范围                                     |
| ---------------------------------------------------- | ----------------------------- | ------------------------------------------------ |
| SDK pages/content/rendering/element/lifecycle 五文件 | 18 项通过                     | 现有核心契约回归通过，不是手机安装验证           |
| mobile 编辑器边界/覆盖、参数 schema/栈机四文件       | 23 项通过                     | 当前移动底座和未知节点保护正常，当前仍不加载插件 |
| `pnpm check:docs` 修改前                             | 150 个 Markdown，0 警告，通过 | 基线文档检查                                     |
| `pnpm check:docs` 完稿后                             | 151 个 Markdown，0 警告，通过 | 新增调研快照命名与链接符合规则                   |

复现测试命令：

```sh
pnpm --filter @tau/plugins exec vitest run src/__tests__/pages.test.ts src/__tests__/content.test.ts src/__tests__/rendering.test.ts src/__tests__/element.test.ts src/__tests__/lifecycle.test.ts
pnpm --filter mobile exec vitest run src/services/__tests__/editor-boundary.test.ts src/features/cards/__tests__/editorElementCoverage.test.ts src/router/core/__tests__/paramsSchema.test.ts src/router/core/__tests__/stackMachine.test.ts
pnpm check:docs
```

没有进行手机实机、模拟器插件运行、视觉走查或商店送审；这些仍是后续实施验证，不能归为本轮通过。本轮只产出 notes 快照，不创建或遗留进行中任务目录，也不把未落地设计写进 architecture/decisions；docs/README 已有 notes 分类，不新增指向快照的活文档链接。

紧接着的下一步是按第 7 节第 1–2 步编写最小验证实现：先计数器页面，再 ABC 编辑器扩展。该实现不在本轮“先不写代码”的授权范围内。
