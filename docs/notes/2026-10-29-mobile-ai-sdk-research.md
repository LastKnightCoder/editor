# 移动端 AI 能力 SDK 调研方案

一句话目标：为 apps/mobile（Tauri 2 WebView）引入 AI 能力（聊天 + AI 完成功能），支持 MCP 与 Agent Skills，给出 SDK 选型对比与 PoC 验证计划。本文是调研快照，不是架构事实；结论落地后沉淀到 `docs/architecture/mobile.md`。

## 1. 现状盘点（代码侧事实）

移动端与桌面端不是同一套壳：移动端是 Tauri 2（iOS/Android，WebView 内 React 19 SPA + Rust 层），桌面端是 Electron。桌面端已有一套完整 AI 体系：

| 资产         | 位置                                                                         | 说明                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 中立运行协议 | `packages/shared/src/chat-core/`（aiRunProtocol/streamEvents/messageSchema） | provider 中立的流式事件协议（text/reasoning/tool-calls/usage/审批提问/settled），纯类型+纯函数，零 React/DOM；已被浏览器扩展消费，是仓库内已验证的跨端 AI 协议 |
| LLM 运行时   | `@earendil-works/pi-ai@~0.87`（仅 desktop 依赖），跑在 Electron 主进程       | 统一多 provider（openai-completions/responses/anthropic-messages），渲染层经 IPC 消费                                                                          |
| MCP 客户端   | 官方 `@modelcontextprotocol/sdk@^1.24`，桌面主进程                           | stdio + streamable-http 双传输，工具经 toolRegistry 注入 agent 循环；插件也可声明 MCP（pluginMCP 桥）                                                          |
| Agent Skills | `apps/desktop/src/features/skills/` + skill-tools                            | Anthropic SKILL.md 标准（已移交 AAIF 开放标准），system prompt 注入 + list/read/run 四工具，兼容 `.claude/`、`.codex/`、`.agents/` 目录                        |
| 聊天 UI      | `packages/chat-ui`（conversation/renderers）                                 | desktop/browser-extension 共用，mobile 未依赖                                                                                                                  |

移动端硬约束（来自 `docs/architecture/mobile.md`、plugin-portability.md）：

- 无本地 stdio 进程能力 → MCP 只剩 streamable-http 一种传输。
- 业务网络约定走 Rust 网关/原生桥（plugin_fetch 先例）；协作 WS 有 WebView 直连先例。
- API key 应落 setting.json（Rust `setting.rs` 管理），不进 localStorage；发行包不内嵌 key（BYOK，与桌面同构）。
- 移动端零 AI 代码；插件宿主明确不注入 embeddings、拒绝插件侧 flashcards AI——移动 AI 是「独立消费者」自带通道，不经插件系统。
- 后台不保活，流式生命周期要与页面保活模型对齐（chat-core 的 settled/retry 事件语义可复用）。

关键洞察：**Skills 与 MCP 的注入本质是应用层职责，任何候选 SDK 都不替你做**（Skills = system prompt + 工具，桌面实现可整体移植）。因此 SDK 选型的真正分歧点只有一个：**LLM 运行时（流式 + 工具循环）用什么库、跑在哪一层**。

## 2. 候选方案对比

评估环境基准：Tauri WebView（iOS=WKWebView ≥ 流式 fetch、Android=Chromium WebView），React 19 + Vite 打包进 WebView。

### 方案 A：复用 pi-ai + chat-core（对齐桌面，WebView 内跑）——推荐

`@earendil-works/pi-ai` 零内部依赖，官方修复过浏览器打包兼容（早期 register-builtins.js 引入 Node-only provider 的 bug 已修），配套 `pi-web-ui` 证明浏览器可用。

