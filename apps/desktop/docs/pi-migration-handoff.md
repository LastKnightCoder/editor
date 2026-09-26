# pi 迁移交接文档（refactor/pi-harness 分支）

> 2026-09-26 交接；同日 M2-f 四批次落地（见「进度」）。新会话续接方式：读完本文档 + `git log --oneline refactor/pi-harness` 对照提交历史。
> 权威背景：调研报告与迁移计划在本项目最初会话中形成（对话内）；本文档是执行态的完整快照。

## 一、背景与目标

把自研 agent 运行时（约 1 万行：协议适配 + SSE 传输 + Agent 循环 + chat-core 消息模型）整体替换为
pi agent（`@earendil-works/pi-coding-agent` 0.87.x，MIT，earendil-works/pi，原 badlogic/pi-mono）。

**用户裁决的硬性原则**：

1. **Big-bang 无过渡态**：围绕 pi 重写而非适配已有体系；最终形态无兼容层；
2. **以 pi 为准**：设置模型对齐 pi（旧数据一次性转化）；聊天上传仅文本+图片（文件由模型 read 工具读取）；
3. **内置工具默认启用**（read/bash/edit/write + powershell 兜底），选择权交用户（D-060 权限模式映射到 pi 的 tool_call 拦截）；
4. **会话事实源 = pi JSONL**（`~/.editor/sessions/<库名>/`），sqlite 只留轻量目录表；数据库同步机制捎带 JSONL（manifest 防静默丢）；
5. **老数据启动时一次性整体升级**为 pi 会话（VACUUM INTO 备份 + migration_meta）；
6. 完成后旧链路全删（packages/agent、DesktopModelProtocolAdapter、chat-core 展示层、chat_run 表等，M8）。

## 二、架构现状（M2-f 后）

```
主进程（Electron，node 24.18）：
├─ modules/pi-ai-runtime-core.ts   纯逻辑核心：v2设置→pi Provider（含内置目录兜底）、
│                                  provider注册表、单发上下文组装
├─ modules/pi-ai-runtime.ts        pi-ai 模块（BACKGROUND）：设置订阅→注册；pi-ai:single-shot
│                                  IPC + pi-ai-stream-event 流事件（含 partial 全量快照原样透传）
├─ modules/think-stream-rewriter.ts <think>标签兜底剥离（为重排后事件重建 partial 快照）
├─ modules/pi-session-bridge.ts    桌面 chat-core 消息→pi 消息转换器（历史灌入）+
│                                  工具桥 PiToolCallBridge（customTools execute 经
│                                  pi-tool-call 事件挂起渲染端，结果经 pi-session:tool-* 回传）
├─ modules/pi-session-host-core.ts 会话装配：ResourceLoader/Git Bash 探测/幂等快照历史灌入/
│                                  thinkingLevel/retry(默认5)/动态 systemPrompt 扩展
├─ modules/pi-session-host.ts      会话宿主（BACKGROUND）：create/prompt/steer/abort/dispose/
│                                  set-system-prompt/tool-*/find-by-scope IPC，
│                                  AgentSessionEvent 原样透传（pi-session-event 按 sessionId 路由）
渲染进程：
├─ commands/piAi.ts                单发封装（原生 AssistantMessageEvent 含 partial）
├─ commands/piSession.ts           会话封装（create/prompt/steer/abort/dispose/set-system-prompt/
│                                  tool-*/find-by-scope + 事件/工具调用订阅）
├─ services/piLLM.ts               单发统一入口：piStreamChat（原生事件流）/piStreamText
│                                  （partial 文本快照流）/piCompleteChat（非流式）；
│                                  PiChatResult 带 aborted 标记
├─ services/piChatSession.ts       chat↔pi 会话生命周期（模型变化自动重建/编辑重发显式重建/
│                                  dispose）+ skills→systemPrompt 拼接 + adoptOrResolveSession
├─ services/piChatEvents.ts        PiChatEventReducer：AgentSessionEvent→assistant_blocks 快照
│                                  归约（message_update 全量快照与 chat-core 幂等快照同构）
├─ services/piToolBridge.ts        pi-tool-call→渲染端 ToolRegistry 执行→回传
│                                  （conversationKey 上下文 + 一次性会话 executeOverride）
├─ services/piAgentRunner.ts       一次性 pi 会话运行器（inMemory + 工具桥 + 历史灌入 +
│                                  agent_settled 后 dispose），带工具场景统一底座
├─ stores/usePiSessionStore.ts     pi-dev 面板用会话表（M4 主聊天已接自管会话，面板 M4 后退役）
├─ features/pi-dev/                开发验证面板（导航 AI 组，M4 后退役）
├─ ChatContainer.tsx               主聊天编排（5 场景共用）：pi 会话驱动，事件→assistant_blocks，
│                                  ask_question 挂起经 find-by-scope 收养后 resolve 续流
└─ stores/useSettingStore.ts       llmProviders 上线（迁移挂载于 mergeSettingWithDefaults）

**已删除（M2-f）**：useChatLLM/chatStreamCore、DesktopModelProtocolAdapter/Transport、
llmSettingsDowngrade、openai-reasoning-effort、commands/stream-fetch、subagentAgentPolicies、
chatRunManager/useChatRunStore/commands:chat-run/types:chat-run（渲染端链路；主进程 chat_run 表
与 handler 留存至 M8）。主进程 modules/llm.ts（chat-openai 非流式）与 utils/openai-responses-adapter
保留——IntegrationSetting/MinimaxSetting 连接测试仍用，M8 复查。
```

