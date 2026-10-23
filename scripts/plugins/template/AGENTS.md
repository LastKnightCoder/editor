# AI 编程助手指引

这是 Tau 的统一插件模板，使用 SDK 0.36.0 与 UI 0.4.0。格式 3 沿用中心上架规则：普通提交人工批准，具审核权限的作者本人经已绑定仓库 CI 发布可自动批准，作者负责平台适配与测试，不要求审核者测试或填写验证记录。移动正式安装要求客户端 0.2.1；桌面格式 3 正式安装尚未接入。先读 docs/api-support.md、docs/portability.md 和 docs/getting-started.md。仅在用户明确要求时发布或上传，不向生产提交一次性测试包，不将格式 3 写入旧正式目录。

## 开始之前

1. 读 `docs/README.md`，按任务找到对应的文档并读完。所有插件都要先读 `docs/plugin-basics.md`。
2. 读 `manifest.json` 和 `src/index.tsx`，理解现有代码。
3. 以已安装 SDK 的类型（`node_modules/@tau/plugins`）为准确认接口和参数，不要编造接口。

## 代码

- 使用 TypeScript/TSX。插件接口从 `@tau/plugins` 导入，界面组件从 `@tau/ui` 导入。
- 插件身份只在 `manifest.json` 中修改，入口沿用 `__PLUGIN_META__`。不要为日常升级修改插件 ID，改了 ID 用户的数据就找不回来了。
- 运行状态放在 `create` 返回的闭包或组件里，不放在模块顶层。不要缓存 `context` 留到下次启用。
- 通过 `context` 注册的东西会自动清理；自己创建的计时器、监听、连接交给 `context.register`。异步任务响应 `context.signal`，写回界面前检查 `context.signal.aborted`。
- 桌面网络请求用 `context.fetch` 并检查 `response.ok`；移动尚未注入该适配，不因插件中心可联网就调用它。存储、网络响应、用户配置等外部数据读取后先校验类型。
- 插件代码运行在浏览器环境，不能导入 Node.js 模块；需要 Node.js 时按 `docs/backend.md` 添加本机后台。
- 格式 3 使用 pages + navigation，平台/布局/输入从 SDK 环境读取；Node 后台只能显式选择旧桌面格式，不能混入跨端包。
- 编辑器块和白板元素的渲染代码也会在博客中运行，不能依赖 `activate` 或 `context`，见 `docs/editor.md`。
- 编辑器块里的图片、视频、音频用 `MediaImage` 等宿主组件显示，存地址的字段写进节点的 `resources`，见 `docs/editor.md`。
- 样式选择器加插件专属前缀；用 Tailwind 时用 `prefix()` 给全部类名加前缀，见 `docs/ui.md`。
- 桌面访问用户数据要声明权限并处理 PluginPermissionError；修改、删除传入 revision 并处理 PluginConflictError。移动目标的 permissions 必须为空，data/content/entities/records/links/transaction 等尚未接线，不能以 KV 支持推断可用。
- 服务提供方的账号配置用配置表单的 `save` 保存，不要存进 `context.storage`。
- 给 AI 的使用说明写成 `skills/<id>/SKILL.md`（front matter 必须有 description），构建时自动打包，不在插件代码里声明，见 `docs/skills.md`。
- 不要把密钥、令牌或机器特定路径写进源码和插件包。

## 依赖与构建

- 用 pnpm 管理依赖并提交 `pnpm-lock.yaml`，不要混用 npm 或 yarn。
- 保持模板的构建配置和依赖版本，尤其是 `build.mjs` 的 external 列表和 React 版本。只有任务确实需要时才调整构建工具。
- 完成修改后运行 `pnpm build`。如实说明验证结果：构建成功只代表类型和打包通过，不代表功能在 Tau 中可用。
- 安装到 Tau 前检查目标插件 ID。`~/.editor/plugins/` 下已有同名目录时，先停用插件、备份，不要静默覆盖。
- 在 Tau 中验证启用、功能、数据保存、停用和重启后恢复，未验证的项目如实列出。

## 用户可见的文字

- `README.md` 写给第一次使用插件的用户：能做什么、怎么开始、常见问题。不写开发过程、内部实现或迁移历史。`manifest.json` 的 `description` 填一句话简介。
- `CHANGELOG.md` 同样写给用户：每个版本以 `## 版本号` 开头，逐条写用户能感知的变化，用界面上的叫法。不写 SDK、构建、仓库、CI、内部模块或字段。没有可感知的变化时只写「维护更新，使用上没有变化」。
- 发布前同步 `manifest.json` 和 `package.json` 的版本，流程见 `docs/release.md`。
