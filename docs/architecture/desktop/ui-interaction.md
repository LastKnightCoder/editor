# UI 风格与交互规范

> 视觉基准、样式载体与交互定案；token 词表见 [design-system.md](/docs/architecture/design-system.md)。

## UI 风格铁律（A2 校准结论，评审对照）

> **视觉基准与样式载体**：视觉基准 = `mockups/direction-a-soft.html`（A2 柔和版）+ `mockups/home-final.html`（今日页定稿），**降级为参考物**（浏览器打开对照截图），不再是导出源；调视觉直接改组件里的 Tailwind 类。样式载体 = **Tailwind v4 工具类优先**，组件 className 语义化、就地可读；跨域视觉模式抽 `packages/ui/src/primitives/` 组件。CSS 仅保留四类白名单（逐例裁决、默认不许）：① `app/base.css` 的根基础规则与 `.app` reset；② `@keyframes`（经 `tokens.css` 的 `--animate-*` 消费）；③ `tokens.css` 主题数据块；④ Tailwind 表达不了的复杂伪元素/全局状态（现存唯一实例：home.css 的 edge-fade mask + page 根高度链）。原"模板类名 1:1 / 禁手改 shell.css / 先改模板再导出"工作流已废弃（导出脚本从未入库，不可复现）；shell.css/stats.css 已删除，约 90 个无消费者的预置模板类不迁移，将来做对应页面时用 Tailwind 语义类重写。

1. **融合骨架**：侧栏透明融于 bg-page、整高贯通窗口；标题栏/状态栏只属于右列；不出现横贯全宽的条。壳层根底下垫极光背景层（`app/AuroraBackdrop.tsx`）：四团径向渐变色块取主题 `glow-1..3`（中心只到七成浓度、彼此错开，侧栏头部不压在峰值上；开启时侧栏组头由 ink-3 升为 ink-2），只从侧栏、标题栏与大卡四周留白透出；页面大卡与插件保持实底、无需配合。开关与动态效果在 `appearance.backdrop`（缺省开启），动画只改 transform，窗口隐藏时暂停，`prefers-reduced-motion` 时静止。数据库连接启动屏的内容须用 `col-span-full` 横跨壳层全部列并居中；Loading 使用 `minHeight={0}` 与 `h-auto`，只显示「正在连接数据库…」，历史迁移退役后不再显示备份与迁移说明。
2. **零横线**：分组靠底色容器（bg-surface 圆角面板 + shadow-card）与留白；禁止用 border 分隔区块（border 只允许 ≤2px 控件级细节，如勾选圈）。
3. **宽度利用**：内容区 max-w 1680 宽容器；窄列只允许出现在正文阅读列（~72ch）；详情页用双栏（正文+信息栏）。PDF 阅读页不设工作区最大宽度，铺满壳层可用空间并保留边缘留白，纸张尺寸由阅读器缩放控制。
4. **反馈语言**：hover = bg-hover 淡墨底；**激活（侧栏）= bg-selected（accent 叠层）+ 左缘 3px accent 竖标**；浮起（卡片）= shadow-card，卡片 hover = shadow-lift 轻抬（2026-09-23 校准：不借用 float 浮层档——40px 大模糊在卡片上又大又重；shadow-float 只给 Menu/Dialog 等真浮层；shadow-paper 只给白板上浮起的文档纸——贴边细描线 + 接触影 + 远投影，与贴在画布上的富文本、图形拉开层次）；按钮无描边。注意：`hover:` 变体已用 `@custom-variant hover (&:hover)` 去掉 v4 默认的 `@media (hover: hover)` 包裹——否则触摸屏设备（hover:none 判定）会静默杀掉全应用 hover 反馈。
5. **圆角**：面板/卡片 var(--tau-radius-lg)=16，控件 md=12，小元素 sm=8。
6. **数字** tabular-nums；字号体系以模板为准（25/14/13.5/12.5/11.5）。
7. **滚动条**：不出现系统滚动条——4px 细墨条仅在「活跃」时显形（hover 滚动容器或滚动中；停止 700ms 且鼠标不在时隐藏，移出窗口立即隐藏）。实现 = `base.css` 的 `.app` 作用域样式（`scrollbar-live` 类控制 thumb）+ `@tau/ui` 的 initScrollbarAutoHide 事件委托（AppShell 初始化一次，全部内部滚动区自动生效）。**位置**：细条画在滚动容器 border-box 的右缘，容器满宽时它就贴死窗口右缘——用 `-mr/pr` 借位把 border-box 撑进容器自身的右留白（内容盒右缘因此不动、与相邻列仍对齐），细条落进留白里；home-scroll 与样板间内容列同为 `-mr-6 pr-6`，离窗口右缘 16px。两个坑别踩：① 禁止改回 `:hover` 伪类驱动——Chromium 滚动条伪元素不随 `:hover` 重算，显形后会冻结不消失；② 旧 main.less 已删除，滚动条唯一规则归公共 UI；避免重复定义不同名的阴影属性留下常显残影。
8. **className 覆盖必须走 ****`cn()`******：组件默认样式要让调用方覆盖（`IconButton` 的 `size-[27px]`、样板间 `MatrixRow` 的 `trayClassName="items-center"`）时，合并一律用 `@tau/ui` 的 `cn()` 而非裸 clsx——Tailwind 同属性工具类的胜负由生成顺序决定，clsx 的先后顺序无效，覆盖会静默失效。项目自有尺度词（`text-tau-*`/`rounded-tau-*`/`shadow-card`/`ease-tau-out` 等）已在 cn 内登记；新增尺度 token 必须同步登记（`packages/ui/src/__tests__/cn.test.ts` 守护与 `tokens.css` 一致）。
9. **主题注册与归属**：新主题用 `defineTheme` 声明（tokens 全键强制，协议见 [design-system](/docs/architecture/design-system.md) §2），且必须同步在 `tokens.css` 补 `[data-theme="<key>"]` 数据块——`theme-parity.test.ts` 守护二者一致（含 AA 对比度断言），codegen 落地后改为生成。主题唯一归属 `@tau/themes`（契约与主题定义走根入口，React 运行时走 `@tau/themes/react`，CSS 走 `@tau/themes/tokens.css` + `tailwind.css`）；`@tau/ui/theme*` 已删除且 Oxlint 禁止；业务代码禁止自行操作 data-theme；首帧脚本由共享解析器生成，不维护 HTML 白名单。新增颜色语义 token 词汇必须先进 `packages/themes/src/tokenContract.ts`（单一事实源）。

