# pi 迁移交接文档（refactor/pi-harness 分支）

> 2026-09-27 交接（M2-f 完成；M3-a 工具权限与队列交互闭环已接入，尚未提交）。新会话续接方式：读完本文档 +
> `git log --oneline -15` 对照提交历史。验证三件套：`cd apps/desktop && npx tsc --noEmit`、
> `npx vitest run`（325 文件、1515 用例通过；2 文件、3 用例跳过）、`ELECTRON_RUN_AS_NODE=1 npx electron scripts/pi-smoke.mjs`。
> **注意 cwd 必须在 apps/desktop**——vitest 从仓库根跑会整体失败（vite 别名解析不到）。
> 权威背景：调研报告与迁移计划在本项目最初会话中形成（对话内）；本文档是执行态的完整快照。

## 一、背景与目标（用户裁决的硬性原则，永远有效）

把自研 agent 运行时（约 1 万行：协议适配 + SSE 传输 + Agent 循环 + chat-core 消息模型）
整体替换为 pi agent（`@earendil-works/pi-coding-agent` 0.87.x，MIT，earendil-works/pi，
原 badlogic/pi-mono）。

1. **Big-bang 无过渡态**：围绕 pi 重写而非适配已有体系；最终形态无兼容层；
2. **以 pi 为准**：设置模型对齐 pi（旧数据一次性转化）；聊天上传仅文本+图片（文件由模型 read 工具读取）；
3. **内置工具默认启用**（read/bash/edit/write + powershell 兜底），选择权交用户（D-060 权限模式映射到 pi 的 tool_call 拦截）；
4. **会话事实源 = pi JSONL**（`~/.editor/sessions/<库名>/`），sqlite 只留轻量目录表；数据库同步机制捎带 JSONL（manifest 防静默丢）；
5. **老数据启动时一次性整体升级**为 pi 会话（VACUUM INTO 备份 + migration_meta）；
6. 完成后旧链路全删（packages/agent、chat-core 展示层、chat_run 表等，M8）。

**架构方法论教训（用户两次纠偏确立，新会话勿再犯）**：

- 发现 bug 时先问"是不是设计层缺陷"，禁止往错误设计上叠护栏打补丁；
- 有生命周期的组件不得持有跨轮次/跨页面的运行状态——运行态归属模块级服务，
  组件只是 UI 视图。

## 二、架构现状（M2-f + M3-a）

```
主进程（Electron，node 24.18）：
├─ modules/pi-ai-runtime-core.ts   v2设置→pi Provider（内置目录兜底）、注册表、单发上下文
├─ modules/pi-ai-runtime.ts        单发 IPC：pi-ai:single-shot + 流事件（含 partial 全量快照原样透传）
├─ modules/think-stream-rewriter.ts <think>兜底剥离；为重排后事件重建 partial 快照
├─ modules/pi-session-bridge.ts    ①desktopMessagesToPi：chat-core 消息→pi 消息（历史灌入；
│                                    assistant_blocks 按 turn 还原 assistant/toolResult 对，
│                                    thinking 不回放规避签名问题；图片按 path 优先读文件转 base64）
│                                  ②PiToolCallBridge：customTools execute 经 pi-tool-call 事件
│                                    挂起渲染端，结果经 pi-session:tool-* 回传，断连中止
├─ modules/pi-session-host-core.ts 会话装配：ResourceLoader/Git Bash 探测（WSL 排除/where git
│                                    反推/powershell 兜底）/历史灌入/thinkingLevel/retry(默认5)/
│                                    动态 systemPrompt 扩展（before_agent_start 每轮替换）
└─ modules/pi-session-host.ts      会话宿主：create/prompt/steer/abort/dispose/set-system-prompt/
                                   tool-*/find-by-scope IPC；AgentSessionEvent 原样透传
                                   （pi-session-event 按 sessionId 路由；scope=会话键，见坑 1）

渲染进程：
├─ commands/piAi.ts                单发封装（原生 AssistantMessageEvent 含 partial）
├─ commands/piSession.ts           会话封装 + onPiSessionEvent/onPiToolCall 订阅
├─ services/piLLM.ts               单发统一入口：piStreamChat（原生事件流）/piStreamText
│                                  （partial 文本快照流）/piCompleteChat；PiChatResult 带 aborted
├─ services/piChatSession.ts       chat↔pi 会话生命周期（piChatSessionManager）：
│                                  ensure（模型/档位变化自动重建）/recreate（编辑重发等显式重建）/
│                                  adoptOrResolveSession（find-by-scope 收养）/
│                                  buildPiChatSystemPrompt（skills 清单+$点名全文）
├─ services/piChatEvents.ts        PiChatEventReducer：AgentSessionEvent→assistant_blocks 快照归约。
│                                  关键机制：50ms trailing 节流（message_update 每 delta 全量
│                                  produce 直驱渲染会卡顿；message_end/工具事件前 flush 保终态）；
│                                  turnId 全局递增（多轮/恢复各建 reducer 撞 `${turnId}:reasoning`
│                                  块 id 会错乱）；turn 粒度=pi 一次 assistant message
├─ services/piToolBridge.ts        pi-tool-call→ToolRegistry 执行→回传；
│                                  executeToolCall 上下文可被一次性会话的 additionalTools 接管
├─ services/piAgentRunner.ts       一次性 pi 会话运行器（inMemory+工具桥+历史灌入+settled 后
│                                  dispose + excludeToolNames 防子代理递归）
├─ services/piChatRuntime.ts       ★模块级归约运行时（最后落地的核心，见下节）
├─ ChatContainer.tsx               纯 UI + 发送编排（5 场景共用：主聊天/停靠栏/PDF/视频笔记/
│                                  学习项目）；ask_question 恢复经 find-by-scope 收养续流
└─ stores/useSettingStore.ts       llmProviders v2 上线（迁移挂载于 mergeSettingWithDefaults）

**已删除（M2-f）**：useChatLLM/chatStreamCore、DesktopModelProtocolAdapter(1118行)/Transport、
llmSettingsDowngrade、openai-reasoning-effort、commands/stream-fetch、subagentAgentPolicies、
chatRunManager/useChatRunStore/commands:chat-run/types:chat-run（渲染端链路）。
保留待 M8 复查：主进程 modules/llm.ts（chat-openai，Integration/Minimax 设置连接测试用）、
utils/openai-responses-adapter（llm.ts 依赖）。chat_run 主进程表与 handler 留存至 M8。
```

