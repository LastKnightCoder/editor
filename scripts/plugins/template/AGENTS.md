# AI 开发指南

- 先阅读 README.md、API.md、manifest.json 和 src/index.tsx。
- 只使用已发布 SDK 类型中存在的接口；不要猜测主题、文件系统或客户端内部 API。
- 运行时代码使用 TypeScript/TSX；根目录 mjs 仅用于构建和安装编排。
- 保持 SDK、React 和 ReactDOM 的 external 配置，不打包第二份 React。
- 通过 manifest 修改插件身份，入口复用 **PLUGIN_META**；不要手写生成的完整性哈希。
- 异步任务注意 context.signal；资源通过 context.register 回收。
- 修改后执行 npm run build。安装会修改用户 ~/.editor/plugins，先确认插件 ID；不要覆盖用户已有目录。
- 不在插件产物中放密钥、令牌或绝对本机路径。
- 不宣称仅构建通过等同于客户端验证；功能验收必须在 Tau 内执行命令并验证持久化。
