# AI 公共核心

`@tau/ai` 是内部工作区包，提供桌面与移动端共用的模型、会话、工具与运行协议。消息展示类型和归约器的唯一来源仍是 `@tau/shared/chat-core`，本包不定义另一套消息正文，也不包含 React 组件、业务工具或功能入口。

## 模块边界

| 入口                            | 内容                                                      |
| ------------------------------- | --------------------------------------------------------- |
| `@tau/ai` / `@tau/ai/contracts` | AiError、会话/模型身份、运行请求、工具定义与执行上下文    |
| `@tau/ai/session`               | pi 会话 v3 编解码、树导航、历史投影、模型上下文与消息转换 |
| `@tau/ai/models`                | 三种 PiApiKind、配置 DTO、目录与自定义配置的合并规则      |
| `@tau/ai/runtime`               | AiRuntime、宿主存储端口、运行/单发结果与订阅协议          |
| `@tau/ai/tools`                 | 工具注册快照、参数校验、权限、审批与代次撤销              |
| `@tau/ai/skills`                | SKILL.md 来源、目录、按需加载与参考资料读取               |
| `@tau/ai/mcp`                   | 官方 SDK Streamable HTTP 客户端与工具注册适配             |
| `@tau/ai/think-stream`          | 显式启用的 think 标签流转换                               |

根入口只加载公共契约；模型目录、运行时和 MCP 通过各自入口显式引入。文件、网络、凭据和数据库连接由宿主提供。桌面继续使用 pi-coding-agent 的 AgentSession；手机使用 pi-ai + pi-agent-core，不加载 Node 编码代理宿主。

## 消息与持久化

会话正文采用桌面现有 pi v3 JSONL：文件头加带 id / parentId 的 entry 树。`pi-agent-core` 的 JsonlSessionRepo 使用另一种格式，本包没有将它作为交换存储。

- `createSessionFile / parseSessionFile / serializeSessionFile` 创建、读取和序列化 v3 文档，保留未知字段与提供方签名。较新格式和完整坏行返回明确错误；截断尾行产生 diagnostics，不能未经恢复直接续写。
- `appendSessionEntries / applySessionEdit` 处理追加及 rewind / fork / switch / omit；既有 desktop-display / desktop-leaf 标记保持原语义。
- `getSessionTranscript / projectSessionMessages` 输出完整展示历史；`buildSessionContext / convertSessionMessagesToLlm` 单独恢复压缩后的模型上下文。
- `projectTranscriptMessages` 是桌面和手机共用的 ChatSessionMessage 投影。工具循环合并到同一回答的多个 assistant_blocks，工具结果的 metadata 继续保留供现有渲染器消费。

消息 DTO 是投影，不是反向重建模型历史的依据。未知工具和缺少模型配置不阻止查看已经保存的文字与通用工具结果；历史记录不能恢复另一设备的授权、执行器或本地文件。

历史中缺少工具回执时，投影为结果未知，不永久显示执行中；纯读取不改写文件。续聊前追加正式的中断工具结果供模型恢复上下文，直播中的当前工具由运行状态覆盖为 pending / executing。

## AiRuntime 宿主接口

构造运行时需要 `AiRuntimeOptions`：

- `store.read / append / beginRun`：读取会话、按 expectedRevision 提交和占用运行租约。append 必须保证 operationId 重试不会重复追加。
- `tools`：AiToolRegistry，运行开始捕获选定定义与执行器。
- `resolveModel`：返回解析后的 pi Model、绑定当前提供方的 fetch 和 dispose；不由业务请求传入密钥。
- 可选 `prepareInput / preparePrompt / prepareTools`：宿主附件解析、提示词和本轮辅助工具装配。
- 可选 `permissionMode / approve / question / maxTurns`：权限模式、审批/提问承载与调用预算。

preparePrompt 可返回具名 sections 更新，按名称替换或以 null 撤销，不清掉原会话指令。移动宿主把技能目录与显式技能说明写在 tau-skills 段，每轮替换，禁用后撤销。通用运行时返回字符串或 content 时遵循 pi 的追加指令语义，需避免重复时使用具名段。