## 交互规范（已定案）

- 命令面板选中状态按实际查询/筛选和结果行身份更新，不以临时数组引用作为重置条件；插件命令快照随宿主修订刷新。鼠标悬停只改变高亮，键盘上下键负责把选中行滚入视口，避免点击前列表跳回顶部。

- 页面经 `usePageBreadcrumb(key, node)` 注入标题栏面包屑；仅活动页的槽位显示，卸载自动清理，node 经 useMemo 稳定化，传 null 回到默认 label。Titlebar 为可交互内容加 `app-region-no-drag`。底部信息由页面自身布局承载，壳层不提供状态栏槽位。
- 右侧辅助栏：壳层在正文右侧提供一张可开合的纸（`app/AssistDock.tsx`），承载 `app/assistViews.ts` 登记的视图，同一时刻显示一个。视图在 `features/<域>/assist/*.assist.tsx` 里调用 `defineAssistView({ id, label, component, keepAlive?, hiddenOn? })`，由 `src/assist-views.ts` glob 收集；内置 `chat`（保活）、`web`（关闭即卸载）与 `plugin-page`（被网页覆盖时保活，关闭或注销时释放）。状态在 shellStore：`assistView` 是当前视图，`assistCovered` 是被临时视图盖住的那个（最多一个），`showAssist(id)` 直接显示、`showAssistOver(id)` 临时盖住（当前已是它则只换内容）、`closeAssist(id?)` 关闭并回到被盖住的视图、`hideAssist()` 整栏收起；重启只恢复对话是否开着。`assistExpanded` 让同一个栏节点盖住正文区（正文页 invisible 不卸载），换页、Esc、标题栏后退与 Alt+← 先收回；放大不进 Page 栈。开合对话 = 标题栏按钮 / `Ctrl+J` / 命令面板，宽度 360–560 持久化在 shellStore。拖宽期间，栏内视图设为 inert，左缘手柄保持指针捕获；拖动结束即恢复视图交互。空间不足时由 `assistLayout.ts` 先自动收起侧栏（关闭时还原，用户手动切侧栏即接管）、再退化为覆盖浮层（Esc 退场）。页面本身就是对话时（`chat` 在栈顶）隐藏。页面不要自行在右侧再造常驻栏——例外是「这份内容专属的会话」：页面用 `app/assistOwner.ts` 的 `useOwnAssist(pageKey, owner)` 接管开关，Ctrl/⌘+J 与命令面板「AI 对话」改为开合页面自己的栏，标题栏按钮与停靠栏在该页隐藏；不要自己监听 Ctrl/⌘+J。进入页面收起全局侧栏用 `app/useSidebarCollapsedWhile(active)`（离开 / 保活隐藏即还原）。
- 右栏网页：主窗口里正文链接（`IOpenerService`）、对话 Markdown 链接和数据表格链接单元格的「在应用内打开」经 `features/web/openInDock.ts` 的 `openWebInDock(url)` 进右栏；非 http(s) 或独立窗口交给系统浏览器。主窗口中支持右栏的链接用 `data-web-link` 标出地址，Ctrl + 主键点击由壳层在捕获阶段直达系统浏览器。网页内的 Ctrl + 点击使用 Chromium 的原生链接目标与导航意图，普通右键和中键保留原有处理。`WebDock` 用 `persist:web-dock` 分区的单个 `<webview>`，再次打开只 `loadURL` 不重建；主进程 `windows/web-dock-guest.ts` 在 `will-attach-webview` 剥掉 preload、强制沙箱、只放行 http(s)，页内弹窗在同一网页打开，保留表单正文与来源策略。设备权限默认拒绝。HTTP(S) 下载交给系统浏览器，Blob 与 data 下载由原会话保存。网页内的 Esc 经所属窗口交给浮层退场栈；切库时释放临时网页请求与返回目标。栏头左侧在盖住其他视图时显示「‹ 对话」返回。PDF 和视频笔记的专属对话在网页打开期间保持挂载并让出宽度，返回入口绑定发起时的页面实例。完整网页页 `webview` 仍承载本地文件与项目网页入口，与右栏分开。
- 快捷对话：主窗口的 Ctrl/⌘+Shift+J 在底部聚焦独立草稿。页面接管者提供文档作用域、工具和展示新会话的回调；普通页面在右栏打开主对话，完整对话页原位选中新会话。首条消息进入会话即交给相应面板展示，回答由对话运行时继续处理。
- 对话 UI：消息 / 思考 / 工具调用 / 代码块 / markdown 排版在 `@tau/chat-ui`（`components/Message/`），输入框的 ＋ 面板、上下文用量环、工具行 chip 在 `@tau/shared`（`components/ChatComposer/`），桌面与浏览器扩展共用；桌面 `src/components/ChatUI` 只放依赖桌面能力的部分（接上确认条的 `ToolCallBlock`、markdown 代码与链接渲染 `useChatMarkdownComponents`），对话页、停靠栏、项目 / PDF / 视频笔记 / 内联 AI 共用；工具 renderer 的唯一契约与登记表经 `@tau/chat-ui/renderers` 消费，不在 shared 或桌面另建类型与注册对象。shared 只保留消息模型、展示归约、输入控件与输入框部件。过程信息（思考、工具调用）一律用 `FoldRow` 折叠行，视觉轻于正文；工具渲染器用 `@tau/chat-ui` 的 ToolCard 等公共件（`src/components/ToolCard/`）（line-1 内框、不投影、零横线），颜色只走语义类，`isDark` 形参保留但不参与取色；代码高亮用 `tauPrismTheme`（引用 `--tau-*`，随主题切换）。
- 聊天引用：正文里的行内引用 `chat-ref`（只存会话 id、该轮用户消息 entry id 与标题/轮次快照）与摘录块 `chat-quote`（用 `quoteText` 存原文快照，另存模型），宿主扩展在 `editor-extensions/chat-ref/`，持久化声明并入 `element-definitions.ts` 的 `host.chat-ref`。只引用主对话：`ChatContainer` 在 `main-chat` 且会话已落盘时给 `MessageItem` 传 `getChatRef`，消息动作行出现「引用到正文」（按下时记下本消息内的选区，作摘录原文）。插入目标是本窗口最近聚焦的可写正文：`ContentEditor` 聚焦时经 `bindActiveEditingSessionEditor` 把编辑器实例登记到 active-editor-session（不进 AI 快照），`getActiveEditingTarget` 取用；没有可写正文时改为复制 `tau://chat/<sessionId>?entry=<entryId>`，粘回段落时由 ingest 认领并跟踪选区，取到标题与轮次后一起写入同一次撤销。跨块选区交给默认粘贴。悬停预览的问答共用停靠栏的 Markdown 渲染器和桌面代码、链接组件，摘录在解析后的文本中高亮。预览按发起时的资料库经主进程 `pi-session:turn` 调用工作线程。线程按文件指纹复用最近的会话索引、当前分支和最多四条旧分支的投影。旧轮次沿该轮最近写入的后代读取，删除返回 null。打开 = `openChatInDock(sessionId, { entry })`：`useDockEntryStore` 记一次性意图，停靠栏在目标会话历史就绪后经 `ChatContainer` 的 `useChatEntryLocation` 定位并短暂铺底，优先于默认滚动恢复。只消费对应的定位请求。独立窗口只预览不打开；协作者视角不查询本地对话。Markdown 行内导出为 `:chat-ref[…]{session entry title turn}`（导入还原），摘录导出为引用块加来源行；博客 `@tau/blog` 渲染为不可点的出处文字与引文块。
- 导航：栈 + forward buffer（push 清空 forward）；`Alt+←/→` 后退/前进；`Esc` 只承担浮层退场（PageProvider 的 `useOverlayDismiss` 注册表，LIFO，**优先于编辑上下文**），无浮层时无操作——「Esc=后退」已于 2026-09-20 用户裁决移除（详情页误触即整页回退丢编辑上下文），后退由 Alt+←/→ 与标题栏按钮承担。
- 编辑器源码全屏、行内公式、图片预览与网络地址弹窗经 `@tau/editor/api` 的 `OverlayBackDismiss` 接宿主服务，`DesktopEditorOverlayDismiss` 在当前 PageProvider 上登记 Esc 退场；服务对象稳定，关闭、卸载和 Activity 隐藏注销。媒体根 UI 由扩展 layers 挂载，readOnly 由核心传入，store 按 editor 归属及清理。适配 Layer 不渲染浮层、不新增监听或页面栈；无 Page 上下文不登记，保留关闭按钮与局部焦点链。此接线不代表全部编辑器浮层已迁移，也不取代设计系统控件的焦点链关闭。
- 设置页：壳层浮层与命令面板同族——AppShell 挂载，`fixed inset-0 z-[90]` 铺满窗口（低于命令面板 100，设置页内仍可 Ctrl+K；子页 Dialog/Select 层级更高），自带窗口控制（mac 信号灯在设置侧栏头部、Win/Linux 三键在右栏标题栏区）与拖拽区；打开期间 `useFindOwner` 吞掉 Ctrl/⌘+F（不对被遮住的页面做页内查找）、开闭态在 `app/settingsStore.ts`（features 域互引 store 禁令）、Esc 走注册表、关闭还焦、`Ctrl+,` 全局 toggle；入口 = Sidebar 底部（navigation.ts `opensOverlay` 标记，浮层入口不 push 不显激活态）+ 命令面板 `open-settings` 动作。分区导航/子页映射单源在 `features/settings/sections.tsx`（改这里=改设置导航，勿在容器组件里散写条目）；子页即时保存、无应答区；新增设置子页 = sections.tsx 登记条目 + `sections/` 下建组件（未设计的用 PendingSection 占位）。
- 反馈窗口：独立的单例置顶小窗（路由 `/feedback`，`windows/utility-windows.ts` 的 `showFeedbackWindow`），不是壳层浮层——用户要一边操作主窗口复现问题一边截图。入口 = Sidebar 底部（navigation.ts `opensWindow: "feedback"`，与 `opensOverlay` 同为不 push、无激活态）+ 命令面板 `send-feedback` / `capture-feedback`（后者先截发起窗口）+ 托盘菜单；三者都经 `commands/feedback.ts` 的 `openFeedbackWindow` 并带上当前页面 key。截图走主进程 `webContents.capturePage()`（只截所选 Tau 窗口自身，不需屏幕录制权限），打码/框选在渲染端 OffscreenCanvas 涂进图片后压成 WebP；提交、日志收集与匿名凭证只在主进程 `modules/app-feedback.ts`。`ErrorState` 在 Electron 下于「技术详情」行提供「发送错误报告」（附错误详情、环境与本次运行日志，同一错误重试复用请求 ID），因此三层错误兜底都自带上报入口。协议见 `apps/plugin-portal/docs/协议.md`「桌面端用户反馈（0010）」。
- 反馈模块初始化只注册 IPC。反馈、番茄小窗和沉浸窗均在首次唤起时创建，各自的组件与共用的轻量窗口入口并行加载。内容提交后显示，关闭后隐藏复用。关闭请求经 `app-feedback:close-requested` 交给渲染端：未发送内容仍需确认，确认放弃或关闭成功页后清空表单并经 `app-feedback:hide` 隐藏复用、还原标注尺寸；应用退出才销毁，隐藏最后一个可见窗口仍遵循后台保活偏好。首次显示时决定锚点位置，环境信息和日志大小在窗口重新聚焦时刷新；正文计数只保留 Textarea 内置的一处。
- Ctrl/⌘+F 归全局页内查找条 `GlobalFindBar`（document 捕获阶段拦截）。自带查找界面的页面或浮层用 `useFindOwner(open, active)` 接管；复用查找条但由页面提供全文命中与定位的场景用 `useFindSource(source)`。两者共用 `components/GlobalFindBar/findOwner.ts` 的 LIFO 仲裁，后打开的浮层优先；业务不得自行监听 Ctrl/⌘+F。
- 键盘仲裁收口在框架层（PageProvider/Titlebar 的全局监听），业务代码禁止自行监听这些键；两处都已让位编辑上下文（输入框/文本域/contentEditable，`page/dom.ts`）与输入法组合（`e.isComposing`）。
- 栈操作为 action 式 reducer（连续导航由 React 串行归约，不丢更新）；注册表（pageMeta/组件 registry/defineTheme）重复注册策略统一为 dev 覆盖+warn（HMR 兼容）、prod 抛错（真冲突）。
- 后退/前进按钮：**禁用而非隐藏**（面包屑旁，Titlebar）。
- 侧栏：拖宽（130–340，持久化，窄态长标签 truncate 省略）+ 折叠（58px 图标列；折叠按钮同位镜像反转 `»↔«`；双击拖宽条也可折叠）；**拖宽条跨阈值切换展开/收起**（业界通行语义：收起态拉宽 ≥130 即展开且宽度即时跟随鼠标、展开态拖窄 ≤110 即收起，20px 迟滞防边界抖动；收起态未过阈值的拖拽不落宽度，保留展开记忆宽；拖拽中经 `resizing` prop 关宽度过渡、pointer capture 保证拖出窗口不丢事件，见 `AppShell.tsx` 的 SidebarResizer）；**导航组头可点击折叠收纳**（chevron 旋转 + grid-rows 过渡 + 折叠处显条目数，`shellStore.navSectionCollapsed` 持久化，方案来源 mockups/sidebar-responsive 方案二；图标列态无组头不受影响）；导航列表滚动带**边缘渐隐**（`base.css` 的 `.edge-fade-scroll` 通用类 + `useEdgeFade` hook；home-scroll 的 mask 协议已抽通用）；**壳层根允许按视口收缩**，横向溢出由主区 `overflow-x-hidden` 截断；窗口的最小尺寸由主进程按缩放比例维护，渲染层不要再用固定 `min-width` 撑宽页面。Mac 自绘信号灯在侧栏头部（`isMac` 条件渲染，`WindowControls.tsx` 的 `MacTrafficLights`——原生信号灯已被主进程移出屏幕，自绘可点击、命令走 IPC；**全屏下隐藏**，状态经 `app/useFullScreen`（`platform.window.onFullScreenChange`）订阅）；Windows/Linux 三键 `isWinOrLinux` 条件渲染。
- 拖拽区（`app-region-drag`，Titlebar/侧栏头部）内的一切可交互元素必须加 `app-region-no-drag`——Electron 会吞掉 drag 区的鼠标事件（侧栏折叠按钮曾因此点击失效）；页面级加载态统一用 `ui/primitives/Loading`（Spinner 可单独行内用）。
- 保活：`<Activity>`（React 有效版本为 19.2.0，由 pnpm-workspace.yaml overrides 统一；使用 Activity，无降级路径），LRU 上限 12；激活页包装为 `flow-root h-full`（非激活 `display:none`）：h-full 打通视图根高度链，flow-root 建立 BFC 兜住视图根外边距——视图根写 `mt-*` 不会折叠出包装、撑出壳层 main 的滚动条（`page/__tests__/pageHostLayout.test.tsx` 守护）。视图根外距仍首选 `h-full` + padding，避免 margin + `calc` 手算高度；
- 图标：**lucide-react**（线性，stroke 1.75，`navigation.ts` 直接引用 LucideIcon 组件）；多色图标用 **react-icons**（桌面已有依赖）；
- 侧栏条目以 app/navigation.ts 为准（21 个主导航条目及设置入口）；页面迁移已完成，订阅入口已退役。
- tsc 全绿。挂载：主窗口 `/` 默认重定向 `/shell`（旧主界面已退役，根路径重定向仍待收尾）。

