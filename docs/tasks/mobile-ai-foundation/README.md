# 移动端 AI 基础能力接入方案

状态：基础能力已接入，待实际存储插件往返与设备验收。

宿主插件接入补充：用户要求在现有基础上补齐移动 AI 插件适配，继续不新增产品 UI 或功能入口。接入范围为现有 `context.ai` 请求与 `ai:*` 授权、插件 MCP、包内 Markdown Skills，以及聊天工具渲染器声明；模型仍由宿主配置，插件拿不到凭据。按 AI 调用与额度、MCP、包内 Skills 三条线并行实现，统一复核停用、撤权、切库和迟到结果。用户进一步明确开放独立 Skill 包安装：保留格式 1 的文件布局，增加 portable/targets 平台声明，中心与双端安装器按包类型校验，不强制文档包具有 main；独立包不进入代码插件激活链，移动端保留脚本文件但不执行。脚本执行、stdio、闪卡 AI 业务流程及配置界面继续不在这次宿主接线范围内。

宿主插件接线已完成：插件 SDK 309 项、公共 AI 81 项、移动相关 83 项、桌面相关 20 项及 Rust 301 项测试通过，双端 TypeScript、移动构建、Clippy、格式与文档检查通过。移动相关计数由 82 项联合回归与追加的服务启动拒绝零用量回归组成，最后插件 AI 单文件为 18 项。验证含真实 pi SDK 的模拟 SSE 调用链、官方 MCP 本机 HTTP、暂停/维护恢复、原生受限文件与持久额度账本，不冒充真实模型或设备验收。模型授权指纹在原生创建网络上下文前复验；本地无效输入在预占前拒绝，明确没有发网的启动/配置冲突以零用量结算。本次没有调用临时真实模型凭据。当前事实已沉淀至跨端插件架构及包内接口说明；原任务仍保留实际云存储往返与设备验收。

独立 Skill 安装补充已完成：SDK 313 项、门户 API 110 项、网页行为 99 项、桌面安装与作者构建 75 项、移动安装/生命周期 62 项、Rust 307 项通过；双端与门户类型检查、移动与门户网页构建、作者模板构建通过。验证覆盖同一份跨端独立包的脚本/附件保真、无 JS 启动、平台与版本判断、安装更新恢复卸载、安全模式、类型转换和来源撤销。中心增加 0013 目标索引投影迁移，仅识别新 portable Skill 形态，不增加表列，不改历史发布正文；迁移 SQLite 测试通过，线上未执行，须在后续 Worker 发布前按运维流程应用。SDK、客户端和模板均未发布，不把仓库接线与本机验证等同于线上或真机验收。

目标：以 pi-ai + pi-agent-core 为移动端本机 AI 底座，建立无 UI 的运行服务、明确的宿主接口和持久化能力，使桌面与手机的聊天记录可双向同步、按同一消息协议投影并继续对话。

## 一、需求与本次边界

已确定的用户要求：

- 手机直接调用模型，本机执行工具，不依赖自建 AI 后端。
- 基于已经验证的 pi-ai / pi-agent-core 路线，与桌面已有 pi 体系自洽。
- 优先完成架构、数据层和对外接口；方案已确认，按用户要求并行实施。
- 正式实施不开发聊天界面、输入框、设置界面、工具审批界面或功能入口。
- 桌面创建的消息同步到手机后可投影；手机创建的消息同步到桌面后也可投影。能力允许时能在另一端继续对话。

基础能力包括模型配置解析与调用、会话存储、历史投影、工具注册与执行、交互协议、远程 MCP、说明类 Skills、生命周期和同步。业务卡片搜索/编辑、摘要/周报等具体功能不在本任务生产注册；使用隔离工具验证基础执行协议。

不将“无 UI”理解为自动授予写入权限。调用方没有交互承载能力时，需要确认的操作直接返回明确错误，不永久等待，也不默认同意。

## 二、实施前基线与关键缺口