### piChatRuntime（模块级运行时，理解现状的核心）

**演进史（三次修正，教训都在这里）**：

1. 批次 B 初版：每轮发送新建 reducer + 闭包快照（sinkChat）→ 停止后立即发消息时
   两轮快照并存，旧快照 settled 持久化整行覆盖 → **吞消息**；
2. 修正一：去闭包化（produce(actualChatRef.current) 单一事实源）+ reducer 会话常驻；
3. 修正二（用户指出"组件卸载状态就没了"）：整体下沉模块级——ChatContainer 卸载
   （切页/关面板）后归约继续、落库继续，重挂载拿回同一容器无缝接续。

**现状结构**：每 conversationKey（`${chatScope前缀}:${chatId}`）一份常驻条目：

- **chat 容器** `{current: ChatMessage}`——聊天行单一事实源，组件的 actualChatRef 直接
  复用该对象（非拷贝）；新对话 id 0→N 时容器对象不变随 key 迁移（adoptConversation）；
- **常驻 reducer**（bindSession 按 sessionId 复用/重建，recreate 会话自动换绑）；
- **streaming 位**：agent_start/agent_settled 事件驱动 + subscribe 通知组件刷新 sendLoading；
- **写入链**：produce(容器 current) → publish（deps.publish=组件的 updateCurrentChat prop，
  store 更新驱动 UI 订阅链，withStreamingUpdateTime 拨时间戳）→ settled 时 persist
  （deps.persist=persistFinishedChatAndGenerateTitle，含标题生成；UI 副作用均 null 安全，
  卸载后调用无害）；
- **deps 由挂载组件每次渲染刷新**——必须是无组件生命周期引用（store action/IPC command）。

**sendLoading 双源**：pending（本轮提交中，含停止后排队等待）|| runtime streaming。
**stopStreaming**：setSessionPending(false) + forceStopStreaming（立即反馈）+ 后台
piSessionAbort 自行收尾（settled 落库幂等）。

### M3-a 工具审批（2026-09-27）

- `modules/pi-tool-permissions.ts` 按 pi 宿主会话持有待审批请求与「本会话始终允许」。
  装配后包装 `session.agent.beforeToolCall`，保留 pi 扩展的决定，再审批最终参数；
  使用原生钩子的 AbortSignal 取消等待，避免 `tool_call` 扩展事件没有 signal 导致停止死锁。
- 内置 read/grep/find/ls = read、edit/write = write、bash/powershell = execute；
  注册表工具透传 risk/source；远端 MCP 默认 execute；未声明风险的额外工具也按 execute。
  有交互界面的内容编辑工具仍使用自己的审阅卡，不双重确认。