- 优点：与桌面完全同构——`LLMProviderSetting`/`PiApiKind`/`ThinkingLevel` 设置形状、chat-core 事件协议、chat-ui 组件、Skills 注入格式全部直接复用；浏览器扩展已验证「非桌面渲染层消费 chat-core」先例；无新依赖心智。
- 缺点：pi-ai 是单人维护的中小生态（pi-mono），版本节奏快、scope 已迁移过一次（@mariozechner → @earendil-works）；需自己包一层 fetch（CORS/key 注入）；MCP 需另接官方 TS SDK（同桌面）。
- MCP：`@modelcontextprotocol/sdk` 的 StreamableHTTPClientTransport 基于 fetch，可在浏览器用（SDK 面向 Node，bundling 需验证）；工具桥照抄桌面「定义上行/执行下行」模式（piToolBridge）。

### 方案 B：Vercel AI SDK 6/7

`ai`（AI Core）+ `@ai-sdk/react`（useChat）+ `@ai-sdk/mcp`（createMCPClient，稳定）；7（2026-06）加实验性 realtime WebSocket。38+ 官方 provider 包，生态最大、文档最全。

- 优点：流式/工具循环/provider 适配全部现成；MCP 工具透明转 AI SDK tools；useChat 免自研聊天状态；Apache-2.0。
- 缺点：与桌面双栈并存（mobile 用 AI SDK、desktop 用 pi-ai，设置/消息模型/事件协议要再写一层适配对齐 chat-core）；浏览器直连需处理 CORS（Anthropic 要 `anthropic-dangerous-direct-browser-access` header，OpenAI 允许 CORS）；Vercel 的 UI Message Stream 协议与自有 aiRunProtocol 是两套流水线，长期对齐成本高。
- 适合场景：若决定移动端不与桌面共享运行时而要「社区标准栈」，或未来 Web 版也重起炉灶。

### 方案 C：TanStack AI（@tanstack/ai）

2026-08 进 RC。亮点：类型安全（per-model 工具类型）、`@tanstack/ai-mcp`（多服务器池、类型生成、MCP Apps）、AG-UI 开放协议、MIT。

- 优点：类型安全与 MCP 池管理是三者最强；活动（activity）模型对「结构化完成任务」（非聊天场景）表达力好。
- 缺点：RC 未稳定，API 可能变动；生态最年轻；同样面临与 chat-core 双协议对齐问题；移动/浏览器场景缺少大规模验证案例。
- 定位：观察列表，不作为首选；若选 B 的理由成立，也建议等 1.0。

### 方案 D：Rust 层自研运行时（rmcp + provider client，Tauri 命令流式吐给 WebView）

LLM 调用与 MCP 客户端全部下沉 src-tauri（reqwest 流式 + rmcp），WebView 只消费事件。

- 优点：绕开 WebView CORS/key 暴露一切问题；与「业务网络走 Rust」的项目惯例一致；后台存活策略由原生控制。
- 缺点：工作量最大——三协议 provider 适配、工具桥、事件序列化全要在 Rust 重写一遍，且桌面（Node）与移动（Rust）两套运行时行为漂移难治理；chat-core 协议要再定一层 Tauri 事件映射。
- 定位：不整栈采用；仅当 WebView 直连被 PoC 证伪时，作为「网络下沉」的退路（此时仍保留 A 的 WebView 内 pi-ai，只把 fetch 换成 Rust 通道桥）。

### 横向速览

| 维度                | A pi-ai 复用                   | B AI SDK 6/7        | C TanStack AI            | D Rust 自研      |
| ------------------- | ------------------------------ | ------------------- | ------------------------ | ---------------- |
| 移动 WebView 可行性 | 高（零依赖、已修浏览器兼容）   | 高                  | 中（RC、案例少）         | 不适用（原生层） |
| MCP                 | 官方 TS SDK（streamable-http） | @ai-sdk/mcp（稳定） | @tanstack/ai-mcp（最强） | rmcp             |
| Skills              | 桌面实现整体移植               | 应用层自做（同 A）  | 应用层自做               | 应用层自做       |
| 与桌面/现有资产契合 | **最高**                       | 低-中（双栈）       | 低（双栈+未稳定）        | 中（协议层契合） |
| 成熟度/维护         | 中（单人生态）                 | **高**              | RC                       | 自担             |
| 新增依赖数          | 2（pi-ai + mcp sdk）           | 3-4                 | 3+                       | 0 前端           |