| 项目             | 当前事实                                                                                          | 接入影响                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 移动运行环境     | Tauri 2 + React WebView + Rust，没有 Node 宿主                                                    | 运行 pi-ai / Agent，不能直接加载桌面 AgentSession 宿主   |
| 既有验证         | pi-ai / pi-agent-core 0.87.1；三协议工具循环、无 Node 全局变量的隔离运行、esbuild / Vite 构建通过 | 证明 SDK 层可行；未证明真实模型、原生网络与真机生命周期  |
| 桌面聊天事实源   | `sessions/<去掉 .db 后缀的库名>/<时间戳>_<sessionId>.jsonl`                                       | 手机必须保存同一种会话文件，不能只同步展示消息           |
| 会话目录         | 主库 `chat_session` 表                                                                            | 标题、归档、分组等管理元数据属于该表；正文属于 JSONL     |
| 已有消息协议     | `@tau/shared/chat-core` 的 ChatSessionMessage / assistant_blocks / 用量与归约器                   | 继续作为两端唯一消息投影协议，不新建移动版消息模型       |
| 桌面存储格式     | pi-coding-agent `CURRENT_SESSION_VERSION = 3`                                                     | 作为本任务会话交换基线                                   |
| Agent 新仓库格式 | pi-agent-core 的 JsonlSessionRepo 使用 `v: 4 / kind: header`                                      | 与桌面 v3 不同，不能直接把默认 JsonlSessionRepo 接上同步 |
| 现有移动同步     | 只同步数据库，不读写 sessions.json 与会话文件                                                     | 必须补全；否则只有目录行，没有聊天正文                   |
| 来源字段         | SQL 为 TEXT，但桌面类型及解析只认识 desktop / browser                                             | 增加 mobile，并修复解析，不能把手机记录伪装为桌面记录    |
| 移动命令绑定     | 大量命令按执行时的 activeDatabase 开库                                                            | AI 工具必须捕获库身份，不能在异步后写到后来切换的库      |

本方案不把几项不同保证混为一谈：同协议可展示、文件可双向读取、模型上下文可正确恢复、工具在当前设备可执行，分别验收。历史展示不依赖当前设备拥有原工具、原模型或原 Skill。

## 三、总体结构

| 层          | 归属                                             | 职责                                                                                 |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 消息与归约  | 现有 `@tau/shared/chat-core`                     | 用户消息、助手块、工具状态、用量、快照归约；移出其中类型对输入组件目录的反向依赖     |
| AI 公共能力 | 新建内部工作区包 `@tau/ai`                       | 模型契约、运行契约、会话 v3 编解码与投影、工具契约、权限规则、Skills / MCP 适配逻辑  |
| 移动宿主    | `apps/mobile/src/services/ai/`                   | pi Agent、会话服务、原生端口装配、快照发布；不依赖 router / feature store / 组件挂载 |
| 原生能力    | `apps/mobile/src-tauri/src/ai/` 与既有数据库模块 | 网络流、凭据、文件、持久化、运行租约、数据库定向调用和维护互斥                       |
| 桌面宿主    | 保留现有 Electron + pi-coding-agent              | 消费公共类型、模型转换、投影和权限规则；不为本任务整体替换桌面运行时                 |
| 呈现        | 现有 `@tau/chat-ui`，未来移动 UI 消费相同数据    | 本任务只提供可渲染数据和适配测试，不增加或修改产品 JSX 视图                          |

`@tau/ai` 的公开子入口：

- `@tau/ai/contracts`：稳定 DTO、错误码、模型/会话/工具服务类型，不加载运行时 SDK。
- `@tau/ai/session`：v3 会话编解码、当前路径、历史投影与上下文恢复，不含 Node / Tauri I/O。
- `@tau/ai/runtime`：pi-ai 三协议适配、Agent 装配、事件适配、工具循环和生命周期编排。
- `@tau/ai/tools`、`@tau/ai/skills`、`@tau/ai/mcp`：按能力显式加载，避免根入口带入所有模块。

文件 I/O 留在两端宿主。Node 专用依赖不得经过根入口进入手机。消息 DTO 仍由 chat-core 定义，`@tau/ai` 消费它，不复制一套。

桌面现有提供方转换和 pi 事件投影中的纯逻辑迁入公共包；调用点改用公共入口。原文件若有稳定转导出用途可保留薄入口，不保留两套实现。删旧实现前复核消费者。

## 四、稳定对外接口

### 4.1 公共身份与可观察结果

```ts
type AiSessionRef = {
  databaseName: string;
  sessionId: string;
};

type AiModelRef = {
  providerId: string;
  modelId: string;
};

type AiRunStatus =
  | "preparing"
  | "running"
  | "waiting-approval"
  | "waiting-answer"
  | "stopping"
  | "settled";

type AiRunOutcome = "completed" | "failed" | "aborted" | "interrupted";

type AiInteractionMode = "none" | "host";
```

