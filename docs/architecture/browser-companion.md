# 浏览器伴读

「Tau 伴读」浏览器扩展（`apps/browser-extension`）在当前网页里提供悬浮球、选区工具条、高亮批注、页面笔记和对网页提问，另有扩展页「伴读库」汇总所有标注过的网页；AI 用的是 Tau 里配置的模型，标注与笔记存进 Tau 的当前库。扩展只通过 `ws://127.0.0.1:24678/browser` 与桌面主进程通信，必须先经用户一次性授权。

## 组成

| 端         | 位置                                                                        | 职责                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 协议       | `packages/shared/src/browser-companion/`                                    | 方法名、scope、帧信封、握手与数据类型，校验码推导（WebCrypto，两端共用）                                                               |
| 桌面主进程 | `apps/desktop/src-electron/main/modules/browser-companion/`                 | `/browser` 握手、配对、token 校验、按 scope 分发，对话驱动 pi 宿主会话，标注 / 笔记写库                                                |
| 授权存储   | `apps/desktop/src-electron/main/services/browser-clients.ts`                | `userData/browser-clients.json`：已授权实例、token 哈希、scope、拒绝记录；不进库、不同步                                               |
| 桌面渲染端 | `apps/desktop/src/features/browser-companion/`、设置分区 `browserExtension` | 壳层挂载的授权弹窗（Esc / 关闭 = 拒绝）、主题上报、打开扩展保存的卡片；设置里管理授权                                                  |
| 扩展后台   | `apps/browser-extension/src/background/`                                    | 唯一持有 WebSocket；配对状态机、退避重连、20s 心跳；标注本机缓存与发件箱；按标签页路由消息                                             |
| 扩展页内   | `apps/browser-extension/src/content/`                                       | closed Shadow DOM（`<tau-companion>`）里的全部 UI；正文提取、锚定、高亮渲染、页面工具                                                  |
| 扩展页面   | `apps/browser-extension/src/note/`、`src/library/`                          | 扩展自己的页面：页面笔记 `note.html`、伴读库 `library.html`；共用 `src/shared/extension-page.ts`（存储、经后台调 Tau、连接状态与主题） |

## 连接与授权

```
扩展后台                                   Tau 主进程
  │ WS /browser  Origin: chrome-extension://…  │ ① 只放行扩展 Origin（chrome-extension / moz-extension），网页一律 403
  │ 首次：pair.request{clientId, info, nonceE} │
  │ ◀─ {status:"pending", nonceA} ─────────────│ ② 主窗口弹授权框；双方显示 SAS = SHA-256(nonceE‖nonceA) 的 4 位数
  │                                           │    用户允许
  │ ◀─ pair.granted{token, scopes} + ready ────│ ③ token 32 字节随机，Tau 只存 SHA-256 与授权时的 Origin
  │ 之后：hello{clientId, token}（3s 内首帧）──▶│ ④ 常量时间比较；clientId / Origin / token 任一不符即关闭
  │ ⇄ JSON-RPC 请求 / 响应 / 通知（对等，Tau 可反向请求 page.tool）
```

- 防护对象：网页（Origin 不可伪造）、其他扩展与本机进程（无 token；抢先发配对请求时校验码对不上）。已能读用户文件的本机恶意程序不在范围内。
- 频率闸：同一 clientId 10 分钟内被拒 3 次后冷却 10 分钟；同时待裁决的配对至多 3 个；「接受新的连接请求」关闭时直接拒绝不弹窗。
- 撤销：设置页撤销 → 推 `revoked` 并以 4006 关闭；扩展删除本地 token 回到未配对。hello 收到 `unknown-client` / `bad-token` 同样删 token。
- 通用路径（`/backendServer` 等）不再放行扩展 Origin，见 `server-access.ts`。

## scope

