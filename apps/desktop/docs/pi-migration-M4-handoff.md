# M4 事实源切换：交接给下一个会话

> 2026-09-28。**事实源切换已提交**：`68affe879`（84 个文件）。
> 主文档是 `pi-migration-handoff.md`（「M4 实施记录」一节是本批的正式记录）；本文件跟踪
> **迁移到 pi 的当前进度 + 剩下要做什么**，随每一步同步更新，迁移没做完之前不要删。
>
> 验证现状（`68affe879`）：`apps/desktop` tsc **通过**、vitest **全量通过**（342 文件 / 1637 用例，2 文件 3 用例跳过）；
> `packages/shared` tsc + vitest **通过**（5 文件 / 13 用例）；`apps/browser-extension` tsc + vitest **通过**（11 文件 / 44 用例）；
> Electron 冒烟 `pi-smoke.mjs` **SMOKE PASS**。
> **还没做**：M4 实机走查（主文档第七节「M4 专项」，需要真实模型与双机）。

## 一、这批实际做了什么（与计划的差异都在这里）

### 1. 事实源切到 pi JSONL

- 对话内容不再写 sqlite：`chat_session` 只存目录元数据，消息由 `pi-session:transcript`
  从会话文件投影。运行时 `piChatRuntime` 的 `deps.persist` 改成 **`settle`**——`agent_settled`
  后重读投影回写容器（`adoptTranscript` 按位置沿用原 clientId，避免列表重挂载），
  再更新目录行 `messageCount/updateTime`；标题另走 `saveTitle` 写目录行。
- **删掉了两处立即落库**：等待审批/提问时的快照落库、插话送达时的落库。后者是因为 pi 在送达时
  就把用户消息写进了 JSONL（展示 entry 由主进程紧跟着写）。
- `restorePendingInteractions` 的判定按计划改成「最后一条回答里有没有**没有结果**的 tool_call」
  （投影在等待期间没有 toolResult，拿不到 execution），是不是真在等由宿主交互快照决定。

### 2. 草稿态与 id（与计划一致，但实现位置不同）

- 新对话点「新对话」就用 `crypto.randomUUID()` 生成真 id，目录表里查不到就是草稿；
  首发时宿主以这个 id 建会话，回传 `sessionFile` 后 `createChatSession` 登记。**id 从头到尾不变**，
  所以 `adoptConversation`、`runtimeKey`、`id === 0` 全部删掉了。
- 草稿**不放 store 状态**：放在模块级草稿槽 `draftSlots`（`draftFor/resetDraft/releaseDraft`）。
  原因：渲染期取草稿不能触发 setState。每个面板一个槽（停靠栏与对话页同属主聊天但各有各的新对话）。
- `ChatSessionRecord`（shared）：`id`/`parentChatId` 改 string，新增 `sessionFile`/`scope`/`domainRef`。
  另给 `RequestMessage`/`ResponseMessage`/`ChatMessageType` 加了 **`piEntryIds`**——改历史操作按它定位
  （用户消息带自己的 entry id，一条回答带它全部 assistant+toolResult 的 entry id）。

### 3. 新增/重写的文件