会话身份包含库名；原生宿主另持不可伪造的库代次/租约。库替换或切换后，旧代次请求不能认领新库。数据库名不能直接作为未经校验的磁盘路径。

会话快照返回目录行、`ChatSessionMessage[]`、当前叶子、格式版本、不可拆解的 revision 和诊断。运行快照额外返回 runId、递增 seq、状态、当前响应、交互集合与交互 revision。公开 DTO 不包含 Agent / AgentSession / SessionManager 对象。

### 4.2 AiService 门面

| 服务         | 方法                                          | 输入 / 输出与语义                                                                                                        |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| models       | list / resolve / verify                       | 读取非敏感模型配置；按 AiModelRef 解析；显式发起连接测试                                                                 |
| generation   | start                                         | 单次生成，可流式但不执行工具；使用同一模型层与取消协议，默认不建持久会话                                                 |
| sessions     | create / get / list                           | 创建目录与文件；按 ref 读取快照；按库、scope、domainRef、归档状态与 offset / limit 分页，列表不读取全库正文              |
| sessions     | patch / remove                                | 管理标题、分组、归档、置顶；携带 expectedRevision；忙态拒绝历史修改和删除                                                |
| sessions     | editHistory                                   | rewind / fork / switch / omit，与桌面现有树操作语义相同；按 entryId 定位                                                 |
| runs         | retryLast                                     | 仅重试最后一个尚无有效回答的用户问题；复用原用户 entry，不增加版本；有回答时要求显式 rewind 后重新发送                   |
| runs         | start                                         | runId、session ref、原始 MessageContent、model ref、思考设置、工具选择、Skill 选择与交互模式；不是字符串拼接后的完整历史 |
| runs         | subscribe / getSnapshot                       | 事件按 runId + seq 路由；支持原子取得快照与其后的事件，避免“查询后才订阅”的空档                                          |
| runs         | abort / waitForIdle                           | 停止指定运行并等待持久化收尾；停止等待不表示已提交的工具效果被撤销                                                       |
| interactions | resolveApproval / answerQuestion              | 携带 runId、requestId、executionId 与交互 revision；拒绝过期或属于其他运行的回答                                         |
| tools        | register / unregister / list                  | 注册定义和执行器，返回可释放注册凭证；运行开始捕获不可变工具快照                                                         |
| skills       | registerSource / list / load / readResource   | 来源、可用技能目录、按需加载和受限参考资料读取；不暴露任意文件系统读写                                                   |
| mcp          | list / connect / disconnect / refreshTools    | 连接已配置远程服务，发布真实工具目录；不支持的传输返回明确状态                                                           |
| lifecycle    | prepareMaintenance / releaseLibrary / dispose | 与切库、同步和应用退出协调，不依赖组件卸载触发                                                                           |

模型调用只传 providerId / modelId，不由业务调用方传 API Key。配置解析沿用 `llmProviders` 与 `llmUsageSettings` 的字段和语义，提取桌面已有类型，禁止新增 `mobileLlmProviders` 等平行设置。

`runs.start` 的关键约定：

- 调用者可预先生成 runId 并订阅；重复提交同一 runId 不重复追加用户消息或启动另一轮。
- 返回“已接受”前，本轮用户消息和展示形态必须获得持久化确认。配置或能力校验失败时不开始模型请求。
- 同一会话同一时刻只允许一个运行。首版忙时返回 `AI_SESSION_BUSY`，不隐式排队，不把 SDK steer/followUp 直接暴露为应用 API；桌面既有 UI 队列保持其现有语义。
- start、重试、历史编辑均检查 expectedRevision，防止调用方基于旧投影操作已切换的分支。
- settled 只在持久化收尾后产生一次，成功、失败、取消都有；结果包含 outcome、最终快照和错误信息。存储失败不可报告成功。
- 释放订阅只停止观察，不停止运行；abort 和 releaseLibrary 才控制执行。

持久会话运行的核心请求/结果定为以下形状；MessageContent、ChatSessionMessage 沿用 chat-core，ThinkingLevel 沿用全仓唯一类型，AiError 使用第八节的错误结构：

```ts
interface AiRunStartRequest {
  runId: string;
  session: AiSessionRef;
  expectedRevision: string;
  message: MessageContent[];
  model: AiModelRef;
  thinkingLevel?: ThinkingLevel;
  maxOutputTokens?: number;
  temperature?: number;
  toolIds: readonly string[];
  skillIds: readonly string[];
  interactionMode: AiInteractionMode;
}

interface AiRunResult {
  runId: string;
  session: AiSessionRef;
  outcome: AiRunOutcome;
  committedRevision: string;
  messages: ChatSessionMessage[];
  error?: AiError;
}

interface AiRunHandle {
  runId: string;
  result: Promise<AiRunResult>;
  abort(): Promise<void>;
}
```