### 共享元素形变

- 默认页面切换即时、无转场；只有「同一个对象在新旧两处都出现」时才做形变（`page/morph.ts`，原生 View Transitions API，不用 React `<ViewTransition>`）。
- 元素用 `data-morph-key="<对象 key>"` 声明自己代表谁（卡片是 `features/cards/morph.ts` 的 `cardMorphKey`）。运行时只在转场时给一对元素临时挂名（`page-morph`），不要自己写 `view-transition-name`；样式在 `app/base.css`，与对话页 ⇄ 停靠栏的 `assist-chat` 共用一组规则。
- 业务发起的变化（打开浮层、push 新页）调 `morph({ from, update, to })`：`from` 是旧画面的元素，`update` 里同步改状态 / 导航（运行时 flushSync），`to` 返回新画面的元素，未就绪返回 null，最多等 400ms。找元素用 `queryActivePageMorph(key)`（当前激活页内）或 `queryMorphElement(scope, key)`。源元素缺失、目标超时或不在视口时自动退化（直接切换 / 源元素淡出），调用侧不用判断。
- **转场里不能等慢资源**：更新回调期间画面冻结，`to` 等待的应是「数据已在缓存、一两次提交内就能渲染」的目标。正文会话这类慢资源加载期间直接显示 `Loading`，必要时悬停预取数据；不要让目标等到编辑器初始化才出现，否则点击会卡顿，超时还会退化成淡出。
- 后退 / 前进由 PageProvider 统一处理：当前页和保活中的目标页都有同 key 元素才形变，业务不要为此监听后退键。新页（未挂载）的 push 只能由业务发起。
- 新画面截图是实时的：转场期间目标页的任何重排都会被播出来。保活页恢复显示时 Activity 会重跑全部 effect（含 layout effect），「某值变化时做 X」的 effect 必须比对上次的值，不能把重跑当成变化（滚动归零用 `hooks/useScrollTopOnChange`）。
- 转场期间根元素带 `data-morph`，更新回调执行时 rAF 不触发。靠 rAF 或 CSS 过渡播入场的浮层必须用 `[[data-morph]_&]` 变体直接渲染终态，否则会被截成透明或半途态（Dialog、AssistDock 已接）。
- 只有一个旧状态时用 `startPageTransition(update)`（不配对，如 `app/assistMorph.ts` 的静态命名）；嵌套在另一次转场的 update 里发起的转场直接执行，不会互相打断。
- 形式：`page-morph` 是放大缩小（新旧截图按容器宽度等比缩放、顶边对齐，超出的高度裁掉；不用 cover，宽高比悬殊时会剧烈缩放滑动。380ms，旧图 180ms 先淡出）；`assist-chat` 是容器裁切、内容不缩放。新场景按语义选用，不要再造第三套。
- 已接入：卡片墙条目卡 / 置顶横卡 / 列表行 ⇄ 预览弹窗（`CardPreviewDialog` 的 `ref` 指向卡体，`data-state="open"` 即就绪）⇄ 详情页的纸；卡面「进入详情」直接由卡形变到纸；详情页后退缩回原卡。表格视图不形变。卡面悬停经 `actions.onPrefetch` 预取单卡全文；弹窗与详情页的正文在会话就绪前显示 `Loading`。文章：网格卡 / 列表行 ⇄ 详情页的纸（`features/articles/morph.ts`），纸面在文章读到后声明 key，正文会话就绪前显示 `Loading`。

