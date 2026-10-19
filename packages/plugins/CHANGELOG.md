# 更新记录

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