## 3. 关键风险与 PoC 清单（调研验证计划）

按顺序做，任一判据不过即触发对应退路，全部通过即可进入正式实现：

1. **PoC-1 WebView 流式直连**（1 天）：mobile WebView 内用 pi-ai 自定义 fetch 流式调用 Anthropic（带 dangerous-direct-browser-access）与一个 OpenAI 兼容端点；判据：iOS WKWebView 与 Android WebView 均能完整收流、可中断；若失败 → 退路 D 的网络下沉（fetch 换 Rust 通道）。
2. **PoC-2 MCP 浏览器打包与连接**（1 天）：mobile 引入 `@modelcontextprotocol/sdk`，仅用 StreamableHTTPClientTransport 连一个远程 MCP server，工具能列出并调用；判据：Vite 产物无 Node polyfill 报错、iOS/Android 双端通过；若失败 → 备选 `@ai-sdk/mcp` 单包替代（只引它的 MCP 客户端也需 pi-ai 工具适配层）。
3. **PoC-3 chat-core/chat-ui 上移动端**（2 天）：mobile 页面接 `@tau/shared/chat-core` reducer + `@tau/chat-ui` conversation；判据：能渲染流式消息块（含 tool-calls）、主题 token 正常、键盘避让可接受。
4. **PoC-4 key 与设置对齐**（0.5 天）：LLMProviderSetting 读写走 Tauri setting 命令（不落 WebView storage）；判据：与桌面 setting.json 字段互通。
5. **Skills 移植评估**（0.5 天，无代码）：确认移动端 Skill 来源裁剪口径——无本地脚本执行（`run_skill_script` 裁掉）、无文件系统工具，保留 list/read + system prompt 注入；判据：产出裁剪清单进任务文档。
6. **后台中断恢复**（并入 PoC-3）：App 切后台/回前台流式中断后，chat-core settled/retry 语义能表达恢复或终止；判据：无僵死 pending 状态。

## 4. 推荐结论

**主推方案 A**：移动端在 WebView 内复用 pi-ai + `@tau/shared/chat-core` + `@tau/chat-ui`，MCP 走官方 TS SDK 的 streamable-http，Skills 按桌面实现裁剪移植，key 经 Rust setting 管理，网络首选 WebView 直连（PoC-1 证伪则仅把 fetch 下沉 Rust 通道，其余分层不动）。理由：这是唯一能让移动端与桌面共享同一套协议、设置、UI 与 Skills 资产的路线，新增外部依赖最少；TanStack AI 与 AI SDK 的优势（生态、类型安全）对「第二台设备复用既有体系」这个目标加成有限。

方案 B 保留为社区标准备选：仅当未来 Web 版（web-server）也要建 AI 能力、且决定以 AI SDK 为全司标准时再评估统一迁移（届时桌面 pi-ai 一并替换，而不是移动端单独引入形成双栈）。

## 参考来源

- [TanStack AI vs Vercel AI SDK 官方对比](https://tanstack.com/ai/latest/docs/comparison/vercel-ai-sdk)、[TanStack AI RC 公告](https://tanstack.com/blog/tanstack-ai-rc)、[TanStack MCP 支持](https://tanstack.com/blog/your-mcp-your-way)
- [AI SDK 7 发布公告](https://vercel.com/blog/ai-sdk-7)、[AI SDK 文档](https://ai-sdk.dev/docs/introduction)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[MCP Streamable HTTP 传输规范](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [pi-mono 仓库](https://github.com/badlogic/pi-mono)、[pi.dev SDK 文档](https://pi.dev/docs/latest/sdk)、[浏览器打包兼容修复记录](https://github.com/earendil-works/pi/issues/1814)
- [Agent Skills 开放标准](https://agentskills.io)（已移交 AAIF 基金会）