| scope         | 方法                                                                                                                    | 授予                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `chat`        | `ai.run.*`、`chat.history`、`models.list`                                                                               | 必需                                 |
| `annotations` | `annotations.list` / `annotations.sync`，伴读库的 `library.pages` / `library.sites` / `library.feed` / `library.rename` | 必需                                 |
| `notes`       | `note.save` / `note.open`                                                                                               | 必需                                 |
| `tools`       | 对话时使用桌面对话的同一份应用工具（ToolRegistry、Skill、MCP、插件工具）                                                | 可选，授权弹窗里默认勾选；设置里可关 |

不在 `METHOD_SCOPES` 表里的方法一律拒绝；`models.list` 只返回模型名，不外发服务商配置。

## 对话的工具与审批

- 一轮对话由主进程建 pi 宿主会话（`browser-companion/run-driver.ts`），`hostToolsOnly`：pi 自带的 read/edit/write/bash 等一律不启用（`restrictToHostTools`），对话上下文来自不可信网页。
- 工具 = 扩展的页面工具（`read_page`、`get_annotations`，经同一连接反向请求 `page.tool`）+ 授予 `tools` 时向主窗口要的应用工具清单与 Skills 清单（`browser-bridge:tool-catalog`，与桌面对话 `getToolRegistryAgentTools` 同口径）；应用工具由主窗口渲染端的工具桥执行，没有主窗口时不可用。
- 审批跟随桌面的工具权限模式（手动 / 自动允许编辑 / 跳过确认）；等待项（审批、ask-question）经 `ai.run.event` 的 interactions 推给扩展，扩展经 `ai.run.approve` / `ai.run.answer` 提交。

## 消息渲染

- 扩展的对话与桌面同一套 `@tau/chat-ui`：`MessageView`（消息、思考、工具行按内容块原序）、`ToolCallBlock` / `ToolCallRow`、`MarkdownRenderer`（含代码块、公式、内容引用）、审批条 `ToolApprovalBar` 与提问卡（`src/interactions/`）。扩展从 `@tau/chat-ui/conversation` 引入，不带聊天容器与 `@tau/shared` 主入口。
- 交互件经 `configureToolInteractions` 登记的宿主读写等待项：桌面是 `desktopToolInteractionHost`（pi 会话交互快照），扩展是 `content/state/interactions.ts`（本页对话的等待项，按 toolCallId 对应）。
- 桌面专用的工具卡片（待办、日程、知识检索、改稿提案、插件自定义卡片）依赖桌面能力，扩展里退回通用工具行，行尾「在 Tau 中查看」经 `chat.open` 打开桌面的只读页 `browser-chat`（`features/browser-companion/pages/`），用桌面 `MessageItem` 呈现完整卡片。
- 内容脚本体积：代码高亮换成只带常用语言的 PrismLight（`src/content/prism-light.ts`，经别名接管）；KaTeX 字体作为扩展资源（`web_accessible_resources`），`@font-face` 注入页面文档。

## 数据

- 标注 = `excerpt` 表 `source_type = 'web'` 的摘录，`source_key` 为去掉 hash 的 URL。页面索引 = `web_page` 表（每页一行：域名、网页标题 `page_title`、用户起的名 `custom_title`）；显示名 = `custom_title` 否则 `page_title`，`annotations.sync` 先记网页标题再以显示名写该页摘录的 `source_title`，改名时同步改写，Tau 里其余读 `source_title` 的地方（搜索、脉络、移动端）直接读到显示名；`note.save` 的来源段同样用显示名。`annotations.sync` 是整页快照语义（`ExcerptTable.syncSource` 按 external_id diff），写后补发 `excerpt:sync-web-page` 写事件，索引与脉络随之刷新。锚点为 `{quote:{exact,prefix,suffix}, position:{start,end}}`，颜色只收编辑器行内色板的五个色相 id（yellow/green/blue/purple/red）。
- 页面笔记 = 扩展本机按页保存的草稿（Tau 编辑器的原生节点，`note:<页面键>`）；`note.save` 把节点交给 Tau（主进程 `assertContentNodes` 校验、2 MB 上限），新建一张卡片，正文末尾附「来源：<网页标题>」链接段落。
- 对话 = 按页面存放的 pi 会话文件（`browser-sessions/<页面键>/`），`chat.history` 取该页最近一段；一轮运行走 v2 协议（`ai.run.start` 立即返回，事件经 `ai.run.event` 只推给发起的连接）。
- 扩展离线时标注照常写本机并记待同步，就绪后按页补发；Tau 是真相源，连上后以 Tau 为准重载。

