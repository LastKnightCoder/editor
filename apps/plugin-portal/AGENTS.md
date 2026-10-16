# 发布门户协作边界

接手维护、部署或改配置前先读 `README.md` 与 `infra/运维手册.md`；线上目标以wrangler.production.jsonc为准，ops.mjs默认只预览，不能把文档示例当成已获授权的线上执行任务。

2026-10-16补充：UI设计交付后，用户已授权主agent接管web功能、协议适配、测试和集成提交；保持现有布局与样式，不开展视觉重设计。

- UI 专家只修改 `web/`；后端 agent 负责 `contracts/`、`api/`、`infra/`、本目录根配置和仓库锁文件。
- 协议以 `contracts/index.ts` 与 `docs/协议.md` 为准；改字段或状态必须先更新协议，不能双方分别定义。
- 前端不引用桌面 app、Electron 或后端模块；只通过 HTTP 与后端交互。使用 `@tau/ui`、`@tau/themes` 公共入口。
- `web/` 不实现 OAuth 回调、令牌保存、R2 密钥、数据库访问或正式部署。模拟模式必须显式开启，真实请求失败不能自动回退模拟成功。
- 前端栈：React 19.2、TypeScript、Vite 7、Tailwind 4、React Router 6、TanStack Query 5，依赖由根 package.json 提供。
- 不改桌面 Page 框架，不改 `packages/db-schema`；这里的 D1 数据库独立于客户端数据库。
- 禁止将密钥、会话、上传原始内容写日志或提交；本地配置写 `infra/.dev.vars`。
- 视觉由用户验收；后端 agent 不做截图走查。
