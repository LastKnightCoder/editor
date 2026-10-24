# 桌面端架构（权威交接文档）

> 给接手的上下文/协作者：本文档是桌面端代码的权威说明，读完即可按既有架构、UI 与交互风格继续开发。token 与组件规范见 [design-system.md](./design-system.md)。

---

## 0. 上手顺序

1. 读本文档全文（≈10 分钟）；
2. 打开 `apps/desktop/src/app/AppShell.tsx` → `Sidebar.tsx` → `page/` 目录过一遍；
3. 跑 `pnpm dev`（desktop），主窗口即新壳层。

## 1. 结构现状

- 主窗口 = AppShell + PageProvider + Activity 保活；33 个 Page 由 `features/**/pages/*.page.tsx` 自动注册（Vite glob），侧栏与命令面板走新入口；设置是壳层浮层；独立编辑、Markdown、快捷卡片、番茄是独立 feature 窗口。
- 今日页接真实数据（统计并入今日页）；项目只承载文档树，数据库与 Notebook 是独立模块。
- 主题唯一归属 `@tau/themes`，UI 原语唯一归属 `@tau/ui`；样式载体 Tailwind，手写 CSS 仅限 §4 的四类白名单；Less 与 antd 全仓为零且有门禁。
- 壳层启动时序：必须等设置 store 的 `inited` 再连接活动数据库——缓存已有库名不代表设置初始化完成；初始化期间保持等待，就绪后自动连接；真实开库失败继续显示错误并支持重试，不得以绕过失败代替连接成功。
- 窗口角色由 preload 的 `window.electron.windowRole` 提供，不在隔离渲染上下文读取 `process.argv`；设置完整初始化与微信读书启动校验只在主窗口执行。辅助窗口经 `setting-replica` 的 BroadcastChannel 请求主窗口运行时快照后置 `inited`（保留已校验状态、不回灌保存），各窗口仍订阅后端设置变更并可提交本地修改；无主窗口响应的独立窗口 1.5 秒后只读后端快照兜底，迟到响应不覆盖已收快照。主进程设置文件的首次并发读取共享在途任务，失败后允许重试。
- 切库按活动库名重建壳层与页面栈；`ensureDatabaseReady` 在连接成功且确认仍为当前库后、发布 ready 前清空全局查询缓存，并取消旧查询的结果接收——未带库名的查询不得跨库复用新鲜缓存或在途请求，迟到的旧连接结果不得清除当前库缓存（只作用于查询，不清 mutation 状态）。
- 交互聊天与一次性带工具运行共用消息准备入口：图片传路径或 data URL、文件传本地定位提示；系统提示中的退役代理片段只从系统提示移除，用户正文保持原样。

## 2. 目录结构与文件职责

```text
apps/desktop/src/
├── app/                 # 壳层、导航清单、布局与全局浮层装配
├── page/                # definePage、双注册表、栈机、Provider、Activity 保活
├── features/
│   ├── home/            # 今日与统计；pages / views / queries / types
│   ├── projects/        # 文档树列表、详情与条目工作台
│   ├── databases/       # 数据库列表与详情
│   ├── vibe-learning/   # Notebook 列表、详情、生成与测验
│   ├── cards/           # 卡片墙、详情及快捷卡片窗口（图谱已移到 knowledge-map）
│   ├── flashcards/      # 复习页、编辑与复习会话
│   ├── walk/            # 随机漫步：随机抽旧内容重温，顺岔路（双链/语义/同标签）走到相邻内容
│   ├── pdfs/            # PDF 列表、阅读器及页面作用域对话
│   ├── search/          # 命令面板与检索
│   ├── settings/        # 设置浮层、分区单源与各子页
│   ├── editor-window/   # 卡片、文章与项目文档的独立编辑窗口
│   └── markdown-window/ # 文件窗口、文件树与源码模式
├── components/          # 应用级业务共享层；消费者决定归属
├── services/            # Page 导航、正文入口、pi 运行时与内容编辑协议
└── pages.ts             # Vite glob 自动注册 Page

packages/ui/src/         # 公共原语、浮层底盘、hooks、cn
packages/themes/src/     # token 契约、主题定义、运行时与 CSS
packages/database/src/   # 多视图 Database、投影、store 与通用字段插件
```

目录示意只列高频域。新增页面在 features 内声明；原 pages 目录已清空，背景音归 pomodoro/windows，测验题面归 vibe-learning/components/quiz，卡组表单归 flashcards/components/DeckSelectorDialog。

高频入口：`app/navigation.ts`、`app/navSlots.tsx`、`features/settings/sections.tsx` 与各域 queries。

### 数据基线门禁

所有历史迁移、退役与旧格式转换代码（含读取期兼容）已物理删除。开库、备份恢复与同步下载写入前执行统一基线门禁：

- 桌面：`assertNoLegacyTables` 按共享旧表黑名单（`packages/db-schema/src/legacy-tables.json`，与 parity 脚本同源）拒绝未完成升级的旧库，报 `DB_LEGACY_SCHEMA`，提示先用最后升级版本打开完成升级。
- 移动端：`MAIN_SCHEMA_VERSION=9`，高于当前版本拒绝降级（`DB_SCHEMA_INCOMPATIBLE`），4–8 版本执行显式升级，更早非空库拒绝；下载验证走同一门禁。
- 数据库下载与新快照发布只接受同步信封版本 5；版本探测与上传前父版本读取允许历史元信息（0–5），不下载或转换旧数据。版本 5 含正文任务高级属性、周期实例历史与操作回执，不能由旧端按旧语义回写；所有旧端必须在版本切换前停用。
- `migration_meta` 保留项目域共用实体序列与任务、日程、正文的非复用编号高水位。

schema 演进：桌面修改 schema 分片并重建 bundle（parity 校验守护）；移动端版本号递增并编写显式迁移，同版本 hash 变化仅补建新表与新索引。聊天会话的事实源是 pi JSONL 文件与 chat_session 目录表。

### 已退役功能与保留边界

以下功能已整体移除，残留旧表的库由数据基线门禁拒绝，不恢复、不保留兼容层：

- **知识库** → 并入普通文档树项目（project / project_item，条目带 tags，正文复用 contents 原 ID）；侧栏、首页、统计、发布与插件只消费项目。
- **RSS / 稍后读 / 博客 RSS 输出**：不再有相关 Page、表与 RPC；扩展保留剪藏；博客不再生成 rss.xml，publicUrl 保留用于打开站点。
- **编辑器引用块**（对话引用、问题引用/创建扩展）：编辑器不再识别退役节点名单，旧导出文件中的退役块按未知节点规则呈现；问题、答案与关联记录归问题插件。
- **Codex 代理**：各聊天入口只运行本地 pi 代理，主进程不注册 Codex 模块；历史 Codex 工具经通用折叠行只读展示。
- **资源管理页与主库资源登记**：聊天附件直接消费上传返回路径；协作缓存资源表、通用文件与媒体服务、上传设置和资源同步保留。
- **音频笔记**（项目条目 `audio-note`）：编辑器 `:::audio`、播客、TTS、背景音与共享转写保留。

### 对话工作目录

可选目录只属于主对话（对话页 / 停靠栏），按对话记录在 `chat_session.cwd`。设置「工具权限 → 工作目录」的 `agentWorkspace.defaultCwd` 只决定新对话：草稿首轮登记时写入所选或当时默认目录，之后改默认不影响已有对话；目录为空的对话跟随默认。取值统一走 `useChatSessionStore` 的 `resolveChatCwd` / `useChatCwd`，ChatContainer 每轮传给 `ensureChatSession`（非主对话传空）；cwd 变化与模型变化一样按会话文件重建宿主，子代理经工具上下文的 `cwd` 继承。宿主请求带 `chatScope`，主进程 `pi-workspace.ts` 的 `resolveSessionCwd` 据此解析：学习项目对话固定在资料 Markdown 目录（`vibeLearningMarkdownDir`），其余空或不存在的目录落到应用数据目录（`~/.editor`）；`pi-session:workspace-info / workspace-branches / workspace-checkout` 提供仓库分支读取与切换。输入框上方的 `WorkspaceBar`（ChatContainer 的 `composerAccessory` 插槽，数据走 `features/chat/workspaceQueries.ts`）显示目录与分支，对话进行中禁用切换。浏览器扩展对话不传 cwd。

### 插件页面与作者 API

- 插件页面统一经 `features/plugins/pages/plugin-page.page.tsx` 承载，动态定义只在 `DesktopPluginRuntime` 登记，Page 栈机与双注册表不动。承载参数为 pluginId/pageId/instanceId + 标量参数 JSON；single 页每插件页面一实例，params 页默认按完整参数去重、可自定义 getId；`open()` 缺省传空参数，返回/前进保留栈条目自己的参数。
- 页面从 `PluginPageProps.pageContext` 取实例级上下文登记：`useEffect` 中 `register(() => value)`（任意有限 JSON，宿主不规定结构；MCP 的 `get_current_context` 原样返回快照）、`isActive()`（Activity 可见即栈顶）、`registerDismiss(dismiss)`（显示时挂入 Esc 仲裁，隐藏摘下、再显示按序重挂，插件停用清除）。不提供显示状态通知——effect 生命周期即显示状态（`services/plugin-page-context.ts`）。页面操作由作者自注册 MCP，不加工具分发或导航协议。
- 停用先取消上下文，当前页面改为不可用提示并卸载组件与 UI Portal；重新启用以新 mountId 创建组件，错误边界按代次重建。页面栈条目保留；功能入口随注册资源回收。pageContext.registerLeaveGuard 接通用 PageProvider 守卫，离开前依次检查，停用后不继续阻塞。
- 作者从 `@tau/plugins` 用定义/上下文/页面 API，从 `@tau/ui` 用组件；SDK 根入口只引 React 类型不加载 UI/DOM。`ctx.pages.register` 返回可打开与注销的页面句柄，页面组件不直接导入 Page/store。私有存储 `context.storage` 在 Electron 存当前库 `plugin_kv`（随云同步），浏览器预览用 localStorage 适配。
- 生产装配：`DesktopPluginProvider` 不默认注册任何业务插件（主题切换示例只在测试夹具）；用户从插件中心安装，生产包禁用 ZIP 安装（开发模式保留）；官方插件与模板以 plugins/ 下的 Git submodule 维护独立 GitHub 历史，主仓库固定提交，安装到 `~/.editor/plugins`。开发构建的「插件开发台」（plugin-workbench.page）与编辑器实验装配仅开发构建加载。
- 已启用状态：`plugin-local:set-enabled` 写主进程 `plugins/.enabled.json`（唯一写入者），窗口 localStorage 仅镜像；写入广播 `plugin-local:state-changed` 各窗口重读权威快照；SDK Node 入口 local-state 只读。普通页面插件即时启停，静态内容插件完整重启后生效；活跃内容插件须停用并重启后卸载，切库不改变编辑器快照。

应用根部注入响应式插件环境，DesktopPluginRuntime 的语义 navigation 入口复用真实侧栏模型；插件页通过 PortalScope/UiHostProvider 接浮层仲裁。显式开发目录、格式 3 装配及独立内容转换边界见[跨端插件宿主](/docs/architecture/plugin-portability.md)。

桌面 0.59.1 的固定插件中心安装接受格式 3，目录/详情/版本/下载使用 v2，主进程提供 desktop 宿主版本与协议集合。格式 3 targets 只声明平台最低版本，不再携带能力列表、节点等级或贡献标记；宿主从实际定义识别静态贡献。安装复用原事务、启停和启动快照，清单不改写为旧格式；下载前后复查精确发布版本，暂存/恢复与启动对账原始清单及来源。正式构建忽略调试中心覆盖，拒绝无固定中心来源的格式 3；旧格式读取与系统后台审核保持。

### 聊天工具自定义渲染

唯一注册表在 `@tau/chat-ui/renderers`。作者在 activate 中 `await ctx.chat.registerToolRenderer({ mcpId, toolName, component })`，只引用本插件 MCP 的原始工具名；PluginHost 激活前校验、成功后发布，工具名 SHA-256 与历史偏好键不变。展示不受 MCP 执行开关/连接状态影响；signal 失效立即卸载，切库先清理旧运行时。本地工具返回 `{ content, render?: { version, data } }`（有限 JSON + 正整数版本），经 pi details 保存，实时与历史投影都保留 details；失败/取消回通用工具行，未知数据版本由插件 renderDefault 回退。渲染选择再校验绑定：只按实际 execution.toolName 命中，插件不能改选他人绑定；插件接收 execution 独立快照，不能改写宿主消息。不新增聊天 schema、内置工具覆盖或 MCP Apps 运行器。

### 文件转录与 ASR

文件语音识别的公共契约与运行时在 [@tau/asr](/packages/asr/README.md)。`transcription` 仍是 BACKGROUND 模块：窗口文件与分段命令通过内置 `createWhisperASR`，结果交回现有媒体流程；`whisper-engine.ts` 复用既有程序与模型目录，先由 ffmpeg 转为 16 kHz 单声道 PCM Int16 WAV，每次识别独占临时目录，只有进程正常退出且本次 SRT 可读才交付结果。词级结果保留原始对齐；旧媒体字段仅在宿主结果扩展 `sourceResult` 中保留，不把推断置信度或字幕末尾时刻当作公共 ASR 的测量值。

文件命令第三参数可传 signal/onProgress。渲染端在模块就绪后登记 taskId 并订阅，进度只交给对应任务；取消使用不继承已取消命令作用域的 IPC。主进程按窗口与 taskId 隔离任务，窗口销毁、重载、切库或应用退出会取消；子进程退出后再清理目录，取消后的成功结果不交付。长音频队列每次调用拥有独立工作集，任一分段失败会取消同任务的其他分段并等待退出。媒体导入仍有直接消费共享引擎的入口，其业务编排不归公共 ASR 包。实时会话的格式、尾帧、超时和取消由公共运行时约束；原生和插件语音输入由下述独立编排装配。

### 实时语音输入

`speech-input` 为 BACKGROUND 模块；跨窗口麦克风租约由主进程维护，窗口销毁、重载、切库、心跳过期及退出会终止会话。渲染层通过 `ensureModule` 获取就绪保障；共用 `@tau/asr` 的 AudioWorklet 采集、重采样、PCM Int16 编码、尾帧排空与取消编排。麦克风仅在用户点击后申请，不自动切换云端提供方。

Mac helper 独立打包在 `bin/darwin/Tau Speech Helper.app`，macOS 26 上采用 SpeechAnalyzer、SpeechTranscriber、medium SpeechDetector，持续消费识别与 VAD 流；管道按实际到达字节读取，输出逐段修订，end 等 finalize 与结果流完成。构建脚本生成当前架构或通用二进制；旧系统及 Windows 探测返回不支持原生路径。

插件通过公共 `context.asr` 注册，账号经语音输入设置的专用命令保存，普通全量设置提交保留主进程已保存的 speechInput，渲染缓存不持久化账号。`context.websocket` 提供标准事件、状态和同步 send/close，鉴权头、取消与有界背压由通用宿主桥接；不包含厂商协议。

当前桌面只保留语音输入服务，不挂载麦克风按钮、语音输入设置、AI 整理配置行或输入目标。`desktopSpeechInput` 与 `prepareSpeechRefinement` 由未来消费者显式调用，壳层不触发录音或模型请求。ASR 设置声明仍可注册，插件详情不显示其表单，open 返回入口不可用；现有视频转录与 TTS 界面独立保留。

整理服务读取 `llmUsageSettings.speechInputRefinement` 与 `speechInput.refinement`，复用 piStreamText 无工具单发，仅处理最终转录；原始结果与整理文本分开，失败／超时回退原文，取消不交付结果。配置数据和保存命令保留；入口、预览、原文查看及草稿提交界面由后续消费者决定。

### 领域提供方插件（TTS / 图片 / 在线视频）

三者为同一模式：渲染进程注册实例、主进程 `plugin-local:<域>-*` 只转发请求/取消/通知、设置页经 `<域>-settings-migration` 备份后逐账号迁移旧配置（不自动安装插件、不自动改用其他付费账号）。

- **TTS**：`context.tts` 实例只在主窗口渲染端创建，账号配置按实例 ID 隔离；播客从脚本到提交固定实例，会话关闭使后续上传/保存失效，普通失败保留空片段。设置提交走 user-setting 串行队列（原子落盘→快照→广播），失败保留已提交快照可重试。
- **图片生成/编辑**：`context.images.register` 注册实例（生成与编辑至少实现一项，输出图片字节与实际 MIME）；`target: "images"` 配置视图接收 imageConfig。聊天/编辑器/白板共用 `services/image-generation.ts`；输入输出各最多 16 张、总字节各 ≤128 MiB，只收 PNG/JPEG/WebP；能力状态按配置与激活代次异步刷新，执行时复核；历史工具来源与结果键稳定，已生成图片无需插件即可展示。
- **在线视频**：`context.video.register` 注册实例（`matches / resolve / cacheKey / getPlayback`，返回播放源描述——file 单流 / split 音视频分离 / extract 走宿主 yt-dlp，不传视频字节）。宿主无平台代码：主窗口 `app/plugins/video-registry.ts` 执行并归一化结果，下载/合并/缓存统一在主进程 `online-video-cache`（缓存身份 = 插件 ID + cacheKey 摘要，已缓存不向插件取流）。视频元数据 `metaInfo.type` 即插件 ID（`type/title/thumbnail` 宿主占用，其余字段归插件）；编辑器/白板/视频笔记/学习资料共用 `useOnlineVideo` 与 `OnlineVideoSelectModal`，添加入口按插件生成、弹窗只用该插件解析（链接属其他插件时提示改入口）。界面文案不出现「视频插件」统称：能用来源名用来源名，统称叫「在线视频」；移动端/博客/浏览器扩展只显示降级提示。

### 插件 MCP 与 AI 服务

- `ctx.mcp.register` 可注册多项本地 tools 或外部 transport（stdio / streamable-http），两者互斥。激活成功才发布，失败/停用/切库回收；来源按「插件 + MCP 局部 ID」隔离生成稳定工具名，激活/重连代次进执行身份；执行复核实例、数据库、整项与逐工具开关，合并取消信号、限时 60 秒。MCP 页面与聊天快捷面板经 useMcpServers 同源展示并注明插件来源；外部项复用配置/日志/重连，本地项只展示工具；外部连接绑定窗口，窗口关闭/崩溃断开不改变手动服务器生命周期。
- 插件 AI 两条路径：自定义功能由 `ai.features` 声明并独立分配模型；`context.ai.requestCapability(name)` 复用应用已有分配。能力名/显示名由 SDK 的 PLUGIN_AI_CAPABILITIES 提供（与 llmUsageSettings 键集合测试对账，新增内置分配不得遗漏 SDK）。PluginHost 统一校验声明、懒申请、逐次检查与撤权取消；主进程 BACKGROUND 模块 plugin-ai 用同一插件额度、并发与审计执行 pi-ai，模型解析前登记取消句柄。chat/stream 支持文本与 user 图片（图片与正文不入审计、总大小有界）；插件设置对宿主能力只显示继承模型与额度。作者用法见 `plugins/tau-plugin-template/docs/ai.md`。

### 独立后台

- 格式 2 的 `backend` 与渲染入口分开构建、静态核验；主进程 `plugin-backend` 为已授权包启动独立 utilityProcess，`ctx.backend` 只取得本插件连接——支持请求/事件/取消、版本摘要授权、进程超时回收与失败熔断。外部工具由宿主监督；Node 插件仍是高信任代码，不是 OS 沙箱。详情页「本机后台」管理授权与重启，业务数据权限不自动授予后台。
- 后台按 application/workspace 作用域支持按需与就绪激活，持久授权才跨重启生效；宿主本机偏好管理登录后隐藏与关窗保活，系统登录项读真实状态（设置在「关于与更新 → 启动与后台运行」，托盘可暂停/恢复）。受控退出先登记回执并通知窗口收尾，共享期限内保留已授权调用使退出同步可完成；回执结束或超时后拒绝新调用并回收后台。Windows Job Object 与各平台登录启动须实机验收。
- 异步数据库命令：同步命令用 better-sqlite3 同步事务/保存点；异步编排不包外层事务，网络等待后由领域写入方法开同步事务并重查修订；索引异步写入不跨等待持有事务。后台会话被授权变更/撤销/停用关闭时通知渲染端丢弃令牌，恢复仍有效的订阅；失败 RPC 不自动重放。
- 内容转换统一经 `ContentExecutor`：独立 `content-runtime.html`（sandbox、禁 Node、无业务 preload）消费固定包快照；队列/超时/取消有界，写入前复核库连接与修订，失败不写过时结果；无插件快照时可用纯内置转换。生产主进程与 Node worker 不求值插件定义（`pnpm check:plugin-process-boundaries` 守护）。
- 安全与更新：插件中心后台版本必须人工系统能力审核（CI 不自动批准）；客户端来源记录绑定 Release/版本/ZIP 摘要，本机授权再绑定安装路径与完整清单；联网状态缓存 ≤1 分钟，运行后台与插件 stdio MCP 定期复核已知下架；离线不能感知未获取的撤回。插件 stdio MCP 须匹配 backend.tools 并获后台授权；更新在有任务/订阅/MCP 租约时拒绝切换，空闲后整包原子切换、新版本等待独立授权。
- 下载统计：插件中心按 downloads7d/Total/updated 排序，主进程按页读取供发现/更新/详情共用并按 pluginId 去重；匿名凭证存 userData/plugin-center（按 API origin 区分、0600、跨工作区复用、不经 IPC 返回）；旧服务无统计窗口时不展示虚构零值。

### 静态内容插件

格式 3 的白板插件沿用 whiteboardExtensions，作者不重复声明类型或白板能力标签。宿主在内容进程求值实际定义，识别并校验扩展后沿用静态装配、重启生效与工作区偏好；安装兼容性统一使用目标平台与最低版本，桌面基线为 0.59.4。移动目标不承载白板插件。

- SDK 的 `editorExtensions` / `editorCodecs` 是正式静态贡献（manifest `editor: true`）。主进程开库前按 `.enabled.json` 静态读取已启用内容包并交独立内容渲染进程校验定义，只保存通过校验的快照；`initializeContentPlugins` 在 React 挂载前读取快照，校验类型冲突并装配 CSS/codec；`createDesktopKit` 在底座上 extend 贡献不重建打开中的编辑器；开发台 `context.editor.register` 只用于实验。
- 桌面与博客的插件贡献由 `@tau/plugins/content` 的 ContentPluginRegistry 保存只读快照；博客发布按用户已安装版本收集 main.js/CSS 在浏览器加载。移动普通正文在自己的 EditorKit 上装配受控跨端快照；浏览器扩展仍用原生套件，未知节点按通用保护保留原数据。
- 领域插件的节点边界：HTML 行内与块级归 tau.html 插件（SDK 的 useInlineSource/insertInlineSource，插件不得打包自己的 Slate；Markdown 认领归已启用插件，缺包保留文本或未知节点 JSON）；ABC 归 tau-plugin-abc（内置 diagram 只剩 Mermaid、PlantUML；HTML 导出优先插件 SVG，缺包保留转义源码）；Typst 使用插件自带的浏览器 WebAssembly 编译器（预览挂载不写文档，仅用户编辑源码编译成功后持久化缓存，博客用缓存或源码回退）；TikZ、custom-block 同为独立插件。两类 HTML 的静态导出 CSS 按 styleSources 收集，宿主无专属类型名单。
- `SourceBlockEditor` / `useSourceBlock` 由 SDK 提供（内部复用 PreviewWithEditor）；宿主共享模块初始化 source-editor-host，作者入口只依赖 SDK。
- 插件 Skill：包内 `skills/<id>/` 目录（manifest.skills 列出并进 integrity）；只声明 skills 的是独立 Skill 包（`packageKind: "skills"`，不进 PluginHost、不参与启停）。主进程收集声明目录，与「我的/关联目录」经 `skill:list` 返回（标识 `pluginId:skillId`），读取与脚本执行只放行声明目录；渲染端按本窗口 PluginHost active 状态过滤插件来源，Skill 包始终可见。带脚本的 Skill 与独立后台共用 `requiresSystemReview`（门户不能自动批准），脚本执行沿用 run_skill_script 的 execute 确认。

### 博客发布（宿主与模板分工）