**v2 设置模型**（`src/types/pi-llm.ts`）：provider{id,name,baseUrl,apiKey,api,builtin?,models}；
model{id,name?,reasoning,input:[text|image],contextWindow?,maxTokens?,thinkingLevel?,samplingParams?,headers?,compat?,stripThinkTags?}。
**内置目录兜底**：`builtin` 显式或 baseUrl 匹配 pi 官方目录 → 目录元数据权威。

## 三、进度（分支提交序列，均已验证 tsc+测试）

- **M0** 冒烟：Node 24.18 达标、faux 驱动 agent loop、Windows 中文路径实测（`scripts/pi-smoke.mjs`）
- **M1** 基建：v2 类型+迁移、provider 桥（createProvider 动态注册/注销、keyless 占位）、单发 IPC、think 重写器
- **M2 前置**：PiSessionHost 装配链 + IPC + faux 端到端
- **M2 渲染层**：归约器 + session store + pi-dev 面板
- **M2 真机联调**（用户参与修复）：IPC 事件参数错位、渲染时序、shell 路由（WSL 排除/where git 反推/powershell 兜底）、图片模态、dump 取证
- **M2-d**：设置 v2 上线、15+ 消费点/LLMSection 表单/legacy LLM 页删除
- **M2-e**：内置目录兜底；chatStreamCore 无工具路径切 pi
- **M2-f-1**：单发桥原生化——主进程透传 partial、piLLM 三入口、16 个单发消费点直吃 pi 原生事件
  （删除桥层手工累计 delta 凑 onUpdate(全量,增量) 旧契约的反模式）
- **M2-f-2**：主聊天全面切 pi 会话——ChatContainer 编排重写 + 主进程历史灌入/工具桥/thinking/
  retry/动态 systemPrompt/find-by-scope + 渲染端 piChatSession/piChatEvents/piToolBridge +
  ask_question 挂起原生恢复 + chat_run 渲染链退役
- **M2-f-3/4**：一次性 pi 会话运行器（piAgentRunner）+ 生成编排 vibe 路径/InlineAI/aiServer/
  podcast/subagentTool 全部迁移；旧 adapter/useChatLLM/stream-fetch/openai-reasoning-effort 删除

## 四、M2-f 遗留边界（后续里程碑承接）

- **steer 未接**：流式中发送仍走本地队列（drain 机制），pi 原生 steer/followUp 排队留 M3 交互升级
- **工具审批未接**（D-060）：pi 侧工具直接执行（内置 read/bash/edit/write 本就如此），tool_call
  拦截扩展在 M3；旧 interactiveApproval 的 awaiting-approval 状态链已随 adapter 删除
- **reasoning 档位**：UI 用通用档 none/low/medium/high；模型特有档（minimal/xhigh/max）经 pi 目录
  元数据接入在 M3 设置页产品化时做
- **主进程重启后的 ask_question 半成品**：渲染端重载已可恢复（find-by-scope 收养 + resolve 续流）；
  主进程也重启则写终态兜底，完整恢复等 M4 会话管理（pi JSONL resume）
