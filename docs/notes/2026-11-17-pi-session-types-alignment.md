# pi 会话三套类型的对齐调研

目标：同一条 AI 会话消息在主进程存储层、packages/ai 运行时、渲染展示层各有类型且从未 structural 对齐，跨层转换靠 `as unknown as` 双断言（编译器失明）。本文盘点全部类型、数据流、焊点与第三方边界，给出可裁决的对齐方案。调研快照，代码现状以 2026-11-17 为准（pi SDK 1.5.2）。

## 1. 类型对照表

实际是**四套**相关类型（调研发现第四套：跨端展示模型），加上两个本地派生别名：

| #   | 类型                                                          | 定义位置                                                                                                                                                                                           | 形态                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | SDK `SessionEntry` / `FileEntry` / `SessionHeader`            | `@earendil-works/pi-coding-agent` `dist/core/session-manager.d.ts:128 / :130 / :5`（node_modules 内，版本 1.5.2+patch）                                                                            | 判别联合：11 种 entry（message / thinking_level_change / model_change / usage / compaction / branch_summary / custom / custom_message / context_edit / label / session_info），基座 `SessionEntryBase { type; id; parentId: string\|null; timestamp: string }`（:17-22） |
| A'  | 桌面本地 `RawEntry`                                           | `apps/desktop/src-electron/main/modules/pi-session-files.ts:52`                                                                                                                                    | 开放袋子 `{ type: string; id?; parentId?; [key: string]: unknown }`（parse 辅助）                                                                                                                                                                                        |
| B   | @tau/ai `SessionEntry` / `SessionHeader` / `SessionDocument`  | `packages/ai/src/session/types.ts:30 / :7 / :46`                                                                                                                                                   | 单一开放接口 `{ type; id; parentId; timestamp; message?: PiTranscriptMessage; [key: string]: unknown }`；桌面以别名 `SharedSessionEntry` 消费（pi-session-host-core.ts:28）                                                                                              |
| C   | @tau/ai `PiTranscriptMessage` / `PiTranscriptEntry`           | `packages/ai/src/session/types.ts:16 / :52`                                                                                                                                                        | 开放接口（消息载荷）；`PiTranscriptEntry = { id; message; display?; versions? }` 是树投影中间形态                                                                                                                                                                        |
| D   | SDK `AgentMessage`（= pi-ai `Message` ∪ 自定义角色）          | `@earendil-works/pi-agent-core` `dist/types.d.ts:322`；`Message` 在 `@earendil-works/pi-ai` `dist/types.d.ts:450`；`CustomAgentMessages` 经 pi-coding-agent `dist/core/messages.d.ts` 声明合并扩展 | `SystemMessage \| UserMessage \| AssistantMessage \| ToolResultMessage \| BashExecutionMessage \| CustomMessage \| BranchSummaryMessage \| CompactionSummaryMessage`（闭合联合、字段强类型）                                                                             |
| E   | `ChatSessionMessage`（= `RequestMessage \| ResponseMessage`） | `packages/shared/src/chat-core/messages.ts:192 / :158 / :179`                                                                                                                                      | 渲染端与桌面/移动/浏览器扩展共用的展示模型（本调研的"第四套"）                                                                                                                                                                                                           |

### 1.1 Entry 层对照（A vs B）

