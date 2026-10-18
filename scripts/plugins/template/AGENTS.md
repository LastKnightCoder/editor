# AI 开发指南

- 先阅读 DEVELOPMENT.md、API.md、manifest.json 和 src/index.tsx，理解现有示例后再修改。
- 定义文档节点前阅读 EDITOR.md，使用静态 editorExtensions 并声明 manifest.editor；渲染代码须能在浏览器运行，不为移动端或网页另写渲染组件。
- 本模板使用 SDK 0.14.0、Tau 0.59.0。白板扩展见 WHITEBOARD.md；同步存储插件见 SYNC.md；编译与转换接口见 SERVICES.md，不把生成结果当作已保存文件或已写入笔记。
- 使用 AI 前阅读 AI.md，通过 ai.features 声明功能，由用户分配模型并授权。仅调用 context.ai，不索取用户的 API Key；处理取消、未授权和额度不足，不循环重试。
- 提供 AI 工具前阅读 MCP.md，通过 context.mcp.register 注册本地 tools 或外部 transport；需要 SDK 0.13.0 和对应客户端。
- README.md 写给第一次使用插件的用户：能做什么、怎么开始、常见问题；不写开发过程、内部实现或迁移历史。它随 ZIP 打包，manifest.description 填一句话简介，CHANGELOG.md 可选。
- 语音合成和音色复刻先阅读 TTS.md；多账号配置通过 ttsConfig 保存，上传参考音频使用 context.upload.uploadRemote 并传递取消信号。
- 使用 pnpm 管理依赖，提交 pnpm-lock.yaml；不要混用 npm 或 yarn 及其锁文件。
- 功能代码使用 TypeScript/TSX。优先使用 API.md 中说明的能力，结合已安装 SDK 的类型提示确认参数，不编造接口。
- 插件身份在 manifest.json 中修改，入口沿用 `__PLUGIN_META__`。插件 ID 变更会改变数据归属，不要为日常升级修改 ID。
- 数据通过 context.storage 保存；读取后校验类型，提供缺省值与错误反馈。
- 异步任务处理取消和失败；自定义订阅、计时器等通过 context.register 回收。
- 使用模板已有的构建配置与依赖版本。只有任务需要时才调整构建工具。
- 完成修改后执行 `pnpm build`。说明实际验证结果，不能把构建成功描述成客户端功能验收成功。
- 安装到用户目录前检查目标插件 ID。已有目录须先停用、备份，不得静默覆盖。
- 在 Tau 中验证启用、命令、页面或设置、数据保存、停用和重启恢复。未验证的项目如实列出。
- 不把密钥、令牌或机器特定路径写入源码与插件包。
- 发布前同步manifest.json和package.json版本；推送对应版本tag会触发GitHub Actions构建并上传ZIP，流程见DEVELOPMENT.md。

- 资源上传提供方先阅读 UPLOAD.md；使用 context.upload 与 target: "upload" 设置分区，不把上传和同步混为同一接口。