- 主聊天五场景显式传 `interactiveApprovals: true`；一次性生成、子代理等无审批界面的
  入口默认 false，需要确认时返回明确拒绝结果，不偷偷执行或无限等待。
- `pi-session:approvals` 查询与 `pi-tool-approvals` 事件只向创建窗口发送快照；
  `pi-session:approve-tool` 按 sender + sessionId + 随机 requestId 校验，迟到/重复审批失效。
  模式变更即时释放已无需确认的等待；abort/dispose/窗口销毁清理待审批，销毁清除会话授权。
- 渲染端 `approvalStore` 仅保存带版本号的快照投影，不再持有 Promise resolver 或授权事实，
  无 `@tau/agent` 依赖；旧 `createToolPermissionPolicies` 已删除。
  `PiChatEventReducer` 映射 awaiting-approval，`piChatRuntime` 持久化等待工具卡，
  切页后台持续归约；重载后先收养宿主、恢复原 turn 工具卡和事件订阅，再开放审批按钮。
- `find-by-scope` 同时返回创建时的模型/推理档位，收养后继续复用宿主，避免下一轮
  因空模型身份误重建而丢掉会话授权；真正切模型/重建/删除会话时授权清空。
- 主进程重启后的完整恢复仍属于 M4；只剩历史等待卡时显示中断，不伪造可用审批。
  本轮保留接手时已有的附件上传与聊天切换改动，未将其计为 M3-a 新功能。
- 验证：`npx tsc --noEmit`、全量 Vitest、Electron pi 冒烟与 `git diff --check` 均通过。
  新增覆盖真实 pi write 审批前不落盘、允许/拒绝/中止、桥接工具拦截、授权隔离、
  迟到审批、快照版本、后台归约与渲染层重载收养；附件测试同步现有通用文件/本地路径行为。
  尚未做真实模型下的 Electron 审批界面人工走查。

### M3-a 队列交互修复（2026-09-27）

- 流式期间提交的消息仍按 conversationKey 排队，但队列不再只显示发送按钮上的数字。
  输入区上方显示待发送消息的文本/附件摘要，每项支持编辑（移出队列并回填输入框）和删除。
- `agent_settled` 会主动触发队列 drain；队列的入队、出队、迁移和删除均刷新版本号，
  避免回答已结束但 pending/队列 UI 没有再渲染而卡住的假象。
- 队列仍是当前渲染进程内存态；切换会话会按 conversationKey 隔离，主进程重启不恢复，
  属于待发送草稿而非已提交消息。

## 三、进度（提交序列，全部 tsc+测试+冒烟验证）

- **M0-M2e**（接手前）：冒烟/v2 设置/会话宿主/pi-dev 面板/设置页切换/业务单发切 pi
- **M2-f-1** `e1e8f7dbb` 单发桥原生化：主进程透传 partial、piLLM 三入口、16 个单发消费点
  直吃 pi 原生事件（删除手工累计 delta 凑 onUpdate(全量,增量) 旧契约）
- **M2-f-2** `9610dfddb` 主聊天切 pi 会话：ChatContainer 重写/历史灌入/工具桥/ask_question
  原生恢复/chat_run 渲染链退役
- **M2-f-3/4** `c106bc3af`+`90abfe14d` piAgentRunner + 生成编排/InlineAI/aiServer/podcast/
  subagentTool 迁移；旧链路删除
- 首轮验收修复 `c31c078c7`：五项（见坑清单 1-5）
- **修正一** `784d59ebb`：去闭包快照+会话常驻 reducer（修吞消息）
- **修正二** `d3bc61c33`：piChatRuntime 下沉模块级（后台运行）
- **验收状态**：用户确认"大部分没问题"——M2-f 基本通过；后台运行场景（切页回来
  消息完整+标题正常）为最后一批待复验项

## 四、踩坑清单（pi API 陷阱与本项目事故，新会话必读）

**pi 包行为（已验证源码）**：

1. `session.prompt(text, options?: PromptOptions)` —— images 是 **options 字段**不是第二
   位置参数（曾整体丢图）；流式中 prompt 未指定 streamingBehavior 会 throw
   "Agent is already processing"。
2. abort 不触发 auto_retry：`_willRetryAfterAgentEnd` 开头 `_agentRunAbortRequested→false`；
   `isRetryableAssistantError` 要求 `stopReason==="error"` 且匹配可重试正则。用户 abort
   后 message_end 会带 `stopReason:"aborted"` + errorMessage——**不要当错误显示**（曾造成
   "停止后一闪而逝错误"）。
