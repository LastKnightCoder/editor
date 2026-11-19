# Page 协议与服务层

> 声明式页面、数据与主题协议、导航接线与新增页面流程；UI 铁律与交互定案见 [ui-interaction](./ui-interaction.md)。

## Page 导航入口与服务层接线

- 已迁移功能禁止再调用 `useTabStore` 或 `utils/navigation`。组件使用 `usePage().navigator`；共享编辑器入口与非 React 服务使用 `services/page-navigation.ts` 的 `openPage`，由 AppShell 内的 `PageNavigationBridge` 注入真实 navigator 和当前栈，卸载／切库时注销，不创建旧 Tab 兼容层。未就绪、目标未注册／仍为占位、参数无效时明确报错。
- “新 Tab 打开”入口现为“在应用内打开”，不再尝试旧分栏。网页由 `features/web` 的 `webview` 页面承载（按 URL 去重）；内嵌白板由 `features/whiteboards` 的 `whiteboard-content` 页面承载（按内容 ID 去重，返回由 Page 栈负责）。白板数据使用 react-query，托管内容通过文档会话与耐久日志保存，离页冲刷未确认增量，切库拒绝旧写入；旧快照不执行防抖写回。
- 正文内容链接和项目文档列表共用 `services/open-content.ts`：卡片、文章、项目文档进入对应 Page；多项目共享文档优先保留当前所属项目。异步查找期间切库则取消打开，不跳空占位页。
- MCP 页面查询以真实 Page 栈为源，现有内容序列化器只用于取正文，不读取旧 panes。编辑目标以显式 contentId 或当前 Page 为准，不再回退到后台旧编辑会话。工具协议名称暂保留，响应中的页面类型为 Page key；不提供正文的页面返回明确说明。创建内容后的响应使用 `activatedPage`；若内容已落库但页面打开失败，保留创建成功结果并单独返回 `navigationError`，避免调用方重试造成重复创建。
- 结构化分析通过 `sql_query` 只读工具执行，当前主库表结构由内置 `database-schema` Skill（`/packages/ai/src/skills/internal/database-schema.md`，桌面与移动共用）描述，事实来源为 `packages/db-schema/schema/main.sql`，表结构变化时须同步更新该 Skill。工具只允许单条 SELECT/WITH/EXPLAIN 和受限结构探查 PRAGMA，默认限制返回行数、响应大小与执行时间。任务交互例外：`query_todos` 统一查询独立、周期和正文待办，`query_calendar_events` 查询日程及周期投影，结果带身份、版本和专用卡片；复杂聚合继续使用 SQL。正文 Markdown、编辑快照、语义索引、PDF/视频检索和 Page 上下文继续使用专用工具；不提供通用 SQL 写入。
- 知识库搜索结果卡片（KnowledgeSearchRenderer）的预览消费工具输出快照做纯渲染，不按 contentId 回源拉实时内容——搜索后内容被编辑时预览不更新；点进详情弹窗才按需取实时内容。
- AI RPC 服务随 PageNavigationBridge 启停。桌面与扩展统一使用 `content.open` 打开卡片／文章／项目引用（type/id），不注册旧 `tab.open`；块预览只走 `block.preview.open`，进入 `features/previews` 的 `block-preview` 页面。尚无承载的类型（如日记）返回明确错误，不伪报打开成功。

## DeepLink 唤起

桌面安装包在 `electron-builder.yml` 声明 `tau` 协议供 macOS 生成 Info.plist；Windows 的 `build/installer.nsh` 在安装时写入协议关联，命令行以 `--` 隔开 URL，未手动运行应用也能唤起。主进程通过 `setAsDefaultProtocolClient` 注册当前用户关联；卸载仅清理仍指向本安装目录的记录。开发态携带 Electron 可执行文件与应用入口参数，macOS 的系统关联仍需要应用包的 Info.plist 声明。

`services/deep-link.ts` 只接受 `tau://browser-companion`（可带末尾 `/`），拒绝凭据、端口、其他路径、查询参数和片段。主入口在 ready 前监听 macOS `open-url`，Windows 从初始 argv 与 `second-instance` 获取协议请求；窗口管理器就绪前暂存显示主窗口的意图，读取后台启动偏好期间到达的请求也不会丢失。有效请求创建或前置已有主窗口，优先于登录时隐藏启动；普通 Dock 激活、文件关联与托盘入口继续沿原窗口协议运行。