### Button 使用边界

- 变体六档是一个动作的全部音量：primary（accent 实心，**每屏至多一枚**，层级是评审纪律不进 API）/ secondary（surface 亮底 + 描边，取消与表单的默认档，即原 ConfirmDialog 应答区皮）/ soft（accent-soft 平底，工具栏次级强调）/ ghost（无底 hover 淡墨，与 IconButton 同反馈语言）/ danger（确认位实心红）/ danger-soft（列表与工具栏位）；danger 两档对齐 ConfirmDialog 的危险分级。
- `loading` 是内建语义：aria-busy + Spinner + `loadingText` 文案切换 + 一并 disabled（原生属性封锁指针与 Tab 队列）；Spinner 替换左位图标，不与 `icon` 同时显示；调用方不再手动拼 Spinner（ConfirmDialog 已迁移）。
- 图标仅左位 16px（`icon={Plus}`，lucide stroke 1.75）；icon-only 一律 IconButton，Button 不设该档；`block` 满宽给空态 CTA；type 默认 "button"，form 提交位显式传 submit。
- antd 迁移映射：type=primary → variant="primary"；type=default → "secondary"；type=text → "ghost"；danger 布尔 → "danger"/"danger-soft"（按确认位/列表位分档）；type=link 是文字链语义，不建变体。