`runs.start(request): Promise<AiRunHandle>` 在接受前失败时拒绝并携带 AiError；接受后 result 统一返回结果，不用成功对象里包失败文本。`toolIds: []` 表示禁止工具，`skillIds: []` 表示没有显式点名技能，不代表关闭自动可用技能目录；自动技能仍须通过已选择/宿主允许的技能加载工具执行。持久化失败时 committedRevision 只能指向最后已确认版本，不能伪造新版本号。

单发 generation 使用独立请求：requestId、databaseName、model、system、user/assistant 消息与可选思考/采样参数；没有 sessionId、工具、目录行和默认历史。返回取消句柄、pi 最终结果的中立投影与 usage。它和持久会话共用模型/传输，但不能隐式覆盖聊天文件。

### 4.3 事件与消息口径

复用现有 ChatStreamEvent 的 turn 快照和归约器、AiRunEvent 的运行事件语义；将缺少的 provider metadata、运行中送达的用户消息、交互 revision 提炼到同一个中立事件契约。浏览器伴读的 AiRunStartParams 仍是其传输适配，不直接充当手机本机 API。

事件信封统一携带 runId、seq、会话身份与宿主代次。重复或较旧事件丢弃；发现序列缺口时取快照，不拼接猜测的增量。运行时 turnId 与历史 `pi:jsonl:<entryId>` 保持不冲突的身份规则。

正文、思考、工具调用及结果顺序保留；多次工具循环合并为一个 ResponseMessage 的多个 assistant_blocks。流式和重开历史使用同一投影算法，settled 后以已提交文件重读结果校正内存。

### 4.4 工具执行接口

```ts
type AiToolExecutionContext = {
  session: AiSessionRef;
  runId: string;
  executionId: string;
  toolCallId: string;
  signal: AbortSignal;
  operationId: string;
};

type AiToolSpec = {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  risk: "read" | "write" | "execute";
  sourceId: string;
  executionIdentity: string;
};

type AiToolResult = {
  content: string;
  modelContent?: string;
  metadata?: Record<string, unknown>;
};

type AiToolExecutor = (input: unknown, context: AiToolExecutionContext) => Promise<AiToolResult>;
```

定义与执行器一同注册。SDK 参数校验后执行；异常走工具失败通道，不把错误藏在成功 metadata。模型调用名、内部稳定 id、展示名保持分离，沿用桌面命名约定。

库名和取消信号贯穿原生命令，不能只在最外层检查 activeDatabase。原生租约绑定确定数据库连接，异步准备完成后仍提交原库；切库使租约失效，不能将旧调用重定向至新库。

工具的声明、连接代次和权限组成 executionIdentity；运行捕获定义与执行器，执行时校验当前注册仍有效。迟到结果按 executionId 丢弃，不能只用可复用的 toolCallId 认领。

operationId 为业务幂等接入点，不意味着框架承诺任意外部工具恰好执行一次。写入结果未知时不自动重放；由具体工具查回执或重新读取事实。

## 五、会话文件与数据一致性

### 5.1 使用桌面 v3 文件，不启用另一套聊天正文表

两端统一使用当前 v3 头部及 entry 树，保留 id / parentId / timestamp / 当前叶子语义。手机通过独立的 v3 存储适配接到 Agent；不采用新 JsonlSessionRepo 的 v4 作为交换格式，也不把它伪装成 v3。

浏览器伴读的独立 browser-sessions 继续按页面归属、不随库同步；不能为了补齐手机而把应用目录中的所有 JSONL 一并打包。

公共 session 模块承担：

- v3 字节解析与序列化、文件头及 entry 身份校验、尾部不完整记录的定位。
- 当前路径选择、context_edit 的省略/替换、model_change / thinking_level_change。
- 桌面 compaction 的 firstKeptEntryId、systemMessage、branch_summary 与 custom_message 的上下文语义。
- 完整历史展示与压缩后模型上下文分开构建，不能为了续聊把较早可展示消息丢掉。
- desktop-display / desktop-leaf 的既有标记照常读写。名称暂不重命名，不因手机写入就产生两套语义。
- 保留原始模型 message 的签名、provider 字段与未知扩展字段；展示 DTO 不是反向重建模型上下文的依据。