- 宿主只生成数据：六类摘要 JSON、ContentRef、`version/documents` 搜索索引与内容插件产物；不提供阅读器、预览 UI、路由、React 依赖映射或站点脚本。公开类型从 `@tau/plugins/publish-data` 消费，数据客户端由 `@tau/blog` 或 `@tau/plugins/publish-client` 提供。发布命令附带编辑器内置类型、插件节点归属与 JS/CSS 摘要；主进程重验磁盘包，worker 的 PublishPluginCatalog 只处理数据不执行作者代码；缺渲染支持的节点按类型汇总警告不阻止发布，节点数据原样输出（网站按未知节点保护显示占位）。每份内容声明实际使用的插件依赖，产物写入带版本与摘要的 `plugin-assets/`。
- 站点级数据（发布外观、项目列表、卡片标签树、项目目录树）只写清单一次；内容文件只含自身正文、资源依赖与 `links`（本文已发布的站内链接目标）——增删一条内容只影响链接到它的文件。动态 CSS 过渡为 `data/styles/<sha256>.css` 按原文全局生效；图标在 `_tau/site/`。同一项目内共享文档可在多个目录分支，入口全保留，正文/前后篇/搜索按文档 ID 去重，面包屑取深度优先首现；不同项目的 key 按项目 ID 隔离。`project-card-list` 在生成阶段保留卡片节点，按项目树顺序生成已发布子文档的卡片快照（标题、80 字摘要、ContentRef），`@tau/blog` 内置渲染与桌面共用 DocumentCard/Grid。
- 博客模板用静态分发分支 `template: { protocolVersion, root, entries }`：只含静态产物，声明代码入口的模板包直接拒绝；沿用中心安装/更新/恢复事务；发布设置从已安装模板选择，主进程冻结全部资产并校验 SHA-256。宿主保留 `_tau/`、`data/`、`plugin-assets/` 协议目录；只替换入口 HTML 真实属性里的 `__TAU_MANIFEST__`/`__TAU_BASE__`（未知占位符报错），JS/CSS 字节不变、不执行模板构建；深链由模板自己处理（官方模板把 404.html 列为第二入口）。
- 站点配置分两层：宿主只保留标题、图标与发布目标公开 URL；其余字段由模板在 `template.siteFields` 声明（text/textarea/url/select/switch），宿主校验后在「站点设置 · 博客模板」按声明渲染，值按模板 id 存 `publish.site.fields`，发布时 `resolveSiteFields` 只输出已声明键回落默认。连接状态与测试连接归宿主，发布插件表单按宿主行式渲染自动保存。
- 发布计划在 worker 计算，只回传路径/摘要/依赖描述；实际发布按物理目标记录成功资源，增量上传依赖后才更新入口；失败重跑完整计划，无按文件重试接口。`publish-releases/` 只保留当前与前一轮有变化的成功元信息；撤下内容清理旧正文/聚合/索引优先于缓存保留；Git 发布只提交计划内文件不强推；S3 仅为协议保证的摘要资源设不可变缓存。官方模板在独立 `tau-blog-template` 工程（路径路由 + 404 回退、按 key 取数、正文/预览各持数据上下文与 EditorKit），不是第三方模板准入要求。

### 插件服务与提供方

**博客发布提供方**：GitHub 与 S3 发布由独立 tau.publish-github / tau.publish-s3 提供，`context.publish` 注册文件式或快照式实例；发布页只消费活动注册与 `target: publish` 配置表单（publishConfig 按应用级插件身份保存）；本地导出内置不要求发布插件，缺失或停用保留配置不回落其他提供方。渲染端 publish-registry 与常驻 publish-bridge 执行作者代码，主进程 PluginPublishSessions 绑定发起窗口/配置/任务 signal，只转发 open/call/close 与字节；发布占用阻止启停/更新/卸载/重启，切库回收实例。文件式并发受提供方上限约束、依赖成功后才更新入口；快照式整轮远端确认后才记账。Git Push 走受控 `services.git.publishSnapshot`：主进程只执行固定 Git 流程（输入为临时发布句柄、无凭据的 HTTPS 远端、分支、提交者、缓存授权 ID），目录选择由宿主返回句柄，插件不能传任意 cwd/shell；认证经任务级 askpass 环境传递不落盘；拒绝非快进。旧 publish.github/s3 配置由最后升级链备份转换，物理身份字符串保持；无目标账本时完整上传不借用其他数据库全局历史。

**编译与转换服务**：`context.services` 提供 Tailwind、Typst HTML、Markdown 与 Descendant[] 双向转换、HTML 渲染与 FFmpeg 处理（TikZ 服务已移除——编译器和字体归独立 tau.tikz 插件）。Provider 注入 `app/plugins/services.ts`，SDK 合并调用方与实例 signal，停用不返回迟到结果；服务不读写业务内容、不选存用户文件。主进程 `plugin-services` 为 BACKGROUND 模块：任务按 WebContents 归属，关闭/导航取消；编译器与媒体进程独占任务临时目录、完成后回收；FFmpeg 复用客户端按需下载的二进制。TikZ 文档与博客用插件自己的节点组件与内部编译模块（不依赖 activate），缺插件时保留源码并跳转插件中心；diagram 扩展不再含 TikZ，移动端/扩展不设替代编译器。Markdown 复用 desktopCodecComposition（单次 codecs 不改编辑器注册）；HTML 沿用现有序列化器（保留原始 HTML、外部资源与图表源码回落，不是净化器）。作者契约见 `plugins/tau-plugin-template/docs/services.md`。

**摘录提供方**：`context.excerpts` 由 `app/plugins/excerpts.ts` 适配——来源类型即插件 ID，调用经 `bindDatabaseCommands` 固定原库并带 signal；`register` 异步登记名称与打开函数，停用注销；主进程在 `tables/excerpt.ts` 校验（保留名 `web` 拒绝），写入事件进 `EXCERPT_WRITE_EVENTS` 驱动索引与脉络刷新。微信读书为 `plugins/weread` 插件（内置实现已删除），主窗口外链统一交系统浏览器。材料动作沿创建时的 databaseName 与 signal 传递：切库/停用后的迟到结果不唤起新工作区界面；创建请求发出后谱系仍绑定原库完成。

**资源上传**：默认本地，远端由渲染进程插件经 `context.upload.register` 提供（设置分区 `target: "upload"` 挂「资源存储」）；宿主负责压缩、唯一命名与配置快照；独立编辑/Markdown 窗口经 plugin-local IPC 转发到已连接的主窗口渲染宿主（主进程不加载插件、不建隐藏窗口）；窗口关闭/导航/宿主释放/插件停用后拒绝在途结果。GitHub/OSS/S3 旧图床与 WebDAV 图床已退役；GitHub/S3 博客账号已迁到发布插件配置。

**标准 fetch**：插件经 `@tau/plugins` 的 `context.fetch`，其他桌面调用用 `commands/fetch` 的 desktopFetch——原生 fetch 类型（RequestInit/Headers/FormData/AbortSignal → Response），无兼容层。两端复用内部 `@tau/plugins/fetch-bridge`，上传按最多 256 KiB 分块并等待背压，响应按需读取；该入口不进入作者 tarball。fetch 模块为 BACKGROUND（ensureModule 保证就绪）：主进程原生执行，内部 IPC 支持上传/响应流与取消并恢复 URL、redirected、type 与完整响应头；请求属于发起窗口，窗口销毁或导航回收。执行环境是宿主 Node，不自动继承页面 Cookie/CORS（显式 Cookie/Referer 与 Set-Cookie 须保留）；业务自行决定认证与状态处理。

数据库、资源及会话文件同步的对象布局、校验、发布和首次使用边界见[宿主分块同步](/docs/architecture/storage-sync.md)。

### 插件业务数据与授权

**读取**：`context.data`（cards / articles / documents 的 `get`/`query`，todos / calendar 的 `query`）与 `context.content.read` 由 `app/plugins/data.ts` 适配，命令经 `bindDatabaseCommands` 固定到 Provider 创建宿主时的库并带实例 signal。卡片、文章、项目文档走主进程只读表 `tables/plugin-data.ts`（统一投影、「排序时间:ID」游标分页、上限 200 条，引用型项目条目不计）；待办与日程复用 `task-assistant:read`。ID 与 ContentRef（正文 ID + 创建时间）对插件不透明，IPC 契约在 `types/plugin-data.ts`。Notebook、材料与对话只读，走 `tables/plugin-data-readonly.ts` 直接返回 SDK 形状：Notebook 只给信息与资料清单（不含说明、本机路径、转换文字、笔记与测验）；材料三表合并分页、标题与出处复用 `MaterialTable.resolve`（软删除划线与已删 PDF 的标注不可见）；对话只给 `chat_session` 四场景信息，不读 pi 会话文件。

**权限**：manifest `permissions` 是申请上限（客户端丢弃未知值、门户严格）；PluginHost 先拒绝未声明调用，再经 `PermissionsAdapter.ensure` 询问；正文读取需任一所属实体的读取权限，无所属实体按不存在处理。`DesktopPermissionBroker` 按工作区创建：「始终允许 / 已阻止」由 BACKGROUND 模块存 `userData/plugin-permissions.json`（按插件 × 工作区，卸载清除），「仅这次」属于当前激活实例，连续拒绝 3 次转已阻止；窗口不在前台不弹窗，请求排队进 `usePluginPermissionUi.pending`（侧栏徽标，详情页「权限」页签处理）。调用计数 5 秒批量写入。弹窗一次显示队首、同插件排队合并，关闭即拒绝；插件与应用同环境执行，文案如实说明可联网，不得描述为安全隔离。

**写入**：卡片/文章的 create、update、delete，项目文档的 update，正文 `content.edit` 走 `plugin-data:create / update / delete / edit-content`；白板与项目走 `plugin-data:query / get / create / update`（新建白板带一张 emptyWhiteboardPage，修改只走 `updateWhiteboardMeta` 不碰画板页；项目新建为空项目、修改经 `updateProject` 保留目录），两者无写入广播，渲染端写入后按 `["whiteboards"]`/`["projects"]` 失效本窗口。项目目录 `plugin-data:project-tree`（逐层批量读、去重防环、最多 5000 节点、多处挂载多处列出）；`documents.create` 走异步命令（正文经 `resolvePluginContent`，`shareOf` 核对来源后以 contentId 共用正文——一份正文已有卡片或未删除文章时拒绝）；`documents.move` 换算为 `moveProjectTreeItem` 参数并复用其校验。主进程复用 `CardTable`/`ArticleTable`/`ProjectTable` 与 `ContentTable.updateContent`（正文带 revision 乐观锁），过期抛 `PLUGIN_CONFLICT:`，渲染端转 `PluginConflictError`。卡片/文章写入 `broadcastAll` 广播并失效 `["articles"]`；待办与日程映射到 `task-assistant:preflight → write`（conversationKey `plugin:<id>`）。删除可恢复：卡片/文章/白板/项目/插件实体删除前写 `plugin_operations` 快照、正文 `releaseDeferred`（7 天宽限），`plugin-data:restore` 原 ID 未占用时沿用；项目文档删除记 `placements` 从所有挂载处摘除、恢复只挂回仍存在的位置。插件对正文的修改是会话外写入，不进编辑器 UndoManager。

**正文输入**：SDK `PluginContentInput`（`markdown` / `nodes` / `copyOf`）由主进程 `resolvePluginContent` 统一解析——Markdown 经 `content-conversion`；`nodes` 用 `assertContentNodes` 复核后原样写入（未知节点按 ER-006 保留，不做类型白名单）；`copyOf` 只接受卡片/文章/项目文档/插件实体持有的正文并深拷贝（有会话取会话内容）；文档待办 taskId 由 doc-tasks 索引写入后统一补齐。

**关联与打开**：`context.app.pick` 写入 `usePluginPickerUi`，壳层 `PluginEntityPickerHost` 复用 `EntityPicker`（`entity:search`，候选带 createdAt 转成一致 ID）；`context.app.open` 先经 `plugin-refs:exists` 核对（待办、日程、正文待办同时核对创建时间）再按类型打开（正文待办经 `entity:locate` 带 `at: {taskId}`）；两者要求 `navigator.userActivation.isActive`，不需数据权限。引用类型含 `project` / `notebook` / `material`（划线/PDF 标注/剪藏）/ `chat-session` / `plugin-entity`；选择后先 `plugin-refs:grant` 登记到主库 `plugin_ref_grants`（编号复用时授权不落到新内容）；`context.app.describe` 只按已获准权限给标题，其余 denied 不透露是否存在。SDK `EntityRef` 视图在 `app/plugins/entity-ref-view.tsx`（同轮渲染合并一次 describe）；卸载清数据时 `plugin-refs:clear`。

**正文组件与媒体**：SDK `ContentEditor` / `ContentPreview` 为占位，`app/plugins/content-components.tsx` 经 `configureContentComponents` 注入，重组件按需加载；`resolvePluginContentTarget` 由 ContentRef 得到正文 ID、所属实体与快照，编辑器交给桌面 `ContentEditor`，预览只读渲染前 N 块随 `content:updated` 重读。媒体组件（`useResource` / `MediaImage` 等）经 `configureMedia` 注入：解析与内置 Local* 共用 `utils/mediaSource.ts`（远程缓存策略按类型：图片音频取设置、视频始终缓存），上传取作用域 `IResourceService.upload`，只读编辑器返回 undefined；发布站由 `packages/blog` 的 media-runtime 并入（地址原样、不提供上传）。节点资源只看 `ElementSpec.resources` 声明（`@tau/db-schema/content-resources`），宿主不按字段名推断；内容插件的声明按库写 `plugin_element_resources`，协作投影补写文档 `resources` 映射，上传与校验只按文档携带的声明。插件块能力（`useElement` / `useMediaViewer` / `BlockToolbar*`）由 `@tau/plugins/source-editor-host` 注入编辑器 `elementRuntime`，`ElementSpec.frame` 由内核外框实现。

**宿主动作**：`context.app.run` 先解析正文与实体标题——导出走既有导出函数或壳层 `PluginContentActionHost`（复用 ContentExportModal / PdfExportModal / EpubExportModal、PresentationMode、ContentCollaborationControl）；`card.create` / `project.insertDocument` 把插件正文输入解析为节点后打开与宿主同一个 `CreateCardDialog` / `InsertNoteToTreeModal`（预填模式不读写草稿，保存后交还 `{kind, id}`）；`notebook.create` 经 `plugin-refs:notebook-plan` 换算资料计划，与问题「以此立项」共用 `services/notebook-creation.ts`；`chat.start` 不走动作界面，把 context 换成 MentionRef 交给 `features/chat/chatStart.ts` 的 `startChat`，对话页/停靠栏经 `useChatStartConsumer` 认领并预填（等输入框就绪），不替用户发送。`open` 第三参数 `{placement, at?}` 经 PluginHost 校验（窗口只开有正文内容、停靠栏只开主对话、不与窗口同用）。请求经 `showAction` 统一承载：界面关闭或 signal 取消后 `run` 才返回；同时只显示一个请求，已有界面打开时新请求报错不替换。

**插件实体 / 记录 / 关联**：实体存主库 `plugin_entities`（按插件 ID 隔离，每项一份正文并持有引用，创建为异步命令、初始正文经 `resolvePluginContent`）；记录存 `plugin_records`（集合声明只在 PluginHost 内存，写入时带给主进程核对，ID 由 PluginHost 生成）；关联存 `plugin_links`（from 为实体、to 为插件引用带 `to_created_at` 供脉络判编号复用）。查询与计数先按类型声明的 `indexes` 校验（`@tau/plugins/query`），主进程 `tables/plugin-query.ts` 拼 SQL：索引字段经 `json_type` 守卫后 `json_extract`，键集游标 = 排序值 + 查询指纹。孤儿处理共用 `adoptPluginData` / `markOrphans`：`~/.editor/plugins` 缺失记 `orphaned_time`，重新出现或再读写即撤销，超宽限期删除并延迟释放正文。来源实体删除先删出边再删实体（事件仍能读到类型）。实体模块只依赖行级的 `tables/plugin-link-rows.ts`，不要导入 `plugin-links.ts`（依赖链会拉进待办文档模块）。

**原子提交**：`context.transaction` 由 PluginHost 在渲染端缓冲（每条按单独调用规则校验），回调结束经 `plugin-transaction:commit` 在一个 `db.transaction` 里按顺序执行各表同一套方法，任一抛错整体回滚；事务里新建实体 ID 经 `plugin-entities:reserve-id` 预留（推进不复用序列，未提交作废）。新增写入类型须同时加 `PluginTransactionOp`、`PluginTransactionCommitOp` 与 `PluginTransactionTable.apply`。

**搜索 / @ / 反链**：索引类型 `plugin-entity` 走与卡片相同的全文/向量/详情链路（含已停用与宽限期内容）；新增索引类型须同时改 `IndexType`、共享 `entity-ref`、`MAIN_CONTENT_INDEX_TYPES`、`index-candidates`、全文队列分组、`fts.ts`、`search-details.ts`、`EntitySearchTable` 与 `openEntity`。检索结果标签与打开只读 `services/plugin-entity-kinds.ts` 运行时登记表：已登记按声明推导 push 插件页面（`at` 并入页面参数不参与实例身份），未登记开只读页；搜索面板对 plugin-entity 不设范围 chip。MentionPanel 经 `isMentionableResult` 过滤（插件运行中且声明 mentionable）；`context.entities.backlinks` 先核对归属再取被引用，PluginHost 按已获准权限过滤不弹窗。

**类型外观**：类型名 + 图标存主库 `plugin_entity_kinds`（图标渲染成单个 SVG 文本，注销不删除，开库维护清理已卸载且无内容的）；显示一律经 `components/EntityKind` 的 `useEntityKindMeta`（`plugin-entities:owners` 同轮合并），列表用 `useEntityKindMetaResolver(refs)` 一次取齐，组件外用 `loadPluginEntityAppearances`；插件图标只作 CSS `mask-image` + currentColor。新增展示内容类型的地方必须经此解析，不得写死「插件内容」。

**私有存储**：主库 `plugin_kv`（单值上限 1 MB）；localStorage 旧键一次性导入（失败中止初始化待重试），卸载清除数据时删本库 `plugin_kv` 与其他工作区旧键，插件内容仍走 7 天宽限。

**业务事件**：BACKGROUND 模块 `domain-events` 在每个主库连接注册 `tau_domain_change` 与 TEMP 触发器（`rowTriggers` 规格表生成，覆盖 cards、articles（软删）、非引用型 project_item、white_boards、project、Notebook（资料增删计入）、材料三表、插件可见场景的 chat_session、plugin_entities（软删口径）、contents.content）。规格的 `changed` 列限定修改触发的列——查看状态类写入（打开时间、当前页、转换进度）不发事件；新增表须按对插件可见字段列出。按库合并 500ms（最长 2 秒）广播 `domain-events`；正文修改经 `locateAll` 计入所属实体 updated；触发器在事务内执行，回滚也可能产生事件，事件不携带数据。渲染端 `app/plugins/events.ts` 按库过滤，`entity.*` 只交给 owner 插件，其余按类型与已获准权限串行投递。事件来源：同步写入经 `writeAsPlugin` 标记插件 ID，协作投影延迟落库按 `markContentOrigin` 登记 5 秒。

**问题插件迁移**（一次性升级）：旧问题数据（问题、答案、分组、轨迹、材料关联、立项 Notebook）在插件运行时刷新后单事务迁入问题插件表（实体/记录/关联，谱系 `question` 端点改指 `plugin-entity`，首页布局键改 `plugin:tau.questions:active`）；动手前 `VACUUM INTO` 留备份，失败整体回滚弹「重试」通知下次启动重试；材料保活释放后删旧表，全部设备迁移完成后随清洁版删除迁移代码、旧表名进 legacy-tables.json。

### 插件中心与管理

- 插件中心与已安装管理是独立页面：`plugins.page.tsx`（参数 tab = discover / installed / updates）与 `plugin-detail.page.tsx`（match params 按 pluginId 去重，tab = readme / settings / changelog / versions / community，`section` 定位设置分组）。侧栏「插件」入口在设置上方，命令面板自动收录；设置弹窗不含插件分区（`SettingsLocation` 不含 plugins）。停用插件仍能打开详情并重新启用。
- 目录/详情/下载经主进程 plugin-local（`plugin-local:catalog / release / stage-release / uninstall / relaunch`，`net.fetch`，门户 CORS 不放行客户端）；渲染端 react-query 目录键 `["plugins","catalog",q,sort]` 60 秒新鲜期，离线显示重试空态不回退演示数据。ZIP 安装允许包内附带未声明的普通文件（随包保存不加载），条目仍查安全路径/链接/覆盖冲突/容量与摘要。安装 = 下载 → 核对大小与 SHA-256 → 可恢复事务立即提交；**所有新包默认停用**，用户到「已安装」主动启用；来源（中心 releaseId 等）随事务写入 `plugin-updates/sources/`，更新与恢复保留启用意图，同 ID 不跨来源接管。普通插件即时启停与更新；涉及已加载内容快照时更新保留暂存并提示重启。卸载 `LocalPluginManager.uninstall(id, purgeData)`：先停用、删包/备份/来源、清启用偏好，purgeData 时清所有工作区私有数据；内置插件不可卸载。
- 兼容与升级：`readPluginPackage` 检查旧格式 minAppVersion 或格式 3 的 targets.desktop 最低版本（0.58.0 起，固定目录扫描与安装共用）；plugin-local 初始化时恢复中断事务、应用暂存包再注册 IPC；安装/更新/恢复先暂存校验再同事务提交；提交后广播 `plugin-local:state-changed`，窗口重扫并串行切换实例。根目录 `~/.editor/plugins`，事务与备份在同级 plugin-updates；文件恢复不回退私有数据，激活失败尝试恢复旧内存快照。
- 版本与文档：安装状态机与来源判定是 `features/plugins/model.ts` 纯函数；版本标签合并中心全部已发布版本（`plugin-local:versions` 翻页）与本机当前/待生效/备份。README/CHANGELOG 用 `PluginMarkdown`（只读 Editor，内容经 `toPluginDocument` 白名单过滤——原始 HTML 丢弃、图片音视频不加载、插件块按代码块、链接只留 http(s) 交系统浏览器）。Markdown 导入先按 `ignoreTypes` 递归过滤整棵语法树再转换（不为类型加特例）；资料转换用内置组合（`utils/markdown-composition.ts`），所有语言围栏统一展示源码，不调用插件导入函数、不维护节点黑名单。
- 社区（C28）：详情 `community` 标签仅选中时读取（每页 20 条，写入后失效该插件查询）；IPC 归 plugin-local，复用安装级匿名凭证（渲染端只收 liked/canDelete 不收 token）；评论草稿在标签内存保存，失败重试不重复发表；网站与桌面身份独立，清数据后无法恢复旧身份管理权。
- 固定目录发现：开发/正式构建均经 BACKGROUND 的 plugin-local 扫描 `PathUtil.getAppDir()/plugins` 直接子目录（目录名须等于 manifest.id，坏包单独显示不阻断好包）；插件页 ⋯ 菜单提供「从 ZIP 安装 / 打开插件目录 / 重新扫描」，无目录选择。`app/plugins/package-loader` 把静态元信息登记为延迟定义，启用才执行 CJS 入口；LocalPluginManager 复用此加载器与正式 PluginHost，本地插件偏好镜像为应用级键；新包默认停用，重启/切库恢复；活动包变化先回收旧实例登记新定义再按原意图恢复；内容快照与 restart-required 身份不热替换。
- **生命周期与异常**：激活等待最多 10 秒；停用立即取消 signal，未决激活最多再等 5 秒；deactivate 与逆序清理共用 5 秒预算，超时继续剩余清理；普通失败且清理成功可重试，激活超时或清理失败进 restart-required（管理页显示重启提示并禁用启用）。DesktopPluginProvider 在窗口内保存需重启的插件 ID，等旧宿主有界收尾后才建新宿主（注销/切库不能绕过，不落盘）；超时只能结束等待，不能抢占同步死循环。
- **本机工作区身份**：`services/plugin-registry.ts` 在 userData 按本机规范化库名分配 UUID（串行暂存写再 rename，只存 name 与 id），plugin-local 与 plugin-backend 共用；这是本机槽位身份不是同步身份——同步替换/重建同名库沿用。PluginProvider 启动先 `migratePluginPreferences`（库名键改挂 UUID，失败保留旧值重试）再 `migrateLegacyPluginStorage`。

### 插件贡献位

