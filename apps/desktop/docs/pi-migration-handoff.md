# pi 迁移交接文档（refactor/pi-harness 分支）

> 2026-09-26 交接。新会话续接方式：读完本文档 + `git log --oneline refactor/pi-harness` 对照提交历史。
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

## 二、架构现状（已落地部分）

```
主进程（Electron，node 24.18）：
├─ modules/pi-ai-runtime-core.ts   纯逻辑核心：v2设置→pi Provider（含内置目录兜底）、
│                                  provider注册表、单发上下文组装
├─ modules/pi-ai-runtime.ts        pi-ai 模块（BACKGROUND）：设置订阅→注册；pi-ai:single-shot
│                                  IPC + pi-ai-stream-event 流事件（剥离 partial）
├─ modules/think-stream-rewriter.ts <think>标签兜底剥离（stripThinkTags 模型级开关）
├─ modules/pi-session-host-core.ts 会话装配：零资源发现 ResourceLoader + systemPrompt 覆盖 +
│                                  Git Bash 探测（where git 反推/排除WSL）+ powershell 兜底
│                                  （含UTF-8前缀）+ 请求 dump 取证（PI_DUMP_REQUESTS=1）
├─ modules/pi-session-host.ts      会话宿主（BACKGROUND）：create/prompt/steer/abort/dispose IPC，
│                                  AgentSessionEvent 原样透传（pi-session-event 按 sessionId 路由）
渲染进程：
├─ commands/piAi.ts                单发封装（原生事件形状，支持外部 requestId 联动取消）
├─ commands/piSession.ts           会话封装（原生 AgentSessionEvent）
├─ services/piSessionModel.ts      pi事件→视图模型归约器（partial 快照语义，幂等）
├─ stores/usePiSessionStore.ts     会话表 + 事件接线 + 驱动
├─ features/pi-dev/                开发验证面板（导航 AI 组，M4 后退役）
├─ hooks/useChatLLM.ts             chatStreamCore：无工具→pi单发（runPiSingleShot）；
│                                  带工具→旧adapter（M2-f 切 session）
├─ services/llmSettingsMigration.ts 旧llmConfigs→v2 一次性转化（6用例）
├─ services/llmSettingsDowngrade.ts 【临时桥 M2-f 删】v2→v1 喂旧 adapter
└─ stores/useSettingStore.ts       llmProviders 上线（迁移挂载于 mergeSettingWithDefaults）
```

**v2 设置模型**（`src/types/pi-llm.ts`）：provider{id,name,baseUrl,apiKey,api,builtin?,models}；
model{id,name?,reasoning,input:[text|image],contextWindow?,maxTokens?,thinkingLevel?,samplingParams?,headers?,compat?,stripThinkTags?}。
**内置目录兜底**（已提交）：`builtin` 显式或 baseUrl 匹配 pi 官方目录 → 目录元数据权威
（ctx/maxTokens/推理档位/compat/单价），手填仅兜底未收录模型。

## 三、进度（分支提交序列，均已验证 tsc+测试）

- **M0** 冒烟：Node 24.18 达标、faux 驱动 agent loop、Windows 中文路径实测（`scripts/pi-smoke.mjs`）
- **M1** 基建：v2 类型+迁移、provider 桥（createProvider 动态注册/注销、keyless 占位）、
  单发 IPC、think 重写器（序列式切分器+contentIndex 重排+done 重建）
- **M2 前置**：PiSessionHost 装配链 + IPC + faux 端到端
- **M2 渲染层**：归约器 + session store + pi-dev 面板
- **M2 真机联调**（用户参与修复）：IPC 事件参数错位、渲染时序（按 seq 统一/executions 只显 running）、
  shell 路由（WSL 排除/where git 反推/powershell 兜底）、photon-node external（图片 resize）、
  图片模态默认放开、模型切换重建会话（会话模型创建时定死）、dump 取证
- **M2-d**：设置 v2 上线（store 迁移+删 llmConfigs）、useLLMConfig/chatStreamCore 桥、
  15+ 消费点/LLMSection 表单/legacy LLM 页删除/浏览器扩展 useLlmConfigs 全切
