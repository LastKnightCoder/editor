# 白板

> 画布、扩展装配与文档会话保存屏障；协作协议见 [collaboration.md](/docs/architecture/collaboration.md)。

## 对话中编辑当前页

桌面白板详情和单页画布在布局 effect 内注册当前视图专属的读写工具。主对话发送时捕获该作用域；停驻、换页或卸载会释放工具并取消未提交调用。读操作绑定库、页和视图，投影视口、选区、有限数量的元素和简单文字。写操作经过 pi 写入权限与原窗口租约，在主进程白板队列中校验候选、匹配字段前提并提交。创建、文字、移动、连线与显式删除共用耐久提交及广播，Agent 更新以外部来源进入画布。请求身份与语义摘要进入日志批次键；同一请求重试用原修订和稳定元素 ID 回复。

Agent 的在场提示由主进程按白板代次定向推给本机持有者，画布按页显示姓名和目标；它与网络成员合并展示，运行结束、视图释放或超时即清理。本机保存、远端确认分别回报。

## Whiteboard 公共画布与扩展装配

缩放统一由 InteractionManager/ResizingState 管理，ResizeCircle/useResize 与分栏侧边手柄只发起手势，不再各自监听 document 或保留节流尾调用。保留原几何/吸附算法，预览只收集同步字段变化，完成经 Board.recordHistory 同一入口提交单个历史分组；取消/失活/只读/销毁回退自身字段，删除或冲突更新先终止手势，无关字段修改不回滚。不得为插件再建立一套缩放历史或复制 CommonPlugin。

第三方创建工具可声明 panel，在「扩展工具」内先选参数，再经 run(payload) 激活；返回、关闭、错误边界和迟到回调由宿主处理。DesktopWhiteboard 经 extensionServices 为每个已校验插件的扩展派生子服务注册表，IPluginStorage 复用 PluginHost 当前激活上下文的 storage；按插件与工作区隔离，不暴露整个 PluginContext。画布失活/销毁/只读、切库、插件失活及激活实例替换时拒绝旧交互；静态渲染与缩略图仍不依赖 activate。公开 SketchPopover 与内置单选属性栏共用实现，公共作者类型依赖图继续禁止 Board/CommonPlugin。

元素 interaction 声明控制宿主角点/边点和矩形箭头连接，内部 ElementInteraction 复用 CommonPlugin，隔离导出不挂载交互层。presentation 供图层名称/图标/搜索统一使用；sketch:true 与 useSketch/SketchPaths/纯 sketch 原语复用现有画风；schematic 从静态定义投影既有 SchematicShape，DesktopPageSchematic 统一连接列表/选择器/引用卡片的启动定义目录，导出弹窗使用当前 Board 目录。缩略图不创建隐藏 Board、不运行 activate；完整导出仍使用实际画布。人物专属逻辑已在 C25 M4 退出宿主，只存在于独立插件；不做旧火柴人格式兼容。

插件定义以 whiteboardExtensions 提供静态扩展，格式 3 清单不再重复声明白板标记；作者只从 @tau/plugins/whiteboard 取受控 API，不导入 Board/CommonPlugin。元素定义统一放 WhiteboardExtension.elements，create(api) 只返回每个画布的交互贡献，动态返回 elements 明确拒绝并清理。ContentPluginRegistry 聚合静态白板目录，DesktopWhiteboard 从同一启动快照装配，启停/更新重启生效；沿用现有主进程偏好文件，不新建一份白板启用存储。博客发布上下文只筛选编辑器贡献，不因白板单独启停阻断。

公开数据类型位于 types/element.ts、containment.ts 等纯类型文件，extensions/api.ts 与 events.ts 直接依赖它们。types/board.ts 保留内部 Board/IBoardPlugin，仅重新导出同一份元素类型供内部消费者使用，不重复定义数据；作者子入口的含类型依赖图由 check-whiteboard-boundaries.mjs 检查，禁止进入内核和编辑器实现。火柴人作为独立插件从中心安装，不默认随客户端提供。白板核心不携带人物代码；相关发布包只保留在tests/fixtures/plugins做集成测试。博客发布仍只收集编辑器贡献，不额外增加移动端/扩展端白板插件支持。