- **侧边栏**：`context.sidebar.registerGroup/registerItem` 关联本次启用的页面句柄；SDK 暴露 daily/knowledge/learning/ai/sharing/plugins 稳定分组 ID，`composeNavSections` 合并静态与动态贡献（缺省/未知分组回落「插件」，空分组隐藏）。条目用现有 Sidebar 按钮与折叠逻辑，点击沿页面句柄导航，高亮匹配 pluginId/pageId/instanceId；折叠偏好内置组按 label、自建组按命名空间 ID 保存。`registerItem` 可选 SVG 图标组件（currentColor，统一 size/strokeWidth，未提供回落 Plug）；句柄 `update({ badge, children, action })` 经 SDK 校验冻结、PluginHost 包装 assertActive——角标高频更新只重渲染 `app/PluginNavEntry.tsx` 单条目不触发整个 Sidebar。子项展开规则：条目页面在栈顶或当前页参数含某子项 params 时展开；右键菜单最多 8 条（危险项前加分隔）；拖拽类型加插件命名空间（`application/x-tau-plugin.<pluginId>.<type>`），宿主与其他插件的拖拽落不到插件子项；回调抛错只弹 appNotify。
- **设置**：`context.settings.register(...).open()` 接 `navigator.push("plugin-detail", { pluginId, tab: "settings", section })`，设置组件只在插件启用且详情页挂载时渲染；自定义设置收拢为详情页「设置」标签的分组，`plugin:<pluginId>:<sectionId>` 精确定位；停用保留宿主管理、组件退出，重新启用恢复；分组单项注销显示不可用。保存用 `context.storage`，即时保存/失败重试/signal 校验规则不变。
- **对象动作**：`context.actions.register` 经 PluginHost 包装（assertActive），runtime 以 `plugin:<pluginId>:<id>` 登记，`runAction` 先 `grantRefs` 把对象登记为插件选择过的引用。菜单渲染收口 `app/plugins/action-menu.tsx`：手写菜单放 `<PluginActionMenuItems target />`（内置项之后、删除分隔线之前——卡片 CardActionMenu/CardDetailView、文章 ArticleItemOps/ArticleDetailView）；数据驱动菜单用 `usePluginActions` + `insertPluginActionEntries`（key 前缀 `plugin-action:`）——项目文档目标由 `projectItemActionTarget` 决定（普通文档 document、引用型条目为被引用的卡片/文章），文档树行与网页剪藏共用 `usePluginMenuEntries(target)`（剪藏目标 `material web-clip:<id>`）；只有图标按钮的地方用 `PluginActionsMenu`（PDF 标注浮动工具条经 FloatToolbar extra 槽、标注列表悬停组末尾，目标 `material pdf-annotation:<id>`）；对话消息经 `@tau/chat-ui` MessageView 的 `renderExtraActions(text)`（删除之前），`MessageItem` 收到 `pluginSessionId`（四个插件可见场景）且有 piEntryIds 时才列；`text` 目标在命令面板「记录」组末尾每动作一行（副标题「来自插件名」），文字不登记引用。编辑器选区不经对象动作（归插件编辑器扩展，选区工具条不开放）；独立编辑窗口无插件运行时自然不列。新增菜单照此放置，不在业务域直接读 runtime。
- **详情区块**：`context.views.registerEntityPanel` 以 `plugin:<pluginId>:<id>` 登记，渲染收口 `app/plugins/entity-panels.tsx` 的 `<PluginEntityPanels target />`——放在三个详情页洞见报告之后、正文之前，每块包 RecoverableBoundary（resetKeys 为目标）/UiProvider/PluginComponentScope，`empty:hidden` 不占位，key 用 mountId（换对象只换 target 不重挂）；宿主不加外框标题，不因挂载自动登记引用或放宽权限。
- **编辑器扩展**：作者经 `defineEditorExtension/defineEditorElement/context.editor.register` 注册（UI 用 @tau/ui，SDK 复用原编辑器契约），当前仅 workbench 场景，不向生产正文/白板自动注入。运行时提取公开扩展字段，拒绝类型/命令/codec 冲突，activate 成功后发布、signal 取消立即撤销；每个 PluginEditorSession 只在贡献集合变化时重建 Slate（复制正文/选区/history，普通重绘不重建、不经 Markdown 中转）；旧代次回调不覆盖新会话；停用节点由内核保留未知占位，重启用恢复。实验编辑器由宿主工作台承载，文档只在页面内存（关闭/切库清空并提示）。

### Whiteboard 公共画布与扩展装配

缩放统一由 InteractionManager/ResizingState 管理，ResizeCircle/useResize 与分栏侧边手柄只发起手势，不再各自监听 document 或保留节流尾调用。保留原几何/吸附算法，预览只收集同步字段变化，完成经 Board.recordHistory 同一入口提交单个历史分组；取消/失活/只读/销毁回退自身字段，删除或冲突更新先终止手势，无关字段修改不回滚。不得为插件再建立一套缩放历史或复制 CommonPlugin。

第三方创建工具可声明 panel，在「扩展工具」内先选参数，再经 run(payload) 激活；返回、关闭、错误边界和迟到回调由宿主处理。DesktopWhiteboard 经 extensionServices 为每个已校验插件的扩展派生子服务注册表，IPluginStorage 复用 PluginHost 当前激活上下文的 storage；按插件与工作区隔离，不暴露整个 PluginContext。画布失活/销毁/只读、切库、插件失活及激活实例替换时拒绝旧交互；静态渲染与缩略图仍不依赖 activate。公开 SketchPopover 与内置单选属性栏共用实现，公共作者类型依赖图继续禁止 Board/CommonPlugin。

元素 interaction 声明控制宿主角点/边点和矩形箭头连接，内部 ElementInteraction 复用 CommonPlugin，隔离导出不挂载交互层。presentation 供图层名称/图标/搜索统一使用；sketch:true 与 useSketch/SketchPaths/纯 sketch 原语复用现有画风；schematic 从静态定义投影既有 SchematicShape，DesktopPageSchematic 统一连接列表/选择器/引用卡片的启动定义目录，导出弹窗使用当前 Board 目录。缩略图不创建隐藏 Board、不运行 activate；完整导出仍使用实际画布。人物专属逻辑已在 C25 M4 退出宿主，只存在于独立插件；不做旧火柴人格式兼容。

插件定义以 whiteboardExtensions 提供静态扩展，格式 3 清单不再重复声明白板标记；作者只从 @tau/plugins/whiteboard 取受控 API，不导入 Board/CommonPlugin。元素定义统一放 WhiteboardExtension.elements，create(api) 只返回每个画布的交互贡献，动态返回 elements 明确拒绝并清理。ContentPluginRegistry 聚合静态白板目录，DesktopWhiteboard 从同一启动快照装配，启停/更新重启生效；沿用现有主进程偏好文件，不新建一份白板启用存储。博客发布上下文只筛选编辑器贡献，不因白板单独启停阻断。

公开数据类型位于 types/element.ts、containment.ts 等纯类型文件，extensions/api.ts 与 events.ts 直接依赖它们。types/board.ts 保留内部 Board/IBoardPlugin，仅重新导出同一份元素类型供内部消费者使用，不重复定义数据；作者子入口的含类型依赖图由 check-whiteboard-boundaries.mjs 检查，禁止进入内核和编辑器实现。火柴人作为独立插件从中心安装，不默认随客户端提供。白板核心不携带人物代码；相关发布包只保留在tests/fixtures/plugins做集成测试。博客发布仍只收集编辑器贡献，不额外增加移动端/扩展端白板插件支持。

通用白板归 `@tau/whiteboard`：根入口提供画布、受控 API 和通用组件，`/extensions` 提供扩展工厂，CSS 使用 `styles.css`。WhiteBoard 必须显式传稳定的 extensions；元素、工具、命令、属性面板、导入与界面层由扩展贡献，核心运行时不加载 Slate、EditorKit、Markdown 或截图实现。桌面入口统一使用 `features/shared/whiteboard/DesktopWhiteboard`，列表、多页管理、查询及 400ms 防抖、串行保存、离页 flush 继续由白板域负责；flush 失败必须拒绝，依赖保存的页面复制中止。拖动/连续移动的手势帧不触发 onChange（宿主落库防抖不被高频重置），手势结束统一补发一次最终快照；仅选区变化（点选/框选）同样不触发 onChange（视口变化仍通知，停顿后落库一次以记住视图位置）。元素级选中态经 useSelectState 按元素 id 布尔订阅 selection:change（通知侧短路，未翻转不重渲），只关心缩放的组件经 useZoom 订阅 viewport:change（纯平移零重渲），静态元素层独立 memo，截图树的选区隔离由 useBoardCapture 在树根挂 StaticSelectionContext。视口剔除保持精确盒（不量化扩边），元素渲染统一经 memo 的 ElementHost 包装（按 element 引用与子元素集合浅比较，剔除/分层每帧重建包装时未变子树整体 bail out），剔除追赶经 useDeferredValue 低优先级执行、紧急渲染只更新 viewBox。全库列表接口返回投影数据（剔除媒体地址与选区，保留示意图所需结构），画布保存后就地 patch 列表缓存中该页的元素数与更新时间、不失效整表重拉；打开画布始终走单页全量通道。

每个 Board 创建独立扩展运行时和脑图预览状态；宿主能力经服务注册表注入：DesktopWhiteboard 用 `createServiceRegistry` 注册 `IWhiteboardRichText`、`IResourceService`、`IMediaInfoService`、`IDownloadService`（随数据库重建）并经 `WhiteBoard` 的 `services` 传入，扩展直接通过 getService/tryGetService 获取（必需服务缺失抛错，可缺省服务返回 undefined），不再维护依赖表，不恢复全局 services/slots 集合；导出截图与业务弹窗等纯 UI 配置仍为工厂参数。正文编辑、低缩放订阅与测量使用富文本服务提供的同一套 Kit/文档绑定。包外 useBoard 返回受控 API，快照不可写且按对象身份共享副本，不公开历史栈和插件实例。桌面命令固定初始数据库；异步提交在只读切换、隐藏、卸载或目标删除后失效。Activity 暂停 activate 副作用，真正卸载时 dispose 并销毁 Board。

隐藏时取消临时指针和键盘手势、计时器与吸附反馈，保留画布与历史。指针按发起实例和 pointerId 路由到释放或取消，跨实例移动不转移手势归属；结束事件在捕获阶段收尾，避免被其他控件的 stopPropagation 拦截，同次事件只收尾一次，隐藏/卸载清理归属。取消脑图笔记关联若引用已减少但画布提交失效，在原数据库补偿引用；同时校验目标仍关联原正文，避免覆盖新关联。本地上传菜单由媒体扩展显式声明可用动作，选择器通过扩展界面层承载；工具通过命令 ID 执行，导入按规则只认领一次。

元素的编辑标记是瞬态状态：失焦立即释放，删除元素及其子树、渲染卸载和页面停驻时兜底清理；不能因残留标记阻断整板的 Delete / Backspace。文本输入焦点内仍由编辑器处理删除。

FadeScroll、可拖宽侧栏、If、ErrorBoundary、PortalToBody 和编辑目标判断统一归 `@tau/ui`，禁止复制到白板包。实体/媒体类型、颜色和摘要纯工具经 shared 公开入口复用。元素树开关与宽度沿用 `tau-whiteboard-outline`，实际占宽归所属页面。

宿主提供主题运行时、UiProvider、DndProvider 和 Tailwind 扫描。缺失扩展时没有其创建入口；未知元素保留数据和子树，显示通用占位，并支持元素树定位与删除。状态和快照先提交，再逐个隔离通知观察者，扩展异常不得阻断保存通知。扩展数据契约扩展 id 与元素/命令/贡献按命名空间隔离（`tau` 保留），装配失败只禁用该扩展并清理其贡献；元素私有数据收敛在 `element.data`，由定义的 schema（Standard Schema v1，仅同步）与 schemaVersion+migrate 负责校验和迁移；快照带必填顶层 `version`，文档版本高于当前应用时画布强制只读、不回调 onChange。创建交互开放元素经 `create` 声明创建方式（click/drag/自定义手势），内核统一负责约束、预览与提交（预览不写文档）；工具模型为 activeTool（`tau.select` 为显式选择工具，旧创建类型枚举与兼容层已删除），受控 API 提供 setActiveTool / onActiveToolChange、坐标转换与 canContain。事件分层与快捷键仲裁内核事件只有内核能发、扩展只能监听，扩展事件按命名空间隔离（`tau.*` 归内置，界面操作统一为 `tau.modal.open` 这类扩展事件，`internal:` 包内专用），快捷键只是「按键 → 命令」（内置优先，命令 enabled 不满足不拦截），mod+k/p/j、alt+方向、escape 为宿主保留键，显示文字统一经 `getShortcut` 取。独立 `@example/whiteboard` 构建、`pnpm check:whiteboard-boundaries` 与 pre-commit 守护源码和运行时模块图边界；Schema 不变（文档快照新增顶层 version 字段；卡片元素改为文档卡见下节），视觉验收由用户完成。

**文档卡与阅读纸**：卡片 / 文章 / 项目文档 / 日记在白板上是 `document` 元素（`entityRef` + `title` 快照，不存 contentId；日记直接存 `{ kind: "diary-moment", id: 片段id }`，不额外存 segmentId，选择器经 EntityPicker 逐条检索），包内 `DocumentPlugin` 负责外壳（选中、缩放、连线、手绘框）与展开请求（双击 / ↵ / 属性条 / 右键 → `board.emit(DOCUMENT_OPEN_EVENT, id)`），纸面由宿主 `createDocumentExtension({ Body })` 渲染，阅读纸由 `position: "canvas"` 承载；两者在 `features/shared/whiteboard/components/Document/`：`source.ts`（react-query 按 entityRef 读元信息，日记按片段 id 取正文与所属日期信息，正文变化走 `useContentDocument`）、`DocumentPaper`（卡片与阅读纸共用的版式，版宽固定，形变只做 transform）、`DocumentCard`、`DocumentReader`（居中 / 停靠、形变、Esc 经 `DesktopEditorOverlayDismiss`；日记编辑时节流 `updateDiarySegment` 并失效同窗口的日记缓存）、`readerStore`（摆放方式全局偏好 + 按 Board 隔离的展开状态）、`DocumentSelectorModal`（工具条与右键共用）、`DocumentHostContext`（嵌白板的宿主定制：`allowDock` 关掉停靠、`cardAccessory` 往卡面上叠宿主内容，创作模式在用）。`position: "canvas"` 渲染在画布容器内：宿主浮层根节点必须带 `CANVAS_OVERLAY_ATTR`，其中的按键、剪贴板、指针、滚轮不归画布；不要用 stopPropagation 截断，否则 document 上的 Esc 仲裁与编辑器弹层的外部点击会收不到事件。旧 `card` 元素由开库升级 `whiteboard-document-upgrade.ts` 一次性改写，随下一次清洁版删除。

**日记正文身份与搜索**：EntityKind、EntityRefKind 与 ContentIndexType 均使用 `diary-moment`，id 为 `diary_segments.id`，界面类型 label 仍为「日记」；`diary_entries` 仅承载日期、天气心情与分组，不能作为正文搜索结果。实体候选、FTS 回退与全文/向量索引、内容链接、白板引用和脉络均落在同一条正文；`entity:locate` 返回片段 id + diaryId/date，`openEntity` 通过 date + moment + at 精确回跳。日记页的搜索命中集合使用片段 id。新增或删除片段及正文编辑继续触发现有索引对账。开库由 `diary-entity-upgrade.ts` 单事务转换旧日级引用，不改正文编辑时间、引用计数；不存在的目标保留原数据，不猜测。已有 Yjs 会话打开时也增量修正旧链接属性，防止缓存快照回写旧身份。索引库以 `diary_entity_version=moment-1` 清除旧日级 FTS/向量/节索引、标记重建；引用解析版本为 5、白板引用为 3。全部设备升级后删除主库与会话转换代码。移动端独立索引不在本次改动范围。

### 2.1 公共 UI

日记页搜索走 react-query（`["diary", "search", 关键字]`，300ms 防抖），日记变更失效同域查询；结果按片段 id 筛选，旧关键字的迟到响应不能覆盖当前查询。

DatabaseWorkspace 与编辑器数据库块只按表身份建立实例，不再按活动视图重挂载。包内使用独立 `DatabaseView/CreateDatabaseView`，不读取表身份、正文引用、引用计数或创建/更新时间；宿主经 `toDatabaseView` 投影存储记录，在创建回调闭包中补齐 tableId。视图切换由实例栈与投影完成。
卸载后的标题、属性与正文通过 `onDetachedRowPatch` 提交字段补丁；主进程事务检查最新表/行、字段和预期旧值，拒绝删除或冲突目标，不恢复行、不写旧整表快照。正文无法关联时不删除，留给开库回收。常规桌面保存通过 shared hook 的 `updateDataTableChanges` 能力在最新数据上合并字段差量，新增 ID 显式标记，行删除时正文引用由主进程差集交给延迟回收；不提供该能力的宿主保持既有保存方式。确认快照由桌面适配经 external `rows.receive` 接回实例，保留其他本地草稿。
桌面适配的保存与行清理回调固定实例所属库；切库后旧回调拒绝继续保存或释放引用，异步正文创建后也再次检查库身份与所属行。
文本、数字和链接的 Enter 提交后安全归还所属实例焦点，外部输入/其他实例/浮层已获得焦点时不抢焦点。画廊正文查询 staleTime=0、聚焦刷新，正文事件只触发按原库命令重读，不直接缓存缺少库身份的事件正文；预览内容变化建立新的只读编辑器实例。

通用 Database 归 `@tau/database`，所有组件、类型、插件与 hooks 经根入口消费；桌面三个宿主统一使用 `features/shared/database/DesktopDatabase`。视图（含扩展视图）、store 与查询投影在包内：每个实例持运行时 `ViewRegistry`，内置四视图与扩展贡献的视图走同一注册路径，视图定义合并元数据与组件（`views/<View>/definition.ts`，`builtInViews.ts` 聚合），持久化 hook 与卡片偏好仍在宿主。残留的未知视图类型渲染通用占位（标签可见、可删除、可改类型，数据与 viewOptions 原样保留）。宿主提供 DndProvider、UiProvider、主题初始化与 Tailwind @source；包内键盘监听按实例根节点仲裁，并让位输入法与导航组合键。Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 或 Ctrl+Y 重做只覆盖行与列数据（产生 user 变更落库，视图配置不回滚）；外部数据更新到达时撤销栈以新数据重建基线。`pnpm check:database-boundaries` 和独立 `@example/database` 构建守护无桌面依赖与私有深引。

Database 的字段插件、视图、聚合算子、命令与插槽只经 `extensions`（`defineDatabaseExtension`）装配，集合必须引用稳定；字段类型、覆盖目标、插槽键、视图类型、聚合算子与命令 id 重复均报错，扩展视图 type、聚合算子 op 与命令 id 必须带命名空间（含 "."）。扩展贡献的表尾聚合算子（`aggregates`）经每实例 `AggregateRegistry` 与内置 9 个同路径登记，仅表尾可用——公式（含表尾组合表达式）仍只认内置 `AggregateOp`，配置了未登记算子的表尾格显示为空、配置原样保留。扩展命令（`commands`）出现在行菜单（「删除」前）与列头菜单（「编辑」后），经受控 `DatabaseCommandApi` 读写（批量写只产生一次撤销步），readonly 实例不显示；toolbar 无现成溢出菜单承载点、暂不渲染；内置编辑/删除保持原确认流程不改为命令。正文、图片与画廊预览由扩展插槽提供，组件不读取宿主正文。桌面扩展 `tau.desktop`（`features/shared/database/desktopExtension.tsx`）贡献资源字段、link 渲染覆盖、正文会话与应用内链接，由 `DesktopDatabase` 默认装配；卡片视图另加 `tau.cards`。可信的桌面扩展直接使用宿主模块，Database 包不提供宿主能力。store 删除行只调用宿主的 `onRowCleanup`。行详情关闭或切换前等待正文插槽的 `flush()`，宿主绑定原数据库并在创建完成后复核所属行，已删除行或被拒补丁的迟到正文不重新建行，留给开库回收。无正文插槽时仅提供通用属性编辑。

**数据表正文引用**：存活的数据表（`data_tables.ref_count > 0`）对声明了 `contentRefs` 的字段单元格（rich-text 单元格 contentId）与行 `detailContentId` 的每次出现各持有一份 contents 引用，已删除的表不持有。收集口径由字段 model 的 `contentRefs` 声明：`@tau/database/model` 的 `collectContentRefs`/`diffContentRefs`，主进程 `modules/tables/field-models.ts` 登记内置与桌面字段 model；主进程 `DataTableTable` 每条写路径（create / update / patchRow / applyChanges / remove / incrementRefCount）在同一事务内按新旧差集 `retain` / `releaseDeferred`。渲染端不增减或删除这类正文引用，新建正文一律 `createPendingContent`（ref 0 + 待回收登记，进表时 retain）。释放到 0 只登记 `content_pending_releases`，开库（maintenance）回收超过 `CONTENT_RELEASE_GRACE_MS`（7 天）且仍为 0 的正文，删除级联同 `deleteContent`；宽限期内的撤销、粘贴与块复活会重新引用并撤销登记。没有 tableId 的宿主（卡片视图）行不带 detailContentId，删行即删除对应实体；`DesktopDatabase` 不再自行删除行正文，只在库仍为当前库时转发 `onRowCleanup`。

**数据表物理回收**：`data_tables.ref_count` 只是提示，不作删除依据（协作撤销删块、删除正文与项目条目都不回写计数）。`remove` 下限为 0，1→0 时登记 `data_table_pending_releases`，`incrementRefCount` 0→1 撤销登记。开库 maintenance 先执行 `DataTableTable.collectPendingTables`、后执行正文回收（复活的表 retain 正文，救回同批待回收正文）：存量 ref_count ≤ 0 的表补登记并归零；到期登记按实际引用对账——`database_item`、`project_item(ref_type='data-table')`、正文 JSON 中 `database` 节点的 `tableId`（一次调用只扫描一遍）以及本机协作会话私有块（协作模块经 `modules/extra-table-refs.ts` 注册 provider，按会话 `source.databaseName` 归属）。仍有引用的按引用数复活并告警，无引用才删除表与视图；provider 未就绪或读取失败时整批跳过，不能确认就不删。新增任何持有 tableId 的位置，必须同时接入这份对账。

- EditText 与 EditTextHandle 从 `@tau/ui` 消费；占位符样式同归 UI。日期周起始与日历事件布局纯函数经 `@tau/shared/calendar-utils` 共用，不依赖桌面日程类型。

- 所有新设计系统消费者使用 `@tau/ui` 单一入口；原桌面 ui 目录已删除，不保留转发。组件、`cn`、hooks 一律从桶入口导入（`import { Button, cn } from "@tau/ui"`）——包 exports 不提供组件子路径；例外仅 CSS（`@tau/ui/styles.css`）；主题不在本包，一律从 `@tau/themes` 导入（ER-011），新增控件只需在 `primitives/` 落文件并在 `index.ts` re-export。颜色/尺度词表与 cn、主题测试均在公共包，新增控件同步样板间档案。
- Popover 已包含锚点定位、嵌套外点仲裁和 Portal 支持；表单内 Tab 顺序移动，到末项才退出。输入法组合让位，busy 时关闭请求被拒绝。
- `UiProvider` 提供局部主题与 body Portal 根。主题运行时显式初始化，可清理；`createThemeRuntime` 可注入存储、DOM 根及系统媒体查询。首帧通过 Vite 注入 `createThemeBootstrapScript()`，与运行时共用解析和主题清单，不再维护 HTML 白名单。

### 协作网络与端点升级

协作主进程使用共享产品入口；旧来源身份按产品端点认可的摘要升级，双身份需通过双凭据证明后合并。端点升级失败不会阻断本机内容会话，自托管身份不外发；旧缓存的网络、附件与事件连接统一经过端点解析。持久化与权限协议见[协作架构](/docs/architecture/collaboration.md)。

### 内容导入导出与资源搬运

