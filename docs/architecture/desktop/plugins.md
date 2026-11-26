# 插件宿主

插件词典、消息引用与语言环境遵循 [国际化](/docs/architecture/i18n.md)。

> 桌面插件运行时全量：页面/窗口/渲染/MCP/AI/后台/静态内容/提供方/数据授权/中心/贡献位；作者侧见 [作者文档](/plugins/tau-plugin-template/docs/) 与 [plugin-portability](/docs/architecture/plugin-portability.md)。

## 插件页面与作者 API

- 页面声明 `dockable: true` 后可在主窗口的用户操作中调用 `handle.open(params, { placement: "dock" })`。命令面板沿用 commands.register。右栏通过单个 plugin-page 视图承载，按启用代次 mountId 和 instanceId 保持组件身份；放大只改外框，同参数身份更新 props。停用、注销与切库回收目标（包括被网页盖住的来源）。插件上下文与守卫按展示位置隔离，网页覆盖期间 Activity 保留组件状态并暂停 effect。
- `ctx.app.openWeb(url)` 在用户操作中打开主窗口 HTTP(S) 网页，使用宿主的网页右栏和原有浏览分区。显式右栏请求在独立窗口、移动端及浏览器预览拒绝。网页加载和工具栏由宿主负责。

- 插件页面统一经 `features/plugins/pages/plugin-page.page.tsx` 承载，动态定义只在 `DesktopPluginRuntime` 登记，Page 栈机与双注册表不动。承载参数为 pluginId/pageId/instanceId + 标量参数 JSON；single 页每插件页面一实例，params 页默认按完整参数去重、可自定义 getId；`open()` 缺省传空参数，返回/前进保留栈条目自己的参数。
- 页面从 `PluginPageProps.pageContext` 取实例级上下文登记：`useEffect` 中 `register(() => value)`（任意有限 JSON，宿主不规定结构；MCP 的 `get_current_context` 原样返回快照）、`isActive()`（Activity 可见即栈顶）、`registerDismiss(dismiss)`（显示时挂入 Esc 仲裁，隐藏摘下、再显示按序重挂，插件停用清除）。不提供显示状态通知——effect 生命周期即显示状态（`services/plugin-page-context.ts`）。页面操作由作者自注册 MCP，不加工具分发或导航协议。
- 停用先取消上下文，当前页面改为不可用提示并卸载组件与 UI Portal；重新启用以新 mountId 创建组件，错误边界按代次重建。页面栈条目保留；功能入口随注册资源回收。pageContext.registerLeaveGuard 接通用 PageProvider 守卫，离开前依次检查，停用后不继续阻塞。
- 作者从 `@tau/plugins` 用定义/上下文/页面 API，从 `@tau/ui` 用组件；SDK 根入口只引 React 类型不加载 UI/DOM。`ctx.pages.register` 返回可打开与注销的页面句柄，页面组件不直接导入 Page/store。私有存储 `context.storage` 在 Electron 存当前库 `plugin_kv`（随云同步），浏览器预览用 localStorage 适配。
- 生产装配：`DesktopPluginProvider` 不默认注册任何业务插件（主题切换示例只在测试夹具）；用户从插件中心安装，生产包禁用 ZIP 安装（开发模式保留）；官方插件与模板以 plugins/ 下的 Git submodule 维护独立 GitHub 历史，主仓库固定提交，安装到 `~/.editor/plugins`。开发构建的「插件开发台」（plugin-workbench.page）只提供已安装插件的调试命令，不承载动态编辑器实验。
- 已启用状态：`plugin-local:set-enabled` 写主进程 `plugins/.enabled.json`（唯一写入者），窗口 localStorage 仅镜像，不反向导入；首次发现默认停用，旧 `.editor-enabled.json` 不读取；写入广播 `plugin-local:state-changed` 各窗口重读权威快照；SDK Node 入口 local-state 只读。普通页面插件即时启停，静态内容插件完整重启后生效；活跃内容插件须停用并重启后卸载，切库不改变编辑器快照。

应用根部注入响应式插件环境，DesktopPluginRuntime 的语义 navigation 入口复用真实侧栏模型；插件页通过 PortalScope/UiHostProvider 接浮层仲裁。显式开发目录、格式 3 装配及独立内容转换边界见[跨端插件宿主](/docs/architecture/plugin-portability.md)。