这部分是明确的格式适配工作，不视为 SDK 已经提供。使用官方 SessionManager / buildSessionProjection 作为 Node 侧对照，验证公共算法语义一致；不以浏览器深路径导入 Node 模块规避适配。

较新格式返回 `AI_SESSION_FORMAT_UNSUPPORTED`，不误写、不删除原字节、不把坏文件解释为空对话。未知状态型 entry 原样保留；未知且可能影响模型上下文的 entry 可阻止续聊，但不妨碍已知消息的诊断投影。

### 5.2 主库与文件的职责

沿用现有 chat_session / chat_group，原则上不改表结构。source 扩为 desktop / mobile / browser 属于文本值与共享类型更新，不需要新增来源列。

消息正文唯一事实源是 JSONL。messageCount、更新时间等可从文件重算；用户标题、分组、归档、置顶等管理信息不能通过扫文件恢复，必须保留在主库。

首条用户消息即落盘，不等待第一条 assistant；接受后即使模型失败，另一端也能看到同一问题。messageCount 继续按当前路径的用户提问数统计，不按工具轮数计数。

cwd 是原会话的来源信息，不能拿另一台设备的绝对目录执行工具。手机不提供 shell 工作区；本机资源定位通过宿主解析。

### 5.3 原生落盘与恢复

原生只允许在当前库确定的会话目录中操作文件。通过服务方法读写，业务调用者不能传任意绝对路径或任意 JSONL 字节。

原生端口按库租约组织为 `ai_session_list / read / commit / edit / remove` 与 `ai_http_open / read / cancel`，具体 DTO 来自共享契约。read 使用游标分块，不把整目录或整份大文件经 IPC base64 编码；UTF-8 增量解码。超过现有移动 IPC 消息预算的单条 entry 由传输层切片，Rust 重组验证完整后才进入提交，不把切片边界当 JSONL 事务边界。

每次修改携带 operationId、预期 revision 和宿主租约。文件与 SQLite 无法共享事务，使用原生本机事务日志记录“准备 → 文件写入 → 目录更新 → 完成”；确定 entryId 后幂等追加，失败保留日志，启动及同步前完成恢复，不宣称两次写入天然原子。

Agent 的 awaited 事件监听作为写入屏障：用户消息/展示 entry、assistant 工具调用意图、工具结果分别确认落盘后才推进下一阶段。工具调用意图未落盘不得执行副作用，工具结果未落盘不得开始依赖它的下一轮。

高频 partial 不逐 token 追加权威 entry；可节流写本机运行检查点，放在会话交换目录之外。检查点只用于本机异常恢复，带 runId、entry 身份与文件 revision，不同步、不覆盖已提交的最终消息。

进程丢失后：核对事务日志和最后已提交路径；有适用 partial 时按中断消息落盘；未完成的工具结果按中断收尾。可能已经提交的写工具明确标为“结果未知”，不伪称未执行。审批和会话授权不恢复、不跨设备继承，也不自动续跑旧工具。

局部末行写入中断只在备份原始字节、确认是本机未完成追加后恢复；中间记录损坏与较新格式不静默跳过。主库继续走现有保留数据的正常升级路径。

## 六、同步与双端展示

### 6.1 完善现有同步协议

沿用 tau-sync-v1 固定对象布局和分块协议，不新建聊天云服务、第二套同步目录或消息级合并协议。

两端都上传/下载：数据库、sessions.json 完整清单、清单所列 JSONL。继续按库整体覆盖，现有云端版本冲突由调用方处理；本任务无 UI，只提供已有冲突结果与前置校验。

上传前在维护租约内确认会话文件与目录可用；登记了持久会话却缺正文时返回 `AI_SESSION_FILE_MISSING`，不能发布空清单覆盖另一端正文。实际上传顺序为库文件 → 会话文件 → 完整会话清单 → 最后版本文件。任一文件失败整次失败，不提交新版本号。

移动端从较新云端下载时，先把库和清单里的会话下载到临时区域。确认文件传输完成后，在同一个本机维护流程备份旧库与会话目录，再安装两者；两次改名通过安装事务日志保证失败回滚/重启恢复。清单存在但为空表示明确空集；清单不存在与文件下载失败不能解释为同一种空集。