- 单一入口 `services/content-transfer.ts`：单篇导出 `exportContentAsMarkdown`（卡片 / 文章 / 项目文档 / 独立编辑窗口），Markdown 文件导入 `importMarkdownFiles(create)`（卡片页、文章页、项目文档树两处菜单；落库由调用方传入）。业务代码不再自行 `getMarkdown` + `downloadMarkdown` 或 `readTextFile` + `importFromMarkdown`。Markdown 窗口原地编辑本机 .md，不经此入口。
- 资源字段只看节点的资源声明（`ElementSpec.resources`，内置声明在 `@tau/db-schema/content-resources`）；`utils/content-transfer/assets.ts` 的 `mapAssetUrls` 按声明改写，只有 file-attachment 的本机副本与 isLocal 保留专门逻辑。新增带资源的块只需在元素上声明，否则导出不打包、导入不入库。
- 导出：本机资源与 data URI 收进包根 `assets/`（按来源去重、同名加 -2），正文改为相对路径；远程地址原样保留；读取失败保留原地址并汇总为警告。单篇与合并 Markdown 无本机资源时存 .md，有则存 .zip；项目 Markdown 包内 `content-link` 指向包内项目文档时改为相对 .md 链接，其余（含单篇、合并）降为标题文本——导出物不含数据库 id。
- 导入：相对路径以 .md 所在目录为基准（兼容 `~`、`file://`、URL 编码），读出后经 `uploadResource` 走当前资源存储；附件入库后 `isLocal=false`（与插入附件时选「上传」一致）。
- PDF：导出页面从 `data:` 地址加载，`buildPdfHtml` 与批量 PDF 在序列化前用 `inlineLocalImages` 把本机图片内联为 data URI。
- 批量导入（文件夹 / .zip → 项目 / 文章 / 卡片）：`utils/content-transfer/source.ts` 把两种来源统一为相对路径读取（跳过隐藏目录与 `__MACOSX`，压缩包剥掉唯一同名根目录，上限 2 万文件）；`batch-import.ts` 先 `scanImportSource` 只读扫描成计划（资源按 .md 目录定位并去重、缺失资源与未解析的 .md 链接单列、同级 `X.md` + `X/` 合并为带子级的文档），再 `runImport` 三遍执行：① 选中文档引用的资源去重上传 ② 建文档（项目按树、文章取顶层文件夹为标签、卡片取完整文件夹路径为层级标签，可叠加 frontmatter tags）③ 回填指向本批文档的链接为 `content-link`。每次写库前校验仍是开始时的数据库；停止或出错保留已写部分。宿主接线与整批撤销在 `services/batch-import.ts`，导入记录存 `stores/useImportHistoryStore`（本机、按库区分，撤销 = 删除建出的项目 / 文章 / 卡片，资源文件保留）。
- 来源方言`utils/content-transfer/dialects.ts`：扫描前把私有写法改写成标准 Markdown，扫描与执行不感知方言；自动识别（`logseq/config.edn` > 根目录 `.obsidian` > 过半文件名带 Notion 32 位 id > 通用），向导可手动切换并用已读入的来源重扫。Obsidian：`[[笔记|别名]]` / `![[附件]]` 按名称定位（大小写不敏感，重名取同目录再取最短路径）后改写为相对路径链接 / 图片 / 音视频 / 附件，`[[#标题]]` 与解析不到的降为文字；callout、`==高亮==`、`%%注释%%`、行尾 `^块标识`、正文 `#标签`。Notion：去掉文件 / 目录名的 id 与首行重复标题，`Tags:` 属性行转标签，CSV 导入为「数据库」模块的表格（列均为文本，`X_all.csv` 优先）。Logseq：只导 `pages/`（摊平到根）与 `journals/`（显示为「日志」），页面名按 `___` / `%2F` 还原命名空间，`title::` / 日志日期（`Jan 15th, 2024` 等）可被引用，页面属性与块属性不导入，任务标记转勾选项（换用 `*` 列表符自成任务列表），`((块引用))` 移除并记入报告。所有方言改写只作用于代码之外。相对路径失效的资源与 .md 链接再按来源根、再按文件名定位。
- 向导 `features/transfer/ImportWizard`：来源与去向 → 预览（勾选树用公共 `components/CheckTree`，与整体导出共用）→ 执行（三阶段进度、可停止）→ 报告（打开 / 撤销）。
- Markdown 导出包（迁出）：`services/markdown-export.ts` 按范围（项目 / 文章 / 卡片 / 全部）组装导出树，包内目录即选择树——项目按文档树，文章与卡片按首个标签逐级分文件夹，「全部」再分三组；节点 id 是本次导出的临时编号，实体身份记在 `ref`，跨范围的 content-link 照常改写；文章正文经 `loadContent` 导出时才取。打包共用 `buildMarkdownZipBytes`（项目整体导出的 Markdown 包走同一函数，选项缺省即旧行为），选项：互链写法（相对 .md / `[[文件名]]`，重名时写包内路径 / 纯文字）、本地资源（打包进 assets/ 或保留原地址）、同时下载远程图片（`remoteResourceToLocal` 缓存后打包）、frontmatter（title / tags / created / updated）。偏好存 localStorage `markdown-export-settings`。项目的 PDF / EPUB 仍只在项目卡片 ⋯ 的「整体导出」。
- 入口（低频，不占常驻位）：命令面板「批量导入文件夹 / 压缩包…」「导出为 Markdown 压缩包…」（项目详情页唤起时范围为项目、只勾选当前项目）、设置 › 数据 ›「导入与导出」（含导入记录与撤销）、卡片 / 文章页「导入 ▾」下拉、把文件夹或 .zip 拖到卡片 / 文章 / 项目页纸面（`useImportDrop`，经 preload 的 `getPathForFile` 取本机路径）。全部经 `app/transferStore` 打开壳层挂载的 `MarkdownExportHost` / `ImportWizardHost`；设置页只做启动台，不承载流程。

### Page 导航入口与服务层接线

- 已迁移功能禁止再调用 `useTabStore` 或 `utils/navigation`。组件使用 `usePage().navigator`；共享编辑器入口与非 React 服务使用 `services/page-navigation.ts` 的 `openPage`，由 AppShell 内的 `PageNavigationBridge` 注入真实 navigator 和当前栈，卸载／切库时注销，不创建旧 Tab 兼容层。未就绪、目标未注册／仍为占位、参数无效时明确报错。
- “新 Tab 打开”入口现为“在应用内打开”，不再尝试旧分栏。网页由 `features/web` 的 `webview` 页面承载（按 URL 去重）；内嵌白板由 `features/whiteboards` 的 `whiteboard-content` 页面承载（按内容 ID 去重，返回由 Page 栈负责）。白板数据使用 react-query，保存按数据库及 ID 串行，400ms 防抖（拖动手势帧不触发落库信号，见 Whiteboard 小节），离页提交尾部修改，切库拒绝旧写入。
- 正文内容链接和项目文档列表共用 `services/open-content.ts`：卡片、文章、项目文档进入对应 Page；多项目共享文档优先保留当前所属项目。异步查找期间切库则取消打开，不跳空占位页。
- MCP 页面查询以真实 Page 栈为源，现有内容序列化器只用于取正文，不读取旧 panes。编辑目标以显式 contentId 或当前 Page 为准，不再回退到后台旧编辑会话。工具协议名称暂保留，响应中的页面类型为 Page key；不提供正文的页面返回明确说明。创建内容后的响应使用 `activatedPage`；若内容已落库但页面打开失败，保留创建成功结果并单独返回 `navigationError`，避免调用方重试造成重复创建。
- 结构化分析通过 `sql_query` 只读工具执行，当前主库表结构由内置 `database-schema` Skill（`src/constants/internal-skills/database-schema.md`）描述，事实来源为 `packages/db-schema/schema/main.sql`，表结构变化时须同步更新该 Skill。工具只允许单条 SELECT/WITH/EXPLAIN 和受限结构探查 PRAGMA，默认限制返回行数、响应大小与执行时间。任务交互例外：`query_todos` 统一查询独立、周期和正文待办，`query_calendar_events` 查询日程及周期投影，结果带身份、版本和专用卡片；复杂聚合继续使用 SQL。正文 Markdown、编辑快照、语义索引、PDF/视频检索和 Page 上下文继续使用专用工具；不提供通用 SQL 写入。
- 知识库搜索结果卡片（KnowledgeSearchRenderer）的预览消费工具输出快照做纯渲染，不按 contentId 回源拉实时内容——搜索后内容被编辑时预览不更新；点进详情弹窗才按需取实时内容。
- AI RPC 服务随 PageNavigationBridge 启停。桌面与扩展统一使用 `content.open` 打开卡片／文章／项目引用（type/id），不注册旧 `tab.open`；块预览只走 `block.preview.open`，进入 `features/previews` 的 `block-preview` 页面。尚无承载的类型（如日记）返回明确错误，不伪报打开成功。

## 2.5 主进程模块就绪（跨进程能力）

主进程能力定义在 `src-electron/main/module-init/module-config.ts`，只有两个启动阶段：
IMMEDIATE（窗口显示前）/ BACKGROUND（窗口显示后并行）。所有模块随应用启动，ON_DEMAND
层级、窗口分组和无消费者的批量／状态／Layer1 接口与完成广播已删除。

**铁律：新增模块一律 ****`BACKGROUND`****。** `module-init/__tests__/module-layering.test.ts`
守护启动分层，禁止恢复窗口入口隐式拉起模块的行为。

`ensureModule` / `withModule`（`src/commands/module-init.ts`）保障后台启动尚未完成时的等待与
失败重试；主进程统一防重入，渲染端并发共用任务。当前 IPC 只保留 `module-init:init-module`；
未使用的全状态查询、状态类型、时间戳及 WebSocket 状态名单已删除，内部只记录已就绪模块。

注：`@/electron` 的 `invoke` 已内置启动竞态重试（遇 "No handler registered" 每 500ms 重试、
上限 5s，收到过成功响应即停止），它只覆盖「注册晚于调用」的窗口期，**不覆盖「从未注册」**。

**卡顿诊断（perf-monitor）**：BACKGROUND 模块 `src-electron/main/modules/perf-monitor.ts`
持续采集主进程事件循环直方图（启动前 15s 每秒、之后每 15s 采样 mean/p99/max）、内存与 CPU 趋势、慢 IPC 与慢 SQL
（契约桥 `register` 包装与 database 事件注册循环计时，>100ms / >50ms 记明细，IPC 另按分钟
聚合计数检测洪水）；渲染端 `src/utils/perf-observer.ts`（init.ts 安装）采集事件循环心跳
延迟、longtask 脚本归因、掉帧片段、JS 堆曲线与 react-query 刷新率，经
`perf-monitor:renderer-event` 独立通道按窗口汇聚（不走 logger 的 sendLog，避开限流）。
数据只存内存 ring buffer；「导出性能快照」由命令面板（`export-perf-snapshot` 动作）或
托盘/Dock 菜单触发（渲染端冻结时的兜底入口），落盘 `~/.editor/logs/perf-snapshot-*.json`
后打开所在文件夹并高亮该文件（shell.showItemInFolder），文件夹本身即结果反馈，不另发通知。`recordIpcCall` / `recordSqlCall` 在 command-bridge-install（主入口首个
import）注册期即被调用，因此记录数据挂在模块级、import 期可用；`init()` 只启动采样器。

启动诊断参数 `--tau-profile-startup` 按需开启主进程 CPU profile：入口依赖加载阶段启动进程内 inspector，约 10 秒后保存 `~/.editor/logs/startup-main-*.cpuprofile`，不开调试端口；普通启动不采集。需完整退出后带参数重启，第二实例转发参数不会为已运行进程补录启动。性能快照 `main.startupCpuProfile` 包含采集状态与文件路径；持续阻塞可能延后停止计时器，实际时长以 profile 为准。

知识地图读取 `knowledge-map:get` 显式接入 IPC 计时；快照的 `renderer[*].stages` 记录加载、建图及超过 50ms 的绘制，`main.stages` 记录向量候选扫描，只有阶段、耗时与规模，不记录正文。渲染事件携带发生时间，避免主进程积压把接收时间当作起点；堆采样每次重新读取 memory。长帧的 renderMs 为 renderStart 到帧末，styleLayoutMs 为 styleAndLayoutStart 到帧末（含后续渲染），无法取得的 paintMs 为 null，不能当成零开销。

主内容全文队列（`main-content-fts-index-queue`）在连库对账之外订阅正文写入总线：按库合并 1 秒（持续写入最长 5 秒），经 `EntitySearchTable.locateAll` 找到引用这些正文的卡片 / 文章 / 项目文档 / 日记逐个重建，正文清空则移除。索引未就绪（构建中或待重建）时跳过，交给对账；实体删除和标题等元数据变化仍由连库对账处理。

主内容向量队列先读取实体 ID、正文 ID、实体/正文较新修订号，按已索引修订筛选后才读全文。候选收集与覆盖率合并扫描；未变的已索引正文不转换，空正文修订按数据库连接缓存。变化正文的 JSON 解析、Markdown 转换与分节经 `IndexContentClient` 逐篇交给 `ContentExecutor` 的浏览器进程执行；每轮扫描持有独立取消作用域，finally 回收会话，共用内容进程不随每轮销毁。元数据扫描每批让出事件循环。统计入口不分节、不准备嵌入任务；未索引或变化项仍需转换确认正文非空，以保留纯媒体等可索引内容的口径。切库或代次失效后不清理候选外向量。

离线知识地图只构建显式边、邻接与标签，不重复运行社区发现和种子布局。主题/子主题世界几何按场景身份缓存，替换地图即失效；静态地图命中树只在场景变化时重建，平移与缩放不失效。动态链接图仍按帧更新命中树与几何，不能共用静态缓存。

本地嵌入由 `local-inference/client.ts` 懒建独立 Electron `utilityProcess`，模型加载、分词、480 token 分窗推理和向量合并只在 `local-inference-worker` 执行；主进程不加载 node-llama-cpp。CPU 推理线程数为可用核心的一半，最少 1、最多 4；context 固定 512 token，与现有分窗上限一致，避免为短窗口分配模型的完整上下文。后台重建每条文本之间让出 10ms，查询在文本边界优先调度，不中断正在计算的文本；主内容、PDF、Notebook、视频检索均显式标记交互优先级。子进程启动握手、请求超时或退出时拒绝在途及排队任务，下次请求可重新启动；应用 `quit` 时终止进程（受控退出用 `app.exit`，不能依赖 `will-quit`）。向量输入与合并算法不变，不提升嵌入指纹版本。同步数据库写入仍由主进程持有。

### 产品版本与下载统计

`telemetry` 是 BACKGROUND 模块，只在正式构建启动时通过 `@tau/analytics/client` 的 `VersionClient` 上报当前应用版本，使用随机安装标识、版本号和 UTC 观测时间；同版本按上海自然日去重，版本变化时重新上报。没有渲染端埋点命令，不监听启动耗时、页面切换、窗口聚焦、退出、崩溃或持续心跳。默认只在正式构建启用，`TAU_TELEMETRY_DEBUG=1` 开启 development；`TAU_TELEMETRY_DISABLED=1` 停用。

本机状态在 `~/.editor/analytics.json`（开发为 `analytics.development.json`），串行请求先原子落盘再发送至 `analytics.taunote.app/v1/versions`；失败最多补报三次，仍失败保留当前观测至下次启动，不建立周期任务。状态格式 2 保存安装 ID、已确认和待确认版本；本版本将已有格式 1 状态转换为格式 2，仅沿用安装 ID 并丢弃旧行为队列，不再读取更早的 `telemetry.json`。

服务端按安装实例、上海日期保存最新版本，乱序旧观测不能覆盖新观测；管理后台只保留版本分布和下载统计。旧 `/v1/events/batch` 返回 410 且不读正文、不写 D1；旧客户端仍需升级才能停止本机生成和发送行为请求。R2 安装包仍经原下载域名分发，官网入口统计按日/安装包/出口摘要近似去重的下载发起；自动更新和直链不计入。协议、数据迁移与部署顺序见 [统计设计](/apps/analytics/docs/DESIGN.md)。

## 2.6 通知分流

插件通过 `context.notifications.send` 发送纯文本通知：`mode` 为 `auto`（默认，按插件所在窗口焦点分流）、`in-app`（固定应用内）或 `system`（固定独立通知窗口）。桌面适配仍经 `appNotify`，来源由宿主填写插件名，通知 ID 由宿主生成；返回的 `Disposable` 只能撤销本条通知，停用、激活失败和切库自动清理。最多两个操作按钮，回调留在插件所在渲染窗口，执行前校验激活与句柄有效性。没有新增业务数据权限或后台进程通知入口。作者示例见 `docs/plugin-system/通知能力.md`。

通知按来源窗口焦点分流（聚焦进应用内卡栈、失焦进系统通知窗口；两栈互不同步）。接入口径：

- **渲染端业务一律 `appNotify`**（`features/notifications/notify.ts`），禁止直接调用
  `@tau/ui` 的 `notify`（showcase 样板间与系统通知窗口页除外，ESLint 守护）。`icon` 传
  注册表键（`features/notifications/icons.ts` 的 `NOTIFICATION_ICONS`），不传组件；
  主进程侧 icon 字符串键与注册表的对账由
  `features/notifications/__tests__/main-process-icons.test.ts` 守护。
- **主进程用 `routeNotification(payload, origin)`**（`src-electron/main/windows/`），
  禁止 `new Notification(...)` 原生通知（ESLint 守护）；按钮回调放 `origin.handlers`，
  收尾放 `origin.onClose`，关闭走 `dismissNotification(id)`。

## 3. 三大协议（照抄即用）

**新增页面**（如卡片库）：

```TSX
// features/cards/pages/cards.page.tsx —— 文件即注册，无需改任何登记表
const schema = createPageSchema({ keyword: paramOptional(paramString()) });
type CardsParams = typeof schema.type;

export default definePage({
  key: "cards", // 与 navigation.ts 的 key 一致即接管侧边栏入口
  match: "single", // 功能页用 single；详情页用 "params" + getId: p => `card-${p.cardId}`
  label: "卡片库",
  params: schema.schema,
  component: CardsView, // 视图组件放 ../views/
});
```

- 导航：`navigator.push("cards", { keyword: "..." })`；视图内读本实例参数用 `usePageParams<T>()`（PageHost 按栈条目注入）。params 页禁止从 `usePage().state` 全局栈顶取参——多实例保活时被隐藏实例会读到栈顶参数，引发串台与节流落盘写错行（回归见 `page/__tests__/pageParams.test.tsx`）。
- 栈机去重：重复 push 同 key 同参 = no-op、异参 = 原位更新，调用侧不做「是否已激活」判断。push 不带参数 = 未指定字段，激活已有实例沿用现有参数（侧栏/首页入口不清页内筛选）；要显式清空必须带字段（整体替换语义）。条目只在 forward 缓冲时同样命中：复活压回栈顶沿用参数。

**新增页面数据**（features/<域>/queries.ts，照抄 features/home 的形状）：

```TypeScript
export function useXxxSnapshot() {
  const query = useQuery({
    queryKey: ["<域>", "snapshot"],
    queryFn: fetchXxxSnapshot, // 并行 Promise.allSettled + 单项降级，整体不 reject
    staleTime: 60_000,
    refetchOnWindowFocus: true, // 全局默认是关，"今日"类数据按页面开启
  });
  return { data: query.data ?? null, loading: query.isPending, refresh: () => void query.refetch() };
}
```

禁止手写 useEffect+useState 拉取；列表展示 N 条禁止为此全量拉大表（渐进窗口凑满即停，或主进程聚合命令）。

**聊天消息模型（单一来源）**：消息/会话/流式块类型统一在 `packages/shared/src/chat-core/messages.ts`（AssistantBlock 系列、Request/ResponseMessage、ChatSessionRecord、ToolCallPayload 等），桌面 types 仅 re-export；桌面与浏览器扩展共用同一模型，禁止再各自定义同名类型。这套模型是展示投影——事实源是 pi 会话文件，主进程 `pi-session-transcript.ts` 把 pi entries 投影成它；流式块组装与流事件归约器（`applyChatStreamEvent`，快照语义 + turnId）同在 chat-core，扩展与桌面间走 AI 运行协议 v2（`chat-core/aiRunProtocol.ts`），两端用同一归约器。

**聊天会话数据**：对话内容的事实源是 pi JSONL（`~/.editor/sessions/<库名>/`），sqlite 只有目录表 `chat_session`（id = pi 会话 id，scope + domainRef 区分主聊天 / PDF / 视频笔记 / 学习项目，只存元数据）。读走 `pi-session:transcript` 投影，改历史（回退、分叉、切版本、删消息）走 `pi-session:edit`，都按消息上的 `piEntryIds` 定位，不按下标或 clientId；分支在同一文件的会话树上，不新建目录行。删除所属对象时 `ChatSessionTable.removeByDomain` 连会话文件一起删，渲染端先 `releaseBucket`。禁止再往 sqlite 写消息载荷或新建聊天表。

**新增主题**：`packages/themes/src/themes/<name>.theme.ts` 用 defineTheme 声明（tokens 全键强制），在 `register.ts` import，**并同步在 `tokens.css` 补 `[data-theme="<key>"]` 数据块**——`theme-parity.test.ts` 守护两处一致与 AA 对比度。派生逻辑写在 tokens() 里。

**主题模式与切换**：`@tau/themes/react` 提供 `createThemeRuntime` 与默认 store；mode 可以是主题 key 或 system。AppShell 挂载运行时并在清理时释放系统监听；DOM 应用由公共主题实现负责，业务代码不操作 data-theme。Vite 构建入口调用 `createThemeBootstrapScript()` 注入首帧脚本。桌面侧栏、标题栏尺寸留在 app/base.css，不作为公共主题尺度。

**编辑器主题与局部明暗**：`data-theme` 是主题族 key，明暗由 `data-mode` 与主题运行时管理。编辑器无全局 Provider，宿主显式传场景 EditorKit，取色走 `--ed-*`/`--tau-*` 与 ThemeService；`useEditorTheme` 订阅明暗、主题族与通知修订号（同明暗换主题也刷新 ECharts 等取色组件）。新 editor 实例有独立 Slate 挂载键与内容/选区快照；同谱系文档换源保留实例；新页面不以 documentId 为 key 强制重建内容编辑器。编辑器子树用 `<EditorThemeOverride mode>`；整块区域换主题族（导出图片）节点同时写 data-theme/data-mode；演示和沉浸舞台经 PortalScope 挂回 UI 浮层避免继承 body 明暗。JavaScript 明暗统一消费 `useThemeStore(s => s.mode)`；设置不再有 darkMode/accent，图片圆角/阴影在 appearance.image。

**字体设置链路**：`fontSetting` → `useSyncFont()`（App 根挂载一次）→ root 级覆盖。用户字体/字号是应用级默认（界面与编辑器统一）：字体族覆盖 `--tau-font`/`--tau-font-mono`；字号按 13px 基准**阻尼**缩放 `--tau-text-*` 全部档位（半速率传导，与内容区解耦——宿主可用 `--font-size` 为内容容器提供原始字号，Editor 继承所在容器；排版层级保持，间距圆角不动；例外：侧边栏条目行高/图标按 em 折算）；`--font / --font-size / --mono-font` 一并写 root。默认字体变量在 :root，body 不重复声明；Editor 根节点不声明字体族/字号。**Tailwind v4 陷阱**：`@theme inline` 对字面值会把值内联进工具类，运行时覆盖 CSS 变量无效——字号 token 必须经 `:root` 字面值层 + `@theme inline` var 桥接，`useSyncFont` 覆盖字面值层。

**颜色与尺度消费**：组件样式一律 Tailwind 工具类；颜色写语义类（`bg-page / bg-surface / text-ink-1/2/3 / hover:bg-hover / bg-accent-soft / text-accent / bg-ok-soft / text-warn`…），尺度写 tau 命名空间词（`text-tau-body / rounded-tau-sm|md|lg / shadow-card / ease-tau-out / font-tau / font-tau-mono / font-tau-hand`，`font-tau-hand` 只用于白板手绘文字），词表见 [design-system.md](./design-system.md)。禁止裸色值、antd token、内联十六进制、白名单外手写 CSS。数据驱动的动态值（进度宽度等）允许 inline style 但色值仍走语义类；热力图色阶这类主题 accent 的 alpha 派生以 arbitrary 注明出处。跨域视觉模式收口 `packages/ui/src/primitives/`。**不存在 bg-group**：小面积填充用 `bg-hover`；容器 = 透明底 + `border-line-1` 描边、输入控件 = `bg-surface` + 描边，嵌套底色叠层是常见腐化点。

**编辑器集成要点**（扩展与包的完整约定见 `packages/editor/README.md` 与 [架构手册](/packages/editor/docs/architecture.md)）：

- 内核只内建段落，通用功能在 `@tau/editor/extensions/<功能>`，组合在 `/presets/standard`，四端显式装配并加载对应 styles.css；HTML、custom-block、ABC、TikZ、Typst 由独立应用插件提供，不回内置数组。内核不重导出领域渲染器，宿主按服务契约注入编译能力。
- `packages/blog` 单向依赖 Editor 与数据 SDK，对外 @tau/blog 提供 ContentRenderer/createClient；`scripts/blog/package-blog.mjs` 收拢一份 npm 交付。模板自选页面 UI（hrefFor、renderLink、onOutline），不接触编辑器装配；发布 CSS 校验后按原文加载，@tau/blog 的 styles.css 全部处于级联层（preflight 不会盖过模板工具类）。
- 共用宿主能力（IResourceService 等）从 `@tau/shared/host-services` 引用；媒体归 `@tau/editor/extensions/media`（灯箱、裁剪、属性条经扩展 layers 挂载，属性条「更多」用 /api 的 ElementMenu）。
- 异步写入从 `/api` 用 `capture*Submission` 守卫（check/commit/dispose 管理有效性与引用释放；commit 回调必须同步，失效返回 discarded，真实异常继续抛出）；只读、Activity 隐藏、卸载、换源与整篇重设永久废弃旧操作；媒体上传忙态归实例运行时，不能为清理忙态写只读文档。
- 命令式整体设值已删除：ContentEditor 正文更新只由文档绑定接管；表单清空/恢复经新 key 建会话；禁止用下标复用编辑状态。整篇替换必须带当前修订号并在原 Y.Doc 上一次事务提交；跨文档复制经 Slate 节点转换（禁止 `Y.XmlText.clone()`，不复制属性）。Markdown 文件视图用 `editor-collab/local` 本地 Y.Doc 会话，源码切换不卸载 Editor；`useTextFileSession` 负责磁盘冲突，迟到读取不回写已关闭视图。源码预览块的编辑与预览归 editor-source-view（CodeMirror 懒加载，退出释放并提交防抖草稿）。
- Markdown 文件会话通过 `editor-collab/local.getSnapshot()` 生成独立只读的块投影：JSON 块深冻结并按 Yjs 事件失效，未变块复用；事务内或不宜缓存的数据回退为完整独立投影。Markdown 按会话缓存已声明纯 codec 的不可变块，脚注、未声明插件及插件快照变更保留完整转换与失效语义。保存读取先 flush 再复用文本快照，导出用独立可修改的 `getContent()` 副本，不因 500ms 自动保存轮询重新转换全文。富文本编辑期间不向隐藏源码编辑器 setValue，进入源码时再同步当前原文；源码撤销、重做与外部载入仍即时同步。接口细节见 [本地文档](/packages/editor-collab/README.md) 与 [Markdown 处理器](/packages/markdown/README.md)。
- 正文目录复用未变条目与标题索引：滚动及正文更新优先测量上次位置相邻标题，大幅跳转时二分定位，不顺序测量全部离屏标题；已折叠隐藏的标题不参加位置判定。Markdown 正文字数按 Slate 不可变顶层块缓存，局部修改只重新统计受影响块，不额外读取 Y.Doc 全文。
- Markdown 源码视图首次进入时才创建，此后保留同一个 CodeMirror 实例；首次挂载后恢复映射光标，转换失败仍自动进入源码并保留原文。富文本连接在 Yjs 转换后按当前编辑器 schema 补齐已声明行内节点的空文本落点，未知和 void 子树保持原样；随后仍执行完整 Slate 规范化。此准备只作用于编辑器投影，不写 Y.Doc 或用户历史，连接后恢复正常规范化方法；不能放在写入 Yjs 前，因为零长度文本不会被 Yjs 保留。
- Markdown 大纲列通过同一组容器切换布局，源码标题统计、窗口宽度或大纲开合不重挂正文和源码编辑器；CodeMirror 的实例登记与注销在同一个 effect 中配对，回调变化或视图重新挂载后重新登记当前实例，避免旧清理覆盖新实例引用。
- Markdown 长文先渲染预算内完整块的独立只读首屏，原文件会话和 Y.Doc 始终保有全文；预览不参与保存或历史。首屏绘制后用 transition 准备完整编辑器，准备区不可交互、不进入文档滚动高度；确认全篇 DOM 提交并经过帧调度后原位交接。选字、拖选和预览控件聚焦期间延后，按逻辑块锚点恢复阅读位置后重新启用浏览器滚动锚定，不主动聚焦正文。超预算首块沿用直接完整编辑路径，不截断复杂结构。等待期间源码仍可使用全文；返回正文的光标恢复等待完整编辑器就绪，后来转移的外部焦点不被覆盖。
- 首屏预览的代码块使用独立运行时 uuid，持久化文档及源码映射继续使用原 uuid；预览退出不清理正式编辑器的代码控制器。预览键盘历史委托完整文件会话；正常保存热键保留原来的冒泡顺序，先让块内编辑器提交草稿。

