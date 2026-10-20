# 更新记录

## 0.25.0

- 新增业务数据只读接口：`context.data` 读取卡片、文章、项目文档、待办与日程，`context.content.read` 按 `contentRef` 读取正文（Markdown 或编辑器节点）。查询按时间范围、标签筛选并分页。
- 新增权限：manifest `permissions` 声明可申请的上限（`cards:read`、`articles:read`、`documents:read`、`todos:read`、`calendar:read`），首次调用时由用户选择「仅这次」「始终允许」或「拒绝」。未获准时抛出 `PluginPermissionError`；`context.permissions` 可查询状态与一次申请多项。
- 新增 `context.events.on`：卡片、文章、项目文档的创建 / 更新 / 删除，待办与日程的集合级变化，以及同步下载后的 `workspace.reset`。事件不携带数据，需要对应读取权限才会送达。
- 新增写入：卡片与文章的新建、修改、删除，项目文档的标题与标签，待办与日程的新建、修改、完成、删除；`context.content.edit` 追加、插入或替换正文。修改与删除需传入读取时的 `revision`，数据已被别处修改时抛出 `PluginConflictError`。插件删除的内容用户可在 7 天内恢复。
- 权限词表增加 `*:write` 与 `*:delete`；事件增加 `origin`，可识别由插件写入的变化。
- 新增 `context.app.pick` 与 `context.app.open`：用 Tau 的搜索窗口让用户选择卡片、文章、项目文档、日记、白板、待办或日程，并打开它们的页面。用户亲手选择即可引用，不需要数据权限；只能在用户操作后调用。
- 新增正文组件 `ContentEditor` 与 `ContentPreview`：在插件页面嵌入与卡片详情相同的编辑器（协作、已安装的编辑器扩展、文档待办都生效），或只读显示正文开头几块。按所属内容的读取 / 写入权限放行，未授权时由用户点击「允许访问」后再询问。
- 权限约束的是 SDK 接口；插件仍与应用运行在同一环境，不提供安全隔离。

## 0.24.0

- 移除 `PluginServices.typst`：宿主不再内置 Typst 编译服务（原生二进制约 37 MB/平台随之从安装包移除）。Typst 排版由 `tau.typst` 插件 v0.2.0 以 WebAssembly 引擎在渲染进程本地完成，首次使用联网下载编译组件与字体并长期缓存。
- 旧版 `tau.typst` 插件（0.1.x）在新宿主上不再能实时编译，已保存的排版缓存与源码照常显示。

## 0.23.1

- 修正 FFprobe 升级说明中已删除类型的名称为 `MediaInfo`，接口与 0.23.0 相同。

## 0.23.0

- 移除 `PluginServices.ffmpeg.probe` 及其媒体信息类型，宿主不再随包分发 FFprobe；`ffmpeg.run` 保留。
- 视频页面标题、时长和格式查询继续使用 `services.videoExtractor.probe`，该接口由宿主视频解析器提供，不是本地媒体探测接口的替代品。
- 作者模板升级到本版 SDK，补齐博客发布、独立站点数据接入与升级说明，并修正服务文档中的已移除接口。

## 0.22.0

- 新增 `context.video.register`，接入视频来源（视频网站、自建服务器等）：插件识别链接、解析标题与清晰度，返回播放源描述（单文件、音视频分离或交给宿主解析器），下载、缓存与播放由宿主完成。
- 视频账号与代理配置通过 `settings.register({ target: "video" })` 注册，接收每个插件一份的 `videoConfig`。
- 新增 `services.videoExtractor.probe`，查询视频页面的标题与可下载格式；新增插件分类 `video`（在线视频）。

## 0.21.0

- 新增 context.publish 发布提供方、publishConfig 配置表单和文件式／快照式提交协议，本地导出仍由宿主提供。
- 新增受控 Git 快照发布与缓存目录选择服务，插件不获得任意命令或宿主文件访问。
- 插件分类新增博客发布。

## 0.20.0

- manifest 支持 `categories`（插件中心分类）与 `keywords`（目录搜索），门户上传严格校验，客户端忽略未知值。
- 博客模板包（`template` 分支）同样支持分类与关键词，只含静态站点产物，不能同时声明代码插件入口。
- publish-data：站点级数据（`settings`、`collections`、`cardTagTree`、`projectTrees`）改为只在清单中出现；内容文件新增 `links`，只含本文用到且已发布的站内链接目标。
- publish-client：`readData` 随正文带回清单的 `settings`；检索引擎按索引缓存，不再每次查询重建。

## 0.19.0

- 补齐 publish-data 类型、publish-client 纯数据客户端及 publish-artifacts 协议校验/定义求值入口；数据与产物声明不连带载入 Editor/React/UI 类型。
- 普通 SDK/UI 根入口保持类型与 Tau 注入约定；通用源码组件契约与实现由 Editor 公开入口维护，既有源码宿主适配只负责接线。
- 保留 master 0.18.0 的图片插件及全部已插件化接口。

## 0.18.0

- 新增 `context.images.register`，按账号配置与模型创建图片生成或编辑实例，返回图片字节和实际 MIME。
- 图片配置视图通过 `settings.register({ target: "images" })` 注册，接收当前账号的 `imageConfig`；保存按实例隔离，不使用共享凭据。
- 图片插件在主窗口渲染进程执行，跨窗口调用、上传、取消和停用共用任务生命周期；保留 TTS 与上传等既有接口。

## 0.17.0

- 新增通用行内源码 API：useInlineSource、insertInlineSource 和 InlineSourceBoundary，复用宿主 Slate 实例与浏览器行内边界处理。
- 行内源码更新和删除遵守只读、卸载/停驻、目标替换及编辑器提交守卫；不修改 useSourceBlock、EditorKit 或已有节点格式。
- 保留已有 TTS、上传、聊天、独立服务入口与 TikZ 服务移除边界；客户端版本不变。

## 0.16.0

- 新增独立 `usePluginServices()`，由插件渲染运行时提供已有编译与转换服务；博客及无服务的宿主返回 undefined。
- 服务按当前窗口和工作区绑定取消与失效保护，静态编辑器组件无需调用 activate；原有 context.services 保持不变。
- 不修改 useSourceBlock、EditorKit、文档节点协议或编译接口；保留 TTS、上传、聊天工具展示及 TikZ 服务删除边界。

## 0.15.0

- 新增 `context.chat.registerToolRenderer`，按本插件 MCP ID 与原始工具名异步登记 React 工具渲染器，激活成功后发布，停用、重载或切库时回收。
- 本地工具支持 `{ content, render: { version, data } }`，展示数据沿 pi 会话保存并支持历史回放；保留默认展示、宿主审批及失败/取消语义。
- 渲染器仅匹配绑定工具，组件接收独立执行快照；修复异常订阅中断回收及审批/重试恢复状态的终态收敛。
- 保留 0.13.0 的 TTS、资源上传接口及 0.14.0 移除 TikZ 服务的边界；UI 包无需升级。

## 0.14.0

- 移除 `PluginServices.tikz` 和 `context.services.tikz.compile`。TikZ 编译、字体与文档块由独立插件 tau.tikz 提供，宿主不再保留编译实现或转发入口。
- 插件作者如需 TikZ 绘图，应由自己的插件携带实现；其他宿主编译与转换服务保持不变。
- 保留 0.13.0 的 TTS、资源上传及其生命周期接口。