沿用既有“只搬文件”的数据库同步边界，不新增内容格式门禁。下载没有会话清单的现有记录时不凭空删除本机会话；安装后只认目录行匹配的文件，悬空行报告缺失，不能把同名本机历史冒充远端历史。更换清单覆盖的会话时，保护不能对应新目录行的本机原文件，保存在本次备份中。

清单与分块对账测试放在共享同步协议夹具；不能复制硬编码常量到手机。会话上传可使用与桌面相同的增量策略，只有远端版本仍等于上次确认版本时才能跳过未修改文件。

版本文件最后写入是完成标记，不是远端多个固定对象的事务提交；上传失败时已覆盖的对象可能变化。维持现有同步语义，回读版本以发现并发变化，不承诺多设备并发合并或远端原子快照。

### 6.2 同步和运行互斥

模型请求、准备附件、工具执行、等待交互与持久化收尾都算忙态。同步与会话写入共用按库维护租约；忙时拒绝同步，不隐式中断任务。

维护期间禁止新运行、历史修改和后台自动起名等会话写入。下载替换完成后增加库代次，旧内存快照、注册工具捕获的库引用与迟到事件全部失效，再重新建立服务。

统一锁顺序为维护租约 → 会话互斥 → 短时文件/数据库事务。运行租约表示库身份和忙态，不意味着跨模型请求或用户审批一直占住 SQLite 事务；等待网络和交互时不持有数据库写锁。

### 6.3 渲染一致性

两端从同一 JSONL、同一叶子经公共投影得到同一 ChatSessionMessage[]：用户内容、思考、交错工具块、执行结果、usage、版本位置、piEntryIds 与结构化 metadata 保持一致。

保留已有工具 render 标识和版本化数据，但不随历史反序列化可执行组件。未安装对应插件或手机缺少专用 renderer 时，使用现有通用工具展示所需的工具名、输入、输出和错误；历史可查看不依赖当前工具可执行。

移动端没有原模型配置时仍可读历史；续聊前显式选择当前可用模型，不凭展示名匹配 provider。桌面专属 scope 可读，但不自动打开桌面功能或注册其专属工具。

绝对路径不能作为新增附件的跨端身份。附件进入现有资源存储，消息持久化携带逻辑资源名、媒体类型和可选摘要，绝对路径/本机 URL 仅由宿主解析产生。图片保留可直接投影的模型数据；文件不可用时仍有名称、状态与正文，不伪装为已下载。

现有按绝对路径保存的展示 entry 不能保证另一设备取到原文件：能映射到受管资源的在原设备正常升级时补齐引用，其余保留原始信息并报告缺失。两端数据准备层适配现有渲染参数，不为此新增 UI 组件；不声称所有旧外部附件均可恢复。

## 七、模型、网络、权限与扩展能力

### 模型与原生 fetch

首版支持已经验证的三个 PiApiKind。抽取桌面设置到 Provider / Model 的纯转换逻辑，保留 builtin 目录、模型级 api、compat、采样参数和价格优先级。缺失上下文容量时明确返回 `AI_MODEL_METADATA_INCOMPLETE`，不猜测窗口大小。

Rust 实现宿主 fetch 端口，JS 使用标准 Request / Response / ReadableStream / AbortSignal 适配交给 pi-ai。复用已有流式网络的底层实现经验，不冒用插件 token，也不把 plugin_fetch 的插件授权边界取消。

提供方配置在请求开始冻结；凭据由原生读取与注入，公开配置只返回脱敏视图。SDK 使用非敏感凭据句柄/占位值，原生端校验请求属于已捕获提供方配置后注入实际鉴权；重定向不可把鉴权转交其他来源。取消、错误、重试和连接释放都传到原生端。

不在 WebView 内嵌应用运营方长期密钥，不读取其他任务或用户账号来完成验收。模型设置、密钥和 MCP 凭据不因聊天记录同步而自动上传；本任务只统一现有设置语义。

### 权限与交互

共享桌面 read / write / execute 分类、默认 execute、会话授权与审批策略。风险与来源属于注册定义，模型不能覆盖。会话授权绑定定义身份和运行宿主，重启、重连或能力改变失效。

无交互宿主时，需审批返回 `AI_INTERACTION_UNAVAILABLE`；ask-question 同理。已有内容审阅可以在真正接入审阅宿主后按桌面规则免重复审批，但不能仅凭 source 字符串宣称已经审阅。当前任务不写审阅卡。

### MCP

提供远程 Streamable HTTP 客户端与工具转换，网络经同一原生流端口，MCP 鉴权按服务配置隔离。MCP 工具默认 execute；连接断开、重连、配置改变或停用后撤销对应工具代次。