## 3.5 构建与打包

- Vite 开发、样板间与构建命令统一 `--configLoader runner`（默认 bundle 加载器会把工作区 TS 配置依赖外部化导致 `ERR_UNKNOWN_FILE_EXTENSION`）；配置用 `fileURLToPath(import.meta.url)` 取目录。
- 桌面消费的编辑器扩展包、@tau/ui、@tau/themes 由 Vite 编入产物，统一声明在桌面 devDependencies——放 dependencies 会让 electron-builder 再收集整条生产依赖链；运行时从磁盘加载的外置模块与原生依赖保留生产声明，调整后检查实际安装包与原生运行时。
- 安装包排除依赖 `.js.map`/`.mjs.map`/`.cjs.map`（afterPack 补复制同样规则），不泛删 `.map` 数据文件；`verify:native-runtime` 用包内 Electron 与依赖执行 pi 冒烟（含 TypeScript 扩展加载、中文路径、JSONL 恢复），临时工作区隔离。
- pi 只带 SDK（不打包独立 CLI bundle 与 esbuild），`pi-packaging-boundary.mjs` 检查已审核版本与消费者，边界变化必须重新审核；主进程 Vite 的 `resolve.dedupe` 统一桌面入口的 `@earendil-works/pi-ai`（避免 peer 解析重复进 bundle 触发 Anthropic SDK 代码生成错误）。分词词典由外置 `@node-rs/jieba/dict` 从包内加载，不复制不劫持。
- macOS 双架构：`pnpm build` 同时产出 x64 与 arm64 的 DMG/ZIP（共用一份 latest-mac.yml；DMG 供官网、ZIP 供自动更新），`supportedArchitectures.cpu` 含两架构；afterPack 按目标裁剪原生依赖，构建结束恢复本机 better-sqlite3。双架构发行经 `run-mac-builder.mjs`：顺序构建签名（原生依赖原地重编，禁止并发）→ 并行公证附票 → 全部成功才出 target；blockmap 与合并 latest-mac.yml 由同一 PublishManager 生成，不改包不手工合并；任一签名/公证失败不产发行物。凭据推荐 `APPLE_KEYCHAIN_PROFILE`（保留 electron-builder.env）。回归：`node --test scripts/parallel-mac-packager.test.mjs scripts/release-artifacts.test.mjs`。发布前校验清单引用文件、大小、摘要与双架构四件套，禁止半套产物覆盖更新源；官网 Pages 读发布清单缓存 60 秒。

### pi 聊天运行时与工具审批

聊天操作区区分「重试」与「重新生成」：末尾用户问题尚无正文、工具调用时原位重试，复用原用户 entry（含附件与展示信息），不增加问题版本或分支。主进程重新核验当前投影，以隐藏的 `desktop-retry` 自定义消息触发 pi 完整运行与 settled 流程，空失败回答通过 context_edit 省略，系统提示仍取当前配置。上次在用户消息写入前失败则正常提交一次。已有正文、工具调用或后续追问时仍回退重发并保留旧版本；编辑重发不走失败重试。

视频学习台与白板视频抽屉共用 `VideoNoteChatPanel`，经 `useScopedChat` 接入 pi 会话；旧独立总结入口已移除，总结由视频对话承载。视频检索只保留页面作用域工具，不恢复全局视频笔记 MCP 工具。转录优化与电子书重写统一消费 `useLLMConfig` 的 `provider/model`，缺少配置时经 `openLLMSettingsSection` 打开新设置分区。

纯聊天模型、消息迁移、归约器与运行协议经公共子入口 `@tau/shared/chat-core` 消费；该入口不加载 React/DOM，主进程可直接使用。调用方禁止导入 `@tau/shared/src/chat-core/*`，包内部文件布局由共享包自行维护。

会话键包含数据库身份，投影、树编辑和目录补丁显式携带创建时的库名。宿主在异步装配前占用文件租约；图片准备也是忙态，释放会话先取消并等待在途操作。删除后不得发布迟到的投影或标题。PDF / 学习项目工具的执行快照归会话持有，不依赖页面继续挂载；运行时 LRU 同时释放已打开投影。

同步仍用整包：数据库与带摘要清单的会话 ZIP 上传到唯一对象名，最后原子创建唯一后继版本记录（同步信封版本 5，内部模型版本仍为 1）。版本指针只加速读取，读端沿后继记录取得最新提交；并发和响应丢失由提交身份仲裁，禁止 GET 后普通覆盖。版本探测与上传只读取历史元信息，下载前独立执行版本 5 门禁，不能因旧父版本阻断升级上传。设置页缓存远端版本及协议，旧协议显示「需升级云端」并禁用拉取，未来协议显示「协议不兼容」，读取失败显示「检查失败」。下载校验摘要、目录身份、会话树后在主进程成对安装，回滚日志由开库入口先恢复；会话运行中拒绝同步，锁持有到维护重连完成。迁移各阶段独立判断完成度，旧行身份写入 migration_meta，崩溃重试不重新分配 ID。

桌面配对同步使用公共 Node 入口 `@tau/db-schema/sync` 的会话打包、SQLite/JSONL校验、回滚日志与数据库锁。CLI已整体退役；数据库访问仍检查维护锁并保留必要的崩溃恢复，不允许并发写入正在维护的数据库。

同步存储插件只在渲染进程通过 `context.sync.register` 注册五方法提供方，沿用 main.js，不读取旧 manifest.sync 入口；新的显式 backend 独立声明与授权，不自动承载同步提供方。S3使用浏览器SDK构建，网络经已有context.fetch由宿主传输；主进程不执行同步插件代码。同步设置target/syncConfig及应用级配置保留。数据库与用量流程直接调用渲染端提供方；资源扫描、计划、账本和重试仍在主进程，存储操作按任务转发给发起窗口。PluginSyncSessions只登记任务与归属并转发数据，任务期间阻止停用、卸载和更新；窗口断开时拒绝待响应请求、清理任务，不转移到Node执行。CLI同步命令、TUI入口、Provider及cli-sync协调接口已删除；通用数据库维护锁保留。S3旧包不再从安装包中自动替换；用户从中心选择新版后仍走原安装事务，配置与启用意图不变。OSS也已按同一渲染进程边界拆分，使用ali-oss官方浏览器构建和宿主fetch；旧配置及资源账本经migrateSyncPluginSettings一次性迁移。旧OSS同步Provider、资源Adapter及同步IPC已删除，资源上传/列桶及其共享凭据仍保留。WebDAV同步同样使用独立插件与官方浏览器客户端，通过SDK公开传输扩展绑定context.fetch；旧配置与账本由同一迁移入口接管，旧Provider/Adapter和exists/list同步IPC已删除。宿主upload/download仍服务资源上传下载。条件创建正确返回412失败，列举仅忽略404；所有插件资源调度统一使用现有插件参数，不按插件身份特判。WebDAV验收见 `docs/plugin-system/57-WebDAV渲染进程拆分.md`。GitHub同步也已通过context.fetch调用原Contents API，普通写入先取SHA，条件创建不传SHA；旧配置与资源账本迁入tau.sync-github，旧同步Provider/Adapter与同步专用工具已删除。四种同步方式现统一为插件，设置页只显示插件配置，GitHub 资源按原始地址加载，不做 CDN 地址改写；桌面账号及博客查询工具已迁入发布插件，移动端仍有独立原生消费者。资源调度复用通用插件参数（并发配置5，经现有执行器上限收敛为3），无插件身份特判。GitHub验收见docs/plugin-system/58-GitHub渲染进程拆分.md。codec 的既有 Node 执行链已由 独立后台 M4 迁入独立内容渲染进程，现行边界与验证见插件专题 78。OSS实现与验收见 `docs/plugin-system/56-OSS渲染进程拆分.md`；执行边界见 `docs/plugin-system/55-插件渲染进程边界纠偏.md`。

同步与上传的渲染注册表实现统一归 @tau/plugins/provider-host，桌面只保留实例装配与 Electron 转发；作者 API 和桌面表单不变。移动迁入独立设置视图并消费相同配置属性，具体持久化与选用行为由各端宿主处理；两端账号配置都按插件独立保存，不做统一账号共享。

渲染端纯信封与发布协议使用 `@tau/db-schema/sync-protocol`，不得深路径导入 Node 包内部。锁的 5 秒心跳在独立线程运行，120 秒过期；同步 I/O 不会阻塞续租，失锁后拒绝旧租约。后端原子创建要求：S3/WebDAV 用 If-None-Match: *，GitHub 用不带 SHA 的创建请求，OSS 用防覆盖创建并检查桶版本控制（版本控制已启用的桶拒绝发布，不能假称支持原子防覆盖）。移动端记录下载基底对应的会话对象，上传不拼接其他版本的包。

工具清单与执行器在创建宿主前一次性捕获，不能在 await 创建后再查页面注册表，也不能在执行时按名称获取后来注册的工具。`ToolExecutionContext` 的 `databaseName/signal` 贯穿普通工具、作用域工具及子代理；业务调用用 `bindDatabaseCommands` 绑定命令封装，每次调用只捕获同步进入 `invoke` 的上下文，不能把异步业务函数当作命令绑定。内容提案和检查点也须带库名。工具中止经 `pi-tool-cancel` 到渲染端，MCP 再传给 SDK；每次执行带独立 `executionId`，迟到结果、错误与进度不能认领重用同一 `toolCallId` 的新执行。失败使用 pi 工具拒绝语义，不把错误藏在成功结果 metadata 中。

MCP 连接配置的摘要进入工具定义身份，渲染层重载后也不能把旧来源的授权交给同名新来源。学习项目生成工具启动的后台任务，其占位、流式保存、最终正文、测验和播客记录都使用原库命令客户端；任务投影带库名，不能仅在工具入口绑定数据库。

`bindDatabaseCommands` 以可写副本承载代理，读取与调用仍委托原命令对象；禁止直接代理生产构建冻结的模块并替换函数返回值，否则会触发 Proxy 只读属性约束。回归测试须覆盖冻结导出、嵌套调用、异常恢复及取消后的数据库上下文隔离。

未知模型容量必须补齐后才能运行，不使用猜测窗口；Shell 兜底按平台处理，macOS/Linux 保留系统 shell。

上下文用量按 `providerId + modelId` 匹配，显示名不参与新数据身份判定；旧 `modelName` 兼容读取 ID 或名称。
用量取最近一次模型调用（不累加工具循环），输入包含 pi 独立报告的缓存读写 token，流式与会话投影保持一致。
内置模型的聊天容量从当前目录解析，已保存设置仅作兜底；K 按 1000 换算。
容量随 pi 目录升级，不在业务代码中按模型名称添加容量特判。

桌面带工具调用统一使用主进程 pi 会话。`piChatRuntime` 按 conversationKey 常驻持有聊天容器、
事件归约器、待发送队列与插话，组件只负责输入与展示；切页/卸载不能停止归约。一轮结束（settled）后
重读会话文件的投影回写容器。单发生成走 `services/piLLM.ts`（`pi-ai:single-shot`），一次性带工具的
任务走 `services/piAgentRunner.ts`。新增 AI 入口不得再引入自研协议适配或直连服务商 SDK；集成设置的
Key 连接测试用 `pi-ai:verify-key`。

工具权限在主进程 `PiToolPermissions` 包装 pi 原生 `beforeToolCall`，保留扩展决定并使用
AbortSignal 取消等待。read/grep/find/ls 为只读，edit/write 为写入，bash/powershell 与远端
MCP 默认为执行；自定义工具清单携带 risk/source。手动确认、自动编辑、Bypass 的口径沿用
交互聊天的内容编辑工具已有审阅卡，不重复审批；一次性入口无审批界面时明确拒绝
需要确认的操作。新增带工具入口必须显式说明是否能承载审批，不得默认开启交互等待。

未声明风险按 execute 处理；只读工具必须显式声明 read，不能在渲染端把缺省风险降为 read。

待审批与会话授权由 pi 宿主持有，审批回传校验创建窗口与随机 requestId；窗口销毁、会话
释放或原生 signal 中止时结束等待。渲染端 `services/piInteractions.ts` 只投影带递增版本的快照（审批与
提问合并在一份 `PiSessionInteractionSnapshot` 里），ToolApprovalBar
按 sessionId + toolCallId 定位，展示主进程确认的最终参数。piChatRuntime 根据宿主快照投影等待卡，渲染层
重载后所有对话均按 scope 收养宿主，不以历史消息是否包含未完成工具调用作为恢复条件。
find-by-scope 返回模型身份、真实忙态、当前会话投影与未落盘的回答快照；恢复期间保持发送等待，
先恢复工具 turn 与续流监听，再开放按钮。订阅后复核宿主状态，补齐恢复间隙开始的回答快照或最终投影；
复核期间已收到新事件时以事件为准，迟到的空闲快照不能覆盖新一轮运行态。
授权不写数据库，pi 会话重建、宿主空闲 30 分钟回收或主进程重启后失效；重开时悬挂的工具调用标为已中断。

## 4. UI 风格铁律（A2 校准结论，评审对照）

> **视觉基准与样式载体**：视觉基准 = `mockups/direction-a-soft.html`（A2 柔和版）+ `mockups/home-final.html`（今日页定稿），**降级为参考物**（浏览器打开对照截图），不再是导出源；调视觉直接改组件里的 Tailwind 类。样式载体 = **Tailwind v4 工具类优先**，组件 className 语义化、就地可读；跨域视觉模式抽 `packages/ui/src/primitives/` 组件。CSS 仅保留四类白名单（逐例裁决、默认不许）：① `app/base.css` 的根基础规则与 `.app` reset；② `@keyframes`（经 `tokens.css` 的 `--animate-*` 消费）；③ `tokens.css` 主题数据块；④ Tailwind 表达不了的复杂伪元素/全局状态（现存唯一实例：home.css 的 edge-fade mask + page 根高度链）。原"模板类名 1:1 / 禁手改 shell.css / 先改模板再导出"工作流已废弃（导出脚本从未入库，不可复现）；shell.css/stats.css 已删除，约 90 个无消费者的预置模板类不迁移，将来做对应页面时用 Tailwind 语义类重写。

1. **融合骨架**：侧栏透明融于 bg-page、整高贯通窗口；标题栏/状态栏只属于右列；不出现横贯全宽的条。数据库连接启动屏的内容须用 `col-span-full` 横跨壳层全部列并居中；Loading 使用 `minHeight={0}` 与 `h-auto`，只显示「正在连接数据库…」，历史迁移退役后不再显示备份与迁移说明。
2. **零横线**：分组靠底色容器（bg-surface 圆角面板 + shadow-card）与留白；禁止用 border 分隔区块（border 只允许 ≤2px 控件级细节，如勾选圈）。
3. **宽度利用**：内容区 max-w 1680 宽容器；窄列只允许出现在正文阅读列（~72ch）；详情页用双栏（正文+信息栏）。PDF 阅读页不设工作区最大宽度，铺满壳层可用空间并保留边缘留白，纸张尺寸由阅读器缩放控制。
4. **反馈语言**：hover = bg-hover 淡墨底；**激活（侧栏）= bg-selected（accent 叠层）+ 左缘 3px accent 竖标**；浮起（卡片）= shadow-card，卡片 hover = shadow-lift 轻抬（2026-09-23 校准：不借用 float 浮层档——40px 大模糊在卡片上又大又重；shadow-float 只给 Menu/Dialog 等真浮层；shadow-paper 只给白板上浮起的文档纸——贴边细描线 + 接触影 + 远投影，与贴在画布上的富文本、图形拉开层次）；按钮无描边。注意：`hover:` 变体已用 `@custom-variant hover (&:hover)` 去掉 v4 默认的 `@media (hover: hover)` 包裹——否则触摸屏设备（hover:none 判定）会静默杀掉全应用 hover 反馈。
5. **圆角**：面板/卡片 var(--tau-radius-lg)=16，控件 md=12，小元素 sm=8。
6. **数字** tabular-nums；字号体系以模板为准（25/14/13.5/12.5/11.5）。
7. **滚动条**：不出现系统滚动条——4px 细墨条仅在「活跃」时显形（hover 滚动容器或滚动中；停止 700ms 且鼠标不在时隐藏，移出窗口立即隐藏）。实现 = `base.css` 的 `.app` 作用域样式（`scrollbar-live` 类控制 thumb）+ `@tau/ui` 的 initScrollbarAutoHide 事件委托（AppShell 初始化一次，全部内部滚动区自动生效）。**位置**：细条画在滚动容器 border-box 的右缘，容器满宽时它就贴死窗口右缘——用 `-mr/pr` 借位把 border-box 撑进容器自身的右留白（内容盒右缘因此不动、与相邻列仍对齐），细条落进留白里；home-scroll 与样板间内容列同为 `-mr-6 pr-6`，离窗口右缘 16px。两个坑别踩：① 禁止改回 `:hover` 伪类驱动——Chromium 滚动条伪元素不随 `:hover` 重算，显形后会冻结不消失；② 旧 main.less 已删除，滚动条唯一规则归公共 UI；避免重复定义不同名的阴影属性留下常显残影。
8. **className 覆盖必须走 ****`cn()`******：组件默认样式要让调用方覆盖（`IconButton` 的 `size-[27px]`、样板间 `MatrixRow` 的 `trayClassName="items-center"`）时，合并一律用 `@tau/ui` 的 `cn()` 而非裸 clsx——Tailwind 同属性工具类的胜负由生成顺序决定，clsx 的先后顺序无效，覆盖会静默失效。项目自有尺度词（`text-tau-*`/`rounded-tau-*`/`shadow-card`/`ease-tau-out` 等）已在 cn 内登记；新增尺度 token 必须同步登记（`packages/ui/src/__tests__/cn.test.ts` 守护与 `tokens.css` 一致）。

## 5. 交互规范（已定案）

- 命令面板选中状态按实际查询/筛选和结果行身份更新，不以临时数组引用作为重置条件；插件命令快照随宿主修订刷新。鼠标悬停只改变高亮，键盘上下键负责把选中行滚入视口，避免点击前列表跳回顶部。