| 字段 / 能力                                                                                                                                       | SDK `SessionEntry`（A）                                                                                   | @tau/ai `SessionEntry`（B）                                                            | 关系                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                            | 各分支字面量（"message" 等 11 种）                                                                        | `string`                                                                               | 同名，SDK 窄 / B 宽                                                                                                            |
| `id` / `parentId` / `timestamp`                                                                                                                   | 必填，`parentId: string \| null`，`timestamp: string`(ISO)                                                | 同形同型                                                                               | 同名同型                                                                                                                       |
| `message`                                                                                                                                         | `type:"message"` 时必填，类型为 `AgentMessage`（D）                                                       | 可选 `message?: PiTranscriptMessage`（C）                                              | **同名不同型**（载荷类型不同，见 1.2）                                                                                         |
| message 外的专有字段（customType/data/targetId/replacement/summary/firstKeptEntryId/tokensBefore/systemMessage/provider/modelId/thinkingLevel/…） | 每个分支强类型必填                                                                                        | 全部落入 `[key: string]: unknown`                                                      | 单侧（SDK）结构化，B 侧靠 codec 运行时校验（codec.ts:33-90）+ 消费点 `as { … }` 内联断言（如 pi-session-files.ts:112/190/361） |
| 未知 entry 种类                                                                                                                                   | 类型不接受                                                                                                | codec 允许保留（展示可读），`buildSessionContext` 拒绝进模型上下文（context.ts:76-83） | B 更宽容（面向旧/未来文件）                                                                                                    |
| `compaction.firstKeptEntryId`                                                                                                                     | d.ts 声明 `string` 非空，但 SDK 自身 `appendCompaction(…, firstKeptEntryId: string \| null, …)` 接受 null | codec 按 `null \| string` 校验（codec.ts:63-64）                                       | SDK 类型声明与自身 API 有出入，B 以实际文件为准                                                                                |
| 索引签名                                                                                                                                          | 无（接口无隐式索引）                                                                                      | 有                                                                                     | **双断言的直接技术根因**：TS 不给接口推断隐式索引签名，A 的接口实例不能直接赋给 B                                              |
| `label` / `session_info` entry                                                                                                                    | 有（SDK 新增）                                                                                            | 无专有字段；context.ts:12-20 `stateEntries` 集合按字符串忽略                           | 同名不同型（B 靠集合枚举）                                                                                                     |

### 1.2 消息载荷对照（C vs D）

| 字段                                                   | `PiTranscriptMessage`（C）                                                                                                                                                                                                                  | D 中对应                                                                                                                                                                                                                                                                                                                                                                                                                                      | 关系             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `role?: string`                                        | 所有分支为字面量必填                                                                                                                                                                                                                        | 同名，C 宽                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `content?: unknown`                                    | system: `string \| TextContent[]`；user: `string \| (TextContent\|ImageContent)[]`；assistant: `(TextContent\|ThinkingContent\|ToolCall)[]`；toolResult: `(TextContent\|ImageContent)[]`；custom: `string \| (TextContent\|ImageContent)[]` | 同名，C 宽（unknown）                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `toolCallId?` / `toolName?` / `isError?`               | toolResult 分支必填（`toolCallId/toolName/isError`）                                                                                                                                                                                        | 同名，C 宽                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `details?: unknown`                                    | toolResult `details?: JsonValue`；custom `details?: T`                                                                                                                                                                                      | 同名，C 宽                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `timestamp?: number`                                   | 各分支 `timestamp: number` 必填                                                                                                                                                                                                             | 同名，C 宽（可缺）                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `provider?` / `model?`                                 | assistant 分支 `provider/model` 必填，另有 `api/usage/stopReason` 必填                                                                                                                                                                      | C 只声明 `provider?/model?`，其余（api、stopReason、usage.cost 等）落入索引签名                                                                                                                                                                                                                                                                                                                                                               |
| `usage?: { input?; output?; cacheRead?; cacheWrite? }` | `usage: Usage` 必填：`{ input; output; cacheRead; cacheWrite; cacheWrite1h?; reasoning?; totalTokens; cost{…} }`                                                                                                                            | **同名不同型**：C 是可选四字段平铺，D 必填且含 cost/totalTokens；投影层 updateUsage（projection.ts:158-172）只读 C 形状的四个字段                                                                                                                                                                                                                                                                                                             |
| 单侧独有                                               | `[key: string]: unknown`                                                                                                                                                                                                                    | system：`sections?/toolsAdded?/toolsRemoved?`；assistant：`responseModel?/responseId?/providerThinkingLevel?/thinkingLevel?/diagnostics?/deferred?/errorMessage?/rawStopReason?/endTurn?/durationMs?`；toolResult：`usage?/nestedCalls?/durationMs?`；bashExecution：`command/output/exitCode/cancelled/truncated/fullOutputPath?/excludeFromContext?`；branch/compactionSummary：`summary/tokensBefore/fromId`；custom：`customType/display` | C 靠索引签名吞下 |