DeepLink 不授予权限或转发业务命令，浏览器连接继续经过既有的 Origin、token 和一次性校验码授权。插件侧的启动等待与失败提示见[浏览器伴读](/docs/architecture/browser-companion.md#唤起与启动等待)。

## 三大协议（照抄即用）

**新增页面**（如卡片库）：

```TSX
// features/cards/pages/cards.page.tsx —— 文件即注册，无需改任何登记表
const schema = createPageSchema({ keyword: paramOptional(paramString()) });
type CardsParams = typeof schema.type;

export default definePage({
  key: "cards", // 与 navigation.ts 的 key 一致即接管侧边栏入口
  match: "single", // 功能页用 single；详情页用 "params" + getId: p => `card-${p.cardId}`
  label: "卡片库",
  params: schema.schema,
  component: CardsView, // 视图组件放 ../views/
});
```

- 导航：`navigator.push("cards", { keyword: "..." })`；视图内读本实例参数用 `usePageParams<T>()`（PageHost 按栈条目注入）。params 页禁止从 `usePage().state` 全局栈顶取参——多实例保活时被隐藏实例会读到栈顶参数，引发串台与节流落盘写错行（回归见 `page/__tests__/pageParams.test.tsx`）。
- 栈机去重：重复 push 同 key 同参 = no-op、异参 = 原位更新，调用侧不做「是否已激活」判断。push 不带参数 = 未指定字段，激活已有实例沿用现有参数（侧栏/首页入口不清页内筛选）；要显式清空必须带字段（整体替换语义）。条目只在 forward 缓冲时同样命中：复活压回栈顶沿用参数。

**新增页面数据**（features/<域>/queries.ts，照抄 features/home 的形状）：

```TypeScript
export function useXxxSnapshot() {
  const query = useQuery({
    queryKey: ["<域>", "snapshot"],
    queryFn: fetchXxxSnapshot, // 并行 Promise.allSettled + 单项降级，整体不 reject
    staleTime: 60_000,
    refetchOnWindowFocus: true, // 全局默认是关，"今日"类数据按页面开启
  });
  return { data: query.data ?? null, loading: query.isPending, refresh: () => void query.refetch() };
}
```

禁止手写 useEffect+useState 拉取；列表展示 N 条禁止为此全量拉大表（渐进窗口凑满即停，或主进程聚合命令）。

**聊天消息模型（单一来源）**：消息/会话/流式块类型统一在 `packages/shared/src/chat-core/messages.ts`（AssistantBlock 系列、Request/ResponseMessage、ChatSessionRecord、ToolCallPayload 等），桌面 types 仅 re-export；桌面与浏览器扩展共用同一模型，禁止再各自定义同名类型。这套模型是展示投影——事实源是 pi 会话文件，主进程 `pi-session-transcript.ts` 把 pi entries 投影成它；流式块组装与流事件归约器（`applyChatStreamEvent`，快照语义 + turnId）同在 chat-core，扩展与桌面间走 AI 运行协议 v2（`chat-core/aiRunProtocol.ts`），两端用同一归约器。

**聊天会话数据**：对话内容的事实源是 pi JSONL（`~/.editor/sessions/<库名>/`），sqlite 只有目录表 `chat_session`（id = pi 会话 id，scope + domainRef 区分主聊天 / PDF / 视频笔记 / 学习项目，只存元数据）。读走 `pi-session:transcript` 投影，改历史（回退、分叉、切版本、删消息）走 `pi-session:edit`，都按消息上的 `piEntryIds` 定位，不按下标或 clientId；分支在同一文件的会话树上，不新建目录行。删除所属对象时 `ChatSessionTable.removeByDomain` 连会话文件一起删，渲染端先 `releaseBucket`。禁止再往 sqlite 写消息载荷或新建聊天表。

**新增主题**：`packages/themes/src/themes/<name>.theme.ts` 用 defineTheme 声明（tokens 全键强制），含极光背景三色 `glow-1..3`（侧栏文字直接落在其上，parity 测试按色团峰值校验 ink-1 ≥7、ink-2 ≥4.5），在 `register.ts` import，**并同步在 `tokens.css` 补 `[data-theme="<key>"]` 数据块**——`theme-parity.test.ts` 守护两处一致与 AA 对比度。派生逻辑写在 tokens() 里。

**主题模式与切换**：`@tau/themes/react` 提供 `createThemeRuntime` 与默认 store；mode 可以是主题 key 或 system。AppShell 挂载运行时并在清理时释放系统监听；DOM 应用由公共主题实现负责，业务代码不操作 data-theme。Vite 构建入口调用 `createThemeBootstrapScript()` 注入首帧脚本。桌面侧栏、标题栏尺寸留在 app/base.css，不作为公共主题尺度。

**编辑器主题与局部明暗**：`data-theme` 是主题族 key，明暗由 `data-mode` 与主题运行时管理。编辑器无全局 Provider，宿主显式传场景 EditorKit，取色走 `--ed-*`/`--tau-*` 与 ThemeService；`useEditorTheme` 订阅明暗、主题族与通知修订号（同明暗换主题也刷新 ECharts 等取色组件）。新 editor 实例有独立 Slate 挂载键与内容/选区快照；同谱系文档换源保留实例；换源等待只复用仍存活的文档，底层 Y.Doc 销毁后撤下旧绑定，异步契约准备不向已销毁文档发布结果；新页面不以 documentId 为 key 强制重建内容编辑器。编辑器子树用 `<EditorThemeOverride mode>`；整块区域换主题族（导出图片）节点同时写 data-theme/data-mode；演示和沉浸舞台经 PortalScope 挂回 UI 浮层避免继承 body 明暗。JavaScript 明暗统一消费 `useThemeStore(s => s.mode)`；设置不再有 darkMode/accent，图片圆角/阴影在 appearance.image，渐变背景开关在 appearance.backdrop，背景高亮笔触在 appearance.highlight.style（平涂 / 平头荧光笔 / 下半划线 / 干笔颗粒），经 `IHighlightStyle` 服务注入编辑器，发布时随 PublishSettings 进入博客渲染。

**字体设置链路**：`fontSetting` → `useSyncFont()`（App 根挂载一次）→ root 级覆盖。用户字体/字号是应用级默认（界面与编辑器统一）：字体族覆盖 `--tau-font`/`--tau-font-mono`；字号按 13px 基准**阻尼**缩放 `--tau-text-*` 全部档位（半速率传导，与内容区解耦——宿主可用 `--font-size` 为内容容器提供原始字号，Editor 继承所在容器；排版层级保持，间距圆角不动；例外：侧边栏条目行高/图标按 em 折算）；`--font / --font-size / --mono-font` 一并写 root。默认字体变量在 :root，body 不重复声明；Editor 根节点不声明字体族/字号。**Tailwind v4 陷阱**：`@theme inline` 对字面值会把值内联进工具类，运行时覆盖 CSS 变量无效——字号 token 必须经 `:root` 字面值层 + `@theme inline` var 桥接，`useSyncFont` 覆盖字面值层。

外观设置的中文字体提供内置「小赖 SC」，英文字体提供内置「Shantell Sans」，与系统字体合并去重；系统字体清单未返回时也可选择内置字体。`utils/bundled-fonts.ts` 统一保存选项名称与实际字体栈的映射，预览与 `useSyncFont` 共用；小赖按 `assets/fonts/hand/hand-font.json` 展开全部独立 family 分片，沿用现有按需加载与导出内嵌机制。

白板手绘字体栈 `--tau-font-hand` 统一由 `@tau/themes/scale.css` 定义，优先使用宿主提供的 `--tau-font-hand-faces`，未提供时回退到系统手写体，最后回退到应用字体。桌面端的 `assets/fonts/hand/hand-font.css` 提供内置字体声明与分片栈，`app/base.css` 不重复覆盖手绘字体栈，避免生产 CSS 分包顺序影响字体选择。

**颜色与尺度消费**：组件样式一律 Tailwind 工具类；颜色写语义类（`bg-page / bg-surface / text-ink-1/2/3 / hover:bg-hover / bg-accent-soft / text-accent / bg-ok-soft / text-warn`…），尺度写 tau 命名空间词（`text-tau-body / rounded-tau-sm|md|lg / shadow-card / ease-tau-out / font-tau / font-tau-mono / font-tau-hand`，`font-tau-hand` 只用于白板手绘文字），词表见 [design-system.md](/docs/architecture/design-system.md)。禁止裸色值、antd token、内联十六进制、白名单外手写 CSS。数据驱动的动态值（进度宽度等）允许 inline style 但色值仍走语义类；热力图色阶这类主题 accent 的 alpha 派生以 arbitrary 注明出处。跨域视觉模式收口 `packages/ui/src/primitives/`。**不存在 bg-group**：小面积填充用 `bg-hover`；容器 = 透明底 + `border-line-1` 描边、输入控件 = `bg-surface` + 描边，嵌套底色叠层是常见腐化点。

**编辑器集成要点**（扩展与包的完整约定见 `packages/editor/README.md` 与 [架构手册](/packages/editor/docs/architecture.md)）：

- 内核只内建段落，通用功能在 `@tau/editor/extensions/<功能>`，组合在 `/presets/standard`，四端显式装配并加载对应 styles.css；HTML、custom-block、ABC、TikZ、Typst 由独立应用插件提供，不回内置数组。内核不重导出领域渲染器，宿主按服务契约注入编译能力。
- `packages/blog` 单向依赖 Editor 与数据 SDK，对外 @tau/blog 提供 ContentRenderer/createClient；`scripts/blog/package-blog.mjs` 收拢一份 npm 交付。模板自选页面 UI（hrefFor、renderLink、onOutline），不接触编辑器装配；发布 CSS 校验后按原文加载，@tau/blog 的 styles.css 全部处于级联层（preflight 不会盖过模板工具类）。
- 共用宿主能力（IResourceService 等）从 `@tau/shared/host-services` 引用；媒体归 `@tau/editor/extensions/media`（灯箱、裁剪、属性条经扩展 layers 挂载，属性条「更多」用 /api 的 ElementMenu）。
- 异步写入从 `/api` 用 `capture*Submission` 守卫（check/commit/dispose 管理有效性与引用释放；commit 回调必须同步，失效返回 discarded，真实异常继续抛出）；只读、Activity 隐藏、卸载、换源与整篇重设永久废弃旧操作；媒体上传忙态归实例运行时，不能为清理忙态写只读文档。
- 命令式整体设值已删除：ContentEditor 正文更新只由文档绑定接管；表单清空/恢复经新 key 建会话；禁止用下标复用编辑状态。整篇替换必须带当前修订号并在原 Y.Doc 上一次事务提交；跨文档复制经 Slate 节点转换（禁止 `Y.XmlText.clone()`，不复制属性）。Markdown 文件视图用 `editor-collab/local` 本地 Y.Doc 会话，源码切换不卸载 Editor；`useTextFileSession` 负责磁盘冲突，迟到读取不回写已关闭视图。源码预览块的编辑与预览归 editor-source-view，源码输入两端与代码块共用 `@tau/editor-source-view/overlay` 的 `ShikiOverlayEditor`（原生输入框 + Shiki 高亮）与按键处理 `handleSourceKeyDown`：桌面在块内原位编辑（退出时提交防抖草稿），触屏（`IEditorInteraction.touch`）改为正文点选 + 独立源码页（见 [mobile.md](/docs/architecture/mobile.md)「编辑器配件栏与键盘预留」）。
- Markdown 文件会话通过 `editor-collab/local.getSnapshot()` 生成独立只读的块投影：JSON 块深冻结并按 Yjs 事件失效，未变块复用；事务内或不宜缓存的数据回退为完整独立投影。Markdown 按会话缓存已声明纯 codec 的不可变块，脚注、未声明插件及插件快照变更保留完整转换与失效语义。保存读取先 flush 再复用文本快照，不因 500ms 自动保存轮询重新转换全文。PDF 和 EPUB 导出用独立可修改的 `getContent()` 副本。富文本编辑期间不向隐藏源码编辑器 setValue，进入源码时再同步当前原文；源码撤销、重做与外部载入仍即时同步。接口细节见 [本地文档](/packages/editor-collab/README.md) 与 [Markdown 处理器](/packages/markdown/README.md)。
- 本地 Markdown 图片导出由当前文件视图持有，打开时提交待同步的富文本操作。文件视图将更新后的正文快照交给 `SnapshotImagePreview`，以独立的只读编辑器和代码块运行时身份提供预览并报告就绪状态。版式、保存与复制共用 [图片导出弹窗](./data-baseline.md#内容导入导出与资源搬运)。
- 正文目录复用未变条目与标题索引：滚动及正文更新优先测量上次位置相邻标题，大幅跳转时二分定位，不顺序测量全部离屏标题；已折叠隐藏的标题不参加位置判定。Markdown 正文字数按 Slate 不可变顶层块缓存，局部修改只重新统计受影响块，不额外读取 Y.Doc 全文。
- Markdown 源码视图首次进入时才创建，此后保留同一个 CodeMirror 实例；首次挂载后恢复映射光标，转换失败仍自动进入源码并保留原文。富文本连接在 Yjs 转换后按当前编辑器 schema 补齐已声明行内节点的空文本落点，未知和 void 子树保持原样；随后仍执行完整 Slate 规范化。此准备只作用于编辑器投影，不写 Y.Doc 或用户历史，连接后恢复正常规范化方法；不能放在写入 Yjs 前，因为零长度文本不会被 Yjs 保留。
- 长 Markdown 的 CodeMirror 源码视图使用有界内部滚动与行视口，源码大纲跟随该滚动区。合法源码的输入先更新可直接保存的原文草稿，停顿后才转换成富文本投影；撤销和读取结构前结算草稿，切回富文本复用光标映射所做的转换。外部版本替换会废弃旧草稿。源码字数复用已转换的正文投影。
- Markdown 大纲列通过同一组容器切换布局，源码标题统计、窗口宽度或大纲开合不重挂正文和源码编辑器；CodeMirror 的实例登记与注销在同一个 effect 中配对，回调变化或视图重新挂载后重新登记当前实例，避免旧清理覆盖新实例引用。
- Markdown 文件窗口按首次成功转换时的正文规模决定渲染范围。短文直接挂载，长文用同一份完整 Slate/Y.Doc 会话按视口挂载顶层块。首次展示等待会话连接与可见块提交，表格等复杂块整块挂载。屏外占位承接滚动和目录定位，选区端点、聚焦的内嵌控件及待定位块优先挂载。跨屏拖选保留模型锚点，随滚动更新终点；单击按鼠标命中的文本同步 DOM 与模型光标。跨占位复制从完整 Slate 选区生成 Slate 片段、HTML 和 Markdown。外部 HTML 经允许的结构转换后插入。检测到辅助支持时，同一会话挂载全文并恢复当前选区，让无障碍树包含屏外标题和表格。
- 源码与正文切换时，位置表保留多行文本的源码坐标，代码正文映射到保存该字段的代码步骤；切换在导入节点与已规范化的 Slate 节点之间换算行内空落点。返回正文先挂载目标块，再恢复浏览器光标并按光标矩形滚入视口。布局短暂稳定期间继续校正，用户滚动、按键或转移焦点即停止。源码、保存与历史均走原文件会话，保存热键冒泡时先让块内编辑器提交草稿。
- Markdown 窗口复用全局查找条，富文本查询完整 Slate 正文，源码查询完整 CodeMirror 文档。按正文变更刷新结果，滚动和挂载变化不改变计数。仅定位当前命中时保留目标块，富文本映射到 DOM 高亮，源码按行列加 CodeMirror 标记，两者均不移动编辑选区。关闭查找释放订阅和标记。

## 新增页面与清理存量组件

1. 在 `features/<域>/pages/<key>.page.tsx` 声明 Page；侧栏入口改 navigation.ts，页面文件自动注册。
2. 视图按 [ui-interaction](./ui-interaction.md) 篇编写，数据接 queries.ts；没有数据源时返回 null 与空态，不造示例数据。
3. 复用已有业务组件时就地改造；纯视觉模式使用公共 UI 原语，不复制旧实现。
4. 改造前在 04 清单登记实际消费者和删除条件；消费者清零再删代码、测试、样式、导出和依赖。
5. 改框架、壳层、主题或数据协议时同步本指南；推翻既有约束先在 /docs/decisions.md 记录。

### 组件归属

- 单域业务件归 `features/<域>/components`；跨域业务件留 `src/components`；纯视觉件归 `packages/ui/primitives`。
- features 可引用应用共享 components、hooks、utils，禁止新增 `@/pages` 依赖；共享 components 不反向 import features。
- 纯搬家与行为修改分开；修改 props 时检查现有宿主和独立窗口，不能以旧页面退役为由破坏仍活跃的消费者。
- 数据来自服务器时用 react-query；输入、筛选、作答会话和计时运行镜像保留各自合适的状态协议，不把所有 zustand 状态当作旧缓存删除。
- 正文快照摘要统一在 `components/ContentPreivew.tsx`：以静态 React 节点渲染传入内容，按块、节点数、字符数和深度限制规模，不创建 Editor、不加载媒体或查询引用全文。卡片墙使用快照；白板文档卡、漫步页和首页漫步牌堆使用只读 `ContentEditor` 订阅原文，会话就绪前统一显示 `Loading`。`ContentEditor` 不承载快照预览模式。

## 与移动端的源码映射（移植参考）

| 桌面（已移植）         | 移动端蓝本                  | 待移植                                                           |
| ---------------------- | --------------------------- | ---------------------------------------------------------------- |
| page/core/stackMachine | router/core/stackMachine.ts | 已含核心；popTo/多 pane                                          |
| page/core/paramsSchema | router/core/paramsSchema.ts | oneOf/object 描述子                                              |
| page/PageProvider      | router/RouterProvider.tsx   | history 适配（**桌面不需要**）、pushForResult、overlay 栈        |
| page/PageHost          | router/PageHost.tsx         | 转场（桌面只做共享元素形变）、手势（不需要）                     |
| ——                     | router/query/ + store/      | PageQueryProvider / PageStoreScope（桌面未实现，不声明预留字段） |