- 页面经 `usePageBreadcrumb(key, node)` 注入标题栏面包屑；仅活动页的槽位显示，卸载自动清理，node 经 useMemo 稳定化，传 null 回到默认 label。Titlebar 为可交互内容加 `app-region-no-drag`。底部信息由页面自身布局承载，壳层不提供状态栏槽位。
- 右侧辅助栏：壳层在正文右侧提供一张可开合的纸（`app/AssistDock.tsx`），当前只承载 AI 对话；开合 = 标题栏按钮 / `Ctrl+J` / 命令面板，宽度 360–560 持久化在 shellStore。空间不足时由 `assistLayout.ts` 先自动收起侧栏（关闭时还原，用户手动切侧栏即接管）、再退化为覆盖浮层（Esc 退场）。页面本身就是对话时（`chat` 在栈顶）隐藏。页面不要自行在右侧再造常驻栏——例外是「这份内容专属的会话」：页面用 `app/assistOwner.ts` 的 `useOwnAssist(pageKey, toggle)` 接管开关，Ctrl/⌘+J 与命令面板「AI 对话」改为开合页面自己的栏，标题栏按钮与停靠栏在该页隐藏；不要自己监听 Ctrl/⌘+J。进入页面收起全局侧栏用 `app/useSidebarCollapsedWhile(active)`（离开 / 保活隐藏即还原）。
- 对话 UI：消息 / 思考 / 工具调用 / 代码块 / markdown 排版在 `@tau/chat-ui`（`components/Message/`），输入框的 ＋ 面板、上下文用量环、工具行 chip 在 `@tau/shared`（`components/ChatComposer/`），桌面与浏览器扩展共用；桌面 `src/components/ChatUI` 只放依赖桌面能力的部分（带工具确认条的 `ToolCallBlock`、markdown 代码与链接渲染 `useChatMarkdownComponents`），对话页、停靠栏、项目 / PDF / 视频笔记 / 内联 AI 共用；工具 renderer 的唯一契约与登记表经 `@tau/chat-ui/renderers` 消费，不在 shared 或桌面另建类型与注册对象。shared 只保留消息模型、展示归约、输入控件与输入框部件。过程信息（思考、工具调用）一律用 `FoldRow` 折叠行，视觉轻于正文；工具渲染器用 `tool-call-renderers/ui.tsx` 的 ToolCard 等公共件（line-1 内框、不投影、零横线），颜色只走语义类，`isDark` 形参保留但不参与取色；代码高亮用 `tauPrismTheme`（引用 `--tau-*`，随主题切换）。
- 导航：栈 + forward buffer（push 清空 forward）；`Alt+←/→` 后退/前进；`Esc` 只承担浮层退场（PageProvider 的 `useOverlayDismiss` 注册表，LIFO，**优先于编辑上下文**），无浮层时无操作——「Esc=后退」已于 2026-09-20 用户裁决移除（详情页误触即整页回退丢编辑上下文），后退由 Alt+←/→ 与标题栏按钮承担。
- 编辑器源码全屏、行内公式、图片预览与网络地址弹窗经 `@tau/editor/api` 的 `OverlayBackDismiss` 接宿主服务，`DesktopEditorOverlayDismiss` 在当前 PageProvider 上登记 Esc 退场；服务对象稳定，关闭、卸载和 Activity 隐藏注销。媒体根 UI 由扩展 layers 挂载，readOnly 由核心传入，store 按 editor 归属及清理。适配 Layer 不渲染浮层、不新增监听或页面栈；无 Page 上下文不登记，保留关闭按钮与局部焦点链。此接线不代表全部编辑器浮层已迁移，也不取代设计系统控件的焦点链关闭。
- 设置页：壳层浮层与命令面板同族——AppShell 挂载，`fixed inset-0 z-[90]` 铺满窗口（低于命令面板 100，设置页内仍可 Ctrl+K；子页 Dialog/Select 层级更高），自带窗口控制（mac 信号灯在设置侧栏头部、Win/Linux 三键在右栏标题栏区）与拖拽区；打开期间 `useFindOwner` 吞掉 Ctrl/⌘+F（不对被遮住的页面做页内查找）、开闭态在 `app/settingsStore.ts`（features 域互引 store 禁令）、Esc 走注册表、关闭还焦、`Ctrl+,` 全局 toggle；入口 = Sidebar 底部（navigation.ts `opensOverlay` 标记，浮层入口不 push 不显激活态）+ 命令面板 `open-settings` 动作。分区导航/子页映射单源在 `features/settings/sections.tsx`（改这里=改设置导航，勿在容器组件里散写条目）；子页即时保存、无应答区；新增设置子页 = sections.tsx 登记条目 + `sections/` 下建组件（未设计的用 PendingSection 占位）。
- 反馈窗口：独立的单例置顶小窗（路由 `/feedback`，`windows/utility-windows.ts` 的 `showFeedbackWindow`），不是壳层浮层——用户要一边操作主窗口复现问题一边截图。入口 = Sidebar 底部（navigation.ts `opensWindow: "feedback"`，与 `opensOverlay` 同为不 push、无激活态）+ 命令面板 `send-feedback` / `capture-feedback`（后者先截发起窗口）+ 托盘菜单；三者都经 `commands/feedback.ts` 的 `openFeedbackWindow` 并带上当前页面 key。截图走主进程 `webContents.capturePage()`（只截所选 Tau 窗口自身，不需屏幕录制权限），打码/框选在渲染端 OffscreenCanvas 涂进图片后压成 WebP；提交、日志收集与匿名凭证只在主进程 `modules/app-feedback.ts`。`ErrorState` 在 Electron 下于「技术详情」行提供「发送错误报告」（附错误详情、环境与本次运行日志，同一错误重试复用请求 ID），因此三层错误兜底都自带上报入口。协议见 `apps/plugin-portal/docs/协议.md`「桌面端用户反馈（0010）」。
- 反馈模块在 BACKGROUND 初始化完成 IPC 注册后，调用 `prepareFeedbackWindow` 隐藏预热反馈窗口（开发工具关闭），点击入口仅显示和聚焦。关闭请求经 `app-feedback:close-requested` 交给渲染端：未发送内容仍需确认，确认放弃或关闭成功页后清空表单并经 `app-feedback:hide` 隐藏复用、还原标注尺寸；应用退出才销毁，隐藏最后一个可见窗口仍遵循后台保活偏好。首次显示时决定锚点位置，环境信息和日志大小在窗口重新聚焦时刷新；正文计数只保留 Textarea 内置的一处。
- Ctrl/⌘+F 归全局页内查找条 `GlobalFindBar`（document 捕获阶段拦截）；自带查找的页面 / 浮层用 `components/GlobalFindBar/findOwner.ts` 的 `useFindOwner(open, active)` 接管（LIFO，后打开的浮层优先），**不要自己监听 Ctrl/⌘+F**——监听不到。
- 键盘仲裁收口在框架层（PageProvider/Titlebar 的全局监听），业务代码禁止自行监听这些键；两处都已让位编辑上下文（输入框/文本域/contentEditable，`page/dom.ts`）与输入法组合（`e.isComposing`）。
- 栈操作为 action 式 reducer（连续导航由 React 串行归约，不丢更新）；注册表（pageMeta/组件 registry/defineTheme）重复注册策略统一为 dev 覆盖+warn（HMR 兼容）、prod 抛错（真冲突）。
- 后退/前进按钮：**禁用而非隐藏**（面包屑旁，Titlebar）。
- 侧栏：拖宽（130–340，持久化，窄态长标签 truncate 省略）+ 折叠（58px 图标列；折叠按钮同位镜像反转 `»↔«`；双击拖宽条也可折叠）；**拖宽条跨阈值切换展开/收起**（业界通行语义：收起态拉宽 ≥130 即展开且宽度即时跟随鼠标、展开态拖窄 ≤110 即收起，20px 迟滞防边界抖动；收起态未过阈值的拖拽不落宽度，保留展开记忆宽；拖拽中经 `resizing` prop 关宽度过渡、pointer capture 保证拖出窗口不丢事件，见 `AppShell.tsx` 的 SidebarResizer）；**导航组头可点击折叠收纳**（chevron 旋转 + grid-rows 过渡 + 折叠处显条目数，`shellStore.navSectionCollapsed` 持久化，方案来源 mockups/sidebar-responsive 方案二；图标列态无组头不受影响）；导航列表滚动带**边缘渐隐**（`base.css` 的 `.edge-fade-scroll` 通用类 + `useEdgeFade` hook；home-scroll 的 mask 协议已抽通用）；**壳层根允许按视口收缩**，横向溢出由主区 `overflow-x-hidden` 截断；窗口的最小尺寸由主进程按缩放比例维护，渲染层不要再用固定 `min-width` 撑宽页面。Mac 自绘信号灯在侧栏头部（`isMac` 条件渲染，`WindowControls.tsx` 的 `MacTrafficLights`——原生信号灯已被主进程移出屏幕，自绘可点击、命令走 IPC；**全屏下隐藏**，状态经 `app/useFullScreen`（`platform.window.onFullScreenChange`）订阅）；Windows/Linux 三键 `isWinOrLinux` 条件渲染。
- 拖拽区（`app-region-drag`，Titlebar/侧栏头部）内的一切可交互元素必须加 `app-region-no-drag`——Electron 会吞掉 drag 区的鼠标事件（侧栏折叠按钮曾因此点击失效）；页面级加载态统一用 `ui/primitives/Loading`（Spinner 可单独行内用）。
- 保活：`<Activity>`（React 有效版本为 19.2.0，由 pnpm-workspace.yaml overrides 统一；使用 Activity，无降级路径），LRU 上限 12；激活页包装为 `flow-root h-full`（非激活 `display:none`）：h-full 打通视图根高度链，flow-root 建立 BFC 兜住视图根外边距——视图根写 `mt-*` 不会折叠出包装、撑出壳层 main 的滚动条（`page/__tests__/pageHostLayout.test.tsx` 守护）。视图根外距仍首选 `h-full` + padding，避免 margin + `calc` 手算高度；
- 图标：**lucide-react**（线性，stroke 1.75，`navigation.ts` 直接引用 LucideIcon 组件）；多色图标用 **react-icons**（桌面已有依赖）；
- 侧栏条目以 app/navigation.ts 为准（21 个主导航条目及设置入口）；页面迁移已完成，订阅入口已退役。
- tsc 全绿。挂载：主窗口 `/` 默认重定向 `/shell`（旧主界面已退役，根路径重定向仍待收尾）。

### 共享元素形变

- 默认页面切换即时、无转场；只有「同一个对象在新旧两处都出现」时才做形变（`page/morph.ts`，原生 View Transitions API，不用 React `<ViewTransition>`）。
- 元素用 `data-morph-key="<对象 key>"` 声明自己代表谁（卡片是 `features/cards/morph.ts` 的 `cardMorphKey`）。运行时只在转场时给一对元素临时挂名（`page-morph`），不要自己写 `view-transition-name`；样式在 `app/base.css`，与对话页 ⇄ 停靠栏的 `assist-chat` 共用一组规则。
- 业务发起的变化（打开浮层、push 新页）调 `morph({ from, update, to })`：`from` 是旧画面的元素，`update` 里同步改状态 / 导航（运行时 flushSync），`to` 返回新画面的元素，未就绪返回 null，最多等 400ms。找元素用 `queryActivePageMorph(key)`（当前激活页内）或 `queryMorphElement(scope, key)`。源元素缺失、目标超时或不在视口时自动退化（直接切换 / 源元素淡出），调用侧不用判断。
- **转场里不能等慢资源**：更新回调期间画面冻结，`to` 等待的应是「数据已在缓存、一两次提交内就能渲染」的目标。正文会话这类慢资源要先用只读渲染占位（ContentEditor 的 `fallback`），必要时悬停预取数据；不要让目标等到编辑器初始化才出现，否则点击会卡顿，超时还会退化成淡出。
- 后退 / 前进由 PageProvider 统一处理：当前页和保活中的目标页都有同 key 元素才形变，业务不要为此监听后退键。新页（未挂载）的 push 只能由业务发起。
- 新画面截图是实时的：转场期间目标页的任何重排都会被播出来。保活页恢复显示时 Activity 会重跑全部 effect（含 layout effect），「某值变化时做 X」的 effect 必须比对上次的值，不能把重跑当成变化（滚动归零用 `hooks/useScrollTopOnChange`）。
- 转场期间根元素带 `data-morph`，更新回调执行时 rAF 不触发。靠 rAF 或 CSS 过渡播入场的浮层必须用 `[[data-morph]_&]` 变体直接渲染终态，否则会被截成透明或半途态（Dialog、AssistDock 已接）。
- 只有一个旧状态时用 `startPageTransition(update)`（不配对，如 `app/assistMorph.ts` 的静态命名）；嵌套在另一次转场的 update 里发起的转场直接执行，不会互相打断。
- 形式：`page-morph` 是放大缩小（新旧截图按容器宽度等比缩放、顶边对齐，超出的高度裁掉；不用 cover，宽高比悬殊时会剧烈缩放滑动。380ms，旧图 180ms 先淡出）；`assist-chat` 是容器裁切、内容不缩放。新场景按语义选用，不要再造第三套。
- 已接入：卡片墙条目卡 / 置顶横卡 / 列表行 ⇄ 预览弹窗（`CardPreviewDialog` 的 `ref` 指向卡体，`data-state="open"` 即就绪）⇄ 详情页的纸；卡面「进入详情」直接由卡形变到纸；详情页后退缩回原卡。表格视图不形变。卡面悬停经 `actions.onPrefetch` 预取单卡全文；弹窗与详情页的正文在会话就绪前由 `CardContentPreview blocks={Infinity}` 只读占位。文章：网格卡 / 列表行 ⇄ 详情页的纸（`features/articles/morph.ts`），纸面在文章读到后声明 key，正文会话就绪前由 `ArticleBodyFallback` 只读渲染开头 24 块。

### Button 使用边界

- 变体六档是一个动作的全部音量：primary（accent 实心，**每屏至多一枚**，层级是评审纪律不进 API）/ secondary（surface 亮底 + 描边，取消与表单的默认档，即原 ConfirmDialog 应答区皮）/ soft（accent-soft 平底，工具栏次级强调）/ ghost（无底 hover 淡墨，与 IconButton 同反馈语言）/ danger（确认位实心红）/ danger-soft（列表与工具栏位）；danger 两档对齐 ConfirmDialog 的危险分级。
- `loading` 是内建语义：aria-busy + Spinner + `loadingText` 文案切换 + 一并 disabled（原生属性封锁指针与 Tab 队列）；Spinner 替换左位图标，不与 `icon` 同时显示；调用方不再手动拼 Spinner（ConfirmDialog 已迁移）。
- 图标仅左位 16px（`icon={Plus}`，lucide stroke 1.75）；icon-only 一律 IconButton，Button 不设该档；`block` 满宽给空态 CTA；type 默认 "button"，form 提交位显式传 submit。
- antd 迁移映射：type=primary → variant="primary"；type=default → "secondary"；type=text → "ghost"；danger 布尔 → "danger"/"danger-soft"（按确认位/列表位分档）；type=link 是文字链语义，不建变体。

### Menu / ContextMenu 使用边界

- 项目文档详情采用外层滚动结构：标题、时间与正文一起滚动；右侧目录初始与标题顶部齐平，`sticky top-5` 与外层 `pt-5` 同为 20px，滚动即保持吸附位置。滚动容器包住正文和目录，滚动条位于目录右侧、距内容区右缘 16px，并接 `useEdgeFade`。编辑区保留 `@container/editor` 宽度查询，目录通过 `ResizeObserver` 读取正文滚动容器的 `clientHeight`，高度上限为该值减 40px（上下各留 20px），不启用会影响宿主尺寸计算的双轴 size containment，超长目录经 `overflow-y-auto` 独立滚动并接 `useEdgeFade`，`overscroll-y-contain` 避免触边后带动正文。文章与项目共用 `src/components/ContentOutline/`（标题提取、实时编辑器锚点解析、点击定位与滚动高亮；条目单行省略，仅截断时悬停出全文 Tooltip）；项目内容区不足 960px 时隐藏目录；正文没有标题条目时不渲染目录容器，也不保留目录列，正文按 720px 最大宽度单栏居中。旧 EditorOutline / Outline 的最后消费者已迁移并删除；网页项目条目也使用 ContentOutline。Markdown 文件窗口（/markdown-window）同样复用该组件：大纲贴正文右缘常驻（sheet 实测内宽 ≥ 版心 800/1040 + 240 才切三列 grid，正文列让位，大纲列至少 208px），不够宽时降级为标题栏 ListTree 按钮 + Popover（240px）；大纲超高时独立滚动（上限 = 正文滚动容器高 − 40px，ResizeObserver 实测，`overscroll-y-contain` 触边不带动正文，接 `useEdgeFade`）；左栏只留文件树，「文件/大纲」页签已移除，侧栏经 ResizeHandle 拖宽 200–400（默认 264），大纲开合与宽度持久化在 markdownWindowPrefs。字数在文档标题下的信息行展示，随正文滚动；协作与沉浸入口仍由左侧文档更多菜单承载。

- Menu 触发器优先使用原生 `button type="button"`，保证键盘可达及菜单关闭后的焦点归还。
- Menu、子菜单与 ContextMenu 默认按内容自适应宽度，最小宽度为 160px；上限为 320px 且不超过视口减去两侧各 8px，长标签省略。需要固定宽度时通过浮层 `className`（如 `w-[280px]`）覆盖。
- 菜单外壳承载圆角、边框和四周 6px 留白，内部列表独立滚动并保留右内边距 6px，使滚动条与左侧高亮区域、右侧边框内缘各隔 6px，避免贴边与侵入上下圆角；默认整体高度上限 300px，`className` 可覆盖；`fit` 让主层与各级子层上限放到视口高度（画布右键菜单用）。样板间「长菜单与滚动留白」覆盖主菜单、子菜单与右键菜单。
- Menu 使用复合组件声明命令、开关、单选组和子菜单；命令项关闭整树，checkbox/radio 保持打开。`Menu.Submenu disabled` 禁止鼠标与键盘展开，已展开的头项再次点击收起并还焦父层。
- `Menu.className` 与 `ContextMenu.className` 都控制浮层；ContextMenu 的内容区采用 `display:contents` 包裹，宽度等布局类应放在 children 的真实元素上。
- `useMenuTree` 统一整树关闭、外点判定与跨实例互斥。Esc/左方向键按层收起；任意层 Tab/Shift+Tab 关闭整树，还焦触发位置后由浏览器继续移动焦点。子层键盘事件不会重复驱动父层。
- type-ahead 读取声明树中直接可见的文本，不解析自定义组件的渲染结果；需要按文本导航时应直接传文本标签。

### Dialog / ConfirmDialog 使用边界

- Dialog 是模态决策容器（三段固定：标题/徽标 + 正文 + 影响行/应答区），footer 按钮序列由调用方提供（主按钮恒在最右）；ConfirmDialog 是确认语义预设——`danger`（焦点落取消）与 `typeToConfirm`（输入解锁，只给真·不可逆）两档内建。家族分工：Menu 不做确认，确认归 ConfirmDialog、撤销归 Toast。
- 关闭矩阵：`dismissible`（默认，×/Esc/遮罩可关）/ `critical`（无 ×、遮罩与 Esc 抖动拒绝）/ `locked`（异步 loading 封锁一切）。Esc 仅 open 态在卡片 DOM 消费（焦点链 LIFO，不进浮层注册表——同 Select/Menu 口径，ui 不反向依赖 page/）；打开即 Tab 圈闭、关闭归还触发元素焦点。
- Dialog 内通过公共 `PortalScope` 提供局部浮层挂载点，位于当前遮罩内部、正文滚动区外；Select/Menu/字段编辑器等继承该挂载点，避免被遮罩盖住或被正文裁切，业务无需自行提高 z-index。
- 初始焦点落卡片内 `data-autofocus` 元素（无则卡片自身）——表单放首输入框，danger 放取消按钮；ConfirmDialog 自动标记。Enter 默认应答只在 ConfirmDialog 内建（焦点在按钮上走原生）。
- `onAfterClose` 在退场完成、子树卸载后触发；需要清空内容或草稿时使用此回调，关闭请求只改变 open。退场期间重新打开会取消本轮关闭回调。
- 宿主页面被 Activity 保活停驻时（「关弹窗 + push」同批提交，或弹窗开着直接侧栏导航）：退场 effect 停驻、卸载定时器被清，而 portal 挂在页面外不随 `display:none` 隐藏。Dialog 内建渲染期短路兜底——动画类由 `open && contentReady && shown` 派生，`!visible` 时遮罩 `opacity-0 + pointer-events-none`，冻结残骸不可见不可点；页面重新激活后 effect 补跑完成卸载与 `onAfterClose`。新写浮层组件若也用 effect 管退场，须遵守同一口径（回归测试见 `Dialog.test.tsx`「Activity 保活停驻」用例）。
- `contentReady={false}` 可提前隐藏挂载异步内容，期间不接管焦点、不锁滚动、不可交互；内容就绪后设为 true，再显示完整弹窗。加载失败也必须放行展示错误，避免一直隐藏。
- 卡体带 `data-state="open|closed"`（open = `open && contentReady`），供共享元素形变判断就绪；`ref` 指向卡体。根上 `data-morph` 期间开合一步到位、不播过渡。
- 尺寸档 `sm 380 / md 440（默认）/ lg 560` 只改宽度；`width` 像素数覆盖档位（预设不是牢笼）。长内容正文区独立滚动（上限 78vh）+ `edge-fade-scroll` + `useEdgeFade`（壳层同款边缘渐隐）。遮罩 `bg-overlay + backdrop-blur-[4px]`，容器 z-[340]。
- 头部信息一处一责：标题讲动作、`context` 徽标记对象（surface 亮底 + 描边 口径）、正文讲事实、`impact` 念后果、按钮文案不带数量；阻断通知纯文字头部（无 icon）。
- `header` 插槽整体替换内建标题行与 ×：只给自带导航头的工作台型弹窗（如数据库行详情的「视图 › 行标题 · N / M · 上下条 · 更多 · 关闭」），关闭入口由 header 自己提供，`title` 转为 `aria-label`；焦点圈闭、Esc、PortalScope、退场动画照旧由 Dialog 负责，不要为换头部另写模态壳。
- 无 footer / impact 时，正文滚动区底部保留 16px 外间距，避开容器圆角；配合 6px 内边距维持内容原有的 22px 底部留白。

### Popover 使用边界

- Popover 是锚定式可交互内容浮层（非模态 方案 B 形制）：无标题栏内容卡，`Popover.Header`（头行随需，icon + 标题 + ghost ×，挂 aria-labelledby）/ `Popover.Body`（独立滚动上限 60vh + edge fade）/ `Popover.Footer`（应答区随需，按钮右对齐）复合声明，trigger 克隆注入（协议同 Tooltip/Menu：必须透传 props 与 ref）。
- 触发只有 click toggle（内建，不设 trigger props）：hover 说明归 Tooltip、右键归 ContextMenu——antd 存量 `trigger="hover"` 迁 Tooltip，placement 12 向同名直映。
- 关闭矩阵：点外 / Esc / × / Tab 移出皆可关；Esc 与 Tab 还焦触发器；非模态不圈闭焦点。Esc 仅 open 态消费（焦点链 LIFO，同 Select/Menu/Dialog 口径）。初始焦点落 `data-autofocus`（无则卡片自身）。
- 定位走 anchoredPosition 引擎全 placement 12 向（首个全表消费者）+ flip/shift，gap 8、宽随内容（180–340，`className` 覆盖）；浮层内开的 Menu/Select/二级 Popover 经 useLayerDismiss 嵌套链共存（点子层不误伤父层、Esc 逐层退场），开新顶层浮层自动收旧的。
- 浮层公共底盘：`useAnchoredPosition`（定位生命周期）、`FloatingArrow`（菱形箭头，宿主标 `group/float` + `data-side`）、`mergeRefs`（触发器克隆的 ref 合并）、`useLayerDismiss`（外点/嵌套/互斥——MenuSurface 走 registerDismissLayer 直登）。

### Tooltip 使用边界

- 侧栏收起为图标列时，导航条目（含底部入口）与展开按钮使用 `placement="right"` 的 Tooltip；展开态通过 `disabled` 暂停。收起态移除原生 `title` 避免双重提示，按钮保留 `aria-label`；提示通过 Portal 展示，不受列表滚动裁切与边缘渐隐影响。
- 条件暂停提示（如标题未截断或正在编辑）使用 `disabled`，不要在 `open={false}` 与不传 `open` 之间切换。禁用会隐藏提示、取消显示延迟并清空内部打开状态；重新启用后由新的悬停或聚焦触发。
- `disabled` 优先于受控 `open`，不修改调用方的状态、不触发 `onOpenChange`，也不禁用子元素本身；受控模式重新启用后仍按调用方的 `open` 显示。

### 演示模式

- 入口组件 `src/components/PresentationMode`（文章 / 卡片 / 项目共用，白板有自己的演示模式），接口 `{ content: Descendant[]; onExit }`：调用方只管开关，不传任何排版参数。需在 PageProvider 内渲染（Esc 走 `useOverlayDismiss`）。
- 进入即窗口全屏（退出还原）；放大靠舞台整体缩放：`frame.ts` 的 `fitStage` 给出逻辑尺寸（宽 1000 固定、高随窗口比例）与缩放比，舞台里按编辑器常规字号排版、正文列 768 居中，外层 `transform: scale` 铺满窗口。**编辑器块的样式单位（px / em / rem）与演示无关**，不要为了演示改块的写法，也不要在演示容器上改字号。
- 分节（`sections.ts`）：分割线优先；否则按出现两次以上的最高级标题断；都没有则整篇一节。一节放不进画框时由 `cameraPlan.ts` 生成镜头计划（居中 / 缩小到 ≥80% / 按块边界逐屏推进）。两者都是纯函数并配有单测，调规则改这里，不要在渲染层打补丁。
- 画框自测块高（`ReactEditor.toDOMNode` 取顶层块 + ResizeObserver 跟踪异步撑高）；放映与全览共用 `SlideFrame`（传入放映舞台的逻辑尺寸，缩略图比例与放映一致），缩略图只是 `scale` 更小，不要另写一套缩略渲染。
- 深浅色（`D`）只作用于演示层：根节点写 `data-theme` / `data-mode`，内容包 `EditorThemeOverride`；不要改全局偏好或 `<html>`。HUD 显隐由鼠标位置驱动（底部 140px 带内显示），不要改回「静止即隐藏」。
- 键盘：推进键在 window 捕获阶段接管并阻止冒泡；Esc 不在组件内监听（注册表逐层退场：帮助 → 全览 → 退出）；修饰键组合、编辑上下文、输入法组合放行。新增快捷键加在 `handleKey` 一处，并同步 `HelpPanel`。
- 与沉浸写作共用的舞台件：`hooks/useFullScreenWhileMounted`（挂载即全屏、卸载还原到进入前状态）、`components/Stage` 的 `StageHud` / `StageHudButton` / `StageHudDivider`（底部胶囊控制条）与 `useStageTheme`（局部深浅色的根节点属性 + scope 类）。新的全屏舞台类浮层直接复用，不要再复制一份。

### 沉浸写作

- 入口组件 `src/components/ImmersiveEditorMode`（文章 / 卡片 / 项目文档共用），接口 `{ contentId, initValue, initialSelection?, extensions?, onChange, onInit?, onExit({ selection }) }`；调用方在退出后 remount 正文并用回传选区恢复光标。字数与「本次 +N」由组件从自身编辑器内容实时计算，调用方不传。
- 放大 = 版心整列 CSS `zoom`（`layout.ts` 的 `fitZoom` 按屏宽自适应，控制条 ±10% 微调）；**不用 transform**：可编辑场景要真实布局，光标命中、滚动高度、Portal 浮层（按 getBoundingClientRect 定位）才无需换算。同样不改字号、不对块的样式单位做假设。编辑器 DOM 内自行 `position: fixed` 且按视口坐标写 left/top 的元素，必须按 `currentCSSZoom` 反除（文件落点指示线、协作光标层 `editor-collab/cursorOverlay.ts` 已处理），新写此类元素走 Portal 或照此处理。
- 光标跟随（`useCaretFollow` + 纯函数 `caretScrollDelta`）：打字机模式光标行钉在视口 45%，关闭时只在越出 20%–75% 舒适带时跟随；只响应键盘引起的光标移动，鼠标点击 / 滚轮回看不拉回。上下留白放在 zoom 之外（45vh / 55vh），首末行也能到视线位。
- 段落聚焦 = 编辑器通用能力 `<Editor focusMode>`（`packages/editor/src/components/FocusPath`），沉浸层只传开关并在容器上设 `--ed-focus-dim`（打字机开 0.26、只开聚焦 0.42）。规则只看文档结构：纯函数 `focusPathOf` / `focusRoleOf` 从选区求光标的元素祖先链；标记是**渲染输出**——`renderElement` 最外层的 `FocusAttributes` 让每个元素订阅自己的角色（`useSlateSelector`，角色变了才重渲染；**按节点对象身份判断，不用 `findPath`**——协作同步会整体替换节点对象，渲染期维护的节点索引在重渲染前是过期的，按路径判断会卡住旧标记，由 editor-collab 的 `focus-mode.test.tsx` 守护），把 `data-focus-path`（聚焦单元另加 `data-focus-unit`）并进 Slate 的 `attributes`，与 `data-slate-node` 落在同一 DOM 上，不在 effect 里命令式改 DOM（会被重挂载 / 重渲染冲掉）；样式让「不在链上、且不在另一个已退后元素或聚焦单元之内」的元素退后——链外即同级兄弟，顶层块、列表项、表格单元格、引用里的段落一视同仁。**不要在宿主层按元素类型或渲染 DOM（拖拽容器、chunk 容器、ul/li）写聚焦规则**：新元素类型无需任何接线。
- 控制条显隐位置驱动（底部 140px 带 / 悬停 / 进场 3.2s），一输入即收起并隐藏指针；点控制条 `preventDefault` 不抢编辑器焦点。Esc 经 `useOverlayDismiss`（编辑器斜杠菜单等在 document 捕获阶段先消费 Esc）；编辑器内的 Esc 热键只在真有事可做时消费（如 `tau.edit.clear-marks` 仅在光标处有标记时拦截），否则必须放行，不然宿主的退场仲裁收不到；`useFindOwner` 吞掉 Ctrl/⌘+F。缩放不占键盘：`Ctrl+=` / `Ctrl+-` 已由主进程注册为整窗缩放全局快捷键。