### Menu / ContextMenu 使用边界

- 项目文档详情采用外层滚动结构：标题、时间与正文一起滚动；右侧目录初始与标题顶部齐平，`sticky top-5` 与外层 `pt-5` 同为 20px，滚动即保持吸附位置。滚动容器包住正文和目录，滚动条位于目录右侧、距内容区右缘 16px，并接 `useEdgeFade`。编辑区保留 `@container/editor` 宽度查询，目录通过 `ResizeObserver` 读取正文滚动容器的 `clientHeight`，高度上限为该值减 40px（上下各留 20px），不启用会影响宿主尺寸计算的双轴 size containment，超长目录经 `overflow-y-auto` 独立滚动并接 `useEdgeFade`，`overscroll-y-contain` 避免触边后带动正文。文章与项目共用 `src/components/ContentOutline/`（标题提取、实时编辑器锚点解析、点击定位与滚动高亮；条目单行省略，仅截断时悬停出全文 Tooltip）；项目内容区不足 960px 时隐藏目录；正文没有标题条目时不渲染目录容器，也不保留目录列，正文按 720px 最大宽度单栏居中。旧 EditorOutline / Outline 的最后消费者已迁移并删除；网页项目条目也使用 ContentOutline。Markdown 文件窗口（/markdown-window）同样复用该组件：大纲贴正文右缘常驻（sheet 实测内宽 ≥ 版心 800/1040 + 240 才切三列 grid，正文列让位，大纲列至少 208px），不够宽时降级为标题栏 ListTree 按钮 + Popover（240px）；大纲超高时独立滚动（上限 = 正文滚动容器高 − 40px，ResizeObserver 实测，`overscroll-y-contain` 触边不带动正文，接 `useEdgeFade`）；左栏只留文件树，「文件/大纲」页签已移除，侧栏经 ResizeHandle 拖宽 200–400（默认 264），大纲开合与宽度持久化在 markdownWindowPrefs。字数在文档标题下的信息行展示，随正文滚动；协作与沉浸入口仍由左侧文档更多菜单承载。

