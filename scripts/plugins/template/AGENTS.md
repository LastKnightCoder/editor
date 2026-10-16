# AI 开发指南

- 先阅读 DEVELOPMENT.md、API.md、manifest.json 和 src/index.tsx，理解现有示例后再修改。
- 定义文档节点前阅读 EDITOR.md，使用静态 editorExtensions 并声明 manifest.editor；展示代码须兼容浏览器，不另写博客专用渲染组件。
- 本模板使用 SDK 0.6.0、Tau 0.59.0。编译与转换接口见 SERVICES.md，不把生成结果当作已保存文件或已写入笔记。
- README.md只写面向用户的功能和使用说明，随ZIP打包；manifest.description填写简短介绍，平台自动读取，不另填网页介绍或截图。CHANGELOG.md可选。
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
