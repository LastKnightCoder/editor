# 移动端 pi-ai 与 pi-agent-core 可行性验证

结论：`pi-ai@0.87.1 + pi-agent-core@0.87.1` 的模型协议处理与工具循环能够在不提供 Node 全局变量的 JavaScript 环境运行，可以作为 Tauri 移动端本机 Agent 的候选。该结论是 SDK 与命令包装层验证，不代表已经接入移动应用，也不代表真实模型、原生数据库或手机设备已经验收。

## 范围与方法

验证代码位于 `apps/mobile/validation/ai/`，不接入生产入口；三个依赖仅登记为移动端开发依赖。运行 `pnpm --filter mobile validate:ai` 可复现。

- 两种构建器：esbuild 与移动端实际使用的 Vite 8，目标设为 Chrome 107 / Safari 16。
- 两种执行检查：Vitest 行为与命令集成测试；浏览器 IIFE 包在不提供 `process`、`Buffer`、`require` 的 VM 中运行，仅注入 Web 标准 API。
- VM 中模型请求经过本机 HTTP 服务，服务模拟 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 的 SSE。按七字节分片发送，覆盖中文 UTF-8、JSON 参数和事件边界拆分。
- 每种协议都执行五轮模型请求：加载技能 → 搜索卡片 → 读取卡片 → 追加正文 → 最终回复。使用真实 pi-ai 协议适配器、真实 pi-agent-core Agent，不使用模拟 Agent 或模拟模型适配器。
- 最终原生边界仍为模拟：VM 使用内存卡片；集成测试加载实际 `services/tauri.ts`，只替换最下层 `invoke`，检查调用参数，不触碰真实用户数据。

## 结果

| 项目                       | 结果                                 |
| -------------------------- | ------------------------------------ |
| esbuild 浏览器包与隔离执行 | 三协议均通过，每种五轮请求、一次写入 |
| Vite 浏览器包与隔离执行    | 三协议均通过，每种五轮请求、一次写入 |
| 行为测试                   | 新增十二项通过                       |
| 现有内容字数与契约回归     | 六项通过，合计十八项                 |
| 移动端 TypeScript 检查     | 通过                                 |
| 移动端正式前端 Vite 构建   | 通过；验证入口不进入正式产物         |

行为测试覆盖参数校验、未读先写拒绝、写工具权限拦截、原生版本冲突、HTTP 401、请求等待取消、流式接收取消和工具执行取消。技能说明通过 `load_skill` 工具进入后续模型请求；这只证明渐进加载模式可行，不是完整的技能导入系统。

调用已有移动卡片命令时，搜索限制十条，写入携带读取时的 `expectedRevision / expectedDocumentId / expectedSourceId`。`updateContent` 仍使用现有字数计算，不信任工具传入的计数。

## 兼容细节

完整的 `pi-coding-agent` 没有进入浏览器包。`pi-ai` 的 `provider-env` 为 Bun 沙箱保留一个条件保护的 `require("node:fs")`，因此 Vite 会提示浏览器外部化；浏览器环境在进入该分支前返回，本验证未提供 Node polyfill，执行通过。这不等于包源码完全没有 Node 字样。

包含三种适配器、Agent 与测试夹具的 Vite IIFE 包约 596 KB，gzip 约 160 KB。该值是验证包大小，不是生产应用新增体积，也不是手机安装包大小；精确数值以每次运行生成的 `output/mobile-pi-validation/report-vite.json` 为准。

测试通过 `fetch` 注入实际发送 HTTP 请求，证明模型层存在原生网络适配入口；尚未把该入口接到 Rust。现有 `plugin_fetch` 有插件令牌与宿主作用域，不应绕过它的权限边界直接复用。

## 尚未验证与正式接入边界

- 真实模型的鉴权、工具选择质量、服务商接口差异、远程网络和 WebView 跨域策略。
- WKWebView / Android WebView 真机运行、系统后台冻结、断网、进程回收与重试。
- Rust / SQLite 真实读写，活动编辑器草稿冲洗、库切换隔离、协作文档写入、缓存失效和正文通知。
- BYOK 凭据持久化与原生 fetch 桥；测试只使用明显无效的固定凭据，不读取任何真实账号设置。
- 远程 MCP 连接、通用 `SKILL.md` 发现、技能附件和脚本执行。
- 会话持久化、上下文压缩、费用统计与正式工具审批交互。

取消信号可以停止模型流和协作取消的工具；已经提交的数据库事务不能被 AbortSignal 撤销。正式写入流程必须区分“尚未开始”“提交完成”“结果未知”，不能把停止等待解释成未写入。

建议进入下一阶段：保持轻量 Agent 在 WebView，原生层负责必要的网络和数据操作，先用验证应用与测试模型账号打通真实卡片闭环；此时不需要引入第二套 AI SDK。