- Menu 触发器优先使用原生 `button type="button"`，保证键盘可达及菜单关闭后的焦点归还。
- Menu、子菜单与 ContextMenu 默认按内容自适应宽度，最小宽度为 160px；上限为 320px 且不超过视口减去两侧各 8px，长标签省略。需要固定宽度时通过浮层 `className`（如 `w-[280px]`）覆盖。
- 菜单外壳承载圆角、边框和四周 6px 留白，内部列表独立滚动并保留右内边距 6px，使滚动条与左侧高亮区域、右侧边框内缘各隔 6px，避免贴边与侵入上下圆角；默认整体高度上限 300px，`className` 可覆盖；`fit` 让主层与各级子层上限放到视口高度（画布右键菜单用）。样板间「长菜单与滚动留白」覆盖主菜单、子菜单与右键菜单。
- Menu 使用复合组件声明命令、开关、单选组和子菜单；命令项关闭整树，checkbox/radio 保持打开。`Menu.Submenu disabled` 禁止鼠标与键盘展开，已展开的头项再次点击收起并还焦父层。
- `Menu.className` 与 `ContextMenu.className` 都控制浮层；ContextMenu 的内容区采用 `display:contents` 包裹，宽度等布局类应放在 children 的真实元素上。
- `useMenuTree` 统一整树关闭、外点判定与跨实例互斥。Esc/左方向键按层收起；任意层 Tab/Shift+Tab 关闭整树，还焦触发位置后由浏览器继续移动焦点。子层键盘事件不会重复驱动父层。
- type-ahead 读取声明树中直接可见的文本，不解析自定义组件的渲染结果；需要按文本导航时应直接传文本标签。

### Dialog / ConfirmDialog 使用边界

- Dialog 是模态决策容器（三段固定：标题/徽标 + 正文 + 影响行/应答区），footer 按钮序列由调用方提供（主按钮恒在最右）；ConfirmDialog 是确认语义预设——`danger`（焦点落取消）与 `typeToConfirm`（输入解锁，只给真·不可逆）两档内建。家族分工：Menu 不做确认，确认归 ConfirmDialog、撤销归 Toast。
- 关闭矩阵：`dismissible`（默认，×/Esc/遮罩可关）/ `critical`（无 ×、遮罩与 Esc 抖动拒绝）/ `locked`（异步 loading 封锁一切）。Esc 仅 open 态在卡片 DOM 消费（焦点链 LIFO，不进浮层注册表——同 Select/Menu 口径，ui 不反向依赖 page/）；打开即 Tab 圈闭、关闭归还触发元素焦点。
- Dialog 内通过公共 `PortalScope` 提供局部浮层挂载点，位于当前遮罩内部、正文滚动区外；Select/Menu/字段编辑器等继承该挂载点，避免被遮罩盖住或被正文裁切，业务无需自行提高 z-index。
- 初始焦点落卡片内 `data-autofocus` 元素（无则卡片自身）——表单放首输入框，danger 放取消按钮；ConfirmDialog 自动标记。Enter 默认应答只在 ConfirmDialog 内建（焦点在按钮上走原生）。
- `onAfterClose` 在退场完成、子树卸载后触发；需要清空内容或草稿时使用此回调，关闭请求只改变 open。退场期间重新打开会取消本轮关闭回调。
- 宿主页面被 Activity 保活停驻时（「关弹窗 + push」同批提交，或弹窗开着直接侧栏导航）：退场 effect 停驻、卸载定时器被清，而 portal 挂在页面外不随 `display:none` 隐藏。Dialog 内建渲染期短路兜底——动画类由 `open && contentReady && shown` 派生，`!visible` 时遮罩 `opacity-0 + pointer-events-none`，冻结残骸不可见不可点；页面重新激活后 effect 补跑完成卸载与 `onAfterClose`。新写浮层组件若也用 effect 管退场，须遵守同一口径（回归测试见 `Dialog.test.tsx`「Activity 保活停驻」用例）。
- `contentReady={false}` 可提前隐藏挂载异步内容，期间不接管焦点、不锁滚动、不可交互；内容就绪后设为 true，再显示完整弹窗。加载失败也必须放行展示错误，避免一直隐藏。
- 卡体带 `data-state="open|closed"`（open = `open && contentReady`），供共享元素形变判断就绪；`ref` 指向卡体。根上 `data-morph` 期间开合一步到位、不播过渡。
- 尺寸档 `sm 380 / md 440（默认）/ lg 560` 只改宽度；`width` 像素数覆盖档位（预设不是牢笼）。长内容正文区独立滚动（上限 78vh）+ `edge-fade-scroll` + `useEdgeFade`（壳层同款边缘渐隐）。遮罩 `bg-overlay + backdrop-blur-[4px]`，容器 z-[340]。
- 头部信息一处一责：标题讲动作、`context` 徽标记对象（surface 亮底 + 描边 口径）、正文讲事实、`impact` 念后果、按钮文案不带数量；阻断通知纯文字头部（无 icon）。
- `header` 插槽整体替换内建标题行与 ×：只给自带导航头的工作台型弹窗（如数据库行详情的「视图 › 行标题 · N / M · 上下条 · 更多 · 关闭」），关闭入口由 header 自己提供，`title` 转为 `aria-label`；焦点圈闭、Esc、PortalScope、退场动画照旧由 Dialog 负责，不要为换头部另写模态壳。
- 无 footer / impact 时，正文滚动区底部保留 16px 外间距，避开容器圆角；配合 6px 内边距维持内容原有的 22px 底部留白。

