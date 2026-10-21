# AI 编程助手指引

这是一个 Tau 桌面端插件项目，用 TypeScript 和 React 编写，`pnpm build` 打包成 ZIP 后安装到 Tau 中运行。

## 开始之前

1. 读 `docs/README.md`，按任务找到对应的文档并读完。所有插件都要先读 `docs/plugin-basics.md`。
2. 读 `manifest.json` 和 `src/index.tsx`，理解现有代码。
3. 以已安装 SDK 的类型（`node_modules/@tau/plugins`）为准确认接口和参数，不要编造接口。

## 代码

- 使用 TypeScript/TSX。插件接口从 `@tau/plugins` 导入，界面组件从 `@tau/ui` 导入。
- 插件身份只在 `manifest.json` 中修改，入口沿用 `__PLUGIN_META__`。不要为日常升级修改插件 ID，改了 ID 用户的数据就找不回来了。
- 运行状态放在 `create` 返回的闭包或组件里，不放在模块顶层。不要缓存 `context` 留到下次启用。
- 通过 `context` 注册的东西会自动清理；自己创建的计时器、监听、连接交给 `context.register`。异步任务响应 `context.signal`，写回界面前检查 `context.signal.aborted`。
- 网络请求用 `context.fetch`，检查 `response.ok`。存储、网络响应、用户配置等外部数据读取后先校验类型。
- 插件代码运行在浏览器环境，不能导入 Node.js 模块；需要 Node.js 时按 `docs/backend.md` 添加本机后台。
- 编辑器块和白板元素的渲染代码也会在博客中运行，不能依赖 `activate` 或 `context`，见 `docs/editor.md`。
- 访问用户数据要在 manifest 中声明权限，并处理 `PluginPermissionError`。修改、删除时传入读到的 `revision`，处理 `PluginConflictError`。
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