结论：**C 是 D 的"运行时超集、类型学子集"**——任何 D 实例结构上都满足 C（除 TS 索引签名规则），反之不成立（C 缺 D 的必填字段）。因此 `D→C` 方向的断言"通常能跑"，`C→D` 方向（runtime.ts:711、context.ts:153）是把缺必填字段的开放接口当强类型联合用，完全依赖"这些 C 其实是落盘过的 D"这一运行时事实。

### 1.3 E（展示层）与 C/D 的关系

`ChatSessionMessage` 不与 C/D structural 对齐，而是经**显式映射函数**单向生成：`projectTranscriptMessages`（packages/ai/src/session/projection.ts:179）把 `PiTranscriptEntry[]` 投影为 `ChatSessionMessage[]`；反方向 `desktopMessagesToPi`（pi-session-bridge.ts:207）把历史灌入转回 pi `Message[]`。这一对已经是"显式映射"范式的现成样板，也是本方案建议推广的形态。

## 2. 数据流向与跨类型转换点

三条链路 + 一条恢复链。⇒ 表示显式映射，⟹ 表示双断言焊点，→ 表示同类型传递。

### 2.1 桌面宿主活会话（pi SDK 直驱）

```text
渲染端 ChatSessionMessage 历史
  ⇒ desktopMessagesToPi（pi-session-bridge.ts:207，E→D 显式映射）
  → assembleHostSession（pi-session-host-core.ts:411）→ SDK SessionManager.appendMessage（D 落盘 JSONL）
用户输入 pi-session:prompt（pi-session-host.ts:1069）
  → session.prompt（补丁版 AgentSession）→ SDK 内部 D 消息流
  → AgentSessionEvent（SDK 类型）原样经 IPC "pi-session-event" 结构化克隆到渲染端（pi-session-host.ts:984；
    契约由 pi-session-host-core.test.ts:329 守护）
  → 展示 entry：createDisplayEntryWriter（host-core.ts:126）监听 message_end(user) 后 appendCustomEntry(desktop-display)
读取投影（settled 后 / find-by-scope / edit 后）
  → SDK SessionManager.getEntries()（返回 A）
  ⟹ pi-session-host-core.ts:113  A[] → SharedSessionEntry[]（=B）
  → getSessionTranscript（packages/ai/src/session/tree.ts:86，B→C' PiTranscriptEntry[]）
  ⇒ projectTranscriptMessages（projection.ts:179，C'→E 显式映射）
  → IPC → 渲染端容器
```

### 2.2 桌面只读链（不开宿主）

- `pi-session:transcript` → readTranscript（pi-session-store.ts:27）→ loadSessionTranscript（host-core.ts:99，SDK `SessionManager.open` 容错解析+迁移）⟹ 同上 113 焊点 → 投影。
- `pi-session:turn` → ConversationTurnReader（pi-conversation-turn.ts:110）→ SDK `parseSessionEntries` → `SessionManager.inMemory`：
  - ⟹ pi-conversation-turn.ts:42 `getEntries()` A[] → B[]（@tau/ai 导入的 `SessionEntry`）；
  - ⟹ pi-conversation-turn.ts:78 `getBranch(leaf)` A[] → B[]。
- `pi-session:tree` → conversationTreeOf（pi-session-files.ts:252，直接消费 A，用内联 `as { message: … }` 断言读字段）。
- 旧聊天迁移：writeSessionFile（pi-session-files.ts:59）手工拼 v3 JSONL（`Message[]` + 展示 data → A 形状的行）；pi-session-files.test.ts:123 验证 pi 可 resume。

### 2.3 移动端 / @tau/ai 运行时链（packages/ai）