- **ChatDropdownSelector 运行态标记**：会话列表的 Spinner/失败图标随 chat_run 退役，M4 目录表带状态列
- **ChatContainer 的删除单条消息**未联动 pi 会话重建（非 append-only 变更需 recreate，M4 会话树
  navigateTree 替代重建）
- **subagent 的 maxToolCallLoops/timeoutMs 参数**：pi 会话无对应配置，参数暂留 schema 但不生效
  （pi 自带循环上限与超时），M3 工具管理时清理 schema

## 五、后续里程碑

- **M3 工具体系+设置页产品化**：ask_user、MCP 桥（现有主进程 mcp.ts→registerTool 包装，保 D-058 管理页）、
  D-060 权限映射（扩展 tool_call 拦截 + execute 挂起审批 UI）、WSL 手动选项（BashOperations 路径翻译）、
  设置页服务商类型选择（内置/自定义）+ 模型勾选 + fetchModels 拉取 + shellPath 首启检测、
  reasoning 档位接 pi 目录、steer 交互
- **M4 会话管理**：sqlite 目录表（scope/域引用/group/pin/order/title/source/cwd/session_path，
  **改表同步 scripts/db/check-schema-parity.mjs 常量+跑 pnpm db:schema:build/check**）、列表/分组/置顶/
  标题生成（LLM 走 pi）、分支改 pi 会话树（branch/getBranch/navigateTree/runtime.fork）、
  pi JSONL resume 打开旧会话、卫星面板按 scope 接入
- **M5 浏览器扩展**：aiServer 迁主进程、WS 协议 v2（扩展未上线直接 breaking）、useAiChat/SharedChatTab
  改 pi 事件、chat.* RPC 改目录表+session
- **M6 老数据迁移器**：chat-core v4→pi entry（user 图片转 base64、assistant 按 turnId 分组、分支族合并树）、
  5 张表、启动任务（备份+队列+打开优先）；验证无签名 thinking 的 Anthropic 重放
- **M7 同步扩展**：sync.ts 捎带 sessions/<库名>/ + manifest（per-file hash/mtime）、双机往返
- **M8 删旧收尾**：packages/agent、渲染侧 @tau/agent 类型引用清零、chat-core 展示层（保留
  messageSchema 供迁移器）、chat_run 表与主进程 handler、modules/llm.ts（chat-openai，Integration/
  Minimax 设置改走 pi 或保留独立）、openai-responses-adapter、卫星表 messages 写路径；
  DECISIONS.md 追加条目；03 指南数据协议节同步；rg 复核清零

## 六、登记在册的坑与待办

- DeepSeek pro 的 thinking 字段 compat（`missing field type` 400）——杂牌网关矩阵时修
- 主进程 bundle 13.2MB（@aws-sdk 等可 external 瘦身）
- pi 0.x 高频破坏性变更：锁 ~0.87.x，使用面收敛在 pi-session-host-core/pi-ai-runtime-core/
  pi-session-bridge/两 commands/两 runner
- 已删的调试产物：dump 默认开已改回 PI_DUMP_REQUESTS=1 环境变量开关
- **工作约定（用户明确要求）**：文件修改一律 Read+Edit 精确编辑，禁止脚本/sed 批量替换（连环出错过）
- M0 冒烟脚本 `scripts/pi-smoke.mjs` 可随时复跑验证主进程链路（M2-f 后仍 PASS）
- 单发 IPC 全量透传 partial 的带宽放大：百 KB 级正文（网页剪辑）×千次 delta 理论上放大 IPC 流量，
  实测未见问题；若真卡再做主进程 per-request 合并节流（不属于语义层）

## 七、用户验收状态

- pi-dev 面板端到端联调：**通过**（含图片/shell/流式/steer/abort）
- 设置页 v2 + 老配置迁移：**已落地待用户验收**
- 网页剪辑（pi 单发路径，partial 全量语义）：**已重构待用户复验**
- **M2-f 主聊天 pi 会话驱动：待用户验收**——主聊天/PDF/视频笔记/学习项目五场景的
  发送/流式/工具卡/ask_question/分支/重试/停止 + 生成编排（vibe 学习资料生成）/行内助手/
  子代理调研/播客（vibe 路径）全链路