配置继续使用现有带 transport 的结构；手机遇到 stdio 明确返回 `unsupported_transport`，不启动进程、不静默转换。历史工具结果照常展示。首版不增加 MCP Apps 嵌入运行器和任意远程 UI。

### Skills

统一标准 SKILL.md 的名称、描述、调用方式与相对资源解析，保留现有启用/手动选择语义。支持内置说明、受管个人目录和插件声明的技能目录；来源与可读范围由宿主提供，包完整性沿用插件体系。

手机首版支持目录发现、正文按需加载和参考资源读取，明确不提供 Shell / Python 脚本执行。技能文件里的指令不会授予额外权限，也不能越过已注册工具能力；历史中用过的技能标识和提示词信息保留，手机未安装技能不妨碍历史展示。

技能安装目录不通过 sessions.json 隐式同步。工具与技能装载过程独立于聊天 UI；插件停用和切库时正常回收。

### 生命周期

服务由应用现有启动/工作区生命周期初始化，订阅不依赖页面保活 effect。进入后台时尽力取消网络和在途工具、冲洗已提交结果并标记中断；系统立即冻结或杀进程时依赖原生事务日志恢复，不承诺后台继续执行。

切库前中止并等待原库运行收尾；无法确认结束时不放行到新代次。网络失败只重试允许重试的模型请求，不自动重复副作用工具。设备恢复后由调用者显式重新发起，审批不自动复活。

## 八、错误与能力声明

公共错误为 `{ code, message, retryable, details? }`，不外泄密钥和原始鉴权头。至少覆盖：

`AI_SESSION_BUSY`、`AI_SESSION_REVISION_CONFLICT`、`AI_SESSION_FILE_MISSING`、`AI_SESSION_FORMAT_UNSUPPORTED`、`AI_LIBRARY_CHANGED`、`AI_LIBRARY_BUSY`、`AI_MODEL_UNAVAILABLE`、`AI_MODEL_METADATA_INCOMPLETE`、`AI_INTERACTION_UNAVAILABLE`、`AI_TOOL_UNAVAILABLE`、`AI_TOOL_OUTCOME_UNKNOWN`、`AI_STORAGE_FAILED`、`AI_TRANSPORT_FAILED`。

宿主能力快照明确声明持久会话、历史修改、图片输入、交互宿主、远程 MCP、脚本技能支持情况。显示历史与运行能力独立；不通过返回空数组或模拟成功表达“不支持”。

## 九、实施顺序与验收

| 批次                       | 交付                                                                         | 必须通过的验收                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. 共享数据契约与 v3 适配  | 工作区包入口、来源类型、共享历史投影、模型上下文和格式夹具；桌面消费公共实现 | 官方 SessionManager 写 → 公共层读；公共层写 → 官方 SessionManager 读；包含压缩、分支、删除、展示 entry、签名与未知字段 |
| 2. 移动原生存储与网络      | 原生会话仓库、目录命令、落盘日志、模型配置解析、fetch / 取消与库绑定         | Rust 临时库真实读写；故障注入验证跨文件/目录恢复；真实原生流通道解析分片响应；旧代次无法写新库                         |
| 3. 无 UI 运行服务          | AiService、单发与会话运行、稳定事件、工具注册、权限和交互协议                | 无页面挂载运行完整工具循环；拒绝/取消/失败正确 settled；首轮失败仍有用户消息；无交互时不悬挂                           |
| 4. 同步双向互通            | 手机会话清单与分块上传下载、维护互斥、附件资源引用                           | 桌面建聊 → 手机下载/续聊/上传 → 桌面重开/续聊；反向同测；目录和正文配套，未支持工具仍能投影                            |
| 5. MCP / Skills 与综合验收 | 远程 MCP、说明类 Skills、来源回收、协议与兼容测试                            | 测试 MCP 服务真实 HTTP 调用；技能/附件访问边界；服务停用不串工具；全部数据投影一致                                     |

每批先交付最小可测试能力，不留被生产调用却没有实现的方法。统一接口通过明确能力/错误表达尚不支持的范围，不用空实现占位。

验证分层：