## 页内实现要点

- 高亮用 CSS Custom Highlight API（不改页面 DOM）；`::highlight` 样式注入页面文档，命中靠 `caretPositionFromPoint` 比对 Range。
- 锚定：先按偏移精确核对，失败在全文按原文查找、以前后文相似度挑选；DOM 变化（800ms 防抖）与 URL 变化时重锚，找不到的标注标为「页面上找不到这段原文」而不删除。
- 正文提取：`article` / `main` 里文字最多的容器，取最内层段落级块按序编号；对话的 `[n]` 引用回链第 n 段。
- 样式：Tailwind v4 + `@tau/themes` 的 `tokens.css` 内联进 shadow root（`:root` 改写为 `:host`、rem 换算 px，`@property` 另注入页面文档）；主题族与明暗跟随 Tau（未连接时暖纸 + 系统明暗）。
- 页面笔记页签是扩展自己的页面 `note.html`（iframe，`web_accessible_resources`；伴读库的笔记抽屉嵌的是同一个页面）：Tau 编辑器在独立文档里运行（选区读取与浮层按普通页面工作，不受网页与 Shadow DOM 影响），只在打开该页签时加载。组件为基础集：段落、标题、列表与待办、引用、代码块、链接、分割线、行内格式与着色、下划线，斜杠菜单与格式工具条，粘贴 Markdown 自动转换（`src/note/kit.ts`）。草稿只由笔记页写入；内容脚本的摘录与「存为笔记」往待追加队列 `note-pending:<页面键>` 放 Markdown，笔记页转换成节点接到末尾。笔记页写草稿或存卡片时顺带记 `note-meta:<页面键>`（页面标题与时间），供伴读库的笔记汇总；连接状态与主题经后台写入的 `companion.status` 读取。
- 扩展页面经 `runtime.sendMessage`（`page-rpc`）调后台；后台按发送方页面路径（`extensionPageOf`：`/note.html`、`/library.html`）只放行各自白名单里的方法（`EXTENSION_PAGE_METHODS`），内容脚本与别的扩展页面一律拒绝。
- Esc 仲裁：页内浮层自建 LIFO 栈，无浮层时不拦截网页的 Esc；`⌥J`（manifest `commands`）与工具栏按钮切换面板。

## 伴读库

- 入口：面板 ⋯ 菜单「在伴读库中查看本页」（带上页面键 `library.html?page=`）、快捷键 `⌥⇧J`（manifest `commands` 的 `open-library`）。后台 `LibraryTab` 记住打开过的标签页，再次打开时切过去，关掉了就新开。
- 视图：页面（列表 + 详情）、全部标注（跨页按时间倒序）、笔记（本机草稿与已存卡片）；左栏按站点筛选。数据走 react-query：页面、站点、全部标注由 Tau 分页给出（`library.*`，每次至多 100 条，按 `web_page` LEFT JOIN 摘录聚合；只列还有标注或改过名的页面，只有本机笔记的页面由扩展在列表加载完后接在末尾「只有笔记」组）；单页标注经后台 `annotations.load`（与内容脚本同一份缓存与发件箱）。没有标题的页面显示「域名 + 路径」。
- 改名：点详情标题就地改，回车保存、Esc 取消、清空恢复网页标题；`library.rename` 写 `web_page.custom_title`（页面还没记录时新建，只有笔记的页面也能改名）并改写该页摘录的 `source_title`，补发摘录写事件；`note.save` 同样记下页面。
- 离线：页面列表、详情与全部标注退回本机 `ann:*` 缓存（只含在这个浏览器里看过的页面，同口径筛选排序），不能改名；站点筛选要连上 Tau。本机笔记与缓存随 `chrome.storage` 变化失效重取。
- 不在伴读库里删标注：打开着该页的标签页会以内存里的快照写回。