- **M2-e-1**：内置目录兜底（上节）
- **M2-e-2**：chatStreamCore 无工具路径切 pi（runPiSingleShot：消息转换/事件→回调映射/
  abort 联动）——业务单发（标题摘要/网页剪辑/播客/闪卡/判定/视频摘要等）已全部跑在 pi 上
- **修复**：pi 单发 onUpdate 全量累计语义（契约单测 4 例钉死）

## 四、下一步：M2-f（主聊天接 session，旧 adapter 退役）

1. **ChatContainer**（`apps/desktop/src/layouts/.../ChatSidebar/ChatContainer.tsx`，2117 行）发送编排
   （重试/chat_run 恢复/ask_question 恢复段落）重写为 pi 会话驱动（usePiSessionStore + piSession commands）
2. 生成编排（`services/generation-orchestrator.ts`、VL tasks/runner）的带工具路径接一次性 pi 会话
3. **同批删除**：`llmSettingsDowngrade.ts`、`DesktopModelProtocolAdapter/Transport`、
   `openai-reasoning-effort.ts`（UI 档位换 pi 的 `getSupportedThinkingLevels(model)`，注意枚举
   none→off/minimal 差异）、headers.test 协议用例（保留超时策略用例）、Agent 装配段
4. 验收：主聊天流式/工具卡/ask_question/分支/重试全通

## 五、后续里程碑

- **M3 工具体系+设置页产品化**：ask_user（execute 挂起等渲染答复）、MCP 桥（现有主进程 mcp.ts→registerTool
  包装，保 D-058 管理页）、D-060 权限映射（tool_call 拦截）、WSL 手动选项（BashOperations 路径翻译）、
  设置页服务商类型选择（内置/自定义）+ 模型勾选 + fetchModels 拉取 + shellPath 首启检测
- **M4 会话管理**：sqlite 目录表（scope/域引用/group/pin/order/title/source/cwd/session_path，
  **改表同步 scripts/db/check-schema-parity.mjs 常量+跑 pnpm db:schema:build/check**）、列表/分组/置顶/
  标题生成（LLM 走 pi）、分支改 pi 会话树（branch/getBranch/runtime.fork）、卫星面板按 scope 接入
- **M5 浏览器扩展**：aiServer 迁主进程、WS 协议 v2（扩展未上线直接 breaking）、useAiChat/SharedChatTab
  改 pi 事件、chat.* RPC 改目录表+session
- **M6 老数据迁移器**：chat-core v4→pi entry（user 图片转 base64、assistant 按 turnId 分组、分支族合并树）、
  5 张表、启动任务（备份+队列+打开优先）；验证无签名 thinking 的 Anthropic 重放
- **M7 同步扩展**：sync.ts 捎带 sessions/<库名>/ + manifest（per-file hash/mtime）、双机往返
- **M8 删旧收尾**：packages/agent、adapter/transport、渲染侧 stream-fetch、chat-core 展示层（保留
  messageSchema 供迁移器）、chat_run 表与 ChatRunManager、卫星表 messages 写路径；DECISIONS.md 追加条目；
  03 指南数据协议节同步；rg 复核清零

## 六、登记在册的坑与待办

- DeepSeek pro 的 thinking 字段 compat（`missing field type` 400）——杂牌网关矩阵时修
- 主进程 bundle 13.2MB（@aws-sdk 等可 external 瘦身）
- pi 0.x 高频破坏性变更：锁 ~0.87.x，使用面收敛在 pi-session-host-core/pi-ai-runtime-core/两 commands
- 已删的调试产物：dump 默认开已改回 PI_DUMP_REQUESTS=1 环境变量开关
- **工作约定（用户明确要求）**：文件修改一律 Read+Edit 精确编辑，禁止脚本/sed 批量替换（连环出过错）
- M0 冒烟脚本 `scripts/pi-smoke.mjs` 可随时复跑验证主进程链路

## 七、用户验收状态

- pi-dev 面板端到端联调：**通过**（含图片/shell/流式/steer/abort）
- 设置页 v2 + 老配置迁移：**已落地待用户验收**（重启 dev 看设置-大语言模型分区）
- 网页剪辑（pi 单发路径）：**已修复待用户复验**（onUpdate 全量语义）