持久运行与单发均可传 maxOutputTokens / temperature；输出预算必须是正整数并受模型容量限制。每轮工具声明、撤销、模型与思考模式变更写入 v3，另一宿主能恢复历史定义，但不会继承工具执行权限。

公开运行方法包括 `start`、`retryLast`、`subscribe`、`getSnapshot`、`abort`、`waitForIdle`、`resolveApproval`、`requestQuestion`、`answerQuestion`、`releaseLibrary` 和 `dispose`。start 输入使用 AiRunStartRequest，结果为带 result / abort 的 AiRunHandle；订阅信封为 runId + seq + session，事件是完整 snapshot 或最终 settled。

用户消息和展示 entry 提交后才接受运行。assistant 的工具调用意图在执行前提交，工具结果在下一轮模型请求前提交；持久化失败结束运行。直播 partial 只存在运行快照中，块为 streaming；最终消息只取已提交历史，块为 final。保留的运行记录中，相同 runId 与相同请求复用同一运行，不同请求复用同一 runId 被拒绝；淘汰后的请求由持久用户 entry 阻止重复起跑。同一会话忙时不隐式排队；无观察者的已结束记录按会话保留最近一项、最多二十个会话，释放 Agent、模型和完整存储对象引用。

`generate(request, onSnapshot?)` 是无工具单发，保留 system 与用户/助手历史，返回 AiGenerationHandle；result 为 outcome、中立 ResponseMessage 和可选错误，不返回 SDK 消息对象。用户消息可带 `images: { data, mimeType }[]`（data 为不带 data URL 前缀的 base64），与桌面单发请求同形；助手历史不接受图片字段。它占用宿主运行租约但不创建持久聊天文件。取消后的写入不能被当成“从未发生”，工具回执未知时返回 AI_TOOL_OUTCOME_UNKNOWN 并停止本轮继续推理。

## 移动宿主

移动端具体门面在 [services/ai](/apps/mobile/src/services/ai/index.ts)，通过 `createMobileAiService(options)` 创建，或由明确消费者调用惰性的 `getMobileAiService()`。模块没有自动聊天、自动业务工具或页面入口。

| 门面         | 方法                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| models       | list、getConfiguration、resolve、verify                                       |
| sessions     | create、get、list、patch、remove、editHistory                                 |
| runs         | start、retryLast、subscribe、getSnapshot、abort、waitForIdle                  |
| generation   | start                                                                         |
| interactions | resolveApproval、requestQuestion、answerQuestion                              |
| tools        | register、list                                                                |
| skills       | registerSource、list、load、readResource                                      |
| mcp          | list、connect、disconnect、refreshTools                                       |
| lifecycle    | assertExecution、suspend、resume、releaseLibrary、prepareMaintenance、dispose |

sessions.list 按 offset / limit 查询目录行，默认每页 30、原生最多 100，不为列表读取消息文件。sessions.get 返回 row、document、revision、messages、leafId 和 formatVersion。修改使用读取到的 revision，库名和会话 id 显式传递；Rust 的库租约和代次负责拒绝切库/替换后的旧调用。

以下函数可在移动宿主中调用，不依赖组件挂载；调用者传入已登记库与已配置模型：

```ts
import type { AiModelRef } from "@tau/ai/contracts";
import { createMobileAiService } from "@/services/ai";

export async function startConversation(databaseName: string, model: AiModelRef) {
  const ai = createMobileAiService();
  try {
    const session = await ai.sessions.create({ databaseName, scope: "main-chat" });
    const handle = await ai.runs.start({
      runId: crypto.randomUUID(),
      session: { databaseName, sessionId: session.row.id },
      expectedRevision: session.revision,
      message: [{ type: "text", text: "你好" }],
      model,
      toolIds: [],
      skillIds: [],
      interactionMode: "none",
    });
    return await handle.result;
  } finally {
    await ai.lifecycle.dispose();
  }
}
```

