# pi 迁移交接文档（refactor/pi-harness 分支）

> 2026-09-28 交接（M2-f 完成；M3 全部完成——M3-a~h 已提交，**第 6 项 WSL 手动选项用户裁决不做**；
> **M4 本批完成**：目录表 + JSONL 事实源切换 + 五场景接入 + 同步带会话包 + 扩展改页面会话，见「M4 实施记录」；
> 用户初步验证正常（第七节「M4 专项」逐项走查未做）。**M4-d 完成**：分支改为同一文件内的 pi 会话树，见「M4-d 实施记录」
> （实机走查见第七节「M4-d 专项」，未做）。**M4-e 完成**：治理与重启恢复，见「M4-e 实施记录」（走查见「M4-e 专项」，未做）。
> **M5 完成**（含追加：侧栏重开接回在跑的回答）：扩展侧栏对话由主进程驱动 + 协议 v2，见「M5 实施记录」（走查见「M5 专项」，未做）。
> **M7 用户裁决不做**（同步保持 zip 整包）。下一步是 M8（删旧收尾，裁决已定，见第六节）。
> 新会话续接方式：读完本文档 + `git log --oneline -15` 对照提交历史。本文档随每步同步更新。
> 验证三件套：`cd apps/desktop && npx tsc --noEmit`、
> `npx vitest run`（345 文件、1659 用例通过；2 文件、3 用例跳过）、`ELECTRON_RUN_AS_NODE=1 npx electron scripts/pi-smoke.mjs`。
> 改了 `packages/shared` 要另跑 `packages/shared`（5 文件 15 用例）与 `apps/browser-extension`（10 文件 46 用例）的 vitest + tsc
> （思考档位类型与 `ChatSessionRecord` 定义在 shared，三端共用）。
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

## M4 实施记录（会话管理，2026-09-28）

### M4.0 范围与已定裁决（用户已拍板，不要再问）

M4 = 会话管理。本批 = 原计划 M4-a（目录表 + resume）+ M4-b（投影 + 迁移器 + 事实源切到 JSONL）

- M4-c（五个场景全部接目录表、旧表读写路径退役）。**不含** M4-d（分支改 pi 会话树导航）与
  M4-e（runtime 条目治理、主进程重启后的交互恢复）。

| 裁决       | 内容                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 目录表主键 | **字符串 = pi 会话 id**（目录表 id = JSONL 头部 id = 会话键后半段），不沿用自增 int                                                                                                                                                |
| 目录表     | **新建** `chat_session`，不扩 `chat_message`（旧表带 messages 大字段与旧分支语义）                                                                                                                                                 |
| 分批       | a+b+c 同批。理由：`ChatContainer` 是五场景共用的，只迁主聊天会让组件内分叉成两条渲染路径                                                                                                                                           |
| 迁移粒度   | **一行一会话**，分支族先**不合并**；父子关系靠 `parent_session_id` + `branch_index` 保留（M4-d 的树合并迁移再并进父文件）                                                                                                          |
| 思考内容   | **不迁**（方案 1）：老 reasoning 无签名，pi 重放无签名 thinking 时会降级成正文喂回模型；与迁移前 `desktopMessagesToPi` 不回放 thinking 一致。只影响老对话看不到当时的思考过程；新对话由 pi 原生写带签名的 thinking，正常显示与回放 |
| 旧表       | **不删**（留 M8），迁移可回退                                                                                                                                                                                                      |
| 同步       | **方案 A**：`sessions/<库名>/` 打 zip，与 `.db` 共用同一个版本号一起上传/下载（见 M4.4）。增量 manifest 留 M7                                                                                                                      |
| 浏览器扩展 | **一起改**：对话存按页面分目录的 pi 会话文件，不进目录表、不参与同步（见 M4.5）                                                                                                                                                    |
| 提交粒度   | 事实源切换**一次性一个提交**（中间态会让同一场景读两套事实源，无法拆出可运行的中间提交）                                                                                                                                           |
| WSL        | M3 第 6 项不做                                                                                                                                                                                                                     |

### M4.1 地基与迁移器（两个先行提交，纯增量）

- `524edebd2` 地基：
  - `chat_session` 表（schema 分片 `20_content.sql` + 4 个索引 `90_indexes.sql`，bundle 已重生成，
    parity 常量 69→70 表 / 116→120 索引）。mobile 的 `main_upgrade.rs` 对缺失表按 baseline 自动建，**无需 Rust 改动**。
  - `tables/chat-session.ts`：CRUD、`list`（按 scope/domainRef 过滤，置顶在前再按 update_time 降序，
    默认排除归档与分支）、`listBranches`、`nextBranchIndex`、`pin/unpin`（同 scope+domainRef 内 max+1）、
    `remove`（级联分支子树，返回全部被删 id）。IPC 通道 `chat-session:*`，已注册进 `database.ts` 表数组。
  - 跨进程类型 `src/types/chat-session.ts`；渲染端 `src/commands/chat-session.ts`。
  - `assembleHostSession` 支持 `sessionFile`（resume，走 `SessionManager.open`）与 `sessionId`（新建时指定 id）；
    **文件不存在时按 `sessionId` 新建**（pi 等第一条 assistant 消息才落盘，首轮失败就没有文件；
    `SessionManager.open` 对不存在路径会起随机 id，目录表就对不上了）。
  - `pi-session:create` 新增入参 `sessionFile`（相对会话目录的文件名）/`piSessionId`，回传 `piSessionId` 与 `sessionFile`；
    resume 时忽略 `initialMessages`。
  - `pi-session:transcript`（渲染端 `piSessionTranscript(sessionFile)`）：读叶子路径 → 桌面展示消息，纯读不起会话，文件不存在返回空数组。
  - `pi-session-transcript.ts` 的 `piEntriesToDesktopMessages`：`desktopMessagesToPi` 的逆。两条用户消息间的多个
    assistant message 合并成一条回答的多个 turn；turnId = `pi:jsonl:<entryId>`（与运行时 `pi:<序号>` 形状不同，不撞）；
    clientId = `pi:<entryId>`；工具结果回填 tool_call 块（含 details→metadata）；usage 累加。
- `3d394bf83` 迁移器 + 会话文件操作：
  - `chat-session-migration.ts` 的 `migrateLegacyChatsToSessions({db, databasePath, sessionDir, cwd})`：
    四张表（`chat_message`/`pdf_chats`/`video_note_chats`/`vibe_learning_chats`；`audio_note_chats` 无活 UI，不迁）
    逐行 → 会话文件 + 目录行。migration_meta key `chat-session-pi-jsonl:v1`；有数据时先 `VACUUM INTO` 备份；
    单行失败记入 `failed` 不中断；远程图片不下载（`desktopMessagesToPi` 新增 `{allowNetwork:false}`）。
  - `pi-session-files.ts`：
    - **展示 entry**（`custom`，customType `desktop-display`，data = `{modelText, content, clientId}`）：
      JSONL 里的用户消息是**发给模型的那一版**（文件附件是「请用 read 工具读取」提示、图片编辑拼了隐藏上下文），
      展示 entry 存桌面展示形态；custom entry 不进模型上下文，事实源仍是同一份文件。
      投影（`loadSessionTranscript`）**按模型文本认领**用户消息，不按位置（插话的用户消息与展示 entry 不紧挨）。
    - `rewindToBeforeEntry(file, entryId)`（切换提交里由 `rewindToBeforeUser(file, userIndex)` 改来）：
      编辑重发/重新生成 = 挪叶子 + 追加 `desktop-leaf` 标记落盘（pi 加载时取文件**末条 entry** 为叶子，
      不落盘重开就回到旧分支末尾）；旧回答留在树上。
    - `omitEntries(file, entryIds)`：删除单条消息 = pi 原生 `context_edit(target, null)`，投影同样隐藏。
    - `branchSessionFile`：建分支 = 拷路径到新文件（M4-d 已删，建分支改为同文件内分叉）。
    - `writeSessionFile`：直接写整文件（迁移器用，不走 `appendMessage`——只有用户消息的老对话写不出文件）。
  - 测试：`chat-session.test.ts`、`pi-session-resume.test.ts`、`chat-session-migration.test.ts`、`pi-session-files.test.ts`
    （真实 pi 会话 + faux：落盘投影、resume 模型看得到历史、迁移文件能 resume、挪叶子重开生效、删除对模型与界面都隐藏）。

### M4.2 开库迁移接线（与切换同批）

`database.ts` 的 `create-or-connect-database` 在 `connectMode === "maintenance"` 时、`notifyDatabaseConnected`
之前跑迁移器（渲染端一连上就查目录表，没跑完会看到空列表）；整体失败不阻塞开库（旧表原样、没记账、下次重试）。
迁移器跳过 `source='browser'` 的行（扩展对话改存页面目录，见 M4.5）。
**为什么不能先于切换提交**：迁移一旦记账就不再重跑，而切换前渲染端还在写旧表，迁移后的新消息目录表看不到。

### M4.3 事实源切换（本批主体，一个提交）

**事实源**：对话内容不再写 sqlite。`chat_session` 只存目录元数据，消息由 `pi-session:transcript` 从会话文件投影。

- **统一会话 store** `src/stores/useChatSessionStore.ts` 取代四个旧 store（`useChatMessageStore`/`usePdfChatStore`/
  `useVideoNoteChatStore`/`useVLChatStore`）：按 `scope|domainRef` 分桶的目录行 + 已打开对话（id → ChatMessage）+ 分组。
  `bucketOfChatScope` 从 `chatScope`（`pdf-chat:12`）解析分桶。**面板接线** `src/hooks/useScopedChat.ts`
  （列表/当前对话/新建/改名/删除/分支数），五个场景共用。
- **草稿态**：点「新对话」即 `crypto.randomUUID()` 生成真 id，目录表里查不到就是草稿；首发时宿主以这个 id 建会话，
  回传 `sessionFile` 后 `registerChat` 登记（必须在 prompt 之前——空闲会话的 prompt 要等整轮跑完才返回）。
  **id 从头到尾不变**，`adoptConversation`/`id === 0` 全删。草稿**不进 store 状态**，放模块级草稿槽
  `draftSlots`（`draftFor/resetDraft/releaseDraft`）：渲染期取草稿不能触发 setState；每个面板一个槽
  （停靠栏与对话页同属主聊天，各有各的新对话）。持久化的 `currentIds` 读出时丢弃旧版本的 number id。
- **shared 类型**：`ChatSessionRecord.id/parentChatId` 改 string，新增 `sessionFile/scope/domainRef`；
  `RequestMessage`/`ResponseMessage` 加 **`piEntryIds`**（用户消息带自己的 entry id，一条回答带它全部 assistant+toolResult
  的 entry id）——改历史按它定位，不靠 clientId（迁移数据的 clientId 是旧值）。
- **发送链**：`ensureChatSession` 传 `piSessionId = 对话 id` 与 `sessionFile`，不再传历史。`pi-session:prompt`/`steer`
  加 `display` 参数，展示 entry 由主进程 `createDisplayEntryWriter` 写，**模型文本取主进程实际送出的 text**
  （渲染端不传，两边不可能对不上）；且在 pi 的 `message_end(user)` 之后**推迟一个微任务**写
  （pi 先通知监听者、再 `appendMessage`，不推迟会写到用户消息前面）。
- **运行时收尾**：`piChatRuntime` 的 `deps.persist` 改为 **`settle`**：`agent_settled` 后重读投影，`adoptTranscript`
  按位置沿用原 clientId 回写容器（避免列表重挂载），再更新目录行 `messageCount/updateTime`；标题走 `saveTitle`。
  删掉两处立即落库：等待审批/提问时的快照、插话送达时（pi 送达即写 JSONL）。`restorePendingInteractions` 改判
  「最后一条回答里有没有**没有结果**的 tool_call」，是不是真在等由宿主交互快照决定。
- **改历史**（M4-d 已改写，现状见「M4-d 实施记录」）：新 IPC `pi-session:edit`。两处与原计划不同，M4-d 沿用：
  ①`rewindToBeforeUser(下标)` → **`rewindToBeforeEntry(entryId)`**，被省略的消息仍在路径上，下标会错位；
  ②挪叶子后把仍在新路径上的 `context_edit` 省略**重新挂一遍**——省略只作用于它所在的分支，不重挂删过的消息会复活。
  `recreateChatSession` 已删。
- **级联删除下沉到表**：`ChatSessionTable.remove/removeByDomain` 连会话文件一起删；`chat-group` 删组改 `clearGroup`；
  PDF 删除调 `removeByDomain`。会话目录的唯一取法在 `pi-session-paths.ts`（`chatSessionDirOf`/`chatSessionDirOfDb`/
  `browserSessionDirOf`，`resolveSessionFile`/`assertSafeSessionId` 防路径穿越）；投影、改历史入口、扩展列表、
  同步打包在 `pi-session-store.ts`。
- **删除**：四个旧 store 及测试、`commands/video-note-chat.ts`、`commands/chat-message.ts` 的对话读写（只留分组命令）、
  `commands/pdf.ts`/`vibe-learning.ts` 的对话命令、`components/ModelSidebar`（本就无引用但依赖旧 store）、
  `editingUtils` 的 `buildResetBaseChat`/`buildFullHistoryMessages`。旧表与主进程 handler 按计划留到 M8，渲染端零调用。

**测试**：`pi-session-store.test.ts`（页面键、扩展列表/删除、打包解包与回滚）、`pi-session-display.test.ts`
（展示 entry 端到端）、`piChatRuntime.settle.test.ts`（投影回写与标题）、`useChatSessionStore.test.ts`
（首发登记与文件名回写、五场景分桶互不串、草稿槽）；扩展侧 `chatStoreClient.test.ts`（chat.* RPC 形状）。

### M4.4 同步（方案 A）