### 滚动区标准接法（手写三件套）

- 设置页右栏：标题栏高度的拖拽区下方是整列滚动视口（`FadeScroll`：内缩细滚动条、轨道上下各留 10px，外加 `mr-1.5` 不贴窗口右缘），内容列 `max-w-[880px]` 居中，页头（分区 label + description）随正文一起滚动；切换分区时回顶。关态只做 `opacity-0 + pointer-events-none` 时**必须同时撤掉 `app-region-drag`**——Electron 的拖拽区不理会 pointer-events 与透明度，隐藏的拖拽区会盖住底下侧栏头部 / 标题栏的按钮（常驻挂载的全窗口浮层同此）。
- 滚动区 = `edge-fade-scroll` 类 + `useEdgeFade(el)` + callback ref（el 经 state 触发挂载后接线），`overflow-y-auto` 自带写；滚动条样式走全局规则（4px 细墨条，hover/滚动中显形——scrollbarAutoHide 的 document 级委托），挂上类即生效，无组件侧接线（不要重建 Scroller 组件收口，曾引入后被裁决删除）。
- 两类规则已全局化（原 .app 前缀盖不到 body 级 Portal，曾受旧全局滚动条规则影响）：`::-webkit-scrollbar` 系列与 `.edge-fade-scroll`；Home 的 home-scroll 是带自定义 padding 协议的历史变体。

## 6. 新增页面与清理存量组件

1. 在 `features/<域>/pages/<key>.page.tsx` 声明 Page；侧栏入口改 navigation.ts，页面文件自动注册。
2. 视图按 §4/§5 编写，数据接 queries.ts；没有数据源时返回 null 与空态，不造示例数据。
3. 复用已有业务组件时就地改造；纯视觉模式使用公共 UI 原语，不复制旧实现。
4. 改造前在 04 清单登记实际消费者和删除条件；消费者清零再删代码、测试、样式、导出和依赖。
5. 改框架、壳层、主题或数据协议时同步本指南；推翻既有约束先在 /docs/decisions.md 记录。

### 6.1 组件归属

- 单域业务件归 `features/<域>/components`；跨域业务件留 `src/components`；纯视觉件归 `packages/ui/primitives`。
- features 可引用应用共享 components、hooks、utils，禁止新增 `@/pages` 依赖；共享 components 不反向 import features。
- 纯搬家与行为修改分开；修改 props 时检查现有宿主和独立窗口，不能以旧页面退役为由破坏仍活跃的消费者。
- 数据来自服务器时用 react-query；输入、筛选、作答会话和计时运行镜像保留各自合适的状态协议，不把所有 zustand 状态当作旧缓存删除。

## 7. 今日页数据（已全部接线，features/home/queries.ts）

### 学习测验的数据与作答会话

- `features/vibe-learning/quizQueries.ts` 查询测验集、题目、历史和最高分；键包含数据库及项目/测验身份，命令绑定原库。最高分走主进程 `vl-quiz:best-scores` 聚合，完整历史仅在记录浮层打开时读取，不再逐测验预取全部记录。
- `quizSession.ts` 的控制器由每个 QuizTestModal 的 `useQuizSession` 独立创建；持有开始时的项目、测验及题目快照，答案和游标不持久化。重复完成复用同一在途请求，提交期间冻结作答/导航，失败保留答案可重试；取消、重开及切库后的旧结果不能完成新会话。Activity 停驻不清空当前作答。
- 题目/名称编辑与删除成功才更新/失效原库缓存，null/false 结果视为失败；错误表单和确认框留在原地。成绩提交由主进程校验测验仍存在且归属项目一致，已删除测验不能继续写入生成题目或成绩。
- 数据库 IPC 提交后以 `vl-quiz:changed` 携带库名通知全部窗口；与日程复用 `database-notifications.ts` 底盘。后台 runner 保持离页生成与原库写入，只失效原库查询，不再拉取全局测验列表或设置选中测验。笔记等其他任务的状态协议保留。
- `useVLQuizStore`、未接线的全局 QuizTestSession/QuizTestStatus 类型已删除；`vl-quiz-store` 的项目/测验 ID 没有数据库身份，设置初始化直接清除，不迁移到新会话。测验业务表、成绩记录、生成执行器和题面组件保留。

### 日程数据、偏好与变更通知

- `features/schedule/queries.ts` 承载日历/分组目录、日期窗口事件、单条定位、备注和待办来源状态；查询键包含数据库名，事件键另含完整月网格/周/日范围及排序后的可见日历 ID。全部隐藏时不发送空筛选查询。SearchPalette 复用目录及创建 mutation，不依赖日程 store。
- 命令通过 `bindDatabaseCommands` 绑定原库；切库后的旧闭包拒绝新写入，在途响应只回写和失效原库。日历显隐只有数据库 visible 字段一个事实源；写入失败不更新缓存、不关闭表单。备注加载失败禁止保存并允许重试，迟到备注不覆盖已输入的标题。
- 数据库 IPC 事务提交后以 `schedule:changed` 携带库名通知全部窗口，覆盖日历直接写入、待办同步及番茄历史修改；番茄结束直接写表时补同一通知。只失效对应库的目录、事件与来源查询，编辑中的备注快照不随通知重载；聚焦和 Activity 恢复仍刷新查询。合并数量通过主进程 COUNT 聚合，不拉取全部日程。
- `uiStore.ts` 只管理日期、视图、分区展开、当日面板、草稿和合并会话。偏好存入 tau-schedule-preferences，旧 calendar-store 的合法偏好先迁移再删除；不迁移数据库 ID 或记录。切库清除草稿、速览和合并选择，保活切页保留会话。useCalendarStore 与旧 useCalendarEvents 包装已删除；历史表升级和当前日历命令保留。
- 域外取日程：`useCalendarEvents` 依赖日程页 uiStore，域外不得使用；取某天日程用 `useEventsOfDay(day)`，日历角色用 `useCalendarRoles`（都不碰 uiStore，随 `schedule:changed` 失效）。

### 番茄绑定与跨域启动

- 会话可选绑定一条日历事件或一条待办：`pomodoro_sessions.bound_event_id / bound_todo_id / bound_title`。主进程 `PomodoroSessionTable.resolveBinding` 解析（待办来源事件反查待办），结束时 `refreshBinding` 取最新标题，对象已删则用快照。番茄写日历的标题只经 `pomodoroEventTitle`（结束写入与改时长重建同一规则）。
- 读取绑定须容忍悬空 id：移动端编辑待办会删除重建其日历事件。按待办聚合用 `bound_todo_id`（`pomodoro:summary-by-todo`）。
- 跨域启动（日程事件抽屉、待办抽屉）用 `features/pomodoro/components/FocusStartButton`：只经命令层 `startPomodoroSession({ presetId, target })` / `updatePomodoroBinding` 与共享 hook `useActivePomodoro`，不 import 番茄 timerStore；每次须选预设，主进程不自动挑。番茄页「专注于…」的选择是页面会话态，任何开始入口都带上。
- 日程渲染：`ledger.ts` 的 `absorbFocus` 把专注完整落在绑定事件内的番茄收进该事件画专注条（不设容差，超出即独立成块），绑定由 `usePomodoroBindings` 经 `pomodoro_calendar_mapping` 查得。

### 待办安排与日程编辑

- 任务型日程 = 用户日历里 `calendar_event.todo_item_id` 非空的事件，只经 `calendar-event:create-for-todo`（拖入）或 `todo:create-with-schedule`（快速添加写了时段）产生；`calendar-event:update` 整行更新**不改**该列。识别一律看 `todoItemId`，不按日历名；系统待办日历只剩截止 / 周期（标记）。
- 安排概况用 `useTodoSchedules(ids)`（schedule 域查询，随 `schedule:changed` 失效；待安排面板与待办详情共用），不要为此全量拉事件。
- 可编辑判定统一 `eventTone.ts` 的 `isEditableEvent`（非系统分组日历），表单与周视图拖动共用。拖动手势 `hooks/useEventDrag`：pointer + 指针捕获，阈值内仍是点击（`consumeClick` 判别）；进行中按 Esc 在 capture 阶段取消并消费，属于手势局部消费，不进 `useOverlayDismiss`。
- 待办拖入用 HTML5 DnD，类型常量 `TODO_DRAG_TYPE`（`features/todos/model.ts`），落点与回执集中在 `features/schedule/todoDrop.ts`。
- 月视图在网格容器接收待办拖入，按指针坐标确定日期（含邻月及日程覆盖层），松手即建当天全天安排，不改变当前日期或月份；悬停高亮在离开、落下及 dragend 时清除。`useScheduleTodo` 开始时间为 null 时创建全天安排，数字仍创建定时安排；`CreateTodoSchedule` 由命令封装、查询 mutation 与主进程共用，全天落库的起止时间为 null。成功回执包含「全天」及撤销，默认用户日历与跨库写入保护沿用现有协议。
- 删除日程走 `pendingDeleteStore`：隐藏 + Toast 撤销，到时或 ScheduleView 卸载才落库；过滤在 `useCalendarEvents` 里统一做。不得改回「先删再重建」（删除会连带备注 content）。
- 日程侧勾选完成待办后必须 `emitTodoMutation`，否则待办快照（待办页、待安排面板）不刷新。

### 文档待办

个人助理任务工具在 `task-assistant` 主进程模块与同名 provider 中承载。写入按项校验、事务提交和幂等回执；正文路径使用内容层节点补丁与同步会话落盘，跨正文/主库失败返回 pending 并恢复。工具与卡片操作支持 30 天持久化撤销，检查后续修改和原位置，不回写整篇旧快照。数据库、日程、正文编号经持久化高水位分配，不复用被删除对象的编号。批量为逐项成功，不承诺全局回滚。工具风险沿用既有权限模式。

正文勾选项可携带 `taskReminder`、`taskRecurrence`、`taskOccurrenceState`、归档与完成时间；它们随正文保存，索引的 `doc_task_attributes` 仅为可重建投影。文档待办关联安排走 `doc_task_calendar_link`，不创建隐藏的 todo_item。工具可按 taskId 增删改和移动同正文子项；正文自身编辑仍是主路径。周期单次身份固定原始日期，改期只改变安排日期；勾选周期正文任务只完成当天实例。副本分配新 taskId 并清除原实例历史。

- 正文里的勾选项（`check-list-item`）是唯一真相源，待办页读索引库镜像 `doc_tasks`：后台模块 `src-electron/main/modules/doc-tasks/`（BACKGROUND）订阅正文写入总线增量重算、连库对账，项目增删改名后只按已存原文重算归属；变化广播 `doc-tasks:changed`，渲染端 `src/hooks/useDocTasks.ts` 按库失效。抽取是纯函数 `src/entity/doc-tasks.ts`（`#项目名` 按完整标题、长者优先；日期正文写带年份的绝对日期，相对词以首次收集时刻为锚不漂移）。
- 勾选项身份是 `taskId`，归 `@tau/editor/extensions/list`：规范化补齐、重复时文档序靠后者换新；不经编辑器写入的正文由索引静默补 id。**不得用协作层 collabId 作身份，doc-tasks 模块不 import 协作代码。**
- 写回正文只经内容层 `ContentTable.patchNodes(db, contentId, patcher, { silent? })`：有编辑会话时 `patchSessionNodes` 在 Y.Doc 上就地 `setAttribute`（元素原位、与并发输入合并、不打断光标与撤销），否则改 JSON 落库并广播；共享内容拒绝写入。需要「按节点改属性」的新入口复用它，不要整篇 `updateContent`。
- 待办页：侧栏子项「文档中」= 页面参数 `id="docs"`（`DOC_TASKS_NAV_ID`），按文档分组；按日期 / 按项目议程把未完成文档条目并入对应段（行尾显示来源）。文档条目在待办页保留勾选、打开原文、转为独立待办、本文不收集入口；标题、日期、项目、删除可在原文或助理工具中修改，两者均回写正文。
- 打开定位 `EntityLocation` 增加 `{ taskId }`：`resolveLocationNode` 在任意嵌套层找到该勾选项，找不到退到首块；`useContentLocation` 与日记 `MomentItem` 共用。
- 数据层在 `src/hooks/useDocTasks.ts`（待办页与正文底部状态条共用，不放 features/todos）。用户选择（本文不收集 / 已转为独立待办）存主库 `doc_task_settings`，不进可重建的索引库；快照与状态条按它过滤。
- `patchNodes` 的 `text` 保留叶子补丁，`paragraph` 在完整段落计算最小编辑再映射到叶子与行内元素（保留格式及并发输入）。项目改名使用主库曾用名与正文归属提示，把 `#旧名` 改成 `#新名`；镜像只负责启动升级时补充此前记录，不再是改名依据的唯一来源。
- 编辑器扩展 `src/editor-extensions/doc-tasks/` 只装在 content kit：勾选项首段的 `#项目` / 日期经扩展装饰（`@tau/editor/api` 的 `DecorationSpec`，ER-055）渲染为胶囊；`#` 候选、相对日期按空格绝对化、胶囊菜单都是改原文文字。项目能力由宿主服务 `IDocTaskGroups`（`src/services/docTaskGroups.ts`）注入，扩展不依赖待办域。日期文案归 `src/utils/dayWords.ts`。
- 正文底部状态条 `ContentEditor/DocTasksStatusBar`：只对声明了编辑身份且可解析为卡片／文章／项目文档／日记来源的正文出现，白板文本和 Notebook 等孤立正文不宣称已收集。

审查修复后的约束（DT-011）：

- 连接正文的 Kit 经列表包 `ITaskIdSource` 让内容来源接管身份，预览不补 id；内容层补齐已有会话时使用稳定初始化键，定位和写回仍只认正文 `taskId`，禁止使用 `collabId`。冻结时暂缓。
- 项目旧名存主库 `doc_task_group_names`，按项目创建时间隔离 id 重用；正文 `taskGroup` 在词仍匹配时保护旧名复用，改词重新解析。连库与增量先恢复正文改名，再抽取归属，失败保留重试。
- 相对日期首次解析以正文 `taskDateAnchor` 固定锚点及带年份日期，安全时写回绝对日期。视图正在编辑时不自动改文字；镜像和胶囊消费同一正文语义，索引重建不能改变日期。元信息补齐不计用户操作，文字变化重算字数并走写入总线。
- `patchNodes` 的 `paragraph` 补丁在完整段落上计算最小编辑，映射到格式叶子和行内元素；不得整篇替换。身份静默补齐也通知视图刷新缓存，避免只读定位使用旧值。
- 调度按库隔离、合并有上限的一秒窗口，初始化补对账已有连接；失败或未补齐的正文不登记完成时间并重试。索引版本 2 首次强制对账。
- 所有 doc-tasks 命令固定发起库，IPC 等待前后校验窗口及连接对象；旧回调不能跨库。项目缓存按库和请求修订管理，切库／只读／停驻后的异步编辑不复活。
- 来源用批量轻表查询，日记带片段 id；已完成条目可打开，已转出项统一隐藏。转出读取当前正文并在事务内幂等登记，复用已转出子项，提交后通知原库日程刷新。
- 扩展装饰可声明 `subscribe(editor, invalidate)`，生命周期由核心清理；正文待办按段落计算完整 Range，胶囊校验 taskId 与原词，项目补全固定原输入范围并用提交守卫。

### 闪卡数据与制卡

闪卡的查询和写入统一在 `features/flashcards/queries.ts`：查询键按数据库分区，命令经 `bindDatabaseCommands` 绑定原库；卡组选择只读轻表；在途写入只回写原库缓存，切库后旧回调拒绝再写，跨窗口通知失效对应库。快照加载失败记录所属数据库与原始异常（不记卡片正文）后抛给 react-query 管理重试；首屏失败展示具体原因与重试入口（不能只显示固定文案），已有快照的后台刷新失败保留当前内容。

卡片、文章、项目文档与漫步的手动/AI 制卡统一走 `services/flashcard-creation.ts` 的 `openFlashcardCreation`，由 AppShell 常驻的 `features/flashcards/FlashcardCreationHost` 承载选卡组、编辑、生成预览与草稿编辑，来源页面不挂弹窗。请求固定内容快照、数据库与可选取消信号；同一窗口仅一个制卡会话，关闭回传已保存记录；切库或插件停用只清理请求，不撤销已提交写入。生成请求按版本丢弃迟到流，重置、切库与卸载释放短任务。

插件 SDK 的 `context.flashcards` 经 `app/plugins/flashcards.ts` 注入：查卡组走 `flashcards:read`，直接创建与自动保存走 `flashcards:write`（异步准备后与每张卡写入前复核授权），`openCreate` 要求用户操作、窗口内保存由用户确认。AI 制卡只走通用 `context.ai.requestCapability("flashcardGeneration")`，无闪卡专用授权、缓存或模型分配分支；`generate` 只返回草稿，自动保存逐项返回 cards/failed，取消或拒绝授权停止后续写入。插件写入后必须经 `invalidateFlashcardViews` 刷新来源窗口原库查询（主进程通知排除来源窗口），批量部分提交后即使取消/失败也刷新。创建结果经 `services/flashcard-results.ts` 转 SDK 草稿结构：自定义引用用 `customContent`、已有正文用不透明 `contentRef`；插件输入经 `context.content.read` 核对正文身份与读取授权（本插件自有正文免业务权限）后映射内部 `contentId`，公共引用编码只在 `utils/plugin-content-ref.ts`。填空题的节点标识与唯一性由 `editorModel.validate` 统一校验。作者用法见 `plugins/tau-plugin-template/docs/flashcards.md`。

### 卡片库

`features/cards/queries.ts` 按 `["cards", databaseName, "all"]` 隔离缓存，仅数据库就绪时读取；列表走主进程轻表（content 为截好的预览块，不 JOIN 播客表），单卡全文/播客按需经 `["cards", db, "detail", id]`（预览弹窗、导出与演示动作）。写入与卡片创建/更新/删除事件按 id 单卡并入缓存（事件载荷即全量卡片，跨窗口按 id 回查后广播），不做整域失效。`cards:*` 命令在主进程校验数据库身份，元数据只提交字段补丁并在当前记录上合并，拒绝跨库或已删除卡片写入。CardDatabaseView 经必传 `onUpdateCard(id, patch)` 接入宿主写入；连接列数据走 `useContentLinksByContentIds`，筛选结果只用于列表展示；时间组用本地自然日/周一周/自然月。标签持久化为名称字符串，表格保存标签补丁时按列选项把选项 ID 转回名称，不能保存通用多选组件的 UUID。

卡片墙与表格共用预览：数据就绪后隐藏挂载 ContentEditor，正文会话与 `onInit` 完成才显示；读取失败展示错误可重试；关闭预览保留正文/标题/标签到 Dialog `onAfterClose` 再清理，避免退场中高度塌缩。卡片墙的普通与置顶卡共用 `CardContentPreview`（只读 Editor 渲染前 3 块，不开协作会话），摘要变化重建实例，列表按 contentId 更新正文与字数不重拉。

视图与排序由 `features/cards/preferences.ts` 按库持久化；视图切换经 `usePageBreadcrumb` 挂标题栏面包屑。筛选只剩标签条件（卡片墙/列表/表格共用同一会话查询，数据库视图将其与内置筛选叠加、会话条件不写入用户视图）；卡片库不设页内搜索——语义检索走命令面板，空态文案引导同一入口。卡片详情页（card-detail，match params 按 id 去重，连接 chip 经栈机异参原位更新）数据 = `useCardDetail` 单卡全量（含 linkCount），正文由 ContentEditor 文档会话持久化，元数据即时 patch；显式连接不经卡片元数据，存主库 `content_links`（按 contentId 绑定），脉络浮层与 ⋯ 菜单都走 `content-links:add/remove`（原子双边）。播客经 `usePodcastAttachment`。

**卡片数据库视图**：`CardDatabaseView` 与专属链接插件只服务卡片页，通用 Database 留共享层。视图、筛选/排序/分组、列宽按库持久化（`databasePreferences.ts`，tau-card-database-views，库名去 .db 后缀；旧 card-database-views 是首次初始化模板）；实例按库重建，旧实例迟到回调只持有原库动作不认领新库；跨窗口配置经 `view.receive/remove`、`views.reorder`、`column.resize` external 命令接入，不监听 props 覆盖内部状态。宿主经 `dispatch(command, "external")` 接入确认更新（`rows.apply` 提交字段差量、`rows.receive` 提交确认快照），变更事件携带 user/external 来源，保存回调只消费 user 事件。

### 脉络（features/context）

卡片、文章、项目文档详情的元信息行挂 `ContextBadge`（文章经 ArticleHero 的 extraMeta 插槽），数据走 `useEntityContext(ref)` → 主进程 `entity-context:get`，分区与数据源：

- **连接**：content_links 显式连接 ∪ 正文内联引用（去重），内建于浮层、四种内容实体通用；添加/解除由脉络域的 `ContextLinksSection` + `ContentSelectorModal` 承载（四实体互连，按 contentId 排除自身与已连）。
- **被引用**：索引库 `entity_refs`，由后台 `entity-context` 模块连库对账、经正文写入总线增量维护。
- **共用正文**（含 Notebook 笔记投影）。
- **被关联**：按自身与共用正文身份查 `plugin_links` 入边（`to_created_at` 须等于目标当前创建时间，孤儿与自环不算），类型名与图标经 `useEntityKindMeta` 取插件声明；数字 ID 引用类型的创建时间查询在无业务依赖的 `tables/plugin-ref-kinds.ts`（脉络与 plugin-refs 共用）；移动端 `entity_context.rs` 的 `plugin_links_of` 同口径，改规则两端一起改。
- **来源 / 衍生**：主库谱系 `entity_lineage`，只记复制、从对话存下、剪藏等推导不出的事实，写入经 `recordLineage`，弱引用不级联删除；闪卡、投影、待办关联在查询时推导。
- **白板使用**：索引库 `whiteboard_refs`（按元素类型解析，连库对账 + 写事件防抖对账）。

「把 A 的内容复制/存成 B」的入口必须记谱系（共用正文投影不记）。插件写入（plugin-entities/plugin-links/plugin-transaction/plugin-data:restore）与正文连接写入已在脉络写事件白名单。变化广播 `entity-context:changed` 按库失效；点击经 `features/context/open.ts`；其他域加分区复用 `ContextSection` / `ContextRow`。

**外部材料**（摘录、PDF 标注、剪藏）：地址统一为 `MaterialRef`（`src/entity/material.ts`，由谱系端点 LineageNode 收纳、不扩 EntityRef），展示信息由主进程 `material:resolve` 解析，打开经 `services/open-material.ts`；材料转卡片记谱系 `excerpt_of`，源端删除后保留引文不可打开。摘录按提供方驱动：展示只用提供方名 · source_title · location（`entity/excerpt/display.ts`，主进程/索引/移动端同口径），打开交给 `services/excerpt-providers.ts` 登记的提供方，未登记回落 url；不按 `source_type` 写分支，新来源 = 新提供方（内置用保留名，插件用插件 ID），写入经 `ExcerptTable.syncSource / patchSource`。材料动作清单单一来源 `services/material-actions.ts`。新增材料类型同步四处：`MATERIAL_KINDS`、`tables/material.ts` 解析、`material-index.ts` 索引候选与 `search-details.ts`、`open-material.ts` 打开目标。白板元素指向正文实体存 `entityRef: {kind, id}`，直接持有正文存 `contentId` 并在 `src/entity/whiteboard-refs.ts` 为该类型加 case；改白板/引用解析规则必须把 `whiteboard-indexer.ts` 的 `WHITEBOARD_REF_VERSION`（引用索引 `REF_INDEX_VERSION`）加一，否则已索引数据不重解析。

**「相关」分区**（`entity-context:related`，浮层打开时才取）：节向量均值前 50 近邻，排除已有关系（自身/共用正文/显式连接/引用/谱系两端，清单在 `context-related.ts` 的 relatedExclusions），相似度阈值 `index_meta.related_similarity_threshold` 按嵌入指纹与向量规模重抽样，最多 5 条（标题 + AI 要点，不显示相似度，不计关联数）；内容行可直接添加连接，连接后因已有关系移除。

### AI 元信息与洞见