通用白板归 `@tau/whiteboard`：根入口提供画布、受控 API 和通用组件，`/extensions` 提供扩展工厂，CSS 使用 `styles.css`。WhiteBoard 必须显式传稳定的 extensions；元素、工具、命令、属性面板、导入与界面层由扩展贡献，核心运行时不加载 Slate、EditorKit、Markdown 或截图实现。桌面入口统一使用 `features/shared/whiteboard/DesktopWhiteboard`；白板域负责列表、多页管理与查询；托管白板通过文档会话提交增量，离页 flush 失败必须拒绝，依赖保存的页面复制中止；旧快照拒绝打开。拖动/连续移动的手势帧不触发 onChange（宿主落库防抖不被高频重置），手势结束统一补发一次最终快照；仅选区变化（点选/框选）同样不触发 onChange（视口变化仍通知，停顿后落库一次以记住视图位置）。元素级选中态经 useSelectState 按元素 id 布尔订阅 selection:change（通知侧短路，未翻转不重渲），只关心缩放的组件经 useZoom 订阅 viewport:change（纯平移零重渲），静态元素层独立 memo，截图树的选区隔离由 useBoardCapture 在树根挂 StaticSelectionContext。视口剔除保持精确盒（不量化扩边），元素渲染统一经 memo 的 ElementHost 包装（按 element 引用与子元素集合浅比较，剔除/分层每帧重建包装时未变子树整体 bail out），剔除追赶经 useDeferredValue 低优先级执行、紧急渲染只更新 viewBox。全库列表接口返回投影数据（剔除媒体地址与选区，保留示意图所需结构），画布保存后就地 patch 列表缓存中该页的元素数与更新时间、不失效整表重拉；打开画布始终走单页全量通道。

本机未共享白板的元素拖动即时更新画布预览。间隔不足 150 ms 的移动合并提交，持续拖动最迟在 500 ms 安排一次中间提交，松手提交终点。共享白板沿用实时手势间隔。单张顶层文档卡的最终几何与屏上预览一致且只发生该笔平移时，沿用已显示的连线与卡片投影；观察者附加写入则重读权威投影。保存摘要只读取标题和可见页数。发送端收到与正在追加批次完全相同的字节时处理修订回执，其他增量经模型接纳。

每个 Board 创建独立扩展运行时和脑图预览状态；宿主能力经服务注册表注入：DesktopWhiteboard 用 `createServiceRegistry` 注册 `IWhiteboardRichText`、`IResourceService`、`IMediaInfoService`、`IDownloadService`（随数据库重建）并经 `WhiteBoard` 的 `services` 传入，扩展直接通过 getService/tryGetService 获取（必需服务缺失抛错，可缺省服务返回 undefined），不再维护依赖表，不恢复全局 services/slots 集合；导出截图与业务弹窗等纯 UI 配置仍为工厂参数。正文编辑、低缩放订阅与测量使用富文本服务提供的同一套 Kit/文档绑定。包外 useBoard 返回受控 API，快照不可写且按对象身份共享副本，不公开历史栈和插件实例。桌面命令固定初始数据库；异步提交在只读切换、隐藏、卸载或目标删除后失效。Activity 暂停 activate 副作用，真正卸载时 dispose 并销毁 Board。

隐藏时取消临时指针和键盘手势、计时器与吸附反馈，保留画布与历史。指针按发起实例和 pointerId 路由到释放或取消，跨实例移动不转移手势归属；结束事件在捕获阶段收尾，避免被其他控件的 stopPropagation 拦截，同次事件只收尾一次，隐藏/卸载清理归属。取消脑图笔记关联若引用已减少但画布提交失效，在原数据库补偿引用；同时校验目标仍关联原正文，避免覆盖新关联。本地上传菜单由媒体扩展显式声明可用动作，选择器通过扩展界面层承载；工具通过命令 ID 执行，导入按规则只认领一次。

元素的编辑标记是瞬态状态：失焦立即释放，删除元素及其子树、渲染卸载和页面停驻时兜底清理；不能因残留标记阻断整板的 Delete / Backspace。文本输入焦点内仍由编辑器处理删除。

白板插件的静态版本目录由 ContentPluginRegistry 准备，React Query 结合注册快照修订交给 DocumentBoardCanvas，过期准备结果拒绝安装。画布按精确契约匹配历史 read/edit/none，读版本使用只读渲染上下文；插件缺失或版本不兼容不改变原模型。首次作者创建原子登记契约，加载不改字典。每次字段/载荷/条件提案写入复核插件激活实例；画布字段的 registerInput 冲刷发生在关闭冻结之前，失败拒绝成功回执。

第三方白板服务是独立白名单注册表，只提供该插件的 IPluginStorage、写入权限检查及已装配的上传/媒体探测/下载能力；不继承主服务表的文件/正文能力。能力引用在使用前后复核工作区、视图作用域与激活实例，订阅和字段租约随作用域释放。普通插件节点使用 SDK 身份命令与公共文本接口，旧宿主路径 API 不进入作者对象原型。

原白板列表及插件删除入口经文档服务冲刷目标视图，再在原主库事务内解除拥有者并释放页面引用；插件操作记录与删除同事务。仍共享的白板须先结束共享或退出协作。被引用的页保留为无白板拥有者的文档，隐藏页的拥有者引用也同时释放；插件恢复会重新认领保留文档。资料库连接时沿用原宽限期检查无拥有者文档，所有页无引用、无活跃编辑、无未决转换/网络分支且日志与主库一致时，才回收文档关系和日志，并交原页面回收处理。失败保留主库检查点，不能放宽旧快照写入守卫。