切到 JSONL 后目录表随 `.db` 同步、会话文件不跟——列表过去点开全空，所以同步同批改。
`sessions/<库名>/` 打包成 `<库名>.sessions.zip`，与 `.db` 共用同一版本号：

- upload：`.db` → 会话包 → 版本信息；任一步失败不发布版本。
- download：本地会话目录先备份再解包替换；**远程没有会话包**（迁移前的远程）时不动本地；
  坏包走「备份挪回来」回滚，空包与坏包用 `isEmptyZip` 区分。
- **坑**：`new AdmZip(buffer)` 在 vitest 下读不出条目（同一个包纯 node 正常），改成落临时文件按路径打开。
- 移动端不读聊天表，不受影响。增量 manifest 留 M7。

### M4.5 浏览器扩展（页面会话）

- 扩展对话存 `~/.editor/browser-sessions/<页面键>/`，页面键 = 去掉 hash 的 URL 的 sha256 前 32 位，**由主进程计算**；
  与库无关、不参与同步、桌面列表看不到。**无索引表**：列表/标题/分支关系全取自 pi 会话文件
  （`SessionManager.listAll` + 会话头 `parentSession` + `session_info`）。
- RPC：`chat.list/get/rename/delete/branch/rewind/omit`（全部带 `pageUrl`，id 为 string）；删掉 `chat.create/update/groups.list/group.ensure`。
  桌面侧新 IPC `pi-session:browser-list/browser-rename/browser-delete`。
- `ai.chat` 带 `sessionId + pageUrl` 时走 `runBrowserSessionTurn`（每轮从文件恢复、跑完释放，`interactive: false`）；
  不带则保留原一次性路径。扩展不再拼历史、不再整包写消息，`useAiChat` 结束后经 `onFinish` 重读投影。
- 已删：扩展 `chatMigration.ts` 及测试、ask-question 续流（pi 没法事后注入工具结果，与桌面 M3-b 一致）、system prompt 快照机制。

## M4-d 实施记录（分支 = 同一文件内的会话树，2026-09-28）

**用户裁决**：保留树结构（不走 Claude/Codex 那种 fork 出去互不相干的做法），将来的树谱视图读同一份数据；
旧的多文件分支族**合并进父对话的树**；编辑重发**放开到任意一条用户消息**。

**语义**：一个对话 = 一个会话文件 = 一行目录。编辑重发、重新生成、「从这里建分支」都是同一文件树上的分叉，
区别只在分叉点——前两者回到用户消息之前（`rewind`），建分支回到那条回答之后（`fork`，下一条消息成为原下一问的新版本）。
同一位置的多条用户消息互为**版本**，用户消息下常显 `‹ i/n ›`，切换（`switch`）后整段后续对话一起换。
对话下拉的分支 chip、「全部会话」的分支树、删除时的「子分支数」确认全部去掉。

**主进程**：

- `pi-session-files.ts`：改树操作统一接收一个 `SessionManager`（`rewindToBeforeEntry`/`forkAfterEntry`/`switchToVersion`/
  `omitEntries`），共用 `moveLeafTo`：挪叶子 → 重挂旧路径上的省略（新路径上已有的不重复挂）→ 写 `desktop-leaf` 落盘。
  `switchToVersion` 落到该版本子树里**最近写入**的 entry（用户最后在那个版本看到的位置），不是用户消息本身。
  `branchSessionFile` 已删。
- **版本归组** `messageVersionsOf`：按「最近的**对话消息**祖先」归组，不按直接父节点——回退/分叉在分叉点写叶子标记、
  重挂省略，**pi 活会话发送前还会写一条 `role: "system"` 的 message entry**（系统提示与工具集快照），新版本的直接父节点是
  这些结构性 entry。`isConversationMessage` 排除 system（见坑 15）。投影给多版本的用户消息带 `piVersions {ids, index}`。
- `pi-session:edit` 改为：宿主开着这个文件时**直接在它的 `SessionManager` 上改**，改完 `session.refreshContext()`——
  会话不重建，本会话的工具授权保留；`isStreaming`/`isCompacting` 时拒绝。没开着就打开文件改（`applySessionEditToFile`）。
  渲染端的 `piChatSessionManager.editChatHistory`（先 dispose 再改）已删。已有测试证明活会话上改完下一轮模型看到的是新路径。
- **树合并迁移** `chat-session-tree-migration.ts`（`migration_meta` key `chat-session-tree:v1`）：开库时在老对话迁移之后跑，
  同步下载后重连（`sync_download_reconnect`）也跑——下载来的 `.db` 与会话包配对，对面没合并过这里补上。
  按分支深度从深到浅，逐个 `graftSessionFile(父, 分支)` 后删分支文件与目录行；对不上（第一条消息就不同）或出错的降级成
  独立对话（清父子关系，不丢数据）。合并前 `cpSync` 备份会话目录 + `VACUUM INTO` 备份库。
- **嫁接** `pi-session-graft.ts`：公共前缀按 entry id（M4 建的分支拷贝时保留了 id）或按内容（老迁移数据 id 随机，比
  角色 + 内容 + toolCallId）认；候选穿过结构性 entry 找。分叉后的内容追加到目标文件末尾，最后补一条叶子标记指回目标原叶子
  （否则一打开就落到嫁接进来的分支）。源分支在公共前缀上的删除在分叉点补挂；源的叶子标记/改名/标签不带过去。
- 扩展页面目录没有开库时机：`listSessionsInDir` 先 `mergeBranchFilesInDir`（按会话头 `parentSession` 合并，对不上的去掉
  `parentSession`）。扩展列表的 `messageCount` 改为用户提问数（原来是 pi 全文件 message 数，混进了所有分支）。
- 目录表：`list` 不再按 `parent_session_id` 过滤，`listBranches`/`nextBranchIndex`/子树级联删除与对应 IPC 删掉；
  `remove` 只删一行一文件。两列留到 M8（只剩树合并迁移读）。

**渲染端**：store 的 `branchChat` → `editChat(id, edit)`（返回投影；消息数跟当前路径走，更新时间不动）；
`ChatContainer.editSessionHistory` 走它；`handleCreateBranch` 改 `fork`（最后一条回答上提示直接发送即可），新增
`handleSwitchVersion`；`onBranchCreated` 从五个面板删掉；编辑态文案改为「发送后生成这条消息的新版本」。
`adoptTranscript` 沿用 clientId 时多一条规则：两边都有 entry id 且不同（切了版本）就用投影的 clientId，组件状态不串到别的版本。
`MessageView`（桌面）与 shared `ChatMessageView`（扩展）加 `versions`/`onSwitchVersion`，按钮带 `aria-label`，
运行中不传回调即禁用。shared `ChatSessionRecord` 去掉 `parentChatId/branchIndex`，`RequestMessage` 加 `piVersions`。

**扩展**：RPC `chat.branch` → `chat.fork`（同一对话内）+ 新增 `chat.switch`；`chat.delete` 不再返回 `deletedIds`；
下拉的分支切换器去掉，消息上 `‹ i/n ›`。

**测试**：`pi-session-files.test.ts`「会话树」组 8 例（版本投影、切回原版本、落到最近位置、根上的版本、fork、
删除跨版本保持、文件入口、**活会话上改树 + refreshContext 模型看到新路径**）；`chat-session-tree-migration.test.ts` 10 例
（按内容/按 id 嫁接、空合并、无关、前缀删除补挂、多层分支族、降级、未落盘、**老数据 → v1 迁移 → 树合并端到端**、扩展目录合并）；
`useChatSessionStore.test.ts`「改会话树」组；`piChatRuntime.settle.test.ts` 的 clientId 规则；
`MessageView.versions.test.tsx` 与 shared `ChatMessageView.test.tsx` 的版本切换；扩展 `chatStoreClient.test.ts` 的 fork/switch。

### 树谱与分叉标记（M4-d 追加）

用户反馈：`‹ i/n ›` 只挂在分叉点，不翻记录不知道从哪分的叉。做了两层：

- **数据**：主进程 `pi-session:tree`（`conversationTreeOf`）把会话树压成只含用户消息的节点
  `{id, parentId(上一条用户消息), text, answered, time, onPath, omitted}`；回答、工具结果、结构性 entry 全折叠。
  宿主开着时读它内存里的 SessionManager。祖先查找是迭代 + 缓存（长链递归会爆栈）。
- **排版** `features/chat/conversationTree.ts`（纯函数）：直链压成一行（`length`）、分叉点下的兄弟「当前路径所在的在前，
  其余按最近活动倒序」、分支末端带进度（`turnsToLeaf`/`lastActive`）；产出 `branchCount` 与 `forkPoints`。
- **界面**：`useConversationTree` 以当前路径的 entry id 串为重读键（流式期间树不变、不重读）；对话右上角有分叉时显示
  「N 条分支」浮层（`ConversationTreePanel`，`role=tree`/`aria-level`），点一行 = `switch` 到这条分支最近写入的位置并滚到分支起点；
  分叉点那条回答下方画一行「从这里分出了多条分支 · 查看」。
- **坑**：Popover 卡片自带 `max-w-[340px]` + 内边距，内部再写死宽度会溢出卡片——宽度只交给卡片（`className` 覆盖 max-w），内部撑满。
- 测试：`conversationTree.test.ts`（5 例）、`ConversationTreePanel.test.tsx`（2 例）、`pi-session-files.test.ts` 的树谱数据（1 例）。

## M4-e 实施记录（治理与重启恢复，2026-09-28）

**用户裁决**：重启后停在等待审批/等待作答的调用**都标为已中断**（不重新弹出）；宿主**空闲 30 分钟**回收；
待发送队列与未送达插话**不保留**。

**调研事实（决定方案的几条）**：

- 悬挂的 toolCall 不会让会话坏掉：pi-ai 构建请求前（`transform-messages.js`）给缺结果的调用临时补
  `"No result provided"` 错误结果，但**不落盘**，工具卡永远停在等待中。
- pi 没有公开的「接着执行未完成调用」API：`Agent.continue()` 在末条是 assistant 时抛错；`sendCustomMessage(triggerTurn)`
  能走完整生命周期，但会让模型多看到一条 user 角色提示、且不触发动态 systemPrompt。审批重跑还有两个硬伤：文件分不清
  「在等审批」与「执行中崩了」（重复副作用），且 pi 并行执行同批工具、整批完成才写结果。所以只做「标为已中断」。

**实现**：

- **悬挂调用收尾** `pi-session-files.ts` 的 `closeDanglingToolCalls`：`assembleHostSession` 打开已有文件时、在
  `createAgentSession` 之前，给当前路径最后一条 assistant 里缺结果的调用写 `isError` 的 toolResult 并落盘
  （文案 `INTERRUPTED_TOOL_RESULT`）。新建的宿主不可能持有上一次的等待，所以 resume 时的悬挂一定是中断留下的
  （重启、宿主被回收都覆盖）。投影成 `failed`，提问卡走已有的「提问已结束」文案。
- **同一文件只一个宿主** `pi-session-lifecycle.ts` 的 `resolveFileConflict`：`createSession` 前按文件查，空闲的顶替、
  忙（在跑/压缩/有待审批或提问）的拒绝。修掉「渲染层重载后发送 → 同一文件开两个宿主并发写」（调研推断出的问题）。
- **空闲回收**：宿主带 `lastActive`（创建、每个事件、交互快照变化、改树时刷新），每分钟扫一次，空闲超 30 分钟且不忙的释放。
  **切库**：`databaseModule.onDatabaseConnected` 时释放其他库目录里的空闲宿主（`idleSessionsOfOtherLibraries`，只动
  `sessions/` 下，扩展会话不受影响）。判定是纯函数，electron-free 单测。
- **渲染端感知回收**：`ensureChatSession` 复用本地描述时 `set-system-prompt` 失败（宿主已不在）→ 丢掉本地描述、从会话文件重建，
  不报「会话不存在」。
- **runtime 条目回收** `piChatRuntime`：条目带挂载计数（`retain`，ChatContainer 挂载时持有）与 `lastUsed`；
  可回收 = 没挂着、不在跑、没待处理交互、队列与插话为空、没在生成标题。空闲条目最多 20 条（LRU，卸载时顺手扫），
  切库（`reloadAll`）清空全部空闲条目。
- **删 PDF**：`usePdfsStore.removePdf` 先 `releaseBucket`（释放该 PDF 全部对话的宿主与运行态、从 store 拿掉），再删 PDF；
  目录行与文件仍由主进程级联删。

**测试**：`pi-session-lifecycle.test.ts`（6 例：顶替/拒绝/草稿、空闲回收、切库只动旧库且不误伤同前缀与扩展、Windows 路径）；
`pi-session-resume.test.ts` 的「重启后悬挂的工具调用」组（2 例，真实 pi：工具执行中「崩溃」→ 重开补结果并投影成失败、
模型看到中断说明、再开不重复补）；`piChatRuntime.lifecycle.test.ts`（3 例：LRU、挂着不回收、忙的不回收与切库）；
`piChatSession.test.ts` 的「宿主被回收后」重建（1 例）。宿主模块本身绑 electron，冲突与回收的决策都在纯函数里测。

## M5 实施记录（浏览器扩展：主进程驱动 + 协议 v2，2026-09-28）

**用户裁决**：只把对话接口迁主进程（设置、剪藏、界面类 RPC 留在渲染端 aiServer）；扩展的提问与审批**改走桌面宿主原生**
（删掉扩展本地那套提问机制的使用）；一次性调用（概览页、行内问答）**保留，换新协议**。

**先修的 bug**（`5f4e562c5`）：扩展传入的页面工具不带 risk，权限层缺省按 execute，扩展会话不可交互，默认「手动确认」模式下
`get_page_content` 等只读工具被全部拒绝。`buildToolLoadout`/`buildToolSpecs` 的额外工具按 `read` 声明。

**协议 v2**（`packages/shared/src/chat-core/aiRunProtocol.ts`，取代 v1 的 `ai.chat` + `ai.stream.*`）：