```text
MobileAiService.start（apps/mobile/src/services/ai/service.ts:181，唯一 AiRuntime 消费方）
  → AiRuntime.prepare（packages/ai/src/runtime/runtime.ts:537）
  → native.readSession 分块读文件 → parseSessionFile（codec.ts:92，B 严格解析 v3）
  → buildSessionContext（context.ts:86）→ SessionContext.messages: PiTranscriptMessage[]（C）
  ⟹ runtime.ts:711  C[] → AgentMessage[]（D，Agent initialState.messages）
  → SDK Agent 循环；convertToLlm 回调
  ⟹ runtime.ts:716  D[] → C[]（711 的逆方向，交给 convertSessionMessagesToLlm）
  ⟹ context.ts:153  C（system/user/assistant/toolResult 四角色）→ pi-ai Message（D 的 LLM 子集）
  → streamFn 发请求
Agent 事件（message_end 携带 D）
  → handleEvent（runtime.ts:763）append { type:"message", message }（D 存进 B 的索引签名）
  → appendSessionEntries + serializeSessionFile（codec.ts:130）→ native.commitSession 落盘
流式快照
  ⟹ runtime.ts:529  pi-ai AssistantMessage（D）→ C → projectTranscriptMessages（⇒E）
```

### 2.4 重启恢复

- 桌面：`SessionManager.open` → SDK `loadEntriesFromFile`（坏行静默跳过；header 缺 version 按 v1，内存迁移 v1→v2 补树 / v2→v3 hookMessage→custom，不回写文件）→ closeDanglingToolCalls（pi-session-files.ts:355，补 isError toolResult 落盘）→ createAgentSession 按 SDK buildSessionContext 重建。
- 移动：native 分块读 → @tau/ai `parseSessionFile`（**严格**：中间坏行抛 `AI_SESSION_INVALID`；尾行截断进 diagnostics 且禁止续写，须备份后显式恢复；version≠3 抛 `AI_SESSION_FORMAT_UNSUPPORTED`）。

## 3. 焊点全清单（pi/AI 会话相关 `as unknown as`）