**正文元信息**：主库 `content_ai_meta` 按 `content_id` 存每份卡片/文章/项目文档正文的 AI 标题、要点、概念、主张（带 schema_ver 与生成时的 MinHash 指纹），只由后台模块 `content-ai-queue` 写入——功能槽 `contentMetadata` 配上即处理全部、清空即停，无其他开关；连库对账 + 正文写入总线静置 10 分钟，纯文本相似度低于 `DIGEST_RECOMPUTE_THRESHOLD`（`entity/text-digest.ts`）才重算；正文删除同事务删元信息，变化经 `notifyExternalWrite("content-ai-meta:changed")` 补发（载荷带 contentIds）。卡片标题一律经取标题函数：主进程 `contentTitles/contentTitle` 按批 LEFT JOIN（禁止逐条请求），渲染端 `utils/card-title.ts`；只用于标题场合（面包屑、连接行、数据库标题列、导出与窗口标题），摘要/预览仍取正文。AI 标题仅卡片使用（文章/项目文档用用户标题），不提供手动改；元信息变化由 `patchCardAiTitles` 原地补缓存不整表重拉。进度经 `content-ai:status`。

**洞见视图（文档层）**：详情页元信息行「✦ AI 洞见」（功能槽 `contentInsights` 没配不出现），点击后正文就地进入洞见视图，平时正文不出现洞见。接入统一走 `features/insights/useInsightsView` 的四件：`button`、`report`（正文上方报告卡）、`frame(children)`（定位容器、段尾淡注、气泡、逐条看操作条）、`editorProps`（decorate + leafWrapper）。分析只在点击或重新分析时由主进程 `content-insights` 做一次（本地向量宽候选 + 一次模型调用 + 原文片段逐字核对），结果与处理状态存 `content_ai_insights`；标记 = 编辑器装饰不改正文，「连接」把片段包成 content-link。点正文或开始输入即退出；Esc 经 `useOverlayDismiss` 分层退出。新实体接入照这四件接线，不在详情页自建洞见状态。

**主题与全局层洞见**：后台模块 `topic-insights` 沿知识地图「子主题 → 主题 → 全局」只读元信息分层生成，结果与处理状态存 `knowledge_ai_insights`；按变化量三档重算（<10% 不动、10–40% 增量、≥40% 或连续增量 3 次完整重写），全局每 6 小时最多一次，元信息覆盖率 ≥80% 才开始，地图过时先 `knowledge-map-builder.ensureFresh`。主对话的用户提问作为 chat-prompt 向量进索引库（只服务「问了但没写」，不进全文与检索结果，向量检索显式排除）。三个落点：① 知识地图标题行（报告卡在筛选行下，标记经 LinkGraph overlay 画覆盖层，页面参数 `insight` 打开即点亮）；② 今日页「继续」段 InsightCard（直接展开列表默认 2 条，每条带理由与证据——原话打开那次对话、笔记 openEntity 打开到命中块）；③ 项目详情回顾（项目名旁「✦ 回顾 / 结项回顾」，报告卡在当前文档上方，文档树条目的 ProjectReviewSlot 长出「可能属于这里」与「还薄」= 引用型条目，参数 `review=1` 打开即展开）。连接：两端都是卡片时主进程一个事务写 content_links；有长文时经 `services/insight-focus.ts` 登记一处再打开。主动作按类型：呼应/重复 → 连接；同一思路、缺一环、问了没写、还缺 → 写成卡片（`services/pattern-card.ts` 建空卡连上涉及的笔记，详情真正关闭仍为空则撤回）；矛盾与可以继续想 → 聊一聊（`services/insight-chat.ts` 停靠栏开对话预填提问与引用）。处理状态只有 open/linked/dismissed。vec0 按 prefixed_id 过滤不走索引，读一批笔记向量要合成一条 IN 查询，不逐个查。

**长文按节检索与定位**：长文按节切块（`entity/sections.ts`：出现两次以上的最高级标题断节，1200 字再切、80 字短节向后合并；卡片/摘录整篇一节，超 2000 字仍按长度切），嵌入文本带「实体标题 › 标题路径」；节信息存索引库 `content_sections`（按实体 + update_time 分版本，全文与向量各引用自己的索引版本，写入后清理无人引用版本）。检索按块多取再按实体去重；知识地图近邻用实体节向量均值查一次。切块口径变化必须升 `entity/chunk-version.ts`（拼入主内容指纹静默重嵌）；重嵌恢复以 `main_content_building_fingerprint` 记构建口径，仅全量成功才推进完成指纹，部分失败/中断增量续跑、保留成功向量。`openEntity(ref, { at })` 的 at 是顶层块序号，编辑器就绪后滚动与闪烁，越界退文首；日记先按 moment 定位条目；对话页参数 entry 是一次性导航意图（不在当前分支只提示不替用户切）；卡片/摘录/PDF 标注命中不带打开定位。对话 `:ref` 的 block 由 `@tau/shared` 的 remarkDocumentReference 输出。不提供「正文抽成卡片 / 选区转问题」类输出转输出入口。

### 创作模式

文章与项目文档详情页参数 `layout=compose`（省略 = 普通详情），元信息行 `ComposeModeToggle` 开关，切换走 `navigator.push` 栈机原位更新，编辑器不重挂（正文栏子树两态键控不变；正文栏宽度是全局偏好，窄窗收起白板）。素材板 = 一页 `white_board_contents` + 主库 `compose_boards`（按 content_id 绑定，存写作意图与「不要」），**不建 white_boards 行、不出现在任何白板列表**；正文删除经 `ContentTable.deleteContent` 释放，脉络「被使用」显示为「创作白板」并带 `compose` 打开回创作模式。召集资料由 BACKGROUND 模块 `compose-gather` 做（意图嵌入查节级近邻 + 概念补召回 → 槽 `contentInsights` 一次调用分组；`compose:gather/cancel/gather-phase`）；段落亮起只比白板资料（`compose:paragraph-similarity`，不调模型）；建板先把脉络连接摆成「已关联」（不记「不要」），召集同样排除已关联。白板 → 正文只有卡面「引用」小签（`features/compose/insert.ts` 插入/撤掉 content-link），无拖拽。两栏经 `features/compose/session.ts` 会话 store 共享状态；嵌入白板的宿主定制走 DocumentHostContext（allowDock、cardAccessory），白板包不认识创作模式。素材板资料不进脉络分区：经 ContextBadge 的 extra 插槽放 `ComposeBoardEntry`（`compose-board:summary` 计数）。检查连接复用洞见视图的 getSeed / reportExtra / targetAction / copy。项目文档详情（EditProjectItem）同样接入，其目录在创作模式下让位，白板栏在文档区右缘展开。

### 知识地图（features/knowledge-map）

全局页面 `knowledge-map`，入口在标题栏（`KnowledgeMapToggle`，详情页点击带 focus 节点键），不进侧栏；命令面板有页面命令。数据 `useKnowledgeMap` → `knowledge-map:get`（离线地图 + 节点展示信息），页面 `toGraphItems` 转 LinkGraph 的 GraphItem。节点 = 卡片、未删文章、非引用型且有正文的项目文档（共用正文只出一个）；边 = content_links 显式连接 + 引用索引 entity_refs；语义近邻有入度上限（防长文成枢纽）。图谱实例只按节点键、下标与有效连线做拓扑比较（标题变化不重建画布）；高亮差量提交，拓扑变化在现有实例上更新并保留位置与视口。筛选只降淡未命中；生长动画与里程碑在 `milestones.ts`。

### Database 共享层接入

**不受控边界**：`data/columns/viewConfig` 只是初始值，内部 store 管理编辑、选择与视图配置，不监听这些 props。查询只有一个执行入口：`core/projection.ts` 合并持久化 viewConfig 与会话 query（text/filters/searchResults/grouping），数据、查询或配置提交时计算一次投影，选择变化不重算；注册视图消费投影，键盘导航消费相同 rowIds/columnIds。分组由视图定义的 `grouping` 声明（缺省通用 groupBy；`"none"` 禁用；`"view"`/函数形态由视图自带），projection 不出现视图类型字符串。拖拽传记录 ID 不传过滤后索引；排序生效时禁止手动行重排。ViewTabs 工具栏：搜索折叠图标钮（清空+失焦收回）+ 筛选/排序/分组胶囊钮（激活计数），三面板保留暂存逻辑，日期分组带二级粒度。

**公式列**：`deriveFormulaRows` 在投影开头派生，四种视图与筛选/排序都消费派生行；store 行与保存回调不含公式值，行详情单独派生。表尾汇总消费筛选后 `projection.rows`，配置在 `viewConfig.footer`（宿主 normalizeConfig 白名单已登记）；字段经 `CellPlugin.valueType/toScalar/formatScalar` 参与运算，引擎不认识具体插件；桌面扩展经 hook 插槽 `useFormulaAssist` 提供对话模型（未配置则构造器无 AI 输入框）。

**行详情**：`RowDetailModal` 是 Dialog 双栏（左标题+正文，右属性栏：封面 = 第一个有图列，加载中/失败露出渐变底），容器 <960 退化为单栏（同一棵树经容器查询与 display:contents 重排，编辑器不重挂、草稿不丢）。入参只有 `rowId`，行数据从 store 实时读；四个视图经 `hooks/useRowDetail` 管开合（宿主可传 `onRowDetailOpen` 接管）；上一条/下一条（J/K 让行编辑与输入法）按 `projection.rowIds`，当前行被筛出不显示位置。属性实时保存（与表格单元格同草稿+校验+transformBeforeSave 协议）；标题失焦提交；关闭/切换时组件卸载补存并写回所属行（rowId 组件自持）；无 `detailContentId` 的行正文在离开时才 `createPendingContent`。空属性折叠只折叠带 Editor 的字段，折叠集合进入行时定格。

**列表统计失效**：数据库列表行数与学习项目资料数由列表查询聚合——`commands/data-table.ts` 在携带 rows 的更新成功后失效 `["databases","list"]`；`commands/vibe-learning.ts` 在资料创建、笔记转资料实际新增、资料删除成功后失效 `["vibe-learning","list"]`（覆盖详情、内嵌表格与生成产物入口），笔记转资料落库即通知不等索引入队，失败不通知。

### 今日页面板与统计

**面板布局**：hero（问候与数字）固定非面板；内置面板登记在 `panels.ts`（固定 id/title/size/component，数组序即默认布局，ID 随库保存不要改名）。布局 = 有序 `{id, hidden}` 列表存主库 `home_panel_layout`（整份读写，乐观写失败回滚；保存过的顺序在前、未注册面板保留位置、新面板按默认序追加）。`HomePanels` 是 flex-wrap 流式容器：wide 占整行，compact `flex-[1_1_340px]`，同行等高不预设栏数；组件返回 null 外层不占位。编辑模式（「调整首页」按钮；编辑时 hero 右侧数字换成提示与「恢复默认」= 保存空布局 /「完成」，不另起提示条；Esc 退出）内容 `inert` 但不变淡。拖拽用指针事件（不用 HTML 拖放 API，Electron 里原生拖放可能起不来、连 dragend 都不来）：面板克隆成浮起卡片跟手（整行缩到 560px 宽），原位留 `[data-home-panel-slot]` 空位，拖动中的顺序是组件内 `preview`，其余面板经 motion `layout="position"` 实时让位（`FadeScroll layoutScroll`）；命中按布局位置 `offset*`（不受让位 transform 影响，紧凑面板看左右半边、整行看上下半边，让位后 10px 滞回防抖），松手才保存，Esc 取消回原序，退出编辑丢弃进行中的拖动，靠近滚动区边缘自动滚动；把手方向键移动并把焦点还给把手；隐藏面板区（点击恢复/拖回/拖进即隐藏，其上缘以下都算拖进）。回顾段保留自己的标题行与时间窗，懒加载滚动根经 `HomeScrollRootContext`。

**插件面板**：`context.home.registerPanel` 登记为 `RegisteredPluginHomePanel`（布局 ID `plugin:<pluginId>:<id>`），排在内置面板之后作默认序；宿主画 Panel 外框与标题，插件组件包在 RecoverableBoundary、UiProvider、PluginComponentScope 里只渲染正文，正文容器为空时外层隐藏；运行时其他变更不重挂插件面板；插件停用后位置保留。

**漫步牌堆**：`useTodayWalkDeck` 按 `["home","walk-deck", 本地日期]` 查询（跨零点自然换新天）；翻牌与重抽乐观写回缓存，落库走 `random-walk:daily-advance`（绝对 cursor）与 `daily-reroll`；当前牌首次露出 mark-seen。打开统一走 `features/walk/open.ts`；「从这里继续走」push `walk` 页带起点。池为空整块不渲染；`prefers-reduced-motion` 跳过动画。

**统计页**：`useStatsSnapshot(range)` 按 `d30/d90/year/all` 独立缓存——趋势/环比 = `getAllStatistic` + 日记全量快照差分（`utils/statistic.ts` 的 diffSeries，与今日页共用）；总量/构成 = 当日快照存量 + 日记字数 + 项目轻表字数（构成四分类，切窗口 keepPreviousData）；热力图/streak = `getCalendarHeatmap(今年)`；记忆保持 = 主进程 `flashcard:review-stats`（评分四档轻松/记得/模糊/忘记，保持率 = (normal+easy)/total）；专注节律 = `listPomodoroSessions` 渲染端分 24 桶聚合。热力图扫描在主进程每批 ≤1000 行、批次间让出事件循环、同年在途合并，右开区间按本地年。

**今日页数据契约**（`features/home/queries.ts`，types.ts 为契约源）：reviewDueCount ← 卡组 Σ dueCount；todos ← 未完成待办（逾期>今日排序取 3）；events ← 当日日程；recentEdits ← 卡片+文章日期范围渐进窗口（14→30→90→365 天凑满 12 即停）+ 文档/项目轻表 + 最新日记混排取 12；focus/weekly ← 番茄今日与本周聚合；todayStats/weekly/trend ← 全量快照差分；heatmap ← 全年每日操作数。并行 `Promise.allSettled`，单项失败降级空值不阻塞整页。数据入口一律 react-query（带 staleTime 与窗口聚焦刷新），`refresh()` 即 refetch。新增区块：types.ts 加字段 → queries.ts 分项函数 → 面板组件登记 panels.ts。

今日与回顾快照共用 `withSnapshotTimeout`，等待超过 30 秒才记录超时日志并拒绝；请求成功或失败后清除定时器，保留原返回值或错误。超时只结束等待，不取消底层 IPC 请求。

### 闪卡复习的职责边界与写入协议

- `features/flashcards/views/FlashcardsView.tsx` 负责页面编排；会话流程、快捷键、延迟删除和沉浸侧栏分别位于 `hooks/`。侧栏折叠由副作用管理，Activity 隐藏时恢复、重新激活时再次折叠。
- `components/review/` 按题面、答案、评分、AI 评判、资料抽屉与完成摘要拆分；编辑弹窗只管理表单生命周期，内容区与属性区独立成组件，初始化与校验集中在 `editorModel.ts`。菜单使用渲染函数直接返回 Menu 子项，保留组件库对声明树的键盘导航解析。
- 作答输入框隔离空格、字母、数字和撤销等按键，外层复习快捷键同时检查事件目标与当前输入焦点；空输入框也不触发复习撤销。问答保留 Ctrl/⌘+Enter 提交、普通 Enter 换行，填空保留 Enter 跳空/提交，输入法组合期间不提交；Esc 仍交给页面浮层仲裁。
- 暂停与移动在主进程写入成功后更新缓存；失败保留原状态。评分、撤销和暂停互斥，写入期间禁止跳过与结束；AI 评判通过请求版本丢弃换卡后迟到的响应。输入框不自行拦截 Esc，退场统一经页面浮层仲裁。
- `flashcard:submit-review` 在事务中更新排期并写入复习记录，返回卡片及 `undo` 凭据（记录 ID、主进程读取的评分前排期）。`flashcard:undo-review` 只接受仍指向最新评分的凭据，校验、删除记录与恢复排期在同一事务中完成，拒绝旧凭据与重复撤销。

### PDF 列表、阅读页与阅读状态

- `features/pdfs`：列表页 `pdfs`（封面 / 列表排布，照抄 weread 书架结构）+ 阅读页 `pdf-detail`（params `pdfId`）。列表数据只走 `pdf:library`（Pdf 行 + 标注数 + 缩略图 + 本地文件是否丢失，主进程一次聚合）与 `pdf-index:status-batch`（只查已有索引库；不要逐个调 `pdf-index:status`，它会为没建过索引的文件新建库）；有文件在建索引时状态查询 3s 轮询。
- 阅读状态（`last_open_time` / `last_page`）只经 `pdf:record-open` / `pdf:record-page` 写，**不改 update_time**：阅读器以 `pdf.id + updateTime` 作重载键，用 `update-pdf` 写进度会让阅读器整个重挂载。页数由缩略图生成时顺带写入（`pdf:save-thumbnail`），`pageCount == null` 即「从未生成过缩略图」。
- 缩略图在渲染端用 pdfjs 生成（`features/pdfs/thumbnails.ts`，懒加载 pdfjs + worker），主进程落盘到 `<编辑器目录>/pdf-thumbnails/<库名>/<id>.webp`；列表页只为本地文件补生成，远程文件等打开阅读页、文件缓存到本地后再生成。
- 阅读器（`features/pdfs/reader/`）：embedpdf 引擎。`PdfReaderView` 由宿主注入文件（`usePdfFile`）与索引（`usePdfIndex`）——阅读页要与对话栏共用；`PdfReader` 独立使用（项目里的 PDF 条目，无对话，左面板开关放进 HUD）。页面上的交互在 `ReaderLayout` 编排，每页叠加层（书签 / 查找命中 / 跳转闪烁 / 区域标注框 / 页边笔记图钉 / 浮动工具条 / 笔记卡）经 `ReaderContext` 取状态；文本标注的工具条挂在引擎 `AnnotationLayer` 的 `selectionMenu`。阅读区视口、左面板缩略图列表都是引擎组件（ref 被它占用），分别经 `data-pdf-viewport` / `data-pdf-thumbs` 取元素接 `FADE_SCROLL_CLASS` + `useEdgeFade`；对话栏拖宽用 `@tau/ui` 的 `ResizeHandle`（与壳层停靠栏同一件）。**页内浮层必须带 `overlayProps`（`data-pdf-overlay`）**：引擎在页面元素上挂原生指针监听，只有登记过的排除属性才不会把点浮层当成页面点击（清掉选区、开始新划线）。
- 标注数据（`reader/data.ts`，react-query 按库分 key）：写后直接改缓存、标注数变化才失效列表；同一引擎标注的写入串行。引擎事件 ↔ 记录由 `useAnnotationSync` 同步（导入引起的事件跳过）；区域标注不进引擎，由叠加层画。颜色：文本标注以 PDF 对象里的十六进制为准（`COLOR_SPECS[*].pdfHex`，属于文件数据、不随主题），界面色块映射主题数据色 `tag-*`；外来颜色经 `colorFromHex` 按最近距离归档。新建只给高亮 / 下划线 5 色，旧的波浪线 / 删除线 / 粉色照常显示与编辑。
- 其他域引用 PDF 一律经 PDF 域：选择已有 PDF 用 `features/pdfs/components/SelectPdfDialog`，建记录用 `features/pdfs/queries` 的 `useCreatePdfRecord`，读单个 PDF 用 `usePdfDetail`，阅读用 `reader/PdfReader`——不要另建 PDF store 或卡片（项目域的 `usePdfsStore` / `SelectPdfModal` / `PdfCard` 已删）。
- 对话（`features/pdfs/chat/PdfChatPanel`）：`useScopedChat({ scope: "pdf-chat", domainRef: String(pdfId) })`，页面专属工具经 `usePdfChatTools` 注册到 toolScope；「问 AI」的引用经 `ChatContainer` 的 `composerAccessory` 显示成 chip、`prepareUserContent` 在发送时并进消息（`annotationModel.applyQuote`）。阅读页对话栏的开合是本机偏好（`readerPrefs.chatOpen`），经 `useOwnAssist` 接管 Ctrl/⌘+J。

### 驾驶舱列表排布与打开记录

- 项目 / 数据库 / Notebook 三个列表页共用 `features/shared/cockpit`：`EntityCockpit` 承载纸面、工具栏（`CockpitToolbar`：排序 + 视图两个「按钮 + Menu」）、网格时的「最近打开」续读行、全部区（网格卡或行式列表）、归档折叠段与新建 / 编辑 / 删除弹层；条目三形态在 `EntityCards`。模块只提供 `CockpitItem[]`（含 `createTime / openedAt / lastItemTitle`）、文案与身份色，不另写列表组件。
- 排布与排序是本机偏好，按 `prefsKey` 分模块存（`prefs.ts`，persist key `tau-cockpit-prefs`）；排序与时间展示是纯函数（`model.ts`），置顶在任何排序下都排最前。
- 打开记录各模块一条 `*:record-open` 命令，由详情页的 `useRecord*Open` 触发，**不改 update_time、不记 operation**：
  - 项目：`project:record-open`（进入或切换文档；不带 `itemId` 只刷新时间、保留上次文档），读取走 `project:open-states`（独立 queryKey `["projects","open-states"]`，记录后只失效这一项），`useProjectsSnapshot` 合并成 `openedAt / lastItemId / lastItemTitle`；从列表打开时有 `lastItemId` 就带上它定位。
  - 数据库：`database-item:record-open`（进入时），`database-item:list` 直接带 `openedAt`。
  - Notebook：`vibe-learning-project:record-open`（随 `VibeLearningView` 的 `opened` 变化：资料 / 笔记记为上次条目，其余只刷新时间），`vibe-learning-project:list` 直接带 `openedAt / lastItemTitle`。详情页恢复仍读本机 `vibe-learning-opened-<id>`，数据库记录只供列表展示。

### 文章 / 卡片库的列表排布

- 通用控件在 `features/shared/list/ListControls.tsx`：`CommandMenu`（工具栏「按钮 + Menu」）、`LayoutMenu`（网格 / 列表）、`SortHeader`（列头排序，每列方向固定）、`ListTags`（两枚 + `+N`）。驾驶舱的 `CockpitToolbar` 与列表列头也用它们。
- 卡片库：`CardsViewMode` 增加 `list`（速切器顺序 卡片墙 / 列表 / 表格），`CardListView` 平铺行、定高虚拟滚动、列头吸顶；排序（创建 / 更新 / 字数 / 连接，置顶在前；连接数来自轻表 `linkCount`）是 `listModel.ts` 纯函数，在内存全集上排。行标题 AI 标题优先，没有时取首个非空块，摘要取其余块（`cardListText`）。点行打开预览弹窗，操作复用 `CardActionMenu`。
- 文章：工具栏 `LayoutMenu` 切排布，偏好在 `features/articles/preferences.ts`（本机，不分库）。网格仍按更新时间分月；列表平铺 + 列头排序（字数 / 更新 / 创建），排序经 `get-article-page` 第 5 个参数 `sort` 下推主进程（白名单映射 ORDER BY，非自有键回落 `updated`），**调用方必须显式传**——主进程包装层在参数尾部追加命令上下文。列表一页 30 条（网格 12），首屏未填满时直接续页。条目操作（置顶 + ⋯）收口 `ArticleItemOps`，网格卡与列表行共用。不提供标题排序：SQLite 按码位排中文，分页在主进程，前端无法补救。

## 8. 与移动端的源码映射（移植参考）

| 桌面（已移植）         | 移动端蓝本                  | 待移植                                                           |
| ---------------------- | --------------------------- | ---------------------------------------------------------------- |
| page/core/stackMachine | router/core/stackMachine.ts | 已含核心；popTo/多 pane                                          |
| page/core/paramsSchema | router/core/paramsSchema.ts | oneOf/object 描述子                                              |
| page/PageProvider      | router/RouterProvider.tsx   | history 适配（**桌面不需要**）、pushForResult、overlay 栈        |
| page/PageHost          | router/PageHost.tsx         | 转场（桌面只做共享元素形变）、手势（不需要）                     |
| ——                     | router/query/ + store/      | PageQueryProvider / PageStoreScope（桌面未实现，不声明预留字段） |

## 9. 禁止事项（防腐化）

- 不在 page/、ui/ 引业务代码；features 域之间不 import 彼此 store；
- 可被调用方覆盖默认样式的组件，不裸用 clsx 合并 className（走 `cn()`，§4.8）。
- UI 使用 `@tau/ui` + Tailwind，图标使用 lucide-react；不写 CSS Modules；不画横线分隔区块；
- 不在 Sidebar/Titlebar 硬编码模块条目（改 navigation.ts）；
- 新主进程模块一律 BACKGROUND；启动竞态与失败重试使用 ensureModule/withModule（§2.5）；
- 业务通知走 appNotify / routeNotification（§2.6），禁止直连 `@tau/ui` 的 notify 或 Electron 原生 `Notification`；
- 不造假演示数据（未接线就 null+空态）；
- 主题/页面必须走 defineXxx 协议注册（禁止中心登记表与散装 CSS）。

迁移期的编辑器数量基线、扩展边界独立扫描与 antd 专项检查已退役，不再执行 `check:editor-refactor` / `check:editor-boundaries` / `check:antd`。现有 ESLint 架构规则、类型、行为、主题契约、数据一致性和其他模块边界仍按变更范围验证。