- 纯函数与格式差分：v3 官方对照、完整历史/模型上下文、流式和历史语义一致。
- 宿主集成：Electron 临时会话、Rust 临时库、原生网络、持久化故障和维护互斥。
- 同步互通：使用现有分块协议及真实文件传输，包含失败、空清单、缺清单、缺文件与再次上传。
- 非视觉设备验收：iOS / Android 的实际原生流、前后台、中断恢复与临时数据闭环。真实提供方测试只用明确配置的测试账号。
- 类型、架构边界、行为测试、构建与文档检查；不做截图或视觉走查，不以 VM 代替真机结论。

若实施中确需修改 schema，同批同步 parity 数量/断言、生成 bundle、内置数据库 Schema Skill，并执行规定的构建与校验；本方案不预设新增消息表。

## 十、进度与完成定义

- [x] SDK 级独立验证完成，确认 pi-ai / pi-agent-core 路线可继续。
- [x] 核对桌面 v3、Agent 新仓库 v4、移动同步缺口与公共消息模型。
- [x] 公共 v3 会话、模型转换、统一历史投影及桌面消费接线。
- [x] Rust 会话存储、事务恢复、配置冻结、网络流及聊天文件同步。
- [x] 移动无 UI 服务、运行屏障、失败重试、工具/交互、Skills/MCP 与前后台生命周期。
- [x] 类型检查、相关行为回归、Rust 验证、双端 Vite 构建及无 Node 隔离运行。
- [x] 临时 DeepSeek 账号的真实流式、工具循环、文件重读续聊、跨协议续聊、收流取消及图片理解。
- [ ] 实际对象存储插件完整往返与 iOS/Android 原生链路验收。

### 本轮实现与验证记录

按公共会话、原生宿主、工具/Skills/MCP 三条线并行实施，主 agent 负责模型与运行服务、跨模块接线和复核。没有新增产品 JSX、页面、菜单、设置或业务工具注册。

运行事件落地为携带 runId / seq / session 的 snapshot 与 settled 信封，snapshot 内直接使用统一消息 DTO。会话列表沿用明确的 offset / limit 分页；失败重试公开为 runs.retryLast。源码与调用契约见包内公开入口和 README，不存在第二套移动消息格式。

实际验证包含：公共包完整行为回归、移动门面/生命周期与原生桥接测试、桌面模型/会话相关回归、chat-core 公共入口与归约器回归；Rust 全量测试；桌面与移动类型检查、双端 Vite 构建、Clippy、格式检查及文档检查。完整公共入口在无 Node 全局变量的 VM 中通过本机模型 SSE 与官方 MCP HTTP 服务跑通三轮推理与持久 entry。

模拟模型、原生桥替身及本机 HTTP 测试不等于真实服务商或手机验收。另使用用户临时授权的 DeepSeek 凭据完成七次真实对话请求，每次最多 512 输出 token：单发、隔离卡片读取/追加、v3 临时文件重读续聊、收流取消、OpenAI 格式历史切到 Anthropic 格式续聊均符合预期。真实模型测试使用临时文件存储适配，不冒充 Tauri 原生端到端；令牌仅在进程内使用，测试后清空内存绑定与执行环境，报告和 JSONL 不保存凭据。无凭据报告为 `output/mobile-ai-foundation/deepseek-live-report.json`。

Rust 临时库测试覆盖真实文件/SQLite 与安装恢复，但实际存储插件完整远端往返尚未验证。普通文件和非内联图片需要调用方提供 prepareInput；图片可从已有 Pi 原文的内联数据跨端投影。高频 partial 不写权威文件，进程被立即杀死时不能保证最后尚未完成的文本可恢复。

另补四次真实 PNG 输入验证，每次最多 128 输出 token：文字加图、纯图消息、保存重读后再次识别、无工具单发图片均通过；模型正确识别两组测试图的颜色与数字，保存的 MIME/base64 与原图一致。报告为 `output/mobile-ai-foundation/vision-live-report.json`。同时补齐文本模型图片拒绝、prepareInput 结果模态检查、含图历史/重试检查，以及与桌面同形的单发 user.images。相册/拍照入口和普通路径转换仍不在本轮 UI 范围。

历史缺回执工具在只读投影中显示结果未知；续聊前才补正式工具结果，不自动重放。切库/显式 release 回收库作用域声明；后台 suspend 保留声明，回前台只解暂停，MCP 仍须明确重连。

本任务完成必须具备真实宿主的数据与同步验收，不以单纯类型定义或 mock 测试为完成。收尾时把已实现事实写入 mobile / desktop / storage-sync 架构文档，将可复现操作沉淀为指南，删除本任务目录并更新文档索引。方案提出的约定在实施前不冒充当前架构事实。