插件环境的 connect 也提供窗口前后台生命周期，页面保活与应用恢复分开处理；事件、防抖与注销边界统一见[应用前后台生命周期](/docs/architecture/plugin-portability.md#应用前后台生命周期)。

插件材料动作走 `material:resolve-ref` / `material:create-card`：按不透明稳定身份解析规范编号，正文准备完成后再在同一 SQLite 事务内复验材料快照、创建卡片并写谱系；结果由 PluginHost 统一提示。该写事件同时触发脉络与索引刷新，引用格式及跨端边界见[摘录与材料动作](/docs/architecture/plugin-portability.md#摘录与材料动作)。

桌面固定中心安装接受格式 1/2/3/4，目录、详情、版本与下载使用 v2，宿主提供实际应用版本及 `web-v1`、`desktop-v1` 运行配置。包类型、平台和运行要求分别解析；格式版本只用于读取协议。Web 前端与本机后台保留各自模块访问范围，后台 API、作用域、启停、逐版本授权与系统审核沿用现有契约。

格式 3/4 从实际定义识别静态贡献；格式 2 保留 editor/whiteboard 声明校验。安装复用原事务、启停和启动快照，原始清单、文件及摘要不改写；下载前后复查精确发行版本，暂存、恢复与启动对账来源。正式构建忽略调试中心覆盖，所有 portable 包须来自固定中心。具体清单、最低版本及历史读取边界见[跨端插件架构](/docs/architecture/plugin-portability.md)。

## 桌面插件窗口

插件通过 `definePlugin({ windows })` 静态声明普通窗、固定尺寸小窗或全屏窗，在主窗口的用户操作中调用 `context.windows.open(id, params?)`。插件窗口加载独立的 `plugin-window.html`，由受限 preload 获取已校验的包快照，并在渲染进程挂载声明的组件。应用级 `activate()` 由主窗口的插件宿主执行。插件窗口与 Page 栈各自独立。完整接口和作者用法见[桌面插件窗口开发](/docs/guides/plugin-windows.md)；模块与时序见[窗口架构图](/docs/architecture/plugin-windows.html)。

主进程窗口管理器按工作区、插件 ID 和窗口 ID 去重，并将包摘要绑定到一次物理实例。并发打开共用加载流程，最后一个有效请求的参数生效。初次挂载报告当前参数版本，主进程确认后显示窗口。复用时参数通过宿主状态更新，保持组件挂载。句柄按物理实例回收，关窗后再次打开会创建新实例。关闭发起窗口只撤销其端点和在途请求。停用、卸载、实际换包、切库及应用退出回收对应窗口与状态。

`plugin-window-communication.ts` 按应用、窗口实例、插件工作区三个作用域存储只读系统状态、实例参数和插件状态。IPC 适配器从发送文档、已绑定的插件包和工作区推导身份；每个插件可以定义有限 JSON 状态与即时消息，消息只向同一插件及工作区的在线端点投递。状态在主进程内按键保留最新值，订阅原子取得初始快照。单个 JSON 载荷上限 64 KiB，每插件工作区最多 128 个状态键，单端点最多订阅 128 个键，每插件工作区最多 16 个打开中的或已显示的窗口。

宿主将现有主题偏好与已保存字体合成 `system.appearance`，窗口在挂载前初始化 `@tau/themes` 运行时，设置根节点的 `data-theme`、`data-mode`、`.dark` 和 `color-scheme`，并通过与主窗口共用的字体应用函数设置字体和字号变量。独立入口加载同一套主题 token、UI 基础样式和内置字体资源。更新由宿主原地应用，普通组件继承语义 token，画布等自绘组件可读取或订阅当前窗口的只读外观。固定深色窗口继续继承应用主题族与字体，窗口内的有效明暗由本地运行时解析。

## 聊天工具自定义渲染

插件工具模型名称与稳定历史 ID 的纯函数统一位于 `@tau/ai/tool-identity`，桌面工具入口只做重导出，与移动宿主采用同一规则。

唯一注册表在 `@tau/chat-ui/renderers`。作者在 activate 中 `await ctx.chat.registerToolRenderer({ mcpId, toolName, component })`，只引用本插件 MCP 的原始工具名；PluginHost 激活前校验、成功后发布；调用名与稳定内部 ID 分离，渲染器同时绑定二者，历史消息仍按原 SHA-256 标识命中。展示不受 MCP 执行开关/连接状态影响；signal 失效立即卸载，切库先清理旧运行时。本地工具返回 `{ content, render?: { version, data } }`（有限 JSON + 正整数版本），经 pi details 保存，实时与历史投影都保留 details；失败/取消回通用工具行，未知数据版本由插件 renderDefault 回退。渲染选择再校验绑定：只按实际 execution.toolName 命中，插件不能改选他人绑定；插件接收 execution 独立快照，不能改写宿主消息。不新增聊天 schema、内置工具覆盖或 MCP Apps 运行器。

## 文件转录与 ASR

本机媒体进度使用原stage/fraction/percent/bytes与可选opaque code/params。队列、Whisper/Qwen及下载producer在原事件时点提供显示语义，ASRTask、IPC和commands完整传递，renderer以已知code投影、未知message保真。fraction-only事件同样交付，不合成新时钟；MarkItDown与资料索引仅取原fraction数值事实，不把显示code用于队列判断。

文件语音识别的公共契约与运行时在 [@tau/asr](/packages/asr/README.md)。`transcription` 仍是 BACKGROUND 模块：窗口文件与分段命令通过内置 `createLocalFileASR`，结果交回现有媒体流程；`whisper-engine.ts` 复用既有程序与模型目录，先由 ffmpeg 转为 16 kHz 单声道 PCM Int16 WAV，每次识别独占临时目录，进程正常退出且本次 SRT 可读才交付结果；Windows XXL 的特定退出阶段故障按下述完成证明恢复。词级结果保留原始对齐；旧媒体字段仅在宿主结果扩展 `sourceResult` 中保留，不把推断置信度或字幕末尾时刻当作公共 ASR 的测量值。

本地文件转录设置按引擎保存 Whisper 型号与 Qwen3-ASR 型号。旧设置沿用 Whisper 和原有的词级、AI 断句偏好。视频笔记按任务快照执行「本次转录设置」，学习资料与文件导入在任务开始时读取默认设置。纯文字跳过对齐与 AI，字幕可组合自动或 AI 断句和逐词时间保留；AI 用到的词级时间仅在用户选择保留时随视频笔记保存。

Qwen3-ASR 0.6B / 1.7B 按平台分发。Windows x64 可选 audio.cpp CPU 或 Vulkan GPU（默认 CPU），共用 Q8 GGUF 识别、对齐权重；macOS 14 及以上的 Apple Silicon 使用 MLX。首次使用时主进程从 Tau 发布域名下载完整运行包，经客户端内置的大小与 SHA-256 校验后解压，Windows 解压后执行程序版本检查，Mac 验证解释器与 Metal 可用再启用。同一版本由识别模型和对齐模型共用；Windows 的 CPU 和 GPU 包按各自摘要独立安装；设置和单次任务都可选择运行设备。选择 Qwen 时，设置与单次转录异步检测本机显卡。GPU 包安装前通过 Win32_VideoController 的名称、PCI 厂商、驱动状态与系统 Vulkan 加载器给出候选建议；安装后使用运行包的 Vulkan 枚举核实，并在每次 GPU 转录前重新枚举。界面和转录按相同顺序挑选硬件，优先独显、同类优先 NVIDIA。软件设备不参与转录。枚举失败或没有可用设备时建议 CPU，检测不会改写用户的设备选项或触发下载。Windows 运行包内含 x64 程序和 DLL，Mac 运行包内含 Python 与 MLX。两端均可离线推理。[运行包发布](/docs/guides/ops-client-build-install.md#qwen-运行包发布到-r2)。识别权重与共享 ForcedAligner 可从 ModelScope 或 Hugging Face 下载，两源使用同一权重 SHA-256，校验后发布。推理使用本地模型与临时 WAV；Qwen 字幕由对齐词聚合，纯文字任务只需识别模型。Windows 适配器将 16 kHz 采样点转换为毫秒，并结合原文标点聚合字幕；自动识别时原生 CLI 只导出正文，结果语言记作 und。语言检测未报告置信度时省略该值。

文件命令第三参数可传 signal/onProgress。渲染端在模块就绪后登记 taskId 并订阅，进度只交给对应任务；取消使用不继承已取消命令作用域的 IPC。主进程按窗口与 taskId 隔离任务，窗口销毁、重载、切库或应用退出会取消；子进程退出后再清理目录，取消后的成功结果不交付。长音频队列每次调用拥有独立工作集，任一分段失败会取消同任务的其他分段并等待退出。媒体导入仍有直接消费共享引擎的入口，其业务编排不归公共 ASR 包。实时会话的格式、尾帧、超时和取消由公共运行时约束；原生和插件语音输入由下述独立编排装配。

Windows Whisper 文件适配尊重调用方显式的 `device`；未指定时沿用已安装程序的设备默认值。默认要求进程正常退出；仅 faster-whisper-xxl.exe 的 0xC0000409 可在 stdout 依次确认本次目录字幕写出、Operation finished，且本次非空 SRT 的编号、时间戳和正文块完整时恢复。取消优先；其他错误、缺失或残缺结果不交付。恢复仅记录固定诊断，不记录正文，不自动切换 CPU 或云端。

## 实时语音输入

`speech-input` 为 BACKGROUND 模块；跨窗口麦克风租约由主进程维护，窗口销毁、重载、切库、心跳过期及退出会终止会话。渲染层通过 `ensureModule` 获取就绪保障；共用 `@tau/asr` 的 AudioWorklet 采集、重采样、PCM Int16 编码、尾帧排空与取消编排。麦克风仅在用户点击后申请，不自动切换云端提供方。

Mac helper 独立打包在 `bin/darwin/Tau Speech Helper.app`，macOS 26 上采用 SpeechAnalyzer、SpeechTranscriber、medium SpeechDetector，持续消费识别与 VAD 流；管道按实际到达字节读取，输出逐段修订，end 等 finalize 与结果流完成。构建脚本生成当前架构或通用二进制；旧系统及 Windows 探测返回不支持原生路径。Windows 平台评估已完成：保留 NSIS 安装、不开放原生识别（Windows AI Speech 依赖更高系统版本与 MSIX 包身份，与无包身份的 NSIS 安装冲突）；重启该路线需先重新确认最低系统版本与打包取舍，不加 SAPI 等旧引擎兜底。

插件通过公共 `context.asr` 注册，账号经插件设置的专用命令保存，普通全量设置提交保留主进程已保存的 speechInput，渲染缓存不持久化账号。`context.websocket` 提供标准事件、状态和同步 send/close，鉴权头、取消与有界背压由通用宿主桥接；不包含厂商协议。

设置 › 语音 › 语音输入（`VoiceInputPanel`）选识别服务（系统识别 / 识别插件卡片）并设置 AI 整理风格；识别账号与模型在插件详情 › 设置填写（`speech-input:settings`），未配置的插件点选或「去配置」都跳到插件详情并带回「返回语音设置」。整理模型在 大语言模型 › 功能分配 的「语音输入整理」中选择。选用的插件停用后保留选择并提示；open 打开插件详情。当前不挂载麦克风按钮或输入目标，`desktopSpeechInput` 与 `prepareSpeechRefinement` 由未来消费者显式调用，壳层不触发录音或模型请求。

整理服务读取 `llmUsageSettings.speechInputRefinement` 与 `speechInput.refinement`，复用 piStreamText 无工具单发，仅处理最终转录；原始结果与整理文本分开，失败／超时回退原文，取消不交付结果。配置数据和保存命令保留；入口、预览、原文查看及草稿提交界面由后续消费者决定。

## 领域提供方插件（TTS / 图片 / 在线视频）

三者为同一模式：渲染进程注册实例、主进程 `plugin-local:<域>-*` 只转发请求/取消/通知、账号配置只接受当前插件结构，由插件设置显式保存，不在启动时转换旧配置。

- **TTS**：注册与会话核心为 `@tau/plugins/tts-host`（移动端共用），`context.tts` 实例只在主窗口渲染端创建，账号配置按实例 ID 隔离；设置页「试听」用已保存配置合成并页内播放，选择不写回当前服务；播客从脚本到提交固定实例，会话关闭使后续上传/保存失效，普通失败保留空片段。设置提交走 user-setting 串行队列（原子落盘→快照→广播），失败保留已提交快照可重试。
- **插件调用朗读与保存资源**：`context.tts.open` 经 `app/plugins/tts-synthesis.ts` 走 `TTSProviderFactory`（「设置 › 语音」当前服务与模型，与编辑器朗读同一路径），会话随插件停用关闭，权限 `tts:synthesize`；`context.upload.save` 经 `runtime.ts` 交给 `uploadResource`（本地库或资源上传插件，与正文插图同一路径）。两者只在桌面接线，移动端返回不可用。
- 播客由 `tau.podcast` 插件提供。每期播客使用插件实体保存，关联原文的角色为 `source`，关联 Notebook 产物的角色为 `output`。
- **Notebook 输出**（`context.notebooks.registerOutput`）：运行时登记在 `DesktopPluginRuntime.notebookOutputs`，`app/plugins/notebook-outputs.tsx` 提供列表与挂载插件组件的 `PluginNotebookSlot`；图标、选项与阅读组件接受函数及 React memo/forwardRef 组件，对象动作图标使用同一校验。Notebook 的 ＋ 菜单与资料页「基于这份资料」在内置应用之后列出插件输出；`GenerateDialog` 以 `kind: "plugin"` 承载，中间嵌插件 `options`。`tasks/runner.ts` 调插件 `prepare` 得到任务说明，校验产物属于该插件、类型一致后登记 Notebook 引用并建 `output` 关联，再以生成任务 `plugin`（`generation-orchestrator`，`vibe_learning` 来源：通用规则 + 资料清单 + 检索工具 + 插件的 `instructions`）用 `chat` 模型生成，正文交 `complete`，阶段与进度写回同一条任务；失败或停止先等待 `fail` 清理，再发布可重试状态。重新生成前检查实体是否仍存在：存在时复用任务说明，已删除时重新 `prepare`、建立关联并打开新实体。产物列表由主进程 `plugin-entities:notebook-outputs`（经 `output` 关联指向该 Notebook 的非孤儿实体）给出，插件停用时不列；阅读区 `PluginOutputStage` 渲染插件 `view`。列表尚未成功加载或仍为上一版本占位数据时保留阅读区选择，未成功的任务可在实体缺失时继续承载生成过程与重试。用量记在 `generation:plugin:<插件 ID>`。
- **图片生成/编辑**：`context.images.register` 注册实例（生成与编辑至少实现一项，输出图片字节与实际 MIME）；`target: "images"` 配置视图接收 imageConfig。聊天/编辑器/白板共用 `services/image-generation.ts`；输入输出各最多 16 张、总字节各 ≤128 MiB，只收 PNG/JPEG/WebP；能力状态按配置与激活代次异步刷新，执行时复核；历史工具来源与结果键稳定，已生成图片无需插件即可展示。
- **在线视频**：`context.video.register` 注册实例（`matches / resolve / cacheKey / getPlayback`，返回播放源描述——file 单流 / split 音视频分离 / extract 走宿主 yt-dlp，不传视频字节）。宿主无平台代码：主窗口 `app/plugins/video-registry.ts` 执行并归一化结果，下载/合并/缓存统一在主进程 `online-video-cache`（缓存身份 = 插件 ID + cacheKey 摘要，已缓存不向插件取流）。视频元数据 `metaInfo.type` 即插件 ID（`type/title/thumbnail` 宿主占用，其余字段归插件）；编辑器/白板/视频笔记/学习资料共用 `useOnlineVideo` 与 `OnlineVideoSelectModal`，添加入口按插件生成、弹窗只用该插件解析（链接属其他插件时提示改入口）。界面文案不出现「视频插件」统称：能用来源名用来源名，统称叫「在线视频」；移动端/博客/浏览器扩展只显示降级提示。
- **嵌入**：`context.embeddings.register` 注册提供方（maxBatchSize 可选），主窗口经 `app/plugins/embeddings-bridge.ts` 连接并上报 provider 集合；主进程 `PluginEmbeddingsRelay`（`services/plugin-embeddings.ts`）无会话地转发一次性请求/应答，按 requestId 管理 pending，reply 校验宿主与 generation，abort/超时（TimeoutError）/宿主断开时向宿主发 cancel 并回收。嵌入调用由主进程发起（检索与索引），`embedding-service` 插件分支从 `embedding.plugins[pluginId].config` 取连接配置、按 maxBatchSize（缺省 32）顺序分批并逐批回调进度，整体做维度断言；编排器在插件未就绪时跳过 reconcile 且不落指纹，宿主从未就绪翻转为就绪时自动恢复，插件仍按量计费不参与自动空闲索引。

## 插件 MCP 与 AI 服务

`ctx.mcp.register` 接收 `PluginMCPDeclaration`，仅 MCP 显示名称与说明可为所属插件词典引用。宿主先校验并快照结构字段，再保留显示 getter；适配器与界面模型保持该读取语义，语言不重新登记或连接。普通字符串仍是注册时快照，停用后的退出界面保留最后展示值，工具标识、AI 描述/Schema、传输与执行身份不翻译。

MCP 本机设置只接受带 `transport` 的当前服务器结构，不将旧 `baseUrl/apiKey` 配置转换为传输配置。读取失败保留原存储且不装配服务器；当前提供方默认开关仍按注册表补齐，已保存意图优先。

- 自定义 MCP 只在主窗口初始化、监听配置变化和手动重连。连接由主进程持有，多个主窗口对同一服务器、同一传输配置的普通连接请求共享在途握手或复用已建立的连接。
- `ctx.mcp.register` 可注册多项本地 tools 或外部 transport（stdio / streamable-http），两者互斥。激活成功才发布，失败/停用/切库回收；调用名使用可读的「插件 ID__MCP 局部 ID__工具名」（插件 ID 的点转下划线，工具名的下划线转连字符，MCP ID 与插件 ID 末段相同时省去重复段）；有损输入或超长名称带摘要消歧，名称限制为模型接口支持的字符及 64 字符以内。界面显示「MCP ID:工具名」，不展示内部摘要；逐工具开关使用独立 settingsKey，沿用原 SHA-256 稳定 ID。激活/重连代次进执行身份；执行复核实例、数据库、整项与逐工具开关，合并取消信号、限时 60 秒。MCP 页面与聊天快捷面板经 useMcpServers 同源展示并注明插件来源；外部项复用配置/日志/重连，本地项只展示工具；外部连接绑定窗口，窗口关闭/崩溃断开不改变手动服务器生命周期。
- 插件 AI 两条路径：自定义功能由 `ai.features` 声明并独立分配模型；`context.ai.requestCapability(name)` 复用应用已有分配。仅开放聊天 `chat` 与闪卡 `flashcardGeneration`，其他内置用途保留为应用内部能力。能力名/显示名由 SDK 的 PLUGIN_AI_CAPABILITIES 提供，公开能力必须对应 llmUsageSettings 中的模型分配；新增内置分配不自动对插件开放。PluginHost 统一校验声明、懒申请、逐次检查与撤权取消；主进程 BACKGROUND 模块 plugin-ai 用同一插件额度、并发与审计执行 pi-ai，模型解析前登记取消句柄。文本输入通过 `@tau/ai/plugin-quota` 按本次 UTF-8 字节数加封装余量预占，与移动宿主共用算法，合并输出上限后占用额度；图片输入仍按模型上下文容量保守预占。已知实际用量在结束时结算，未知用量保留本次预占。chat/stream 支持文本与 user 图片（图片与正文不入审计、总大小有界）；插件设置对宿主能力只显示继承模型与额度。作者用法见 `plugins/tau-plugin-template/docs/ai.md`。

## 独立后台

- 格式 2 的 `backend` 与渲染入口分开构建、静态核验；主进程 `plugin-backend` 为已授权包启动独立 utilityProcess，`ctx.backend` 只取得本插件连接——支持请求/事件/取消、版本摘要授权、进程超时回收与失败熔断。外部工具由宿主监督；Node 插件仍是高信任代码，不是 OS 沙箱。详情页「本机后台」管理授权与重启，业务数据权限不自动授予后台。
- 后台按 application/workspace 作用域支持按需与就绪激活，持久授权才跨重启生效；可从托盘菜单暂停或恢复插件后台。Windows Job Object 须实机验收。
- 应用退出与更新共用 `app-quit-controller.requestAppQuit`：先排空并确认持久文档，失败保留窗口并允许重试；确认后登记窗口回执，再广播收尾，期间保留退出同步所需的后台调用。窗口等待上限 8 秒，确认保存后的收尾期限 15 秒，之后拒绝新调用并回收后台、销毁全部窗口。更新安装在这之后交接 `quitAndInstall`，仅此阶段放行原生 `before-quit`，安装器须在 15 秒内退出旧进程；重复请求与迟到收尾只执行一次最终动作。安装器启动错误通过原生错误框报告并结束已收尾的旧进程。
- macOS 安装入口只在 Electron 原生更新器确认验包后就绪，不能把 electron-updater 的 ZIP 下载事件当成安装就绪。下载或验包失败清除就绪状态；保存失败经安装 IPC 返回，渲染端显示原始原因。更新通知、插件状态及图片/视频宿主释放广播逐窗口检查 BrowserWindow 和 WebContents，并隔离发送竞态，单个窗口失效不阻断其他窗口和在途请求回收。`updater-electron.test.ts` 在隔离资料目录中验证真实隐藏窗口、beforeunload、保存失败重试及原生退出事件。
- 异步数据库命令：同步命令用 better-sqlite3 同步事务/保存点；异步编排不包外层事务，网络等待后由领域写入方法开同步事务并重查修订；索引异步写入不跨等待持有事务。后台会话被授权变更/撤销/停用关闭时通知渲染端丢弃令牌，恢复仍有效的订阅；失败 RPC 不自动重放。
- 内容转换统一经 `ContentExecutor`：独立 `content-runtime.html`（sandbox、禁 Node、无业务 preload）消费固定包快照；队列/超时/取消有界，写入前复核库连接与修订，失败不写过时结果；无插件快照时可用纯内置转换。宿主节点（内容链接、附件、白板等）的持久化声明集中在 `editor-extensions/element-definitions.ts`，界面扩展展开同一份声明；转换窗口按这些声明建契约目录（`prepareContentContracts`/`prepareContentMarkdown`），不装载白板、数据库等界面扩展。生产主进程与 Node worker 不求值插件定义（`pnpm check:plugin-process-boundaries` 守护）。
- 安全与更新：插件中心后台版本必须人工系统能力审核（CI 不自动批准）；客户端来源记录绑定 Release/版本/ZIP 摘要，本机授权再绑定安装路径与完整清单；联网状态缓存 ≤1 分钟，运行后台与插件 stdio MCP 定期复核已知下架；离线不能感知未获取的撤回。插件 stdio MCP 须匹配 backend.tools 并获后台授权；更新在有任务/订阅/MCP 租约时拒绝切换，空闲后整包原子切换、新版本等待独立授权。
- 下载统计：插件中心按 downloads7d/Total/updated 排序，主进程按页读取供发现/更新/详情共用并按 pluginId 去重；匿名凭证存 userData/plugin-center（按 API origin 区分、0600、跨工作区复用、不经 IPC 返回）；旧服务无统计窗口时不展示虚构零值。

## 静态内容插件

格式 3 的白板插件沿用 whiteboardExtensions，作者不重复声明类型或白板能力标签。宿主在内容进程求值实际定义，识别并校验扩展后沿用静态装配、重启生效与工作区偏好；安装兼容性统一使用目标平台与最低版本，桌面基线为 0.59.4。移动目标不承载白板插件。

- SDK 的 `editorExtensions` / `editorCodecs` 是正式静态贡献（manifest `editor: true`）。主进程开库前按 `.enabled.json` 静态读取已启用内容包并交独立内容渲染进程校验定义，只保存通过校验的快照；`initializeContentPlugins` 在 React 挂载前读取快照，校验类型冲突并装配 CSS/codec；`createDesktopKit` 在底座上 extend 贡献不重建打开中的编辑器。
- 桌面与博客的插件贡献由 `@tau/plugins/content` 的 ContentPluginRegistry 保存只读快照；博客发布按用户已安装版本收集 main.js/CSS 在浏览器加载。移动普通正文在自己的 EditorKit 上装配受控跨端快照；浏览器扩展仍用原生套件，未知节点按通用保护保留原数据。
- 领域插件的节点边界：HTML 行内与块级归 tau.html 插件（SDK 的 useInlineSource/insertInlineSource，插件不得打包自己的 Slate；Markdown 认领归已启用插件，缺包保留文本或未知节点 JSON）；ABC 归 tau-plugin-abc（内置 diagram 只剩 Mermaid、PlantUML；HTML 导出优先插件 SVG，缺包保留转义源码）；Typst 使用插件自带的浏览器 WebAssembly 编译器（预览挂载不写文档，仅用户编辑源码编译成功后持久化缓存，博客用缓存或源码回退）；TikZ、custom-block 同为独立插件。两类 HTML 的静态导出 CSS 按 styleSources 收集，宿主无专属类型名单。
- `SourceBlockEditor` / `useSourceBlock` 由 SDK 提供（内部复用 PreviewWithEditor）；宿主共享模块初始化 source-editor-host，作者入口只依赖 SDK。
- 插件 Skill：包内 `skills/<id>/` 目录（manifest.skills 列出并进 integrity）；只声明 skills 的是独立 Skill 包（`packageKind: "skills"`，不进 PluginHost、不参与代码启停）。独立包保留格式 1，支持旧 desktop/minAppVersion 和跨端 portable/targets 两种声明，桌面读取与安装均检查自身 target；跨端包与中心审批清单及固定来源对账。主进程收集声明目录，与「我的/关联目录」经 `skill:list` 返回（标识 `pluginId:skillId`），读取与脚本执行只放行声明目录；渲染端按本窗口 PluginHost active 状态过滤插件来源，兼容的 Skill 包安装后可见。带脚本的 Skill 与独立后台共用 `requiresSystemReview`（门户不能自动批准），脚本执行沿用 run_skill_script 的 execute 确认；跨端安装不授予手机脚本执行能力。

## 博客发布（宿主与模板分工）

- 正文里的本地图片随站点发布：worker 按内置资源声明与当前库 `plugin_element_resources` 中的声明处理普通图片、行内图片及插件图片字段（含嵌套数组和预览地址），仅改写发布副本，不写回原正文。不解析 HTML、CSS 或代码字符串中的资源。绝对路径、`~/`、`file:`、`ltoh:` 与本机 24678 资源地址读取原文件，按内容 SHA-256 去重输出到 `_tau/media/<sha256>.<扩展名>`，正文使用部署 basePath 下的地址；公网地址和内嵌 data URI 保持原值，不搬运远程缓存；发布目录内的摘要图片链接另外登记引用候选，由当前物理目标账本核对路径与内容摘要后保留为正文依赖，不要求本地原图仍然存在，最后一处引用撤下后仍按发布保留窗口清理。原始文件路径优先直接读取，仅文件不存在时安全尝试 URL 解码，保留文件名中字面量 `%` 的含义。图片依赖记录在宿主发布文件描述中，参与增量上传、上一轮依赖保留和撤下清理，不作为全站模板资产保留。缺失、不可读或无法定位的图片保留原地址，并按所属内容汇总标题、原地址和原因；计划预览、远端发布和本地导出都返回缺图清单，页面可展开查看，完成通知提示并提供详情入口，缺图不阻断发布。
- 宿主只生成数据：六类摘要 JSON、ContentRef、`version/documents` 搜索索引与内容插件产物；不提供阅读器、预览 UI、路由、React 依赖映射或站点脚本。公开类型从 `@tau/plugins/publish-data` 消费，数据客户端由 `@tau/blog` 或 `@tau/plugins/publish-client` 提供。发布命令附带编辑器内置类型、插件节点归属与 JS/CSS 摘要；主进程重验磁盘包，worker 的 PublishPluginCatalog 只处理数据不执行作者代码；缺渲染支持的节点按类型汇总警告不阻止发布，节点数据原样输出（网站按未知节点保护显示占位）。每份内容声明实际使用的插件依赖，产物写入带版本与摘要的 `plugin-assets/`。
- 站点级数据（发布外观、项目列表、卡片标签树、项目目录树）只写清单一次；内容文件只含自身正文、资源依赖与 `links`（本文已发布的站内链接目标）——增删一条内容只影响链接到它的文件。动态 CSS 过渡为 `data/styles/<sha256>.css` 按原文全局生效；图标在 `_tau/site/`。同一项目内共享文档可在多个目录分支，入口全保留，正文/前后篇/搜索按文档 ID 去重，面包屑取深度优先首现；不同项目的 key 按项目 ID 隔离。`project-card-list` 在生成阶段保留卡片节点，优先按 `entityRef` 解析来源（旧 `projectItemId` 回退），按项目树顺序生成已发布子文档的卡片快照（标题、80 字摘要、ContentRef）；来源无效或已删除时输出空列表并警告，不阻断发布。`@tau/blog` 内置渲染与桌面共用 DocumentCard/Grid。
- 博客模板用静态分发分支 `template: { protocolVersion, root, entries }`：只含静态产物，声明代码入口的模板包直接拒绝；沿用中心安装/更新/恢复事务；发布设置从已安装模板选择，主进程冻结全部资产并校验 SHA-256。宿主保留 `_tau/`、`data/`、`plugin-assets/` 协议目录；只替换入口 HTML 真实属性里的 `__TAU_MANIFEST__`/`__TAU_BASE__`（未知占位符报错），JS/CSS 字节不变、不执行模板构建；深链由模板自己处理（官方模板把 404.html 列为第二入口）。
- 站点配置分两层：宿主只保留标题、图标与发布目标公开 URL；其余字段由模板在 `template.siteFields` 声明（text/textarea/url/select/switch），宿主校验后在「站点设置 · 博客模板」按声明渲染，值按模板 id 存 `publish.site.fields`，发布时 `resolveSiteFields` 只输出已声明键回落默认。连接状态与测试连接归宿主；发布页只选择目标，连接配置在插件详情的设置中显式保存。
- 发布计划在 worker 计算，只回传路径/摘要/依赖描述；实际发布按物理目标记录成功资源，增量上传依赖后才更新入口；失败重跑完整计划，无按文件重试接口。`publish-releases/` 只保留当前与前一轮有变化的成功元信息；撤下内容清理旧正文/聚合/索引优先于缓存保留；Git 发布只提交计划内文件不强推；S3 仅为协议保证的摘要资源设不可变缓存。官方模板在独立 `tau-blog-template` 工程（路径路由 + 404 回退、按 key 取数、正文/预览各持数据上下文与 EditorKit），不是第三方模板准入要求。官方模板、起步模板与团子铺模板以子模块登记在 `plugins/tau-blog-template*`，`scripts/plugins/verify-blog-template.mjs` 默认读官方模板，传参可验证任一模板的构建产物。

## 插件服务与提供方

提供方连接配置归插件详情 › 设置：`ProviderAccountSettings` 管理 TTS/图片的多账号、模型和 ASR/视频/发布的单插件配置，复用现有持久化命令；`ProviderFormView`（字段区 `ProviderFormFields`，按调用方绑定写回）统一渲染 form 并显式保存，保存失败保留草稿，添加或保存不自动切换服务。图片模型复用宿主可搜索、可创建的 `Select`，插件声明的 `models` 只提供预置项，用户可输入任意非空模型 ID，保存与运行不按预置列表限制。插件详情为设置分区创建一个 `SettingsDraftController`（`@tau/plugins/settings-draft`），插件组件与 `ProviderFormView` 经 `useSettingsDraft` 报告改动、错误数、修改清单与保存/还原；`SettingsDraftBar` 在有改动时经 UI Portal 固定在窗口底部上方 24px，按设置区宽度水平居中，并为表单末尾预留滚动空间（⌘S 保存，错误时抖动并聚焦第一个 `aria-invalid` 字段），详情页离开守卫、切 tab/分组、切账号与 beforeunload 关窗都先经 `SettingsLeaveDialog`（保存并离开 / 继续编辑 / 放弃修改），「设置」tab 有改动时带圆点。不在设置分区内（发布抽屉自动保存、无控制器）时 `ProviderFormView` 保留卡脚保存栏。插件详情 › 设置统一用 `SettingsCard`（描边卡，详情页本身是一整张纸，不叠阴影卡）：卡头为身份与选用状态（同步/存储的选用卡、ASR/视频/发布的能力头、多账号的账号头——名称原位改名、「使用中」、⋯ 删除），form 分组与宿主控件（模型、音色复刻）为卡内小节；多账号在卡片上方以胶囊切换。插件自绘组件放进卡片正文（`SettingsCardBody`），不自带 Panel；AI 配置同为一张卡片。只有一个设置分区时不再重复渲染分区标题。应用设置保留当前 TTS 账号/模型/音色与试听、图片账号选择、ASR 选用；视频按 URL 匹配多个来源，只显示来源及配置入口。发布页「站点设置」抽屉以 `inline` 布局嵌入同一份 publish 配置并自动保存，与插件详情写同一份配置。Bilibili 扫码登录保留专用插件组件，同样在插件页承载。

设置草稿的默认文案、惰性保存反馈和原始失败原因由[国际化边界](/docs/architecture/i18n.md)约束；语言变化不重新执行保存或连接测试。提供方表单分组以原始字段 key 序列保留身份，不用展示标题作 React key。

**博客发布提供方**：GitHub 与 S3 发布由独立 tau.publish-github / tau.publish-s3 提供，`context.publish` 注册文件式或快照式实例；发布页只消费活动注册与当前选用，`target: publish` 配置表单在插件详情页承载（按应用级插件身份保存）；本地导出内置不要求发布插件，缺失或停用保留配置不回落其他提供方。渲染端 publish-registry 与常驻 publish-bridge 执行作者代码，主进程 PluginPublishSessions 绑定发起窗口/配置/任务 signal，只转发 open/call/close 与字节；发布占用阻止启停/更新/卸载/重启，切库回收实例。文件式并发受提供方上限约束、依赖成功后才更新入口；快照式整轮远端确认后才记账。Git Push 走受控 `services.git.publishSnapshot`：主进程只执行固定 Git 流程（输入为临时发布句柄、无凭据的 HTTPS 远端、分支、提交者、缓存授权 ID），目录选择由宿主返回句柄，插件不能传任意 cwd/shell；认证经任务级 askpass 环境传递不落盘；拒绝非快进。发布配置只接受 local/plugin 目标；无目标账本时完整上传不借用其他数据库全局历史。

**编译与转换服务**：`context.services` 提供 Tailwind、Typst HTML、Markdown 与 Descendant[] 双向转换、HTML 渲染与 FFmpeg 处理（TikZ 服务已移除——编译器和字体归独立 tau.tikz 插件）。Provider 注入 `app/plugins/services.ts`，SDK 合并调用方与实例 signal，停用不返回迟到结果；服务不读写业务内容、不选存用户文件。主进程 `plugin-services` 为 BACKGROUND 模块：任务按 WebContents 归属，关闭/导航取消；编译器与媒体进程独占任务临时目录、完成后回收；FFmpeg 复用客户端按需下载的二进制。TikZ 文档与博客用插件自己的节点组件与内部编译模块（不依赖 activate），缺插件时保留源码并跳转插件中心；diagram 扩展不再含 TikZ，移动端/扩展不设替代编译器。Markdown 复用 desktopCodecComposition（单次 codecs 不改编辑器注册）；HTML 沿用现有序列化器（保留原始 HTML、外部资源与图表源码回落，不是净化器）。作者契约见 `plugins/tau-plugin-template/docs/services.md`。

**摘录提供方**：`context.excerpts` 由 `app/plugins/excerpts.ts` 适配——来源类型即插件 ID，调用经 `bindDatabaseCommands` 固定原库并带 signal；`register` 异步登记名称与打开函数，停用注销；主进程在 `tables/excerpt.ts` 校验（保留名 `web` 拒绝），写入事件进 `EXCERPT_WRITE_EVENTS` 驱动索引与脉络刷新。微信读书为 `plugins/weread` 插件（内置实现已删除），主窗口外链统一交系统浏览器。材料动作沿创建时的 databaseName 与 signal 传递：切库/停用后的迟到结果不唤起新工作区界面；创建请求发出后谱系仍绑定原库完成。

**资源上传**：默认本地，远端由渲染进程插件经 `context.upload.register` 提供（设置分区 `target: "upload"` 挂「资源存储」）；宿主负责压缩、唯一命名与配置快照；独立编辑/Markdown 窗口经 plugin-local IPC 转发到已连接的主窗口渲染宿主（主进程不加载插件、不建隐藏窗口）；窗口关闭/导航/宿主释放/插件停用后拒绝在途结果。GitHub/OSS/S3 旧图床与 WebDAV 图床已退役；GitHub/S3 博客账号已迁到发布插件配置。

普通正文及共享作者的 `collaborationKit` 先调用场景 `IResourceService.upload`，遵守压缩与图床设置。未共享时直接保留返回地址；作者共享时再经绑定的 `prepareResource` → `collaboration:prepare-resource` 转换：公网 URL 原样返回，本地图片按保存后的文件登记待上传资产。共享成员插图经 `collaboration:upload-shared-resource` 直接进入协作服务器，不读取成员的图床配置。共享视频不走图床，两种角色均经该视图绑定上传命令保存为仅本机资源；作者图片不能借该入口绕过自己的存储配置。两种服务器图片上传沿原资源队列补传，完成前暂停文档网络发送；上传前后复核视图归属、角色、会话与冻结状态，作者图床失败不触发协作转换。

作者接收服务器图片时，主进程 `CollaborationAssetService.preserveOwnerImages` 下载后经 `services/collaboration-image-storage` 交给主窗口，渲染端复用 `uploadResource` 按作者当前的压缩和存储配置保存；作者自己已存到持久资源目录的图片不重复处理，`remote-resources` 与协作缓存不能充当完成凭据；本地完成地址须仍位于真实的 `resources` 目录，失效映射重新补存。同一资源的在途任务去重，成功地址按文档保存在本机协作库 `owner-images:<documentId>`，不发给成员；共享内容保留服务器资产，作者的正文读取、主库投影与结束共享使用保存后的路径或公网 URL。主窗口关闭、导航、重连代次变化与超时取消存储请求，失败保留服务器资源并重试；结束共享在服务器关闭前补收最终快照中的图片并等待作者存储成功，失败恢复可编辑状态。明确移除会话时清理地址映射，持久资源文件保留；单篇缓存重建保留资源队列与完成映射，整库缓存版本重建迁入可读取的资源记录和设置。带资源的 `discarded/` 备份建立 `resource-backup:<id>` 持有标记，替库释放及后续会话清理均保留其附件目录，不能只保留清单而删除文件；没有备份持有的会话仍按正常退出流程清理临时附件。

作者离线不影响成员向服务器提交图片。作者恢复连接后，WebSocket 的文档更新标记 `projectionDirty`，`startAutoFlush` 的后台投影定时器先补存图片、再检查主库是否可写，不依赖正文视图或原资料库打开；资料库随后连接时继续完成正文投影。应用启动恢复冷缓存时也先标记待投影，即使旧缓存已投影，随后到达的远端更新仍重新触发。作者设置未加载、主窗口存储宿主尚未就绪或图床失败时保持待投影，定时重试，禁止使用启动默认配置提前保存；仅保存成功才写入持久地址映射，已完成的图片不因重连重复上传。

本机正文的创建、增量、整篇替换与渲染订阅显式使用 `allowLocalResources` 校验选项，保留原始资源路径或公网 URL，不生成仅本机资源编号。共享候选与服务器仍使用默认严格校验，发起共享时只有本地资源经资产服务转换，公网 URL 原样保留。跨文档粘贴先校验结构，所有本地路径及内部编号均核对来源文档实际持有的引用，再按目标会话转换资源。自动共享上传只读取应用 `resources`、`remote-resources` 及当前文档的协作资产目录，真实路径校验拒绝私有文件、越界路径与符号链接逃逸；其他路径需经文件上传入口导入。存量 `tau-collab-local:` 仍经所属会话解析，打开或整篇替换本机正文时把可读取的缓存文件转存 `resources/collaboration/`；普通投影保存同样保全文件，缺失编号保持原值。`collaboration/` 不经本地 HTTP 静态服务公开，媒体预览通过文件 IPC 读取后生成 Blob 地址。

本地上传返回 `~/.editor/resources/...` 形式的引用，目录分隔符固定为 `/`。图片与行内图片的 Markdown 导入、导出，以及桌面媒体和协作资源的路径解析共用 `@tau/shared/resource-path`：规范 Windows 本地路径，并修复旧引用 `~.editor/...` 缺失的主目录分隔符；带协议的资源地址保持原样。存量正文在读取时兼容，不执行整库改写；Markdown 再保存时输出规范引用。

会话正文读取将可解析的附件引用转为本机路径；附件未下载、仅在其他设备上或路径解析失败时，保留原引用，不阻断正文读取、再次打开和文本索引。仅本机附件在当前设备缺失时仍可编辑、保存正文。资源组件独立处理加载失败，读取过程不删除节点、不改写会话原引用；实际请求附件文件的命令仍返回资源不可用错误。

**标准 fetch**：插件经 `@tau/plugins` 的 `context.fetch`，其他桌面调用用 `commands/fetch` 的 desktopFetch——原生 fetch 类型（RequestInit/Headers/FormData/AbortSignal → Response），无兼容层。两端复用内部 `@tau/plugins/fetch-bridge`，上传按最多 256 KiB 分块并等待背压，响应按需读取；该入口不进入作者 tarball。fetch 模块为 BACKGROUND（ensureModule 保证就绪）：主进程原生执行，内部 IPC 支持上传/响应流与取消并恢复 URL、redirected、type 与完整响应头；请求属于发起窗口，窗口销毁或导航回收。执行环境是宿主 Node，不自动继承页面 Cookie/CORS（显式 Cookie/Referer 与 Set-Cookie 须保留）；业务自行决定认证与状态处理。

数据库、资源及会话文件同步的对象布局、校验、发布和首次使用边界见[宿主分块同步](/docs/architecture/storage-sync.md)。

同步设置的手动下载与启动自动下载共用命令层 `onProgress`，在分块校验写入后推进进度；设置数据库卡和下载确认框通过公共 `ProgressStatus` 展示百分比、数据库已处理大小、对话记录完成数及安装阶段。上传与下载共用忙态，下载期间禁用再次同步、检查和服务切换；维护重连完成后才报告下载完成。计数口径见[分块传输与重试](/docs/architecture/storage-sync.md#分块传输与重试)。

## 插件业务数据与授权

**读取**：`context.data`（cards / articles / documents 的 `get`/`query`，todos / calendar 的 `query`）与 `context.content.read` 由 `app/plugins/data.ts` 适配，命令经 `bindDatabaseCommands` 固定到 Provider 创建宿主时的库并带实例 signal。卡片、文章、项目文档走主进程只读表 `tables/plugin-data.ts`（统一投影、「排序时间:ID」游标分页、上限 200 条，引用型项目条目不计）；待办与日程复用 `task-assistant:read`。ID 与 ContentRef（正文 ID + 创建时间）对插件不透明，IPC 契约在 `types/plugin-data.ts`。Notebook、材料与对话只读，走 `tables/plugin-data-readonly.ts` 直接返回 SDK 形状：Notebook 只给信息与资料清单（不含说明、本机路径、转换文字、笔记与测验）；材料三表合并分页、标题与出处复用 `MaterialTable.resolve`（软删除划线与已删 PDF 的标注不可见）；对话只给 `chat_session` 四场景信息，不读 pi 会话文件。

**权限**：manifest `permissions` 是申请上限（客户端丢弃未知值、门户严格）；PluginHost 先拒绝未声明调用，再经 `PermissionsAdapter.ensure` 询问；正文读取需任一所属实体的读取权限，无所属实体按不存在处理。`DesktopPermissionBroker` 按工作区创建：「始终允许 / 已阻止」由 BACKGROUND 模块存 `userData/plugin-permissions.json`（按插件 × 工作区，卸载清除），「仅这次」属于当前激活实例，连续拒绝 3 次转已阻止；窗口不在前台不弹窗，请求排队进 `usePluginPermissionUi.pending`（侧栏 `plugin-status` 徽标，详情页「权限」页签处理）。调用计数 5 秒批量写入。弹窗一次显示队首、同插件排队合并，关闭即拒绝；插件与应用同环境执行，文案如实说明可联网，不得描述为安全隔离。私有存储的授权范围由宿主绑定，不由 SQL 表名前缀自行约定；公共实体写入同时检查插件来源、用户授予的资源范围与领域约束——参数合法不代表业务授权合法，事务也不能扩大授权范围。

**写入**：卡片/文章的 create、update、delete，项目文档的 update，正文 `content.edit` 走 `plugin-data:create / update / delete / edit-content`；白板与项目走 `plugin-data:query / get / create / update`（新建白板带一张 emptyWhiteboardPage，修改只走 `updateWhiteboardMeta` 不碰画板页；项目新建为空项目、修改经 `updateProject` 保留目录），两者无写入广播，渲染端写入后按 `["whiteboards"]`/`["projects"]` 失效本窗口。项目目录 `plugin-data:project-tree`（逐层批量读、去重防环、最多 5000 节点、多处挂载多处列出）；`documents.create` 走异步命令（正文经 `resolvePluginContent`，`shareOf` 核对来源后以 contentId 共用正文——一份正文已有卡片或未删除文章时拒绝）；`documents.move` 换算为 `moveProjectTreeItem` 参数并复用其校验。主进程复用 `CardTable`/`ArticleTable`/`ProjectTable` 与 `ContentTable.updateContent`（正文带 revision 乐观锁），过期抛 `PLUGIN_CONFLICT:`，渲染端转 `PluginConflictError`。卡片/文章写入 `broadcastAll` 广播并失效 `["articles"]`；待办与日程映射到 `task-assistant:preflight → write`（conversationKey `plugin:<id>`）。删除可恢复：卡片/文章/白板/项目/插件实体删除前写 `plugin_operations` 快照、正文 `releaseDeferred`（7 天宽限），`plugin-data:restore` 原 ID 未占用时沿用；项目文档删除记 `placements` 从所有挂载处摘除、恢复只挂回仍存在的位置。插件对正文的修改是会话外写入，不进编辑器 UndoManager。

**待办与日程完整数据**：`DataAdapter.schedule` 承载目录与稳定身份读取，既有 todos/calendar 方法补齐字段。目录由 `TodoGroupTable` / `CalendarTable` 提供轻量单项和批量元数据页，不加载正文；task-assistant `catalog.ts` 只处理游标、公开字段与版本，不逐项回查。写入资格的领域错误转换位于 `directory-access.ts`，公共日期/版本工具不导入表模块。日历数据层提供递归的用户可写日历判定，目录、助理写入和备注资格检查复用同一入口；UI 既有目录展示口径独立保留。stored 日程的 ID 键集页由 `CalendarEventTable.listEventIds` 提供，上层组合日程读模型，不依赖日期窗口、不混入虚拟实例。待办投影包含清单、完整提醒、重复分段/实例及可写性；独立待办支持偏移提醒，正文普通待办支持绝对单提醒、重复待办支持当日零点偏移单提醒。根系列的 completed 固定 false，状态属于实例，不随日期变化暗中切换。日程投影包含提醒、备注句柄和来源种类。备注 owner 使用 calendar:read/write，创建内容先通过正文执行器准备，ensureNotes 显式建立缺失的空正文；编辑复用正文条件操作，系统日历不能借正文入口写入。备注编辑与元数据事务分开，不承诺跨调用原子提交。

**目录写入**：`DataAdapter.directoryWrites` 承载 todo-list/calendar 的创建与局部修改，经 `data-directory:write` 复用当前资料库绑定；目录领域协调器只组合 TodoGroupTable/CalendarTable、目录投影和通用回执表，不另写目录 SQL。可编辑资格 editable 与内容 writable 分开，归档用户目录仍可改名，系统目录及系统日历分组后代拒绝。名称、色板、空 patch 与未知字段由共享契约校验。短 IMMEDIATE 事务中核对创建身份、摘要 revision 和资格；无操作不写库，修改保留描述、分组、排序与其他未指定字段。清单改名同事务保存曾用名，正文显式绑定和旧名称解析保持归属；正文重写沿既有条件提交与恢复。通用创建回执支持四域，旧约束表在开库事务内保数据升级，删除永久退役；共享日志与业务提交，色彩和无操作不触发全库正文扇出。

**重复与正文任务**：`DataAdapter.todoRecurrence` 承载重复创建/修改与实例状态写入、持久状态分页。规则和状态仍经 task-assistant engine，复用快照、条件检查与正文耐久提交；原子补丁由共享 patchOccurrenceState 定义，不在适配层连调多个动作。`occurrences.ts` 按原始日期直接读取实例，跳过/改期不借展示查询定位，规则失效返回不存在。分页只枚举已存状态，绑定原库、插件、授权及根 revision，页间变化报冲突；独立任务根 revision 沿用完整语义快照，正文分页沿用正文读取边界。正文任务版本包含解析后的标题、清单与日期，提交事务内再次核对版本和目标清单；目录资格改变不能沿用旧版本覆盖。状态页按有限原始日期准备节假日资料，准备期间数据改变时报冲突，资料缺失不猜测 active。正文来源可见性由 document-access 与既有来源/设置入口处理，插件写入不能修改已排除或提升的任务，内部撤销/恢复仍保留底层读取。

正文可靠身份由主库 document_task_identities 保存，不复制业务正文。共享 53_document_task_changes SQL 从整篇/变动块提取身份，与主库投影、日志原子提交；存储切换、源持有、排除/提升及可写性相关变更都能捕获。初始化按批保存进度，主库结构丢失后重建前切换目录代次；解析失败保留旧身份并拒绝正文检查点。页面 doc_tasks 索引可以独立删除重建，不影响变化流。todoSource 缺省 todo，可选 document/all；混合快照只各取有界数字键页合并，排序不使用公开字符串别名。含正文游标额外绑定目录代次，旧宿主未回传所支持来源时 SDK 拒绝成功结果。

**业务变化读取**：`data.changes.query` 经 SDK 的共用状态机与 `DataAdapter.readChanges` 接到 data-changes:read，复用当前库绑定。`tables/data-changes.ts` 负责跨域身份键集扫描、日志范围读取和有界清理，全部水位/身份页在同一短事务取得，不加载正文。共享 schema 的持久触发器将独立待办、真实日程及目录的业务变化、关联、提醒和备注投影记到 data_change_log，回滚同步回滚；状态表保存协议和清理边界。TEMP 触发器只唤醒对象通知读取，不承载可靠历史。首次记 W0，扫描完补偿至固定 W1 后才返回 checkpoint；增量固定本轮上界，空页也推进正确水位，允许重复和读取当前较新状态。

游标绑定域集合、插件声明的读取范围、本机工作区变更代次与持久授权修订。工作区登记在本机保存 changeEpoch/fileIdentity，替换关闭、下载重连和不可证明连续性的强制重连先持久失效；文件身份改变也更新代次，正常重启保留。授权修订独立于用量统计。SDK 读取前后复验权限并监听调用期间的授权变化；范围、作用域、协议或保留历史失效时明确 reset-required，不返回假空结果。日志初始预算最近十万序号，保留预算在共享状态表中统一定义，追加触发器在无人读取时也执行清理，清理与边界同业务事务；不提供历史正文、多设备租约或第三方协议。

**版本与创建请求**：领域 revision 使用规范化业务状态，追加提醒、备注当前正文状态纳入判断，排序与落库时间不改变待办业务版本。正文会话使用权威修订，旧正文的插件版本使用内容摘要，冷写在事务内校验该摘要。撤销快照保留完整行与追加提醒，恢复首条后再恢复完整追加集合，并拒绝覆盖后续提醒修改。SDK 为显式 requestId 生成原始输入摘要，两端把插件身份与请求 ID 隔离；`plugin_create_receipts` 同创建事务保存当前结果身份，重试重读当前对象，与短期 task-assistant 回执分离。删除触发器永久标记原请求失效；清除插件数据时清回执。该机制是通用业务创建防重，不处理第三方协议或多设备租约。

**正文输入**：SDK `PluginContentInput`（`markdown` / `nodes` / `copyOf`）由主进程 `resolvePluginContent` 统一解析——Markdown 经 `content-conversion`；`nodes` 用 `assertContentNodes` 复核后原样写入（未知节点按 ER-006 保留，不做类型白名单）；`copyOf` 只接受卡片/文章/项目文档/插件实体持有的正文并深拷贝（有会话取会话内容）；文档待办 taskId 由 doc-tasks 索引写入后统一补齐。

**关联与打开**：`context.app.pick` 写入 `usePluginPickerUi`，壳层 `PluginEntityPickerHost` 复用 `EntityPicker`（`entity:search`，候选带 createdAt 转成一致 ID）；`context.app.open` 先经 `plugin-refs:exists` 核对（待办、日程、正文待办同时核对创建时间）再按类型打开（正文待办经 `entity:locate` 带 `at: {taskId}`）；两者要求 `navigator.userActivation.isActive`，不需数据权限。引用类型含 `project` / `notebook` / `material`（划线/PDF 标注/剪藏）/ `chat-session` / `plugin-entity`；选择后先 `plugin-refs:grant` 登记到主库 `plugin_ref_grants`（编号复用时授权不落到新内容）；`context.app.describe` 只按已获准权限给标题，其余 denied 不透露是否存在。SDK `EntityRef` 视图在 `app/plugins/entity-ref-view.tsx`（同轮渲染合并一次 describe）；卸载清数据时 `plugin-refs:clear`。

**正文组件与媒体**：SDK `ContentEditor` / `ContentPreview` 为占位，`app/plugins/content-components.tsx` 经 `configureContentComponents` 注入，重组件按需加载；`resolvePluginContentTarget` 由 ContentRef 得到正文 ID、所属实体与快照，编辑器交给桌面 `ContentEditor`，预览只读渲染前 N 块随 `content:updated` 重读。媒体组件（`useResource` / `MediaImage` 等）经 `configureMedia` 注入：解析与内置 Local* 共用 `utils/mediaSource.ts`（远程缓存策略按类型：图片音频取设置、视频始终缓存），上传取作用域 `IResourceService.upload`，只读编辑器返回 undefined；发布站由 `packages/blog` 的 media-runtime 并入（地址原样、不提供上传）。节点资源只看 `ElementSpec.resources` 声明（`@tau/db-schema/content-resources`），宿主不按字段名推断；内容插件的声明按库写 `plugin_element_resources`，协作投影补写文档 `resources` 映射，上传与校验只按文档携带的声明。插件块能力（`useElement` / `useMediaViewer` / `BlockToolbar*`）由 `@tau/plugins/source-editor-host` 注入编辑器 `elementRuntime`，`ElementSpec.frame` 由内核外框实现。

**宿主动作**：`context.app.run` 先解析正文与实体标题——导出走既有导出函数或壳层 `PluginContentActionHost`（复用 ContentExportModal / PdfExportModal / EpubExportModal、PresentationMode、ContentCollaborationControl）；`card.create` / `project.insertDocument` 把插件正文输入解析为节点后打开与宿主同一个 `CreateCardDialog` / `InsertNoteToTreeModal`（预填模式不读写草稿，保存后交还 `{kind, id}`）；`notebook.create` 经 `plugin-refs:notebook-plan` 换算资料计划，与问题「以此立项」共用 `services/notebook-creation.ts`；`chat.start` 不走动作界面，把 context 换成 MentionRef 交给 `features/chat/chatStart.ts` 的 `startChat`，对话页/停靠栏经 `useChatStartConsumer` 认领并预填（等输入框就绪），不替用户发送。`open` 第三参数 `{placement, at?}` 经 PluginHost 校验（窗口只开有正文内容、停靠栏只开主对话、不与窗口同用）。请求经 `showAction` 统一承载：界面关闭或 signal 取消后 `run` 才返回；同时只显示一个请求，已有界面打开时新请求报错不替换。

**插件实体 / 记录 / 关联**：实体存主库 `plugin_entities`（按插件 ID 隔离，每项一份正文并持有引用，创建为异步命令、初始正文经 `resolvePluginContent`）；记录存 `plugin_records`（集合声明只在 PluginHost 内存，写入时带给主进程核对，ID 由 PluginHost 生成）；关联存 `plugin_links`（from 为实体、to 为插件引用带 `to_created_at` 供脉络判编号复用）。查询与计数先按类型声明的 `indexes` 校验（`@tau/plugins/query`），主进程 `tables/plugin-query.ts` 拼 SQL：索引字段经 `json_type` 守卫后 `json_extract`，键集游标 = 排序值 + 查询指纹。孤儿处理共用 `adoptPluginData` / `markOrphans`：`~/.editor/plugins` 缺失记 `orphaned_time`，重新出现或再读写即撤销，超宽限期删除并延迟释放正文。来源实体删除先删出边再删实体（事件仍能读到类型）。实体模块只依赖行级的 `tables/plugin-link-rows.ts`，不要导入 `plugin-links.ts`（依赖链会拉进待办文档模块）。

**原子提交**：`context.transaction` 由 PluginHost 在渲染端缓冲（每条按单独调用规则校验），回调结束经 `plugin-transaction:commit` 在一个 `db.transaction` 里按顺序执行各表同一套方法，任一抛错整体回滚；事务里新建实体 ID 经 `plugin-entities:reserve-id` 预留（推进不复用序列，未提交作废）。新增写入类型须同时加 `PluginTransactionOp`、`PluginTransactionCommitOp` 与 `PluginTransactionTable.apply`。

**搜索 / @ / 反链**：索引类型 `plugin-entity` 走与卡片相同的全文/向量/详情链路（含已停用与宽限期内容）；新增索引类型须同时改 `IndexType`、共享 `entity-ref`、`MAIN_CONTENT_INDEX_TYPES`、`index-candidates`、全文队列分组、`fts.ts`、`search-details.ts`、`EntitySearchTable` 与 `openEntity`。检索结果标签与打开只读 `services/plugin-entity-kinds.ts` 运行时登记表：已登记按声明推导 push 插件页面（`at` 并入页面参数不参与实例身份），未登记开只读页；搜索面板对 plugin-entity 不设范围 chip。MentionPanel 经 `isMentionableResult` 过滤（插件运行中且声明 mentionable）；`context.entities.backlinks` 先核对归属再取被引用，PluginHost 按已获准权限过滤不弹窗。

**类型外观**：类型名 + 图标存主库 `plugin_entity_kinds`（图标渲染成单个 SVG 文本，注销不删除，开库维护清理已卸载且无内容的）；显示一律经 `components/EntityKind` 的 `useEntityKindMeta`（`plugin-entities:owners` 同轮合并），列表用 `useEntityKindMetaResolver(refs)` 一次取齐，组件外用 `loadPluginEntityAppearances`；插件图标只作 CSS `mask-image` + currentColor。新增展示内容类型的地方必须经此解析，不得写死「插件内容」。

**私有存储**：主库 `plugin_kv`（单值上限 1 MB）；启动不扫描或导入旧 localStorage 数据。卸载清除数据时删本库 `plugin_kv`，插件内容仍走 7 天宽限。

**业务事件**：BACKGROUND 模块 `domain-events` 在每个主库连接注册 `tau_domain_change` 与 TEMP 触发器（`rowTriggers` 规格表生成，覆盖 cards、articles（软删）、非引用型 project_item、white_boards、project、Notebook（资料增删计入）、材料三表、插件可见场景的 chat_session、plugin_entities（软删口径）、contents.content）。规格的 `changed` 列限定修改触发的列——查看状态类写入（打开时间、当前页、转换进度）不发事件；新增表须按对插件可见字段列出。按库合并 500ms（最长 2 秒）广播 `domain-events`；正文修改经 `locateAll` 计入所属实体 updated，日记正文在提交后另向全部窗口广播 `diary:changed`，不扩展插件公开事件；触发器在事务内将事实写入连接私有 TEMP 队列，回滚同步清理；队列在提交后短事务读取，正文归属也在提交后查询。事件不携带完整数据。渲染端 `app/plugins/events.ts` 按库过滤，`entity.*` 只交给 owner 插件，其余按类型与已获准权限串行投递。事件来源：同步写入经 `writeAsPlugin` 标记插件 ID，协作投影延迟落库按 `markContentOrigin` 登记 5 秒。 待办、持久日程及两类目录使用相同 `<对象>.created/updated/deleted`，ID 与 get 一致；动作由共享 data_change_log.action 捕获，后置补齐关联 updated/delete，历史行保持未知。data-change-events 表入口分页读取已提交日志，未知动作或保留断档发 workspace.reset；其他连接提交经水位轮询补获。每页有界让出执行，不退化为无 ID 通知。四域不提供精确 origin，保持 app。所有公开订阅只经过 context.events.on 的对象动作事件，资料库重置为例外。

问题管理只由用户安装的插件提供，启动不探测旧问题表、不自动安装迁移目标，也不转换旧问题、洞见状态或首页布局。

## 插件中心与管理

- 插件中心与已安装管理是独立页面：`plugins.page.tsx`（参数 tab = discover / installed / updates）与 `plugin-detail.page.tsx`（match params 按 pluginId 去重，tab = readme / settings / changelog / versions / community，`section` 定位设置分组）。侧栏「插件」入口在设置上方，命令面板自动收录；设置弹窗不含插件分区（`SettingsLocation` 不含 plugins）。停用插件仍能打开详情并重新启用。
- 目录/详情/下载经主进程 plugin-local（`plugin-local:catalog / release / stage-release / uninstall / relaunch`，`net.fetch`，门户 CORS 不放行客户端）；渲染端 react-query 目录键 `["plugins","catalog",q,sort]` 60 秒新鲜期，离线显示重试空态不回退演示数据。ZIP 安装允许包内附带未声明的普通文件（随包保存不加载），条目仍查安全路径/链接/覆盖冲突/容量与摘要。安装 = 下载 → 核对大小与 SHA-256 → 可恢复事务立即提交；**插件中心首次安装即启用**（事务提交后写入启用意图，内容插件随下次完整重启进入快照），ZIP 与手动放入目录的新包默认停用；来源（中心 releaseId 等）随事务写入 `plugin-updates/sources/`，更新与恢复保留启用意图，同 ID 不跨来源接管。普通插件即时启停与更新；涉及已加载内容快照时更新保留暂存并提示重启。安装/更新 mutation 共用 `["plugins","install-release"]` 键，各 `InstallButton` 按 releaseId 从 mutation 缓存读进度与失败；「更新」标签的「全部更新」对所有可更新项并行发起下载，主进程 `PluginUpdates` 串行落盘；可更新判定为 `model.ts` 的 `availableUpdates`，侧栏「插件」入口的 `plugin-status` 徽标与之同源（待授权数 + ↑可更新数，复用目录查询缓存）。卸载 `LocalPluginManager.uninstall(id, purgeData)`：先停用、删包/备份/来源、清启用偏好，purgeData 时清所有工作区私有数据；内置插件不可卸载。
- 兼容与升级：`readPluginPackage` 检查桌面清单的 minAppVersion 或统一目标清单的 targets.desktop 最低版本（0.58.0 起，固定目录扫描与安装共用）；plugin-local 初始化时恢复中断事务、应用暂存包再注册 IPC；安装/更新/恢复先暂存校验再同事务提交；提交后广播 `plugin-local:state-changed`，窗口重扫并串行切换实例。根目录 `~/.editor/plugins`，事务与备份在同级 plugin-updates；文件恢复不回退私有数据，激活失败尝试恢复旧内存快照。
- 版本与文档：安装状态机与来源判定是 `features/plugins/model.ts` 纯函数；版本标签合并中心全部已发布版本（`plugin-local:versions` 翻页）与本机当前/待生效/备份。README/CHANGELOG 用 `PluginMarkdown`（只读 Editor，内容经 `toPluginDocument` 白名单过滤——原始 HTML 丢弃、图片音视频不加载、插件块按代码块、链接只留 http(s) 交系统浏览器）。Markdown 导入先按 `ignoreTypes` 递归过滤整棵语法树再转换（不为类型加特例）；资料转换用内置组合（`utils/markdown-composition.ts`），所有语言围栏统一展示源码，不调用插件导入函数、不维护节点黑名单。
- 社区（C28）：详情 `community` 标签仅选中时读取（每页 20 条，写入后失效该插件查询）；IPC 归 plugin-local，复用安装级匿名凭证（渲染端只收 liked/canDelete 不收 token）；评论草稿在标签内存保存，失败重试不重复发表；网站与桌面身份独立，清数据后无法恢复旧身份管理权。
- 固定目录发现：开发/正式构建均经 BACKGROUND 的 plugin-local 扫描 `PathUtil.getAppDir()/plugins` 直接子目录（目录名须等于 manifest.id，坏包单独显示不阻断好包）；插件页 ⋯ 菜单提供「从 ZIP 安装 / 打开插件目录 / 重新扫描」，无目录选择。`app/plugins/package-loader` 把静态元信息登记为延迟定义，启用才执行 CJS 入口；LocalPluginManager 复用此加载器与正式 PluginHost，本地插件偏好镜像为应用级键；启用意图由主进程写入（中心安装即启用，其余新包停用），重启/切库恢复；活动包变化先回收旧实例登记新定义再按原意图恢复；内容快照与 restart-required 身份不热替换。
- **生命周期与异常**：激活等待最多 10 秒；停用立即取消 signal，未决激活最多再等 5 秒；deactivate 与逆序清理共用 5 秒预算，超时继续剩余清理；普通失败且清理成功可重试，激活超时或清理失败进 restart-required（管理页显示重启提示并禁用启用）。DesktopPluginProvider 在窗口内保存需重启的插件 ID，等旧宿主有界收尾后才建新宿主（注销/切库不能绕过，不落盘）；超时只能结束等待，不能抢占同步死循环。
- **本机工作区身份**：`services/plugin-registry.ts` 在 userData 按本机规范化库名分配 UUID（串行暂存写再 rename，只存 name 与 id），plugin-local 与 plugin-backend 共用；这是本机槽位身份不是同步身份——同步替换/重建同名库沿用。PluginProvider 直接按稳定工作区身份初始化，私有存储连接当前库。

## 插件贡献位

- **侧边栏**：`context.sidebar.registerGroup/registerItem` 关联本次启用的页面句柄；SDK 暴露 daily/knowledge/learning/ai/sharing/plugins 稳定分组 ID，`composeNavSections` 合并静态与动态贡献（缺省/未知分组回落「插件」，空分组隐藏）。条目用现有 Sidebar 按钮与折叠逻辑，点击沿页面句柄导航，高亮匹配 pluginId/pageId/instanceId；折叠偏好内置组按 label、自建组按命名空间 ID 保存。`registerItem` 可选 SVG 图标组件（currentColor，统一 size/strokeWidth，未提供回落 Plug）；句柄 `update({ badge, children, action })` 经 SDK 校验冻结、PluginHost 包装 assertActive——角标高频更新只重渲染 `app/PluginNavEntry.tsx` 单条目不触发整个 Sidebar。子项展开规则：条目页面在栈顶或当前页参数含某子项 params 时展开；右键菜单最多 8 条（危险项前加分隔）；拖拽类型加插件命名空间（`application/x-tau-plugin.<pluginId>.<type>`），宿主与其他插件的拖拽落不到插件子项；回调抛错只弹 appNotify。
- **设置**：`context.settings.register(...).open()` 接 `navigator.push("plugin-detail", { pluginId, tab: "settings", section })`，设置组件只在插件启用且详情页挂载时渲染；自定义设置收拢为详情页「设置」标签的分组，`plugin:<pluginId>:<sectionId>` 精确定位；停用保留宿主管理、组件退出，重新启用恢复；分组单项注销显示不可用。保存用 `context.storage`，即时保存/失败重试/signal 校验规则不变。
- **对象动作**：`context.actions.register` 经 PluginHost 包装（assertActive），runtime 以 `plugin:<pluginId>:<id>` 登记，`runAction` 先 `grantRefs` 把对象登记为插件选择过的引用。菜单渲染收口 `app/plugins/action-menu.tsx`：手写菜单放 `<PluginActionMenuItems target />`（内置项之后、删除分隔线之前——卡片 CardActionMenu/CardDetailView、文章 ArticleItemOps/ArticleDetailView）；数据驱动菜单用 `usePluginActions` + `insertPluginActionEntries`（key 前缀 `plugin-action:`）——项目文档目标由 `projectItemActionTarget` 决定（普通文档 document、引用型条目为被引用的卡片/文章），文档树行与网页剪藏共用 `usePluginMenuEntries(target)`（剪藏目标 `material web-clip:<id>`）；只有图标按钮的地方用 `PluginActionsMenu`（PDF 标注浮动工具条经 FloatToolbar extra 槽、标注列表悬停组末尾，目标 `material pdf-annotation:<id>`）；对话消息经 `@tau/chat-ui` MessageView 的 `renderExtraActions(text)`（删除之前），`MessageItem` 收到 `pluginSessionId`（四个插件可见场景）且有 piEntryIds 时才列；`text` 目标在命令面板「记录」组末尾每动作一行（副标题「来自插件名」），文字不登记引用。编辑器选区不经对象动作（归插件编辑器扩展，选区工具条不开放）；独立编辑窗口无插件运行时自然不列。新增菜单照此放置，不在业务域直接读 runtime。
- **详情区块**：`context.views.registerEntityPanel` 以 `plugin:<pluginId>:<id>` 登记，渲染收口 `app/plugins/entity-panels.tsx` 的 `<PluginEntityPanels target />`——放在三个详情页洞见报告之后、正文之前，每块包 RecoverableBoundary（resetKeys 为目标）/UiProvider/PluginComponentScope，`empty:hidden` 不占位，key 用 mountId（换对象只换 target 不重挂）；宿主不加外框标题，不因挂载自动登记引用或放宽权限。
- **正文文字装饰**：桌面主窗口通过 `context.textDecorations` 按工作区和来源读取权限注册提供方。ContentEditor 仅对包含可装饰正文的顶层块注册 DOM 观察并按视口调度，代码块等独立内容块及空块直接跳过，避免按需加载期间读取尚未挂载的 DOM；将同一块内连续的文本叶子合并后请求范围，再映射回 Slate 路径。编辑器渲染缓存的临时范围，外观（`reference`/`ghost`/`marker`/`tint`/`wavy`/`dot`）与色调由 `apps/desktop/src/app/text-decorations.css` 按主题 token 绘制，点线和荧光笔走背景以免覆盖用户的下划线和删除线；第一版的 `link`/`highlight` 在登记处映射为 `reference`/`marker`。`TextDecorationLayer` 统一绘制悬停提示、⌘/Ctrl 显形、处理中状态和 `onActivate` 返回的同名候选菜单。可选的 `getPreview` 以相同命中键及候选键返回实体引用和块位置，停留后经当前库的数据适配器与目标读取权限加载只读 content-link 预览。内容预览按触发文字上下的可用空间选侧并限制高度，正文在浮层内滚动。候选预览在菜单外定位，不参与候选列表的高度计算。块被替换、来源失效、撤权或工作区回收时取消旧请求，点击前复核授权。作者用法见[编辑器交互](/plugins/tau-plugin-template/docs/editor-interactions.md)。

- **编辑器扩展**：作者用 `defineEditorExtension/defineEditorElement` 定义节点、命令、热键与菜单，通过插件定义的 editorExtensions 静态装配；编解码和统计分别由 editorCodecs、editorMetrics 提供。SDK 不提供动态编辑器注册接口，也不保留开发台的实验编辑器或运行期贡献会话。正式装配与启停边界见本篇「静态内容插件」。

正文任务的公开身份组件对实例分隔符、换行和保留前缀采用独立版本标记的可逆 UTF-8 编码；普通 UUID 保持原样。共享 taskKey、SQLite 日志/快照、手机原生 DTO/选择器以及桌面读取/打开/引用检查使用同一协议，正文 taskId 本身不改写。