3. `getSupportedThinkingLevels(model)` 需要 Model 对象（在主进程）——渲染端拿不到，
   reasoning 档位暂时用通用档（M3 经目录元数据接入）。
4. pi 无内建 subagent/websearch；customTools 用 TypeBox TSchema（JSON Schema 直接 cast 即可）；
   execute 可无限期挂起（ask_question 审批的实现基础），signal abort 会 reject。
5. SessionManager：create 后 appendMessage 灌历史，createAgentSession 内部
   buildSessionContext 自动恢复进 Agent；分支树（branch/navigateTree/fork）留给 M4。
6. think-stream-rewriter 重排事件后需手动重建 partial（pi 每个事件原生带 partial 全量快照）。

**本项目事故与修复（按发生顺序）**：

1. **ask_question 刷新不续流**：create 的 scope 传裸 chatScope（"main-chat"），find-by-scope
   按会话键（"main-chat:5"）查——不匹配。**scope 必须用 chatSessionKey()**。
2. **停止一闪而逝错误**：见 pi 陷阱 2；reducer 过滤 stopReason=aborted。
3. **输入框切模型失效**：写 modelName 而 v2 主键是 modelId（M2-d 迁移漏改）。usage 的
   modelName 字段是显示用，主键匹配一律 modelId。
4. **图片模型读不到**：见 pi 陷阱 1 + 桌面 image 字段是 `convertFileSrc()` 的 protocol URL，
   `path` 字段才是真实路径。方案：渲染端只传 `{path, dataUrl}`，主进程读文件转 base64
   （历史灌入的图片同样按 path 优先）。mime 按扩展名映射。
5. **思考块卡顿/突跳**：每 delta 全量 produce 直驱渲染。50ms trailing 节流 + turnId 全局递增。
   "连续两段思考块"多为工具循环多 turn（思考→调工具→再思考），中间工具卡快视觉像一体——预期行为。
6. **吞消息（最严重）**：闭包快照并发覆盖，见 piChatRuntime 演进史。
7. **切页丢流式后半段**：归约链绑组件，见 piChatRuntime 演进史。
8. **prompt 被拒竞态**：停止后立即发送/队列 drain 抢跑时 pi 收尾中会拒绝 prompt——
   等 agent_settled 事件后自动重提交（15s 兜底），不用轮询。
9. **测试模块图陷阱**：组件/顶层 import 重链（piChatSession→@/tools→MCP→@tau/editor→
   slate-react）会把编辑器包拉进测试导致 mock 失效——store 里的会话 dispose 用惰性
   `await import()`；InlineAIComposerPanel.test 需 mock piAgentRunner/piChatSession/piChatEvents。
10. **vitest cwd**：必须在 apps/desktop 下跑（见文档头）。
11. **队列只显示计数**：旧实现只在发送按钮显示数量，回答结束时若状态更新交错会出现停止按钮与
    队列数字残留；现已改为输入框上方渲染待发送摘要，并由 agent_settled 主动触发 drain。

## 五、遗留边界（有意留下，归属明确）

- **steer 未接**：流式中发送仍走本地队列（现已可见、可编辑、可删除并在 agent_settled 后 drain），
  pi 原生 steer/followUp 留 M3 交互升级；队列本身仍是渲染进程内存态，不做重启恢复
- **工具审批（D-060）已接**：M3-a 完成执行前拦截与主聊天审批；一次性入口没有审批
  UI 时按模式明确拒绝。完整主进程重启恢复仍待 M4，需在 Electron 实机复验审批交互。
- **reasoning 档位**：通用档 none/low/medium/high，模型特有档（minimal/xhigh/max）M3 接
- **主进程重启后的 ask_question 半成品**：渲染层重载可恢复（find-by-scope+resolve 续流）；
  主进程也重启则写终态兜底，完整恢复等 M4（pi JSONL resume）
- **ChatDropdownSelector 运行态标记**：随 chat_run 退役（会话列表无 Spinner/失败图标），M4 目录表带状态列
- **删除单条消息**未联动 pi 会话重建（非 append-only 变更需 recreate；M4 会话树 navigateTree 替代）
- **subagent 的 maxToolCallLoops/timeoutMs 参数**留 schema 但 pi 无对应配置（不生效），M3 清理
- **单发 IPC 全量透传 partial 的带宽**：百 KB 正文×千次 delta 理论放大，实测未见问题；
  若卡做主进程 per-request 合并节流（传输层优化，非语义层）
- **runtime 内存**：会话条目常驻不主动清理（量级可控），M4 会话管理统一治理