- `ai.run.start {runId, messages, session?, systemPrompt?, pageContext?, enableTools?, browserTools?, thinkingLevel?}` **立即返回**；
  runId 由客户端生成，先按它订阅再发起（最早的事件可能先于响应到达）。
- `ai.run.event {runId, seq, event}` 通知：`text/reasoning/tool-calls/turn-finish`（快照语义，`applyChatStreamEvent` 直接消费）、
  `usage`、`retry`、`error`、`interactions`（审批 + 提问快照）、**`settled`（唯一终态，成功/失败/停止都会有）**。
  `createRunEventFilter` 按 runId 过滤并丢弃乱序与重复（seq）。
- `ai.run.abort`（停止真正传到桌面）、`ai.run.state`（某扩展对话此刻是否在跑）、`ai.run.approve`、`ai.run.answer`。
- v1 丢掉的 usage、重试、错误（`message_end.errorMessage` 与 `auto_retry_end.finalError`）在 v2 里都转发；重试成功后不按失败收尾。

**主进程驱动侧栏对话**：

- 新 WS 路由 `/aiServerMain`：主进程模块 `browser-bridge.ts` 以 `?isServer=true` 接入（复用 server 模块的转发拓扑），
  扩展侧栏的持久对话连它。**渲染层重载、窗口关闭不再打断扩展的回答**。一次性调用仍连 `/aiServer`（渲染端）。
- `pi-session-host` 抽出 `PiSessionClient` 接口（渲染窗口的 WebContents 或进程内客户端），公开
  `create/prompt/abort/dispose/interactionsOf/bridgeOf`；`PiToolCallBridge` 的派发目标改为 `PiToolCallTarget`。
  桥用进程内客户端建宿主会话（`interactive: true`，审批与提问走宿主原生），每轮建、settled 后释放。
- 工具路由：扩展页面工具经 `/extToolServer` 的 `ext.tool.execute` 给扩展执行（带 `pageUrl`）；**桌面工具**（ToolRegistry/MCP）
  建会话前经 `browser-bridge:tool-catalog` 向主窗口渲染端要清单（`browserBridgeRenderer.ts`，3 秒超时，没有主窗口就只给页面工具），
  执行时经已有的 `pi-tool-call` 工具桥派给那个窗口，结果经 `pi-session:tool-result` 回到这里的 bridge。
- 编排纯逻辑在 `browser-run-core.ts`（`BrowserRunRegistry`：runId 生命周期、seq、停止——含「会话还没建好就按停止」、
  **同一扩展对话同时只跑一轮**（修两个标签页首轮并发：文件还不存在时宿主的文件冲突检查拦不住）、交互转发；`resolveChatModel`）。
  pi 事件 → v2 事件的翻译在 `services/aiRunEvents.ts`（复用 `PiChatEventReducer`，桥与渲染端一次性入口共用）。
- `runBrowserSessionTurn`（M4.5 的渲染端持久对话路径）已删。

**扩展**：

- `useAiChat`：v2 客户端；持久对话连 `/aiServerMain`（断线 3 秒重连），一次性连 `/aiServer`；监听 `server-gone` 与断开，
  **立即收尾并提示**（v1 要干等 600 秒）；停止发 `ai.run.abort`、收尾等 settled；暴露 `retryStatus`/`interactions`/`approveTool`/`answerQuestion`。
- 提问卡：`useRunInteractionStore` 同步宿主的交互快照，`AskQuestionRenderer` 按 toolCallId 认领宿主提问并经 `ai.run.answer` 作答
  （答案数组，与宿主 `toSubmission` 同一形状）；宿主不在等、也没结果的显示「提问已结束」。新增 `ToolApprovalBar`（允许/本会话始终允许/拒绝）
  与重试提示，放在侧栏输入框上方。扩展本地提问（`askQuestionSessionStore`）不再被新请求触发，文件留着兼容旧卡片显示。
- 页面工具取标签页改 `queryTargetTab`：优先按发起这轮回答的 `pageUrl` 找（多窗口多侧栏不取错页面），找不到退回当前窗口活动标签。
- 概览页、行内问答改 v2（`ai.run.start` + `ai.run.event`，停止真正传到桌面，断连立即收尾）。

**侧栏接回在跑的回答（M5 追加）**：侧栏关掉重开、切走再切回、桌面通道重连后，接上桌面上还在跑的那一轮
（流式、停止按钮、审批条、提问卡、重试提示都恢复）。此前重开只能看到文件里的旧投影，且关掉时若停在审批/提问上，
那一轮会一直挂着（忙的宿主不回收）直到桌面重启。

- 主进程 `BrowserRunRegistry` 每轮持有**接回快照**：`emit` 时用与扩展同一套 `applyChatStreamEvent` 归约回答，
  并跟踪交互与重试状态、`lastSeq`；`snapshotFor(session, readFileBase)` 同步取出（回答深拷贝）。
- **快照的底是「这一轮开始前的投影」**（`BrowserRunHandle.baseMessages`，桥在 prompt 之前读宿主内存里的
  SessionManager；会话还在建时同步读会话文件）。不用文件的当前投影：本轮已完成的片段可能已落盘（与快照里的回答重复），
  也可能还没落盘（新对话首轮 pi 不写文件，坑 10）。界面 = 底 + 本轮提问 + 快照回答（`buildResumedMessages`）。
- 协议：`ai.run.state` 返回 `{running, runId, snapshot}`（`AiRunSnapshot`）；`createRunEventFilter(runId, afterSeq)`
  从快照的 lastSeq 续接。扩展 `useAiChat` 在「对话 id / 页面 / 主通道连上」变化时查一次，查询期间到达的事件按查询各自
  缓冲、拿到快照后补上（快照已含的被 seq 丢弃），不漏不重；查询期间自己发起了新一轮则以自己为准。
- **换对话 = 放下不停**（`detachRun`）：上一个对话在跑的那轮桌面照常跑完落盘，切回来再接回；此前切走会让那轮的
  收尾状态串到新对话上。一轮在跑时 `initialMessages` 变化不覆盖界面（投影缺本轮未落盘部分），收尾 `onFinish` 重读对齐。

**测试**：`browser-run-core.test.ts`（8 例：seq 与 settled、同对话并发拒绝、停止含建会话前停止、报错与重试、交互转发与作答、
**接回快照**（建会话前取文件底、回答归约、交互与重试、lastSeq 对齐、快照是拷贝、结束后没有快照）、`resolveChatModel` 2 例）；
扩展 `protocol.test.ts` 追加 lastSeq 续接与接回界面拼装 2 例；`aiServer.runV2.test.ts`（4 例：一次性带工具、停止、纯文本单发含失败、侧栏请求打到渲染端被拒）；
`piChatSession.test.ts` 的额外工具 read 声明（1 例）；扩展 `protocol.test.ts` 改 v2（参数形状、事件过滤）。
`browser-bridge.ts` 本身绑 electron 与 ws，决策逻辑都在 core 里测。

## 二、架构现状（M2-f + M3 + M4）

**会话存储（M4）**：

```
~/.editor/sessions/<库名>/*.jsonl        ★对话内容事实源（pi JSONL；展示 entry / 叶子标记是 custom entry）
~/.editor/browser-sessions/<页面键>/     扩展对话（页面键 = URL 去 hash 的 sha256 前 32 位；无索引表，不同步）
<库>.db · chat_session                   目录表：id = pi 会话 id，scope + domainRef 分桶，只存元数据
                                         （标题/分组/置顶/归档/消息数），sessionFile 为相对文件名；
                                         一行一对话一文件，分支在文件内部的会话树上（M4-d）
同步                                     .db → <库名>.sessions.zip → 版本信息（共用一个版本号）

主进程：pi-session-paths.ts（目录取法 + 防穿越）、pi-session-store.ts（投影/改历史入口/扩展列表/打包）、
        pi-session-files.ts（展示 entry、rewind/fork/switch/omit、版本归组 messageVersionsOf）、
        pi-session-graft.ts + chat-session-tree-migration.ts（旧分支族并进树，M4-d）、
        pi-session-transcript.ts（entries → 桌面展示消息，带 piEntryIds）、chat-session-migration.ts（开库迁移）
渲染端：useChatSessionStore（目录行分桶 + 已打开对话 + 草稿槽）→ useScopedChat（五场景面板接线）
        → ChatContainer（发送/改历史编排）→ piChatRuntime.settle（settled 后重读投影回写）
```

**运行时与会话宿主**：