正文与白板都参加退出前的 durable-document-lifecycle 保存屏障，冻结输入并等待耐久确认；超时或保存失败取消退出、恢复编辑并保留窗口。正文保存回执核对本次冻结请求，迟到回执不能确认下一次退出。文档屏障完成后才开始窗口/插件后台的退出收尾和强制退出计时；正文不再使用超时即成功的独立 prepareQuit 路径。

新格式白板由 BACKGROUND 模块 `whiteboard-documents` 维护主进程文档会话，命令通过 `ensureModule` 接入。`whiteboard_documents` 持有完整 CRDT 检查点、契约和整板投影，`whiteboard_document_pages` 维护稳定 pageId 与本地 contentId 的映射，隐藏与恢复沿用原映射；来源与基线复用 `ContentIdentityTable`。`white_board_contents.data` 的 version 3 投影包含 documentKind/documentId/pageId/epoch/revision；旧快照、标题、页增删及排序入口拒绝覆盖托管结构。新格式创建要求库已具备来源基线，旧白板不转换。

桌面本机白板由独立后台模块启动。白板绑定、发布与安装状态、附件索引保存在白板目录的 `state.db`。只有共享操作按需取得协作客户端。本机日志和主库投影在协作库不可读时仍可恢复。聊天会话启动独立于白板和协作。整库同步的本机文档保存边界见[整库同步与文档保存](#整库同步与文档保存)。

本机 `whiteboard-documents/journal.db` 位于整库替换范围之外，以 SQLite FULL/WAL 保存增量幂等批次、完整检查点、已投影修订及历史实体持有。写入顺序为候选校验 → 本机提交 → 更新会话 → 主库事务更新所有页、拥有者和关系差集 → 日志推进投影回执。日志失败不广播，投影失败仍保留日志并拒绝关闭；重开与事件接收均按同源、同基线、同 epoch 校验，迟到的旧身份事件不进入当前会话；主库回退或分叉、日志损坏均保留材料并报错；整库同步替换前由 releaseLibrary 释放该库已投影的日志，新库从其自身快照重建日志。`whiteboard_entity_relations` 只记录可见关系，键包含富文本 rootId 与节点身份；曾引用实体的本机持有不计入业务 ref_count，不随主库同步。回收同时检查正文与白板的保全提供者，未建立本机持有的新文档保守阻止实体回收。

本机 journal 文件版本为 2，版本 1 原位升级并保留记录，旧客户端的版本门禁拒绝回退打开；内容协议仍为白板协议 3。已投影的本机日志增量只保留批次身份、修订和摘要，删除冗余增量载荷；完整检查点、未投影增量与历史实体持有继续保留。网络终态回执存入本机 journal 的 `remote_receipts`，按 scope 与 operationId 查询，与待确认队列移除同事务提交；`remote_branches` 不携带回执历史，旧内嵌回执核验后原子转存。发布任务存入协作缓存的 `whiteboard_publications`，按文档查询未决任务；完成／取消后只保留幂等身份、页面范围和房间信息。已完成安装记录保留身份、指纹、目标和回执，释放候选正文；未决候选不压缩，旧代次检查点不按日期删除。

`DocumentBoardCanvas` 经 `WhiteboardDocumentEntry` 的外部快照订阅文档会话，契约目录与共享状态仍走 React Query；查询刷新不负责创建或释放活跃会话。Entry 将打开、旧草稿保全与重开合并为同一个在途任务，租约失效后停止旧远端同步并自动交接；新客户端就绪才发布新快照并释放旧客户端，失败保留只读旧画布和会话重试入口。各画布保持独立视图历史，同文档切页复用绑定，Activity 隐藏保留租约和历史，真实卸载释放持有。模型由已挂载画布持有到 React 完成替换与清理后再销毁；新客户端按 viewId 重建画布子树。协作状态行与共享入口分别设局部错误边界，错误不卸载画布；弹窗只消费客户端维护的标题与页数快照，不在渲染中读取可销毁模型。每次本机输入立即进入 IndexedDB outbox，事务完成后才交给主进程；远端投影不回写。主进程回执区分耐久修订与投影修订，失败显示重试并阻止依赖保存的离页操作；投影通知按库合并失效白板查询。

白板命令层订阅 Electron 通知时从第二个参数读取业务载荷，第一个参数是 IPC 事件对象；更新、保存请求、恢复编辑与租约失效通知共用这一适配。保存确认由渲染端文档客户端排空输入与 outbox 后自动回复，协作页临时创建的后台会话也参与，不要求画布页面打开。8 秒内未收到确认时中止操作并保留会话，错误提示不得据此推断用户开着白板或存在未保存修改。恢复通知携带原 requestId；渲染端在每个异步边界复核请求是否仍有效，主进程按请求分别封存租约，取消旧请求不得解除新请求的冻结。文档级屏障只阻止目标文档，窗口与资料库维护仍覆盖其全部文档；在途打开也按文档范围匹配。

DocumentBoardCanvas 同时准备内置白板契约和编辑器版本目录，画布、板内正文和媒体消费同一受控资源服务。多页复制、跨页菜单、页名、画风与演示走绑定；板内正文另存时创建带完整契约的新正文，原文保持独立。外部引用保存 sourceId/kind/entityId，经当前窗口资料库校验后读取；文档卡不把数字 ID 当成共享身份。正文、卡片、文章、日记片段、项目条目、白板、白板页、数据表和视频笔记的物理删除会退役稳定身份，ID 与时间戳同时复用也不继承旧引用。

媒体资源复用 CollaborationAssetService，上传/读取/跨文档复制先校验窗口租约与会话状态，结果回来后再次检查。资源缓存的文档目录统一使用 encodeURIComponent(documentId)，写入、下载与清理共用同一映射，避免本机会话 local: 身份中的冒号成为 Windows 非法目录名；数据库仍保存原始文档身份，既有 UUID 目录不变。视频按既有本机资源边界处理，不扩大上传支持；本机引用不公开路径。可编辑导出携带托管资产字节，公网 URL 保持地址，外部实体只保存引用；读取失败停止完整导出。

### 整库同步与文档保存

关窗、切库、重连与退出通过 `durable-document-lifecycle` 排空所有相关视图，包括正在打开的会话；窗口冻结输入、排空 outbox 后确认，主进程封住租约并完成投影。超时或失败恢复可编辑状态，保留窗口和草稿；重复退出同样不得绕过屏障。普通切库和重连只冲刷。整库上传和下载关库只排空本机正文和白板的主库写入，独立于共享服务和远端确认。下载关库前冻结本机正文，完成投影并合并 WAL 后备份旧库。安装前释放旧库的正文和白板本机日志，正文冷缓存及未确认草稿按原身份写入 `local-content/discarded/` 后再清理，源码草稿附原基线；清理按带与不带 `.db` 的库名匹配。白板日志只在已投影进旧库时释放，避免未保存的白板改动丢失。共享正文保有原房间、视图、耐久增量和草稿。共享正文向主库投影时校验连接、绑定、来源身份和观察修订，旧会话无法覆盖下载后的新修订。主库重新连接后刷新本机正文会话和数据查询，自动下载也沿用这个入口。

打开正文发现本地缓存的资料库或正文身份与主库不一致时，备份旧缓存并从当前主库重建；身份一致但主库修订已被其它入口推进时，先尝试把缓存写回，修订冲突则同样备份后按主库重建。正文视图只有在编辑确认进入主进程会话后才回复冻结与注销，未送达时保留视图并重试，冻结方超时后恢复编辑。普通窗口切库只释放该窗口的租约，其它窗口继续持有。尚未完成 IndexedDB 或主进程耐久提交的输入不具备断电恢复保证。首次共享有独立提交边界。主进程的 remote-open/sync 复用窗口租约，仅接受已具备共享文档身份的白板；同一服务地址、设备身份与房间共用一个网络会话，remote-sync 按房间串行：排空网络提案、补交本机差异后，只把本机尚缺的确认内容作为一个批次写回本机日志并投影（无新内容不推进本机修订），远端投影经主进程事件到达画布，不进 outbox、不记本机撤销历史。网络等待期间新增的本机修订标记 requiresSync，不冒充全部同步；远端换代返回 reason=epoch，同一确认基线上的被拒分支返回 reason=rejected，原本机文档不被新根覆盖。远端接口返回摘要（是否需重绑、原因、待确认数、对应本机修订），不把确认快照传回渲染端；失败按服务端代码加前缀（OFFLINE、FORBIDDEN、DOCUMENT_CLOSED、CLIENT_UPGRADE_REQUIRED、MISSING_DEPENDENCIES 等）。网络分支和回执保存在同一耐久日志库的 remote_branches，与主库关系账隔离；首次发布保留原操作入口；旧数据格式拒绝接入。

**白板协作的用户入口**：白板详情与单页画布页给 BoardCanvas 传 `collaboration`，画布顶部 `WhiteboardCollaborationBar` 只显示保存失败、同步异常与未完成共享等需要处理的状态；正常保存、连接和同步时不显示状态行，也不占用顶部空间；共享入口 `WhiteboardShareEntry` 经 WhiteBoard 的 `statusBarEnd` 宿主插槽放在右下状态栏末尾，演示模式随状态栏隐藏；创作模式等嵌入画布只显示状态、不提供共享入口。`share-status` 返回共享绑定与未完成的首次发布，与画布共用 `whiteboard-share` 查询缓存。未共享时「共享」对话框说明范围后调用 publish（整板全部页，服务器地址取协作状态）；发布前先只读检查页面范围、资源可读性和本机视频支持；保存屏障排空输入后复核实际候选，通过后才固定任务并建房，预检或复核失败不留下发布任务，已有冻结回滚。任务固定后的未知结果沿原操作继续或取消；状态行与仍打开的共享弹窗均提供「继续共享 / 取消共享」，弹窗不再保留新建发布按钮，打开被阻止时 `PendingTransition` 提供同样入口。已共享时成员与协作码复用 CollaborationUI 的 SharePanel：协作模块在刷新房间列表时把白板房间（协议 3）列入 `CollaborationState.whiteboards`，invitation/remove-member 按房间地址签发与移除，仍由服务端按设备身份鉴权。远端同步由 `services/whiteboard-documents/remote.ts` 的 WhiteboardRemoteSync 承担：registry 在客户端就绪后建立共享状态控制器，绑定读取失败显示等待与重试并自动退避，复用同客户端也可重试；没有绑定时停止调度，确认已绑定才打开远端；本机修订先经 client.flush 进入主进程日志再调用 remote-sync，本机增量经主进程耐久保存成功后立即由 WebSocket 发送，连接重建补发本机尚缺增量；HTTP 确认对账按 50 毫秒合并调度，持续输入不推迟既有排期；远端内容由每租约的 WebSocket 接收副本推送，经本机会话写队列、候选校验与本机耐久日志后广播到画布，不等待轮询。推送连通时每 60 秒补偿对账，断线立即对账并恢复每 10 秒轮询（窗口隐藏时 30 秒），窗口聚焦立即同步；断网与等待前序确认按 2 秒起指数退避（上限 60 秒）自动重试，权限拒绝、共享结束、版本不兼容、换代与被拒分支停止自动重试，等待用户「重试同步」。最后一个持有者释放时停止同步；已 detached 的临时客户端先保留草稿再销毁，不再向失效租约保存。主进程网络会话由视图、在途打开与同步任务共同持有，无持有者后驱逐内存；未提交差异留在主进程日志，下次打开再同步。协作页侧栏「协作」下白板与正文同组列出（`groupShared`/`resolveShared` 统一排序与选中），选中白板时页内 `WhiteboardRoom` 展示协作码、待审批与成员，画布不在协作页编辑；「打开白板」经 `remote-install` 落到当前资料库：先固定本机文档身份再按远端确认快照创建，已落库直接复用，随后在白板页里编辑与同步。协作页「共享本地内容」可选白板：主进程 `share-candidates` 按标题检索已转换、未共享且没有未完成首次发布的整块白板（空关键词按最近更新，至多 30 条），渲染端经 `services/whiteboard-documents/share.ts` 临时持有文档会话发布，与白板页共用 `publishWhiteboardClient`。

**白板在线状态**：`WhiteBoard.presence` 由宿主传入页面身份与订阅通道；画布按 120 毫秒合并光标、选区边界与非实时手势的临时几何；真实拖动按实际移动的元素 ID 发送提示，即使拖动前没有点选也能跟随，通过主进程租约校验后发送 Awareness。状态限制为 64 个选中元素、8 KiB，显示端按 pageId 隔离，协作者名字、光标与选框统一用 `memberColor(userId)` 成员色（userId 取自服务端覆盖的连接身份，与正文协作头像、光标同色），光标按发送间隔线性补间，名牌为成员色底标签，无光标时挂在选区左上角；拖动几何只替换渲染投影，实时拖动以共享文档的位置为准，不让较慢的临时几何覆盖新位置；非实时手势中本机选中的元素也接收远端预览；松手时携带文档状态向量，接收端包含该状态后才撤去预览，取消则按已有状态恢复。远端选框统一从同一帧的元素投影计算边界，不直接使用可能先于内容到达的坐标，不进入本机撤销或导出。窗口失焦、页面隐藏、视图卸载清除本视图在线状态，旧视图清理不能擦掉新视图状态；租约释放或换代销毁连接。内容通过 WebSocket 实时收发，只有本机已耐久保存且未被隔离的状态才能发送；本机输入不作为远端更新再次应用。HTTP 幂等操作回执继续负责确认对账和断线补偿，发送成功本身不标记已确认；普通拖动与自定义指针手势按 50 毫秒合并写入共享文档并进入既有耐久保存/实时发送链路，松手冲刷末帧；整次拖动结束只移交一个撤销项。取消或页面隐藏会传播回滚，已有历史保持；同源回执的空事务不打断手势。

**结束共享与退出协作**：成员面板底部为作者提供「结束共享」、为成员提供「退出协作」；共享已结束或失去权限时状态行提供「转为本机白板」。三者走 `unshare`（close/leave/detach）：先经 transitionContext 排空并冻结所有视图，close 先取回远端确认、leave 先补交本机差异，再由 `unshare.ts` 合并本机副本与远端确认、导出当前投影并以 `mapTransferResources` 把托管资产换成本机文件（仍有权限时下载失败即中止、白板保持共享；detach 只用已缓存文件，取不到的引用原样保留并计入缺失数），重建不带 meta 的本机基线；随后先将源修订、候选与原操作身份写入 `whiteboard-unshare:` 任务，再由 close 按确认修订关闭房间、leave 退出房间；所有未完成退出任务均阻止旧代次写入。结果未知时以原修订重试远端动作，服务端完成后只继续固定候选的本机安装，最后删除共享绑定。候选源修订不一致时拒绝覆盖；原任务首次落盘失败不触发远端动作。界面经 `unshare-resume` 提供继续完成入口，重新打开也复用原任务；share-status 发现本机已不是共享格式会补删残留绑定。关闭后的白板可再次共享，按首次发布建新房间。远端基线变化或提案被拒时暂停同步，保留本机当前内容；不提供覆盖式恢复或插件数据升级入口。

FadeScroll、可拖宽侧栏、If、ErrorBoundary、PortalToBody 和编辑目标判断统一归 `@tau/ui`，禁止复制到白板包。实体/媒体类型、颜色和摘要纯工具经 shared 公开入口复用。元素树与素材架共用画布左侧停靠栏。`useWhiteboardDockStore` 在 `tau-whiteboard-outline` 保存当前面板和各自的宽度。实际占宽归所属页面，底部页签按占宽让位。

宿主提供主题运行时、UiProvider、DndProvider 和 Tailwind 扫描。缺失扩展时没有其创建入口；未知元素保留数据和子树，显示通用占位，并支持元素树定位与删除。状态和快照先提交，再逐个隔离通知观察者，扩展异常不得阻断保存通知。扩展数据契约扩展 id 与元素/命令/贡献按命名空间隔离（`tau` 保留），装配失败只禁用该扩展并清理其贡献；元素私有数据收敛在 `element.data`，由定义的 schema（Standard Schema v1，仅同步）和精确数据契约负责校验，版本转换由宿主显式发起；快照带必填顶层 `version`，文档版本高于当前应用时画布强制只读、不回调 onChange。创建交互开放元素经 `create` 声明创建方式（click/drag/自定义手势），内核统一负责约束、预览与提交（预览不写文档）；工具模型为 activeTool（`tau.select` 为显式选择工具，旧创建类型枚举与兼容层已删除），受控 API 提供 setActiveTool / onActiveToolChange、坐标转换与 canContain。事件分层与快捷键仲裁内核事件只有内核能发、扩展只能监听，扩展事件按命名空间隔离（`tau.*` 归内置，界面操作统一为 `tau.modal.open` 这类扩展事件，`internal:` 包内专用），快捷键只是「按键 → 命令」（内置优先，命令 enabled 不满足不拦截），mod+k/p/j、alt+方向、escape 为宿主保留键，显示文字统一经 `getShortcut` 取。独立 `@example/whiteboard` 构建、`pnpm check:whiteboard-boundaries` 与 pre-commit 守护源码和运行时模块图边界；Schema 不变（文档快照新增顶层 version 字段；卡片元素改为文档卡见下节），视觉验收由用户完成。

工具栏左侧用一个分体按钮承载已装配的指针、抓手和文本模式。主按钮显示最近激活的模式并可重新启用它，右侧箭头打开单选菜单。抓手的主键手势复用视口平移，覆盖元素交互区域。文本工具在空白处创建并聚焦富文本，保持激活；命中元素时交给对象原有交互。文档画布的新文本直接使用板内协作正文。

**文档卡与阅读纸**：卡片 / 文章 / 项目文档 / 日记在白板上是 `document` 元素（`entityRef` + `title` 快照，不存 contentId；日记直接存 `{ kind: "diary-moment", id: 片段id }`，不额外存 segmentId，选择器经 EntityPicker 逐条检索），包内 `DocumentPlugin` 负责外壳（选中、缩放、连线、手绘框）与展开请求（双击 / ↵ / 属性条 / 右键 → `board.emit(DOCUMENT_OPEN_EVENT, id)`），纸面由宿主 `createDocumentExtension({ Body })` 渲染，阅读纸由 `position: "canvas"` 承载；两者在 `features/shared/whiteboard/components/Document/`：`source.ts`（react-query 按 entityRef 读元信息，日记按片段 id 取正文与所属日期信息，文档卡与阅读纸通过 `ContentEditor` 订阅正文）、`DocumentPaper`（卡片与阅读纸共用的版式，版宽固定，形变只做 transform）、`DocumentCard`、`DocumentReader`（居中 / 停靠、形变、Esc 经 `DesktopEditorOverlayDismiss`；日记编辑时节流 `updateDiarySegment` 并失效同窗口的日记缓存）、`readerStore`（摆放方式全局偏好 + 按 Board 隔离的展开状态）、`QuickInsertPanel`（放入面板，见下）、`insert.ts`（放入：已在板上则定位、文档模式先建稳定引用、切库或失活丢弃，再经内核 `placeDocuments` 一次提交插入 + 连线 + 选中）、`DocumentHostContext`（嵌白板的宿主定制：`allowDock` 关掉停靠、`cardAccessory` 往卡面上叠宿主内容，创作模式在用）。`position: "canvas"` 渲染在画布容器内：宿主浮层根节点必须带 `CANVAS_OVERLAY_ATTR`，其中的按键、剪贴板、指针、滚轮不归画布；不要用 stopPropagation 截断，否则 document 上的 Esc 仲裁与编辑器弹层的外部点击会收不到事件。旧 `card` 元素不再自动改写。

**放入文档**：所有入口只发内核事件 `DOCUMENT_INSERT_EVENT`（`tau.document.insert`，载荷 `{ at, align?, screen?, linkFrom?, release? }`）：`/`（命令 `tau.document.insert-at-pointer`，读 `board.pointer`，光标不在画布上时取视口中央）、工具栏「文档」与右键「文档」、从文档卡连接点拖出箭头松在空白处（`ArrowConnectPoint.onReleaseInSpace`，临时箭头由 `release` 在面板关闭时撤掉）。宿主 `QuickInsertLayer`（`position: "canvas"`，带 `CANVAS_OVERLAY_ATTR`）贴着 `screen` 打开检索：`entity:search` 的最近编辑与搜索结果，选中或拖出的文档卡另有「相关」一组（`entity-context:get` 的连接、反链 + `entity-context:related`，去重最多 6 条）；Esc 经 `DesktopEditorOverlayDismiss`。内核 `placeDocuments` 以 `at` 为左缘（`align: "center"` 时为中心）排成一行，`linkFrom` 存在时连两端绑定的箭头。只读画布不响应放入请求。

**相关、素材架与相连**：`related.ts` 是文档卡「相关」的唯一来源（`entity-context:get` 的连接与反链 + `entity-context:related`，去重写原因，最多 8 条），放入面板、长出相关、素材架共用。长出相关：内核命令 `tau.document.related`（R、属性条「相关」，装配了文档工具才登记）发 `DOCUMENT_RELATED_EVENT`，宿主 `SuggestionLayer` 在卡片右 / 左 / 下中第一侧空位（`pickSide`）浮出至多 3 张建议（不写入白板），点一张经 `insertDocuments(..., { keepSelection: true })` 放入并连线；选中变化或卡片移动时收起。素材架 `MaterialShelf`：开关在面包屑 `ShelfToggle`，在可写画布且 `DocumentHostContext.shelf` 为真时可切入停靠栏（白板详情与单页画布用 `WHITEBOARD_PAGE_HOST`，正文内嵌白板与创作模式不开）。素材架与阅读纸引用拖出都走 HTML5 拖放、自有 MIME `application/x-tau-whiteboard-material`，由扩展 `tau.desktop-materials` 的 ingest（`materialDrag.ts`）认领：落在卡上放在其右侧并从它连线，落在空白处从落点排开，`linkFrom` 为引用来源卡。阅读纸底栏 `ReaderLinkBar` 列出与这张卡有绑定箭头相连的元素（`neighborsOf`），文档卡原地换篇，其他元素收起后定位；`ContentLink` 渲染带 `data-content-link / data-content-type / data-ref-id`，阅读纸据此让引用可拖出，居中阅读拖动时纸面半透明并让开指针，拖回纸面不算放入。

**PDF 文档卡**：`DocumentKind` 含 `pdf`（`entityRef: { kind: "pdf", id: pdfs.id }`，`BoardElement.entityRef` 为 `BoardEntityRef`），稳定引用种类 `CONTENT_ENTITY_KINDS` 含 `pdf`（`entity_identities` 映射 `pdfs`，按 create_time 校验，删除后同编号新行不被认领）；`entity:search` 有 `pdf` 种类（文件名检索，按最近打开排序）。PDF 不是正文实体，`textEntityRef`（`entityRef.ts`）把它挡在脉络、相关、创作模式之外。卡面 `PdfFace`：上次读到的页的位图（`features/pdfs/pdfPage.ts`：pdfjs 按需加载，文档按库、文件来源、id 和 updateTime 复用，渲染期间持有，空闲后按最近使用顺序回收到 4 份；位图按页码、宽度档缓存至多 48 张 Blob，显示组件持有并释放自己的 object URL；IntersectionObserver 离屏不渲染，低缩放只画标题骨架）、纸叠、页码、有笔记标注的页边标记（`usePdfAnnotationList` 与阅读器同一缓存）。「上次读到的页」唯一来源 `pdfs.last_page`，`features/pdfs/lastPage.ts` 的 `usePdfLastPage` / `syncLastPage` 让 PDF 阅读页、白板阅读纸（`WhiteboardPdfReader`，嵌独立 `PdfReader`、节流写回）与卡面翻页（内核命令 `tau.document.page-prev/next` 绑 `[` `]`，属性条按钮，发 `DOCUMENT_TURN_PAGE_EVENT`，宿主 `PdfPageTurnLayer` 写回）共用一个查询键，展开从卡面当前页恢复，缺页数的 PDF 读取文件的实际页数后再写入进度，同一份 PDF 的卡面一起换页。方向键保留给移动元素，翻页不用 ← →。0.65.1 及更早的客户端不认 `pdf` 实体种类，打开含 PDF 卡的协作白板会整块校验失败，含此改动的版本发版说明须提示协作者升级；大量 PDF 同屏的渲染开销尚未实测。

**摘录**：元素 `excerpt`（内核 `ExcerptPlugin` 外壳 + `createExcerptExtension({ Body })`，协作契约字段 `source / quote / note / color / sourceTitle`，没有创建工具）。普通白板的 `source` 记录本机 PDF 和标注行号；文档卡带稳定引用时，摘录保存 `{ kind: "pdf", entity, annotationObjectId, page }`，打开时先解析同源 PDF，再按引擎标注 ID 定位本机行。共享白板中只含旧行号的摘录保留快照，来源不可验证时禁用跳转；原文、笔记、颜色、来源标题都是快照，来源删除后照样显示，摘录不进库、不建索引，也不计入来源的脉络。生成入口在白板阅读纸的 PDF 阅读器：划线工具条与已有标注工具条上的「放到白板」（可写白板经 `ReaderLayout.prepareSendToBoard` / `onDragToBoard` 接入），划线时先检查白板可提交，再按上次的颜色保存标注；完成后复核来源卡仍有效，再生成摘录；点一下经 `placeExcerptBeside` 放在来源卡右侧依次下排，拖出把手走自有 MIME `application/x-tau-whiteboard-excerpt`，由 `tau.desktop-materials` 的 ingest 放在落点。内核 `placeExcerpt` 一次提交插入 + 从来源卡连的虚线箭头 + 选中（箭头可删，不影响回到原文）。回到原文（卡面来源条、属性条，`EXCERPT_OPEN_SOURCE_EVENT`）：来源 PDF 卡在板上时展开它并经 `readerStore.focus` 让 `WhiteboardPdfReader` 跳到该标注，不在板上时打开 `pdf-detail?annotation=`，来源已删除或不可解析时来源条显示「原文不可用」。文档模式下文档卡的稳定引用解析成本机身份后投影为瞬时字段 `entityRef`（契约 transient，不写回文档），去重、相关、翻页、找来源卡都读它。

**速览**：内核 `DOCUMENT_PEEK_EVENT`（`tau.document.peek`，载荷元素 id 开始、null 结束）：文档卡外壳按住不动 `DOCUMENT_PEEK_DELAY`（250ms）开始、松手 / 移动超过 4px / 失焦结束；命令 `tau.document.peek` 绑空格（单选文档卡时，只读画布也登记），宿主在 keyup 空格时结束。宿主 `PeekLayer`（`position: "canvas"`，不接收指针）按 `peekBox` 把卡面放大到版宽原大、保持比例、放不下按画布缩小并收进边距，只动 transform（220ms 缓出、落回 180ms，减少动态效果时 120ms 淡入淡出），正文为只读 `ContentEditor`；居中阅读时不响应，阅读纸打开即撤掉速览。

**日记正文身份与搜索**：EntityKind、EntityRefKind 与 ContentIndexType 均使用 `diary-moment`，id 为 `diary_segments.id`，界面类型 label 仍为「日记」；`diary_entries` 仅承载日期、天气心情与分组，不能作为正文搜索结果。实体候选、FTS 回退与全文/向量索引、内容链接、白板引用和脉络均落在同一条正文；`entity:locate` 返回片段 id + diaryId/date，`openEntity` 通过 date + moment + at 精确回跳。日记页的搜索命中集合使用片段 id。新增或删除片段及正文编辑继续触发现有索引对账。旧日级引用不再自动改写。

日记列表点正文后，当前只读视图继续撑开条目，正文编辑器在布局外准备会话。编辑器就绪后原位接替，并在焦点仍留在条目时恢复点击处的光标；取消或打开失败时保留阅读视图，失败以 Toast 提示。外部定位触发正文高亮，进入或退出编辑不重复定位。