### Popover 使用边界

- Popover 是锚定式可交互内容浮层（非模态 方案 B 形制）：无标题栏内容卡，`Popover.Header`（头行随需，icon + 标题 + ghost ×，挂 aria-labelledby）/ `Popover.Body`（独立滚动上限 60vh + edge fade）/ `Popover.Footer`（应答区随需，按钮右对齐）复合声明，trigger 克隆注入（协议同 Tooltip/Menu：必须透传 props 与 ref）。
- 触发只有 click toggle（内建，不设 trigger props）：hover 说明归 Tooltip、右键归 ContextMenu——antd 存量 `trigger="hover"` 迁 Tooltip，placement 12 向同名直映。
- 关闭矩阵：点外 / Esc / × / Tab 移出皆可关；Esc 与 Tab 还焦触发器；非模态不圈闭焦点。Esc 仅 open 态消费（焦点链 LIFO，同 Select/Menu/Dialog 口径）。初始焦点落 `data-autofocus`（无则卡片自身）。
- 定位走 anchoredPosition 引擎全 placement 12 向（首个全表消费者）+ flip/shift，gap 8、宽随内容（180–340，`className` 覆盖）；浮层内开的 Menu/Select/二级 Popover 经 useLayerDismiss 嵌套链共存（点子层不误伤父层、Esc 逐层退场），开新顶层浮层自动收旧的。
- 浮层公共底盘：`useAnchoredPosition`（定位生命周期）、`FloatingArrow`（菱形箭头，宿主标 `group/float` + `data-side`）、`mergeRefs`（触发器克隆的 ref 合并）、`useLayerDismiss`（外点/嵌套/互斥——MenuSurface 走 registerDismissLayer 直登）。

### Tooltip 使用边界

- 侧栏收起为图标列时，导航条目（含底部入口）与展开按钮使用 `placement="right"` 的 Tooltip；展开态通过 `disabled` 暂停。收起态移除原生 `title` 避免双重提示，按钮保留 `aria-label`；提示通过 Portal 展示，不受列表滚动裁切与边缘渐隐影响。
- 条件暂停提示（如标题未截断或正在编辑）使用 `disabled`，不要在 `open={false}` 与不传 `open` 之间切换。禁用会隐藏提示、取消显示延迟并清空内部打开状态；重新启用后由新的悬停或聚焦触发。
- `disabled` 优先于受控 `open`，不修改调用方的状态、不触发 `onOpenChange`，也不禁用子元素本身；受控模式重新启用后仍按调用方的 `open` 显示。

### 演示模式

- 入口组件 `src/components/PresentationMode`（文章 / 卡片 / 项目共用，白板有自己的演示模式），接口 `{ content: Descendant[]; onExit }`：调用方只管开关，不传任何排版参数。需在 PageProvider 内渲染（Esc 走 `useOverlayDismiss`）。
- 进入即窗口全屏（退出还原）；放大靠舞台整体缩放：`frame.ts` 的 `fitStage` 给出逻辑尺寸（宽 1000 固定、高随窗口比例）与缩放比，舞台里按编辑器常规字号排版、正文列 768 居中，外层 `transform: scale` 铺满窗口。**编辑器块的样式单位（px / em / rem）与演示无关**，不要为了演示改块的写法，也不要在演示容器上改字号。
- 分节（`sections.ts`）：分割线优先；否则按出现两次以上的最高级标题断；都没有则整篇一节。一节放不进画框时由 `cameraPlan.ts` 生成镜头计划（居中 / 缩小到 ≥80% / 按块边界逐屏推进）。两者都是纯函数并配有单测，调规则改这里，不要在渲染层打补丁。
- 画框自测块高（`ReactEditor.toDOMNode` 取顶层块 + ResizeObserver 跟踪异步撑高）；放映与全览共用 `SlideFrame`（传入放映舞台的逻辑尺寸，缩略图比例与放映一致），缩略图只是 `scale` 更小，不要另写一套缩略渲染。
- 深浅色（`D`）只作用于演示层：根节点写 `data-theme` / `data-mode`，内容包 `EditorThemeOverride`；不要改全局偏好或 `<html>`。HUD 显隐由鼠标位置驱动（底部 140px 带内显示），不要改回「静止即隐藏」。
- 键盘：推进键在 window 捕获阶段接管并阻止冒泡；Esc 不在组件内监听（注册表逐层退场：帮助 → 全览 → 退出）；修饰键组合、编辑上下文、输入法组合放行。新增快捷键加在 `handleKey` 一处，并同步 `HelpPanel`。
- 与沉浸写作共用的舞台件：`hooks/useFullScreenWhileMounted`（挂载即全屏、卸载还原到进入前状态）、`components/Stage` 的 `StageHud` / `StageHudButton` / `StageHudDivider`（底部胶囊控制条）与 `useStageTheme`（局部深浅色的根节点属性 + scope 类）。新的全屏舞台类浮层直接复用，不要再复制一份。

