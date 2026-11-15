# 聊天引用

状态：进行中
目标：在正文（卡片、文章、项目文档、日记）里引用 AI 对话的某一轮或其中一句；悬停看原话，点击在右侧停靠栏打开对话并定位到那一轮。

视觉稿：`apps/desktop/mockups/chat-ref/`（`.claude/launch.json` 的 `mockups`，入口 `http://localhost:6211/chat-ref/`）。

## 需求

- 两种节点：
  - **行内引用** `chat-ref`：桌面正文里只显示对话标题，点线下划线沿用 `[[` 内容引用样式，前面带对话图标。
  - **摘录块** `chat-quote`：正文里保留原文快照，下面一行写来源（对话标题 · 第 N 轮 · 模型 · 日期）。
- 插入入口：
  - 对话消息悬停操作新增「引用到正文」按钮（quote 图标），点开小菜单：「插入到正文」（行内引用）、「作为摘录块插入」（整条回答）、「复制引用链接」。找不到可写的正文时只剩复制链接。
  - 先在回答里选中一句再点「引用到正文」：摘录项变为「摘录选中的文字」。
  - 正文里打 `[[`：引用面板加「对话」来源（后做，见进度）。
  - 粘贴 `tau://chat/<sessionId>?entry=<entryId>`：自动转成行内引用。
- 阅读：
  - 悬停行内引用 450ms 后出预览卡，显示这一轮的提问和回答，与 content-link 的悬停节奏一致；卡片上有「在侧栏打开」「对话页」「复制引用链接」。
  - 编辑态 ⌘/Ctrl 点击打开，只读态单击打开。打开时停靠栏切到该会话，滚到这一轮，不进页面栈。
  - 这一轮在其他分支：只提示，不自动切换（沿用 `useChatEntryLocation`）。
  - 对话已删除：行内引用显示为灰色删除线；摘录块保留原文，来源行标注「对话已删除」。
  - 协作者本机、发布站点：行内引用显示为不可点的出处文字，摘录块照常显示原文和来源。
- 导出：Markdown 行内引用为 `:chat-ref[标题]{…}` 指令（导入可还原），摘录块为 `> 原文` 加一行来源；HTML 行内引用为 span，摘录块为 blockquote。

## 方案

### 模块

| 模块       | 位置                                             | 职责                                                                                          |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 节点声明   | `editor-extensions/element-definitions.ts`       | `chat-ref`（行内 void）、`chat-quote`（块级 void）的持久化声明，并入 `hostElementGroups`      |
| 编辑器扩展 | `editor-extensions/chat-ref/`                    | 渲染、悬停预览、打开、粘贴识别、插入操作；结构照 `content-link`                               |
| 链接与载荷 | `editor-extensions/chat-ref/link.ts`             | `tau://chat/…` 生成与解析、剪贴板写入                                                         |
| 当前正文   | `services/content-editing/active-editor-session` | 登记会话时一并登记 editor 实例，提供「最近聚焦的可写正文编辑器」给对话侧插入                  |
| 一轮数据   | 主进程 `pi-session:turn`                         | 按会话 id + entry id 取一轮（提问、回答文本、第几轮、是否在当前分支、模型、时间）             |
| 对话侧入口 | `components/ChatSidebar/MessageItem`             | 主对话里的消息显示「引用」按钮；选区浮条                                                      |
| 打开定位   | `features/chat/openInDock.ts`                    | `openChatInDock(sessionId, { entry })`：停靠栏切会话并消费 entry，复用 `useChatEntryLocation` |
| 编解码     | `utils/markdown-codecs.ts`、`html-serializers`   | Markdown / HTML 导出；导入经 `@tau/shared/markdown-directives`                                |
| 发布站点   | `packages/blog`                                  | 未知节点保护已能保留数据；为两种节点加只读渲染（出处文字 / 引文块）                           |

不走插件机制：D-166 已删除内置插件装配入口，本功能和 `[[` 内容引用一样作为宿主扩展随应用提供。

### 数据

```ts
interface ChatRefElement {
  type: "chat-ref";
  sessionId: string; // pi 会话 id（= chat_session.id）
  entryId?: string; // 该轮用户消息的 pi entry id；缺省 = 整个对话
  title: string; // 插入时的会话标题，失效与协作时显示
  turn?: number; // 第几轮，仅用于显示
  children: [{ text: "" }];
}

interface ChatQuoteElement {
  type: "chat-quote";
  sessionId: string;
  entryId: string;
  quoteText: string; // 引用原文
  title: string;
  turn?: number;
  model?: string;
  children: [{ text: "" }];
}
```

链接：`tau://chat/<sessionId>?entry=<entryId>`。复制时 `text/plain` 写链接，`text/html` 写带链接的标题。

### 主流程

```text
插入(载荷):
  editor = 最近聚焦的可写正文编辑器
  if editor 存在: 在其选区插入（行内或摘录块，一次撤销）
  else: 写剪贴板 + toast「已复制引用链接」

悬停/打开(节点):
  turn = rpc pi-session:turn(sessionId, entryId)   // 按库缓存，工作线程按文件指纹复用索引
  无此会话或该轮 → 失效样式
  打开 → openChatInDock(sessionId, { entry })
         等会话历史就绪后，停靠栏 ChatContainer 消费 entry：当前分支→滚到该轮；其他分支→提示
```

## 决策

- 插件形态：宿主内置扩展，不经插件机制（用户 2026-11-15 确认，原因见上）。
- 选中一句插摘录块；一期不做选区浮条，选中后经消息的「引用到正文」菜单插入（浮条需要新增对话选区工具条，留到 `[[` 面板一起做）。
- 一期不做反向引用「被 N 篇引用」，不新增索引表。
- 一期只支持主对话（`main-chat` 作用域）被引用；其他场景的消息不显示「引用」按钮。
- 不单独做「复制对话链接」顶层按钮，复制链接收在「引用」菜单里。

## 进度

- [x] 主进程 `pi-session:turn`（沿该轮所在分支读，删除返回 null）
- [x] 节点声明、扩展、悬停预览、打开、粘贴识别（跟踪选区，取到标题快照后一次写入）
- [x] 对话「引用到正文」菜单（含选区摘录）、停靠栏 entry 定位与定位铺底
- [x] Markdown / HTML 编解码、`@tau/blog` 只读渲染（需随下次 blog 发版）
- [x] `docs/architecture/desktop/ui-interaction.md` 已补「聊天引用」现状
- [ ] 视觉验收（用户）
- [ ] 二期：`[[` 面板「对话」来源、对话选区浮条
- [ ] 收尾：方案沉淀进 `docs/architecture/desktop/ui-interaction.md`，删除本目录，更新 `docs/README.md`

## 验证

- 桌面端类型检查、生产构建、首次挂载及 144 个相关测试通过，覆盖摘录持久化和旧异常节点自愈、历史加载后定位、跨块粘贴和异步撤销、切库、分支与 Markdown 往返。
- 博客 17 个测试及分发包构建通过。博客与白板的独立类型检查均通过。
- 五档合成会话共复测 800 次读取。12.7 MiB 会话的八请求批次中，主线程事件循环最大延迟从 628.9 ms 降至低于 0.1 ms。
- 未做：界面与交互走查（按约定由用户验收）。