## 六、下一步：M3（工具体系+设置页产品化）

优先级从高到低：

1. **D-060 权限映射（M3-a 已完成）**：实现与生命周期边界见上节；下一步从第 2 项继续。
2. **ask_user**：pi 无内置则 customTools 实现（execute 挂起模式已被 ask_question 验证）
3. **MCP 桥**：渲染端 mcp provider 已经 ToolRegistry 化（工具桥自动可用），主进程 mcp.ts
   的 D-058 管理页保留
4. **设置页产品化**：服务商类型选择（内置/自定义）+ 模型勾选 + fetchModels 拉取 +
   shellPath 首启检测 + reasoning 档位接 pi 目录（主进程加查询 IPC 或目录元数据下发）
5. **steer 交互**：将当前本地队列与 pi 原生 steer/followUp 对齐（当前队列展示、编辑、删除和
   agent_settled drain 已完成；`queue_update` 事件驱动的 pi 原生排队尚未接管发送）
6. WSL 手动选项（BashOperations 路径翻译）

**队列交互（M3-a 已完成）**：待发送消息在输入区上方显示文本/附件摘要；每条可编辑或删除；
队列按 conversationKey 隔离，入队、出队、迁移、删除刷新版本；agent_settled 触发排空。

**M4（会话管理）**：sqlite 目录表（scope/域引用/group/pin/order/title/source/cwd/session_path，
**改表同步 scripts/db/check-schema-parity.mjs 常量+跑 pnpm db:schema:build/check**）、列表/
分组/置顶/标题、分支改 pi 会话树（branch/getBranch/navigateTree/runtime.fork）、pi JSONL
resume 打开旧会话、卫星面板按 scope 接入、runtime 会话条目治理。
**M5（浏览器扩展）**：aiServer 迁主进程、WS 协议 v2（扩展未上线直接 breaking）、
useAiChat/SharedChatTab 改 pi 事件、chat.* RPC 改目录表+session。
**M6（老数据迁移器）**：chat-core v4→pi entry（user 图片转 base64、assistant 按 turnId 分组、
分支族合并树）、5 张表、启动任务（备份+队列+打开优先）、无签名 thinking 的 Anthropic 重放验证。
**M7（同步）**：sync.ts 捎带 sessions/<库名>/ + manifest（per-file hash/mtime）、双机往返。
**M8（删旧收尾）**：packages/agent、@tau/agent 类型引用清零、chat-core 展示层（保留
messageSchema 供迁移器）、chat_run 表与主进程 handler、modules/llm.ts、
openai-responses-adapter、卫星表 messages 写路径；DECISIONS.md 追加条目；03 指南数据
协议节同步；rg 复核清零。

## 七、验证与调试

- 全量：`npx tsc --noEmit && npx vitest run`（apps/desktop 下）
- 主进程链路：`ELECTRON_RUN_AS_NODE=1 npx electron scripts/pi-smoke.mjs`（faux 驱动完整
  agent loop + 真实 bash/write/read 中文路径）
- 主进程日志看 `[PiSessionHost]` 前缀（shell 探测/事件序列化/图片读取失败）
- 请求取证：`PI_DUMP_REQUESTS=1` 环境变量重启，出站 payload 写 `~/.editor/pi-request-dumps/`
- 常见验收场景：发送/流式/工具卡/ask_question 闭环与刷新恢复/停止/重试/图片/旧对话续聊
  （历史灌入）/编辑重发/重新生成/分支/模型切换/切页后台运行/停止后立即发送
- M3-a 专项：manual 下 write/bash 等待且不执行；允许/拒绝/本会话始终允许；
  acceptEdits 放行 write 但拦 shell；bypass 放行；审批中停止、切页、渲染层重载；
  两会话同名工具不串授权；无审批界面的一次性入口拒绝高风险操作。
- 队列专项：流式中发送多条消息；查看每条待发送内容；编辑后重新发送；删除指定条目；
  agent_settled 后自动排空；切换会话后队列互不串台；停止后队列保留且可继续编辑/删除。

## 八、工作约定（用户明确要求，违反会返工）

1. 文件修改一律 **Read+Edit 精确编辑**，禁止脚本/sed 批量替换（连环出过错）
2. 发现 bug 先判断设计层 vs 实现层——**不打补丁**（用户原话质疑过"为什么会出现这么
   低级的错误"，根因都是设计层）
3. 有状态的东西放对层级：跨轮次/跨页面/跨组件的状态必须模块级或主进程，组件只放 UI 态
4. 本文档随架构变化同步更新（每次架构级提交同批更新）