### 沉浸写作

- 入口组件 `src/components/ImmersiveEditorMode`（文章 / 卡片 / 项目文档共用），接口 `{ contentId, initValue, initialSelection?, extensions?, onChange, onInit?, onExit({ selection }) }`；调用方在退出后 remount 正文并用回传选区恢复光标。字数与「本次 +N」由组件从自身编辑器内容实时计算，调用方不传。
- 放大 = 版心整列 CSS `zoom`（`layout.ts` 的 `fitZoom` 按屏宽自适应，控制条 ±10% 微调）；**不用 transform**：可编辑场景要真实布局，光标命中、滚动高度、Portal 浮层（按 getBoundingClientRect 定位）才无需换算。同样不改字号、不对块的样式单位做假设。编辑器 DOM 内自行 `position: fixed` 且按视口坐标写 left/top 的元素，必须按 `currentCSSZoom` 反除（文件落点指示线、协作光标层 `editor-collab/cursorOverlay.ts` 已处理），新写此类元素走 Portal 或照此处理。
- 光标跟随（`useCaretFollow` + 纯函数 `caretScrollDelta`）：打字机模式光标行钉在视口 45%，关闭时只在越出 20%–75% 舒适带时跟随；只响应键盘引起的光标移动，鼠标点击 / 滚轮回看不拉回。上下留白放在 zoom 之外（45vh / 55vh），首末行也能到视线位。
- 段落聚焦 = 编辑器通用能力 `<Editor focusMode>`（`packages/editor/src/components/FocusPath`），沉浸层只传开关并在容器上设 `--ed-focus-dim`（打字机开 0.26、只开聚焦 0.42）。规则只看文档结构：纯函数 `focusPathOf` / `focusRoleOf` 从选区求光标的元素祖先链；标记是**渲染输出**——`renderElement` 最外层的 `FocusAttributes` 让每个元素订阅自己的角色（`useSlateSelector`，角色变了才重渲染；**按节点对象身份判断，不用 `findPath`**——协作同步会整体替换节点对象，渲染期维护的节点索引在重渲染前是过期的，按路径判断会卡住旧标记，由 editor-collab 的 `focus-mode.test.tsx` 守护），把 `data-focus-path`（聚焦单元另加 `data-focus-unit`）并进 Slate 的 `attributes`，与 `data-slate-node` 落在同一 DOM 上，不在 effect 里命令式改 DOM（会被重挂载 / 重渲染冲掉）；样式让「不在链上、且不在另一个已退后元素或聚焦单元之内」的元素退后——链外即同级兄弟，顶层块、列表项、表格单元格、引用里的段落一视同仁。**不要在宿主层按元素类型或渲染 DOM（拖拽容器、chunk 容器、ul/li）写聚焦规则**：新元素类型无需任何接线。
- 控制条显隐位置驱动（底部 140px 带 / 悬停 / 进场 3.2s），一输入即收起并隐藏指针；点控制条 `preventDefault` 不抢编辑器焦点。Esc 经 `useOverlayDismiss`（编辑器斜杠菜单等在 document 捕获阶段先消费 Esc）；编辑器内的 Esc 热键只在真有事可做时消费（如 `tau.edit.clear-marks` 仅在光标处有标记时拦截），否则必须放行，不然宿主的退场仲裁收不到；`useFindOwner` 吞掉 Ctrl/⌘+F。缩放不占键盘：`Ctrl+=` / `Ctrl+-` 已由主进程注册为整窗缩放全局快捷键。

### 滚动区标准接法（手写三件套）

- 设置页右栏：标题栏高度的拖拽区下方是整列滚动视口（`FadeScroll`：内缩细滚动条、轨道上下各留 10px，外加 `mr-1.5` 不贴窗口右缘），内容列 `max-w-[880px]` 居中，页头（分区 label + description）随正文一起滚动；切换分区时回顶。关态只做 `opacity-0 + pointer-events-none` 时**必须同时撤掉 `app-region-drag`**——Electron 的拖拽区不理会 pointer-events 与透明度，隐藏的拖拽区会盖住底下侧栏头部 / 标题栏的按钮（常驻挂载的全窗口浮层同此）。
- 滚动区 = `edge-fade-scroll` 类 + `useEdgeFade(el)` + callback ref（el 经 state 触发挂载后接线），`overflow-y-auto` 自带写；滚动条样式走全局规则（4px 细墨条，hover/滚动中显形——scrollbarAutoHide 的 document 级委托），挂上类即生效，无组件侧接线（不要重建 Scroller 组件收口，曾引入后被裁决删除）。
- 两类规则已全局化（原 .app 前缀盖不到 body 级 Portal，曾受旧全局滚动条规则影响）：`::-webkit-scrollbar` 系列与 `.edge-fade-scroll`；Home 的 home-scroll 是带自定义 padding 协议的历史变体。