| 文件                                                               | 作用                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-electron/main/modules/pi-session-paths.ts`                    | 会话目录的唯一取法：`chatSessionDirOf`（库）、`chatSessionDirOfDb`（按连接）、`browserSessionDirOf`（页面哈希）、`resolveSessionFile`/`assertSafeSessionId`/`findSessionFileById`（防路径穿越） |
| `src-electron/main/modules/pi-session-store.ts`                    | 投影读取、改历史入口 `applySessionEdit`、扩展对话列表/改名/删除（`listSessionsInDir` 等）、同步打包 `packSessionDir`/`replaceSessionDir`                                                        |
| `src/stores/useChatSessionStore.ts`                                | 统一会话 store（取代四个旧 store）：按 scope+domainRef 分桶的目录行 + 已打开对话 + 分组 + 草稿槽                                                                                                |
| `src/hooks/useScopedChat.ts`                                       | 一个面板的会话接线（列表/当前对话/新建/改名/删除/分支数），五个场景共用                                                                                                                         |
| `__tests__/pi-session-store.test.ts`                               | 页面键、扩展对话列表/删分支子树、打包解包与失败回滚（7 用例）                                                                                                                                   |
| `__tests__/pi-session-display.test.ts`                             | 展示 entry 端到端：文件卡片重开原样、按文本认领、撤回登记（4 用例）                                                                                                                             |
| `src/services/__tests__/piChatRuntime.settle.test.ts`              | settle 投影回写与标题（7 用例，取代原 persist 测试）                                                                                                                                            |
| `src/stores/__tests__/useChatSessionStore.test.ts`                 | 首发登记与文件名回写、建分支、五场景分桶互不串、草稿槽（9 用例）                                                                                                                                |
| `browser-extension/src/services/__tests__/chatStoreClient.test.ts` | 扩展 `chat.*` RPC 形状（6 用例）                                                                                                                                                                |

另外：改历史的「先 dispose 再 edit」从 `ChatContainer` 提到 `piChatSessionManager.editChatHistory`，
`piChatSession.test.ts` 加了「改历史」组（3 用例）。

### 4. 删除的文件

四个旧 store（`useChatMessageStore`/`usePdfChatStore`/`useVideoNoteChatStore`/`useVLChatStore`）
及其测试、`commands/video-note-chat.ts`、`commands/chat-message.ts` 里的对话读写（只留分组命令）、
`commands/pdf.ts`/`vibe-learning.ts` 的对话命令、`components/ModelSidebar`（本来就无引用，
但依赖旧 store）、扩展的 `chatMigration.ts` + 测试、`editingUtils` 的 `buildResetBaseChat`/
`buildFullHistoryMessages`（pi 从文件恢复，不再拼历史）。

### 5. 浏览器扩展（按新方案）

- 对话存 `~/.editor/browser-sessions/<页面键>/`，页面键 = 去掉 hash 的 URL 的 sha256 前 32 位，
  **由主进程计算**；与库无关、不参与同步、桌面列表看不到。无索引表：列表/标题/分支关系
  全取自 pi 会话文件（`SessionManager.listAll` + 会话头 `parentSession` + `session_info`）。
- RPC 改为 `chat.list/get/rename/delete/branch/rewind/omit`（全部带 pageUrl，id 为 string）；
  删掉了 `chat.create/update/groups.list/group.ensure`。
- `ai.chat` 带 `sessionId + pageUrl` 时走新增的 `runBrowserSessionTurn`（每轮从文件恢复、跑完释放，
  `interactive: false`）；不带则保留原一次性路径。扩展不再拼历史、不再整包写消息，
  `useAiChat` 结束后经 `onFinish` 重读投影。
- 已删：ask-question 续流那段（pi 没法事后注入工具结果，与桌面 M3-b 一致）、system prompt 快照机制。

### 6. 主进程其它

- `pi-session:prompt`/`steer` 加 `display` 参数；展示 entry 由 `createDisplayEntryWriter`
  在 pi 的 `message_end(user)` 之后**推迟一个微任务**写入（pi 先通知监听者、再 appendMessage，
  不推迟会写到用户消息前面）。模型文本由主进程取实际送出的 text，渲染端不传，两边不可能对不上。
- 新 IPC：`pi-session:edit`（rewind/omit/branch，改历史前会拒绝「文件仍被宿主打开」）、
  `browser-list/browser-rename/browser-delete`、`pack/unpack`。
- `rewindToBeforeUser` → **`rewindToBeforeEntry`**（按 entry id，不按下标：被省略的消息仍在路径上，
  下标会错位），且回退后会把仍在新路径上的 `context_edit` 省略重新挂一遍（否则删过的消息会复活）。
- 级联删除下沉到表里：`ChatSessionTable.remove/removeByDomain` 连会话文件一起删，
  `chat-group` 删组改 `clearGroup`，PDF 删除调 `removeByDomain`。
- 开库迁移接线已接（`connectMode === "maintenance"` 时跑），迁移器跳过 `source='browser'` 的行。

### 7. 同步（M4.4）

upload 顺序改为 `.db` → 会话包（`<库名>.sessions.zip`）→ 版本信息；任一步失败不发布版本。
download 时远程没有会话包就不动本地。**踩到一个坑**：`new AdmZip(buffer)` 在 vitest 下读不出条目
（同一个包在纯 node 下正常），已改成落临时文件按路径打开；空包与坏包用 `isEmptyZip` 区分，
坏包走「备份挪回来」的回滚。

## 二、进度与剩下要做的（按优先级）

已完成（`68affe879`）：~~补跑验证~~、~~补验证清单缺的用例~~、~~冒烟~~、~~主文档同步（M4 执行手册 → M4 实施记录）~~、~~提交~~。

1. **M4 实机走查**：按主文档第七节「M4 专项」逐项过（老对话迁移、新对话、文件卡片、编辑重发/重新生成、
   删除、建分支、分组/PDF 级联删除、五场景互不串、双机同步往返、扩展页面会话）。发现问题先判断设计层还是实现层。
2. **M4-d 分支改 pi 会话树**：`navigateTree` 在同一文件挪叶子，旧 `parent_session_id` 分支族合并成树。
3. **M4-e 治理**：runtime 会话条目清理、主进程重启后的交互恢复（审批/提问/插话）、队列与插话的恢复边界。
4. 之后按主文档第六节：M5（扩展 aiServer 迁主进程 + WS 协议 v2）、M7（同步增量 manifest）、M8（删旧收尾）。

每做完一步：更新本文件的进度与验证现状，同批更新主文档对应小节。

## 三、已知遗留边界（已写进主文档第五节）

- **首轮在第一条回答之前就失败的对话，pi 不落盘**：重开后这条用户消息会丢（草稿也不在目录表里）。
- **扩展的「停止」不通知桌面**：本来就没有，这次没补。
- **扩展重载后「提问卡作答续流」已删**：卡片显示中断（与桌面 M3-b 同类边界）。
- `chat_message` 等旧表与主进程 handler 按计划留到 M8；渲染端已零调用方。
- 主进程重启后的交互恢复、分支改 pi 会话树（M4-d）、runtime 条目治理（M4-e）仍未做。

## 四、验证命令

```bash
cd apps/desktop && npx tsc --noEmit && npx vitest run
```

```bash
cd apps/desktop && ELECTRON_RUN_AS_NODE=1 npx electron scripts/pi-smoke.mjs
```

```bash
cd packages/shared && npx tsc --noEmit && npx vitest run && cd ../../apps/browser-extension && npx tsc --noEmit && npx vitest run
```

注意 vitest 的 cwd 必须在 `apps/desktop`（从仓库根跑会整体失败）。