默认权限为 manual；read 工具可执行，write / execute 需要确认。没有 approve / question 宿主时明确拒绝对应交互，不永久等待、不默认同意。`toolIds: []` 禁止工具；显式 skillIds 可以直接准备用户点名的说明，但不会授予额外工具权限。acceptEdits / bypass 必须由宿主显式配置，不能由模型参数决定。

tools.register 与 skills.registerSource 返回释放函数，可附带 databaseName 作用域。执行上下文中的库身份必须贯穿实际业务命令；不能在异步结束后重新读取 activeDatabase。MCP 使用每个服务冻结的原生网络上下文，工具调用前后复核库归属和租约；stdio 返回 unsupported_transport。所有 MCP 工具默认 execute，服务的只读注解不会自动降低风险。

Skills 来源通过 list/read 注入，来源宿主须校验真实路径与符号链接。目录只包含描述，正文按需加载；手动技能需明确选择，allowed-tools 只作为技能元数据保留，不授予能力。readResource 限于所选技能的相对路径，不提供脚本执行。

retryLast 使用 AiRetryRunRequest，按末尾用户 entryId 定位，复用问题与展示形态；空失败回答通过 context_edit 省略，以隐藏的 desktop-retry 消息触发续跑。已经有回答或工具调用时拒绝原位重试，调用者须显式选择历史编辑后重新发送。

内置输入解析支持纯文本与 data URL 内联图片，允许没有文字的纯图片消息。包含图片的新输入、宿主解析结果或恢复上下文要求模型 input 包含 image；不支持时在网络请求与新用户消息落盘前拒绝，不由 SDK 静默丢图。跨端历史投影使用权威 pi 用户消息中的内联图片字节填充展示图片，原 display.path 只保留来源信息。文件、普通 URL、设备路径和其他附件必须由 `prepareInput` 解析成模型输入；服务不会把桌面绝对路径当成手机可用资源，也不因 JSONL 同步自动恢复外部附件。

releaseLibrary 停止并等待该库运行、释放网络上下文与有作用域的注册；prepareMaintenance 忙时拒绝，成功返回用于结束本地维护门闩的函数；dispose 释放服务。suspend 停止并等待工作、关闭 MCP 和网络并释放原生租约，保留工具与 Skill 声明；resume 只解除暂停，新调用重新取得租约，不重放任务、不自动重连 MCP。工厂实例由宿主显式绑定 `bindMobileAiLifecycle`，返回函数可注销监听；惰性单例在首次调用时绑定 document 的 visibilitychange 与 pagehide / pageshow，不创建功能入口。系统立即冻结或杀进程时仍依靠已提交数据与事务恢复，不承诺后台继续运行。

## 模型与传输

设置沿用 llmProviders / llmUsageSettings。内置目录命中时，api、容量、输入模态与推理能力取目录值；目录未命中时使用模型级配置，再回退提供方协议。有效自定义价格优先于目录价格，采样参数、headers、compat 和 stripThinkTags 保留既有语义；容量缺失时不猜测窗口。

手机模型 Key 由 Rust 保存与注入，公开配置移除 Key 和请求头。原生上下文冻结地址、Key 和显式 headers，限定同源同路径前缀、禁止跟随重定向；鉴权头按 SDK 的实际请求形状选择，设置中的显式鉴权头优先。JS SDK 的 native-managed 是占位值，不是凭据。

## 验证

```sh
pnpm --filter @tau/ai test
pnpm --filter @tau/ai check
pnpm --filter @tau/ai check:browser
```

session 测试包含官方 SessionManager 双向文件读写和上下文差分。browser 脚本加载公共运行入口，在没有 process / Buffer / require 的 VM 中通过本机 HTTP 模拟模型 SSE 和官方 MCP 服务运行，产物位于 `output/mobile-ai-foundation/`；它不代表真实模型、手机设备或实际同步插件的传输验收。

浏览器包保留 pi-ai 的 Bun 专用环境变量回退分支，其中有受条件保护的 node:fs require；脚本不提供 Node polyfill 并验证该分支不执行。MCP 解析使用 Web 标准 TransformStream / TextDecoderStream，宿主须提供这些 API。