```
主进程（Electron，node 24.18）：
├─ modules/pi-ai-runtime-core.ts   v2设置→pi Provider（内置目录兜底）、注册表、单发上下文
├─ modules/pi-ai-runtime.ts        单发 IPC：pi-ai:single-shot + 流事件（含 partial 全量快照原样透传）；
│                                  目录查询 IPC（catalog-providers/models、thinking-levels、discover-models）
├─ modules/pi-model-discovery.ts   服务商 /models 实时获取（M3-f）：地址/鉴权/分页/三种返回形状，
│                                  目录命中取目录元数据、未命中只取自报字段（缺的留空不猜）
├─ modules/think-stream-rewriter.ts <think>兜底剥离；为重排后事件重建 partial 快照
├─ modules/pi-session-bridge.ts    ①desktopMessagesToPi：chat-core 消息→pi 消息（M4 起只剩迁移器与一次性会话用；
│                                    assistant_blocks 按 turn 还原 assistant/toolResult 对，
│                                    thinking 不回放规避签名问题；图片按 path 优先读文件转 base64）
│                                  ②PiToolCallBridge：customTools execute 经 pi-tool-call 事件
│                                    挂起渲染端，结果经 pi-session:tool-* 回传，断连中止
├─ modules/pi-session-host-core.ts 会话装配：ResourceLoader/Git Bash 探测（WSL 排除/where git
│                                    反推/powershell 兜底）+ resolveAgentShellPath（设置覆盖优先、
│                                    坏路径退回检测）/sessionFile resume 或按 id 新建/thinkingLevel/retry(默认5)/
│                                    动态 systemPrompt 扩展（before_agent_start 每轮替换）
├─ modules/pi-session-interactions.ts 会话待用户处理交互（审批+提问）的组合持有者：共用 revision
│                                    与 pi-session-interactions 通道；hostTools() 只给交互会话注册 ask-question
├─ modules/pi-tool-permissions.ts  工具审批等待与会话授权（beforeToolCall 拦截）
├─ modules/pi-user-questions.ts    宿主原生 ask-question（customTool execute 挂起到用户作答）
└─ modules/pi-session-host.ts      会话宿主：create/prompt/steer（运行中插话，见 M3-h）/
                                   abort（顺带 clearQueue 清未送达插话）/dispose/set-system-prompt/
                                   tool-*/find-by-scope/interactions/approve-tool/answer-question IPC；
                                   AgentSessionEvent 原样透传（pi-session-event 按 sessionId 路由；
                                   scope=会话键，见坑 1）

渲染进程：
├─ commands/piAi.ts                单发封装（原生 AssistantMessageEvent 含 partial）
├─ commands/piSession.ts           会话封装 + onPiSessionEvent/onPiToolCall 订阅
├─ services/piLLM.ts               单发统一入口：piStreamChat（原生事件流）/piStreamText
│                                  （partial 文本快照流）/piCompleteChat；PiChatResult 带 aborted
├─ services/piChatSession.ts       chat↔pi 会话生命周期（piChatSessionManager）：
│                                  ensure（模型/档位变化自动重建；传 sessionFile 从文件恢复）/
│                                  （改会话树不经这里：pi-session:edit 在主进程直接改空闲宿主，M4-d）/
│                                  adoptOrResolveSession（find-by-scope 收养）/
│                                  buildPiChatSystemPrompt（skills 清单+$点名全文）
├─ services/piChatEvents.ts        PiChatEventReducer：AgentSessionEvent→assistant_blocks 快照归约；
│                                  运行中送达的 user 消息上报 onUserMessageDelivered（插话，M3-h）。
│                                  关键机制：50ms trailing 节流（message_update 每 delta 全量
│                                  produce 直驱渲染会卡顿；message_end/工具事件前 flush 保终态）；
│                                  turnId 全局递增（多轮/恢复各建 reducer 撞 `${turnId}:reasoning`
│                                  块 id 会错乱）；turn 粒度=pi 一次 assistant message
├─ services/piToolBridge.ts        pi-tool-call→ToolRegistry 执行→回传；
│                                  executeToolCall 上下文可被一次性会话的 additionalTools 接管
│                                  buildToolLoadout（工具全集按名排序 + 活跃子集 + 全集指纹：
│                                  指纹变才重建，否则只切活跃集，见 M3-c）
├─ services/piInteractions.ts      宿主交互快照只读投影（usePiInteractionStore）：审批条与提问卡
│                                  都读它；提交经 IPC，不乐观伪造；readySessions 控制恢复期禁用
├─ services/piAgentRunner.ts       一次性 pi 会话运行器（inMemory+工具桥+历史灌入+settled 后
│                                  dispose + excludeToolNames 防子代理递归）
├─ services/piChatRuntime.ts       ★模块级归约运行时（最后落地的核心，见下节）：
│                                  除归约外还持有待发送队列与已提交插话（M3-h）
├─ services/llmCatalog.ts          目录/档位的渲染端读取层（缓存 + hooks）+ 档位归一与 clamp；
│                                  设置页与聊天输入框共用（原在 features/settings，M3-g 下沉）
├─ ChatContainer.tsx               纯 UI + 发送编排（5 场景共用：主聊天/停靠栏/PDF/视频笔记/
│                                  学习项目）；ask_question 恢复经 find-by-scope 收养续流
└─ stores/useSettingStore.ts       llmProviders v2 上线（迁移挂载于 mergeSettingWithDefaults）；
                                   agentPermission.mode / agentShell.path；远端广播不回灌（坑 16）

思考档位类型：`packages/shared` 的 `ThinkingLevel` 是全仓唯一定义（桌面 `PiThinkingLevel` 为其别名，
扩展侧镜像同源），与 pi ThinkingLevel 逐项对齐——见 M3-g 与坑 18。

**M3-h 删除**：`ChatSidebar/messageQueue.ts`（ConversationMessageQueue 类，与 runtime 的
conversations map 重复，队列已并入 runtime 条目）及其两个测试文件、`PiChatEventSink.onQueueUpdate`
（零真实消费者，六处空实现一并清）。
**已删除（M2-f）**：useChatLLM/chatStreamCore、DesktopModelProtocolAdapter(1118行)/Transport、
llmSettingsDowngrade、openai-reasoning-effort、commands/stream-fetch、subagentAgentPolicies、
chatRunManager/useChatRunStore/commands:chat-run/types:chat-run（渲染端链路）。
**M3 收尾追加删除（死代码审计）**：`chat-openai-responses` handler + 渲染端 `chatResponses` +
`utils/openai-responses-adapter`（整条链零调用方）、`packages/shared/src/chat-core/runtime.ts` 与
`types.ts`（`ChatRuntimeAdapter/Stream/Settings/Callbacks`、`ChatSessionCore` 等生产代码零消费，
连带 shared barrel 两段导出）、`agent/externalAgentTools.ts`（零引用，顺带少一处 `@tau/agent` 依赖）。
保留待 M8：主进程 modules/llm.ts（`chat-openai` 仍被 Integration/Minimax 设置的 Key 连接测试用）、
chat_run 主进程表与 7 个 handler（渲染端已零调用，但删表要同批动 db-schema 的
schema/parity 常量、`knowledge-migration.ts` 与 mobile 的 Rust 迁移分支）。
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
  复用该对象（非拷贝）；M4 起新对话 id 从头不变，`adoptConversation` 已删；
- **常驻 reducer**（bindSession 按 sessionId 复用/重建，宿主重建换了 sessionId 自动换绑）；
- **streaming 位**：agent_start/agent_settled 事件驱动 + subscribe 通知组件刷新 sendLoading；
- **写入链**：produce(容器 current) → publish（deps.publish=组件的 updateCurrentChat prop，
  store 更新驱动 UI 订阅链，withStreamingUpdateTime 拨时间戳）→ settled 时 persist
  （deps.persist=persistFinishedChatAndGenerateTitle，含标题生成；UI 副作用均 null 安全，
  卸载后调用无害）；
- **deps 由挂载组件每次渲染刷新**——必须是无组件生命周期引用（store action/IPC command）。

4. 修正三（M3-h）：待发送队列从组件 useRef 下沉进条目——切页卸载不再丢排队消息；
   顺带把队列键与 runtime/会话键两套键空间收敛为一套。

**sendLoading 双源**：pending（本轮提交中，含停止后排队等待）|| runtime streaming。
只约束「本对话能否发送」——**不禁用新建/切换/删除对话**（见坑 13）。
**stopStreaming**：setSessionPending(false) + forceStopStreaming（立即反馈 + 置 stopRequested
抑制收尾报错 + 暂停待发送队列）+ 后台 piSessionAbort 自行收尾（settled 落库幂等、
未送达插话退回队首）。

### M3-a 工具审批（2026-09-27）

- `modules/pi-tool-permissions.ts` 按 pi 宿主会话持有待审批请求与「本会话始终允许」。
  装配后包装 `session.agent.beforeToolCall`，保留 pi 扩展的决定，再审批最终参数；
  使用原生钩子的 AbortSignal 取消等待，避免 `tool_call` 扩展事件没有 signal 导致停止死锁。
- 内置 read/grep/find/ls = read、edit/write = write、bash/powershell = execute；
  注册表工具透传 risk/source；远端 MCP 默认 execute；未声明风险的额外工具也按 execute。
  有交互界面的内容编辑工具仍使用自己的审阅卡，不双重确认。
- 主聊天五场景显式传 `interactive: true`（M3-b 前名为 interactiveApprovals）；一次性生成、子代理等无审批界面的
  入口默认 false，需要确认时返回明确拒绝结果，不偷偷执行或无限等待。
- 交互快照查询与事件（M3-b 后为 `pi-session:interactions` / `pi-session-interactions`）只向创建窗口发送；
  `pi-session:approve-tool` 按 sender + sessionId + 随机 requestId 校验，迟到/重复审批失效。
  模式变更即时释放已无需确认的等待；abort/dispose/窗口销毁清理待审批，销毁清除会话授权。
- 渲染端投影（M3-b 后为 `piInteractions`）仅保存带版本号的快照，不再持有 Promise resolver 或授权事实，
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

### M3-d/e 设置页接内置目录（2026-09-27）

**缺陷**：pi 内置目录（41 个服务商、完整模型元数据：api/baseUrl/上下文窗口/maxTokens/能力/
价格/compat）在主进程本来就有（`lookupBuiltinModel`/`resolveBuiltinId`），但**没有 IPC 暴露给
渲染端**，设置页全靠手填：baseUrl 手打、每个模型 id 手打、上下文窗口不填就被硬写
128k/8192（对 Claude 的 200k 是错的）。更严重的是新建服务商时 `api` 硬编码
`openai-completions`，**界面根本加不了 Anthropic 服务商**（功能性 bug）。

**关键约束（实测）**：目录里有 **10 种 api**，本运行时只支持 3 种；且 6 个服务商是**混合 api**
（OpenRouter 同时有 anthropic-messages 与 openai-completions 的模型）。所以：

- 选择器只暴露「有受支持模型」的服务商——34 个（Google/Bedrock/Vertex/Mistral 等因 api 不支持
  被排除）；4 个网关类（Cloudflare/OpenCode）目录里没有 baseUrl，需用户自填。
- **api 必须是模型级**。`LLMModelSetting` 新增 `api?`，`toPiModel` 取值顺序改为
  目录权威 → 模型自带 → 服务商级兜底；否则混合服务商的 Anthropic 模型会落到 OpenAI 协议。

**M3-d 主进程目录查询**（`pi-ai-runtime-core.ts`，纯读、`allowModelNetwork: false`）：
`listCatalogProviders`（过滤 + 服务商级 api 取占多数者 + 按名排序）、`listCatalogModels`、
`resolveThinkingLevels`（目录命中用 pi `getSupportedThinkingLevels`，未命中给通用档并标记
`fromCatalog: false`）。IPC：`pi-ai:catalog-providers` / `catalog-models` / `thinking-levels`。

**M3-e 设置页**：

- `ProviderCreateDialog`：先选类型（内置目录带搜索 / 自定义），内置项带出 name/baseUrl/api/
  builtin；自定义分支暴露 api 下拉（修掉上面那个 bug）。
- `ModelPickerDialog`：内置服务商从目录勾选模型（显示能力/上下文/输出/价格），元数据自动带入，
  取消勾选即移除并清掉引用它的分配槽位；手填入口保留为「手动添加」给目录外型号。
- 推理档位下拉改为按模型真实能力生成（此前静态七项还漏 `minimal`，与模型能力脱钩），
  并标注来源（来自 pi 目录 / 目录未收录通用档 / 未标记支持推理）。
- `llmCatalog.ts` 做渲染端缓存，反复开浮层不重复过 IPC。
- 验证：真实目录跑通过滤/排序/混合 api/推理档位（gpt-5 无 `off`、Anthropic 有）与端到端
  （勾选形状在主进程命中目录、上下文窗口取目录值而非 128k）。

### M3-f 模型实时获取（2026-09-27）

**动机**：目录只覆盖公开服务商的已知型号。自建服务（Ollama/LM Studio/私有网关）在目录里根本
没有，目录也总落后于服务商发新模型——这两种情况此前只能一个个手打模型 id。

`modules/pi-model-discovery.ts`（electron-free，可单测）请求服务商的模型列表接口：

- 地址：OpenAI 系在 baseUrl 后接 `/models`（baseUrl 自带版本段）；Anthropic 补 `/v1`
  并按 `has_more`/`last_id` 分页（上限 10 页防服务端一直说还有）。
- 鉴权：OpenAI 系 `Authorization: Bearer`，Anthropic `x-api-key` + `anthropic-version`；
  **无 key 时不发鉴权头**（本地服务）。凭据只发往用户自己配置的 baseUrl。
- 返回形状三兼容：`{data:[…]}`（OpenAI）、`{models:[…]}`（Ollama 原生）、裸数组。
- **元数据策略与 toPiModel 一致**：目录命中 → 取目录（与勾选目录同等可信，`fromCatalog: true`）；
  未命中 → 只认少数常见自报字段（`context_length`/`max_context_length`/`max_input_tokens`、
  OpenRouter 的 `architecture.input_modalities` 与 `supported_parameters`），
  **认不出的一律留空**，不写 128k/8192 这种猜测值（猜错会让 pi 按错误上下文窗口裁历史）。
- 失败原因面向用户：401/403「API Key 无效或没有权限」、404「该服务不支持获取模型列表，
  请手动添加」、连不上/超时/格式不对各有说法；非预期异常才打日志。
- IPC `pi-ai:discover-models`（唯一联网的目录类 IPC，其余仍是纯读）。

界面：`ModelPickerDialog` 从「仅内置服务商」扩为所有服务商——内置服务商先列目录、可再点
「从服务商获取」把目录未收录的新模型追加在末尾（并提示追加了几个）；其他服务商打开即获取。
只有部分能力未知的条目才提示「添加后可在编辑中补充」。「手动添加」保留为最终兜底。

### M3-g shellPath 设置 + chat 侧档位 + 档位双类型收敛（2026-09-27）

**档位双类型收敛（原 M3-g 的第三项，影响面最大）**：此前 `ReasoningEffort`（packages/shared，
`"none"` 且**没有 `minimal`**）与 `PiThinkingLevel`（桌面端，pi 词汇）并存，每处都要记得
`none→off`，`minimal` 在渲染端根本不可达。现在**唯一定义**是
`packages/shared` 的 `ThinkingLevel`（`off` + 六档，与 pi `ThinkingLevel` 逐项对齐）；
桌面端 `PiThinkingLevel` 就是它的别名，组件属性同步更名（`reasoningEffort*` → `thinkingLevel*`，
shared/桌面/扩展三端）。本地存储里的旧值 `"none"` 读出时归一为 `"off"`。
转换函数 `toPiThinking` 与旧链路的档位参数**全部删除而非保留兼容类型**——查证后发现那条参数链
根本没有调用方（详见坑 18）：`getModelRequestOverrides` 从不读档位、`chat()` 的两个调用方
（Minimax Key 连接测试）不传 options、`chatResponses()` 零调用方。随后的死代码审计
（`21252edc8`）把 `chatResponses` 整条链连 `openai-responses-adapter` 一并删除；
`modules/llm.ts` 本体仍留到 M8（它的 `chat` 还被 Key 连接测试用着）。

**chat 侧档位接目录**：输入框档位不再硬编码四档，改由模型真实能力生成（经
`pi-ai:thinking-levels`）；目录未收录的模型退回通用档；选中档位不被当前模型支持时落到
它支持的第一档（pi 也会 clamp，这样界面显示与实际一致）。
`llmCatalog.ts` 从 `features/settings` 移到 `services/`——聊天输入框也读它，不再是设置页私有。

**shellPath 设置项**：新增设置 `agentShell.path`（空 = 自动检测），会话装配取值顺序为
请求显式指定（pi-dev 面板）→ 用户设置 → 启动时自动检测；**用户填的路径不存在则忽略并退回检测**
（让 pi 拿着坏路径起 bash 只会得到没有说明的失败）。判定逻辑 `resolveAgentShellPath` 放在
core 模块可单测。IPC `pi-session:shell-info` 给界面展示「检测到什么 / 实际用哪个 / 填的路径是否存在」。
设置页「工具权限」标签下新增「命令执行环境」分组（输入 + 浏览 + 恢复自动）。
**与交接文档原计划的偏差**：原写「首启检测写入」，实际**不把检测结果写进设置**——
检测结果是本机事实，写进去等于把机器特定路径固化，换机/重装 Git 后会留个错路径；
界面改为把检测值显示为占位与说明，效果相同且没有过期状态。

### M3-h steer 交互：运行中插话 + 队列下沉运行时（2026-09-27）

**pi 的实际行为（读源码核实，0.87.1）**：`steer` 的消息在当前 assistant 轮的工具调用全部执行完
之后、下一次请求模型之前送达，**与本轮同属一次运行**（中间没有 agent_settled）；`followUp`
等 agent 本来要停下时才送达，也在同一次运行内。送达时 pi 发 `message_start(role=user)`
并发 `queue_update`（只带文本），出队靠文本 `indexOf` 匹配。**abort 不清队列**——没送达的插话会
滞留，等下一次 prompt 开跑时被一起吞进去（pi 自己的 TUI 在 abort 时 `clearQueue()` 退回输入框）。
`before_agent_start` 只在 `prompt()` 时触发，所以插话沿用本轮的模型/档位/systemPrompt，
**插话里的 `$skill` 点名不会注入全文**（模型仍能看到清单，可自己 `get_skill_readme`）。

**裁决：排队仍由桌面端编排，只有插话接 pi 原生**。排队的消息不交 pi 的 followUp——桌面每次发送
要走 `ensureChatSession`（切模型/档位要重建）、刷新 systemPrompt 与 `$skill` 全文、
`beforeSendUserMessage`（PDF 索引就绪）、附件转本地路径；followUp 在同一次运行内送达会绕过这整套，
用户排队期间换了模型、下一条却还用旧模型就是实打实的回退。真正离不开原生的只有 steer。

**主进程**：`steerHostSession`（core 模块，electron-free 可单测）——

- **必须先判 `session.isStreaming`**：pi 的 `prompt()` 在空闲时会起一轮新运行，而且**要等整轮跑完
  才返回**（IPC 会一直挂着），还绕过渲染端发送编排。空闲一律返回 `not-streaming`，渲染端按普通消息排队。
- **`expandPromptTemplates: false`**：关掉斜杠命令/模板/skill 展开，送达文本与提交文本逐字一致，
  渲染端才能按文本认领自己的插话。
- 只等 `preflightResult`（pi 排完队就回调）而不等 prompt 的 promise，免得将来 pi 改返回时机拖住 IPC。
- `pi-session:abort` 在 abort 后 `clearQueue()`，未送达文本随响应返回（`stranded`），
  防止漏进下一轮；渲染端不依赖它退回队列（见下）。

**渲染端**：

- `PiChatEventReducer` 处理 `message_start(role=user)`：**跳过本轮的发起消息**
  （`awaitingInitialUserMessage`，agent_start 置位），其后的用户消息即插话 → `onUserMessageDelivered`。
  重载收养会话时没有 agent_start，标志为 false——那时收到的用户消息必然是插话，判定天然正确。
  送达时清空工具执行映射：否则上一轮工具的迟到事件会认领旧 turn，把工具卡写进新的助手占位。
- `piChatRuntime` 每个对话条目新增 `queue`（待发送）、`queuePaused`、`pendingSteers`：
  - 送达 → 认领 pendingSteer（按文本）→ 聊天行追加用户消息 + 新助手占位 → **立即落库**
    （重载后这条用户消息必须在，否则模型在回答一条聊天记录里不存在的话）；
  - **未送达的插话在 `agent_settled` 退回队首**——这是唯一的对账点，race-free：到 settled 时
    pi 要么送达了（reducer 已认领），要么没送达（仍挂着）。不用 abort 返回的 stranded 对账，
    因为插话 IPC 可能还在飞、abort 的 clearQueue 会把它清掉，只有 settled 兜底覆盖得全；
  - 提交插话**先登记再发 IPC**（送达事件可能先于 IPC 返回到达）；失败走
    `returnPendingSteerToQueue`（幂等，只在该条仍挂着时退回，避免与 settled 兜底重复入队）。
- **停止 = 暂停队列**（用户裁决）：`forceStopStreaming` 置 `queuePaused`，`dequeueMessage` 暂停期间
  不交出内容；未送达插话由 settled 退回队首，用户逐条编辑/删除，或手动发送恢复排空
  （`submitMessageContent` 调 `resumeQueue`）。此前的行为是停止后队列**自动发出去**，与停止意图冲突。
- 界面：待发送每条多一个「插话」按钮（仅会话真在运行、且不在编辑重发/图片编辑上下文时出现）；
  输入框多一个插话按钮与 `⌘/Ctrl + Shift + Enter`（`is-hotkey` 未指定的修饰键按 false 比较，
  按住 shift 不会误触发送）。已提交的插话单独一组显示「插话 · 当前步骤结束后送达」。
- 插话可撤回：提交后 pi 无按条删除接口，但没送达前它只在 `pendingSteers` 里，
  停止/本轮结束都会退回队列，所以撤回等价于「停止后从队列里删」。

**设计层修正（顺带修掉的两处）**：

1. **队列原先是组件 `useRef`**（`ConversationMessageQueue` 实例 + 排空 effect 都在 ChatContainer），
   切页/关面板组件卸载时排队消息静默丢失——违反「跨页面状态必须模块级」。现在队列在 runtime 条目里，
   排空仍由挂载中的组件执行（发送编排在组件里），切页不排空、回来自动继续。
2. **两套 conversationKey 收敛为一套**：队列键原先是 `${chatScope}:${chatId}`（带参数前缀，
   如 `pdf-chat:12:5`），runtime/会话键是 `${prefix}:${chatId}`（`pdf-chat:5`），两个键空间并行，
   任何交叉引用都会错。现在只有一套（chatId 全局唯一，collapse 安全），`ConversationMessageQueue`
   类连同它的两个测试文件一并删除——它的 per-key map 与 runtime 的 conversations map 重复，
   留着就是第二个键空间。新对话 id 0→N 时队列/插话随 `adoptConversation` 迁移，不再单独搬运。
3. **`PiChatEventSink.onQueueUpdate` 删除**（连同六处空实现）：pi 的 `queue_update` 只有文本，
   插话事实源是 `pendingSteers`（带原始附件内容），两套并行必然对不齐；零真实消费者的钩子不留
   （坑 18 的教训）。

**验证**：`pi-steer.test.ts`（真实 pi 会话 + faux + 卡住的桥接工具）——工具执行中插话在下一次请求
模型前送达且只有一次 agent_settled、空闲时拒绝且不起新一轮、中止后清队列且不漏进下一轮；
`piChatRuntime.steer.test.ts`——队列跨重挂载存活、停止暂停/恢复、送达追加行并落库、
未送达退回队首保序、退回幂等、重载收养后按插话处理；`piChatEvents.test.ts`——发起消息不上报、
送达清工具映射；冒烟脚本新增 `[3b]` 插话场景（送达顺序 + 同一轮）。
**尚未做真实模型下的 Electron 实机走查**（清单见第七节「插话专项」）。

### M3-c MCP 工具集动态化（2026-09-27）

**设计缺陷**：pi 会话的工具注册表在装配时定死（`setActiveToolsByName` 只能在已注册名字里
切子集，没有公开 API 追加定义），而桌面端创建会话时只传**当前已启用**的工具且之后从不更新。
于是会话建好后工具可用性的任何变化对该对话都隐形：输入框里的 MCP 快捷面板开关 provider
（面板就在输入框里，用户预期立即生效）、新连的 MCP 服务器都要等切模型或新对话才生效。

**缓存事实（查过 Anthropic 官方缓存文档，推翻了先前的直觉）**：请求渲染顺序是
`tools` → `system` → `messages`，**工具定义在位置 0**，增删或重排任一工具会让整条缓存
（含全部历史消息）失效。所以缓存代价来自「工具集变了」本身，**与是否重建会话无关**——
`setActiveToolsByName` 和重建会话的缓存损失完全相同。官方建议正是「别在对话中途改工具集」，
并要求工具列表**确定性序列化**。Anthropic 有保缓存的正式机制（`tool_addition`/`tool_removal`
块，beta `mid-conversation-tool-changes-2026-07-01`，Opus 5/4.8/Fable 5 系列支持、Sonnet 5 不支持），
但 **pi 自己组装 tools 数组、没有暴露该能力**，目前用不上——记为未来优化点。

**现状**：

- 工具**按名字排序**（`buildToolLoadout` 与 piAgentRunner 的 `buildToolSpecs` 都排）。
  修掉一个既有静默缓存杀手：原顺序是注册表插入顺序，取决于各 MCP 服务器**异步连接完成的先后**，
  每次启动都可能不同，等于每个新会话白丢缓存。
- **全集注册 + 活跃子集**：`customTools` 交全集（含当前停用项，`includeDisabled`），
  `activeToolNames` 给活跃子集；主进程 `applyActiveTools`（在 core 模块，electron-free 可单测）
  只增删桥接工具，pi 自己的内置活跃默认（read/edit/write + bash 或 powershell；grep/find/ls
  默认不活跃）原样保留，集合没变则不调用。
- **两档同步**（`ensureChatSession`）：启用/停用已注册工具 → `pi-session:set-active-tools`
  轻量 IPC，**不重建、保留本会话工具授权**；出现新工具定义或 schema/描述变化（新连 MCP 服务器、
  服务器升级）→ 重建（pi 注册表无法追加）。`toolUniverse` 指纹决定走哪档。
- **只在真变化时推送**：活跃集与上次推送相同就不发 IPC，否则等于每轮自杀缓存。
- 注意：被禁用的**整个 MCP 服务器**在注册表里是被 `unregisterSource` 移除的（不在全集内），
  所以重新启用一个服务器算「新定义」→ 重建；provider 开关与逐工具停用才是不重建的那一档。
- 验证：真实 pi 会话确认 customTools 默认全活跃、停用项可精确摘除且不牵连内置默认；
  渲染端覆盖排序、切活跃集不重建、集合未变不推送、新定义重建、schema 变化重建。

### M3-b ask-question 宿主原生化（2026-09-27）

**设计缺陷**：旧 ask-question 仍是渲染端工具——等待（Promise resolver）存在渲染进程内存，
答案另存 zustand persist（localStorage），重载后由 ChatContainer 的 effect 扫描"已提交未续流"
记录、收养会话、手工 `piSessionToolResult` 回传；主进程也重启时还把答案伪写成 success 终态。
等待态横跨渲染层重载却归属渲染进程，与 M3-a 审批主进程化后形成两套并行的恢复机制。

**现状**：

- `PiUserQuestions` 是宿主 customTool，execute 挂起到 `pi-session:answer-question`；参数与答案
  在主进程归一化/校验（必答题复用 `findUnansweredQuestion`），结果仍是 `ask-question-result`
  JSON，历史卡片渲染与旧数据兼容。中止/释放/窗口销毁 → execute 抛错 → pi 转 isError 工具结果。
- 审批与提问合并为 `PiSessionInteractionSnapshot{approvals, questions}`，一个 revision、一条
  `pi-session-interactions` 事件与 `pi-session:interactions` 查询；渲染端 `approvalStore` 由
  `piInteractions` 取代。`ask-question` 在权限表中为 read 风险（不会被审批拦截）。
- 创建参数 `interactiveApprovals` 更名 `interactive`：同时决定审批是否等待用户与是否注册提问工具；
  一次性会话（piAgentRunner/子代理）不再有 ask-question（旧实现会无限挂起）。渲染端清单
  含同名工具（外部 MCP）时宿主让位。
- 重载恢复统一走 `piChatRuntime.restorePendingInteractions`（原 restorePendingApprovals，
  判定扩展到未结束的 ask-question 卡）；ChatContainer 的 ask-question 恢复 effect、
  `markAskQuestionExecutionResolved` 兜底已删除。主进程也重启时卡片显示中断，不伪造答案。
- 已删除：`tools/askQuestionTool.ts`、`tools/askQuestionSessionStore.ts`（用户 localStorage 中遗留的
  `ask-question-session` 键无人读取，无害，M8 可顺手清）、`toolRuntimePolicy` 的
  `filterConflictingToolSchemas`/`shouldSkipToolTimeout`（均无调用方）。
- **坑**：pi 执行前按 JSON Schema 校验参数（`validateToolArguments`），旧 schema 的 options
  `items: {type:"object"}` 会拒掉描述里允许的字符串选项——已改 `anyOf[string, object]`。
- 验证：真实 pi + faux 的 ask-question 作答/中止闭环、问题持有者单测（校验/中止/释放/通知失败）、
  投影 store、runtime 提问恢复收养、提问卡组件（提交只发宿主、过期拒收、跨会话不串、恢复中禁用）。
  尚未做真实模型下的 Electron 人工走查。

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
- **M3-a** `d1fed4658`：工具审批主进程化 + 队列可编辑/删除（与侧栏刷新修复同批提交）
- **M3-b** `a1c1ef045`：ask-question 宿主原生化 + 审批/提问交互快照合并（含停止闪错、
  运行中不可新建/切换对话两项验收修复）
- **M3-c** `cac05397a`：MCP 工具集动态化（全集注册 + 活跃子集、工具按名排序修缓存、两档同步）
- **M3-d/e** `86ad6cfdf`+`d257bdd20`：内置目录 IPC + 设置页服务商选型/模型勾选/档位按能力
  （修「界面加不了 Anthropic」）+ 界面文案去技术术语
- **设置事故修复** `a0fef9ddf`：设置写入风暴与 setting.json 损坏（三层缺陷，见坑 16）
- **M3-f/g** `8d9e05c34`：模型实时获取（`/models`）+ shellPath 设置 + chat 侧档位接目录 + 档位类型收敛
- **死代码清理** `6d53b26b5`+`21252edc8`：档位死参数链（LegacyReasoningEffort/toPiThinking）、
  openai-responses 死链、chat-core runtime/types、externalAgentTools（见坑 18 与第二节末尾）
- **M3-h** `94a32f485`：steer 交互（运行中插话接 pi 原生 + 队列下沉 runtime + 键空间收敛 + 停止暂停队列）
- **M4 地基** `524edebd2`：chat_session 目录表 + JSONL resume + 内容投影（无调用方）
- **M4 迁移器** `3d394bf83`：老对话迁移器 + 展示 entry + 会话文件改历史操作（无调用方）
- **M4 事实源切换** `68affe879`：事实源切到 JSONL + 五场景接统一 store + 同步带会话包 + 扩展改页面会话（一个提交，见「M4 实施记录」M4.2–M4.5）
- **M4-d** `6a1aee924` 会话树：分支改同一文件内的 pi 会话树 + 消息上 ‹ i/n › + 旧分支族合并迁移 + 改树在空闲宿主上直接做（一个提交，见「M4-d 实施记录」）
- **M4-d 追加** `70feeb0c3`：树谱浮层与分叉标记
- **M4-e** `82d553a6c` 治理与重启恢复：同一文件只一个宿主、宿主空闲回收与切库释放、runtime 条目 LRU、删 PDF 先释放、重开时悬挂工具调用标为已中断（见「M4-e 实施记录」）
- **扩展页面工具风险声明修复** `5f4e562c5`
- **M5** `2a8123b2b` 浏览器扩展：侧栏对话由主进程驱动（`/aiServerMain`）+ 协议 v2 + 提问审批走桌面宿主 + 停止真正生效 + 断连立即收尾（见「M5 实施记录」）
- **M5 追加** `59431d096`：侧栏重开接回在跑的回答（接回快照 + lastSeq 续接 + 换对话放下不停）
- **M8-a** `6840932aa`：删除 `packages/agent` 整包（5 个符号内联/改用桌面与 shared 类型）
- **M8-d**：旧聊天表迁移记账后 DROP（带备份）+ 目录表分支列删除 + 迁移时当场合并分支 + 视频笔记/学习项目级联删目录表 + 移动端补值去掉
- **M8-c** `6bc0dba58`：删除 chat_run 表（schema/parity/handler，开库 DROP，桌面与移动端）+ 主进程 stream-fetch 模块
- **M8-b** `867c13f61`：删除 `modules/llm.ts`（Minimax Key 测试改走 pi `pi-ai:verify-key`）+ 扩展本地提问机制 + `sanitizeToolMessages` + localStorage 遗留键
- **修正一** `784d59ebb`：去闭包快照+会话常驻 reducer（修吞消息）
- **修正二** `d3bc61c33`：piChatRuntime 下沉模块级（后台运行）
- **验收状态**：用户确认"大部分没问题"——M2-f 基本通过；后台运行场景（切页回来
  消息完整+标题正常）为最后一批待复验项。**M3-a/b/f/g 均未做真实模型下的 Electron 实机走查**
  （自动化验证齐全，人工走查清单见第七节各「专项」）

## 四、踩坑清单（pi API 陷阱与本项目事故，新会话必读）

**pi 包行为（已验证源码）**：

1. `session.prompt(text, options?: PromptOptions)` —— images 是 **options 字段**不是第二
   位置参数（曾整体丢图）；流式中 prompt 未指定 streamingBehavior 会 throw
   "Agent is already processing"。
2. abort 不触发 auto_retry：`_willRetryAfterAgentEnd` 开头 `_agentRunAbortRequested→false`；
   `isRetryableAssistantError` 要求 `stopReason==="error"` 且匹配可重试正则。用户 abort
   后 message_end 会带 `stopReason:"aborted"` + errorMessage——**不要当错误显示**（曾造成
   "停止后一闪而逝错误"）。
3. `getSupportedThinkingLevels(model)` 需要 Model 对象（只在主进程有）——渲染端要档位必须过
   `pi-ai:thinking-levels` IPC（M3-d 起，设置页与聊天输入框都走它）。
4. pi 无内建 subagent/websearch；customTools 用 TypeBox TSchema（JSON Schema 直接 cast 即可）；
   execute 可无限期挂起（ask_question 审批的实现基础），signal abort 会 reject。
5. SessionManager：create 后 appendMessage 灌历史，createAgentSession 内部
   buildSessionContext 自动恢复进 Agent；分支树（branch/navigateTree/fork）留给 M4。
6. think-stream-rewriter 重排事件后需手动重建 partial（pi 每个事件原生带 partial 全量快照）。
7. **`prompt()` 在会话空闲时要等整轮跑完才返回**（内部 `_runAgentPrompt` 全程 await），
   流式中才是排完队就返回。任何「可能空闲也可能在跑」的调用点必须先判 `isStreaming` 分流，
   否则 IPC 一直挂着（插话就踩在这里，见 M3-h）。要更早的时机可用 `preflightResult` 回调。
8. **abort 不清 steer/followUp 队列**：`clearQueue()` 得自己调，否则滞留消息会在下一次
   prompt 开跑时被吞进去。pi 的 TUI 也是 abort 时 clearQueue 退回输入框。
9. **`queue_update` 只有文本**，且 pi 出队按文本 `indexOf` 匹配——要携带附件/原始内容就必须
   自己维护一份待送达清单，不能拿 pi 的队列当事实源。
10. **会话文件要等第一条 assistant 消息才落盘**（`_persist` 的 hasAssistant 判断）。首轮就失败的对话没有文件；
    `SessionManager.open(不存在的路径)` 会以**随机 id** 起新会话。直接写文件的场景（迁移、改历史）要自己保证写下去
    （见 `pi-session-files.ts` 的 `writeSessionFile`/`ensureFlushed`）。
11. **叶子 = 加载时文件的最后一条 entry**（`_buildIndex`）。`branch()`/`resetLeaf()` 只改内存，
    不追加 entry 的话重开就回到旧分支末尾——挪叶子后必须追加一条（本项目用 `desktop-leaf` custom entry）。
12. **pi 重放无签名 thinking 的规则**（`pi-ai` 的 `transform-messages.js` / `anthropic-messages.js`）：同模型保留；
    Anthropic 无签名 → 降级成 text 块；跨模型 → 转成 text。所以「把老 reasoning 当 thinking 迁进去」
    等于让旧思考以正文重新进入上下文。
13. **`custom` entry 不进模型上下文**，`custom_message` 进（`sessionEntryToContextMessages`）。桌面自有的旁路信息
    （展示形态、叶子标记）一律用 `custom`。`context_edit(target, null)` 是原生的「从上下文省略」，只能作用于当前分支上的
    user/assistant/toolResult/custom_message。
14. **`createAgentSession` 不透出 `ToolsOptions`**（内置 bash 的 `operations`/`spawnHook` 进不去；`baseToolsOverride`
    只在 AgentSession 构造层）。要替换内置工具只能注册**同名 customTool**——`_refreshToolRegistry` 里 custom 按名覆盖 builtin。
15. **活会话发送前会往树上写 `role: "system"` 的 message entry**（系统提示与工具集快照，提示词或工具变化时写一条），
    它挂在当前叶子下、新用户消息挂在它下面。凡是「按父节点找兄弟」「按 message entry 比内容」的逻辑都要把它当结构性
    entry 跳过（M4-d 的版本归组就栽在这里：测试里迁移文件没有 system entry 全过，活会话一跑就归不到一组）。
16. **会话树 API 的落盘与上下文**：`branch()`/`resetLeaf()` 只改内存（坑 11）；在活会话上直接调它们后必须
    `session.refreshContext()`，否则 `agent.state.messages` 还是旧路径。`navigateTree` 运行中会抛错、传 `summarize` 会调
    LLM 并写进上下文的 `branch_summary`——本项目不用它，自己挪叶子 + 写 `desktop-leaf` + `refreshContext`。
    `getChildren` 不排序、`listAll` 的 `messageCount`/`firstMessage` 是整文件口径（混进所有分支）。

**本项目事故与修复（按发生顺序）**：

1. **ask_question 刷新不续流**：create 的 scope 传裸 chatScope（"main-chat"），find-by-scope
   按会话键（"main-chat:5"）查——不匹配。**scope 必须用 chatSessionKey()**。
2. **停止一闪而逝错误**：见 pi 陷阱 2；reducer 过滤 stopReason=aborted。
   **但这只覆盖一半**：中止落在流式中才是 `stopReason:"aborted"`；落在**工具执行中**
   （等待审批/等待作答时按停止）时，收尾轮的 message_end 是 `stopReason:"error"` +
   `errorMessage:"AbortError: The operation was aborted."`——仍会闪一下错误条。
   pi 的 AgentSessionEvent 没有原生中止标志（agent_end 只有 willRetry），
   **不要去匹配错误文案**：停止意图只有渲染端自己知道，`piChatRuntime.forceStopStreaming`
   置 `entry.stopRequested`，onStreamError 据此抑制，下一轮 agent_start 复位。
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
    **M3-h 的两处后续**：①队列原先存在组件 useRef 里，切页卸载即丢——运行态必须在模块级
    （第三条工作约定又一次被触发）；②队列键 `${chatScope}:${chatId}` 与 runtime/会话键
    `${prefix}:${chatId}` 是两个并行键空间，交叉引用必错，已收敛为一套。
12. **ask-question 字符串选项被 pi 拒绝**：pi 执行前按 JSON Schema 校验参数，schema 必须与
    描述一致（见 M3-b）。新增宿主工具时 schema 要按真实可接受的输入写，不能只写宽泛的 object。
13. **运行中禁止新建/切换对话的过期护栏**：`新建对话` 菜单项与主视图 ChatDropdownSelector
    曾按 `sendLoading` 禁用——那是归约链绑组件时代的必需品。M2-f 下沉模块级后后台可续跑，
    且 `updateCurrentChat` 按 chat id 写回（后台轮次不会串到新会话），护栏已无必要；
    等待用户作答可以持续任意久，护栏反而卡死交互。已移除（停靠栏本来就没有，两边此前不一致）。
    **配套**：`deleteChatMessage` 过去只 dispose pi 会话、漏了 `piChatRuntime.disposeConversation`，
    被"运行中禁止删除"掩盖；解禁前必须一起清，否则删掉的对话仍在后台归约并落库。
    新增宿主/运行态资源时，检查会话终态（删除/重建）是否都释放到了。
14. **pi 目录的 api 种类远多于本运行时支持的**：目录有 10 种 api，本项目只支持 3 种，且有 6 个
    服务商是混合 api（同一服务商下不同模型协议不同）。凡是「按服务商一刀切 api」的写法都会
    在混合服务商上落到错误协议——api 必须模型级（见 M3-d/e）。往界面暴露目录内容时必须先按
    受支持协议过滤，否则用户能建出跑不起来的服务商。
15. **工具集与提示缓存**：工具定义渲染在请求最前（`tools`→`system`→`messages`），增删/重排
    任一工具作废整条缓存（含历史消息）。推论：①工具清单必须按名字排序，注册表顺序取决于 MCP
    异步连接先后，不排就每个会话白丢缓存；②只在用户真改了工具时推送变更，别每轮同步；
    ③重建会话与切活跃集的缓存代价相同，选方案要看别的（授权是否保留、是否要重灌历史）。
    pi 未暴露 Anthropic 的 `tool_addition`/`tool_removal` 保缓存机制。
16. **设置写入风暴把 setting.json 写坏（真实事故，2026-09-27）**：用户删服务商时它「消失又出现、
    无限循环」，`~/.editor/setting.json` 被写成「完整 JSON + 旧内容尾巴」无法解析。日志实证：
    11 分钟内保存 3463 次（用户改动实际只触发 220 次发送）、248 次「应用远端设置」、
    满屏 `rename setting.json.tmp ENOENT`。三层缺陷，缺一不可：
    - **放大器**：多窗口共用一份设置，任一窗口改动经主进程广播给其余窗口，而收到广播的窗口
      应用后其同步器又把它发回主进程 → 一次改动放大成 N 次保存，窗口间任何细微差异都变成
      永不收敛的来回写。修：`markRemoteSettingApplied`/`isRemoteAppliedSnapshot`，远端快照不回灌。
    - **中间态**：`confirmProviderDelete` 等把一次用户操作拆成两次 store 写入（先清分配槽位、
      再删服务商），广播出「槽位已清、服务商还在」的中间态；顺序一乱旧快照盖回新状态，
      服务商「复活」。修：`mutateProvidersAndUsage` 一次写入（删服务商/删模型/勾选模型都改单次）。
    - **非原子写**：主进程 `saveSetting` 用固定 `setting.json.tmp`，并发保存互相截断
      （较短的新内容覆盖较长的旧内容后留下旧尾巴）。修：落盘串行链 + 按进程独占 tmp 名。
      另修数据丢失放大器：解析失败原先直接返回 `{}`，下一次保存就把默认值写回去＝静默清空全部设置；
      现在先备份 `setting.json.corrupt-<ts>.bak`，再用 `salvageLeadingJsonObject` 抢救开头的完整对象。
      **教训**：凡「多端共享一份文件 + 广播」的状态，必须区分「本地改动」与「远端应用」，否则
      必成回灌风暴；一次用户操作只产生一次持久化写入；原子写不能共用固定临时路径。
17. **目录外模型的元数据只能留空，不能猜**（M3-f）：服务商的 `/models` 接口各家字段不统一，
    多数只给一个 id。此时**不要填 128k/8192 之类的默认值**——上下文窗口是 pi 裁历史的依据，
    猜大了会让请求超限、猜小了白丢上下文。留空（界面提示可后续补充）比猜一个值安全。
18. **同一概念不要在两个包各定义一套取值**（M3-g）：`ReasoningEffort`（"none"、无 minimal）
    与 `PiThinkingLevel`（pi 词汇）并存的后果不是「多写一个转换函数」，而是**一整档位在界面上
    不可达**，且每个新增调用点都可能忘记转换。现在唯一定义在 `packages/shared` 的 `ThinkingLevel`。
    **收尾时的二次发现**：收敛后为旧链路留的 `LegacyReasoningEffort` 其实是给**死参数**描述类型——
    `getModelRequestOverrides` 从不读 `context.reasoningEffort`、也没有分支返回 `reasoning_effort`；
    `chat()` 的两个调用方（Minimax Key 连接测试）都不传 options，`chatResponses()` 零调用方；
    `toPiThinking` 同理（收敛后无需转换，且没有调用方传 `thinking`）。**都已删除**。
    教训：给旧代码"补一个兼容类型"之前先确认那条参数链真的有人用——否则是在给尸体量体裁衣。

## 五、遗留边界（有意留下，归属明确）

- **steer（M3-h 已接）**：运行中插话走 pi 原生 steer（同一轮内送达）；排队仍由桌面端编排、
  **不用** pi 的 followUp（会绕过会话确保/systemPrompt 刷新/附件转换，见 M3-h）。
  队列与已提交插话在 runtime 内存态，**不做重启恢复**（用户裁决 M4-e：属待发送草稿，非已提交消息；
  渲染层重载也会丢队列）
- **工具审批（D-060）已接**：M3-a 完成执行前拦截与主聊天审批；一次性入口没有审批
  UI 时按模式明确拒绝。主进程重启后等待中的审批**标为已中断**（M4-e 用户裁决，不重新弹出——
  会话文件分不清「在等审批」与「执行到一半崩了」，重跑有重复副作用风险），需在 Electron 实机复验审批交互。
- **档位（M3-g 已接）**：两侧下拉均按模型真实能力生成，全仓一套 `ThinkingLevel` 类型；
  目录未收录的模型仍只能给通用档（服务商不提供能力元数据，无从得知）
- **主进程重启后的 ask-question 半成品**：渲染层重载可恢复（宿主仍持有等待，收养后直接作答）；
  主进程也重启（或宿主被空闲回收）则重开时补一条已中断的错误结果，卡片显示「提问已结束」（M4-e 用户裁决，不做重新作答）
- **ChatDropdownSelector 运行态标记**：随 chat_run 退役（会话列表无 Spinner/失败图标），M4 目录表带状态列
- **首轮在第一条回答之前就失败的对话，pi 不落盘**（坑 10）：重开后这条用户消息会丢（草稿也不在目录表里）
- **扩展（M5 后）**：
  - 侧栏关闭/重载后，正在跑的那轮在桌面继续跑完并落盘；重开后接回（M5 追加，见「M5 实施记录」）。
    **桌面主进程重启**时那一轮没了（registry 在内存），重开只看到文件投影——与桌面聊天同一边界；
  - 扩展对话每轮建宿主、跑完释放，「本会话始终允许」只在一轮内有效；
  - 没有主窗口时扩展对话只有页面工具（桌面工具与 MCP 要渲染端执行）；
  - 扩展本地的提问机制（`askQuestionSessionStore`、`ext.tool.execute` 里的 ask-question 分支）已无新调用方，留到 M8 一起删。
- **旧聊天表（M8-d 已删）**：迁移记账后开库即 DROP，删前整库备份；迁移失败的行、扩展的旧对话、`audio_note_chats` 只在备份里
- **会话树（M4-d 已接）**：分支在同一文件内。遗留：
  - 树谱浮层只在桌面（扩展未做）；分支不能起名（pi 原生 `label` entry 可用，未接）；滚动条小地图未做；
  - **同一对话多个分支同时运行**未做（难点：pi 一个会话只有一个叶子，两个 SessionManager 并发写同一文件会互相覆盖），
    可行性调研中，结论记到「M4-d 实施记录」；
  - 不能删除某个版本（pi append-only，只能省略消息或切走）；
  - 旧分支行的标题/分组/归档在合并后丢失（只保留父对话的）；嫁接按内容比对，内容一模一样但本意不同的前缀会被认作公共前缀；
  - 目录行 `update_time` 切版本不变、`message_count` 跟当前路径（列表排序不因切换而跳动）；
  - `parent_session_id`/`branch_index` 两列 M8-d 已删（M4 时期的库在树合并后删列）。
- **宿主空闲回收（M4-e）**：空闲 30 分钟的宿主会话释放，「本会话始终允许」的工具授权随之失效（与重启同一边界）；
  回收时如果恰好停在等待交互上不会发生（忙的不回收）。回收后渲染端下一次发送自动从文件重建。
- **subagent 的 maxToolCallLoops/timeoutMs 参数**留 schema 但 pi 无对应配置（不生效），M3 清理
- **单发 IPC 全量透传 partial 的带宽**：百 KB 正文×千次 delta 理论放大，实测未见问题；
  若卡做主进程 per-request 合并节流（传输层优化，非语义层）
- **runtime 内存（M4-e 已治）**：空闲条目最多保留 20 条（LRU），切库清空闲条目；渲染端 `piChatSessionManager`
  的会话描述表没做上限（每条只是几个字符串，宿主被回收后下次 ensure 发现失效自动丢弃）
- **工具执行进度回传**：`piSessionToolUpdate` + `pi-session:tool-update` 链路是通的
  （渲染端 → bridge.handleUpdate → pi 的 `onUpdate`），但桌面桥接工具目前都不报进度，
  故零调用方。**有意保留**（与已删的死参数不同：这条真调用会生效），工具卡要做进度显示时直接用

## 六、路线：M3（已完成）与后续里程碑

优先级从高到低：

1. **D-060 权限映射（M3-a 已完成）**：实现与生命周期边界见上节。
2. **ask_user（M3-b 已完成）**：ask-question 改宿主原生 customTool，见上节；下一步从第 3 项继续。
3. **MCP 桥（M3-c 已完成）**：工具集动态化见上节（此前文档说「工具桥自动可用」并不准确：
   会话创建后的工具变化对该对话隐形）。主进程 mcp.ts 的 D-058 管理页保留；下一步从第 4 项继续
4. **设置页产品化（M3-d/e/f/g 全部完成）**：服务商类型选择、模型勾选与实时获取、
   两侧档位接目录、档位类型收敛、shellPath 设置 —— 见上面三节。下一步从第 5 项继续。
5. **steer 交互（M3-h 已完成）**：运行中插话接 pi 原生 steer、队列下沉运行时、停止暂停队列，
   见上面 M3-h 一节。下一步从第 6 项继续。
6. **WSL 手动选项：用户裁决不做**（2026-09-27）。调研结论留档：pi 无「从 Windows 调 WSL」能力
   （`utils/wsl.ts` 只判断 pi 自己是否跑在 WSL 里）；可行路线是注册同名 `bash` customTool + 自实现
   `BashOperations.exec`（spawn `wsl.exe -e bash -ls`、命令走 stdin、cwd/命令里的 `X:\` 翻译成 `/mnt/x/`、
   `WSLENV` 透传 `PI_*`）；`wsl.exe -l -q` 输出是 UTF-16LE。将来要做从这里接。

**队列交互（M3-a 起，M3-h 重构归属）**：待发送消息在输入区上方显示文本/附件摘要；每条可编辑、
删除、改为插话；队列在 piChatRuntime 条目里按 conversationKey 隔离（切页不丢），
agent_settled 触发排空；用户按停止则暂停排空。

**M4（会话管理，本批已完成）**：见文首「M4 实施记录」。目录表 + resume + 投影 + 迁移器（原 M6 提前）

- 事实源切换 + 五场景接入 + 同步带会话包（原 M7 的整包部分提前）+ 扩展页面会话（原 M5 的会话部分提前）。

* **M4-d 已完成**：分支改 pi 会话树（同一文件挪叶子、旧分支族合并成树），见「M4-d 实施记录」。
  **M4-e 已完成**：治理与重启恢复，见「M4-e 实施记录」。M4 全部完成。
  另有待排期（非迁移范围，用户提出）：分支并行运行、分支命名、扩展树谱、并排对照两个分支。
  **M5（浏览器扩展）已完成**：侧栏对话迁主进程（只迁对话接口，用户裁决）、WS 协议 v2、提问审批走桌面宿主，
  见「M5 实施记录」（侧栏重开接回在跑的回答已追加）。
  **M6（老数据迁移器）**：已并入 M4（`chat-session-migration.ts`）。与原计划的差异：一行一会话、分支族不合并；
  思考不迁；audio_note_chats 不迁。
  **M7（同步）：用户裁决不做**（2026-09-29）——同步保持 M4.4 的 zip 整包 + 共用版本号，不改增量 manifest。
  调研留档（将来要做从这里接）：四种后端（OSS/S3/WebDAV/GitHub，`src/utils/sync/*SyncProvider.ts`）都支持单文件读写与列目录，
  但只有 OSS 实现了 `deleteFile`，且拿不到内容 hash（manifest 需自算 sha256）；现有版本号模型不允许双方都有修改（领先者整体覆盖）。
  已知缺口：CLI 的 `apps/cli/src/commands/db/sync/push.ts`/`pull.ts` 不处理会话包，且 push 先传版本信息再传 `.db`（与桌面顺序相反）。
  **M8（删旧收尾）**：packages/agent 整包——**实测比原计划便宜**：桌面端只剩 4 个类型导入
  （`AgentModelUsage`×2 / `AgentTool` / `AgentSkill`）+ 一个值导入 `isAbortError`（editingUtils），
  其他 app 与 package 全无引用；内联这 5 个符号 + 清 vite/vitest/tsconfig 别名与 package.json 依赖即可删包。
  chat-core 展示层（保留 messageSchema 供迁移器；`syncAssistantDerivedFields`/`ensureAssistantMessage`/
  `getAssistantToolExecutions`/`migrateAssistantMessage`/`sanitizeToolMessages`/
  `applyAssistantProviderMetadataSnapshot` 目前只剩桌面 barrel 转出、无真实消费者）、
  chat_run 表与主进程 handler（含 db-schema/knowledge-migration/mobile Rust 的同批处理）、
  modules/llm.ts、卫星表 messages 写路径、扩展本地提问机制（`askQuestionSessionStore` 与 `ext.tool.execute` 的
  ask-question 分支，M5 后无新调用方）；DECISIONS.md 追加条目；03 指南数据协议节同步；rg 复核清零。

  **M8 进度**：
  - **M8-a 已完成**：`packages/agent` 整包删除。`AgentModelUsage` → shared `ModelUsage`；`AgentTool` → 桌面自己的
    `ToolDefinition`（`RegistryAgentTool` 就地定义）；`isAbortError` 内联进 editingUtils；`desktopSkillAdapter` 的
    `toAgentSkill(s)`（零调用方）一并删；清掉 tsconfig、三个 vite 配置、vitest、e2e 协作配置的别名与 package.json 依赖。
  - **M8-b 已完成**（llm.ts / 扩展本地提问 / chat-core 死函数 / localStorage 遗留键）：
    - `modules/llm.ts` **整个删除**（用户追加裁决：Minimax Key 测试也迁到 pi）。唯一调用方是新旧两个设置界面的 Minimax 连接测试，
      改走新 IPC `pi-ai:verify-key`（core 的 `verifyProviderKey`：临时建 pi Provider、不进注册表，`completeSimple` 发一条
      `maxTokens:16` 的消息，`stopReason=error` 转失败原因，30 秒超时）。渲染端 `verifyMinimaxApiKey` 用 pi 目录的 `minimax-cn`
      服务商（`https://api.minimaxi.com/anthropic`，Anthropic 协议，模型 `MiniMax-M2.7`）。`embedding-openai`/`markdown-split`
      零调用方随之删；`commands/llm.ts` 与只被 llm.ts 用的 `utils/model-overrides.ts`（含测试）一并删。
    - 扩展本地提问：`askQuestionSessionStore`（含测试）、`extToolServer` 的 ask-question 工具定义与执行分支删除；
      `BROWSER_TOOLS` 不再含 ask-question，两处过滤去掉；`AskQuestionRenderer` 只读宿主提问（宿主不在等即锁定），测试改为经
      `useRunInteractionStore` 驱动。`askQuestionTypes`（渲染与结果解析）保留。
    - chat-core：`sanitizeToolMessages`（只剩测试在用）删除；其余几个都有真实消费者（见裁决要点），保留。
    - localStorage 遗留键 `chat-message`、`ask-question-session` 在 `useSettingStore.loadCachedSetting` 里清掉。
  - **M8-c 已完成**（chat_run 表 + stream-fetch）：
    - chat_run：schema 分片（`20_content.sql` 表、`90_indexes.sql` 2 个索引）删除并重生成 bundle；parity 常量 70→69 表 / 120→118 索引，
      `REMOVED_TABLES` 加 `chat_run`；`tables/chat-run.ts`（7 个 handler）及测试删除。老库里的表**开库即 DROP**
      （桌面 `openDatabase` maintenance 段、移动端 `ensure_main_schema` 的订阅退役之后）——表里只有运行中状态，无需备份。
      `knowledge-migration.ts` 与移动端 `knowledge_migration.rs` 本就判列/判表存在，不用改（老库在 DROP 之前先跑知识库迁移，无影响）。
    - `modules/stream-fetch.ts`：渲染端零调用（M2-f 删了 `commands/stream-fetch`），模块与注册删除。
  - **M8-d 已完成**（旧聊天表 + 目录表分支列）：
    - **退役** `legacy-chat-retirement.ts` 的 `retireLegacyChats`：两次迁移（`chat-session-pi-jsonl:v1`、`chat-session-tree:v1`）
      **都记账后**才执行——先 `VACUUM INTO` 备份（`.pre-legacy-chat-retirement-v1-*.bak`），再 DROP 五张旧表
      （`audio_note_chats` 未迁移，用户裁决直接丢弃，只在备份里），并在 M4 时期的库上删掉 `chat_session.parent_session_id /
branch_index` 与 `idx_chat_session_parent`（SQLite 3.35+ 的 `DROP COLUMN`，带索引的列要先删索引）。幂等、没东西可删不备份。
      开库（maintenance）与同步下载重连都在树合并之后调它（`database.ts` 的 `retireLegacyChatTables`），失败只记日志不阻塞开库。
      没迁过的库（远程下载来的旧 `.db` 还没以维护模式开过）不删，等迁完再删。
    - **老对话迁移当场合并分支**：新表没有分支列，`migrateLegacyChatsToSessions` 把旧分支行的父子关系留在内存，写完文件后调
      `mergeBranchFamilies`（从树合并迁移抽出的共用函数：按深度嫁接、并进去的删文件与目录行、对不上的留作独立对话）。
      树合并迁移只处理还带分支列的 M4 时期库（`hasBranchColumns`），否则只记账。迁移器对缺列的很老的库按 NULL 读（没有旧表模块再补列了）。
    - schema：五张表与 8 个旧表索引、`chat_session` 两列与 1 个索引删除；parity 64 表 / 105 索引，`REMOVED_TABLES` 加五张表。
    - 删除：`tables/chat-message|pdf-chat|video-note-chat|vibe-learning-chat|audio-note-chat.ts`（全部旧 handler）、
      `commands/audio-note-chat.ts`、四个类型文件里的旧聊天类型、`chat-message-create/chat-message-schema-migration/pdf-chat` 三个测试；
      `ChatSessionRow/Insert` 去掉 `parentSessionId/branchIndex`。
    - **级联删除改接目录表**：视频笔记、学习项目删除时 `ChatSessionTable.removeByDomain`（原来删的是旧表行，目录行与会话文件会成孤儿——
      M4 时就漏了，这次一起修）；学习项目删除前渲染端先 `releaseBucket`（与删 PDF 同理）。视频笔记只经项目条目删除，渲染端没有该入口，不用释放。
      音频笔记没有对话面板，直接去掉旧表那一步。
    - **移动端**：基线里没有旧表了，`main_upgrade.rs` 对四张旧表的补值 UPDATE 删掉（老库里的旧表原样留着等桌面迁移；
      很老的 schema 缺 `agent_type` 列，原来靠补列才不报错）。`migration_tests.rs` 两处断言与资源清理夹具改用 `chat_session`。
      `knowledge-migration.ts` / `knowledge_migration.rs` 本就判表判列存在，不用改。
    - 测试：`chat-session-migration.test.ts`（迁移时合并分支、缺列老库）、`chat-session-tree-migration.test.ts`（端到端含退役、
      M4 时期库退役删列与备份、未记账不退役）；删除清理类测试改用目录表断言。

  **M8 裁决（2026-09-29 用户拍板）**：
  - 旧聊天表（`chat_message`/`pdf_chats`/`video_note_chats`/`vibe_learning_chats`）**迁移记账后真 DROP**：开库时确认
    `migration_meta` 已记 `chat-session-pi-jsonl:v1`，先 `VACUUM INTO` 备份，再 DROP；schema 与主进程 handler 删除。
  - `audio_note_chats`（无界面、未迁移）**直接丢弃**。
  - `modules/llm.ts`：初裁保留 Minimax Key 测试那条路径，**后追加裁决迁到 pi**，整个模块删除（见 M8-b）。
  - 迁移器与树合并迁移**长期保留**（老库、旧远程下载来的 `.db` 靠它们升级）；移动端 Rust（`main_upgrade.rs` 对 4 张旧表的
    UPDATE）同批改为判表存在；按块拆提交（agent 包 / chat-core / llm.ts 与扩展提问 / chat_run / 旧表与两列）。
  - 调研实测要点：chat-core 那 6 个函数不能整删——`syncAssistantDerivedFields` 被 `pi-session-transcript.ts` 用、
    `applyAssistantProviderMetadataSnapshot` 被 streamEvents 用、`migrateAssistantMessage` 在迁移器链路上；可删的只有
    `sanitizeToolMessages` 与 barrel 转出条目，`ensureAssistantMessage` 被 `createAssistantMessage` 内部调用、只能去掉导出（逐个 rg 复核）；packages/agent 别名还在 `e2e/collaboration/vite.config.mts`；
    chat_run 删表要改 `scripts/db/check-schema-parity.mjs` 的计数并加进 `REMOVED_TABLES`，`knowledge-migration.ts` 与移动端
    `knowledge_migration.rs` 已判表存在；`parent_session_id`/`branch_index` 删列要 SQLite 重建表，排在树合并迁移之后；
    localStorage 遗留键 `ask-question-session`/`chat-message` 在 `useSettingStore.ts` 的 `removeItem` 组里清。

**与 pi 迁移无关的仓库积灰（另开一次，不要混进迁移提交）**：全仓广扫发现约 40 个无引用的
组件/hooks/工具文件（`components/AdvanceTable` 只是个占位 `<h1>`）与两个成片死目录
（`pages/DailyNoteView`、`pages/TimeRecordView`，后者 `app/navigation.ts` 注释已标 legacy）。
注意 `pages/Settings` **不是**死代码：`/legacy` 路由的 ContentLayout + `TabType.Settings` 都在用，
新旧两套设置界面并存（旧界面没有 pi 的新设置项）。落地前建议跑 `knip`/`ts-prune` 交叉验证——
按模块名末段做差集会漏掉与活模块同名的死文件。

## 七、验证与调试

- 全量：`npx tsc --noEmit && npx vitest run`（apps/desktop 下）
- 主进程链路：`ELECTRON_RUN_AS_NODE=1 npx electron scripts/pi-smoke.mjs`（faux 驱动完整
  agent loop + 真实 bash/write/read 中文路径）
- 主进程日志看 `[PiSessionHost]` 前缀（shell 探测/事件序列化/图片读取失败）
- 请求取证：`PI_DUMP_REQUESTS=1` 环境变量重启，出站 payload 写 `~/.editor/pi-request-dumps/`
- 常见验收场景：发送/流式/工具卡/ask_question 闭环与刷新恢复/停止/重试/图片/旧对话续聊
  （M4 起从 JSONL 恢复）/编辑重发/重新生成/分支/模型切换/切页后台运行/停止后立即发送
- M3-f 专项（需真实服务，未做实机走查）：本地 Ollama（无 key）建「其他服务商」→ 打开「选择模型」
  自动列出本机模型；OpenRouter/DeepSeek 等内置服务商点「从服务商获取」→ 目录未收录的新模型
  追加在末尾；key 填错 → 提示 API Key 无效；地址写错 → 提示连不上；不支持列表的服务 → 提示手动添加。
  勾选后确认上下文窗口：目录命中的用目录值，目录外的留空（不应出现 128k 猜测值）。
- M3-g 专项：设置页「工具权限」标签底部「命令执行环境」——留空时显示检测到的 Git Bash 路径、
  填个不存在的路径应提示且实际仍用检测值（主进程日志有一行 warn）、填对后新建对话让 AI 执行命令
  确认用的是它；聊天输入框档位下拉只出现当前模型真实支持的档（gpt-5 无「不思考」、Anthropic 有，
  支持 minimal 的模型能看到「极简思考」）；换到不支持所选档的模型后显示自动落到第一档。
- M3-c 专项：对话进行中用输入框 MCP 面板关掉某个 provider → 下一轮模型不再有那些工具且
  **不重建会话**（本会话工具授权仍在）；重新打开 → 工具回来；对话中途新连一个 MCP 服务器
  → 会话重建后可用；连着几轮不动工具 → 不应有多余的工具集同步（缓存不该反复失效）。
- M3-a 专项：manual 下 write/bash 等待且不执行；允许/拒绝/本会话始终允许；
  acceptEdits 放行 write 但拦 shell；bypass 放行；审批中停止、切页、渲染层重载；
  两会话同名工具不串授权；无审批界面的一次性入口拒绝高风险操作。
- M3-b 专项：模型发起 ask-question → 必答未填提示 → 作答后续流；作答前停止（卡片显示未回答）；
  等待中切页/渲染层重载后仍可作答；同一轮审批与提问并存；PDF/视频笔记/学习项目面板内提问。
- 后台运行专项：流式中/等待作答时新建对话、切换对话、改名；回到原对话消息完整且标题正常；
  删除正在运行的对话后不再有落库（控制台无该行的持久化日志）。
- 队列专项：流式中发送多条消息；查看每条待发送内容；编辑后重新发送；删除指定条目；
  agent_settled 后自动排空；切换会话后队列互不串台；停止后队列保留且可继续编辑/删除。
  **M3-h 追加**：流式中排队几条后切页再回来，队列还在且回来后继续排空（此前切页即丢）。
- **插话专项（M3-h，未做实机走查）**：让模型跑一个多步任务（多轮工具），中途用
  `⌘/Ctrl + Shift + Enter` 或插话按钮插一句 → 插话卡出现在输入区上方 →
  当前工具/步骤跑完后它作为用户消息出现在聊天流里、模型据此调整，且**回答没有断成两轮**
  （没有第二个「思考中」重新开始、没有多余的 settled）；
  待发送里的条目点「插话」→ 从待发送转到插话组；
  等待审批/等待作答时插话 → 处理完那一步后才送达；
  插话后立刻按停止 → 插话退回待发送队列（队列显示「已暂停」），可编辑/删除，
  手动发送一条后剩下的继续排空；
  会话刚好结束的瞬间插话 → 提示「这轮回答已结束，已加入待发送」，不新起一轮；
  编辑重发/图片编辑上下文里插话按钮不出现；
  插话带图片/文件附件 → 模型能看到（图片直传、文件给路径让它 read）；
  插话送达后刷新渲染层 → 那条用户消息还在（已落库）。
- **M4 专项（未做实机走查）**：
  - 老对话迁移：用有老对话的库开库 → 主进程日志有 `chat session migration done` 一行、备份文件生成；
    五个场景的老对话都在，打开能看到内容（没有思考过程属预期），续聊模型看得到历史；再开一次库不重跑。
  - 新对话：「新对话」→ 发送 → 列表出现且 id 不变；首轮在出回答前就失败 → 重开看不到（已知边界）。
  - 文件卡片 / mention / 图片编辑上下文：发送后重开，卡片原样（展示 entry），模型收到的是提示文本。
  - 编辑重发 / 重新生成：重开后落在新版本；先删一条再回退到它之前的消息 → 删过的不复活。
  - 删除单条消息（用户消息、带工具调用的回答）→ 界面与模型上下文都没了，重开仍没了。
  - 分组删除后对话回到未分组；删 PDF 后其对话与会话文件一起删。
  - 五个场景互不串：两个 PDF 各自的列表、主聊天停靠栏与对话页各自的新对话。
  - 双机同步往返：A 上传 → B 下载，列表与内容一致；B 连旧版本远程（无会话包）下载不清本地。
  - 扩展：同一页面多个对话、改名、删除；刷新页面后能恢复；换一个 hash 不同的同页 URL 看到同一组对话；桌面列表看不到它们。
- **M4-d 专项（未做实机走查）**：
  - 旧分支族合并：用 M4 时建过分支的库开库 → 日志有 `chat session tree migration done`（merged/detached 计数）、
    会话目录备份生成；列表里分支行消失，原对话在分叉那条用户消息下出现 `‹ 1/2 ›`，切过去是分支的内容；再开一次库不重跑。
  - 编辑中间一条用户消息（不只最后一条）→ 发送后出现 `‹ 2/2 ›`，点 `‹` 回到原版本，后面整段对话一起换回去；重开仍在切到的版本。
  - 重新生成：同一问的多个回答在 `‹ i/n ›` 间切换；从中间一条回答「创建分支」→ 提示已分叉，发一条消息后下一问出现新版本。
  - **切版本不丢会话授权**：manual 模式下给某工具「本会话始终允许」→ 切版本 / 编辑重发 → 再调该工具不再弹审批。
  - 回答进行中 `‹ ›` 按钮禁用；停止后可切。删过的消息切到别的版本再切回来仍是删除状态。
  - 双机：A 合并后上传 → B 下载，B 直接是合并后的树；B 连一个未合并过的远程下载 → 重连后自动合并。
  - 扩展：M4 时在某页面建过分支 → 打开侧栏后分支文件并进原对话，消息上可切版本；从回答创建分支、切版本、删除对话。
  - 读屏：`‹ ›` 按钮读出「上一个版本 / 下一个版本」，中间读出「版本 i / n」（完整无障碍需人工用读屏软件复核）。
  - 树谱：有分叉时对话右上角出现「N 条分支」；浮层里直链压成一行（+N）、当前分支标「当前」、其余显示最后活动时间；
    点一行切过去并滚到分支起点；分叉点那条回答下方有「从这里分出了多条分支 · 查看」；停靠栏里浮层不超出窗口（已修一次溢出）。
- **M4-e 专项（未做实机走查）**：
  - 重启恢复：让模型调一个需要审批的工具（manual 模式）→ 审批条出现时退出应用 → 重开对话，工具卡显示失败、
    结果是「应用重启，这次工具调用已中断」；发一条「继续」模型能接上。提问卡同样操作，卡片显示「提问已结束」。
  - 渲染层重载（Ctrl+R）后直接在同一对话发消息：主进程日志不出现同一文件开两个宿主；等待中的审批仍能收养作答。
  - 空闲回收：临时把 `IDLE_DISPOSE_MS` 改小验证——空闲后日志有「空闲回收会话」，再发消息正常（从文件重建），
    但「本会话始终允许」需要重新授权；等待审批中的会话不被回收。
  - 切库：A 库打开几个对话 → 切到 B 库 → 回到 A 库，对话正常；A 库里正在跑的回答切库期间不被打断。
  - 删一个打开过对话的 PDF：不报错，日志无写入已删文件的错误。
- **M5 专项（未做实机走查）**：
  - 默认「手动确认」模式下在扩展侧栏问「总结这个页面」：能读到页面（修 bug 前会被拒）。
  - 回答进行中在桌面按 Ctrl+R 重载渲染层：扩展侧栏的回答不中断、照常收尾（v1 会断）；关闭桌面主窗口同理（只剩页面工具可用）。
  - 扩展里点停止：桌面主进程日志里这轮确实停了，卡片不闪错误；概览页、行内问答的停止同样生效。
  - 模型报错（填错 key）：扩展显示错误，不再静默成功；网络抖动时显示「正在重试（第 n 次）」。
  - 需要确认的工具（manual 模式下的写入/执行类桌面工具）：侧栏输入框上方出现审批条，允许后继续、拒绝后模型收到拒绝。
  - 模型发起提问：提问卡可作答并续上；答不全提示必填项。
  - 同一页面开两个标签页、同一对话同时发送：第二个提示「正在另一处回答」；另一个标签页打开侧栏应直接接回那轮在跑的回答。
  - **接回（M5 追加）**：回答中关掉侧栏再打开 → 已生成的内容在、继续流式、停止按钮可用；停在审批/提问上时关掉再开 →
    审批条/提问卡还在且能作答；回答中切到另一个对话再切回 → 接回；新对话首轮（还没落盘）关掉重开 → 提问与回答都在，
    列表出现它要等首轮结束；回答中切到别的对话 → 那边不显示加载中、不串内容。
  - 两个浏览器窗口各开侧栏：各自的页面工具读的是各自的页面。
  - 桌面没开时扩展：提示未连接；桌面起来后自动连上（3 秒内）。

## 八、工作约定（用户明确要求，违反会返工）

1. 文件修改一律 **Read+Edit 精确编辑**，禁止脚本/sed 批量替换（连环出过错）
2. 发现 bug 先判断设计层 vs 实现层——**不打补丁**（用户原话质疑过"为什么会出现这么
   低级的错误"，根因都是设计层）
3. 有状态的东西放对层级：跨轮次/跨页面/跨组件的状态必须模块级或主进程，组件只放 UI 态
4. 本文档随架构变化同步更新（每次架构级提交同批更新）