| 位置                                           | 转换两端                                                                                 | 性质                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/session/codec.ts:89`          | 运行时校验后的 `Record<string, unknown>` → B `SessionEntry`                              | 受控断言（前面 40 行逐字段校验），语义安全但形式上仍绕过编译器                                                  |
| `packages/ai/src/session/codec.ts:95`          | `undefined` → `SessionHeader`（解析循环中的占位初始化）                                  | 文件内 benign，循环结束必有值或已抛错                                                                           |
| `packages/ai/src/session/context.ts:153`       | C（四标准角色）→ pi-ai `Message`（D）                                                    | **不安全方向**：C 缺 D 必填字段（如 assistant 的 api/usage.cost/stopReason），靠"落盘过的都是 SDK 写的"这一事实 |
| `packages/ai/src/runtime/runtime.ts:529`       | pi-ai `AssistantMessage`（D）→ C                                                         | 安全方向（D 结构上满足 C），因索引签名规则需断言                                                                |
| `packages/ai/src/runtime/runtime.ts:711`       | C[] → `AgentMessage[]`（D，Agent initialState）                                          | **不安全方向**，同 context.ts:153                                                                               |
| `packages/ai/src/runtime/runtime.ts:716`       | `AgentMessage[]`（D）→ C[]（convertToLlm 回调入参）                                      | 安全方向；与 711 构成同一数组的往复视角互换                                                                     |
| `apps/desktop/.../pi-session-files.ts:430`     | SDK `parseSessionEntries` 返回 `FileEntry[]`（A，含 header 行）→ 本地 `RawEntry[]`（A'） | 宽化，实际安全；结果含 header 行这一语义靠约定                                                                  |
| `apps/desktop/.../pi-conversation-turn.ts:42`  | SDK `getEntries()` A[] → B[]                                                             | 索引签名 + 载荷类型双重不匹配                                                                                   |
| `apps/desktop/.../pi-conversation-turn.ts:78`  | SDK `getBranch(leaf)` A[] → B[]                                                          | 同上                                                                                                            |
| `apps/desktop/.../pi-session-host-core.ts:113` | SDK `getEntries()` A[] → `SharedSessionEntry[]`（B）                                     | 同上；这是**桌面所有投影的唯一入口焊点**                                                                        |
| `apps/desktop/.../model-usage/trackers.ts:173` | `SessionEventLike`（本地宽事件形状）message_end → pi-ai `AssistantMessage`               | 事件通道的局部收窄，用量提取用                                                                                  |
| `apps/desktop/.../pi-ai-runtime-core.ts:76`    | SDK `ModelRuntime` → 本地 `ModelRuntimeLike`                                             | 值形状收窄（懒加载目录查询），非消息类型；可与本任务解耦                                                        |

相关半焊点（`as never`，同链路）：pi-session-files.ts:392（手工 toolResult 字面量 → `appendMessage` 参数）、pi-session-host-core.ts:212 与 pi-session-host.ts:1107（images 参数）、pi-session-bridge.ts:397/416 与 pi-session-host.ts:657（tool result details）。测试文件内的双断言（session.test.ts:39、prompt-sections.test.ts:37/80、think-stream-rewriter.test.ts 等）是夹具构造，不列入治理。

## 4. 第三方边界（不可改面）

三个 SDK 包，全仓统一 1.5.2（2026-11-16 起）：

- **@earendil-works/pi-coding-agent**（仅桌面主进程，18 个非测试文件导入）：值 `SessionManager`、`parseSessionEntries`、`CURRENT_SESSION_VERSION`、`createAgentSession`、`ModelRuntime`、`DefaultResourceLoader`、`SettingsManager`；类型 `SessionEntry`、`FileEntry`、`AgentSession`、`AgentSessionEvent`、`ToolDefinition`、`AgentToolResult`、`ExtensionAPI`、`InlineExtension`、`ResourceLoader`。
- **@earendil-works/pi-ai**（桌面 + packages/ai）：值 `fauxProvider`、`createModels`、`createProvider`、`getSupportedThinkingLevels`、`normalizeContext`、`getCurrentSystemMessage`、`getCurrentTools`；类型 `Message`、`AssistantMessage`、`AssistantMessageEvent`、`UserMessage`、`ImageContent`、`TextContent`、`Api`、`Model`、`Provider`、`MutableModels`、`ProviderStreams`、`Context`；子路径 `api/openai-completions|openai-responses|anthropic-messages`、`providers/all`。
- **@earendil-works/pi-agent-core**（仅 packages/ai）：值 `Agent`；类型 `AgentEvent`、`AgentMessage`、`AgentTool`、`StreamFn`。

升级频率佐证（git log，依赖变更提交共 3 次）：

- 2026-09-26 `5b5f27012` 首次引入（pi 迁移 M0）；
- 2026-10-29 `0f8741e1c` 移动端接入 @tau/ai（携 pi-agent-core）；
- 2026-11-16 `443707504` 0.87.1 → 1.5.2 一次大版本跳：适配 17 个文件、新增 98 行补丁 `patches/pi-coding-agent@1.5.2.patch`。

补丁内容：给 `AgentSession` 加 `activePromptRunId` / `prompt({ queueForRun })` / `"not-streaming"` disposition——插话（steerHostSession，host-core.ts:193）依赖它。**每次 SDK 升级必须重放/重做补丁**，这是比类型漂移更硬的耦合点。

另一个隐蔽边界：`AgentMessage` 的联合成员取决于编译单元是否 import 了 pi-coding-agent（`CustomAgentMessages` 声明合并是全局的）。packages/ai 的转换代码若不引 pi-coding-agent，就看不到 custom/bashExecution/branchSummary/compactionSummary 四个角色——现状 runtime.ts 恰好间接可见（经 pi-ai + 测试引入），属未声明的事实依赖。

## 5. 持久化面

- **格式**：pi 会话 v3 JSONL，一行一个 JSON 对象；首行 header `{ type:"session", version:3, id, timestamp, cwd }`，后续 entry 行（A 的 11 种 + 桌面扩展 customType：`desktop-display` / `desktop-leaf` / `tau-run` / `desktop-retry`）。文件名 `<ISO 时间戳>_<sessionId>.jsonl`（pi-session-files.ts:47）。
- **写入**：桌面活会话由 SDK `SessionManager._persist` 追加（首条 user/assistant 消息才建文件；桌面 ensureFlushed 用 `wx` 兜底只有用户消息的文件，pi-session-files.ts:411）；移动由 @tau/ai `serializeSessionFile` 整文序列化后经 native CAS 提交；迁移器 writeSessionFile 手工拼整文件。**未知字段往返保留**（serialize 是原对象 JSON.stringify，不投影重建）。
- **实际进文件的字段**：SDK 写什么就进什么——即 D 消息全字段（usage 含 cost/totalTokens、provider 签名、thinking 签名等）+ entry 结构字段。@tau/ai 侧同样（append 的 message 就是 SDK Agent 吐的 D）。
- **旧版本兼容现状**：
  - SDK 读取：header 缺 `version` 按 v1，内存迁移 v1→v2（补 id/parentId 链、compaction 下标换 id）、v2→v3（hookMessage→custom）；**不回写文件**（磁盘 header 可能仍是旧版本号）；坏行静默跳过（parseSessionEntries / loadEntriesFromFile 一致）；文件非空但完全无 entry 时抛错。
  - @tau/ai 读取：**version≠3 直接拒绝**（AI_SESSION_FORMAT_UNSUPPORTED，codec.ts:19-22）；即移动端读不了 v1/v2 旧文件（设计取舍：迁移旧文件是桌面 SDK 的职责）。
  - 桌面读路径全走 SDK 容错解析；@tau/ai 严格解析只发生在移动端。**同一文件格式、两个解析器、两套失败语义**是持久化面的现状事实。
- **版本标记/自愈**：无专门自愈。对照 decisions.md 的正文/白板自愈惯例（读取前备份原始字节再补齐写回），pi 会话文件没有等价机制：SDK 静默跳过坏行（信息丢失不可见），@tau/ai 对截断尾行有诊断（incomplete-tail，阻塞续写直至人工恢复）——后者已具备"不静默丢弃"的语义，前者（SDK）不受本仓控制。

## 6. 方案建议（供裁决）

### 6.1 权威类型选择

**推荐：文件格式与 entry/消息的权威归 pi SDK（A/D），@tau/ai 类型降级为 SDK 类型的显式视图（收窄 + 扩展），转换收敛为命名映射函数。**

理由：格式事实源在 SDK——`CURRENT_SESSION_VERSION`、v1/v2 迁移、读写器全部由 SDK 拥有；0.87→1.5 升级证明 entry 种类随 SDK 演进（label/session_info 即新增）。让 @tau/ai 的类型直接引用 SDK 类型后，SDK 变更在编译期暴露到全部消费点，而不是在运行时漂移。桌面扩展字段（desktop-display 等）以 SDK `CustomEntry<T>` 泛型参数或本地判别窄化承载。

反方案权衡：

- _@tau/ai 拥有 schema、SDK 当外部边界_：需要一个持续追平 SDK 的影子 schema，正是当前漂移的根源；且 v3 语义（压缩边界、context_edit）无法脱离 SDK 行为单独定义，差分测试也得跟着追。不推荐。
- _维持双类型、只加运行时守卫_：焊点减少但两套类型继续并存，SDK 加字段时守卫与影子类型都要手动跟。仅作为不想动 types.ts 时的降级选项。

`PiTranscriptMessage`（C）本身**建议保留**：它是 @tau/ai 对外的稳定内部协议（移动端、投影、上下文构建都靠它隔离 SDK 版本），但它的产生与消费必须经第 6.2 节的映射函数，不再裸断言。

### 6.2 焊点替换路径：显式映射函数（推荐）vs 类型守卫

**推荐显式映射函数（构造式转换）**，集中在 `packages/ai/src/session/convert.ts`（新文件）：

- `transcriptFromAgentMessage(m: AgentMessage): PiTranscriptMessage`（D→C，浅拷贝白名单搬运）
- `agentMessageFromTranscript(m: PiTranscriptMessage): AgentMessage`（C→D，按 role 分派并校验必填字段，缺失抛 AiError——拒绝比误造安全）
- `documentEntriesFromSdk(entries: SdkSessionEntry[]): SessionEntry[]`（A→B，桌面三处焊点共用）

维护成本对比：

- 映射函数：每方向一个函数；SDK 升级时 review 一个文件即可看到全部白名单差异；新字段默认不透传（显式决策点），落盘不受影响（SDK 写的仍是全量 D）。缺点：每轮长上下文全量浅映射 O(n)（与现有 structuredClone 相比更便宜，风险可控）。
- 类型守卫（`isAgentMessage` 等运行时校验 + 单断言）：零拷贝，但要穷举 SDK 联合——SDK 加字段时守卫要么漏放行（形同虚设）要么误拒旧数据（读档回归）；且"校验了但没转换"仍依赖两侧类型永远同构。不推荐作为主路径，可作为 C→D 方向的内部实现细节（校验后构造）。

`runtime.ts:711/716` 的往复互换：Agent 状态数组的真实不变量是"放进去什么角色，拿出来还是什么角色"。最小改法是收敛到上述一对命名函数并注释不变量；若想彻底类型化，可为 `Agent` 的 messages 访问器写薄包装（改动面大，不建议首期做）。

### 6.3 分步实施计划（每步独立可验证）

| 步骤 | 内容                                                                                                                                                                                          | 触点文件                                                                           | 验证                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | packages/ai 内部：新建 convert.ts，替换 context.ts:153、runtime.ts:529/711/716 五个方向                                                                                                       | ~3（context/runtime/新 convert）                                                   | `pnpm --filter @tau/ai test`（session + runtime 全套，含官方差分与往返测试）+ 包内 tsc                           |
| 2    | 桌面读路径：SDK→B 的 entry 转换收敛为 `documentEntriesFromSdk`，替换 host-core.ts:113、conversation-turn.ts:42/78                                                                             | ~4（host-core、conversation-turn、pi-session-transcript 转导出、packages/ai 导出） | desktop `pnpm check`（tsc）+ pi-session-resume / pi-session-files / pi-session-store / pi-session-host-core 测试 |
| 3    | types.ts 重构：@tau/ai `SessionEntry` 基于 SDK 类型定义（保留索引扩展与未知 entry 宽容语义），codec.ts:89 成为唯一受控断言点（注释不变量）；顺带处理 compaction.firstKeptEntryId 的 null 口径 | ~6-8（types/codec/context/tree/projection/index + 桌面两处导入）                   | @tau/ai 全测 + desktop tsc + mobile service 测试（间接消费）                                                     |
| 4    | 清理尾部：pi-session-files.ts:430 RawEntry 收紧或退役、trackers.ts:173 收窄、`as never` 半焊点逐个消灭、convert.ts 若已覆盖则删除对应注释                                                     | ~5                                                                                 | tsc + 对应模块测试                                                                                               |

估计总触点：packages/ai 6-8 个、桌面 6-7 个、移动 0-1 个（纯类型间接）；无落盘格式变化。

### 6.4 保数据策略

- 落盘事实源不动：SDK `SessionManager._persist` 与 @tau/ai `serializeSessionFile` 保持"原对象序列化、未知字段往返保留"——现有测试 `session.test.ts:46`（保留未知字段与提供方签名）即护栏，每步必跑。
- 差分测试是主护栏：`session.test.ts:115-193` 已覆盖"官方落盘→公共读取、公共追加→官方恢复、buildSessionContext 与官方一致"。步骤 1-3 任何一步破坏往返即失败。
- 旧文件读取边界保持现状：桌面（SDK 容错+迁移）与移动（严格 v3）的分工不变；映射函数对未知 entry 种类沿用"保留展示、拒绝进上下文"的既有语义（context.ts:76-83 已有测试 session.test.ts:102）。
- 不在本任务引入"备份+自愈写回"：对照 decisions.md 自愈惯例，pi 会话文件的坏行检测已在 @tau/ai 侧具备（incomplete-tail 诊断阻塞续写），SDK 侧静默跳过不可控；补自愈属于独立决策，建议单独立项评估，避免与类型对齐混在一个回滚面里。

### 6.5 风险点与回滚面

- **SDK 大版本升级**（0.87→1.5 已发生一次）：patch 必须重做；映射函数白名单需要 review——这正是本方案的目的（把漂移从运行时静默搬到编译期 + 单文件 review 点）。
- **声明合并陷阱**：convert.ts 必须显式 import pi-coding-agent（或其 messages 模块）以保证 `AgentMessage` 联合含四个自定义角色，否则 custom/bashExecution 分支漏转。建议在 Step 1 加一行结构性断言测试（custom 角色经映射往返）。
- **C→D 校验失败路径**：历史文件中若存在缺必填字段的 assistant 消息（旧版本/手写），映射会抛错而非静默。需要决定：报 `AI_SESSION_FORMAT_UNSUPPORTED`（与现codec 口径一致，推荐）还是补默认值。抛错会改变"SDK 能读、@tau/ai 报错"的现有可见差异面，Step 1 实施时用测试锁口径。
- **性能**：长会话（数千 entry）每轮全量映射；现有测试有长链用例（messageVersionsOf 注释提及上千 entry），Step 1 后跑一次现有套件观察。
- **回滚面**：每步独立提交、无 schema/落盘/IPC 变化，回滚 = revert 单个提交；Step 3 触点最多，可再拆为"类型定义切换"与"消费点收紧"两个提交。

## 7. 现有测试覆盖（实施护栏）

| 文件                                                                                                                                                                   | 覆盖点（与本任务相关）                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/session/__tests__/session.test.ts`                                                                                                                    | v3 编解码往返与未知字段保留（:46）；截断尾行诊断与禁续写（:65）；坏行/重复身份/悬空父/未来版本拒绝（:80）；未知 entry 保留展示拒上下文（:102）；**与官方 SDK 的上下文差分**（:116/:139/:163）；官方↔公共同一文件来回续写（:171）；分支/版本/省略/展示投影（:195-311） |
| `packages/ai/src/session/__tests__/interrupted.test.ts`                                                                                                                | 纯读取历史把无回执工具投影为"结果未知"                                                                                                                                                                                                                                |
| `packages/ai/src/session/__tests__/portable-images.test.ts`                                                                                                            | 跨设备展示记录的图片数据投影                                                                                                                                                                                                                                          |
| `packages/ai/src/runtime/__tests__/runtime.test.ts`（及同目录 retry/generation/questions/limits/prompt-sections）                                                      | 消息持久化时序（:28/:59）、真实上下文续聊（:99）、落盘失败不执行工具（:197/:220）、悬挂工具补记录（:344）、流式块身份一致（:385）——覆盖 runtime.ts 全部焊点行为                                                                                                       |
| `apps/desktop/.../__tests__/pi-session-files.test.ts`                                                                                                                  | 迁移文件可被 pi resume（:123）；回退/分叉/切版本/省略的树操作与重开持久（:158-313）                                                                                                                                                                                   |
| `apps/desktop/.../__tests__/pi-session-resume.test.ts`                                                                                                                 | JSONL 事实源投影成桌面消息（:81）；同文件 resume 模型可见上一轮（:114）；无文件按目录表 id 新建（:154）；悬挂工具补中断结果（:211/:237）                                                                                                                              |
| `apps/desktop/.../__tests__/pi-session-host-core.test.ts`                                                                                                              | faux 端到端装配→prompt→settled（:242）；全部 AgentSessionEvent 可 IPC 结构化克隆（:329）；默认工具切 powershell（:365）；图片进请求体（:414）                                                                                                                         |
| `apps/desktop/.../__tests__/pi-session-store.test.ts` / `pi-session-display.test.ts` / `pi-session-retry.test.ts` / `pi-steer.test.ts` / `pi-host-concurrency.test.ts` | 会话目录读写/删除/同步清单；展示 entry 认领；失败重试复用原 entry；插话（patch 面）；同文件并发宿主互斥                                                                                                                                                               |
| `apps/mobile/src/services/ai/__tests__/service.test.ts`                                                                                                                | 分块 UTF-8 读取与 revision CAS（:185/:220）；历史编辑走原生 CAS；失败重试复用原 entry（:649）；@tau/ai 运行时的移动端集成面                                                                                                                                           |

缺口：`pi-conversation-turn.ts` 无独立测试文件（经 pi-session-resume/pi-session-host 间接覆盖部分路径）；SDK `FileEntry[]`（含 header 行）→ 投影链的 header 处理无直接断言；`convertSessionMessagesToLlm` 的 bashExecution 分支在 @tau/ai 测试中未直接覆盖（SDK 侧有 convertToLlm 自测）。Step 2/4 落地时这些是优先补断言的位置（遵循测试投入规则：属契约对账类）。
