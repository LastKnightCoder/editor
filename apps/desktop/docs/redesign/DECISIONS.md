# 决策记录（轻量 ADR）

## D-111 白板背景改为点阵平铺，右下状态栏改为「缩放 + 全览 + 视图菜单」

（2026-10-05；mockup `mockups/whiteboard-statusbar/`，用户在 A「合并成视图菜单」/ A′「菜单 + 一键全览」/ B「滑杆 + 拆分按钮」/ C「小地图卡」中选 A′）

- 背景：网格是逐条 `<line>` 画的，节点数随视口与缩放线性增长（缩到 25% 时上百条）；右下状态栏的网格按钮是低频设置却常驻，缩放菜单是 12 档长列表，没有「适应选中 / 实际大小」入口。
- 选择（背景）：网格改为点阵——两层 SVG `<pattern>` 平铺（次级点 + 间距 2 倍的主点），节点数恒为 2 个 rect；点半径固定屏幕 1px；屏幕点距低于 10px 时点距翻倍、次级点随屏幕点距 10→20px 渐显（`components/Grid/dotGridLevel.ts`），点始终落在点距的整数倍上，与 `SnapManager` 的取整吸附一致。点色 `--tau-ink-3` × 0.5。点距档位改为 10 / 20 / 40（默认 20），本地存的旧网格档位按默认点距处理。
- 选择（状态栏）：画风 · − 百分比 ＋ · 全览 · 演示。点百分比是「视图」菜单：适应全部 ⇧1 / 适应选中 ⇧2（无选区禁用）/ 缩放 50%·100%（⇧0）·200% / 显示点阵（勾选项，点了不关菜单）/ 点距子菜单。网格按钮去掉。
- 快捷键（`ViewPortPlugin`）：新增 Z = 全览，停在全览视角时再按 Z 回到原视角（全览后手动平移 / 缩放过就重新全览）；新增 ⇧1 / ⇧2 / ⇧0。单键与 ⇧数字 在文字编辑、输入框焦点、输入法组合、演示中让位；⌘O 原样保留。
- 不做：小地图（C）暂不做，大白板迷路的反馈出现后再在状态栏最左加开关；缩放滑杆（B）不做。

## D-110 浏览器扩展侧栏改为「阅读伴侣」单页流，主题族跟随桌面

（2026-10-05，原编号 D-109，合入 master 时与「导出图片」撞号改用 D-110；用户在 `apps/browser-extension/mockups/sidepanel-redesign/` 三个方向中选 B「阅读伴侣」、主题设置选 S1「可脱离」；mockup 里标「新增?」的功能（推荐问题、引用高亮提问、高亮记到笔记、在 Tau 中打开本页笔记）暂不做）

- 背景：侧栏底部四个纯图标页签（概览 / 聊天 / 笔记 / 高亮）要猜意思，看不出侧栏在说哪一页；外观是扩展私有的灰蓝配色（`style.css` 的 `--color-*` + `tau-tokens.css` 桥接），和桌面不像。
- 选择：① 去掉页签，主界面是当前网页的一张纸：顶栏 = 站点图标 + 标题 + 域名（全部笔记、设置、重新连接收进 ⋯），从上到下 AI 总结（默认折叠约 5 行）→ 最近 3 条高亮（「全部」进二级页）→ 本页笔记卡片 + 新建 → 上次对话，底部常驻「问这一页」输入框；② 对话、笔记编辑、全部高亮、全部笔记、设置都是从右侧滑入的二级页，顶栏「←」返回本页；本页流输入框发送后进入对话页并把消息发进当前对话；③ 笔记二级页按打开时的页面 URL 绑定，编辑途中切换标签页不会串到别的页面。
- 主题：扩展直接使用 `@tau/themes` 的 tokens.css（六个主题族 × 深浅），删除私有配色与桥接；主题族默认跟随桌面——aiServer 新增 `appearance.getTheme` 请求与 `appearance.themeChanged` 通知（协议常量 `APPEARANCE_METHODS` 在 `@tau/shared`，只带主题 key），设置里可关掉跟随后自选；深浅只在扩展里设置（跟随系统 / 浅 / 深），默认跟随系统。偏好存扩展页 localStorage（`tau-ext-theme` / `tau-ext-appearance` / `tau-ext-theme-follow`），`main.tsx` 渲染前就位，桌面未连接时沿用上次同步到的主题。
- 页面内划线 UI（工具条 / 取色 / 想法 / 问 AI，content script 的 shadow DOM）同主题：侧栏把生效的主题族与明暗偏好镜像到 `chrome.storage.local`（`tau-ext-content-theme`，网页里读不到扩展页 localStorage），`content/theme.ts` 写到根容器的 data-theme / data-mode，「跟随系统」按页面所在系统解析；原先恒为深色的面板改为主题纸面。
- 不做 / 后续：高亮仍按创建时间倒序，不按原文位置排；网页上定位高亮时的闪烁描边仍是固定蓝色（画在宿主页面上，不在主题容器内）。

## D-109 导出图片：样式由应用主题推导，弹窗改为右侧设置栏

（2026-10-05，用户在 `mockups/export-image/` 选定配色 Ⅱ 柔光 + Ⅲ 整张纸并存、弹窗方案 A）

- 背景：`ContentExportModal` 内置 16 组手挑渐变（深浅各 8），饱和度与明度口径不一，正文只切纯黑 / 纯白，链接、引用、代码块仍按应用主题取色，和背景不成套；「深色 / 浅色」+ 预设是一个维度拆成两层；只能下载，文件名是时间戳。
- 选择：① 导出样式 = 应用主题族 × 明暗（`listThemes()`，新增应用主题自动多一种样式）：导出节点写 `data-theme` / `data-mode`，纸、墨、强调色由该主题 `--tau-*` 取值，编辑器经 `<EditorThemeOverride mode themeKey>` 跟随；② 背景两种可选：柔光（凹陷底 + 两角 accent / 邻近 tag 色晕光，`color-mix` 只消费 token）与整张纸（无背景，标题上方 accent 短线收头）；③ 弹窗用 `@tau/ui` Dialog，左预览（真实宽度、不缩放，截图不受影响）+ 右设置栏：样式色块 + 深色开关、背景 / 宽度（375 / 600 / 800）/ 边距、标题 / 日期 / 署名开关，底部「复制」+「保存图片」和导出尺寸；④ 默认跟随应用当前主题与明暗，改过的维度记在 localStorage `content-export-image`。
- 不做：旧 `export-config` 偏好不迁移（16 组预设已删除，无对应关系）；白板导出弹窗（D-049）不在本次范围。

## D-108 对话 UI 收口 @tau/chat-ui，桌面与浏览器扩展共用

（2026-10-05，用户裁决：浏览器扩展的对话输入框与消息区对齐桌面，旧聊天样式删除，「清空对话」按钮删除）

- 背景：桌面对话 UI（D-048）在 `src/components/ChatUI`，扩展沿用 shared / chat-ui 的旧组件（灰阶 + `isDark` 分支），两端外观分叉；扩展深色下 tooltip 不可读、输入框与桌面不一致。
- 选择：① 与宿主能力无关的部件移入 `@tau/chat-ui`（`components/Message/`）：MessageView、ReasoningBlock、FoldRow、ToolCallRow、ToolCallBlock、CodeBlock、tauPrismTheme、markdown 排版组件（`markdownTypographyComponents` 与行内代码 / 链接 / 文档引用类名）；② 输入框部件移入 `@tau/shared`（`components/ChatComposer/`）：＋ 添加面板、上下文用量环、工具行 chip、ComposerPanel；③ 依赖宿主的留在各端：桌面的工具确认条经 `ToolCallBlock` 的 `renderApproval` 注入，markdown 代码块预览 / 链接打开、文档引用跳转各端自理；④ 两端输入框组件仍各一份（桌面是 Slate 编辑器 + 桌面专属面板，扩展是 textarea），靠共用部件保持外观一致。
- 删除：chat-ui 的 ChatMessage / ChatMessageView / ChatToolCallDisplay / ReasoningDisplay / StatusBadge，ToolCallDisplay 的旧默认项（缺省落到 ToolCallRow），ChatContainerCore 的默认输入外框 / 默认输入区 / 默认消息 / 清空按钮及 `isDark`、`chatInputServices`、`onSendTextMessage` 等无人使用的入参；shared 的 ContextUsageIndicator 与新建对话 Tooltip 状态机。
- 不做：扩展的工具审批仍在输入框上方集中显示（不像桌面挂在工具行下），避免流式中工具行尚未渲染时审批不可见。

## D-107 白板手绘模式：页级画风 + 墨水笔迹（方案 B）

（2026-10-05，用户确认 `mockups/whiteboard-sketch/` 方案 B「墨水」与技术方案 `docs/whiteboard/手绘模式技术方案.md`；分支上原编号 D-106，合并时与 master 的 D-106 撞号改用 D-107）

- 背景：旧「草图风格」是 rough.js 薄封装，只接入形状与连线、逐元素开关，面板暴露 7 种填充 + 4 根滑杆；填充角 0°、间距固定、透明度丢失、圆角被抖成麻花，箭头 seed 每次重绘随机导致拖动时整条线抖动；文字、画框、导图不跟随，风格割裂。
- 选择：① 画风是**页**的属性（`WhiteBoardContent.data.sketch = { mode: "sketch" | "normal", level }`），新建页默认普通；元素可单独覆盖模式 / 笔触档位 / 换一笔（`element.sketch`），思维导图只在根节点存；② 笔迹改用 perfect-freehand 变宽墨迹（与手写工具同一引擎），渲染为 `utils/sketch` 纯函数 → 声明式 `<path>`，seed 默认由元素 id 派生，同一元素永远同一笔；移除 roughjs；③ 笔触三档（工整 / 自然 / 潦草），填充收敛为淡涂 / 斜线 / 交叉 / 涂鸦四种（`GeometryElement.fillStyle`，普通模式按实色渲染）；④ 手绘时文字换 `--tau-font-hand`，一期系统回退栈，二期内置 Excalifont + 小赖 SC；⑤ 流动动画保留：虚线 = 连续墨迹 × 虚线遮罩（动画只改遮罩 dashoffset），实线 = 流动点。
- 范围：一期形状、连线、画框、分栏、文本、卡片、思维导图；二期图片 / 视频 / 网页 / 音频 / 白板引用的墨迹外框、内置字体与导出内嵌、多选批量改笔触。画布 chrome（选中框、控制点、参考线）永远普通（D-049）。
- 页级切换走 `set_sketch` Operation（进撤销历史）；删除只有类型没有实现的 `set_theme` 空壳。
- 旧数据：不升级。旧字段 `sketchEnabled / sketchOptions / roughness` 不再读取，原开草图的元素显示为普通。
- 追记（同日，二期）：① 手写字体定为 **Shantell Sans（拉丁）+ 小赖 SC（中文）**，用户在 `mockups/whiteboard-sketch/fonts.html` 九款候选中选定（不用 Excalifont）；Shantell 的随性度轴与笔触档位联动。② 内置方式：`src/assets/fonts/hand/` 提交子集化产物（Shantell 135 KB + 小赖按通用规范 8105 字分 43 片约 2.07 MiB，按需加载），脚本 `scripts/build-hand-font.py`；OFL 许可随包附带，「关于与更新」署名。③ 导出：snapdom 在 `file://` 下取不到本地字体，改由 `utils/bundled-font-embed.ts` 把已加载分片读成 data URL 经 `localFonts` 传入，因 snapdom 按 family 去重，小赖每片用独立 family。④ 图片 / 视频 / 网页 / 音频 / 白板引用跟随手绘（内容之上叠墨迹框）；多选可批量改笔触。

## D-106 共享元素形变转场（卡片 ⇄ 预览 ⇄ 详情，文章 ⇄ 详情）

（2026-10-05，用户裁决：卡片库点卡片 → 预览弹窗 → 详情页全程形变，详情后退缩回卡片；在蓝图 §3.7「桌面页面切换即时」之上开例外）

- 背景：卡片库的三处呈现（墙上的卡、预览弹窗、详情页的纸）是同一张卡，现状是弹窗淡入 + 页面瞬切，看不出三者的对应关系。蓝图 §3.7 丢弃了整页滑动 / 视差转场，PageHost 也写明「页面切换无转场」。
- 选择：① **默认仍即时**，只在「同一个对象在新旧两处都出现」时做共享元素形变；整页滑动、视差、淡入淡出切页仍不做。② **承载 = 原生 View Transitions API**（`document.startViewTransition` + `flushSync`），不用 React `<ViewTransition>`：React 19.2 稳定版没有导出它（只在 canary 以 `unstable_` 前缀提供），等进稳定版再评估迁移。也不用 motion 的 `layoutId`：它逐帧 JS 计算布局，和虚拟列表、保活页的 `display:none` 难以对齐。③ **协议**：元素用 `data-morph-key` 声明自己代表的对象（同一对象同一 key），`page/morph.ts` 在转场开始时只给一对元素临时挂上唯一的 `view-transition-name`，不给全量元素挂名，避免截图开销。新画面的目标元素有 400ms 的就绪上限；超时或不在视口时只让旧元素淡出，不报错。④ **触发分工**：业务主动发起的变化（打开浮层、push 新页）由业务调用 `morph()`；后退 / 前进由 PageProvider 统一处理：当前页和目标保活页都有同 key 元素时才形变，否则照旧即时切换。业务代码仍不监听后退键。⑤ **浮层截图口径**：转场期间根元素带 `data-morph`，浮层（Dialog、AssistDock）关掉自身过渡、一步到位到终态。原因是更新回调执行期间 rAF 不触发（Chromium 实测），靠 rAF 播入场的浮层会被截成透明。⑥ 既有的对话页 ⇄ 停靠栏形变（assistMorph）并入同一运行时，`data-assist-morph` 改为 `data-morph`。
- 卡片落地：卡片墙条目卡 / 置顶横卡 / 列表行 ⇄ 预览弹窗 ⇄ 详情页的纸；卡面「进入详情」直接从卡形变到纸；详情页后退缩回墙上原卡（卡已被删、或滚出视口时退化为淡出）。表格视图不形变，保持弹窗原有淡入。
- 文章落地（2026-10-05 追加）：文章没有预览弹窗，网格卡 / 列表行 ⇄ 详情页的纸，详情后退缩回原卡。详情数据经 `findOneArticle` 单行读取（不在 react-query 缓存里，不做悬停预取），纸面在文章读到后才声明 key；正文会话就绪前用 `ArticleBodyFallback` 只读渲染开头 24 块占位（长文不整篇双渲染）。
- 形式与就绪（首版用户反馈「点击有停顿、放大缩小不明显」后修订）：⑦ 形变 = 放大缩小——新旧截图按容器宽度等比缩放、顶边对齐，多出的高度由容器裁掉（Material 容器变换的 fit-width），380ms，旧图 180ms 先淡出；不用「容器裁切 + 内容原尺寸」（那是对话页 ⇄ 停靠栏的样式，卡片上看不出缩放），也不用 `object-fit: cover`（试过：列表行与弹窗宽高比相差十几倍，cover 会按高度把行截图放大近十倍再急剧回落，行内文字随容器滑动）。⑧ 转场更新回调期间画面冻结，不能在里面等正文会话（会话 IPC + 协作文档订阅 + 编辑器初始化，常逼近 400ms 上限，超时即退化成淡出）：预览弹窗与详情页在会话就绪前用只读全文占位（`CardContentPreview blocks={Infinity}` 作 ContentEditor 的 `fallback`，同日记卡片先例），卡片数据到位即可截图；卡面 / 列表行悬停预取单卡全文（30 秒新鲜期），点击时数据已在缓存。弹窗因此不再等编辑器初始化才显示。⑨ 保活页恢复显示时 Activity 重跑全部 effect，卡片墙 / 列表「筛选变化滚回顶部」的 effect 曾因此在每次返回时归零滚动（虚拟列表随后又恢复，转场新画面里可见重排），改为比对上次 key（`src/hooks/useScrollTopOnChange`，文章页同款问题一并修复：网格无虚拟化，返回后滚动位置会真的丢失）。
- 不做 / 已知边界：系统开启「减少动效」时直接切换；转场期间（约 380ms）页面不可点击；只读占位到可编辑之间有一次替换，排版一致时不可见；视觉效果由用户验收。

## D-105 卡片库与文章的列表排布

（2026-10-04，用户确认 `mockups/cards/list-view.html` 与 `mockups/articles/list-view.html`：平铺 + 列头排序、两行、文章带缩略图；卡片标题优先用 AI 标题）

- 背景：卡片墙与月刊网格适合浏览，不适合按字数、链接数、更新时间翻找整理；项目等驾驶舱已有网格 / 列表（D-092），两页缺同类排布。
- 选择：① 卡片库在面包屑速切器加第 3 个视图「列表」（卡片墙 / 列表 / 表格），文章在工具栏加「网格 / 列表」菜单（按钮 + Menu，同 D-092）；② 列表**平铺 + 列头排序**、置顶始终在前，不按时间分段——排序是列表相对网格的主要价值；③ 行两行：标题 + 一行摘要；卡片标题 AI 标题优先（D-100），没有时取首个非空块而非「前 N 字」，避免摘要从半句开始；文章行带缩略封面（banner 或 id 派生渐变）；④ 列表与「表格」分工：列表只读、跟卡片墙共用筛选与操作，不做行内编辑。
- 数据：卡片全集本在内存，排序纯前端；文章分页在主进程，`get-article-page` 增加 `sort`（updated / created / words），默认 updated 保持网格行为。不做标题排序（SQLite 按码位排中文）、不做文章「最近打开」（无打开记录列）。
- 实现：见 03「文章 / 卡片库的列表排布」；通用控件收口 `features/shared/list`，驾驶舱工具栏与列头同步改用。

## D-104 移除卡片分类概念（闪念 / 文献 / 永久 / 主题）

（2026-10-04，用户裁决：卡片不再区分分类，全端清理；master 上原编号 D-095，合并 feat/ai-insights 时与本分支 D-095 撞号改用空号）

- 背景：卡片自 v0.4.18 起带四分类（temporary 闪念 / permanent 永久 / theme 主题 / literature 文献），实际使用中分类维度冗余，标签树与时间分组已承载组织需求。
- 范围：全端——桌面（ECardCategory / cardCategoryName / categoryColors、列表分类胶囊、详情与行内「编辑分类」、表格视图分类列、发布链路）、移动端（cardCategory.ts、列表分类 chips、详情「修改类型」、快速捕获类型切换、Rust 查询与 IPC 模型）、博客模板（类型、侧边栏分类小标签、mock、isCardData 守卫）、CLI（-c 选项、类型列、TUI 筛选）。浏览器插件建卡走 `card.buildFromContent` 从不传分类，无需改动。
- 数据：`cards.category` 列经声明式退休删除——桌面 / CLI / 同步校验共用 `packages/db-schema/src/feature-table-retirement.ts` 的 RETIRED_COLUMNS，移动端 Rust 侧 `main_upgrade.rs` 的 RETIRED_FEATURE_COLUMNS 同步登记；开库自动 `DROP COLUMN`，删前 VACUUM 备份，幂等。`DATA_MODEL_VERSION` 维持 1（与 vibe_learning 列退休先例一致）。
- 随分类一并下线的行为：① 旧「temporary 卡超一个月未更新自动清理」规则（原寄生在 cards 升级逻辑，用户裁决随分类删除，卡片不再有任何自动清理）；② `get-random-permanent-cards` / `get-recent-temp-lit-cards` 两个无 UI 调用方的查询命令整链删除（注册、契约、封装）；③ 移动端快速捕获建卡命令 `create_temporary_card` 更名 `create_quick_card`（用户裁决，概念清零，应用内部 IPC 无兼容负担）；④ 发布产物 `_INIT_DATA_` 不再写 category，博客模板 `isCardData` 守卫改用「有 tags 数组 + content 数组 + 无 title」判别（文章有 title、文档无 tags、问题页无 content，互斥成立）；旧已发布站点 JSON 里的残留字段无害，重新发布后消失。
- 保留：快速捕获功能本体（桌面 QuickCardWindow、移动端 quickCapture overlay）不依赖分类，原样保留；置顶卡原借用的闪念分类色改用 accent 语义色（同文章置顶惯例）；卡片偏好持久化升 v2 丢弃 category 字段。

## D-103 本地服务 24678 只对本机与可信来源开放

（2026-10-02，用户确认先按来源收口，暂不加 token 与配对；master 上原编号 D-094，合并 feat/ai-insights 时与本分支 D-094 撞号改用空号）

- 背景：主进程 24678 原先监听所有网卡，静态服务把整个 `~/.editor`（`setting.json` 里的模型密钥、各库 `.db`、`pi/auth.json`、会话记录）以 `Access-Control-Allow-Origin: *` 开放；WS 中转（`/backendServer` `/aiServer` `/aiServerMain` `/extToolServer`）不查来源。任意网页一个 `fetch` 即可读走密钥与数据库，或连 `/aiServer` 调写库方法；局域网设备同理。
- 约束（`src-electron/main/modules/server-access.ts`，单测守护）：① 只监听 `127.0.0.1`，本机 node 客户端（主进程、CLI）用 `127.0.0.1` 直连，不经 `localhost` 解析；② WS 握手只放行不带 Origin（本机进程）、`file://`（打包渲染端）、`chrome-extension://<id>`、开发期 vite 渲染端自身，其余 403——不放行 `null`（任意网站的沙箱 iframe 都是它）；③ CORS 只对插件与开发期渲染端回显，打包渲染端的 HTTP 请求不带 Origin、不需要 CORS；④ 静态服务不出根目录文件、库 / 备份 / 日志类文件与凭据、会话、索引、协作库等目录，只出子目录里的资源。新增 24678 的消费方先确认自己的 Origin 落在白名单内，不得为此放回 `*`。
- 插件 content script 的连接带的是所在网页的 Origin，一律经后台 service worker 转发（`utils/wsRelay.ts`，runtime Port + 保活），不直连。
- 不做 / 已知边界：本机进程可伪造 Origin，暂不防（同用户进程本可直接读 `~/.editor`）；任意已安装的浏览器插件同样能连。若要挡住二者，需 token + 插件配对（桌面端确认后下发），届时另立条目。写库 RPC 的参数校验另行处理。

## D-102 主题与全局层 AI 洞见：知识地图洞见视图、今日洞见卡、项目回顾

（2026-10-04，模块联动迭代 7c；见 `docs/knowledge-loop/` 的 KL-060 到 KL-066 与 17 详细设计）

- 背景：7b 只回答「这一篇在我知识里的位置」；整体的版图（哪里意外地连着、哪里缺了、在怎样生长）、对话里反复问却没写的、项目结项与生长时的回顾，都还没有落点。
- 选择：后台按知识地图分层阅读（子主题 → 主题 → 全局，只读 7a 元信息）、按变化量三档重算，结果存主库 `knowledge_ai_insights`（68 表 / 111 索引）；主对话的用户提问进索引库 `chat-prompt` 向量。落点沿用 7b 的「点一下才出现、就地画、一处一个气泡、最多两个按钮」：知识地图的洞见视图（地图覆盖层画呼应、问了没写、重复、矛盾、缺一环、同一思路、还缺，点主题名飞进主题层）、今日页「继续」段一张一次一条的洞见卡、项目详情的生长 / 结项回顾（文档树里长出可能属于这里与还薄）。产出只有连接（卡片双向链接，或到长文的 7b 视图里包成 content-link）与问题（命令面板记问题，来源可以是多份材料 / 多段对话 / 无来源）。复用功能槽 `contentInsights`。LinkGraph 只加通用的覆盖层接口，不碰业务。
- 不做 / 已知边界：地图常驻提示、主题概述悬停卡、周报与通知、以此立项按钮、详情页顶部另加一块、AI 生成卡片 / 文章、创作模式；呼应的质量（deepseek-flash 下仍有「同一机制在两门语言里」这类不成立的），用户尚未决定换模型 / 加复核 / 先不显示。
- 实测：真实库副本（1,298 节点、19 主题）首轮 88 次调用、输入约 35 万 / 输出约 4 万 token、约 4.5 分钟；2 万卡 + 3000 长文夹具上本地部分：上下文 151 ms、身份对应 0.5 s、组内相近对 14.5 s、跨主题呼应候选 28 s、2000 条提问的问了没写候选 74 s（KNN 约 37 ms / 次，后台、让出事件循环、每 6 小时最多一次）。

## D-101 AI 洞见：正文就地的洞见视图

（2026-10-03，模块联动迭代 7b；见 `docs/knowledge-loop/` 的 KL-058 / KL-059 与 15 详细设计）

- 背景：7a 有了元信息与本地「相关」，但 AI 没有参与判断，用户看不到「哪里该连、哪里重复或矛盾、哪里可以延伸」。正文常驻标记、侧栏列表、独立页面三版都被否决（打扰、太密、离开正文）。
- 选择：点「✦ AI 洞见」后正文就地进入洞见视图——读（扫光 + 真实阶段说明）→ 点亮（正文上方报告卡：位置两三句、数量签、随连接生长的小关系图、可以继续想的问题；标记按正文顺序逐处画出：可连接蓝实线、重复灰点线、矛盾红波浪线、可以展开段尾淡注，每篇 ≤ 6 处、可以展开 ≤ 2 条）→ 气泡处理（连接 / 记为问题 + 不相关）或逐条看 → 退出。连接由用户确认后把原文片段包成 content-link。分析一次 = 本地宽候选 + 一次模型调用（新槽 `contentInsights`），结果存主库 `content_ai_insights`（67 表），只在用户点击时运行。
- 不做 / 已知边界：正文常驻提示、后台与全库分析、不经确认的连接、AI 写正文或生成卡片、选中文字问 AI、外部材料的洞见；创作模式（左白板右写作）以后单独设计。视图里不切编辑器只读，用「点正文或输入即退出」代替（避免反复撤销 AI 编辑上下文与协作在线状态）。
- 实测：deepseek-flash 20 篇真实笔记平均每篇输入约 4,500 / 输出约 450 token、约 3 秒；2 万卡 + 3000 长文夹具下本地候选长文约 0.5 秒、卡片约 0.16 秒。

## D-100 笔记元信息、卡片 AI 标题与脉络「相关」

（2026-10-03，模块联动迭代 7a；见 `docs/knowledge-loop/` 的 KL-053 至 KL-057、13 详细设计与 14 验证记录）

- 背景：卡片没有标题，各处现取正文前 N 字；AI 洞见需要每份正文的概括作原料；脉络只有显式关系，看不到「语义相近但还没连上」的内容。
- 选择：① 主库新表 `content_ai_meta`（66 表 / 110 索引），按 `content_id` 一次生成标题、要点、概念、主张；后台模块 `content-ai-queue`（BACKGROUND）串行处理，功能槽 `contentMetadata`「笔记元信息」配上即处理全部、清空即停止，设置页只有说明（含首轮 token 估算）与进度行；正文 MinHash 相似度低于 0.7 才重算，换模型不作废。② 卡片标题收敛为主进程 `contentTitles` 与渲染端 `cardTitle`，AI 标题 → 正文开头，只替换当作卡片标题的调用点。③ 脉络「相关」：本地近邻、不调模型，排除已有关系，随机对 p95 动态阈值，最多 5 条，不计数，卡片之间可添加连接。
- 不做 / 已知边界：阅读时标记（7b）、回顾与雷达（7c）、悬停预览与命令面板用要点、「相关」单条忽略与 LLM 复核、移动端显示 AI 标题、手动改标题。元信息行无其他关联时入口不渲染，「相关」也看不到。已打开的编辑器窗口标题不实时刷新。
- 实测：标题评估 deepseek-flash 120 / 120，标题显示宽度最长 23；重度库首轮约输入 1390 万、输出 350 万 token。「相关」在补 `<s>` 修复后的本地 bge-m3 向量上前 5 召回 60.5%（缺陷向量上为 0%，修复 `ee7ab9fb3` 尚未进入 master）。2 万卡 + 3000 长文：无变化对账 25 ms、2 万张卡标题 21 ms、「相关」查询约 78 ms。

## D-099 长文按节检索与定位

（2026-10-02，模块联动迭代 6a；见 `docs/knowledge-loop/` 的 KL-047 至 KL-049、KL-052 与 11 详细设计）

- 选择：长文按节索引并带标题路径，卡片整张；节信息存索引库 `content_sections`（11 张核心表），向量 / 全文带 `chunk_index`；切块口径版本进入主内容嵌入指纹，静默重建，全文检索独立可用。命令面板与 AI 检索返回命中节；详情页经 `openEntity` 的 `at`（块序号）定位，脉络「被引用」回到来源块，探究对话经对话页参数 `entry` 定位到消息。主库不变（65 表 / 110 索引）。
- 撤回（同日）：选区 / 整节抽成卡片、选区转为问题、引述锚点、`question_link.anchor`、卡片创建 `origin` 均已删除（`bb9118b8e`）。理由：卡片、文章是输出，疑问只在输入与审视时产生（KL-052）。
- 边界：`anchorId` / content-link `blockId` 留在 6b（未排期）；不做 AI 生成和节级地图。移动端运行时、博客、插件未改。
- 实测：15 万条 1024 维向量检索平均约 129 ms；15 节节点的知识地图 `neighborsOf` 平均约 2.03 s。
- review 修复（2026-10-03，`e2b8b4684`）：节位置按正文版本分存，全文重建不删向量；卡片 / 摘录超长仍切块；向量召回多取再去重；知识地图近邻改用节向量均值一次查询；对话 entry 不在当前分支只提示不切换；`:ref` 的 block 进共享 remark 插件。切块口径升到 2。

## D-098 问题枢纽：转为问题经命令面板、探究对话表、以此立项与对话页种子参数

（2026-10-02，模块联动迭代 5；产品与技术细节见 `docs/knowledge-loop/` 的 KL-039 到 KL-045 与 10 详细设计）

- 背景：问题只能在问题页或命令面板手动记下，材料只认我的笔记；读书划线、PDF 标注、对话里的疑问无法一步成问题，问题攒够材料也无法升级成 Notebook 课题。
- 选择：① 问题材料扩到划线 / PDF 标注 / 剪藏（`question_link`，仍只存整数 id）；问题与对话的关联另立主库表 `question_chat`（会话 UUID 不塞进整数列），问题详情单独成「探究对话」分区。② 「转为问题」统一经 `services/question-capture.ts` 唤起命令面板的记问题模式（来源 chip + 可选默认标题），入口只在单书页划线、PDF 标注列表、主对话用户消息三处。③ 「以此立项」新建 Notebook，材料作资源一次性带入（新资源类型 `material`），谱系 `upgraded_to`；Notebook 目录顶部显示来源问题。④ 对话页新增参数 `seedQuestion`：新对话首条消息前置问题上下文，登记后挂成探究对话并记谱系 `discussed_in`。⑤ `EntityPicker` 类型超过 5 种时改用按钮 + 菜单。
- 不做 / 已知边界：编辑器选区、PDF 选区、闪卡答错、插件侧栏、AI 回答的「转为问题」；对话材料只记到会话（消息 id 已存，打开定位在迭代 6）；立项后不自动同步新材料。

## D-097 外部材料入库：摘录表、材料类型层、命令面板「摘录」范围与打开到原处

（2026-10-02，模块联动迭代 4；产品与技术细节见 `docs/knowledge-loop/` 的 KL-031 到 KL-038 与 09 详细设计）

- 背景：微信读书划线只在一整列 JSON 里、插件划线只在插件本地、PDF 标注与剪藏不进向量，读过的东西搜不到、AI 引用不到，也无法从划线写成卡片并记住出处。
- 选择：① 主库新增 `excerpt`（微信读书与插件划线一条一行，唯一键 `(source_type, external_id)`，源端删除软删除保留引文）；PDF 标注、剪藏已是行，直接指向。② 三类外部材料合称 `MaterialRef`（`src/entity/material.ts`），由谱系端点收纳，不扩 `EntityRefKind`：材料不进知识地图、不挂脉络入口；展示信息由主进程 `material:resolve` 统一解析，打开统一经 `services/open-material.ts`（单书页参数 `bookmark`、PDF 页参数 `annotation`、网页带 `#tau-hl=<划线 id>` 交给插件定位、剪藏打开所在网页条目）。③ 材料进主库向量与全文索引；命令面板新增「摘录」范围（覆盖划线 / PDF 标注 / 剪藏），材料结果以引文为标题、出处为次行，点击打开到原处（正文类结果仍跳模块列表页，D-003 注记不变）。④ 「转为卡片」只在微信读书单书页与 PDF 标注列表，复制成文献卡片并记谱系 `excerpt_of`。
- 不做 / 已知边界：`@` 引用摘录（迭代 6）、摘录自身的脉络、全部摘录页、插件笔记记来源网页；插件 RPC 端口没有鉴权（另开任务）。

## D-096 脉络补来源、衍生、被使用；谱系表 entity_lineage 取代 content_link

（2026-10-02，模块联动迭代 3；产品与技术细节见 `docs/knowledge-loop/` 的 KL-023 到 KL-029 与 08 详细设计）

- 背景：内容离开所在模块后不记得从哪来、去了哪（对话里的回答存成卡片、Notebook 笔记复制进项目、卡片生成的闪卡、放进白板或被待办关联）；主库 `content_link` 只记录网页条目 → 剪藏解析文档一种关系。
- 选择：① 主库新增谱系表 `entity_lineage`（端点 `LineageNode` 含对话、Notebook 笔记、剪藏解析文档、闪卡，id 存文本，弱引用不级联删除），只记推导不出的事实；`content_link` 迁入后删表（桌面开库 / 下载校验 / CLI 与移动端同口径迁移，D-091）。② 浮层分区顺序：来源 → 连接 / 引用了 → 被引用 → 也出现在 → 衍生 → 被使用 → 相关问题，全部计入「N 处关联」；来源已删除保留灰显一行，衍生已删除不显示。③ 来自白板的关系（放入、思维导图节点关联、白板文字里的引用）统一归「被使用 · 白板」，经索引库 `whiteboard_refs` 按元素类型解析，不在查询时扫画布。（AI 回答「存为卡片 / 文章 / 生成闪卡」曾实现后按用户意见撤回，见 KL-024 / KL-025。）
- 不做 / 已知边界：插件笔记的来源 URL 留待摘录迭代；对话来源只打开会话、不定位到消息；PDF / Notebook / 视频笔记里的对话作为来源只展示不可点。

## D-095 知识地图：全局页面，入口在标题栏；卡片库去掉图谱视图

（2026-10-02，模块联动迭代 2；产品与技术细节见 `docs/knowledge-loop/` 的 KL-005、KL-020 至 KL-022 与 07 详细设计）

- 背景：图谱原是卡片库的一个视图，只含卡片；而卡片、文章、项目文档合在一起才是知识的全貌，比侧边栏条目高一层。
- 选择：① 新页面 `knowledge-map`（`features/knowledge-map`，match "single"，参数 `focus` = 节点键），不进侧边栏；入口是标题栏搜索框右侧、AI 对话开关左侧的 `IconButton`，在卡片 / 文章 / 项目文档详情里点击时带上当前内容为 focus；地图在栈顶时按钮选中，再点后退回原处。命令面板手写一条页面命令。② 节点为卡片、未删文章、非引用型且有正文的项目文档，外观不区分类型（KL-021）。③ 卡片库的「图谱」视图移除，视图偏好里存的「图谱」回落到卡片墙（KL-022）。④ `LinkGraph` 输入改为通用的 `GraphItem`，节点展示信息由主进程随地图返回。
- 不做 / 已知边界：日记不进地图；节点标签筛选未做（只有类型与项目）；段落级节点见迭代 6。

## D-094 详情页「脉络」：元信息行关联计数 + 浮层，卡片连接区并入

（2026-10-01，模块联动迭代 1；产品与技术细节见 `docs/knowledge-loop/` 的 KL-015、KL-018）

- 背景：卡片、文章、项目文档需要看到与其他内容的关系（被谁引用、共用正文、是哪些问题的材料）。卡片原有的「连接」区（D 卡片详情 2026-09-20：正文下方、有关联才渲染）只覆盖卡片之间，且与新增的关系信息分处两地。
- 选择：① 元信息行末尾显示「N 处关联」，点开 `Popover`；没有任何关联时不渲染，正文区不增加区块。② 浮层分区：卡片的「连接」（links ∪ 对任何实体的内联引用，双向链接可解除，底部「添加连接」）；文章、项目文档为「引用了」（正文出链）；其后依次是被引用（来源 + 原文片段，被引用的标题点亮）、也出现在（共用正文）、相关问题。③ 卡片正文下方的连接区移除，⋯ 菜单「添加连接」保留为无关联时的入口。④ 「连接」分区由卡片域经 `ContextBadge` 的 `leading` 插槽传入，脉络域不依赖卡片域。
- 不做 / 已知边界：日记页暂不挂入口；移动端不展示；「有新的被引用」等弱提示待使用后再议。

## D-093 AI 对话工作目录：按对话记录，设置只给默认值；对话栏显示目录与分支

（2026-10-01，用户提出：设置里可配工作目录，对话上方显示当前目录与 git 分支，可直接换目录、切分支）

- 背景：渲染端从未传 cwd，pi 的 bash / 读写文件一律落在应用数据目录 `~/.editor`，无法让 AI 在用户的项目里干活。03 指南「AI 代理统一」原写「不提供工作目录选择」，本条取代其中工作目录部分（代理选择仍不提供）。
- 选择：① **按对话记录**，存 `chat_session.cwd`（表里早已预留，无需改 schema）；设置 `agentWorkspace.defaultCwd` 只是新对话的默认值。不做「全局一个目录」：改一处会让其它对话下一轮悄悄换到另一个仓库执行命令。② 草稿首轮登记时**快照**目录（草稿选的或当时的默认），之后改默认不搬动已有对话；早于本功能的空目录行跟随默认。③ 换目录**下一轮生效**：与换模型同一条重建路径，宿主从会话文件恢复，历史不丢；子代理继承对话目录。④ 目录不存在时退回 `~/.editor` 并在对话栏提示，不让 pi 拿着坏路径起不来。⑤ 对话栏：输入框正上方一行（最初放在标题行下方，同日用户改到输入框上方——目录是「这次发送在哪执行」，贴着输入框更直接），目录菜单（完整路径 / 选择目录… / 使用默认目录 / 在访达中显示）+ 仓库分支菜单（本地分支单选，切换即 `git checkout`，失败原样提示 git 的说明）；对话进行中禁用，免得一轮命令跑到一半换地方。
- 场景目录（同日用户追加）：可选目录只给主对话（对话页 / 停靠栏）。**学习项目对话固定在该项目资料转换出的 Markdown 目录** `~/.editor/vibe-learning/<库名>/<项目 id>/`——AI 在这里直接 `rg` / 读原文，不再需要另配路径；渲染端把带所属对象的 `chatScope` 交给宿主，主进程按场景解析（目录约定 `vibeLearningMarkdownDir` 与资料转换落盘共用，还没有资料时先建出空目录）。PDF / 视频笔记对话不传目录，留在应用数据目录。场景对话都不提供自定义路径、不显示对话栏、不受设置默认值影响。
- 不做 / 已知边界：新建分支、远端分支、worktree 管理、stash；浏览器扩展对话仍固定在应用数据目录。

## D-092 驾驶舱列表（项目 / 数据库 / Notebook）网格 / 列表排布与最近打开

（2026-10-01，用户确认 `mockups/projects/view-toggle.html` 方案 A；同日追加数据库与 Notebook 同样改造）

- 背景：三个驾驶舱列表只有网格（置顶 hero 段 + 全部紧凑卡），无法换排布，也没有「最近打开」——回到上次看的条目只能靠记忆翻网格。参照 PDF / 微信读书书架补齐，取代 D-031 的「无排序 UI」与置顶 hero 段。
- 选择：① **网格 / 列表两种排布**，切换入口在工具栏，用「按钮 + Menu」（命令项高亮当前项，不用 Segmented / Radio，同 D-024 追记口径），按模块存本机偏好；② **条目没有封面，网格即卡片**——标题、两行简介、「上次看到」条（有记录才显示）、meta 行，同行等高；③ **网格顶部「最近打开」续读行**（最近 3 个打开过的条目），列表不放这一段，由「上次打开」列承担；④ **排序**：最近打开（默认）/ 最近更新 / 名称 / 创建时间，置顶在任何排序下都排最前（带星标），原置顶 hero 段并入全部区；列表可点列头排序；⑤ **「上次看到」按模块取**：项目 = 上次停留的文档（从列表打开时带 `itemId` 定位过去）；Notebook = 上次打开的资料或笔记（详情页本就按 Notebook 在本机恢复上次打开的条目，列表只打开 Notebook）；数据库没有子条目，只记打开时间。
- 数据：打开记录一律**不改 update_time、不记 operation**——打开不是内容修改，「最近更新」排序与同步都不应被它扰动；各表补列走 `upgradeTable`，表 / 索引数不变。
  - 项目：`project` 加 `last_open_time` / `last_open_item_id`（`30_project.sql`）。`project:record-open` 在详情页进入或切换文档时写（不带文档只刷新时间、保留上次文档）；`project:open-states` 返回 projectId → 打开时间 + 上次文档（已删除或移出项目时为 null），独立 queryKey（`Project` 实体被广泛共用，不往里加字段）。
  - 数据库：`database_item` 加 `last_open_time`（`31_module_split.sql`），`database-item:record-open` 在详情页进入时写，列表汇总直接带 `openedAt`。
  - Notebook：`vibe_learning_project` 加 `last_open_time` / `last_open_kind`（resource / note）/ `last_open_item_id`，`vibe-learning-project:record-open` 随详情页打开的条目写（生成任务、新建笔记只刷新时间）；列表汇总按 kind 取资料名或笔记标题，条目不属于该 Notebook 或已删除时为 null。详情页的恢复仍读本机 `vibe-learning-opened-<id>`（含生成任务等临时位置），数据库这份只供列表展示。
- 实现：形态收口共享驾驶舱——`EntityCockpit`（`prefsKey` 分区偏好）+ `EntityCards`（续读卡 / 网格卡 / 列表行）+ `CockpitToolbar`，排序与时间展示是 `model.ts` 纯函数，偏好在 `prefs.ts`；`CockpitItem` 增加 `createTime / openedAt / lastItemTitle`，`CockpitCopy` 增加 `metricLabel / recentHint`、去掉只给 hero 卡用的 `badgeLabel`。模块只提供数据、文案与身份色。
- 未做：卡片菜单「从最近打开中移除」、用户自定义封面——有需求再议。

## D-091 最后数据升级必须完成后才能连接

（2026-10-01，用户确认新版仍需为存量数据完成最后一次迁移）

- 当前版本承担最后升级；后续版本在全部存量库、会话、同步包与合法配置迁完后删除历史转换代码，并拒绝旧数据输入。当前模型版本、主库 schema 版本与同步信封版本是不同口径，不以修改同一个数字伪装完成迁移。
- 聊天迁移只有全部源行成功后才记完成标记，失败保留旧表与已迁行身份，下次重试；树合并保留无关分支为独立会话，实际读写失败不得清关系或记完成。
- 维护连接与同步下载重连按库共用在途任务，先完成迁移及旧表退役，再缓存数据库并通知界面。失败关闭新连接、回传错误，不降级进入或继续删除旧表。
- 迁移完成后的当前用户配置、备份恢复、依赖初始化与并发防重入继续作为正常能力存在，删除的是旧格式转换与死入口。

## D-090 取消旧内容打开 RPC 名称与模块死协议

（2026-10-01，用户保证所有客户端可升级）

- 不保留 tab.open 兼容注册；桌面及扩展统一使用 content.open，参数为当前内容引用的 type/id，继续经 openContent 定位 Page。
- 块预览只走 block.preview.open，删除旧内容打开接口中没有消费者的重复预览分支。
- 删除没有消费者的 ON_DEMAND 层级、批量初始化、全部／单模块状态、Layer1 状态接口与后台完成广播，以及死状态记录和专属类型；保留现有业务使用的单模块就绪、依赖排序与防重入。
- 用户确认新版仍需为存量数据完成最后一次迁移；历史数据与配置转换按最后升级链退役，不长期保留旧版本兼容。合法配置的当前读写和当前模块就绪保障仍是产品能力。

编号口径：D-042 只指订阅退役，D-043 只指 navSlots，D-047 只指白板列表，D-088 只指数据库日期单元格。问题页历史决策原有两个重复标题，合并改号 D-089；旧代码把聊天/辅助栏误引为 D-047 的地方改为职责说明，当前会话及页面接管协议仍见 D-065/D-070。

## D-088 数据库日期单元格：时间条方案（范围轨道 + 相对时间）

（2026-09-30，mockups/date-cell/ 三方案评审：A 排版层次 / B 日历签 / C 时间条，用户选 C）

- 文案规则三方案共用：±1 天用「今天 / 明天 / 昨天」，本年省略年份，时间去秒；范围同月省略结束月份、跨年两端写年份、同日只写一次日期；悬停提示给完整绝对日期（含星期）。
- 范围单元格是一条轨道：进行中 accent-soft 填充到「现在」+ 刻度 +「剩 N 天」；未开始虚线斜纹空轨 +「N 天后开始」；已结束整条 hover 灰 + 时长；只有开始日期渐隐填充 +「至今 · 已 N 天」。单日期附相对提示（3 天后 / 4 周前），今天 accent、已过去降 ink-3。
- 不用 danger 标「逾期」：日期列不知道自身语义（截止 / 生日 / 会议），过去只降灰；如需逾期语义另加列配置。
- 窄列靠容器查询逐级退化：<190px 去相对提示，<130px 去时间，主文案最后截断；看板卡片同一套规则。
- 实现：`DatePlugin/utils/dateUtils.ts` 的 `describeDate` 纯函数产出展示模型，Renderer 只渲染；相对时间由共享分钟时钟 `useMinuteClock`（useSyncExternalStore，全表一个对齐整分钟的定时器）驱动刷新。
- 同批修复 DateRangePicker（见 D-017 追记）。
- 同批修复单元格编辑提交丢值：编辑器在同一事件里先 `onCellValueChange` 再 `onFinishEdit`（日期「确定」、Enter 等），`useCellEditor` 保存读 state 拿到的是上一拍草稿，导致首次不保存、下次打开才带出。改为草稿同步写 ref、保存与校验都读最新草稿（`finishEdit`，校验抽纯函数 `validateCellValue`）；表格 `Cell` 每次进入编辑以当前值重置草稿，杜绝旧草稿回写覆盖外部修改。其他编辑器里的 `setTimeout(onFinishEdit)` 绕法不再必要，存量不动。

## D-087 跨端 Less 退役与基础样式收口

（2026-09-30，清理实施）

- 桌面及 shared 的活跃 Less 消费者迁为组件附近的静态 Tailwind 类串，颜色只消费 tau；保留交互、内容排版与动态尺寸，不以改扩展名伪装退出预处理器。
- 必要 keyframes、白板文本遮罩及浏览器 highlight 伪元素保留为普通 CSS。桌面根排版/字体变量、拖拽区和滚动条归 app/base.css；根基础规则覆盖独立窗口及 body Portal，组件 reset 继续限制在 .app 内。
- shared 类串由各消费端已配置的 @source 收集；检查桌面、扩展、博客、移动端的类型/构建，不能仅验证桌面。Less 消费者清零后收缩依赖、预处理配置和声明。
- 只执行源码、行为、类型和构建验证，视觉验收由用户完成。

## D-086 卡片数据库视图归域与用户配置隔离

（2026-09-30，清理实施）

- CardDatabaseView 与专属 CardLinksPlugin 仅卡片页消费，归 features/cards/components；通用 Database 留在共享层，不反向依赖卡片域。
- 视图、筛选/排序/分组、活动视图及列宽按库持久化。旧 card-database-views 没有库身份，作为首次初始化模板保留；各库深拷贝后独立修改，已有新配置优先。新状态保存成功后清旧键，迁移失败保留旧数据。
- 删除旧全局 store、未使用的 ref/searchResults 端口和直接全量更新卡片的兜底；卡片元数据写入统一交域 mutation。数据库实例仍不受控，外部配置经 external 命令接线，跨库重建实例，保活不清草稿。
- 视图重排忽略未知/重复 ID，并保留未包含的现存视图；生成本地视图 ID 时防同毫秒冲突，避免清理期间丢配置。
- 用户配置继续持久化，不转成服务器查询，不删除卡片业务表；视觉验收仍由用户负责。

## D-085 测验数据与弹窗作答会话拆分

（2026-09-30，清理实施）

- 测验集、题目、历史和最高分按库及项目/测验查询；前台写入绑定原库并拒绝切库旧闭包，事务提交后通知刷新原库。最高分以主进程聚合取代逐测验加载全部历史。
- 每个测验弹窗持有独立作答会话与题目快照，成绩保存会话开始时的项目/测验身份；提交互斥并复用同一在途请求，失败保留答案以便重试，取消/切库拒绝迟到结果认领新会话。
- 主进程校验测验仍存在且成绩所属项目一致，拒绝删除后的迟到题目/成绩；不允许旧调用形成孤儿记录。
- 后台生成仍由任务执行器常驻运行，继续使用原库命令，只失效原库查询；不操纵当前项目或选中测验。删除 useVLQuizStore 与 vl-quiz-store 缓存，不迁移跨库歧义的项目/测验 ID。
- 测验表、历史成绩、题面组件与生成任务保留；不改变评分口径，沿用 D-080 不做视觉验证。

## D-084 数据库行详情重做：Dialog 内双栏（正文 + 属性栏），实时保存，按视图行序切换

（2026-09-30，已定；用户裁决）

- 背景：行详情是 720×760 的小窗，头部是通用标题「行详情」、真正的行标题排在第二行；每个属性行常驻拖拽手柄、铅笔、垃圾桶；标签列与值之间空得太开；属性与正文之间有一条分隔线；正文里的视频挤不下。编辑先存在本地、关闭时一次性 `onSave`，四个视图各自重复一套打开 / 关闭 / 保存逻辑。D-026 条目里「RowDetailModal 保留 CustomModal 壳」早已不符（此前已改用 Dialog），本条一并取代。
- 方案对比（`mockups/row-detail/`）：A 侧边速览（非模态抽屉，类 Notion Peek）/ B 文档页（居中大纸、横幅封面、三列属性网格）/ C 双栏（同一张纸里左正文、右属性栏，类 Linear）。用户选 **C**。
- 选择：
  - 承载：沿用 Dialog，新增 `header` 插槽替换内建标题行与 ×（焦点圈闭、Esc、PortalScope、退场动画都要，另写模态壳会重复一遍）。头部 = 视图名 › 行标题 · 第 N / M 条 · 上一条 / 下一条 · 更多（删除此行）· 关闭。Database 组件拿不到库名（多宿主复用），面包屑用当前视图名——上下条本来就按视图行序走。
  - 布局：右栏 320px 透明、不另起卡片，封面取第一个有图的图片列（大图预览，增删仍在图片属性行里；加载失败不留空白也不写「加载失败」，按行 id 派生粉彩渐变兜底，与画廊卡、文章卡同一色板）；属性行的编辑 / 删除收进属性名点击菜单，拖拽手柄只在悬停时出现在左侧固定槽位；空值显示「空」，空属性折叠成「还有 N 个空属性」。窄于 960 退化单栏（编辑器独立窗口的数据库块最小 480 宽），同一棵树 CSS 重排。
  - 数据：入参改为 `rowId`、从 store 实时读；属性与标题实时写回（与表格单元格同一套草稿 / 校验 / `transformBeforeSave`），卸载时补存且写回所属行；正文沿用「离开时创建内容」。上下条读 `projection.rowIds`，四个视图无需额外传行序。
- 不做：A 方案的非模态抽屉；行级创建 / 更新时间（行数据没有这类字段）；正文首次输入即建内容（会让编辑器中途切到协作文档模式、丢光标）。
- 影响：`packages/ui` Dialog（`header` + 单测）；`components/Database/components/RowDetailModal/`（重写，拆 `RowDetailHeader` / `TitleField` / `PropertyRow` / `utils`，含单测）；`hooks/useRowDetail`、`constants/viewType`（视图图标表从 ViewTabs 抽出）；四个视图改接 `rowId` / `onDeleteRow`，删除各自的 `handleSaveRowDetail`。03 指南 §5 Dialog 使用边界、Database 小节同步。

## D-083 日程数据缓存与界面状态拆分

（2026-09-30，清理实施）

- 日历、分组、日期窗口日程与待办来源状态统一走日程域 react-query，查询键包含数据库身份及窗口/筛选；命令绑定原库，旧闭包在切库后拒绝发起新写入。
- visible 字段作为日历显隐唯一来源，不再在全局 store 重复持久化日历 ID。视图、分区展开与当日面板偏好迁入 tau-schedule-preferences；旧键迁移成功后清除，编辑与合并状态不持久化。
- 数据库事务提交后通知所有窗口刷新对应库；番茄完成直接写表的路径补同一通知。查询聚焦和保活重新挂载刷新继续兜底。
- 删除 useCalendarStore 与无独立职责的 useCalendarEvents 包装；SearchPalette 消费域查询和 mutation。主库 schema、历史升级、番茄会话与待办同步逻辑继续保留。沿用 D-080，不进行视觉验证。

## D-082 退出窗口分组初始化链

- 删除无调用方的 module-init:init-for-window、渲染端导出和窗口到模块组映射。模块不再通过窗口类型隐式拉起。
- 删除只服务该映射的 ModuleGroup 配置与无消费者的配置查询 helper；保留 IMMEDIATE/BACKGROUND/ON_DEMAND 层级、依赖排序、显式 initModule/initModules、状态查询、防重入及 ensureModule/withModule。
- 按需加载仍须有显式调用方并通过模块分层测试；本次不删除窗口路由或窗口类型的业务入口。

## D-081 Page 迁移期字段与未兑现协议退出

- 页面迁移已完成，删除 PageStatus、legacy/migrating/new 状态字段及 LegacyPendingPage；缺失组件统一使用可恢复错误态，不再显示迁移说明。
- definePage 的 data/store/canLeave 和 keepAlive 策略没有运行接线与业务消费者，删除这些未兑现字段。当前保活仍由 PageHost 的 Activity 与栈机 LRU 负责，行为不变；未来守卫、实例 store 或数据恢复须作为独立能力实现后再引入协议。
- 保留双注册表、参数净化、single/params/multi 去重、面包屑与浮层退场仲裁；不会为字段收缩增加旧页面兼容层。

## D-080 桌面旧主题退役与验证分工

- 明暗的 JavaScript 事实源为 `@tau/themes/react` 的 themeStore.mode；偏好与系统解析继续由公共运行时负责。桌面设置不再保存 darkMode、accent、backgroundType、backgroundGlow 或 backgroundAnimation，图片外观设置保留。
- 删除旧 th 变量定义、accent 预设、useThemeColors/useBackgroundMode/useSyncTheme；存量 UI 消费 tau 变量和语义类，不保留另一套配色派生。
- 局部主题使用 data-theme/data-mode；演示和沉浸舞台的 UI 浮层通过 PortalScope 留在舞台作用域。dark 变体当前承诺单层局部明暗，多层嵌套的呈现作为后续视觉问题处理，不扩展导航或页面协议。
- 字体 DOM 写入统一归 App 根的 useSyncFont，设置 store 只负责数据和持久化；旧 body 字体覆盖由根 hook 清除。
- 用户要求 Agent 后续不进行视觉验证、截图对照或浏览器视觉走查。视觉验收由用户完成，问题记录后按 bug 修复，不阻塞架构清理；类型检查、行为测试、构建和结构门禁继续执行。

- **追记（2026-09-26，概况改抽屉）**：用户要求闪卡首页右栏（近 7 天评分 / 未来 7 天到期；选中卡组时为卡组概况）同番茄 / 待办一样改为右侧 Drawer。常驻右栏去掉，列表占满宽度；`OverviewSide` / `DeckSide` 移进非模态 `StatsDrawer`（top-0，Esc 经 `useOverlayDismiss`），由工具栏「概况」按钮开关（打开时 soft 态），默认关闭；抽屉内容随当前范围切换（今日总览 ↔ 卡组）。

## D-042 RSS、稍后读与博客 RSS 全面退役（2026-09-24，已定）

- 决定：删除订阅阅读域及博客 RSS 输出，不迁移新桌面，不保留 feed 占位；此前 feed 迁移待办由本裁决取代。
- 边界：删除 FeedView、首页预览、RSS/稍后读命令与类型、主进程四模块、四张表、扩展稍后读 RPC、博客 RSS 生成和入口。保留已另存文章、项目文档、视频笔记、剪藏、B 站通用集成与发布。
- 数据：桌面与 CLI 复用独立退役迁移；移动端执行相同规则。遇到旧表先备份含 WAL 的专属快照，再事务删除；恢复旧库重新备份，失败阻止启用相关数据库。
- 发布：旧 rss.xml 通过下次正常发布的差异计划删除，上传或 Git 推送失败保留旧产物及历史；升级不访问远端。publicUrl 仍用于打开站点。
- 兼容：恢复时过滤旧 Tab、模块设置、搜索历史并清理专属缓存；不保留业务兼容空实现。

> 只记对后续开发仍有约束力或防翻案价值的裁决：
> ① 排除记录——「为什么不做 X」，防止重新讨论已否决的路线；
> ② 活约束的原始出处——被 02/03/AGENTS 或代码注释以编号引用；
> ③ 未完成事项的锚点。
> 不记：已外化到规范/指南正文的内容、已物化为代码现状的一次性事实（更名/迁移/修复过程）——
> 那类做完即止，翻 git 与代码即可。状态：`已定` / `待确认` / `已推翻`（推翻必须写理由）。
> 条目纪律：精要（结论/依据/排除/验证各一行，过程叙事留 mockups）；条目外化完成即满足删除判据，删除时同步清理编号引用。
> 2026-09-17 按上述口径清理 15 条一次性条目后**重新编号为 D-001 起**（删除与映射记录见 git）；此后编号只增不重排。

---

## D-001 样式载体：Tailwind 优先 + 语义化类名，废弃模板导出工作流

- 背景：壳层/首页初版样式经 mockups HTML 模板"脚本导出"为 shell.css（119 类）+ 域内 CSS（home.css/stats.css），存在三个问题：①导出脚本未入库，"先改模板再导出、禁手改"流程不可复现，规范与现实脱节；②类名非语义化且强依赖模板 DOM 结构（board/nav-item/todo-row…）；③与"新代码只写 Tailwind 语义类"单轨制自相矛盾（03 §4 却规定不自创 Tailwind 视觉类）。
- 选择：样式载体改为 **Tailwind v4 工具类优先**——颜色走既有 `@theme inline` 语义类（bg-page/text-ink-1…），尺度（字号/圆角/阴影/缓动）补进 `@theme` 用 `tau` 命名空间词（text-tau-_/rounded-tau-_/shadow-card/ease-tau-out，不覆盖 legacy 在用的默认刻度）；一次性展示字号（热力图轴标/统计大数字）允许 `text-[24px]` 类任意值；跨域复用视觉模式收口为 `ui/` 组件（Panel/IconButton…），组件内写 Tailwind。
- CSS 保留白名单（仅四类，逐例裁决、默认不许）：`.app` 作用域全局 reset（base.css）、@keyframes（经 `--animate-*` 消费）、主题数据块（tokens.css，机制不动）、Tailwind 表达不了的个别复杂伪元素/全局状态。
- mockups HTML 降级为视觉参考（浏览器对照截图），不再是导出源；调视觉直接改组件。视觉基准（A2 柔和版）地位不变，仅维护方式变更。
- 推翻：03 指南 §4"组件 className 与模板类名 1:1 / 禁手改 shell.css / 先改模板再导出"；shell.css 约 90 个无消费者的预置模板类（palette-_`/card-`_/detail-_`/btn-`_ 等）直接删除，将来做对应页面时用 Tailwind 语义类重写。
- 影响：AGENTS.md「UI 与主题」、03 指南 §2/§3/§4、02 规范 §3/§5.4、redesign/README 同步更新；tokenContract 语义词（bg-surface/bg-hover 等）全局唯一归属 `--tau-*`（tailwind.css 旧手写同名类删除，经核实零有效消费者）。

## D-002 Page 协议词汇与浮层边界

- 桌面端与移动端同名同构：definePage / *.page.tsx / src/page/ / PageProvider / usePage / data-page-key（原 Surface 词汇 2026-09-16 全面更名，git mv 保留历史）。
- **浮层（dialog/drawer）不经 definePage**`——协议只承载页面；浮层承载方式须先在 DECISIONS 裁决（命令面板见 D-003）。`
- 排除（撞名不同义，不随更名动）：主题 token **`bg-surface`**、白板 `wb-node-surface-*`、移动端自己的 surface 词汇。

## D-003 命令面板（全局搜索浮层）承载方式与 Esc 浮层仲裁

- **追记（2026-09-20 用户裁决）：移除「Esc=后退」**——Esc 只承担浮层退场（LIFO 语义不变、浮层内输入框的 Esc 同义），无浮层时无操作。起因：文章详情页按 Esc 整页回退到列表，误触即丢编辑上下文。后退归 Alt+←/→ 与标题栏后退按钮；`overlayDismiss.test.tsx` 三例断言同步（全关后不再断言回退）。

- 承载 = app 壳层挂载的 feature 级浮层（`features/search/SearchPalette`，fixed 定位，不经路由与页面栈；可 import `app/navigation.ts` 纯数据清单，与侧栏同源）。交互定稿 = mockups/search/ 方案 A「统一混合面板」+ 用户追加（类型多选、前缀追加、全角冒号、退格删筛选、IME 组合中不改写）。
- Esc 仲裁收口 PageProvider：浮层退场注册表（`useOverlayDismiss`，Map 保序 LIFO）——Esc 先关最上层浮层，优先于编辑上下文与后退；Ctrl+K/P 面板自监听 toggle。命令源 = navigation.ts 全量 + 已接线动作（不造假）；内容检索复用 legacy searchHybridContent 管线（react-query 防抖，未配 embedding 走 FTS）；空态「最近访问」来自 searchStore（localStorage `tau-search-history`；不复用旧 useNavigationHistoryStore——绑旧 TabType）。
- 追记（同日用户裁决）：结果区改**相关性平铺**（命令置顶，内容不分组不收起）；摘要提取用双端同构 `utils/richTextText.ts`；主题动作为深浅直切（不循环 system）。
- 追记（2026-09-21 用户裁决）：**二级页不进命令面板**——访问记录只存 page key，params 页（card-detail/article-detail）缺 id 无法回跳（无参 push 被参数净化整条拒绝，条目点了没反应），故写入端（AppShell）与展示端（SearchPalette 空态「最近访问/常用」）共用 `isReplayableVisit`（`match === "single"`）过滤，存量 localStorage 记录同此不展示；`searchMeta.test.ts` 守护。
- 已知限制：检索故障时空态与错误态混淆（待管线迁移区分）；Tab 圈闭/焦点恢复已做最小版，完整收口留通用浮层基建（§9 任务 4）。LIFO 语义由 `overlayDismiss.test.tsx` 守护。
- 影响：03 指南 §2/§5/§9 任务 3；tokens.css 补 `--color-overlay` 映射。

## D-004 Tooltip 与浮层定位引擎选型：自研 JS mini 引擎（方案 B）

- 三路线（mockups/tooltip/）实机验证后裁 B：Portal + 自研 mini 引擎（`tooltipPosition.ts` 纯函数：offset(8) → flip → shift(视口 pad 8) → arrow 投影，单测守护）。方案 A（popover + CSS 锚定）留档——三条决定性保守性：CSS 无任意 shift、`safe anchor-center` 布局异常（Chromium 146 实测）、UA popover 样式须显式重置。方案 C（伪元素/title）禁入产品代码；floating-ui 不引入（自研 ~100 行可测，够用再加）。
- `Tooltip.tsx`：Portal body + fixed z-[300]；箭头 8px 旋转方块、尖端单角 2.5px、中心落边框外缘；行为内建 hover intent 450ms + 400ms 重开免延迟、focus-visible、aria-describedby、disabled 子包 wrapper、动态锚 rAF 跟随；受控 `open`（§5.3）。反相配色 `bg-ink-1 text-ink-inverse` 零新增 token；不接 Esc、不进退场注册表（瞬态非阻断）；不承载交互内容（那是 Popover/Menu）。
- 首批接入 stats 页（消灭原生 title）；Menu/Select/Popover 复用本引擎扩展中间件。
- 追记（引擎 bug 修正，各补单测）：① shift 加闸门——锚点与视口不相交时不夹（否则离屏锚点的 tip 被钉在视口边堆叠上浮）；② flip 判空间按主轴占位尺寸（左右位比宽度，原一律比高度误判）。样板间侧：锚点由示意圆点改真实控件（tooltip 的宿主就是按钮）。

## D-005 组件样板间：独立 Vite MPA + ui/primitives 真实现

- 承载 = 独立 Vite MPA（`showcase.html` + `src/showcase/`，端口 6199，script `pnpm showcase`），不经 definePage（开发工具页不进导航栈）。展品一律 import primitives 真实现零复刻；常显标本用受控态（Tooltip `open`、Toast `ToastPill` duration=0、hover 类直施）；样式全 Tailwind 语义类；主题复用 themeStore。三轮视觉迭代后定稿「全主题色版」：配色零发明，说明文字 ≥ ink-2。
- 追记（v5，用户裁决）：去掉展品底色块（FloorContext 删），层级简化为 page → surface 卡 → 展品，展品直接坐 surface 卡上。
- 排除：Storybook/Ladle（8 档案规模 YAGNI）；mockup HTML 长期样板间（复刻漂移，降级留档）。
- 维护义务：新增/改 primitives 或 token 须同一提交同步档案（registry + section），不一致视同文档腐化。`Toast.tsx` 为此导出 `ToastPill`/`ToastItem`（仅样板间消费）。
- 追记（档案文案口径，用户要求：样板间用来看组件的各个状态和写法，看组件写得对不对、样式对不对）：档案页文案只承担两件事——组件长什么样（状态/样式取值）、怎么用（API/交互）。决策痕迹（裁决日期、`D-0XX`/`§` 章节引用、M0/M1 里程碑、待裁决事项）、运行环境元数据（端口、入口类型）、z-index 台账、测试守护链一律不进口页面，归 DECISIONS.md / 03 指南。同轮移除页脚状态栏与各档案的此类注记。
- 追记（壳层滚动）：根节点补 `grid-rows-[100vh]`（对齐 `app/AppShell.tsx`）——隐式行按内容撑开时整页跟文档滚，侧栏与 titlebar（含主题切换）会滚出视口，`nav`/`main` 的 `overflow-y-auto` 因此失效。
- 追记（壳层滚动·滚动手感，用户要求：侧栏不跟随页面滚动 + 滚动条参考首页、hover 才出现）：根节点再加 `overflow-hidden` 锁死文档级滚动；侧栏自身不滚动——头部（logo）`shrink-0` 固定、滚动收口在条目列并接 `useEdgeFade`（同真实 Sidebar，矮窗口下 logo 不再被条目列拖着滚走）；内容滚动条走 `-mr-6/pr-6` 借位进 `px-10` 右留白，离窗口右缘 16px（同首页 home-scroll 手法：内容盒右缘不动，与 titlebar 版心仍是同一条竖线）。hover 显形沿用全局协议，未新增机制。

## D-006 表面阶梯重排（bg-group/bg-sunken 下沉）+ 侧栏激活态改 bg-selected

- 缺陷（前轮样板间审阅只记录未修，本轮修复）：`bg-group` 夹在 page 与 surface 之间两头读不出（对 surface 1.062 / 对 page 1.073，sunken 同病），而其消费点都要"在周围底色上显形"；侧栏激活态用 bg-hover 承担"选中"太弱。
- 修复：① **`group/sunken 沉到 page 之下`**（唯一能让同一底色在 page 与 surface 都显形的解）——cream `group` #faf6ec→**#ece4d4**、`sunken` #ece5d4→**#e2d8c0**；cocoa 镜像 **#19150e / #100d08**；② cream `ink-2` 压深 #736552→**#6a5c49**（原对 page 4.89 无余量，压后全档 ≥4.5）；③ group 上的 ink-3 按 §2.3 口径改 ink-2（EmptyNote/kind 徽章/SearchPalette 页脚三处）；④ 侧栏激活态 **`bg-selected`**，文字保持 ink-1（避免三重 accent），悬停仍 bg-hover；⑤ parity 补三条 AA 断言 + 02 规范新增 **§2.6 表面阶梯铁律**（四档单调有序、相邻 ≥1.10、加深须复核其上墨色）。
- 排除：不动 page/surface（"纸 + 卡"观感承担者）；不整改 ink-3 存量 sub-AA（装饰档，另案）。
- 影响：两主题 .theme.ts + tokens.css + parity 测试、Sidebar、Panel、HomeView、SearchPalette、样板间复刻；02 §2.3/§2.5/新增 §2.6。
- 验证：parity 6 项全过、tsc 0 错误、双主题样板间目验（真壳层未启动——会动真实数据库，结论来自同 class 复刻 + 对比度实测）。
- **2026-09-20 追记（group 取值再平衡，用户裁决「每个用 group 的地方都不好看」）**：group 的消费点已从本条裁决时的小面积元素（kbd 提示、kind 徽章、次级按钮）扩展到 Tag、Panel、DatePicker、编辑器工具条、值展示条等大面积容器，1.09/1.25 档的显形度对容器过重、观感显脏。取值收敛：cream #ece4d4→**#f0e9d8**、cocoa #19150e→**#1e1912**（对 page 1.045/1.044、对 surface 1.191/1.197，两主题对称）；「沉到 page 之下」的方向与阶梯单调性不变，ink-2 对 group 对比度余量反而放大（cream 5.13→5.36、cocoa 6.60→6.34），parity 6 项复跑通过。

## D-007 Select 基础件：API 形态方案 B（数据驱动）+ 表单控件家族 surface 口径

- mockups/select/ 三方案（A 复合 `Select.Option` / B 数据驱动 options / C 无头 hook）裁 **B**，范围「M0 受限版完整可用，扩展零预埋」：`SelectOption<V>`（value/label/disabled/group/searchText，字段对齐 antd）+ 受控 `value/onValueChange`（M0 无清空路径，**回调收窄 ********`(v: V)`****）+ 浮层受控 ****`open/onOpenChange`****；不做**多选 / 异步 loading / 虚拟化 / renderOption（扩展全在数据形状里生长，预埋即自否）。
- 视觉：表单控件家族 = **surface 亮底 + line-1 描边**（用户两轮裁决 sunken→group→surface；白卡上同底靠描边显形）；层级 z-[250]（面板 101 < Toast 200 < Select/Menu 250 < Tooltip 300）。
- 实现裁决：① 定位复用 D-004 引擎——`computeTooltipPosition` 加 `gap` 参数（默认 8，Select 传 4），flip 后 side 即 data-dir，不另建 menuPosition；② **Esc = 焦点链 LIFO 不进 D-003 注册表**——仅 open 态在组件 DOM 消费（stopPropagation），closed 态零参与，ui 不反向依赖 page/；③ 不抽 useSelectCore（含内部不预拆）——单消费者预拆只是搬家，Menu 落地时按两例交集抽 listbox 导航 hook。行为内建：键盘全表（type-ahead 400ms）、aria 选中/高亮两态、外点关闭、焦点归还、scroll/resize 重定位、关闭清搜索词。
- 影响：新增 Select.tsx + select.test.tsx（10 例）+ 样板间 SelectSection；tooltipPosition 加参；02 §2.3、03 §9 勾选。
- 验证：select + tooltip + overlayDismiss 28 例全过；tsc 0 错误；样板间双主题目验。

---

## D-008 className 覆盖机制：cn()（clsx + tailwind-merge + 尺度词登记）

- 背景：`IconButton` 承诺「尺寸微调靠 className 覆盖」（侧栏头写 `size-[27px]`，样板间同款示例），但 Tailwind 同属性工具类的胜负由**生成顺序**决定、clsx 的先后顺序无效——实测 `size-[27px]` 被默认 `size-[30px]` 吃掉（按钮仍渲染 30px），`MatrixRow` 的 `trayClassName="items-center"` 同样被默认 `items-start` 吃掉。覆盖失效是静默的，只在样板间对照时才看得出来。
- 选择：`ui/cn.ts` 导出 `cn = twMerge(clsx(...))`，primitives 与样板间 kit 的 className 合并一律用它；项目自有尺度词（`text-tau-*`/`font-tau*`/`rounded-tau-*`/`shadow-card|float`/`ease-tau-out`/`animate-hm-pulse`）在 cn 内登记进对应 classGroup——tailwind-merge 不认识它们，不登记时会把 `text-tau-meta` 与 `text-ink-2` 判为同组互删（静默丢字号，实测复现）。
- 排除：让调用方写 important（`size-[27px]!`）——把机制缺陷转嫁成逐个记忆负担；改组件 API（尺寸 prop）——样板间与侧栏头已按 className 演示，且覆盖诉求不止尺寸。
- 验证：`packages/ui/src/__tests__/cn.test.ts` 守护①词表与 tokens.css 的尺度词一一对应（新增 token 漏登记即红）②合并语义（同类覆盖取后者、字号与语义色不相残）；样板间 IconButton 档案目验 27/30 两标本图标共线。

## D-009 档案内标识块底色回正：代码 chip / 路径徽标 → surface 亮底 + 描边

- 缺陷：定稿稿（`mockups/showcase/plan-a-inspector.html`）里代码 chip 与路径徽标都是"比周围亮"的浅底药丸，实现却落 `bg-sunken`（最深档）——D-006 把 group/sunken 沉到 page 之下时没复核这两处归类，行内小药丸因此变成重色块（用户观感「代码块颜色太深」）。补一步验证又发现：改投 `bg-group` 只是「浅一点的褐块」，在深色主题下几乎融进 page（chip #19150e vs page #221d16），既没达到定稿稿的亮底观感、也读不清。
- 选择：代码 chip（MatrixRow 说明、API 表）与 DocHead 的 src 徽标统一为 **`bg-surface` + `border-line-1` 描边**——与 D-007 表单控件「亮底+描边=浮起物」同一语言，浅色下是白药丸、深色下比 page 亮，两种主题都显形；`bg-sunken` 退回「进度轨道 / 凹陷画布」专档，`bg-group` 只服务 group 语义（kbd 提示、徽章、标签、次级按钮、EmptyNote）。
- 排除：调 `sunken` 取值——治不了「把最深档用在文字行内」的归类错；统一透明底+描边——在白卡内的 chip 会与卡片底同色，失去药丸感。
- 验证：`theme-parity.test.ts` 补 `ink-1` 对 `bg-group` ≥ 4.5（更严，次级按钮场景）；02 §2.3/§2.5 措辞同步；样板间双主题目验代码 chip 与 src 徽标（浅色 #fffdf9 / 深色 #2e2820，均带 line-1 描边）。

## D-010 Menu 基础件：方案 B「现代产品」形制 + 复合组件 API + useListNavigation 抽取

- 宽度追记（2026-09-20）：Menu、子菜单和 ContextMenu 默认按内容宽度展开，移除 224px 最小宽度；最大宽度为 320px 且不超过视口减去两侧各 8px，长标签省略。调用方仍可用 className 指定宽度。
- 背景：Menu 三方案设计稿（`mockups/menu/`，A 经典桌面 / B 现代产品 / C 密集工作台，同内容共行为只换皮），2026-09-17 用户裁决方案 B。技术底盘非分歧点：定位复用 D-004 引擎（`computeTooltipPosition` gap 4，主层 bottom-start/end、子层 right-start 锚父项、右键锚 = 命中点 0 尺寸虚拟 rect），Esc 走焦点链 LIFO 不进 D-003 注册表（同 D-007 Select 口径：子菜单 → 主菜单 → 关闭还焦触发器）。
- 选择：① **形制 = 方案 B**——行 34px 药丸（rounded-tau-sm + 2px 行距）、勾选 = 显式控件（15px 方框填 accent / 圆圈内点）、快捷键 kbd chip（surface 亮底 + 描边，D-009 口径）、danger 高亮实心红底反色字、图标随需出现无图标不留空位；② **API = 复合组件**（`Menu.Item/.CheckboxItem/.RadioGroup/.RadioItem/.Submenu/.Separator/.Group` + `ContextMenu` 右键承载，trigger 克隆注入）——菜单项是异构序列（命令/开关/单选/分隔/子菜单），数据驱动必须发明 DSL；**D-007 的「数据驱动」是 Select 单选语义下的裁决，不外推到 Menu**；③ **语义分界**：命令项触发即关整树、checkbox/radio 触发不关（连续操作），danger 不做二次确认（确认归 ConfirmDialog、撤销归 Toast，D-003 家族分工）；④ **useListNavigation 抽取**（D-007 预告兑现）：环游移动/边缘直达/type-ahead 三段纯逻辑成 `ui/primitives/useListNavigation.ts`，Select 与 Menu 共用；抽取顺手修复 Select 存量隐患——全 disabled 序列 + 方向键原实现会死循环（do-while 回不到起点 -1），hook 改计数守卫环游。
- 排除：A/C 形制（行高/勾选/danger/图标列四维度必须整体三选一，拼盘必割裂）；数据驱动 API（上述）；子菜单进场动画（动态挂载两帧动画换不来可感知收益、换来测试与时序复杂度，主层动画保留 160ms fade+位移已够）；子菜单嵌套超一层（可渲染但不测，YAGNI）；菜单内搜索（长清单用 LIMIT 渐进）。
- API 补充：`Menu.Submenu` 支持 `disabled`，已展开的头项再次点击收起并还焦父层；`ContextMenu.className` 与 `Menu.className` 一致，控制浮层，内容区尺寸由 children 的真实元素承担。type-ahead 只读取声明树中的文本，不执行自定义组件以提取其渲染结果。
- 运行时：`useMenuTree` 统一维护整树关闭、容器登记、外点和跨实例互斥；关闭回调读取最新 props。任意层 Tab/Shift+Tab 关闭整树，还焦触发位置后保留浏览器默认焦点移动；子层键盘事件不重复驱动父层导航。
- 验证：`__tests__/Menu.test.tsx` 覆盖触发即关/开关不关/radio 互斥/子层键盘与退场/Home·End/受控开合与回调更新/禁用子菜单/外点/右键/全局单开互斥；`__tests__/useListNavigation.test.tsx` 守护导航边界，`select.test.tsx` 守护复用回归；样板间「Menu · ContextMenu」档案提供 LIVE 标本、状态矩阵与 API 备忘。

## D-011 Dialog/ConfirmDialog 基础件：方案 B「现代产品」形制 + 三件嫁接

- **2026-09-20 追记（头部可选 icon + subtitle）**：初版头部纯文字（大标题 + context 徽标），弹窗迁移实践中多个场景（闪卡编辑、AI 生成、选择卡组）需要图标身份与次级说明位。Dialog 新增可选 `icon`（16px、ink-2、随需出现）与 `subtitle`（标题下 meta 说明行）两个 props——不传时保持纯文字形制，「阻断通知纯文字头部」的克制口径仍是默认。

- 背景：Dialog 三方案设计稿（`mockups/dialog/`，A 经典桌面 / B 现代产品 / C 密集工作台，同内容共行为只换皮），2026-09-18 用户裁决方案 B。技术底盘非分歧点：居中模态不需要 D-004 锚定引擎；**Esc 走焦点链 LIFO（DOM 内消费 stopPropagation，同 D-007/D-010 口径）**——设计导览稿原建议接 D-003 useOverlayDismiss 注册表，实现期推翻：该 hook 在 `page/PageProvider`，ui 基础件接入即反向依赖 page/（Select 已立的铁律）；且 Dialog 打开即焦点圈闭，Esc 必然先落在卡片 DOM 上，焦点链 LIFO 天然成立，无需注册表仲裁；表单控件沿 D-007 surface 口径；家族分工沿 D-003（Menu 不确认，确认归 ConfirmDialog、撤销归 Toast）。
- 选择：① **形制 = 方案 B**——体内大标题 16px/650 + hairline 应答区（主按钮最右）+ blur 遮罩（overlay + backdrop-filter 4px）+ 进场 scale(0.97)+translateY(8px) 200ms，与 Menu B/Toast/命令面板同一浮层语言；② **嫁接三件增量元素**（不破坏形制）：上下文徽标（自 C，标题动作化「删除笔记本」、操作对象挂 chip 随需出现）、footer 影响行（自 C，hairline 左侧念后果，信息一处一责——标题讲动作/徽标记对象/正文讲事实/影响行念后果/按钮文案不带数量）、滚动渐隐（对齐壳层 useEdgeFade 协议的 edge fade，**替代 C 的标题栏阴影方案**——用户点名对齐项目既有 edge fade）；③ **尺寸档是预设不是牢笼**（用户裁决）：sm 380 / md 440（默认）/ lg 560 之外允许 `width` 任意值覆盖，预设给常见场景、业务特殊版式不必硬凑档位；④ **danger 两档**（用户裁决）：轻 danger 一步确认（实心红 + 影响行），真·不可逆（删笔记本/清空废纸篓）才 type-to-confirm 输入对象名解锁。
- 行为契约：critical（无 ×、遮罩/Esc 点击抖动拒绝、仅按钮作答）与 dismissible 分界 = 是否允许不带答案离开；初始焦点 danger/critical 落取消、表单落首输入框、其余落主按钮，关闭归还触发器；Tab 圈闭；Enter = 默认应答（IME isComposing 让位）；loading 态（spinner + aria-busy）封锁一切关闭路径，完成自动关闭 + Toast 回执；仅 body 区滚动（头尾钉住、上限 78vh）；打开锁定底层滚动。z 序：遮罩 340 / 卡片 350（面板 101 < Toast 200 < Select/Menu 250 < Tooltip 300 之上；Toast 压过遮罩的层序实现期复核）。
- 排除：A/C 形制（标题形制/按钮顺序/footer 形制/遮罩材质四维整体三选一）；C 的主按钮在左（WinUI 顺序，与已定稿浮层家族的 mac/Linear 顺序相反）；C 的标题栏阴影渐显（被 edge fade 嫁接取代）；**阻断通知的 icon 头**（40px soft 圆底 → 17px 内联两轮实机试验均被用户否决——大色块/图形在纯文字头部里「不一体」，最终纯文字：标题 + 徽标，分量由 critical 行为与文案承担）；统一尺寸默认（业务决定，组件默认 md 仅兜底）；danger 全档 type-to-confirm（行为税，轻危险劝退）。
- 影响：`ui/primitives/Dialog.tsx` + `ConfirmDialog.tsx`、`__tests__/Dialog.test.tsx`、样板间「Dialog · ConfirmDialog」档案、03 指南 §5 使用边界小节与 §9 任务 2 勾选、base.css 的 `.edge-fade-scroll` 去 `.app` 前缀与滚动条四条规则全局化（Dialog Portal 在 body 级，不在 .app 子树内；滚动条须盖掉 main.less 对 body 级浮层的宽条+内阴影，hover 显隐由 scrollbarAutoHide 的 document 级事件委托天然覆盖）；`mockups/dialog/plan-b-modern.html` 已更新为定稿口径（A/C 留档对照）。另：徽标底色实机反馈从 bg-group 回正 surface 亮底 + line-1（对齐 D-009）；阻断通知 icon 头两轮试验（40px 圆底 / 17px 内联）均被用户否决。
- 验证：`__tests__/Dialog.test.tsx` 8 例（开合 aria · 关闭矩阵三态 · Tab 圈闭与焦点归还 · 尺寸档/width · type-to-confirm 门槛/Enter 应答/重开重置 · loading 封锁与即关）；tsc 0 错误；顺手修 Menu.test 存量类型错两处（sub/head 非空断言）；样板间双主题目验。

## D-012 ConfirmDialog 异步确认语义（原 Scroller 收口当日被推翻删除）

- 背景：ConfirmDialog 的受控 loading 存在 React 快照竞态——调用方在 onConfirm 里才 set loading=true，handleConfirm 同步判断 `!loading` 已按 false 立即关闭（样板间导出演示「loading 一闪而过弹窗即关」，与 mockup 行为不符，用户实机反馈）。同日曾为此间引出的滚动区收口需求新建 Scroller 基础件（edge fade 接线 + 滚动条样式一处收口，四消费者迁入），并在滚动条观感上多轮调优（gutter 内容间距 / barInset 滚动条右缘内缩 + 端部呼吸）。
- 选择（保留项）：① **ConfirmDialog onConfirm 支持 Promise**（async 函数天然满足）——自动进入 loading、resolve 自动关闭、reject 保持打开（错误就地处理）；受控 `loading` prop 保留给多步进度，注释里写明不能在 onConfirm 里才 set loading 的快照陷阱；② base.css 滚动条四条规则全局化（去 .app 前缀，对抗 main.less 对 body 级浮层的污染）与 `.edge-fade-scroll` 去 `.app` 前缀（Dialog Portal 在 body 级）——这是 Dialog 滚动条正确性的修复，与组件无关，继续有效。
- 推翻（2026-09-18 用户裁决）：**Scroller 组件删除**——`Scroller.tsx` / `Scroller.test.tsx` / 样板间档案移除，Dialog/Sidebar/StatsView/ShowcaseApp 回退手写三件套（edge-fade-scroll 类 + useEdgeFade + callback ref），`.scrollbar-inset` 规则一并删除（gutter/barInset 能力不复存在）。滚动区仍以手写三件套为标准接法，edge fade 与滚动条 hover 显隐行为不变。
- 追记（同日第四轮）：删除 Scroller 后用户单独裁决——**仅 Dialog** 的正文滚动条做专属形制（勿外推，其余滚动区维持全局 4px）：thumb 4px 宽 + 2px 圆角；**上下 4px 间距加在 track（轨道）上**（轨道透明上下边框缩短 thumb 活动区，thumb 自身无边框、圆角不被侵蚀——thumb border 通路吃圆角、margin 通路无效、渐变自绘被否，track 是间距的正确宿主）；**距右缘 4px = 滚动容器自身的透明右边框**。失败通路留档：thumb 透明右框挤位（伪元素 clip 不可靠，墨条被裁掉一半）、-mr/pr 借位（卡片无外层留白，滚动条被推出卡片外）。关键认知：伪元素上做位移/裁剪都不可靠，布局级偏移才是正路；圆角上限受墨条宽度钳制（宽的一半）。

## D-013 Button 基础件：方案 B「现代产品」形制 + 六变体音量阶梯

- 背景：Button 三方案设计稿（`mockups/button/`，A 纸面凸版 letterpress / B 现代产品 / C 密集工作台内嵌 kbd，同变体集同状态机只换皮），2026-09-18 用户裁决方案 B。API 面非分歧点（02 §5.2/§5.3 已定：variant × size sm/md、forwardRef、focus-ring 全局口径）；第一消费者是 ConfirmDialog 应答区 BTN_BASE——其注释「Button primitive 落地前在此收口，落地后迁移」的欠账由本定稿偿还。
- 选择：① **形制 = 方案 B**——primary 是 accent 实心 + 1px 微投影（color-mix accent 40%），hover 换 accent-hover、active brightness 压暗，反馈是「光」的不是位移的；secondary = surface 亮底 + line-1 描边 hover 边框加深（D-007/D-009 浮起物口径，即 ConfirmDialog BTN_SECOND 原样）；soft = accent-soft 平底（工具栏次级强调，比 secondary 轻、比 ghost 重）；ghost = 无底 hover 淡墨（与 IconButton 同反馈语言）；danger 两档对齐 D-011 危险分级——实心红只给确认位，列表/工具栏一律 soft；② **六变体 × sm 28 / md 34 × 六状态**（default/hover/press/focus-visible/disabled/loading），radius 10 走任意值 `rounded-[10px]`（ConfirmDialog 已开先例，词表不为一档圆角扩档）；③ **loading 上收为内建语义**——aria-busy + Spinner + `loadingText` 文案切换 + 一并 disabled（原生属性同时封锁指针与 Tab 队列），ConfirmDialog 的手动 Spinner 拼装退役；④ 图标仅左位 16px stroke 1.75（`icon={Plus}`），icon-only 归 IconButton 不设档；⑤ ghost 无底色，disabled 单独提到 opacity 0.55（公共 0.45 在浅底上几乎不可辨，mockup 实机自检修正）。
- 排除：A 的 letterpress 暗边与按压位移（暗边需派生 token、cocoa 下 group 次级是「洞」辨识度弱——三案暗账已披露）；C 的密度（sm 24 贴命中面积下限、12px 字在 1080p/125% 缩放下发糊）；C 的内嵌 kbd（可嫁接件，真有带快捷键的按钮位再议，YAGNI 未嫁接，`shortcut` prop 暂不建）；radius 增补 token（上述任意值口径）。
- 影响：`ui/primitives/Button.tsx` + `__tests__/Button.test.tsx`；ConfirmDialog 的 BTN_BASE/BTN_PRIMARY/BTN_PRIMARY_DANGER/BTN_SECOND 四常量删除，footer 两按钮改用 Button（主按钮 busy 走内建 loading 语义，spinner/aria-busy/disabled 一体），`canConfirm` 保留为 handleConfirm 守卫；样板间「Button」档案（LIVE 变体全谱 + 状态矩阵 + 尺寸/block + loading 实试标本）；03 指南 §5 使用边界与 §9 任务 2；`mockups/button/plan-b-modern.html` 更新为定稿口径（A/C 留档对照）。
- 验证：`__tests__/Button.test.tsx` 9 例（变体/尺寸/block 类落地 · type 默认与透传 · disabled 原生封锁 · loading 语义四件套 · loadingText 缺省保持 children · icon 左位 · cn 覆盖合并非静默失效 · ref 转发 · data-_/aria-_ 透传）；Dialog.test.tsx 9 例回归全绿（ConfirmDialog 迁移无行为回退）；tsc 0 错误；样板间双主题目验。

## D-014 Popover 基础件：方案 B「现代产品」形制 + 浮层公共底盘抽取（useAnchoredPosition / FloatingArrow / mergeRefs / useLayerDismiss）

- 背景：Popover 三方案设计稿（`mockups/popover/`，A 经典桌面 / B 现代产品 / C 密集工作台，同内容共行为只换皮），2026-09-18 用户裁决方案 B。设计稿同步回答「与 Tooltip 能抽多少公共」：定位引擎早已公共（D-004），真正的账在引擎之外——定位跟随 useLayoutEffect / 箭头几何 / ref 合并在 Tooltip、Menu、Select 三处各有一份近似实现，Popover 是第四消费者，按「两例交集才抽」（D-007 原则）本次一并兑现。家族分工：Tooltip 瞬态说明（hover/focus、不可交互）、Menu 命令面板、Select 表单值选择、Dialog 模态决策、Toast 回执；Popover 收「点击触发、内容可继续操作」的非模态浮层。
- 选择：① **形制 = 方案 B**——无标题栏内容卡（surface + line-1 + radius-lg + shadow-float）、头行随需（icon 圆底 + 标题 + ghost ×，色板/成员卡可无头行零框架税）、footer 随需（hairline 之上按钮右对齐）、8px 菱形箭头 surface 档（与 Tooltip 同几何）、进场 translateY(4px)+scale(0.98) 160ms 方向随 flip——与 Menu B/Toast/Dialog B 同一浮层语言；② **API = 复合组件**（`Popover.Header/.Body/.Footer` + trigger 克隆注入）——内容任意（说明卡/过滤器/色板/成员卡），数据驱动无 DSL 可言，同 Menu 复合裁决不外推反例；③ **行为**：click toggle 内建（hover 说明归 Tooltip、右键归 ContextMenu，不设 trigger props）；定位 D-004 引擎 **placement 12 向全表的首个消费者**（gap 8、宽随内容 180–340、无 matchTriggerWidth 概念）；Esc 焦点链 LIFO（同 D-007/D-010/D-011 口径，不进 D-003 注册表）；Tab 移出即关（非模态不圈闭，还焦触发器后浏览器续移）；初始焦点落 `data-autofocus`（无则卡片自身）；受控 open（§5.3）。
- 公共底盘四件抽取（同提交兑现）：① `tooltipPosition.ts` → **`anchoredPosition.ts`**（函数更名 `computeAnchoredPosition`，Tooltip/Menu/Select/测试引用点同步；`TooltipPlacement` 等类型在 Tooltip.tsx 保留别名，存量引用不动；箭头投影写入 `applyArrowPosition` 与 ARROW_SIZE/ARROW_TIP_OFFSET 常量同住引擎文件，组件文件只导出组件）；② **`useAnchoredPosition`**——三处同构的「双遍进场定位 + scroll(capture)/resize rAF 合并重算」收口，Tooltip 特有的 rAF 轮询动态锚参数化为 `pollAnchor`，Select 的 minWidth 写入走 `onPlace` 回调，内容尺寸变化经 ResizeObserver 自适应重定位（评审修正：初版以内容 props 做 `deps`，父级无关 re-render 也会换 identity 导致整个生命周期重挂，改为观察浮层自身尺寸，jsdom 无 RO 静默跳过）；③ **`FloatingArrow` + `applyArrowPosition`**——箭头几何与投影写入组件化，配色两档（tooltip 反相 ink-1 / surface 亮底），宿主约定 `group/float` + `data-side`；④ **`mergeRefs`**——三处克隆注入的 ref 合并收口。有意不抽两件：hover intent（Tooltip 特有瞬态意图判定，click 语义无对应物）、触发器事件注入（hover+focus 与 click 键盘开合事件集不同，合并即「参数选模式」复合体）。
- **useLayerDismiss（登记制外点仲裁）**：外点关闭（pointerdown capture）+ 嵌套链（子层触发器落在哪个已开层 DOM 内即为其子层，Portal 兄弟无法 contains 判定）+ 顶层互斥（开新层关非祖先链层）+ **层序分配**（登记时按全局开合序递增 zIndex：React 深度优先提交让嵌套浮层的 portal 先于宿主插入 body，同 z-[250] 时 DOM 靠后者绘制在上、子层反被父层盖住——2026-09-18 用户实机反馈「高级选项被一级盖住」；内联 zIndex 覆盖静态基线，后开恒在上，Dialog 340 / Tooltip 300 不走本表不受影响）。消费者：Popover/Select 走 hook；**Menu 的 useMenuTree 卸下外点监听与 activeMenuClose 互斥单例**——两套监听并存时同一 pointerdown 双关，受控 onOpenChange 会收到两次回调（测试实测），职责单化到 dismiss 层；MenuSurface 逐层登记（主层 isAnchor+getAnchorEl 传根触发器、子层 getAnchorEl 传父项），useMenuTree 只剩受控 open 与整树关闭还焦。useMenuTree 的 registerContainer 容器登记随之删除（子层自身即独立层，链判定取代容器集合）。
- 迁移口径（antd Popover）：`trigger="hover"` 用法迁 Tooltip、`trigger="focus"` 逐例复核（focus-visible 显示归 Tooltip）；placement 12 向同名直映；title/content 二分对应 Header/Body；04 删除清单随锚点事件补章节。
- 影响：`ui/primitives/`（Popover.tsx 新增；anchoredPosition.ts 更名；useAnchoredPosition/FloatingArrow/mergeRefs/useLayerDismiss 新增；Tooltip/Menu/Select 改造为消费者）、`__tests__/`（tooltip.test.ts → anchoredPosition.test.ts 更名、popover.test.tsx 新增）、样板间「Popover」档案（Dialog 之后，四种头行形态 + 嵌套链演示）、03 指南 §2 目录树 primitives 补齐 / §5 Popover 使用边界 / §9 任务 2 勾选、`mockups/popover/plan-b-modern.html` 已标注定稿口径（A/C 留档对照）。Popover.Body 滚动条：thumb 走全局 4px 细墨条（Dialog 的 track 间距/圆角专属形制勿外推，D-012），但**距右缘 4px 的透明右边框挤位手法扩展到 Popover**（2026-09-18 用户实机反馈：滚动条贴容器右缘）——D-012「勿外推」收窄为 thumb 形制不外推，右缘内缩是浮层滚动区的通用口径。
- 验证：`__tests__/popover.test.tsx` 11 例（开合 aria 与 labelled-by 接头行 · data-autofocus 初始焦点 · Esc 两处消费不冒泡还焦 · Tab 放行默认行为 · 触发器键盘开合 · 外点/浮层内点击/× · 嵌套链不误伤 + Esc LIFO · 顶层互斥 · 受控 open · 箭头 prop）；既有 65 例回归全绿（Menu 65→58 内含子层链路经 dismiss 层重验）；tsc 0 错误；样板间双主题目验。

---

## D-015 文章页定稿 A3「月刊」并落地（features/articles）

- 背景：文章页三方案设计稿（`mockups/articles/`，A 杂志书架 / B 档案行 / C 浏览台双栏，2026-09-19 用户裁决以 A 为基础演进；A 系三变体 A1 书架 v2 / A2 密集书架 / A3 月刊，同日裁决 **A3 定稿**）。评审基线（详见 PREFERENCES.md）：新建/导入在工具栏右上角（废除右下悬浮球）、无限滚动（废除手动加载与分页器）、无 banner 文章以 **id 派生色封面**兜底（12 色粉彩板，×7 错开取色，同篇同色、相邻异色）、无页内搜索（全局 Ctrl K）与排序（按月归段即时间序）、sticky 三层（工具栏 44 / 标签栏 38 / 月头 82px）背景连续不透字、「窗口打开」仅 Electron 渲染。
- 选择：① **形态 = A3 月刊**——按月分段（sticky 月头：月份 + 篇数 + 当月字数）+ 段首 featured 双列宽横卡（容器 ≥612px 才 `col-span-2`，窄窗退化单列防隐式列溢出）+ 置顶段在最前；② **数据**：主进程新增 `get-article-page`（轻量分页：不取正文全文，`substr(content,1,1200)` 摘要原料，排序 is_top DESC + update_time DESC，标签 LIKE 过滤）与 `get-article-tag-counts`（tags JSON 逐行解析聚合），渲染端 useInfiniteQuery 窗口 + scroll 触底预加载 700px；月分段为纯前端分桶，与分页流解耦；③ **点击卡片 = Electron 独立窗口打开编辑**（`openArticleInNewWindow`）——article-detail 页迁移前的过渡动线，迁移后改页内导航；④ 操作迁移：置顶 / 删除（ConfirmDialog danger）/ 新建 / 导入 Markdown / 换封面（useUploadResource）/ 演示模式（按需 findOneArticle 拉全文）/ Markdown 导出；**图片 / EPUB / PDF 导出未迁**（legacy antd 弹窗组件，待导出中心迁移时一并处理，首版不挂死入口）。
- 影响：`features/articles/`（page/views/queries/types 四件套）、`src-electron/main/modules/tables/article.ts` 新增两命令（走既有 database tables 注册层，非新模块）、`src/types/article.ts` 增 `ArticlePageItem/ArticleTagCount`、`page/legacy.tsx` 删除 articles 占位；旧资产的删除项已登记于 04 删除清单 §articles（锚点 P-articles：ArticleListView 整目录 + 旧 Tab 三处入口随锚点删；ArticleDetailView 编辑器未迁移，getAllArticles/事件总线/演示态/导出弹窗等共享资产明确保留）。
- 追记（2026-09-19 实机反馈迭代）：① **点击卡片/新建改为页内导航**——新增 `article-detail` 占位页（params 型 definePage，按 id 去重，真实元信息 + 迁移说明，不渲染假正文），独立窗口降级为卡片菜单里的显式动作「窗口打开」（仅 Electron 渲染）；② **sticky 月头与渐隐的兼容定式**——滚动容器 useEdgeFade 关 top（mask 渐隐带与 sticky 实底头互斥），月头 sticky top-0 实底 + 底缘 13px 渐透承担顶部 edge fade（卡片在标题下方淡出，无透明缝）；③ 工具栏摘要补累计字数（分页命令 COUNT 同语句 SUM）；④ **featured 横卡（段首左图右内容双列大卡）被实机否决移除**——即使摘要放宽到 6 行/300 字，横向空间仍大量空白；段内统一竖卡，摘要恢复紧凑策略（数据层 72 字 + 正文两行/封面文字三行省略）。单卡月份"首卡形态不佳"问题随 featured 移除一并消失。
- 验证：tsc 0 错误；vitest page/ui/features 域 240 通过（8 个失败为存量：YtDlp/mcp/CardPreview/DiffHighlightedEditor 等改动前后一致，git stash 对照确认）；mockup 三轮浏览器实测（无限滚动按月递增、sticky 间隙 0、封面零白卡）。

## D-016 hover 变体去媒体查询包裹（触摸屏设备 hover 全灭修复）

- 背景：文章页实机反馈「hover 卡片无任何反应（阴影/浮现操作按钮都不出）、focus-within 正常（选中文字能唤出操作）、重启 dev 依旧」。排查链：类串/cn 合并/覆盖层/Dialog·Toast 关闭态残留/PageHost 保活恢复全部排除后定位——**Tailwind v4 默认把 `hover:` 变体包在 `@media (hover: hover)` 里**，用户设备带触摸屏（高 DPI Surface 类），Chromium 判定 `hover: none` → 全应用所有 `hover:` 规则静默不生效；`group-focus-within` 等无此包裹所以正常。此前"会抖动"说明窗口输入判定在触摸/鼠标间翻转（Windows 混合输入设备常态）。
- 选择：主入口 `src/tailwind.css` 与样板间 `src/showcase/showcase.css` 各加 `@custom-variant hover (&:hover);`——恢复 v3 行为（纯 `:hover`，无媒体查询）。桌面 Electron 产品鼠标永远存在，hoverOnlyWhenSupported 对桌面端是纯伤害；代价是真触摸使用时 hover 态会粘滞，属可接受的边缘。
- 影响：全应用 `hover:` 类行为（侧栏/按钮/卡片所有 hover 反馈）在触摸屏设备恢复；与 `@custom-variant dark` 同位的既有先例。
- 验证：tsc 0 错误、ui 域 91 测试全过；确证手段 devtools console `matchMedia("(hover: hover)").matches` 于故障期为 false。

---

## D-017 DatePicker 组件族：方案 A 经典月历为基座，值形状拆两导出、能力走 prop

- 定向（2026-09-19，mockups/datepicker/ 四方案评审）：A「经典月历」为基座——即点即定、标题钻取（日→月→年代）、六周固定 42 格、界外日可点跨月。B 复合面板并入范围形态，C 输入驱动挂起为 inputMode 候选，D 紧凑迷你挂起待行内消费点出现再裁。
- API 按值形状拆分：`DatePicker`（value: string | null）与 `DateRangePicker`（value: readonly [string, string] | null）两个导出共享日历引擎/弹层契约/触发器皮；时间与预设不另立组件——`precision: "day" | "minute"`（取代 antd showTime，值格式 "YYYY-MM-DD[ HH:mm]" 随之确定）与 `presets`（数据驱动、内容使用方决定、即点即定）走 prop。纯时刻（HH:mm）唯一消费点是 TimeRecordView，暂缓独立 TimePicker 原语。
- 提交模型跟着 precision 走：day 点日期即提交；minute 点日期只挂起，底栏时刻区（自由键入任意分钟 + 步长网格快捷通道）+「确定」显式提交；范围手选走「起点 → 悬停预览 → 终点（自动交换）→ 确定」三道闸，预设一律即选即定。
- 实现：`packages/ui/src/primitives/datepicker/`（calendarEngine 纯函数 + CalendarPanel + TimeField + 两导出），替换同日未提交的初版实现（range/showTime 布尔 prop + 时间戳值模型，无消费者）；database 包 DateEditor/DateFilter 同步迁移（时间戳 ↔ string 桥接放消费侧）。
- 验证：`__tests__/datepicker.test.tsx` + `calendarEngine.test.ts` 22 例（值协议越界拒绝 · day 即点即定 · minute 挂起与确定 · 时刻宽松键入/越界还原/网格选格 · 预设即点即定与命中回显 · 钻取 · 键盘开合/方向键/Enter/Esc 不冒泡 · 禁用日期 · 范围三道闸与反序交换 · 外点关闭）；@tau/ui 全量 130 例回归绿；@tau/ui / apps/desktop 两处 tsc 0 错误；样板间「DatePicker」档案已登记。
- 追记（2026-09-30，数据库日期列实机反馈「范围不知道怎么选」）：① **已有值时点新起点，终点必须重新选**——原实现终点回落到旧值，导致悬停预览失效、一次点击即可确定、提交出逆序值；草稿存在时终点只取草稿，逆序存量值按升序读取与回显。② **双月范围面板隐藏界外日**（`CalendarPanel` 的 `hideOutsideDays`，留空占位保持六周高度）——界外日带范围/端点底色会让同一天在两个面板各出现一次；单日期形态仍保留界外日可点跨月。③ **范围支持 `precision="minute"`**：两月下方各一个时刻区（左开始 / 右结束，默认 09:00 / 18:00），同日结束早于开始时禁止确定并在底栏标 danger；`formatRangeDisplay` 随之支持时刻（同日只写一次日期）。④ **打开期间触发器实时跟随草稿**（`onPreviewChange`），未确定时 accent-text 标记，Esc/外点关闭回到已提交值——提交模型不变，只消除「点了没反应」的错觉。⑤ **时刻框键入后直接 Enter 提交新时刻**——TimeField 先回调新时刻再触发提交，单日期与范围两形态的提交都改读同步记录的最新时刻，不再提交键入前的旧值。

---

## D-018 Input 组件族：方案 A「经典描边」重写，错误态正源 aria-invalid、FormField 归 patterns

- 定向（2026-09-19，mockups/input/ 四方案评审）：A「经典描边」为基线——surface 亮底 + line-1 + focus ring，与 Select/DatePicker 触发器同皮（2026-09-17 裁决延续）；B 槽形 / C 下划线行内 / D 装备化未采纳，D 的装备位（lead 文本后缀 / addon / 密码显隐 / 步进器）等真实消费点出现再裁。
- 边界（用户裁决）：Input 只专注输入的基本能力——错误态正源是原生 `aria-invalid`（无 status prop，容器经 has- 变体响应，视觉与读屏语义锁死同源）；判定（zod）/ 错误文案 / touched 策略归表单层；FormField 移出 Input 归 `ui/patterns` 的 FormRow（02 §5.1 规划位，现 patterns/FormRow.tsx 为未经设计稿评审的占位迁移，勿在此基础上加能力）。
- NumberInput（用户裁决）：beforeinput 事前拦截取代事后标红——非数字字符与粘贴根本进不来；粘贴先清洗（"¥1,200" → "1200"）再插入；合法中间态（"5." / "-"）放行，IME compositionend 兜底，blur/Enter 归一化。实现走原生 addEventListener（React 合成 onBeforeInput 在部分环境回退 polyfill 路径，与生产不一致）。
- 状态优先级（用户裁决）：focus 显式高于 hover——`hover:not-focus-*:border-…` 让位（鼠标悬停聚焦时 hover 色不得压过 accent 描边）；只读 = 框在 + ink-2 + 默认光标 + 零响应（区别于禁用的降透明）。
- 教训：`has(:read-only)` 匹配任意不可编辑后代元素（span / button 全中招）导致 :has() 恒真、盖掉全部 focus 效果——:read-only 必须限定到表单元素（has(input:read-only)）。
- 实现：`packages/ui/src/primitives/input/`（Input / Textarea / NumberInput / numberGuard 纯函数层 + 16 例测试）；mockups/input/ 四方案 + 导览留档；@tau/ui 整包未跟踪期间 index.ts 导出与 Select 的 hover 同步修正随包首次提交。

## D-019 Checkbox / Switch：方案 A 语言重写，Choice.tsx 拆除；新增 bg-track 控件轨道 token

- 定向（2026-09-19，mockups/checkbox/ 与 mockups/switch/）：按 Input 方案 A「经典描边」语言定稿——Checkbox 16×16 视觉格 surface + line-1、选中 accent 实底 + 勾 110ms 淡入（无动效 prop，用户裁决「纯粹一点」）；Switch「轨道是槽、thumb 是浮起物」——未选中轨道消费 bg-track，thumb 恒为 surface + ink-3 描边环（选中后功成身退），选中转 accent。
- 新增语义 token `--tau-bg-track`（用户裁决：组件禁止 color-mix 派生 hack——问题在深色主题取值层解决）：控件轨道（开关/滑杆槽）是部件色，不属表面四档阶梯（D-006「沉到 page 之下」约束不到——深色下 group/sunken 必然偏黑）。取值 cream #e0d6c3 / cocoa #463d31（亮于 surface 使 thumb 可辨）。tokenContract 新增 control 组、02 §2.3 词汇表同步。
- 结构铁律（教训）：Tailwind peer-* 变体只匹配 peer 的后续兄弟（`~ *`）——格子/勾图标放在 input 深层后代会静默失效（勾选无视觉）；必须同层兄弟结构，父级响应用 has- 变体。另：条件互斥的类（bg-track/bg-accent、border-ink-3/border-transparent）走 JS 三元，同传会被 tailwind-merge 判同组只留一个。
- 拆除：Choice.tsx 杂烩文件删除；RadioGroup 原样迁出占位（未经设计稿，待定稿重做）；Tabs 无消费者随拆。
- 实现：primitives/Checkbox.tsx + Switch.tsx + RadioGroup.tsx（占位）+ **tests**/choice.test.tsx 8 例；theme 体系（tokenContract/themes/tokens.css）随 @tau/ui 包首次提交进库。

## D-020 Radio / RadioGroup：环+点形制定稿，API 从 options 数据驱动改组合式

- 定向（2026-09-19，mockups/radio/ 评审后用户拍板「按此实现」）：选中态取**环+点**（line-1 → accent 描边 + 中心 accent 实点 110ms 进场）而非 Checkbox 的实底翻转——「经典描边」语言里状态变化落在描边维度（与 Input focus、Checkbox hover 同一语法），radio 形状本身即语义（圆+心），16px 格上实底挖洞环厚仅 ~4.5px 信噪比低；实底变体留 mockups 对照页。零新 token。
- API 组合式（推翻占位的 options 数据驱动，antd Radio.Group options 不采）：`RadioGroup`（fieldset/legend 组语义 + `value/defaultValue/onValueChange` 受控契约 + `orientation: horizontal | vertical` + `name` 默认 useId + 组级 disabled 走 fieldset 原生传播）包 `Radio`（`value/label/description`）；描述行（label+desc 两行顶对齐）只有组合式能表达。Radio 须在组内用（context 通道），组外退化为裸原生 radio（自传 name）。
- 一处对 mockup 的纠偏：description 字号取 `text-tau-meta`（12.5px）而非设计稿的 11.5px——02 规范说明性正文下限裁决优先于视觉参考。
- 原生 radio 组行为白送不重造：Tab 一次进组（选中项/首个可用项）、方向键移动即选择（roving）、组内互斥；错误态正源 aria-invalid 且选中优先（同 Checkbox）。
- 实现：primitives/RadioGroup.tsx（context + 组）+ Radio.tsx + **tests**/radio.test.tsx 9 例；@tau/ui 全量 163 例绿；样板间并入 ChoiceSection（Checkbox/Switch/Radio 选择控件同档，registry label 同步）。

## D-021 Tag：A+B 结合 II「点 + 软底」定稿，色点落为可选能力；ValueDisplay 族首件出列

- 定向（2026-09-19，mockups/tag/ 三方案 + 两轮结合稿评审）：A 描边+色点 / B 软底 / C 点标记三案，用户裁决取 A、B 结合——先出结合稿 I（彩描边：surface + 1px 分类色描边 + 同源文字），同日追加「A 的点 + B 的背景」出结合稿 II，**终选 II**：soft 底 + 同系 solid 文字 + solid 色点三层同色阶（Notion select 选项语感）；I 与 A/C 留档 mockups 供后续参照。
- 色点是能力而非固定形制：`showDot` prop（默认开；gray 恒无点——无色 = 无分类）。产品内基准形态为纯软底，点留给强调场景。
- 契约：7 色板与 ColorSwatch 同源（red/orange/yellow/green/gray/blue/purple 映射 danger/accent 系/warn/ok/group/info/tag-3）；orange 文字走 accent-text、点走 accent（**分语义位**——文字位与图形位分 token，新主题各自跟随对比度约束）；语义状态复用色板不设 status prop；单尺寸（高 22、tau-sm）无档；长文本 truncate；antd 的 bordered/icon/Clickable/Checkable 一律不迁。
- 纯展示 span（非交互、无命中要求）；`onRemove` 数据驱动显 ×（button + aria-label，伪元素外扩热区 24 不撑破药丸，focus-visible 才显 ring，stopPropagation 防表格行牵连）。
- 编辑浮层裁决：已选区 Tag 不加 onRemove——浮层内标签是纯展示，提交/取消/失焦由编辑宿主（InlineEditCell）统一仲裁，业务按钮绕过仲裁会与焦点域判定打架（用户裁决「让弹窗去处理」）。
- 实现：primitives/Tag.tsx（TAG_COLORS/TagColor 色板契约随迁，ValueDisplay.tsx 剩 ColorSwatch/ProgressBar/Rating 占位）+ **tests**/tag.test.tsx 5 例；零新 token（soft/solid 全既有）；@tau/ui 全量 168 例绿；样板间新建 TagSection。

## D-022 共存期明暗判定收口：`<html>.dark` 类为唯一信号，`setting.darkMode` 退出 DOM 写入

- 问题（2026-09-20，Editor 深色不跟随排查）：新主题（`[data-theme=cream|cocoa]` + `--tau-*`）下编辑器保持浅色，三级判定链全断——宿主不传 `theme` prop；`EditorProvider config.theme.mode` 读旧 `setting.darkMode`（Titlebar 切主题不更新它）；DOM 兜底 `useSystemTheme` 比对 `dataset.theme === "dark"` 而新系统写语义 key。另有三处叠加伤：`.editor` 容器局部硬编码 `--th-text: black` / `--th-accent-soft`（浅色）就近覆盖宿主 `:root.dark` 深色值；旧 `useSyncTheme` 与 `applyAppearanceFromSetting` 双写 `data-theme`/`.dark` 与 `applyThemeToDom` 打架（App 树内 effect 子先父后，mount 时旧写者覆盖新写者）；桌面 `useTheme`（antd ConfigProvider 等消费）同样比对字面值全盲。
- 裁决：明暗**唯一 DOM 写者** = 主题 runtime 的 `applyThemeToDom`；JS 判定**唯一信号** = `<html>.dark` 类（`data-theme="dark"` 字面值仅作旧宿主兼容读法）。`setting.darkMode` 降级为旧设置存储，旧入口 `onDarkModeChange` 转发 `useThemeStore.setMode(cocoa/cream)`，`useSyncTheme` 只留 `data-accent` 同步。编辑器包 `.editor` 不再自定义 `--th-*`，颜色 token 由宿主 `:root` 级级联——桌面 `styles/theme-colors.css`（`:root`/`:root.dark`）、移动端 `styles.css` 桥接块（移动端深色主题下同样被截断，一并修复）；`index.tsx` 容器上的 `styles.dark` 哈希类随之移除（变量块删除后成死引用，且 CSS Modules 哈希类本就命中不了 `dark:` 变体的字面 `.dark`）。
- 实现：`useDesktopEditorConfig` 明暗改从 themeStore `resolved` 派生（`getTheme(resolved)?.mode === "dark"`，accent 色板同源）；`packages/editor` `useSystemTheme` 与桌面 `useTheme` 改读 `.dark` 类；03 指南 §3「主题模式与切换」补「共存期明暗判定」口径。

## D-023 数据库命令分发层错误统一上抛，撤销 `cards:` 前缀豁免

- 问题（2026-09-20，cards 迁移 review）：database 模块分发层的 catch 历史上吞错——`log.error` + `ROLLBACK` 后不 rethrow，渲染端 `invoke` 对失败 resolve `undefined`，调用方无感知失败，`undefined` 继续传播产生更难查的二次错误。cards 迁移时曾以 `eventName.startsWith("cards:")` 前缀给新 scoped 命令族单独开错误通道（渲染端 toast / 错误态依赖 rejection），这是隐式协议：下一个迁移域无从知晓该约定，分发层也随前缀白名单腐化。
- 裁决：**所有**数据库命令失败统一 `throw e` 回传渲染端（rejection）；事务语义不变（先 `ROLLBACK` 再上抛）。旧调用方未 catch 的失败从「静默 `undefined`」变为 unhandled rejection——这是暴露既有债务而非新缺陷，按域在接线时补 catch / toast，不为兼容吞错回退。
- 实现：`database.ts` 分发 catch 移除前缀判断直接 `throw`；cards scoped 命令链路（`assertDatabase` 校验、mutation `onError` toast）行为不变。

## D-024 卡片库交互补齐与 Database 不受控边界

- 卡片详情留待详情页迁移；恢复图谱悬停预览、图谱分类/标签筛选、跨会话偏好、回顶按钮与筛选回顶。新卡片页移除聊天拖拽，不预设后续聊天协议。
- 视图/分类/标签在卡片域按数据库持久化；语义搜索以相关性为序，卡片墙搜索结果不再受置顶/时间分段重排。
- Database 保持不受控：props 只提供初始值，不使用 props 监听同步内部状态。初期的独立展示范围方案由 D-025 替代，查询和交互结果统一计算。
- 外部确认更新不产生新保存回调；内部交互仍经原回调持久化。卡片宿主只推送发生变化的字段，保留内部选择与其他编辑状态。
- 追记（2026-09-20，用户裁决）：**撤销卡片库页内搜索**——工具栏搜索框移除，本页只承担浏览与加工（分类 + 标签筛选），语义检索统一由全局命令面板（Ctrl K，`searchContent` types:["card"]）承担，空态文案改为引导 Ctrl K；与文章页「无页内搜索」口径一致，同一实体不再留两套检索入口。删除 `features/cards/useCardSearch.ts`（含测试）、`filterCards` 的 `searchIds` 参数与相关性排序分支、`CardWallList.searchMode`——本条上方「语义搜索以相关性为序，卡片墙搜索结果不再受置顶/时间分段重排」作废，卡片墙恢复「置顶 + 时间分组」唯一形制。`CardDatabaseView.searchResults` 与 Database 会话查询的 `searchResults` / `grouping` 通道保留：legacy 卡片库（`pages/card-list-view`）仍在用，随 legacy 删除一并清理（见 04 清单 §保留表）。
- 追记（2026-09-21，用户裁决）：**视图切换移入标题栏面包屑**——筛选行右端原有「卡片墙 / 图谱 / 表格」三项并排，用户反馈该处拥挤不协调。裁决：视图切换改经 `usePageBreadcrumb` 挂标题栏面包屑（「卡片库 / [卡片墙 ▾]」，同文章详情速切器形制），浮层为 Menu **命令项**（不是单选组：用户裁决「不要 Radio，选中高亮即可」，radio 形制读作工业风；命令项触发即关菜单并还焦触发器），当前视图以 accent 图标 + 文字高亮标记；筛选行回归单一职责，只留分类 chips（左端树收起按钮不变）。组件为 `features/cards/components/CardViewSwitcher.tsx`；`setView` 改 useCallback 稳定，否则面包屑 node 每次渲染重建会触发注册循环（PageProvider `usePageSlot` 的稳定化要求）。mockups/cards A1 的「筛选行右端视图切换」形制随之作废。

## D-025 Database 统一查询投影与变更入口

- 根因：显示 hook、键盘导航和拖拽分别计算顺序；新增独立展示范围只解决局部问题，使规则继续分裂。用户要求从根因重整，同时保持不受控。
- 删除独立范围状态、旧筛选 hook 和未使用的外部全量同步入口。会话查询与保存的视图配置经一个纯函数生成 projection；渲染、选择与键盘使用同一份结果，拖拽通过 ID 操作且遵守投影的可重排状态。
- 分类/标签使用既有过滤表达式；语义搜索提供有序结果，分组策略显式声明。卡片宿主只传全集和查询，不重复传两套数据。
- 实例提交入口原子更新状态、查询投影和变更来源；外部确认命令不产生保存回调，用户事件携带字段差量。快照兼容入口的基线差分只在核心维护，宿主不再反推修改。
- 看板组序纳入核心投影；视图切换保存各自配置并原子更新投影，重命名与重排不重新应用旧配置。不改为受控组件，不通过 key 重建或 props 同步覆盖内部编辑。

## D-026 Database 组件 tau 主题化（原位换皮）

- `components/Database` + `CardDatabaseView` + `editor-extensions/database` 全量换装 tau token 与 primitives、antd/react-icons/`--th-*` 清零（2026-09-21，M1–M6 六提交）；行为与 D-024/D-025 数据协议不变。
- **RowDetailModal 保留 CustomModal 壳**（已被 D-084 取代：行详情改为 Dialog + `header` 插槽的双栏）：其全屏展开（覆盖标题栏、px-12 版式）是 Dialog 尺寸体系外的高度自定义表面，为不重构展开特性而保留自建壳（壳本身无 antd）；内部确认弹窗/图标/灰阶已换 tau。ViewTypeSelectModal / ColumnEditModal 已迁 Dialog。
- select 选项色：`constants/select.ts` 的 per-theme rgba 色表删除，`SELECT_COLORS` 七色词与 Tag 七色板恒等映射，展示统一 Tag（D-021 语感）；颜色修改走 ColorSwatch。
- `theme: "light"|"dark"` prop 线保留：CellPlugin 的 Editor/Renderer 契约含 theme，清签名属数据契约变更，超出换皮边界；组件内已不再消费。
- `editor-extensions/database/index.module.less` 保留：拖放视觉（drop-common/drag-common）是全部 editor 扩展共享的存量惯例，仅将包装层颜色换 `--tau-*` 变量，随 editor 域迁移一并清理。追记（2026-09-29）：两份公共 less 已由 `@tau/editor` 的 `BlockDrag` 组件取代并删除（见 `docs/editor-refactor/02-阶段计划.md` P8），该 less 只剩包装层自身样式。
- 日历事件色由裸 hex 改 `var(--tau-accent)`（数据色经 color-mix 派生软底）。
- 追记（2026-09-21，用户裁决）：**ViewTabs 工具行的悬停反馈弃用 bg-hover 淡墨底，改透明度梯度**——视图胶囊（未激活）与 ⋯/筛选/排序/分组/新视图等轻量图标钮常态 `opacity-60`、hover `opacity-100`、按下 `opacity-80`（同 VS Code / MUI IconButton 惯例）；视图 ⋯ 常显（不再 hover 才显，避免点击后 :focus-visible 锁亮的残留）；激活语义仍走 `bg-selected`（选中 ≠ 悬停反馈，D-006 不受影响）。口径仅限 Database 工具行，全局反馈语言仍按 03 指南 §4。

## D-027 ViewTabs 工具栏与筛选三面板重设计（方案 B 定稿）

- 背景：三图标钮挤在一起、搜索框 150px 常驻视觉重、三面板「盒子套盒子」编辑成本高。mockups/database-toolbar-proposals.html 三案对比，用户裁决采用**方案 B 胶囊钮**（2026-09-21，裁决记录见 mockup 页底）。
- **工具栏**：搜索折叠为 28px 图标钮（点击展开 208px；清空 + 失焦收回；有关键词保持展开；**切换视图清空收起不保留**）；筛选/排序/分组改胶囊钮（图标 + 文字 + 激活计数 + caret），顺序 = 搜索 → 筛选 → 排序 → 分组；激活计数 = 筛选条件数（递归）/ 排序规则数。
- **三面板保留「取消/确定」暂存逻辑**（本地编辑、确定生效），底部统一「清空（有规则才显）| 取消 | 确定」按钮行（形制对齐 AnchoredPanel.Footer 的 1px border-t）。
- FilterPanel：「与/或」下拉改分段控件（满足全部/任一）；条件行扁平化为「字段 → 操作符 → 值」单行（去双层边框盒与虚线值框，删除钮 hover 才显）；嵌套组改缩进浅底块（「其中，任一满足」点击切换逻辑）；字段下拉带类型图标。
- SortPanel：方向文字下拉改箭头切换钮（角标示切换方向）；优先级序号 1/2/3；人话提示（新→旧 / A→Z / 0→9 按字段类型映射）；空态给日期列一键添加。
- GroupPanel：组数预览（按当前/默认粒度现算）；**日期分组二级粒度（按日/周/月）**——`GroupRule.granularity`（@tau/shared）→ `CellPlugin.getGroupKey(row, column, granularity?)` → projection 透传；DatePlugin 分组键从原始时间戳（基本每行一组）改为本地自然日 / 周一起始自然周 / 自然月聚合，**默认按月**（无 granularity 的存量配置行为随之改变，属修复性变更）。
- 筛选空态为通用文案引导（不硬编码业务快捷）；排序空态推荐 = 日期类型列前两个。
- 冒烟测试 `Database/__tests__/ViewTabs.test.tsx`（胶囊渲染/计数、搜索展开与 Esc、三面板打开断言；Popover 经 Portal 挂 body，断言查 document）。

## D-028 设置弹窗：方案 A 经典双栏骨架落地（壳层浮层 + 14 子页分组重排）

- 定向（2026-09-21，mockups/settings/ 三案对比，用户裁决方案 A 经典双栏、逐页慢慢设计）：760×min(560,82vh) 居中弹窗，blur 遮罩 + surface 卡（Dialog 家族同语言）；左栏 198px 分区导航、右栏子页独立滚动（edge fade 三件套）。视觉对齐 mockup 方案 A 定稿：左右栏 surface 统一亮底 + **hairline 结构分隔**（头部下缘 line-1、导航列右缘 line-1、设置行间 line-2 末行无线）——弹窗容器内部的结构线，同 Dialog footer hairline 性质，不属 §4.2 零横线针对的页面区块分隔（首版曾以右栏 bg-page 底色分区替代横线，用户校准否决）。保存模型 = 即时保存（无应答区），legacy 显式保存按钮随逐页设计移除。
- 承载：**feature 级浮层由壳层挂载**（D-003 命令面板同族，AppShell 内 `<SettingsDialog />`）；开闭态归 `app/settingsStore.ts`（壳层 UI 状态——Sidebar / 命令面板 / Ctrl+, 多入口共享，features 域禁止互引 store，故不放 features/settings）；Esc 走 useOverlayDismiss 注册表；关闭焦点归还触发元素；`Ctrl+,`（Mac `Cmd+,`）全局 toggle。
- 入口三处：Sidebar 底部（navigation.ts 的 NavItem 新增 `opensOverlay: "settings"` 标记，Sidebar 按标记开浮层而非 push，浮层入口无页面激活态）；命令面板（searchMeta 生成 `action: "open-settings"` 命令）；快捷键。
- 分组重排（用户裁决按最佳实践重配，legacy 14 子页全量对齐不遗漏）：通用（外观）→ 数据（同步 / 资源存储 / 发布）→ AI 服务（大语言模型 / 嵌入模型 / 图片生成 / 文字转语音 / 语音转录，按生成管线排序）→ 扩展（模块功能 / 白板录制 / 集成 / 杂项）→ 支持（关于软件）。使用频率递减、关于殿后；「杂项」暂名保留，逐页设计时拆解正名。
- 单源：`features/settings/sections.tsx` 是设置导航的唯一修改点（分组/排序/图标/组件映射）；未设计子页消费 `PendingSection` 诚实空态（不造演示数据）；外观为首个真实子页（主题 mode 接 themeStore 即刻生效），逐页设计时替换 component 即可。子页持久化记忆：重开设置回到上次分区（settingsStore partialize section）。
- legacy `SettingModal`（/legacy 侧全屏 Tab）不动，M1 随壳层删除；`page/legacy.tsx` 的 settings 占位页保留（不再被侧边栏 push）。
- 验证：tsc / eslint 全绿；浏览器实测（侧栏入口开合、分区切换、主题切换落 `data-theme` + `.dark`、Esc / Ctrl+, 快捷键）通过。
- **外观子页定稿（2026-09-21，mockups/settings/appearance/ 三案对比，用户裁决方案 A 行流式）**：分节按「界面 / 编辑器」两层语义（字体字号只作用于编辑器正文，节标题即说明书）；主题模式 = 三张迷你窗口预览卡（跟随系统 / 浅色 / 深色接 themeStore mode 三档，legacy darkMode 布尔为其子集）+ 行内只读解析说明；中英字体 = searchable Select（getAllFonts，react-query staleTime Infinity）；字号 = stepper 12–24 边界禁用；图片圆角/阴影四档（历史 boolean 阴影值读取时归一化、写入即清洗）；**「深浅切换时提示」开关经用户裁决删除**（toast 反馈是交互行为不是设置项）；**主题色 6 色板不迁移**——新主题体系 defineTheme 中 accent 随主题内置，色板是 legacy data-accent 旧体系产物，存量选择迁移映射到默认。实现：`features/settings/sections/AppearanceSection.tsx` + `components/SectionTitle.tsx`。
- **定稿追记（2026-09-21 用户校准）**：① 弹窗宽度 760→**860**（右栏内容区太窄）；② 字体选择补**预览**——Select 富 label「字体名 + 预览句按该字体渲染」（触发器与选项同构），预览句与回退栈对齐 legacy SettingFontPicker（中文「春风又绿江南岸」/ 英文 "Sphinx of black quartz" / 代码 "const f = (s) => s;"），实现收口 `components/FontSelect.tsx`。
- **同步子页定稿（2026-09-22，mockups/settings/sync-plans.html，用户裁决方案 C 状态卡置顶 + 多项校准）**：① 同步与资源存储保持分开两页（sync-designs.html 三案探讨后裁决）；② **同步全手动**——无自动同步/频率设置，legacy autoSyncEnabled 不迁移，状态卡上的「同步」（upload 上传）/「检查」（getOriginDatabaseInfo 探测，远程领先时 ConfirmDialog 确认 download）即全部动作；③ **凭据（账号/Token/AK）全部在「集成」子页配置**（连接判定继续消费 integration，isSyncConfigured 存储结构保持），本页只配存储定位（WebDAV=路径前缀 / S3=Bucket·Region·路径前缀 / OSS=Bucket·路径 / GitHub=仓库·分支·路径前缀），凭据提示行链接直达集成分节（openSettings("integration")）；④ 状态卡轻染口径（首版深底被否）：透明底 + line-1 描边 + 36px 淡彩图标位（ok-soft/warn-soft），本地/远程版本 tabular-nums，远程领先染 accent-text；⑤ legacy 的资源文件级同步管理（列表/状态/黑名单/冲突弹窗）不在本版范围，入口归属后续裁决。实现：`sections/SyncSection.tsx`（远程版本走 react-query，enabled=isConfigured）。
- **字体生效链路修复 + 全局化（2026-09-21，外观页接线发现 → 用户裁决）**：fontSetting 数据未丢，断点两处——① `useSyncFont`（→ CSS 变量）原挂 legacy 根 App.tsx，/shell 不渲染它；② 壳层根 `font-tau` 截断 font-family 继承（编辑器根 `.editor` 显式 `var(--font/--font-size, inherit)` 兜底）。用户随后裁决**字体/字号为应用级默认、root 下全局生效**（非编辑器专属）：useSyncFont 重写为 root 覆盖 `--tau-font`/`--tau-font-mono`（壳层 UI font-tau 即时生效）+ 按 13px 基准等比缩放 `--tau-text-*` 档位（层级保持、间距圆角不动）+ 既有 `--font/--font-size/--mono-font` 一并写 root。**配套 token 改造**：`@theme inline` 对字面值会内联进工具类致运行时覆盖无效——字号 token 改为 `:root` 字面值层（`--tau-text-*`）+ `@theme inline` var 桥接（tokens.css，对齐颜色 token 既有模式）。外观页分节语义随之调整：「编辑器 · 正文/代码块」并为「界面 · 字体」（desc 全局生效），「编辑器 · 图片」改「内容 · 图片」。同批修 Select 弹层：滚动收口列表区（搜索框移出滚动区、滚动条不贴边不溢出圆角）+ 触发器 `w-full`（定宽 className 真正生效）。
- 追记（2026-09-23）：**侧边栏条目行高与图标随字号档位折算**——固定 34px 行高 + 17px 图标在字号调大后余量被吃尽（设置上限 24 时行盒 1.65em=39.6px 已溢出行高，用户实测反馈"字显大、间隙小"）。条目行高改 `calc(1.65em+8px)`（行盒 + 8px 余量，fontSize 16 时 34.4px ≈ 原 34px，观感锚定不变）、条目图标 `size="1.06em"`、组头箭头 `size="1em"`（均锚定 fontSize 16 的既有比例）。「间距圆角不动」口径不变——这是行高向文字档位的折算，不动全局间距刻度。实现：`app/Sidebar.tsx`。条目间同步补 2px 行距（`space-y-0.5`，同菜单行距口径）——选中/hover 底色圆角块原先零间隙相贴。
- 追记（2026-09-23，用户裁决）：**壳层 UI 字号改阻尼跟随，与内容区解耦**——「统一生效」后用户实测反馈侧边栏文字显大：字号默认 16 使壳层整体放大到设计基准（13px）的 123%，而导航类 chrome 的行业惯例是 13~14px。裁决：编辑器内容仍 1:1 跟随字号（`--font-size` 不变），壳层 `--tau-text-*` 档位按**半速率阻尼**缩放（`SHELL_UI_DAMPING = 0.5`：字号 16 → 壳层 body 14.5px，字号 24 → 18.5px），保留「调大字号界面也随之变大」的无障碍语义但收敛幅度。实现：`hooks/useSyncFont.ts` 的 scale 计算。

- 追记（2026-09-23，演示模式字号继承修复）：撤销公共 Editor 根节点对 `--font` / `--font-size` 的直接绑定。该绑定使演示容器的 `40px` 被全局普通字号截断；Editor 恢复继承宿主容器的字体与字号，由调用场景决定 em 基准。全局字体设置仍由 useSyncFont 写入 root；普通内容若需原始字号，由宿主内容容器消费 `--font-size`，不在公共 Editor 内统一覆盖，未单独指定字号的内容随父容器排版。

- **追记（2026-09-30，用户裁决）：设置由居中弹窗改为全窗口页，去掉分区搜索**——弹窗（min(92vw,1160)×min(88vh,880)）内容区仍显局促；改为铺满整个窗口、连同应用侧栏一起覆盖：左栏为设置侧栏（同条目行高，顶部「返回应用」；宽度固定 220px——曾跟随应用侧栏 `--tau-sidebar-w`，用户拖宽后显得过宽，同日校准为定宽），右栏为居中内容列（max-w 880，页头随正文滚动）。承载不变：仍是壳层浮层（不进页面栈——Page 只渲染在右列，替换侧栏需改壳层布局；且各处 `openSettings(section)` 入口无需改动），开闭态仍在 `app/settingsStore.ts`，Esc / Ctrl+, / 焦点归还照旧；层级 z-[90] 低于命令面板。设置分区只有 10 个，**分区搜索框与 sections.tsx 的 `keywords` 字段一并删除**；打开期间仍注册查找接管以吞掉 Ctrl/⌘+F。组件 `SettingsDialog` 更名 `SettingsScreen`。

## Page 迁移清单（M2 起滚动勾选）

> 33 个 TabType 的完整映射与合并方案见蓝图 §5.3，此处只跟踪迁移状态。

- ~~cards 卡片库（M2 样板域，第一个）~~ ✅ 2026-09-20 A1 卡片墙+时间分组落地（mockups/cards 七轮评审定稿；CardDatabaseView 提升至 components 共用，04 清单 §cards）
- ~~card-detail 卡片详情~~ ✅ 2026-09-20 A 素卡 v2 落地（mockups/card-detail 三案评审 + 二轮反馈定稿：⋯ 菜单回卡头时间右侧、连接区有关联才渲染、暂不做闪卡关联与图谱入口、面包屑无速切器；预览弹窗「进入详情」接线 navigator.push）
- library 知识库（documents/pdf/vec 合并）
- ~~articles 文章~~ ✅ 2026-09-19 A3 月刊落地（D-015）
- feed 订阅/稍后读
- ~~projects 项目~~ ✅ 2026-09-23 C 学习驾驶舱落地（D-031；project-detail 占位，三型工作台待迁移）
- ~~todos 待办~~ ✅ 2026-09-24 B3 议程流「两块板」落地（D-040；独立页，不并入 schedule）
- ~~questions 问题~~ ✅ 2026-09-25 A2 三栏清单「顶部切换」落地（D-044；question_link / question_event 两表，命令面板输入即记录，首页探究中整行，独立问题窗口已删）
- ~~pomodoro 番茄专注~~ ✅ 2026-09-24 C 时间账本落地（D-045；独立页，不并入 schedule；小窗 / 沉浸窗重做，独立主窗口待 P-pomodoro 退役）
- ~~collaboration 协作~~ ✅ 2026-09-25 A3「协作台 · 侧栏嵌套」落地（D-046；legacy 工作台与右侧「协作共享」小组件已删除）
- learning（vibe-learning + flashcard 合并）
- schedule 日程 · 第一版 ✅ 2026-09-24 方案 C 月刊落地（mockups/calendar：月历大面板 + 当日时间线 + 快速添加，底层 legacy 逻辑复用）；时间记录不并入（legacy 已无入口，孤儿页面进 04 清单）
- ~~diary 日记~~ ✅ 2026-09-25 D「一整张纸」落地（D-044；标签频道嵌侧栏，legacy DiaryView 待 G1/G2 随首页旧版一并删除）
- ~~whiteboard 白板列表~~ ✅ 2026-09-25 A 画廊落地（D-047；标签嵌侧栏，缩略图复用导出图片管线）
- ~~whiteboard-detail 白板详情（多页）~~ ✅ 2026-09-25 A2 底部页签栏（XMind 式）落地（D-048；只迁页面外壳，画布内部浮动件换皮另起一轮 mockup）
- ~~weread 微信读书~~ ✅ 2026-09-26 A 书架 + B 列表排布 + 整页笔记落地（D-059；笔记只读，legacy 页待 P-weread 删除）
- ~~pdfs PDF 列表~~ ✅ 2026-09-29 A 文档墙 + 列表排布落地（D-069；legacy 列表页待 P-pdfs 删除）
- ~~pdf-detail PDF 阅读~~ ✅ 2026-09-29 方案 B 页边图钉 + 纸内对话落地（D-070，status new；旧阅读器 `components/PdfEmbed`、`EditPdf` 与 legacy 对话面板已随 P-pdf-detail 删除）
- resources 资源管理：已退役，管理页、资源库选择及主库资源索引整体移除；保留上传、同步、协作文件与学习资源。
- chat 归位 feature
- ~~settings 拆解（15 子页）~~ ✅ 2026-09-24 重排为 12 分区全量落地（D-036）
- home 首页看板

## D-029 Segmented 连体描边定稿与嵌入模型子页落地（凹槽深底否决）

- 背景：嵌入模型子页设计稿（mockups/settings/embedding-designs.html，2026-09-23）三案裁决取案 1 分段，首版形制为 macOS 式凹槽（bg-sunken 轨道 + surface 胶囊滑块）；用户否决深底轨道，要求先落通用组件（mockups/segmented/index.html）再消费。
- 选择（通用组件）：① **形制 = 连体描边（Input 方案 A 家族语言）**——容器是一枚 hairline 控件（surface + line-1 描边 · radius 8，与 Input / Select 触发器同皮），段间 hairline 分割（`[&+&]:border-l`），激活段 = accent-soft 轻染 + accent-text 600（与侧栏选中项 bg-selected 同一「轻染不是浮起」语言）；零轨道、零滑块、零投影。hover 淡墨只落未选段（`hover:[&:not(:has(:checked))]` 任意变体保确定性）、press bg-press、focus-visible 才显 ring（inset 2px peer 锚 span，不被容器圆角裁切）；② **API = 复合组件** `Segmented`（`label` → aria-label 组名必填、不渲染可见标签；value/defaultValue/onValueChange 受控契约；`size: sm 28 | md 34(radius 9)`；`name` useId）+ `Segmented.Item`（value/label/icon/disabled，label 省略即纯图标段、aria-label 必填）；原生 input[type=radio] 承载语义——Tab 一次进组、方向键移动即选择（roving）白送（D-026 Radio 同构）；无 loading/error 态（即时形态切换，非表单输入）；③ **分界口径**（02 §5.2 的落地细化）：形态切换（字段不同构）用分段、值切换（字段同构）用 Select——同步/资源/发布三子页的 Select 溶解与之互补；段数 2–5，再多该用 Select。形制对照「分离胶囊」留 mockups/segmented/ 对照区（未采）。
- 嵌入模型子页（mockups/settings/embedding-plans.html 定稿，`sections/EmbeddingSection.tsx`）：分段 = 模型来源（embeddingProvider.currentConfigId 单选，本地 ⇄ API 互斥）；本地态 = 运行环境（下载源 / 设备策略 / 批大小）+ 本地模型（下载进度/取消、启用确认 + 健康预热、删除、健康检查 Dialog 展示）；API 态 = Provider 配置（新增/编辑 Dialog：名称 · API Key · Base URL；激活；删除）+ 模型登记（名称/描述/维度/多模态/距离，维度变更 Toast 提示自动重建索引）；检索模型节独立于来源、常驻切换区之外（Query Expander / Reranker 双开关 + 下载源/设备/批大小 + 扩展/重排行）。三类切换（本地⇄API / Provider 激活 / 模型启用）均 ConfirmDialog 确认「后台自动重建向量索引」；即时保存（无应答区）；本地配置常驻兜底逻辑随页迁移（首开补建 LOCAL_CONFIG_ID）。命令族全量复用 embedding-model / search-model，无新主进程代码。
- 验证：`segmented.test.tsx` 7 例（组语义 aria-label/同 name/受控互斥 · 非受控 · 连体描边/分割线/轻染/hover-not-checked/ring 锚类 · 单项/组级禁用 · md 档 · 图标段与纯图标段）；ui 包既有 171 例回归全绿；apps/desktop tsc 0 错误；样板间 Choice 档案增 Segmented 展区（registry label 更新）。设置两份 mockup（embedding-designs / embedding-plans）已同步连体描边皮肤与追记。

## D-030 样板间选择控件档案拆分（ChoiceSection 一拆四）

- 推翻 D-019/D-020 的「Checkbox/Switch/Radio 并入 ChoiceSection 同档」聚合口径（2026-09-23）：Checkbox / Switch / Radio / Segmented 各自独立档案，registry 四条目（key `checkbox` / `switch` / `radio` / `segmented`，与其它基础件一组件一条目对齐）。动因：各组件示例需扩充（状态矩阵 + 场景 + 受控联动），单聚合页无限膨胀且侧栏无法直达。
- 档案结构统一为「状态矩阵 → 场景 → 受控演示 → API 备忘」：Checkbox（任务清单全选联动 / 偏好多选受控回显）；Switch（设置行 aria-label 用法 / 联动显隐）；Radio（描述行组合式 / 主题受控回显 / 导入向导）；Segmented（段数 2–5 全谱 / 图标段与纯图标段 / 形态切换场景）。API 备忘按组件归属拆走：bg-track token 归 Switch 档，「antd Radio.Button 分段形态不建」归 Radio 档。

## D-031 项目列表页定稿（方案 C 学习驾驶舱）

- 背景：项目列表现状 = antd 卡片网格 + 右下悬浮球（hover 触发展开三型菜单，触发不稳）；卡片仅标题与富文本描述（每卡内嵌只读 Editor 实例），无类型标识/子项计数/时间；归档折叠无筛选。三案 mockup（`mockups/projects/`：A 书架网格 / B 档案行 / C 学习驾驶舱，共用同一套 13 项 mock 数据），2026-09-23 用户裁决 C 落地初版。
- 选择：① **布局 = 学习驾驶舱**——首屏「继续学习」双 hero 大卡（置顶优先 + 最近更新升格；被选中项目仍在下方全部网格——hero 是入口的放大不是分流，与今日页「继续编辑」同基因）→「全部项目」紧凑网格 → 底部归档折叠段；hero 行动位 = accent-soft 文字链「进入项目」（工具栏「新建」已是本屏唯一 primary，D-013 每屏至多一枚）；② **新建入口移工具栏右上**（primary「新建」默认文档树 + chevron Menu 三型预选），废除悬浮球（对齐文章页 2026-09-19 评审基线）；③ **类型 pills**（全部/文档树/数据表格/Vibe Learning 带计数）；类型派生色 = 青蓝/紫罗兰/accent 语义类（设计数据色不进主题词表，cocoa 对应值实现时与封面派生色板一并校准）；无页内搜索（D-024 口径，语义检索走全局 Ctrl+K）、无排序 UI（默认「置顶 → 更新时间」序）；④ **hero 的 Vibe 学习进度不渲染**（暂无聚合数据源，mockup 待裁决 ①；有数据源后作为 hero 槽位补入）；⑤ **归档折叠为页面 useState**（每次进入默认收起；legacy showArchived persist 不迁移）；⑥ 新建/编辑弹窗字段对齐 legacy EditProjectInfoModal（标题 + 类型 pills + 富文本描述·ContentEditor），编辑态类型不可改（三型工作台形态不同，改型破坏子项语义）；⑦ 删除确认 impact 忠实主进程级联（deleteProject：文档树清孤立子项、Vibe 删资源/聊天/索引）；整体导出经共享层 BatchExportModal（§6.1 换皮不搬家，04 清单 §projects 登记）；⑧ **project-detail 为诚实占位页**（呈现项目身份 + 返回，三型工作台后续迁移，另立锚点）。
- 实现：`features/projects/`（types / queries——getProjectList 全量轻表 + useProjectMutations 整域失效（patch 优先取列表缓存免二次 IPC）/ projectTypeMeta 三型单源（label/icon/派生色）/ components——ProjectCards 两形态卡 + CreateProjectDialog / views——ProjectsView + ProjectDetailView 占位 / pages——projects + project-detail）；状态栏经 usePageStatusBar（N 项目 · M 文档 · K 归档）；`page/legacy.tsx` 删 projects 占位行。**计数口径（2026-09-23 用户校准）**：卡片/段头/状态栏的「N 个文档」= 项目内全部条目数（含文档树深层节点——深层节点 projects 数组继承父节点登记，`addChildProjectItem` 落库即带），不是 `Project.children` 顶层 id 数；数据源为主进程新增聚合命令 `get-project-item-counts`（一条 json_each GROUP BY 返回全量映射，避免逐项目 N+1），counts 独立 queryKey（`["projects","item-counts"]`）供列表与详情共用、随域前缀失效。工具栏标题后不放计数（pills 与状态栏已承载，避免重复，2026-09-23 用户校准）。**hero 段语义校准（2026-09-23 用户裁决）**：段头改「置顶项目 · N 个 · M 个文档」，选取由「置顶优先+最近更新取前 2」收敛为**置顶全部**（更新序；无置顶整段不渲染，最近项目由「全部项目」网格首行承接）；「升格不分流」保留（置顶 mini 卡仍在全部网格）。验证：tsc 0 错误、eslint 0 error（page 文件 react-refresh warning 与样板一致）。

## D-032 cream sunken 换值去黄 + 角色钉死为轨道/凹槽专档

- 缺陷：cream `sunken` #e2d8c0 黄味重、明度低，与陶土橙 accent 同框（进度轨道、波形）显脏（用户观感「非常不搭配」）；`cream.theme.ts` 行内注释仍写「输入底/代码块等凹陷区」，与 D-007（表单控件 = surface 亮底 + line-1 描边）、D-009（代码 chip 同家族、sunken 退回进度轨道专档）两条裁决矛盾——全库消费方核查证实真实用法只有轨道/凹槽类（进度轨道 ×4、波形、时间轴竖线、分隔线、圆点），无任何输入框/代码块消费。
- 选择（2026-09-23，mockups/settings-redesign/sunken-candidates.html 五候选真实用法对比，用户裁决取候选 D）：① cream `sunken` #e2d8c0 → **#e7dbc8**（提明度减黄、保留暖调；ink-2 对其 4.74、对 page 1.181，阶梯秩序与相邻 ≥1.10 铁律不破）；② **角色钉死 = 轨道/凹槽专档，明文禁止作输入框/代码块底**——输入框/选择器/代码 chip 一律 surface 亮底 + line-1 描边（D-007/D-009 家族语言），注释与 02 §2.3 词汇表同步写明；③ cocoa `sunken` #100d08 不动（近纯黑，与浅色黄味问题不同源）。
- 影响：`cream.theme.ts`（取值 + 注释）、`tokens.css` cream 数据块、`AppearanceSection` 主题预览卡 3 处硬编码色同步（该文件另有 group 旧值 #ece4d4 残留，未在本轮处理）、02 §2.3。
- 验证：`@tau/ui` 178 例全绿（含 theme-parity AA 门禁）；候选页五种真实用法 × 两种底色目验。

## D-033 项目详情接入（三型 legacy 整体搬迁 · 以新版组织为准）

### 2026-09-23 追记：清除已迁移入口的 Tab 导航

用户要求修复现有导航问题且不考虑 legacy 兼容。已迁移入口统一接 Page：“新 Tab”改为“在应用内打开”，分栏语义移除；网页、内嵌白板、内容块预览增加实际 Page 承载，知识库内容沿用已有独立窗口入口。非 React 的 MCP／AI 服务由壳层注入 Page navigator 与栈快照，不创建虚拟 Tab store，也不让 page 框架反向依赖业务。现有 MCP 内容提供者只作序列化器复用；未实现的目标返回错误。旧 pages/layouts 随原删除锚点退役，不做兼容改造。详见 03 指南「Page 导航入口与服务层接线」。

- 背景：project-detail 需承载三型工作台（文档树 / 数据表格 / Vibe Learning）。用户裁决（2026-09-23）：**以新版为准**——不造新版不需要的 Context/桥、不迁就 legacy（/legacy 详情可断，编译通过是唯一硬要求）、组织架构按新版合理方式（业务归业务域，不把业务塞共享层）、尽可能复用、不改功能不换皮；违规先指出后处理。
- 选择：① **归置**——ProjectView（三型分派 + 文档树 + 八型 item 视图，72 文件）与 VibeLearningView（40 文件）整目录 `git mv` → `features/projects/components/`；跨域件提升：EditPdf + EpubReader → `@/components`（library 域将来复用）、InsertNoteToTreeModal + LoadingSpinner（白板/Feed/扩展笔记消费）、VideoNotePanel 闭包 9 文件 + extensions（白板嵌入视频笔记——**功能保留不删**，白板未迁移≠可删用户否决删子功能提案）、projectTree / mindMapTreeUtils → `@/utils`（batch-export / DocumentView 跨域消费的纯树工具）；② **传参**——不伪造 TabProvider 桥：入口 props 化（ProjectView `{projectId, itemId?}`、VibeLearningView `{projectId}`）、ProjectList 改读 ProjectContext，useTabParams 消费清零；③ **legacy 清理**——TabContent 删 ProjectView lazy 与 `case TabType.ProjectDetail`；`useTabStore(navigateTo)` 残留 7 处保留（新壳层下无效果但不崩溃，换皮时接 navigator）。
- 违规随迁清单（换皮阶段处理）：antd 约 51 文件 / @ant-design/icons 19 文件（棘轮只减不增）；4 个 `.module.less`；A2 视觉违反（antd 皮、硬编码边框色、横线）；`DataTableProjectView` 与 `TableProjectItemView` 同构重复（合并）；`batch-export`（utils）仍依赖 `@/pages/DocumentView` 的 documentTree（知识库域迁移时收编）；`hooks/useDynamicExtensions`、`editor-extensions/ProjectListSlate` 引 features 域的 ProjectContext（hooks→features 无明文红线但方向倒挂，项目域 editor-extensions 归位时处理）。
- 实现：薄壳 `views/ProjectDetailView.tsx`（判存在 + usePageBreadcrumb 项目标题 + 渲染 ProjectView）；文档同步 04 清单 §projects（ProjectDetail 分支删除登记 + 提升件消费者表）与 03 指南 §1/§2。验证：tsc 全绿（含 src-electron）、搬入目录 eslint 0 error（存量 warning 随迁不修保 rename）、vitest 36 例全过（含随迁的 InsertNoteToTreeModal / VideoNotePanel / projectTree 测试）。

## D-034 退役 bg-group（分组底）token

- 缺陷：`bg-group` 经 D-006 下沉、2026-09-20 收敛后仍在 Tag、Panel 空态、分段控件轨道、工具条、次级按钮等 60+ 处复现为米灰色块，用户观感「不好看」「特别想将其删掉」（2026-09-24）；它与 page 的对比仅 ~1.045，介于"看不出"与"显脏"之间，没有正确取值。
- 选择：**词汇表删除 `bg-group`**（tokenContract / tokens.css `--tau-bg-group` 与 `--color-group` / cream·cocoa palette.group），不设替代档。消费方按语义分流：① `hover:bg-group` → `hover:bg-hover`；② 实底小件（徽章、kbd、次级按钮、分段轨道）→ `bg-hover`，其 hover 态 `bg-sunken/bg-hover` → `bg-press`；③ 与 `border-line-1` 同用的容器（空态行、统计框、描边卡）→ 删底色只留描边；④ 进度/比例轨道 → `bg-track`；⑤ 表头、命令面板页脚的 `bg-group/60` 叠层直接删除。
- 影响：apps/desktop、packages/ui、packages/editor 源码 65 文件（仅 class 名替换）；theme-parity 删除两条 group 对比度条目；新增 `packages/ui/src/theme/__tests__/retired-tokens.test.ts` 扫三处源码禁止 `bg-group` 回流；showcase TokenSection / PanelSection 文案；02 §2.3、03 §颜色消费、PREFERENCES 同步。

## D-035 发布从设置弹窗抽为独立页面

- 背景：设置弹窗 860px 双栏里塞「目标 + 站点 + 内容选择器 + 进度」四节，选择器被压扁、操作埋在滚动底部（用户：「放在设置的弹窗里面太小了」，2026-09-24）；按 `mockups/publish/index.html` 落地。
- 选择：① **按使用频率分区**——页头 = 站点身份（favicon / 标题 / 访问地址 / 目标 chip / 上次发布）+「站点设置」「访问站点」；主区 = PublishSelector 吃满宽度（左侧 204px 类型栏 + 全部/已选/未选分段）；右栏 340px = 「本次发布」计划卡 + 动作卡（全页唯一大主按钮在流程末端）；未配置目标或未勾选内容时右栏换成三步引导卡；② **低频配置收进右侧 460px 抽屉**（目标三选一 radio 卡 + 提供商字段 + 连接测试 + 站点信息 + favicon，即时保存，z-[340] 与 Dialog 同层，Esc 走 useOverlayDismiss）；③ 入口移到侧栏「工具」组（`navigation.ts` key `publish`），设置弹窗删除「发布」分区与 `PublishSection.tsx`（逻辑迁至 `usePublishConfig`）；legacy `useSettingTabStore` / mcp settings-provider 的 "publish" 键不动。
- 忠实后端（mockup 中以下能力不做）：**无取消**（没有取消发布的 IPC，发布中只提示勿关闭应用）；**计划为全量生成**——toUpload 即全部产物、unchanged 恒空、toDelete = 历史有而本次未生成，因此不做「未变 / 有改动 / 新加入」三分类，只陈述「上传 N / 删除 M」；`preview-publish-plan` 写死 basePath "/"，页面只取路径与数量（不复用其文件内容），脚注注明「按访问路径 "/" 估算，不含 favicon」；**不做失败文件逐个重试**，改为「重新发布」。
- 实现：`features/publish/`（usePublishConfig 配置读写与就绪判定 / usePublishRun 计划·历史·执行·进度 / views——PublishView、RailCards、SiteSettingsDrawer、format / pages/publish.page.tsx）；PublishSelector 换 TypeRail + 分段过滤，`onSelectionsChange` 回调在页面 250ms 防抖（全选会逐实体回调）。轨道一律 `bg-track`（D-034）。验证：tsc 仅剩存量 AddTag 测试错误；`__tests__/PublishView.test.tsx` 5 例覆盖就绪 / 引导 / 发布中 / 部分失败 / 抽屉切换目标。
- **运行态全局化（2026-09-24 追记）**：发布在主进程执行，离开页面仍会跑完；原运行态在组件内，后退弹栈 / LRU 卸载后回来显示「就绪」且可再次发布（主进程无并发锁），Activity 隐藏期间进度 handler 也随 effect 停驻。改为 `features/publish/publishRunStore.ts`（zustand）：run 与 `publish-progress` handler 模块级常驻（随 WebSocket client 绑定），`start()` 在 running 时忽略保证单次发布，结束时 toast 一次（用户可能已不在发布页）并自增 `finishSeq`，页面据此刷新历史与计划。`publishRunStore.test.ts` 2 例覆盖并发忽略 / 进度写入 / 运行中不可收起 / 结果与 toast。
- **内容选择与文档树弹窗（2026-09-24 追记）**：选择器工具栏改可换行（搜索框弹性、分段+全选成组靠右），窄面板不再截断；各滚动列表统一走 `PublishSelector/components/FadeScroll`（useEdgeFade + 底部 12px 外间距；2026-09-25 提为公共件 `components/FadeScroll`，白板元素树 / 笔记抽屉同用）。文档树弹窗原内容写死 65vh，与 Dialog 上限 min(78vh,660px) 冲突导致整窗滚动——Dialog 新增 `fill` 填充布局（卡片定高 min(82vh,760px)、body 为不滚动的 flex 列、无内边距），弹窗改双栏：左 280px 树（头部钉住、列表自滚）、右预览（仅正文区滚动，空态/文件夹态居中不滚）；已选数量与「全不选 = 不再发布」后果收进 footer impact 行。

## D-036 设置弹窗第三版重排：主题语言 + 新信息架构 + 资源同步归位

- 背景（2026-09-24）：用户反馈设置「太拥挤、主题不明确、弹窗太小」，且资源同步入口难找。`mockups/settings/` 三轮评审：v1 三案（`v1-three-plans.html`）裁决方案 A 宽弹窗；v2 按分区配粉彩被否（「太花里胡哨了，要用我们的主题语言」，已记入 PREFERENCES）；v3（`index.html`）定稿。
- 外壳：min(92vw,1160px)×min(88vh,880px)（视口单位自适应，窗口下限 1080×600 时为 994×528 不溢出；首版定宽 1080×min(780,90vh) 在最小窗口下会越界，用户校准）；右栏内容列撑满（去掉 720 上限——弹窗放宽后内容靠左、右侧大片空白，用户校准），宽度上限由弹窗封顶 1160 控制，内容列最宽约 850，弹窗底 = bg-page（唯一 shadow-float 浮起物），去掉头部横条；左栏 228px = 「设置」标题 + 分区搜索（Input lead/clearable；label / 分组名 / `keywords` 命中，Enter 进首个命中，Ctrl/Cmd+F 聚焦）+ 与应用侧栏同语言的导航；右栏页头（title-lg 20/600 + meta 说明）由 `sections.tsx` 的 `label` / `description` 单源渲染，子页不再自绘标题。
- 组件：`SettingsGroup`（组标题 + 说明上下排布 → Panel surface + shadow-card 面板，不描边；`bare` / `action` 槽）取代 `SectionTitle`（已删除）；`SettingRow` 行高 ≥56、说明 12.5 / ink-2（02 §3 说明文字下限），同面板相邻行以 line-2 内收弱分隔（`ROW_DIVIDER`，自定义行也挂它）；`SettingsTabs` 下划线 Tab（方向键 roving，角标 warn-soft）；`StatusChip` 淡墨底 + 语义色点。颜色只给 accent 与语义状态，图标中性墨。
- 信息架构（12 分区）：通用（外观 / 功能模块）→ 数据（同步 / 资源存储 / 剪藏与缓存）→ 连接（账号与连接）→ AI 服务（大语言模型 / 嵌入与检索 / 图片生成 / 语音）→ 创作工具（白板录制）→ 系统（关于与更新）。正名：杂项 → 剪藏与缓存（key `cache`）、集成 → 账号与连接（key 保持 `integration`，既有 `openSettings("integration")` 跳转不变）、关于软件 → 关于与更新；文字转语音 + 语音转录并为「语音」（key `voice`）。持久化的旧 key（misc / textToSpeech / transcription）回落首个分区。
- 资源目录同步从「资源存储」迁入「同步」页：它与上传目标无关、与数据库共用远端与凭据。同步页分「概览 / 资源文件」Tab——概览 = 数据库卡（本地/远程版本、拉取/强制上传/同步/检查）与资源文件卡（进度、文件/待上传/待下载/失败计数、同步/重试失败/停止）并排 + 同步目标（存储类型改 Segmented 形态切换，路径字段改设置行）；资源文件 Tab = 筛选（Segmented 带计数）+ 文件行 + 黑名单。`useResourceSyncModel` 由 SyncSection 持有单例下传，两 Tab 不重复订阅。资源存储页只剩上传目标 + 上传压缩。
- 已迁移子页同步重排：外观（主题卡改描边 + 单选圆点、不托起，加「当前生效」解析行；主题名改 暖纸·晨 / 暖纸·夜）；大语言模型分「服务商与模型」（主从：左列服务商、右侧凭据 + 模型描边行）/「功能分配」（按分类分组面板，Tab 角标 = 未分配数）；嵌入分「向量模型 / 检索增强」。
- 验证：tsc 0 错误；eslint 设置域 0 错误（仅测试文件非空断言类 warning，同既有测试惯例）；新增 `features/settings/__tests__/`——SettingsDialog 4 例（12 分区顺序与页头、导航切换 aria-current、搜索过滤 + Enter、旧 key 回落）、SyncSection 3 例（概览双卡与 Tab 角标、重试失败动作、查看失败项跳 Tab 并按需重传筛选）。未在运行中的 Electron 应用里做界面实测（dev 服务启动会清空 dist-electron 并拉起新 Electron，未另起实例）。
- **全量落地（2026-09-24 同日追记，用户「一并落地」）**：其余 7 页 + 同步页「本地数据库」Tab 全部落地，`PendingSection` 删除。
  - 功能模块 `ModuleSection`：四类分组两列开关（说明 = 已启用 x / y），legacy 缺配置的 5 个模块按 mockup 归类；**修 legacy bug**：「设置」模块不再可关闭（不渲染开关；页尾说明注记经用户裁决去掉，没有必要）。
  - 剪藏与缓存 `CacheSection`：7 个折叠缓存卡合成一个面板——媒体类型 / 来源两级 Segmented、全选与批量删除、「清除全部」只清当前筛选范围并新增确认（写明范围、条数、释放空间，占用按真实 fileSize 汇总）；图片预览用 ImagePreview，音视频 Dialog 原生播放；自动缓存开关说明按实际语义改写（只作用于普通网络链接，YouTube / Bilibili 各有缓存）。
  - 账号与连接 `IntegrationSection`：存储服务 / 内容平台 / AI 平台三组行式，管理/连接走 Dialog（Bilibili 扫码 ⇄ 手动 Segmented）；YouTube 状态改为「已设代理 / 直连」（legacy 依据的 `youtube.enabled` 无写入方，恒为未连接）；微信读书补「断开连接」；**修 Bilibili 关闭弹窗后取码 / 轮询回调仍改状态的问题**；各服务每次打开回读已保存值。二维码仍用外部 api.qrserver.com（同 legacy）。
  - 图片生成 `ImageGenerationSection`：同 LLM 服务商主从；点选只切编辑对象，「设为当前」显式切换（legacy 为下拉即切）。
  - 语音 `VoiceSection`：「语音转录 / 语音合成」Tab；转录程序沿用 legacy `!isMac` 判定；模型下载改单并发（legacy 并发下载互相覆盖进度）；**修 Minimax「前往配置」空实现**——跳「账号与连接」。
  - 白板录制 `WhiteboardRecordingSection`：录制默认值 / 导出；保存位置只经系统文件夹选择器设置（去掉手输框）。
  - 关于与更新 `AboutSection`：应用卡（assets/logo.png、版本、更新状态与检查/下载/重启安装、进度、手动下载外链）/ 自动检查更新 / 命令行工具（取到安装状态才渲染入口）。
  - 同步 ·「本地数据库」Tab `LocalDatabasePanel`：当前数据库切换（同 legacy 无确认）/ 新建（**修重名校验**：按补 .db 后缀后比对）/ 其他数据库删除（legacy 已有能力保留）/ 备份注记。
  - 验证：tsc 0 错误；eslint 设置域 0 error（29 条 warning 全在测试文件，非空断言 / 空函数 mock）；`features/settings/__tests__` 11 文件 + publish 共 32 例全过。仍未在运行中的 Electron 应用里做界面实测。
  - 追记（用户校准「左右不对称、模型样式不好看」）：大语言模型 / 图片生成的主从改为共用 `components/ProviderLayout.tsx`——两块并排面板（左 208px 列表 + 右详情，同内边距、首项与标题行顶部对齐），详情标题行放名称与操作（删除收为图标按钮，图片生成的「设为当前」同行）；字段改走 SettingRow + `FieldBox` 300px 定宽，密钥的显隐 / 复制收进框内（`SecretInput`），右缘逐像素对齐；模型条目去掉描边框改分隔行，名称与能力 / 参数签同行、描述与名称相同则不重复显示、在用计数右对齐；二次校准：左右两面板等高（左列随详情拉满，不再一高一低），模型行的编辑 / 删除改为常驻（悬停才出现时右侧大片空白）。
  - 再追记（用户质疑「那和最开始的区别只是两张卡片？不适合做左右结构」）：`mockups/settings/provider-layout.html` 两案对比，用户裁决**方案 A 顶部切换栏**——左右主从整体撤销（右栏 690~850 宽切出列表后详情被挤、两侧内容量天生不对等、且是全设置唯一异构页）。`ProviderLayout.tsx` 只保留 `ProviderSwitcher`（surface 条内横排服务商 + 模型数 / 「当前」附注，末尾「添加」，多了自然换行）、`FieldBox`、`SecretInput`；下方为标准 SettingsGroup：大语言模型 =「连接」（删除服务商在组标题右侧）+「模型」（添加模型在组标题右侧，模型分隔行编辑删除常驻）；图片生成 =「连接」（设为当前 / 删除在组标题右侧，说明文字表明是否为当前）。三次校准（「分成三块看着散」）：切换栏与各小节收进同一个面板——面板内顶部 ProviderSwitcher，下接 `ProviderSection`。四次校准（「内部层次不分明」——三层同一种细线与留白）：切换栏改为卡片头（下缘 line-1 贯穿结构线）；小节头紧凑化（标题与说明同行、操作居右）；小节内容装进 line-1 描边圆角内框，框内行仍 line-2 弱分隔——形成「卡片 > 内框 > 行」三层，小节之间靠留白。
  - 遗留：legacy 全局更新通知（`hooks/useAutoUpdateCheck.tsx`，antd notification）的「前往更新」仍打开旧设置弹窗，随 legacy 壳层删除时处理。

## D-037 资源管理整体退役

- 移除新旧资源管理页面、资源库选择、主库资源登记/扫描/分组/引用计数，以及专属 IPC、MCP provider 和扩展引用计数 RPC。聊天上传改为路径直连，不再生成资源库 ID；历史消息仍按已有路径读取。
- 主库升级以事务删除 resources、resource_group、resource_scan_version 三表六索引及 resource 操作记录；桌面与移动端同步落地，失败回滚并向调用方报告。该元数据删除不可逆，回退需要升级前数据库备份。
- 实际文件、正文、历史聊天、资源同步黑名单、Vibe Learning 资源、协作缓存库 resources 和通用 resource 文件服务保持独立。协作本地化仍落盘，仅撤销主库登记回调；旧同步黑名单改从本地目录读取。
- 兼容清理：Tab 持久化升级至 7、旧导航历史至 4、新搜索历史至 1；移除旧模块配置与资源视图缓存。退役接口不为旧客户端保留空实现，桌面、移动端及扩展应同步升级。

## D-038 Notification 基础件：右上角卡栈 + 签条大按钮卡片

- 背景：非当下操作引发的事件（协作加入申请、应用更新、后台发布完成/失败）此前散落在 antd `notification`（`useAutoUpdateCheck`）与自研卡片（`JoinRequestNotifications`）中。设计稿 `mockups/notification/`：承载三方案（`index.html`：A 通知卡栈 / B 弹出一次 + 通知中心 / C 标题栏岛）与卡片样式四款（`card-styles.html`：V1 签条 / V2 静候 / V3 纯文字 / V4 签条 + 大按钮）。
- 选择：① **承载 = 方案 A**：右上角卡栈，新的在上，展开 3 张，更多的按底边缩放、露 8px 纸边叠 2 层；点击叠层展开，鼠标移出后收起。② **卡片 = V4**：34px 身份位（人用派生色头像，系统用中性图标，成败用 soft 底加语义墨）+ 文字列（标题与「来源 · 相对时间」同行，说明至多 2 行）+ 横跨整卡的等宽按钮条。③ **按钮条里的次要动作统一描边**：用户实机追问「稍后」这类 ghost 按钮无底是否合适；裁决是等分格里每一格都要看得出是按钮，轻重只靠「主按钮实心、次要按钮描边」区分。④ 卡片不描边，阴影由 ink-1 7% 的 ring、lift、float 三层组成，不新增 token。关闭钮在悬停或聚焦时出现在左上外沿。
- 行为：sticky（需作答）常驻；纯告知 8s 自动关，悬停和作答中暂停计时。onClick 返回 promise 时由组件托管 loading 和整条锁定：兑现后收成 resolvedText 结果行，1.6s 后退场；拒绝则在说明位显示错误并解锁按钮。同 id 再次 notify 原位更新。role=status 不抢焦点，不接 Esc；z-[190] 放在 Toast（200）之下。与 Toast 分工：Toast 是操作回执，Notification 是事件与作答。
- 排除：B 与 C 承载（本轮只做基础件，接入另议）；V2 悬停才出按钮（紧迫感弱）；V3 纯文字（卡片最高，来源辨识度弱）。
- 影响：`packages/ui/src/primitives/Notification.tsx`（`notify` / `NotificationHost` / `NotificationCard`）、`__tests__/notification.test.tsx`（8 例）、样板间「Notification」档案（ShowcaseApp 根挂载 NotificationHost）。业务接入见下方追记。
- 追记（同日，业务接入）：壳层 AppShell 挂载 NotificationHost（`/legacy` 已无入口，不挂；QuickOpen 小窗不弹通知）。接入三处：① 应用更新（`hooks/useAutoUpdateCheck`）：antd `notification` 改 `notify`（id `app-update-available`，sticky）；「前往更新」打开新设置弹窗的「关于与更新」分区，消解 D-036 遗留的「仍打开旧设置弹窗」。② 协作加入申请（`components/JoinRequestNotifications`）：删除自研 motion 卡栈，只保留监听逻辑。新申请经 `notify` 弹出（头像取昵称首字，按 deviceId 派生色），同意 / 拒绝托管给作答流程（结果行或卡内报错）。别处处理后同步关闭，作答中的不打断。存量申请静默、手动关闭后不再弹，这两条保持原行为。③ 发布结果（`features/publish/publishRunStore`）：结束回报由 toast 改 `notify`（后台任务结果归 Notification，修订 D-035 追记），固定 id `publish-run`，同 id 原位替换。成功类纯告知自动关；部分失败与异常常驻，带「查看详情」（openPage publish）与「重试」（按上次参数重跑）。Electron 系统通知（待办提醒、番茄钟）属 OS 层，窗口不在前台也要可见，不在本组件范围。

## D-039 知识库全面合并到项目

- 选择：每个知识库转为一个普通 document-tree 项目，不增加子类型、不按名称合并；保留时间、置顶、标签、正文 ID 和共享图关系，简介与历史根正文并入项目描述。
- 跨端：桌面和 CLI 共享 TypeScript 迁移，移动端 Rust 独立执行同一规则；ID 映射和完成标记保存在主库，共享 SQL/引用样本约束两端一致。主库迁移前创建包含 WAL 的备份，循环、悬空节点和冲突引用失败回滚；不调用普通 CRUD，不生成新建操作或改动正文引用计数。
- 边界：不兼容旧客户端、旧知识库接口和旧博客链接。旧数据解析仅保留在升级边界；协作服务器的 documents 房间表和通用 RAG 检索保留。
- 发布：局部选择映射到新节点，空或无效范围不回退为全选；未选祖先只保留目录结构。新文件全部上传成功后才清理旧文件，失败保留发布历史以便重试。
- 同步：继续使用原目录，不自动上传迁移结果；切换前停用全部旧桌面、移动端和 CLI。新协议携带模型版本，只能约束新版，无法拦截旧端覆盖原路径。
- 实现与验收记录见 `docs/knowledge-to-project-migration.md`；此次切换整体交付，不发布消费者与数据库处于不同模型的中间版本。

## D-040 待办页定稿（方案 B3 议程流「两块板」）+ 待办日历一致性下沉主进程

- 背景：legacy 待办（`pages/TodoWindow`）= 左侧项目栏（含 全部/普通/截止/计划/周期 五个「系统分组」，实为按 type 过滤）+ 主区任务树 + 居中详情大弹窗；antd 与 `--th-*` 混用；周期规则创建后只读、关联笔记组件写好未挂载、已归档项目无恢复入口、全局 Delete 监听误删、截止 / 计划任务的日历同步只在 AI 工具路径里调用。三案 mockup（`mockups/todos/`：A 三栏清单 / B 议程流 / C 项目看板，共用 26 条 mock 数据）；2026-09-24 用户选 B，二轮否决 B 原版「每个日期段 / 右栏块各自成卡、中间漏底」（PREFERENCES「讨厌碎卡片漏底」），页内三变体对照后裁决 **B3 两块板**（`plan-b-agenda.html?v=panels`）。
- 用户裁决（同日）：① **不并入日程**，待办保持独立页 `todos`（`app/navigation.ts` 注释同步）；② **删除不二次确认**——立即从视图消失 + Toast「撤销」，5 秒后才真正 `deleteItemCascade` 落库（离开页面时立即落库）；③ **不保留独立 `/todo` 小窗口**（`createTodoWindow` / `--window-type=todo` / `/todo` 路由登记 04 §todos 随 P-todos 删）；④ 日程同步经核实后在主进程补齐（见下）；⑤ 首页「待办」卡的跳转由 `schedule` 改为 `todos`；⑥ **待办页不放状态栏**（不渲染 `PageStatusBar`）——计数在工具栏摘要（今天 N 项 · M 项逾期 · 打卡 a/b）与项目 pills，快速添加的识别提示在输入框占位。
- 选择（页面）：① **布局 = 两块板**——工具栏（标题 + 今日摘要 + Segmented「按日期 / 按项目」）→ 自然语言快速添加 → 项目 pills（全部 + 各项目色点与未完成数，右键编辑 / 归档，行尾 ＋ 新建、「已归档 N」菜单恢复）→ 左板议程（一整块 surface：已逾期 / 今天 / 明天 / 本周稍后 / 以后 / 无日期，sticky 段头、行左「时间槽」列、今天段按时刻插「现在」刻度线、段尾「已完成 N」折叠——一次性任务只保留今天完成的）+ 右板（一整块 surface：今日打卡带本周 7 日点 / 本周负荷三色堆叠柱 / 最近完成）；② **详情 = 右侧抽屉**，恰好盖住右板、不压暗议程，Esc 经 `useOverlayDismiss` 仲裁；内容 = 标题即改即存 → 项目 / 父任务路径 → 属性（项目 Menu、类型 Segmented、截止 / 计划起止 DatePicker precision=minute、**重复规则 Popover 可改**（类型 / 间隔 / 周几 / 每月几号 / 排除节假日）、提醒 Menu、日程说明）→ 打卡（连续 / 近 12 周完成率 / 近一年打卡 + 12 周热力格，过去计划日可点补打卡 / 撤销，今日打卡 / 跳过）→ 子任务 → **关联笔记接线**（复用 legacy ContentSelectorModal / RichTextEditModal，§6.1 共存期复用）→ 描述（ContentEditor + useEditContent，首次非空才建 content）；③ **legacy 五个系统分组取消**——类型由行尾图标与分段承载，不再做筛选入口；④ **自然语言快速添加**（`quickAdd.ts` 纯函数）：`#项目`、每天 / 工作日 / 每周X、X / 每月N号、今天 / 明天 / 后天 / (下)周X / M月D日、HH:MM / H点(半) / 晚上修饰、HH:MM-HH:MM 时段；判定 周期 > 时段（计划）> 日期或时刻（截止，只写日期 = 全天即时间部分为 0）> 普通；周期任务的时刻不入库（TodoRecurrence 无时刻字段，不造字段）；⑤ 项目色：legacy 17 色名收敛到 7 色设计板，全部走主题语义类（tag-1…5 / accent / ink-3），零新 token；⑥ 勾选 / 打卡乐观更新 + Toast 撤销；⌘/Ctrl+/ 聚焦快速添加（仅本页在栈顶时生效；2026-09-24 用户校准由 ⌘N 改为 ⌘/，避开 02 规范 §7 预留的全局 Ctrl+N）。
- 选择（主进程，UI 与 AI 两条路径一并覆盖）：① `TodoItemTable.createItem / updateItem` 末尾调 `syncCalendar`——截止 / 计划任务写入「待办清单」对应日历，**类型变更先 `removeTodoItem` 清旧映射再按新类型重建**（修正映射 `sync_type` 停留旧值），周期任务仍由日历读取时按规则即时生成（不写）；同步失败只记日志不阻断增改；② `deleteItem`（非级联）先清日历映射与事件（映射表无外键，原先残留到下次启动孤儿清理）；③ `moveAndReorder` 跨项目时**子树 group_id 随根迁移**（原先子任务留在原项目成孤儿）；④ 新增 `todo:list-archived-groups`（`listGroups` 过滤归档，恢复入口无数据源）。未改：完成 / 归档不影响日历事件（与原行为一致，待有诉求再定）、已打卡 / 跳过日仍显示在日历（需改 `syncRecurringTasksForRange` 按 completion 过滤，未做）。
- 未迁移（legacy 有、本页不提供）：手动拖拽排序与拖拽嵌套（议程按时间排序，子任务在详情里添加）、项目拖拽排序与置顶、任务级归档入口、Ctrl+Enter / ⌘N·D·P·R 类型快捷键（由自然语言输入取代）。
- 实现：`features/todos/`（types / model——分段、排序、周期打卡统计纯函数 / quickAdd / groupColors / queries——一次拉全量快照（项目 + 未归档任务 + 周期规则 + 近一年打卡 + 关联笔记，IN 查询 500 分批）+ 订阅 todo mutation 事件统一失效（首页 `["home"]` 一并失效）/ components——AgendaPanel、HabitRail、TodoDrawer + DetailFields + DetailSections、QuickAddBar、GroupPills、GroupDialog、TodoBits / views——TodosView / pages——todos）；`page/legacy.tsx` 删 todos 占位；主进程 `tables/todo-item.ts`、`tables/todo-group.ts`；`commands/todo.ts` 增 `listArchivedTodoGroups`。
- 验证：tsc 0 错误；eslint 0 error；vitest `features/todos` 18 例（model 分段 / 逾期 / 周期文案 / 连续打卡 / 热力格对齐 / 完成率；quickAdd 6 组）；主进程 `todo-calendar-consistency.test.ts` 6 例（新建写日历、普通 ⇄ 截止增删映射、改时间标题同步 + 改类型重建映射、单条删除清映射、跨项目子树迁移、归档列表）——注：本机 `better-sqlite3` 为 Electron ABI，sqlite 类测试需 `ELECTRON_RUN_AS_NODE=1 <electron> vitest run` 执行（既有 answer-content 测试同况）；实机：隔离 HOME / user-data-dir 启动 Electron 灌测试数据，截图核对议程分段、抽屉热力格、自然语言新建（计划任务落「生活」并在日历映射表写入 planned）、行内打卡、删除 + 撤销、cocoa 深色。
- **追记（2026-09-26，今日改抽屉）**：用户要求右栏「今日」同番茄页一样改为右侧 Drawer。常驻 312px 右板去掉，议程占满宽度；HabitRail（今日打卡 / 本周负荷 / 最近完成）移进非模态 `TodayDrawer`（与任务详情同位 top-0，Esc 经 `useOverlayDismiss`），由工具栏「今日」按钮开关（打开时按钮 soft 态），默认关闭。从今日里点任务 → 详情抽屉接替；关掉详情回到今日（`open = todayOpen && 无选中`）。

## D-041 闪卡复习页定稿（方案 A 复习台）+ 撤销评分下沉主进程

- 新页面 `features/flashcards/` 接管 `review` 入口，采用沉浸式复习台、跨卡组队列、推荐评分与 1–4 评分快捷键；题卡在剩余空间居中，删除卡片使用 Toast 撤销。
- 评分与撤销由主进程事务保证最新记录约束，复习队列默认排除 `suspended`；旧页面消费者按 P-flashcards 清单迁移后删除。

## D-045 番茄专注页定稿（方案 C「时间账本」）+ 小窗 / 沉浸窗重做 + 独立主窗口退役

- 背景：legacy `pages/PomodoroWindow` 是独立 Electron 窗口里的「预设列表 + 底部计时条 + 右侧记录栏」，新壳层侧栏只有占位；antd 与 `--th-*` 混用，另有预设 / 改时长 / 批量管理三个弹窗。三案 mockup（`mockups/pomodoro/`：A 专注舞台 / B 两块板 / C 时间账本，共用模拟主进程的计时引擎）；2026-09-24 用户选 C。二轮校准：① 选「近 7 天」时账本下方大片留白 → 行高随面板伸缩 + 底部「时段分布」合计行（PREFERENCES「切换视图后不能留大片空白」）；② 控制条 chip 悬停时数字键换播放图标导致宽度跳变 → 共用固定槽位原位交叉淡入（PREFERENCES「悬停不能改变元素尺寸」）；③ 小窗 / 沉浸窗保留并重做（`windows-v2.html`）：小窗取 A「控制条缩影」，沉浸窗按用户要求改为「纯黑底 + 大号翻牌时钟」。
- 用户裁决：① 首页「已专注」与统计页「专注节律」的入口改为跳转番茄专注页，不再调 `openPomodoroWindow()` 新开窗口——独立主窗口随 P-pomodoro 退役；② 小窗与沉浸窗保留，沉浸窗全屏、盖在最上层计时；③ 页面不注册状态栏（同 D-040），计时的全局存在感由侧栏入口的实时计时承担。
- 选择（页面）：① 工具栏 = 标题 + 今日摘要（个数 · 时长 · 连续天数）+ Segmented「近 7 / 14 / 30 天」+ 已归档菜单（恢复 / 删除）+ 新建预设；② **常驻控制条**：空闲 = 预设快速开始 chips（数字键 1–9 提示、右键开始 / 编辑 / 归档、拖动排序落 `reorderPomodoroPresets`）；专注中 = 播放器（剩余 / 已专注、状态、预计结束、小窗 · 沉浸（仅 Electron 渲染）、背景音 Popover、结束、暂停继续、底边进度线）；③ **账本大面板**：左 = 日 × 时（6–24 点）账本，色块按预设派生色（accent / tag-1…5，零新 token），暂停处留缺口，今天一行有「现在」刻度线与进行中色块，点色块开详情 Popover（暂停分布条 / 修改时长 / 删除），点图例高亮单个预设；行高 `flex-[1_0_40px] max-h-[104px]`（紧凑行下限 40px，2026-09-24 用户校准由 32px 上调），首行 ≥52px 时切「周视图」（色块加粗、日期列补当日个数）；底部「时段分布」半小时一桶、标峰值；右 = 选中日明细（记录行 + 按预设分布）；④ 预设编辑 = Popover（名称 / 倒计时 · 正计时 Segmented / 时长步进 + 10–90 快捷档），不弹对话框；⑤ 键盘（仅本页在栈顶、焦点不在输入框 / 按钮上）：空格暂停继续、1–9 开始第 N 个预设、I 进沉浸。
- 选择（行为，修 legacy）：① **提前结束**：legacy UI 恒传 `asComplete=true`，倒计时未到点手动结束也记为 completed——改为未到点传 false；界面的「提前结束」标签一律按 `focusMs < expectedMs − 30s` 推导，历史数据无需回填；② **不足 5 分钟结束**：主进程本就直接丢弃，legacy 仍弹 modal 确认——改为结束按钮原位二段确认（页面、小窗、沉浸窗同口径），超过 5 分钟直接结束；③ **删除不二次确认**：记录与预设都立即从视图消失 + Toast 撤销，5 秒后才落库（离开页面立即落库，同 D-040）；批量管理大弹窗取消；④ **修改专注时长不提供撤销**：`updatePomodoroSession` 按新时长重算结束时间与暂停段并重建日历事件，缩短再恢复会丢暂停段，Popover 说明「结束时间随之调整」；⑤ 删除预设后的历史记录显示「已删除的预设」（ink-3），统计照常计入。
- 选择（运行态与辅助窗口）：① `features/pomodoro/timerStore.ts`：会话 + 背景音镜像，websocket 通知（active-session-changed / tick / background-sound-changed）模块级常驻注册（同 publishRunStore 口径），tick 只在会话状态变化时写 store，秒级显示由组件以本机时钟推导（`useSecondNow`）；结束结果在渲染端按最后一份会话复算（暂停截到结束时刻、<5 分钟即丢弃，同主进程 stopSession），不查库；② 小窗（288×68，`window-manager` 尺寸同步修改）：平时只显示预设名 · 状态、剩余时间、结束时刻与底边进度线，悬停 / 暂停时右侧换成暂停继续 / 结束 / 回到番茄页，结束后原位显示结果可「再来一个」，整窗可拖；「回到番茄页」= `platform.window.showAndFocus()` + `BroadcastChannel` 请求主窗口 `openPage("pomodoro")`（`services/page-navigation` 新增 `requestOpenPageInMainWindow` / `listenOpenPageRequests`，PageNavigationBridge 监听，多主窗口时只由聚焦者响应）；③ 沉浸窗：纯黑底，固定 cocoa 深色 token（弹出的背景音面板同为深色），四张翻牌约七成屏宽，两段式翻页（motion，只翻变化的位），上下两行暗色信息，控件静止 2.2 秒淡出，Esc 退出、空格暂停，结束后牌面停住原位显示结果；BrowserWindow `backgroundColor: #000` 防闪白；④ 两个辅助路由直接挂新组件（不再套 QuickOpenLayout），各自 `initThemeRuntime` / `ensureDatabaseReady`（等设置同步完成再连库，预设名需查库）。
- 未迁移 / 不做：批量选择删除（改为逐条删除 + 撤销）；休息计时、关联待办、每日目标（需要新字段或主进程能力，未造假数据）；OS 级完成通知（legacy 亦无）。
- 实现：`features/pomodoro/`（model——计时 / 格式 / 聚合 / 结束推导纯函数；timerStore；queries——预设全量 + 近 90 天会话、结束后失效 `["pomodoro"]` `["home"]` `["stats"]`；components——ControlStrip、Ledger、DayDetail、SessionPeekPopover、PresetEditorPopover、FocusEditorPopover、SoundPopover、FlipClock、PomodoroNavBadge、PomodoroBits / presetTone；views——PomodoroView；pages——pomodoro；windows——MiniWindow、ImmersiveWindow、useAuxWindow）；`navigation.ts` 番茄入口 `badge: "pomodoro-live"`，Sidebar 渲染实时计时（收起态为图标角点）；`page/legacy.tsx` 删 pomodoro 占位；首页 / 统计入口改 `navigator.push("pomodoro")`。
- 验证：tsc 0 错误；eslint 新增代码 0 error；vitest `features/pomodoro` 15 例（model 10：倒计时 / 暂停 / 正计时推导、结束推导、提前结束容差、格式、连续天数、时段分布跨桶与扣暂停、轴位置；PomodoroView 5：chips 与数字键提示 / 摘要与提前结束标签、点击开始的预期时长、数字键开始、不足 5 分钟原位确认后按未到点结束、空格暂停且输入框内不接管）。浏览器（无 IPC）下确认页面在壳层内挂载与空态；未在 Electron 实机中跑完整开始 / 结束流程与小窗 / 沉浸窗（本机 dev 实例连着用户数据，未另起隔离实例）。
- **追记（同日，账本时间范围）**：用户要求能看 30 天以前、并提供快捷选择（mockups/pomodoro/plan-c-ledger.html 三轮）。不另开数据页，在番茄页内补齐：① 顶部分段 = 7 天 / 14 天 / 30 天 / **全部**；② 账本标题旁**时间导航**：`‹ 当前范围 ▾ ›` 按窗口长度翻页（往后不越过今天，往前不早于最早记录），离开今天出现「回到今天」；点当前范围打开选择面板——左列快捷项（近 7 / 14 / 30 / 90 天、本月、上个月、今年、过去一年、有数据的往年），右侧月历点两次选任意起止（同一天点两次 = 跳到那天前后），月历按当前显示的 6 周取会话打点；标题显示快捷项名或具体日期（非今年带年份），快捷项窗口随日期滚动、手选窗口固定；长区间照样按天列出（40px 紧凑行滚动），旧年份的行标签带年份；③ **「全部」概览**：累计数字（总时长 / 有专注的天 / 最长连续 / 专注日日均 / 最投入的月份）+ 按自然年的热力格（新年在上）+ 首条记录以来的单色月度柱；点格子跳到那天所在账本、点年份 / 月份打开那段时间，图例高亮对热力格与月度柱同样生效；无记录时空态说明。数据：近 90 天仍是常驻查询（今日摘要、连续天数、落在近期的窗口直接复用），更早的窗口按起止单独查（keepPreviousData 翻页不闪），「全部」才拉全量，最早记录日按 `summaryPomodoroTotal` 总数 + 偏移取一条（不为此拉全量）。实现：`features/pomodoro/range.ts`（窗口纯函数）、`components/RangeNav.tsx`、`components/AllOverview.tsx`，Ledger 抽出 `LedgerHeader` / `PresetLegend` 两件复用。验证：vitest `features/pomodoro` 25 例（新增 range 8 例：近 N 天 / 跨夏令时 / 翻页边界 / 居中跳转 / 本月上月今年过去一年 / 往年按最早记录 / 分段高亮 / 标题文案；PomodoroView 新增 2 例：分段切「全部」与回切、翻页后日期标题与回到今天）；tsc 0 错误；浏览器（无 IPC、空数据）下确认导航、选择面板、「今年」267 行账本与「全部」空态渲染。
- **追记（同日，图例限高）**：用户实机数据下预设多达 30+ 个，图例换成十余行，把「全部」的热力格挤成零高度。`PresetLegend` 改为只占一行：溢出的收进行尾「另外 N 个」（Popover 完整列表，按时长降序、可滚动、可点选高亮），高亮项被收起时按钮直接显示它的名字；「全部」的年度热力格设最小高度 172px（至少完整显示一年），空间紧张时由月度柱让出（下限 84px）。账本视图共用同一图例。新增 `PresetLegend.test.tsx` 2 例（模拟换行：溢出计数、收起项高亮时按钮显示名称）。
- **追记（同日，去掉区间分段）**：用户认为工具栏 7 / 14 / 30 天 / 全部 分段与时间选择面板重复。分段删除，「全部」并入选择面板快捷项末尾（显示有记录以来的天数）；「全部」时标题仍为「时间账本」、范围按钮显示「全部」，隐藏 ‹ › 与「回到今天」，月历不标当前窗口。
- **追记（同日，实机走查一轮）**：① **小窗**：用户嫌小，A 款等比放大 1.25 倍到 360×84（字号 / 控件改字面像素）；主窗口 Cmd± 的页面缩放按 origin 共享会连带放大小窗、内容撑破，`useCancelPageZoom` 以内容层 CSS `zoom: 1/zoomFactor` 抵消（Electron 无按窗隔离缩放的接口）；小窗常驻隐藏复用、主题只在启动时读一次，改为监听 `storage` 事件跟随主窗口换主题；悬停控件组位占 min-w，不再压住预设名。② **沉浸窗**：翻牌改中性黑牌面（#1f1f1f / #141414）+ 纯白数字，不取主题色；去掉底部进度线与「已专注 / 预计结束」行，只留上方预设名 · 状态。③ **页面不足 5 分钟确认改为 ConfirmDialog**（覆盖上文「原位二段确认」的页面部分）：行内确认在窄屏下挤压变形、warn-soft 底色在白卡上违和；小窗与沉浸窗仍原位确认（放不下 / 全屏弹窗突兀）；番茄页全局快捷键在焦点处于对话框内时让路。④ 时段分布每桶、账本色块改用 Tooltip（替换原生 title）：时段分布整列为热区、受控 Tooltip 锚柱顶；色块点开详情后静音其 Tooltip。⑤ 窄屏：账本标题与范围导航不压缩只让摘要省略；当天明细行去掉「更多」按钮（右键菜单与点时长保留），名字随空间截断以保证时长右对齐；「按预设」列宽按内容分配；控制条预设 chips 出现滚动条时顶部补等高留白。⑥ 组件库：浮层正文滚动轨道上下让位（不画进圆角）；Input / NumberInput 新增 `wrapperClassName` 控制外框宽度（className 仍落内部 input，此前各处写在 className 上的定宽一并改正）。
- **追记（2026-09-26，布局：预设进左栏 + 明细改抽屉）**：用户认为纸顶控制条里预设 chips 横向滚动操作不友好。改为纸内两栏：① 左栏 280px `FocusRail`（原 `ControlStrip`）——预设纵向列表（圆点 · 名称 · 时长 · 数字键⇄播放固定槽位），纵向拖动排序、右键开始 / 编辑 / 归档照旧；专注中顶部换成竖版播放器卡片（大号计时、状态、进度线、小窗 / 沉浸 / 背景音 / 结束 / 暂停），下方列表变灰不可开始（右键仍可编辑 / 归档）。② 右侧账本占满剩余宽度；原常驻的「当天明细」右栏去掉，改为点某天打开非模态 `DayDrawer`（原 `DayDetail`，Drawer sm，盖在账本右侧，不压暗、可边看边点其他天，再点同一天收起，Esc 经 `useOverlayDismiss` 仲裁）；「全部」概览点格子跳到那天时直接打开抽屉。抽屉关闭时账本不标选中行。左栏与账本之间不画分隔线（用户嫌竖线扎眼），靠留白分开；播放器起止时间单行（「11:50 开始 → 12:20 结束」），暂停次数并到状态标签后，窄栏不折行。
- **追记（同日，点预设 = 看详情）**：上条实机后用户指出「点预设应出 Drawer 看详情，而不是直接开始」。左栏预设行改为打开非模态 `PresetDrawer`（与 `DayDrawer` 同位、同一时刻只开一个，再点同一行收起）：头部 = 色点 · 名称 · 计时方式 + 编辑 / 归档；正文 = 开始按钮（专注中禁用，当前预设则显示「正在专注 · 时间」）→ 近 90 天个数 / 累计 / 最近一次 → 近 14 天每日柱 → 按天分组的记录（行同当天明细：点时长修改、右键删除）。直接开始保留两条快路径：行尾数字键槽位悬停变 ▶ 按钮（独立按钮，行改 `role=button` 避免嵌套）与 1–9 数字键。

## D-046 协作页定稿（方案 A3「协作台 · 侧栏嵌套」）+ 协作 UI 共享层 + 本机设置收敛为昵称

- 背景：legacy 协作分散四处——`pages/CollaborationView` 工作台（288px 左栏会话目录 + 内嵌协作编辑器）、右侧小组件 `CollaborationPanel`、内容页分享弹窗 `ContentCollaborationControl`（CustomModal）、协作设置弹窗（昵称 / 服务器地址 / 身份导出恢复）；antd message、`--th-*`、uppercase 小节题与 border 横线混用。mockup（`mockups/collaboration/`）：一轮 A 协作台 / B 共享墙 / C 协作名册 + 内容页入口稿；2026-09-25 用户选 A。二轮：A 的页内会话目录与全局侧栏并排「像两条侧栏」→ 去掉页内目录，给出 A1 会话条 / A2 标题切换 / A3 侧栏嵌套三种导航，用户选 A3。
- 用户裁决：① 骨架 A3；② 我发起的内容在协作页也能直接编辑（「在原内容中打开」只是跳转）；③ 协作设置在协作页就地改，只保留昵称——**服务器地址不暴露、不可改；身份导入导出去掉**；④ 右侧「协作共享」小组件去掉；⑤ 已结束的共享不单列（不设「已结束」分组）。
- 选择（页面）：① 共享内容作为子项挂在侧栏「协作」之下（仅协作页在栈顶且侧栏展开时显示，按「我发起的 / 我加入的」分组，子项 = 状态点 + 标题 + 申请数），选中项在子项上、父项降为「所在区」样式（accent 文字、无底无竖标）；父项「协作」挂待审批计数（收起为图标列时退化为角点）；② 当前内容是页面参数 `id`（single 页 + 可选参数，缺省或失效落到侧栏第一项），子项点击与 `openPage("collaboration", { id })` 经栈机原位更新参数；③ 页面只放一整块协作副本面板：顶栏 = 来源 · 在线成员（Popover：协作码 / 待审批 / 成员）· 协作码 chip（点击复制）· 在原内容中打开 · 更多（复制 / 轮换协作码、结束共享 / 退出 / 清理）；顶部内联连接异常横幅与本条内容的加入申请；正文与标题共用同一会话绑定；④ 工具栏 = 标题 + 份数 · 「N 个申请待处理」（Popover 就地批复）+ 昵称就地改 + 输入协作码 + 共享本地内容。
- 选择（行为，修 legacy）：① **先说明再共享**：内容页「发起协作」打开对话框即说明共享后果，确认「发起共享」才冻结 / 上传 / 发布（legacy 打开弹窗即静默共享）；② **移除成员统一确认**（legacy 工作台直接移除）；③ **在线摘要只数他人**（legacy 自己也算，只有自己时显示「1 人正在编辑」）；④ 协作码按 `XXXX-XXXX-XXXX` 分段展示与复制，加入对话框三段输入、整段粘贴自动分段（服务端比对本就忽略空白与短横）；⑤ **发起共享时缓存协作码明文**（主进程 `issueInvitation`；legacy 只有手动轮换才缓存，重开对话框读不到当前码只能重新生成）；⑥ 共享本地内容带上真实来源类型与实体 id（legacy 一律传 `content`）；⑦ 已结束的共享：主进程在作者结束后本就自动清理成员侧会话，只有本机仍有未同步改动 / 解绑失败时保留——此时按普通条目显示错误状态，面板横幅提供「清理」；⑧ 作者仍有未同步改动时禁止结束共享（ConfirmDialog 新增 `confirmDisabled`）。
- 选择（结构）：① `components/CollaborationUI/` 重写为应用级协作共享层（协作页与内容页对话框共用）：`index.tsx` 组件（Avatar / AvatarStack / StatusDot / SessionStatus / InvitationCode / MemberList / JoinRequestItem / SharePanel / LeaveDialog）、`model.ts` 纯函数（活动 / 在线摘要 / 排序 / 退出意图 / 协作码格式）、`useInvitation.ts`（协作码查询缓存）；头像色取 `memberColor`，与编辑器远端光标同色；② `stores/useCollaborationStore` 去掉 UI 选中态（选中改为页面参数），监听改为模块级常驻注册（同 pomodoro timerStore 口径，删除散落的 `initializeCollaborationStore()`）；无桥（Web）时直接视为已同步走空态；③ 主进程 `collaboration:configure` → `collaboration:set-nickname`，服务器地址固定为开发变量或默认服务，删除 `export-identity` / `import-identity`；历史会话仍按各自 `serverUrl` 刷新；④ `CollaborativeTitle` 拆出 `CollaborativeTitleField`（直接消费 binding，协作页标题与正文共用一个视图订阅）；⑤ 栈机 `activateExisting` 激活非栈顶条目时同步更新参数（此前只有栈顶才更新，带参打开会停在旧参数）；侧栏父项回到带子项的页时沿用已有参数；⑥ `utils/formatAgo` 自发布页提升为公共函数；⑦ Dialog 宽度改为相对视口限宽（`max-w-[calc(100vw-4rem)]`；原 `max-w-full` 在按内容定轨的 grid 遮罩里不生效，窄窗口溢出）。
- 实现：`features/collaboration/`（model——分组 / 选中解析 / 来源；openSource——回原内容，跨库开独立窗口仅 Electron；queries——共享候选检索；components——CollaborationRoom、CollaborationNav（侧栏子项 + 角标）、JoinDialog、ShareLocalDialog、NicknameChip；views——CollaborationView；pages——collaboration）；`navigation.ts` 协作入口 `badge: "collab-requests"`、`children: "collaboration-sessions"`；`page/legacy.tsx` 删 collaboration 占位；删除 `pages/CollaborationView/`、`components/CollaborationPanel/` 及 TabContent 分支、RightComponentsSidebar 挂载；e2e 测试壳与用例按新流程更新（服务地址经 `TAU_COLLAB_DEV_SERVER_URL` 注入）。
- 验证：tsc 0 错误；eslint 新增代码 0 error；vitest 新增 17 例（CollaborationUI model 9、协作页 model 5、JoinDialog 2、栈机带参激活 1），`src/` 全量仅 `tool-call-renderers` 2 例失败且在干净 HEAD 同样失败。e2e `collaboration.spec.ts` 2 例通过（隔离 Electron + 本地协作服务：发起共享 → 出码 → 协作者申请 → 同意 → 实时编辑 → 结束共享；活跃协作不阻止退出）；`notification-demo.spec.ts` 失败，原因是其依赖的 `join-request-notification` testid 自 D-038 改用 notify 后已不存在（既有失效，未修）。浏览器（无 IPC，mock 状态）确认侧栏嵌套、父项所在区样式、申请角标与工具栏；未在用户数据的 Electron 实例中走查（本机另一 dev 实例占用用户数据）。
- **追记（同日，code review 后：已结束共享的重新发起路径）**：上文 ⑦ 的残留会话（服务器文档已删、绑定未清）会挡住对同一内容的重新发起——创建流程按「恢复共享」对已删文档重新签码必然 404，渲染端此前只能把这类内容从候选里静默过滤（搜不到且无提示）。裁决（用户选根治方案）：主进程 `createContent` 命中 closed 残留时先按「清理本地记录」语义写回并拆除（`discardLocal`：project 回本地 + 删绑定 + 删会话），再重走创建得到新文档与新码，用户一次到位；pending（本机有未同步改动）不静默丢弃，报错引导到协作页清理。判定抽 `content-repository.planClosedReshare` 纯函数（closed + pending → 拒绝文案；closed 非 pending → 重建；active/leaving → 不干预，leaving 由 refresh 重试 finishLeave 自愈）+ 单测 3 例；渲染端候选过滤收窄为仅 `active` 会话。
- **追记（同日，结构：共享层改一组件一文件）**：上文明定的 `index.tsx` 承载全部组件（10 个组件 542 行）在 review 后按用户裁决改为**一组件一文件**（同 `packages/ui/primitives` 惯例）：Avatar / AvatarStack / StatusDot / SessionStatus / SectionTitle / InvitationCode / MemberList / JoinRequestItem / SharePanel / LeaveDialog 各自独立文件，`index.ts` 只留桶导出（消费方 import 路径不变）；顺带把散在 index 与 useInvitation 的重复 `errorText` 收进 model.ts。

## D-043 侧栏条目扩展槽注册表（navSlots）

- 背景：D-046 引入侧栏子项（`children: "collaboration-sessions"`）后，Sidebar 虽仍满足「条目声明在 navigation.ts」，但渲染端回到了硬编码——`item.badge === "pomodoro-live" && <PomodoroNavBadge/>`、`item.children === "collaboration-sessions"` 判断 + 直接 import 域组件与域 store（`useCollaborationStore`），且与 PomodoroNavBadge 是两处同型判断。原计划「出现第二个带子项的页再收口」，用户裁决提前收口（已有扩展计划）。
- 方案：`app/navSlots.tsx` 注册表——navigation.ts 只声明 key（`NavItemBadge` / `NavItemChildren` 类型导出于此），渲染组件集中注册：`NAV_BADGE_SLOTS`（Record 全键，value 组件或 null——null = 已声明未实现，如 `review-due` 闪卡到期数待接 query，保持「声明先行、实现渐进」语义且编译期强制新 key 显式登记）；`NAV_CHILDREN_SLOTS`（全键组件）；`useNavChildrenContent()` 聚合各子项槽「是否有内容」的响应式判定（hook 集中在一个文件顶层调用，Sidebar 单点调用，避免 map 内条件 hook）。Sidebar 查表渲染，`shouldExpandChildren` 只剩壳层知识（栈顶 + 声明 + 槽有内容）。
- 增量口径：新增域附属 = 域内写组件 + navigation.ts 声明 + navSlots.tsx 注册（含 useNavChildrenContent 加一行），Sidebar / Titlebar 不再改动。app 层引 feature 组件经此单点收口（与 AppShell 挂命令面板 / 设置弹窗同口径：壳层编排、声明集中）。
- **追记（同日，review-due 落地）**：注册表迎来的首个按设计扩张用例——`features/flashcards/components/ReviewDueBadge`（react-query 拉卡组 `stats.dueCount` 求和，口径同首页「待复习」：due_time 已到且未暂停；queryKey 挂 `["flashcards", ...]` 前缀以被 `invalidateFlashcardViews` 联动失效，窗口聚焦刷新兜底——主进程无闪卡变更广播）。全表无 null 占位后 `Record` 仍保持全键强制，新增 badge key 不注册依旧编译不过。
- **追记（同日，flashcards:changed 广播落地，消灭上一条的聚焦兜底主依赖）**：闪卡表层（`tables/flashcard.ts`）全部 8 个写命令（卡 / 卡组 CRUD、submitReview、undoReview）照 `content:updated` 先例收 `ctx: CommandContext`，写成功后 `broadcastOthers("flashcards:changed", { databaseName })`——表层单点天然覆盖文章 / 卡片 / AI 对话等所有生成入口。渲染端 `features/flashcards/queries.ts` 模块级常驻订阅（按库过滤后失效 `["flashcards"]` 前缀；接线随侧栏徽标 → useNavDueCount → queries.ts 的依赖链常驻）；为此把 `QueryClient` 从 main.tsx 抽为 `src/queryClient.ts` 单例。窗口聚焦刷新保留作兜底（同步等绕过表层的写入路径无广播）。

## D-044 日记页定稿（方案 D「一整张纸」：A 的 Feed 排版 + C 的聊天式输入 + 那年今日输入条上方一行）

- 背景：legacy `pages/DiaryView` = 800px 窄列时间线（左相对时间 + 中竖线圆点 + 每条一张描边卡），卡内常驻 Slate 编辑器（误触即改），12 色 antd 预设标签色、天气 / 心情图标；顶部筛选条塞日期预设 + 两个日期输入 + 标签多选 + 搜索；「新建」只插一张空卡片再点进去写；antd `Dropdown` / `modal.confirm` / `message` 与 `--th-*` 混用。产品定位（用户原话）：「像朋友圈，不是一天一条，一天可以多条碎碎念，可以打标签」。mockup（`mockups/diary/`，共用 35 条 mock + 7 标签，数据形状同 `types/diary.ts`）：一轮 A 时间流（倒序 Feed + 纸面右栏：热力日历 / 标签 / 那年今日）/ B 手账（整块月历 + 当天阅读列）/ C 对话流（顺序对话 + 底部输入条 + 标签嵌侧栏）。
- 二轮（2026-09-25）：用户要「A + C 结合——C 的 Chat 输入、A 的 Feed 排版」，并否决 A 的「左边卡片、右边不是」（不够沉浸），要**一整张大纸**；那年今日保留但「不想做成右边一个列表」→ 出 D（`plan-d-sheet.html`）。
- 三轮（同日）：D 初版把那年今日作为今天这一段的第一条「回声」织进流顶，用户否决「不应该放到最上面，只是一个入口」，但「还是要一些简略信息，否则没有点开的欲望」→ 改为一句预告 + 右侧抽屉；两个预告位（输入条上方一行 / 今天日期下）对照后，**用户选输入条上方**。
- 选择（骨架）：① 页面 = 工具栏 + **一整张 surface 纸**撑满内容区，页内无任何外部栏；② 纸内沿用 A 的排版：按天倒序，左侧粘性日期列（相对日 / 大号日 / 月·周 / N 条·M 字）+ 右侧条目（时间 · 正文 · 标签），条目悬停淡墨底、操作占固定槽位原位淡入；③ **A 右栏拆散**——标签作为「日记」入口的侧栏子项（D-046 A3 同款：标签即频道，点进只看该标签，在频道里发的自动带上该标签；右键改色 / 清理），日历收为工具栏图标按钮打开的热力月历 Popover（点一天只看那天、Shift 连选、近 7 天 / 近 30 天 / 本月 / 今年预设），纸右缘一列按月时间刻度（滚动高亮当前月、点击跳转、跨年插年份）；④ 输入沿用 C：纸底停靠输入条，左侧与日期列对齐「此刻 HH:mm」，**↵ 发送、⇧↵ 换行**、`#` 联想标签（按使用次数排、没有则创建）、页面上直接打字即进输入条；最新在顶，发出后回到顶部并闪一下新条目。
- 选择（那年今日）：不进流。输入条正上方一行预告「↺ 一年前的今天 · 首句 · 还有 N 条 ×」（× = 今天不再提示，工具栏常驻历史图标仍可打开）；点击从纸右侧滑出抽屉（盖在纸上不挤压，Esc / 点空白关），按年份列出当天全部条目，**点一条 = 关抽屉并跳到流里那一条**（居中并闪一下）。2026-09-25 用户校准：原每条悬停「接着写」（引用块带进输入条）遮挡正文且非必需、年份旁「在流里看」与点条目重复，二者连同输入条引用能力一并删除。
- 选择（行为，修 legacy）：① 发布一步到位（legacy 先插空卡片）；② **阅读态 / 编辑态分离**——默认只读渲染，点正文进就地编辑（完整编辑器、协作会话照旧），失焦 / ⌘↵ 退出；③ 删除不二次确认：立即消失 + Toast 撤销，5 秒后才真正落库（D-040 同口径）；④ 标签色改 Tag 七色板（D-021），旧库 hex 色读时就近映射、改色后写七色键；⑤ 补记可见——createTime 与归属日期不同天时标「补记于 …」；⑥ 列表无限滚动渐进渲染（PREFERENCES），不再整表挂载编辑器。
- 默认取舍（用户未明示，按「先简后繁」定，可推翻）：① 天气 / 心情是 entry 级旧字段，legacy 已无编辑入口 → 新页不展示、数据保留；② 输入条是纯文本快写，富文本（列表 / 图片 / 引用）在发出后点正文用完整编辑器补；③ 搜索沿用 FTS + 向量混合召回（日粒度命中），命中日内有字面匹配的条目时只显示这些。
- 主进程：新增 `create-diary-moment`（{date, content, tags} 单事务：确保当天 entry → 建段并写段级标签，替代「建 entry / 建段 / 再改标签」三次往返）；日记表层全部写命令广播 `diary:changed`（`flashcards:changed` 同款，覆盖 AI 工具 / MCP 等其它窗口写入口）。
- 结构：`features/diary/`——`model.ts`（纯函数：日期归一 / 分组 / 筛选含日粒度搜索的字面收窄 / 那年今日 / 连续天数 / 旧 hex 标签色就近映射七色 / 纯文本↔Slate 构造 / `#` 联想定位 / 快捷范围）、`queries.ts`（全量快照 react-query + 乐观更新的 mutations〔引用稳定，条目 memo 依赖〕+ 混合召回搜索 + `diary:changed` 模块级订阅）、components（Composer / MomentItem / DaySection / TagPicker〔含改色、清理确认〕/ CalendarPopover / MonthRail / OnThisDay〔预告 + 抽屉〕/ DiaryNav〔侧栏子项〕/ bits）、views/DiaryView、pages/diary.page.tsx（single；参数 id = 标签频道、date = 外部定位）。`page/legacy.tsx` 删 diary 占位；navigation.ts 日记入口 `children: "diary-tags"`。
- 侧栏扩展槽（D-043 增量）：`NAV_CHILDREN_SLOTS` 由「key → 组件」改为描述对象 `{ Component, selected(params), parentResets? }`——协作页恒有子项选中（`selected: () => true`，行为不变）；日记的标签频道是可选收窄，`id` 为空时父项保持常规选中，已在日记页再点父项清空频道回到全部（`parentResets`）。Sidebar 只按描述对象判定，仍不感知具体域。
- 渲染：条目默认只读 `Editor`（不建内容会话，同卡片墙预览），点正文才挂会话化 `ContentEditor`（会话就绪前以只读渲染占位、就绪后光标落回点击处，切换不闪不跳；实时保存，不设「完成」按钮与「更多 → 编辑」），节流 800ms 落 `update-diary-segment`、退出 flush；流**按天虚拟化**（`@tanstack/react-virtual`，一天一行、日期列在行内吸顶，按正文字数估高、`measureElement` 实测）；月份跳转 / 外部定位 / 那年今日先滚到目标天的估算位置让它挂上，再逐帧校正对齐（条目居中、天 / 月顶对齐）；2026-09-25 由「60 条一批渐进挂载 + `content-visibility`」改来——跳到几百条前要同步挂几百个编辑器、屏外估高导致落点偏。
- 验证：tsc 0 错误；eslint 新增代码 0 error（余 `*.page.tsx` 匿名默认导出警告，同全部页面定义）；vitest 新增 12 例（日记 model 10、主进程 create-diary-moment + 广播 2），全量 1356 通过，失败项仅 `tool-call-renderers` 2 例与 2 个 Playwright e2e 文件（均为既有失败，同协作页当期验证记录）。浏览器走查（无 IPC，向查询缓存注入 mock）：填充态、侧栏频道与父项降级、那年今日预告→抽屉→接着写引用、`#` 联想转标签、日历范围筛选、cocoa 主题；写入路径需在 Electron 内由用户走查。

## D-089 问题页方向定稿（方案 A2「顶部切换」三栏清单）+ 多态材料关联表 + 探究轨迹事件表

- 背景：legacy 问题页（`pages/QuestionWindow`）= 左侧分组栏 + 问题列表 + 一串 antd Modal（新建 / 详情 / 写答案 / 选答案 / 看答案），答案在列表里只显示「答案 #id」，`resolvedTime` 从未上屏。用户的使用场景：学习时收集问题 → 带着问题查资料 → 写卡片 / 文章 → 从材料构建答案。三案 mockup（`mockups/questions/`：A 三栏清单 / B 探究看板 / C 研究笔记，共用 22 个问题 + 39 份材料）；2026-09-25 一轮用户选 A，但指出「分组列和全局侧栏没有隔离开，像两条侧栏」；二轮 A 页内三变体（A1 板内分栏 / A2 顶部切换 / A3 侧栏嵌入）对照后裁决 **A2**。
- 用户裁决（2026-09-25）：① **布局 = A2**：工具栏（标题 + 状态摘要 + 新建）→ 左板列表（快速收集 → 分组 chips 行（全部 + 各分组色点与未解答数，横向滚动、可拖问题上去移动分组）→ 按「探究中 / 待探究 / 已解答」三段，已解答默认折叠）+ 右板常驻详情；不设独立分组列；② **状态文案**改为「待探究 / 探究中 / 已解答」，`not_started / in_progress / resolved` 枚举不变；③ **不保留独立问题小窗**（`QuestionWindow` 独立窗口入口随迁移登记 04 删除清单），快速收集改为**命令面板动作命令「记一个问题」**（`searchMeta.ts` PaletteCommand `kind: "action"`，不新增快捷键，不占 Ctrl+K 以外的键位）；④ **首页放「探究中的问题」速览**；⑤ **写卡片不自动加标签**；⑥ **探究轨迹 = 自动记录 + 手动「记一笔」两者结合**；⑦ **材料关联新建表**，不复用 `content_link`。
- 选择（页面，以 mockup A2 为准）：① 详情内容 = 分组 Menu + 提出时间 → 标题即改即存 → 状态三段条（点任一段直接设置）→ 背景（富文本）→ 我的答案（独立答案）→ 探究材料（类型图标 + 真实标题 + 两行摘要 + 元信息，悬停叠加「打开 / 解除关联」，不改行尺寸）→ 动作（写一张卡片 / 新建 ▾（文章 / 白板 / 项目 / 独立答案）/ 关联已有 L）→ 探究轨迹；② 状态环：待探究 = 虚线空圈、探究中 = 半满 accent、已解答 = ok 实心勾，零新 token；分组色为数据色，只出现在小方点；③ 第一份材料挂上时自动进入「探究中」（可撤销）；删除 / 解除关联 / 改状态均不二次确认，Toast 撤销；④ 键盘：↑↓ 切换、1/2/3 改状态、L 关联材料、⌫ 删除；⑤ 快速收集一行输入，`#分组` 指定分组，缺省进当前分组。
- 选择（数据）：
  - **材料关联表** `question_link(id, question_id, target_type, target_id, sort_index, create_time)`，`target_type ∈ card / article / project_item / project / white_board / answer`（answer = 只属于该问题的独立答案 content）。理由：项目（`project`）与白板（`white_boards`）没有 content id，`questions.answers` 的 content id 数组存不下；`content_link` 无排序字段、语义是内容引用剪藏。迁移时 `answers` 逐条转行（按 content 反查 card / article / project_item，否则为 answer）。
  - **轨迹事件表** `question_event(id, question_id, type, payload, create_time)`：自动写入 提出 / 状态变化（含自动进入探究中）/ 关联（区分「从问题里新建」与「关联已有」）/ 解除关联；手动写入 note。不追踪材料的后续编辑。旧数据回填：提出（create_time）、材料（按 content 创建时间推算并标记）、解答（resolved_time）；中间过程不可回填。
  - **修正 legacy 行为**：`addAnswer` 挂第一个答案即置为已解决（与「第一份材料 → 探究中」冲突，去掉）；`deleteAnswer` 连带 `deleteContent`（解除关联只删关联行，卡片 / 文章本体不动；独立答案随问题删除时才清理）。
- 落地（2026-09-25）：
  - 数据：`question_link` 额外带 `content_id`（关联持有引用的 content，目标被删后仍能释放引用）；`questions.answers` 保留为 content id 缓存（每次关联变化同步），旧消费者（MCP、发布、编辑器问题块、RightComponentsSidebar）读缓存无需改动；回填以 `migration_meta` `question-link:v1` 保证只跑一次，早于提问的材料关联时间按提问时间记、轨迹标「约」。`resolved_time` 语义改为「标为已解答的时刻」（旧语义为首个答案时间，回填时非已解答问题清空）；改状态可撤销（带 `revertEventId` 删除那条事件而非再记一条）。`QuestionTable.upgradeTable` 不再每次维护打开都重写全表 `sort_index / resolved_time`。
  - 页面：`features/questions`（CaptureBar / GroupChips / QuestionList / QuestionDetail / MaterialList / MaterialPicker / Trajectory / AnswerDialog）；写卡片复用 `features/cards` 的 `CreateCardDialog`（onCreated 后挂上）；新建文章 / 白板 / 项目后挂上并页内打开；背景存 `questions.description`（停笔 800ms 保存）。分组色板与分组弹窗提升为 `utils/groupTone.ts`、`components/GroupDialog.tsx`（待办共用）。侧栏入口改名「问题」并显示探究中数量。
  - 命令面板：任何查询附带「记为问题」行——问号结尾或带 `#分组` 时置顶，否则垫底（不抢搜索回车）；前缀「问题:」/ 命令「记一个问题」进入收集模式。
  - 首页：「最近编辑」之后一整行「探究中的问题」（按最近活动，最近进展取最后一条轨迹事件），点击带 `selectedId` 定位。
  - 已删：独立问题窗口（window-manager / index.ts `--window-type=question` / window-module-mapping / `/questions` 路由）。旧页面 `pages/QuestionWindow` 与 `useQuestionStore` 等 P-questions 删除（04 §questions）。
  - 未做：发布（`buildQuestPages`）仍只发布 content 类材料，项目与白板材料不进站点。
- **追记（2026-09-26，一整张纸 + 详情抽屉）**：用户要求问题页同待办改为一整张纸、点问题在右侧出 Drawer。两块板去掉：工具栏（筛选分组时标题即分组名）与快速收集固定在纸顶，三段列表占满宽度；`QuestionDetail` 改为非模态 `QuestionDrawer`（md 560，top-0，Esc 经 `useOverlayDismiss`）——头部 = 可编辑标题 + 分组 Menu / 提出时间 + 更多菜单，正文 = 状态三段起的原有内容；再点同一行或 Esc 关闭，↑↓ 切换时抽屉跟随；打开中切换问题时加载期显示 Loading 而不沿用上一条内容。
- **追记（2026-09-26，公共「关联已有」检索 + 内容编辑弹窗）**：用户指出待办详情的「新建笔记 / 关联已有」仍是 legacy 弹窗（`RichTextEditModal` antd + CustomModal、`ContentSelectorModal`），要求用新组件与主题体系重做，且「关联已有」做成公共搜索组件。① 主进程新增只读模块 `tables/entity-search.ts`（`entity:search`）：按类型（卡片 / 文章 / 项目文档 / 项目 / 白板 / 日记）LIKE 检索标题与正文，空关键字按最近更新，返回 `EntityCandidate`（含 contentId）；原问题专属 `question:search-targets` 删除，「已关联」改由调用方 `isLinked` 判定。② 公共 `components/EntityPicker`：`@tau/ui` Dialog + 搜索框 + 类型 Segmented（kinds 限定）+ 行列表，多选（默认）/ 单选，已关联置灰，↑↓ / ⏎ / ⌘⏎ 键盘操作；问题页 `MaterialPicker` 删除改用它，待办关联笔记可选卡片 / 文章 / 项目文档 / 日记并支持多选。③ 公共 `components/ContentEditDialog`：就地编辑已有 content（useEditContent 自动保存），版式同「新建卡片」弹窗，标题行可选（卡片无标题行）、可选可编辑。④ 待办「关联笔记」改名「关联材料」，按钮为「新建 ▾（卡片 / 文章）/ 关联已有」（用户要求卡片不单独拆按钮）：新建卡片复用 `CreateCardDialog`，保存后以卡片首行作标题快照挂到任务；新建文章以任务标题建文章、挂上并页内打开；不再新建 legacy「未命名文档」式无主笔记（type = custom，存量仍可就地编辑、标题可改）。点材料行：卡片（与无主笔记）在 ContentEditDialog 就地编辑，文章 / 项目文档 / 日记经主进程 `entity:locate`（content → 实体 id）打开所在页面，不做弹窗预览。

## D-047 白板列表页定稿（方案 A「画廊」）+ 缩略图复用导出图片管线 + 元信息窄接口

- 背景：legacy `pages/WhiteBoardView` = antd 卡片网格 + 右下悬浮「＋」；无封面时显示 CDN 默认占位图（离线破图、千篇一律）+ 五色随机描边；卡片只有标题 / 「发表于」创建日期 / 两行描述，看不到页数、内容与最近修改；更多菜单悬停弹出，删除走 `modal.confirm`。mockup（`mockups/whiteboards/`，12 个白板 29 页，缩略图按元素几何实时画出）：一轮 A 画廊（缩略图卡片网格 + 悬停扫页）/ B 胶片（一整张纸，每个白板一条页带）/ C 预览台（目录 + 大预览）。
- 一轮裁决（2026-09-25）：**选 A**；保留自定义封面，没有封面用画布缩略图；缩略图**复用导出图片**；加页内标题过滤；删除提示被几个项目引用；标签待看日记做法。二轮（`plan-a2-gallery.html`）演示日记式侧栏标签后裁决：**标签按侧栏做，卡片上不显示标签**。
- 选择（页面）：① 工具栏 = 标题（在某个标签下时带可关闭的标签 chip）+ 摘要（N 个白板 · N 页）· 标题过滤（⌘F / Ctrl+F 聚焦、Esc 清空、命中高亮、「命中 / 总数」）· 排序 Segmented（最近更新 / 创建时间 / 名称，默认最近更新）· 主按钮「新建白板」；② 卡片 = 缩略图 + 标题 + 一行描述 + 「N 页 · N 个元素 · 相对更新时间」，有演示序列标「可演示」；多页白板在缩略图上**横向移动即翻页**（左上页名、底部页码刻度），点击打开当前看到的那页，否则打开上次停留页（`activeWhiteBoardContentId`）→ 第一页；③ 「更多」菜单：打开 / 编辑信息 / 设置或更换封面 / 移除封面 / 删除；④ 新建 / 编辑信息 = 标题 + 描述 + 标签（已有标签平铺点选，输入回车加新标签），在某个标签下新建预先带上它，「创建并打开」直接进画布；⑤ 删除确认写明页数与元素数，并列出引用它的项目（`get-project-item-by-ref("white-board", id)` → 所属项目名），说明删除后这些条目解除关联（主进程本就 `resetProjectItemRef`）。
- 选择（标签）：日记 D-044 同款侧栏嵌套——「白板」入口下展开各标签（按使用次数）+ 无标签，点击经页面参数 id 收窄（`tag:<名>` / `untagged`），再点回到全部，右键「清理这个标签…」。白板标签没有颜色设置（`WhiteBoard.tags` 只是字符串数组），侧栏用中性 `#` 图标，不造色板。navSlots 增 `whiteboard-tags`（有白板带标签才展开）。
- 选择（缩略图）：导出图片的离屏截图逻辑从 `ExportImageModal` 抽为 `components/WhiteBoard/hooks/useBoardCapture.tsx`（导出与缩略图共用），`WhiteBoardRef` 增 `captureThumbnail`（全部元素、扩成 16:10、按「无选区」渲染但不改动画布选区与视口、WebP、宽 640）。画布页（`WhiteBoardContentView`）在编辑停下 4 秒后、以及打开时缩略图缺失或早于页的更新时间时后台截一张；页面被保活隐藏或窗口在后台时不截，回来再补。**缩略图存渲染端 IndexedDB（按「数据库 + 页 id」），不进主库、不参与同步**——它是可再生缓存；换设备 / 清缓存后显示「打开后生成预览」占位。`imgUrl` 字段不能复用：主进程在建白板 / 加页 / 更新时都会把封面拷进去。
- 主进程：新增 `update-white-board-meta`（只改白板行的标题 / 描述 / 标签 / 封面；缺省 = 不改、空值 = 清空）——原 `update-white-board` 不带子白板列表会删光所有页，带上又会用列表手里的旧画布数据覆盖正在别处编辑的页，且 `||` 合并使描述清不空、封面移除不掉；`createWhiteboard` 修为写入传入的 tags（原来恒写 `[]`）。单测 `__tests__/whiteboard-meta.test.ts`。
- 暂不做：白板详情（多页工作台）迁移——点卡片先进已有的 `whiteboard-content` 画布页（单页），多页切换 / 页管理待下一页；「在新窗口打开」无白板窗口能力，不放入口；「从头演示」画布页暂无按参数进入演示的入口，卡片只标「可演示」。
- 结构：`features/whiteboards/`——`model.ts`（投影 / 排序 / 范围 / 标题过滤 / 标签统计 / 打开目标 / 相对时间，单测）、`thumbnails.ts`（IndexedDB 缓存 + react-query）、`queries.ts`（列表 / 写入 / 引用 / 单页画布，画布保存后失效列表）、components（WhiteboardCard / WhiteboardInfoDialog / WhiteboardNav）、views/WhiteboardsView、pages/whiteboard.page.tsx（single；参数 id = 标签范围）。`page/legacy.tsx` 删 whiteboard 占位；04 清单 §whiteboards。

## D-048 白板详情页定稿（方案 A2「底部页签栏」XMind 式）+ 页操作窄接口

- 背景：legacy `pages/WhiteboardDetailView` 两种形态——多页白板 = 画布 + 下方通栏子白板页签（毛玻璃 + 上边框横线，悬停出编辑 / 删除图标，「＋」弹窗输名新建，删除 `modal.confirm`，每 3 秒轮询整页保存）；单页 = 顶部 antd 面包屑（带边框线）+ 画布。新壳层只有单页的 `whiteboard-content`。mockup（`mockups/whiteboard-detail/`）：一轮 A 底部浮动页签 / B 侧栏嵌套页 / C 翻页器 + 页总览；用户要「类似 XMind 底部的那种标签页」→ 二轮 A2（`plan-a2-xmind.html`）。
- 裁决（2026-09-25）：① A2；② **只迁页面外壳**，画布自带的工具条 / 属性栏 / 状态栏 / 元素树侧栏 / 右键菜单 / 插入弹窗的换皮单独出一轮 mockup；③ 独立白板（不属于任何白板的单页，画布里嵌套的白板等）只显示那一页，不加页签栏；④ **只有一页时页签栏默认隐藏，鼠标移到底边才浮出**（XMind 同款）。
- 选择（页面）：新增 page `whiteboard-detail`（params，getId 按白板 id；参数 `id` 白板、`page` 当前页），列表点卡片 / 新建后进它；`whiteboard-content` 保留给独立单页。画布放在一整张 surface 纸里；多页时纸面下缘一条 34px 页签栏（页面底色上），左侧「＋ 新建页」「所有页」菜单，接着各页签，当前页签 surface 底 + 卡片投影、从纸面下缘垂下，底部 accent 短线；点击切页、双击 / F2 改名、右键重命名 / 复制这一页 / 删除这一页（仅一页时禁用删除）、拖动排序（react-dnd，越过中线才换位）、⌃PageUp / ⌃PageDown 切页。单页时栏改为纸面左下的浮层，底边 14px 感应带悬停浮出，改名 / 菜单打开期间保持显示；浮层只占左侧，不挡画布右下自带的状态栏。
- 选择（行为）：同一白板内切页由栈机原位更新参数，**不进后退历史**；停留页记回主进程，**`set-active-sub-white-board` 不再刷新白板 update_time**（查看状态不算修改，否则翻看就会排到「最近更新」最前）。新建页不弹窗，直接「第 N 页」并切过去。删除页 ConfirmDialog（写明这一页的元素一起删除）；删当前页时先 flush 未落库改动、切到相邻页再删，避免卸载时的保存落在已删除的页上。面包屑「白板名 / 页名」（单页只显示白板名），点白板名打开编辑信息（与列表同一弹窗）。保存沿用实时保存（停 400ms 落库），替代 legacy 3 秒轮询。
- 主进程：新增 `rename-sub-white-board`（只改页名，不用调用方手里的旧数据覆盖页）、`duplicate-sub-white-board`（副本插在原页后并设为当前页；**先建空页再写数据**，让 updateWhiteboard 按差量为嵌入正文补引用计数——直接带数据创建不加引用，删副本会把原页仍在用的正文一起释放）。单测补在 `__tests__/whiteboard-meta.test.ts`（改名、切页不刷新更新时间、复制含引用计数）。
- 结构：单页画布逻辑（读取 / 实时保存 / 后台缩略图）抽为 `components/BoardCanvas.tsx`（ref 暴露 `flush()`，复制与删除前调用），`whiteboard-content` 与 `whiteboard-detail` 共用；`components/SheetBar.tsx`（页签栏）；`views/WhiteboardDetailView.tsx`；`pages/whiteboard-detail.page.tsx`；`queries.ts` 增 `useWhiteboardDetail` / `useWhiteboardPageMutations`（写后以主进程返回的白板更新详情缓存、失效列表；改名同步改画布正在用的页缓存，免得下次保存把旧名写回）。MCP tab-content 映射 `whiteboard-detail` → 白板内容提供者。

## D-049 白板画布 chrome 换皮定稿（方案 A「顶部工具条 + 跟随浮动属性条」）

- 背景：D-047 / D-048 只迁了页面外壳，画布组件 `components/WhiteBoard` 内部仍是独立的「蓝调毛玻璃」：顶部工具条 / 右侧属性竖条 / 右下状态栏都是 `rgba(248,250,255,.9)` + `backdrop-filter` + 大投影，激活靛蓝、选中框蓝；元素树是占一整列的 300px 侧栏（与全局侧栏构成两条侧栏）；右键菜单自绘、各插入弹窗是 antd 或自绘灰蓝 tailwind + `--th-*`。mockup（`mockups/whiteboard-canvas/`，同一张可操作 mock 画布）：A 顶部工具条 + 跟随浮动属性条 / B 左侧竖工具条 + 右侧常驻竖属性条 / C 底部 dock + 检查器面板。
- 裁决（2026-09-25）：① **A**；② 元素本身的默认样式（图形黑描边、箭头蓝、卡片白底、导图蓝主题）**单独再议**，本轮只换 chrome；③ 工具条保留顶部居中，演示序列入口并入右下「演示」；④ 卡片笔记 / 视频笔记抽屉一起换。
- 选择（公共件）：新增 `components/WhiteBoard/chrome/`——`ChromeBar`（实底 surface + shadow-lift + ring-line-2，内建 `stopCanvasEvents` 截住指针 / 滚轮 / 右键，免得落到画布容器）、`ChromeButton`（30px，Tooltip 包 button、ref 透传，可直接做 Menu / Popover 触发器；激活 accent-soft，带子菜单右下固定小三角）、`ChromeGap`（组间留白，不画竖线）；属性条目 `AttrPopover`（点开向元素反方向展开的弹层，开关型属性的开关放标题右侧）/ `AttrToggle`（纯开关项点一下直接切）/ `AttrAction`；控件 `SwatchRow`（数据色完整保留，外壳 22px 圆色块 + accent 外环）、`Slider`、`OptionGrid`（图示选项等宽网格）、`Seg`（Segmented 满宽）、`Field`；`chrome/icons.tsx` 补 lucide 缺的属性图标。
- 选择（各部件）：工具条 = 绘制（形状 / 箭头 / 手写 / 文本 / 思维导图）· 媒体（图片 / 视频 / 音频 / 网页）· 引用（卡片 / 白板）· 容器（画框 / 分栏）四组，子菜单走 Menu 公共件，形状是四格图块 Popover，图标统一 lucide，「Frame / Column / 富文本」改叫「画框 / 分栏 / 文本」；属性栏 = `AttributeSetter/FloatingAttrBar`（选区包围盒换算到容器坐标，浮在元素上方 12px 水平居中，贴近工具条时翻到元素下方、弹层随之向下；拖动时隐去、选区出视口时不显示），8 个 setter 全部改为条目 + 弹层，数据写入与本地记忆逻辑原样保留；多选 = 对齐 / 均分，手写合并 / 拆分只在选区满足条件时出现（不摆禁用态）；状态栏 = 网格（开关 + 档位 chip）· − 缩放百分比（单选菜单）＋ · 全览 · 「演示」弹层（点序列即放映、悬停出编辑 / 删除、删除走 ConfirmDialog、底部「新建演示序列」）；元素树 = 画布左上按钮开关的 264px 浮层（默认收起，不再记忆宽度；已由 D-050 改为纸面内停靠栏），行首类型图标中性化（不再按类型配色 chip）、选中 bg-selected、「更多」占固定槽位、拖拽指示 accent，右键与「更多」同一份 Menu；右键菜单 = 插件条目渲染到 Menu 公共件（子菜单 / 键盘 / 外点关闭由公共件承担，`useContextMenu` 只保留滚轮收起）；演示创建面板 = 右上浮层（名称在头部就地编辑，不再弹命名框）、放映控件 = 底部居中 ChromeBar（翻页 / 激光笔 / 退出），激光笔 accent；笔记抽屉 = 纸面内右侧浮起的 surface 抽屉（inset 12px、rounded、无分隔线）。
- 选择（插入弹窗）：画布内自有弹窗统一 Dialog——插入图片（地址 + 固定高度预览，Enter 提交）、AI 图片生成（Textarea + Button loading，⌘↵ 提交）、添加网页（地址或「选择本地 HTML 文件…」，本地文件上传成功即插入）、选择要嵌入的页（行式列表 + 页结构示意）、导出图片（预览 + 背景 Seg + 倍数 / 边距滑杆，导出中锁定）；看图遮罩 bg-overlay，去毛玻璃。页结构示意 `schematic.ts` / `PageSchematic` 从 `features/whiteboards` 下沉到 `components/WhiteBoard/schematic/`（画布派生件，列表页与画布弹窗都正向依赖它）。只包了一层共享弹窗的（选卡片 / 视频 / 音频 / 引用白板第一步 / 新建白板）本轮未换，见 04 清单。
- 选择（画布 chrome 色）：选中框 / 框选 / 控制点 / 箭头中点手柄 / 连接点 / 参考线 / 网格改走主题 token（`var(--tau-accent)` / `--tau-bg-surface` / `--tau-line-1`），不再是蓝与青紫渐变。元素本身的颜色一律未动。
- 行为变化：演示序列新建不再弹命名框（名称在面板头部就地填写，空名称提示并聚焦）；演示「演示」弹层直接订阅序列变化（修保存后列表不刷新）；右键菜单「Frame / Column」改叫「画框 / 分栏」；元素树里删除与画布 Delete 一致，不再二次确认（可 ⌘Z 撤销）；取消关联笔记的确认从 antd `modal.confirm` 改为 ConfirmDialog；画布根组件与各部件的 antd `message` 改为 toast。追记（同日 review 补录）：导出图片边距滑杆上限从 500 收窄到 200（大留白导出不再可达，滑杆可读性优先）；思维导图节点笔记入口从 hover 图标改为属性条 / 右键菜单（需先选中节点，`toggle-note` 事件随之退役，关闭走抽屉自身）；插入图片 / AI 生成弹窗提交中锁定（Esc / 遮罩不再放行，异步结果不会在关窗后落画布）；属性条弹层为非模态，选完颜色 / 选项不自动收起（浮动条试色场景）。
- 结构：删除画布内 27 个 `.module.less` 中 chrome 部分（Toolbar / ToolbarMenu / StatusBar / GridSettings / PresentationSequence / AttributeSetter 各 setter 与 common.less / PresentationCreator / PresentationMode / 画布根 index.module.less 的右键菜单与侧栏样式）、`ThemeColorPicker`、`ModernSlider` / `StyleOptionGrid` / `Colors`、`assets/white-board/*.svg`、元素树配色 `src/node.css`；详见 04 清单 §whiteboards「画布 chrome」。

## D-050 白板元素树改为纸面内停靠栏（方案 A「中性图标 + 内容命名」），替代 D-049 的浮层

- 背景：D-049 的元素树是画布左上按钮开关的 264px 浮层——压住画布左侧、入口是画布里的悬浮按钮；且元素未手动命名时行名退回类型名，一页文本全叫「文本」、同一图标，树等于没有。mockup：`mockups/whiteboard-outline/`（A 中性图标 / B 类型色块 / C 缩略预览，同一张可操作 mock 画布，`canvas.js` 的 `dock` 选项）。
- 裁决（2026-09-25）：① **A**；② 展开元素树**不**连带收起全局侧栏；③ 默认收起，开关与宽度全局记住；④「按类型筛选」本轮不做。
- 选择：元素树 = 画布纸面内左栏（`ResizeableAndHideableSidebar`，右缘淡线兼拖拽边界，200–420px），与项目文档树同构；开关 `OutlineToggle` 钉在标题栏面包屑最前（多页白板详情与单页画布页都有），状态 `useWhiteboardOutlineStore`（zustand persist `tau-whiteboard-outline`）；头部「元素 N」+ 查找（按行名匹配，结果平铺）；行 32px / 13px，行首中性线性图标 15px（ink-2，选中 accent-text），容器的直接子元素数与「更多」共用固定槽位交叉淡入。
- 行名 `elementLabel`：手动命名 > 内容（文本首段、图形里的字 / 形状名、导图节点文字、画框 / 分栏标题、图片说明、音频标题、网址、箭头「起点 → 终点」）> 类型名；创建时写入的默认名（「手写」「矩形」等）不算手动命名；超 40 字截断。卡片元素只存 cardId，仍显示「卡片」。
- 行为变化：`WhiteBoard` 的 `showSidebar` 默认改为 `false`，只有白板页（`BoardCanvas`）打开；项目里的白板条目、文档内嵌白板不再有元素树入口（它们没有面包屑开关位），上述 legacy 挂载点已显式传 `showSidebar={false}`，把默认值收编为声明式意图。

## D-051 项目域迁移收尾：queries 收编 + P-projects 锚点执行

- 背景（2026-09-26）：详情换皮已于 2026-09-24 完成（04 清单 §projects 已补记），随迁清单剩余三项（详情域 queries 收编、DataTableProjectView/TableProjectItemView 同构合并、方向倒挂）与 P-projects 删除锚点一并在本日执行；用户裁决全部纳入并追加 folderOpen 受控展开重构。
- 数据层收编：`useProjectTreeData` 改 react-query（`["projects","tree",id,childrenKey]`，children 指纹编进 key——增删/移动子项后 detail 缓存刷新即自动重拉）；event bus（project-item:updated）保留为跨编辑器/跨窗口实时通道，订阅分支改 `setQueriesData` 就地并入树缓存（cards 域先例），每秒自动保存不打扰结构；ProjectList/ProjectView 的 getProjectById/getProjectList/getAllCards/getAllWhiteBoards 直调全部换 query（`useProjectDetail`/`useProjectsList`/`useProjectRefCards`/`useProjectRefWhiteBoards`）；域入口挂切库整域失效。操作内一次性读（写后校验类）不强行收编。
- 结构收编：DataTableProjectView / TableProjectItemView 抽共享骨架 `shared/DatabaseWorkspace`（hook 解构 + 守卫 + 布局 + Database JSX + 标题编辑骨架），两视图保留各自实体加载与独有功能（项目切换下拉 / event bus 标题广播）。
- 方向倒挂归位：`hooks/useDynamicExtensions` 参数化（去 ProjectContext 读取，两处既有消费均不在项目上下文内、行为等价）；ProjectListSlate 测试删历史遗留 Provider；`pdfCitation.ts` 纯函数 git mv 至 `utils/`（5 消费方改引）。
- P-projects 执行（2026-09-26）：删 `pages/ProjectsView/` 整目录（8 文件）+ TabContent 的 ProjectList 分支与 lazy import + `useProjectsStore` 整文件（dragging 已抽 `useDraggingStore`，CRUD 已有 queries.ts mutations 版，删前 rg 复核全仓消费者清零）；`TabType.ProjectList` enum 成员保留（legacy 侧栏/搜索导航标识 7 处引用，随 G1/G2 整体退役）。
- 顺手收口：`IS_REACT_ACT_ENVIRONMENT` 声明从 81 个测试文件（4 种写法散落）收口到 `src/test-setup.ts` 单点。
- folderOpen 受控化实现：`projectTreeExpandedStore`（zustand）以历史 key `project-item-${db}-${id}` 为存储后端（旧折叠偏好免迁移），树视图与思维导图裸读写统一收口；定位脉冲 = ProjectList 的 `batchReveal(祖先 ∪ 目标)`（引用稳定化保证仅定位/祖先链变化触发），用户意图与脉冲同层显式覆盖；`revealAncestorIds` 下发 prop 链与思维导图 `foldStateVersion` 重算补丁随迁退役；激活项自身展开 effect 保留（itemId 为导航事件源）。

## D-052 完全移除白板演示录屏功能（whiteboard-recording）

- 背景：录屏随演示模式引入（788c2eb98），产品上唯一入口即白板演示模式——进入自动弹独立录制控制浮窗（独立 BrowserWindow），渲染端 MediaRecorder + getDisplayMedia 采集，主进程 desktopCapturer 选源、保存并经 ffmpeg 多策略转码（webm 直写 / mp4·mov·mkv 转码）。功能面窄而链路重（专用控制窗、setDisplayMediaRequestHandler、win32 专用启动开关），裁决整体移除；演示模式本体（翻页、激光笔、全屏）保留。
- 裁决（2026-09-25）：① 整体移除，含两套设置页（新版「创作工具」分区整组 + legacy 子页）、`ISetting.whiteboardRecording` 字段与 `whiteboardRecording` 设置 tab key（旧持久化 key 回落首分区；旧 localStorage 残留字段无人读、无害）；② macOS `NSCameraUsageDescription` / `NSMicrophoneUsageDescription`（electron-builder.yml + docs/macos-code-signing.md）一并移除，应用内不再有任何摄像头/麦克风访问点，将来新增音视频功能时再加回；③ `MediaUtil` 只删录屏转码专属成员（transcodeVideo 策略体系），`fluent-ffmpeg` 依赖与 FfmpegService 保留（转录、播客音频、markitdown 共用）；④ D-036 的 12 分区信息架构中「创作工具（白板录制）」分组与 WhiteboardRecordingSection 描述随之作废，设置导航回到 11 分区。
- 结构：删主进程 `modules/whiteboard-recording.ts` 及其模块注册、退出钩子、窗口可见性过滤分支、win32 `disable-features=AllowWgcScreenCapturer` 启动开关；删渲染端 `commands/whiteboard-recording.ts`、`useWhiteboardRecording`、`CameraOverlay`、`pages/WhiteboardRecordingControls` 与 `/whiteboard-recording-controls` 路由；`PresentationMode` 解除全部录制引用。

## D-053 完全移除 EPUB 阅读器功能（epub-reader）

- 背景：EPUB 阅读器 = foliate-js 渲染引擎（vendor 成 workspace 包）+ epubs/epub_annotations/epub_bookmarks 三张表（阅读进度/标注/书签，14 个 IPC）+ 双入口（PDF/EPUB 列表页、项目内 EPUB 条目）。链路重、维护成本高，产品裁决退役；「导出为 EPUB」（文章/卡片/编辑器/视频笔记/批量导出）与 markitdown 的 `.epub` 导入转 Markdown 是独立能力，不受影响。
- 裁决（2026-09-25）：① **只移除阅读器**，保留「导出为 EPUB」全链路与 anydoc 的 `.epub` 导入转换；② 存量数据写迁移清理（用户确认）：新增 `tables/epub-hard-cleanup.ts`（仿 slide-hard-cleanup 范式，每次 maintenance 打开幂等执行）——事务内删 `project_item WHERE ref_type='epub'` 行 → 清 operation 三类记录 → DROP 三表；三表已删后仍重跑前两步 DELETE，兜底旧备份恢复等回流数据；③ schema bundle 移除三表 DDL，`MAIN_TABLE_COUNT` 72→69、`REMOVED_TABLES` 追加三表（无索引，索引数不变）；④ 推翻 04 清单原「`EpubReader` 提升到 @/components 供 library 域复用」的规划——该组件随本裁决整体删除，library 域将来只迁 PDF；⑤ 资源同步的 `"epub"` 文件类型分类移除（存量 .epub 文件保留在磁盘、归类降为 attachment，不删文件）；⑥ 移动端 `"epub"` 条目类型（soon 未实现）一并删除；移动端旧库三表孤儿表不清理（无 epub 代码，schema 经 include_str! 自动跟随）。
- 结构：删 `packages/foliate-js/` 整包与 desktop 的 `foliate-js` devDependency；删渲染端 `types/epub.ts`、`types/foliate-js.d.ts`、`commands/epub.ts`、`useEpubsStore`、`components/EpubReader/`、`RemoteEpubSelectModal/`、`SelectEpubModal/`、`pages/PdfView/EpubCard|EpubDetailView`、项目域 `EpubProjectItemView/`+`useAddRefEpub`+`useEpubHandlers`、`TabType.EpubDetail`、MCP epub-detail-provider；主进程 `tables/epub.ts` 换成 `epub-hard-cleanup.ts` 注册；`PdfListView` 收窄为 PDF 专属（类型筛选器移除，「PDF/EPUB」标签改「PDF」）；`bookImport.ts` 的 `importLocalBook(type)` 收窄为 `importLocalPdf()`。消费者调查与完整清单见 04 清单 §epub-reader-retire。

## D-054 完全移除集成终端功能（terminal）

- 背景：集成终端 = node-pty（主进程 pty 会话）+ xterm 渲染 + 可停靠多标签面板（底部/右侧、拖拽调高宽），唯一入口是 SingleMarkdownEditor 独立窗口页（`Ctrl+\`` 快捷键与状态栏按钮，仅有根目录时挂载）。旧 Tab 系统、新 Page 架构均无终端引用，无数据表、无测试。node-pty 原生模块（conpty/winpty）拖着重编译（electron-rebuild）、asarUnpack、打包 prune/verify 三处构建链路，产品裁决退役。
- 裁决（2026-09-26）：① 功能整体移除，无迁移补偿面；② `node-pty` 依赖及 `@xterm/xterm`、`@xterm/addon-fit`、`@xterm/addon-web-links` 一并删除，`rebuild` 脚本收窄为 `-w better-sqlite3`；③ 打包链路同步清理：electron-builder asarUnpack、vite 主进程 externals、prune-packaged-native-modules 的 node-pty 条目、verify-native-runtime 的 node-pty 验证块、postinstall 注释措辞；④ `useTerminalStore` 的 localStorage key `terminal-panel` 残留无人读、无害（与 D-052 同口径，不写清理代码）；⑤ module-layering 守护测试的模块数下限 44→43、terminal 兜底断言移除。
- 结构：删主进程 `modules/terminal.ts` 及其 module-config 注册（terminal 模块，4 个 invoke channel：terminal:create/write/resize/destroy，2 个推送事件 terminal:data/exit）；删渲染端 `components/Terminal/` 整目录、`stores/useTerminalStore.ts`、`commands/terminal.ts`；SingleMarkdownEditor 摘除终端 import、`Ctrl+\`` 快捷键、状态栏按钮与 `<TerminalPanel>` 挂载，`editorAndTerminal`包装 div 连同`.editorAndTerminal`/`.terminalRight`less 类收敛为`mainContent` 直挂。preload 为通用透传桥，无改动。消费者调查与完整清单见 04 清单 §terminal-retire。

## D-055 完全移除检索增强功能（query expander / reranker）

- 背景：检索增强 = Query Expander（Qwen3-0.6B GGUF 查询扩展，产出 lex/vec/hyde 三类扩展查询）+ Reranker（bge-reranker-v2-m3 GGUF 相关性重排），作为 search-core 管线的可选增强步骤挂在四条检索链路（主内容 / vibe-learning / 视频笔记 / PDF）上，模型经 `search-model-*` IPC 下载到 `<userData>/search-models`。模型体积大（三个模型约 1.7GB）、推理开销高，pipeline 对二者本就有 Noop 降级路径，产品裁决退役；Embedding（bge-m3 向量模型，`<userData>/embedding-models`）是独立功能、独立配置键，保留。
- 裁决（2026-09-26）：① 功能整体移除，检索回到 FTS+向量双路召回 + RRF 融合 + 选块摘要 + 结构加权（与原先双开关关闭时行为一致）；② 检索管线同步收缩：`SearchAdapter` 删 `probeStrongSignal`（与 searchFTS 同构，原兼作 original FTS 召回，职责并回 searchFTS）与 searchFTS/searchVec 的 `variant` 参数（多路扩展查询的产物，恒为 original）、`SearchCoreConfig` 删 `blendWeights`/`strongSignal`（仅服务 rerank 混合与扩展跳过）、blend 阶段只剩 RRF 分数 + 结构加分；③ `node-llama-cpp` 依赖与打包链路保留（embedding 推理仍依赖）；④ 下游 `rerankScore` 字段（SearchResult.debug、PDF/视频笔记/vibe-learning 类型与 AI 工具描述）一并删除；⑤ 存量清理（用户明确要求）：`embedding-model-manager` 模块 init（BACKGROUND 层）幂等删除 `<userData>/search-models` 目录；`setting.json` 的 `searchModelProvider` 键与 localStorage 快照残留无人读、随下次 saveSetting 整体写回自然消失（与 D-052/D-054 同口径，不写清理代码）；⑥ 设置页「嵌入与检索」分区收窄为「嵌入模型」，`SettingsTabs` 双 Tab 退化为单页；旧设置页 `SearchModelSection` 一并删除。
- 结构：删主进程 `search-core/expander.ts`、`search-core/reranker.ts`、`utils/search-model-config.ts`、local-inference 的 `RerankRuntime`/`ExpansionRuntime`/`rerankTexts`/`expandQuery` 与注册表 `SEARCH_MODELS`（`LocalModelKind` 收缩为 `"embedding"`）；`embedding-model-manager.ts` 删 8 个 `search-model-*` handler 与 search 系列 service 方法（embedding 部分与共用下载器 `utils/model-download.ts` 保留）；删渲染端 `commands/search-model.ts`、`features/settings` 的检索增强 Tab 与 `SearchModelsSection`、legacy `SearchModelSection.tsx`、`useSettingStore` 的 `searchModelProvider` 类型与默认值。消费者调查与完整清单见 04 清单 §search-enhancement-retire。

## D-056 完全移除功能模块开关（module toggle）

- 背景：功能模块开关 = `ISetting.module`（18 个模块 `{enable, name}`）+ `moduleOrder`，落盘 `setting.json`，两套设置 UI 可切换（新版弹窗「功能模块」分区 + legacy 设置页/设置 Modal「模块功能」tab）；消费方全部在 legacy（侧栏导航过滤、Ctrl+P 命令面板过滤、标题栏快速访问过滤），新版 /shell 侧栏为静态清单不读开关。产品裁决退役：所有模块恒开启，不提供隐藏入口的能力。
- 裁决（2026-09-26）：① 功能整体移除，沿用 D-052 口径——两套设置页的分区/tab、`ISetting.module`/`moduleOrder` 字段、`SettingsTabKey.module`、legacy 三处消费方过滤全部删除（旧持久化 key 回落首分区/首 tab）；② `mergeSettingWithDefaults` 末尾 delete 残留的 module/moduleOrder，防旧 setting.json 被 lodash merge 带入后回写长生不老；③ `setting.json` 与 localStorage 设置快照中的旧字段随下次整体写回自然消失，不写清理代码（D-052/D-054 同口径）；④ D-036 的 11 分区信息架构随之变为 10 分区（「通用」组只剩「外观」）；⑤ 标题栏快速访问菜单的 name 来源从 `module[key].name` 改为 TitlebarWithTabs 内联常量，排序保留频率优先 + 固定顺序兜底。
- 结构：删新版 `sections/ModuleSection.tsx` 与 sections.tsx 分区注册；删 legacy `pages/Settings/ModuleSetting/` 与两处 tab；`useSettingStore` 删 module 类型/默认值、`DEFAULT_MODULE_ORDER`、`sanitizeSettingModules`、`updateModuleOrder` 与缓存迁移分支；SidebarNavItems 菜单项提为模块级静态常量（不再订阅 setting store）；CommandPanel 删 ALL_PAGES 的 module 字段与 enable 过滤；TitlebarWithTabs 删 moduleSetting/moduleOrder selector、内联 `QUICK_ACCESS_MODULE_LABELS`。消费者调查与完整清单见 04 清单 §module-switch-retire。

## D-057 对话块预览定稿（方案 B「预览上正文，对话退到停靠栏」）+ 统一预览框 + 版本

- 背景：新壳层里块预览整体沿用 legacy，未设计过——对话页是纸内 ResizablePanel 分栏 + `BlockPreviewSidebar`（2026-09-26 刚修掉 Popover ref 抖动导致的「一点就崩」），停靠栏推入 `block-preview` 页但参数里塞整段 JSON（冻结快照：生成中不更新、isDark 恒为浅色、无标题行与错误边界），行内 AI / 视频笔记对话点卡片无反应；块 id 用「消息分段序号」，同段同语言两块撞 id；各渲染器自带 antd 工具栏、英文文案；HTML 预览 webview 共用 `persist:html-preview` 分区、浏览器 iframe `allow-scripts allow-same-origin`（生成页可触达应用）。mockup：`mockups/block-preview/`（A 纸内分栏 / B 预览上正文 / C 覆盖大预览 + 统一预览框）。
- 裁决（2026-09-26）：① **B**；② **要版本**；③ Mermaid / 白板保持对话内直出，加「放大」进统一预览框；④ HTML 生成中先看源码流式写入，写完自动切预览；⑤ PlantUML 保持 plantuml.com 外发渲染（本地渲染需 Java/JRE 或自建服务，不划算），界面说明外发、离线给明确错误态；⑥ TikZ / Typst 渲染器保留（`legacy`），旧数据可查看，新对话不再有入口（生成技能已于 af766986b 删除；`markdown` 技能与内容润色提示词里的 tikz/typst 属编辑器文档语法，不动）。
- 选择（容器）：规则只有一条——预览永远占正文，对话永远在右边。块预览是页面栈里的 `block-preview` 页：从对话页点开时对话经 assistMorph 收进停靠栏、预览占满正文纸；从任意页的停靠栏点开同样推入预览页，停靠栏不动；关闭按钮 / 后退回到原页面（从对话页来的对话还原为整页；Esc 不承担后退，沿用 2026-09-20 裁决）。对话页纸内分栏与 `BlockPreviewSidebar` 退役。
- 选择（统一预览框）：头部一行固定骨架（图标 · 标题 / 类型·大小 · 版本 ‹ vN / M › · 预览⇄源码 · 类型专属工具 · 复制 · 全屏 · 更多 · 关闭），画布类缩放浮于右下；渲染器只声明专属工具与更多菜单项，chrome 统一绘制（零 antd）。出错接 ErrorState（保留上次成功渲染 + 查看源码）。
- 选择（版本）：同一会话里同名同类型的块视为同一产物的多个版本，卡片标 vN，预览头部可前后翻；停靠栏里继续追问生成的新版本实时出现在版本切换里。
- 选择（底层）：块身份 = 会话 + 消息 + 第几个围栏；预览只记「打开哪个块」，内容从对话仓库实时派生；所有对话面统一 `openBlockPreview()`；HTML 统一 iframe `srcdoc` + `sandbox="allow-scripts"`、外链交系统浏览器；渲染器改 `defineBlockRenderer` 声明式、文件即注册。
- 结构：`features/previews/` —— `model/fences.ts`（围栏解析，与 react-markdown 同口径）、`model/chatBlocks.ts`（块身份 key =「可见消息 . 内容段 . 段内围栏」、版本分组：同类型同名去 v 后缀，无标题不合并）、`useChatBlocks.ts`（按会话快照 WeakMap 缓存的实时派生）、`openBlock.ts`（会话块参数 chat + key / 其它来源整块 JSON 快照；从对话页打开时形变收进停靠栏，回到对话页收回因此打开的停靠栏）、`components/BlockPreviewFrame.tsx`（统一 chrome）+ `previewActions.ts`（`usePreviewActions` 按来源登记合并工具 / 更多菜单 / 缩放）+ `SourceView` / `ZoomSurface` / `InlineBlockShell`；`views/BlockPreviewView.tsx`（面包屑「会话标题 / 块标题」、切版本为页内状态不进后退历史、块已不在对话里给空态）。渲染器协议见 `types/block-preview.ts`，注册表 `utils/blockRegistry.ts`（glob `renderers/*/index.tsx`）。渲染期（`useChatMarkdownComponents.buildBlock`）与预览页的 key 对齐由 `features/previews/__tests__/keyAlignment.test.ts` 守护。
- 行为变化：Mermaid 由 strict 安全级渲染（`renderMermaidSvg` 新增可选 `securityLevel`，其它调用方默认 loose 不变）；项目学习 / 行内 AI / 视频笔记 / PDF 对话里的块卡片改为推入块预览页（快照），项目学习视图的纸内预览栏随之移除；TikZ 的 `latex-tikz` / `tex-tikz`、Typst 的 `typ` 围栏现在也出卡片（旧数据更易查看）；HTML 预览「在浏览器中打开」未做（系统浏览器打不开应用内 Blob，需另行落临时文件），保留「下载 .html」。

## D-058 MCP 服务器独立成页（方案 B「卡片库 + 抽屉」）+ 逐工具开关 + 服务器日志

- 背景（2026-09-26）：MCP 管理是 legacy `MCPManagerModal`（antd 风格弹窗，只能从对话输入框 ＋ 面板打开），只有服务器级开关、stdio / streamable-http 表单与单个 JSON 导入；连接失败只有一行错误、看不到进程输出；Skill 已独立成页，MCP 与之同属「AI 能力」却藏在弹窗里。参考 Claude Desktop（Connectors）、Cursor（Tools & MCP）、Cherry Studio、VS Code、Windsurf 的做法出 mockup：`mockups/mcp/`（A 列表 + 详情 / B 卡片库 + 抽屉 / C 单列展开）。
- 裁决（2026-09-26）：① **B**；② 侧栏 AI 组新增「MCP 服务器」，与「Skill 管理」**并列**（不合并为「AI 能力」页、不进设置弹窗）；③ 输入框：＋ 面板里的「MCP 服务器」改为**同面板内的二级开关列表 + 「管理 MCP 服务器」跳页**（工具行不加独立按钮）；④ 一期做**逐工具开关**，「执行前确认」放二期；⑤ 添加 = 手动填写 + 粘贴 JSON（不做常用服务器推荐 / 市场：初版的内置常用清单评审后撤掉）；⑥ 密钥一期只做界面遮蔽，转存系统钥匙串放二期；⑦ 做日志。
- 页面：`features/mcp`（definePage key `mcp`）。卡片库分自定义 / 内置两段，卡片开关即时启停；点卡片右侧滑出详情抽屉——自定义服务器分「工具 / 配置 / 日志」，内置只有工具；连接失败在抽屉顶部给原因 + 重试 + 查看日志，内置依赖配置缺失时给「前往设置」。侧栏徽标 `mcp-errors` = 已启用且连接失败的服务器数。
- 数据：`useMCPStore` 新增 `disabledTools`（来源 id → 停用工具名，持久化）与 `serverTools`（连接后的工具清单，仅展示用、不持久化）。停用表独立于 `customServers`，改工具开关不触发任何重连；`ToolRegistry.setDisabledTools` 与来源级开关叠加生效，重新注册后保留。`tools/index.ts` 的自定义服务器同步改为按配置对象引用只重载变化的那一台（此前任何一台变化都会重载全部）。
- 配置格式：`serverConfig.ts` 纯函数层——导入兼容 `mcpServers`（Claude Desktop / Cursor）、`servers`（VS Code）、裸映射与单个服务器对象；SSE 传输不支持，逐条给出原因；导出 / 「以 JSON 编辑」与 `mcpServers` 条目同构；同名导入覆盖。
- 日志：主进程 `MCPLogBuffer` 每台服务器保留最近 200 行（仅本次运行、不落盘）：连接 / 断开 / 重连 / 错误事件、stdio 服务器 stderr（`stderr: "pipe"`）、`tools/list` 与每次 `tools/call` 的耗时；新增 `mcp-get-logs` / `mcp-clear-logs` 与推送事件 `mcp-log`。
- 退役：删除 `components/MCPManagerModal/`、`stores/useMCPManagerModalStore.ts` 与 App 挂载；浏览器插件的 `mcp.manager.open` RPC 改为聚焦主窗口并 `openPage("mcp")`。

## D-059 微信读书页定稿（A 书架 + B 列表排布 + 整页笔记，只读）

- 背景（2026-09-26）：legacy `pages/WeRead` 是只读数据库镜像（11 列表格 + `useWeReadViews` 自定义视图，存 weread-view 表），点行后按需拉取划线 / 想法，用 Slate 渲染在全屏查看器（`WeReadFullScreenViewer`）里。mockup：`mockups/weread/`（A 书架 + 整页笔记 / B 书目表 + 抽屉 / C 分栏速览）。
- 裁决（2026-09-26）：① **A 的书架 + B 的列表**：书架右上角切「封面 / 列表」，列表只能点列头排序，不做保存视图；② 划线**还原微信读书样式**（colorStyle 1–5 红紫蓝绿黄 × style 下划线 / 马克笔 / 波浪线），属数据色；③ 书架分类做成**页面顶部 chips**（不进全局侧栏子项）；④ 保留书架顶部的「在读」续读行（进度 + 读到的章节）；⑤ **笔记只读**：数据经微信读书 skill 网关获取，网关只有读接口（`/shelf/sync`、`/user/notebooks`、`/book/bookmarklist`、`/review/list/mine`、`/book/chapterinfo`、`/book/getprogress`、`/book/info`、`/_list`）；legacy 的改色 / 改样式 / 写想法 / 删除只改了编辑器内存节点（`onChange` 为空、无 IPC），关闭即丢，本就不是真能力。悬停只留「复制」；⑥ 表格视图体系**退役**：`useWeReadViews` 与 weread-view 表（`weread:*-view` / `*-active-view-id` IPC）进删除清单。
- 页面：一级书架，从上到下依次是页头（标题 · 搜索 · 同步）、统计与同步状态一行、分类 chips + 状态筛选 · 排序 · 封面 / 列表切换、「在读」行（最多 3 本）、全部书籍。排布与排序存为本机偏好，分类 / 状态筛选不跨会话保留。二级是书籍笔记页（面包屑「微信读书 / 书名」），一整张纸：目录收在纸面左侧，开关在面包屑最前；正文列宽 720，依次是书头（封面 · 作者出版社 · 进度 · 时长 / 划线 / 想法 / 最近阅读 · 在微信读书中打开 / 重新拉取 / 复制为 Markdown）、书评、吸顶过滤条（全部 / 有想法 / 按颜色）、按章节排的划线与想法。
- 状态：首次使用（未填 Key）在纸内引导填 Key 并直接触发首次同步；Key 失效但有缓存时照常展示缓存，顶部加一条提示；同步中在统计行显示进度。
- 实现：`features/weread`——`model.ts`（Notebook → 书架条目 / 按章节合并划线与想法 / 筛选排序 / Markdown 导出，纯函数有单测）、`queries.ts`（书架与单本笔记走 react-query，按工作区数据库分 key；书架同步是模块级单例任务，同步中切库放弃写入；打开书先显示缓存，已连接时拉最新笔记并回写，网关返回空详情时保留缓存）、`prefs.ts`（排布 / 排序 / 目录开合持久化）。每个工作区在本次运行里进入书架时自动后台同步一次。划线五色映射到主题 tag 数据色（红 tag-5 / 紫 tag-3 / 蓝 tag-2 / 绿 tag-1 / 黄 tag-4），马克笔为同色 20% 底。无封面时按书 id 派生粉彩底 + 书名。
- 增量同步（2026-09-26 追加，用户痛点：每次全量同步约「每本书 2 个请求」，581 本书约 1170 个请求，易触发频率限制甚至封 Key）：官方 skill（Tencent/WeChatReading 1.0.4）没有书架级 synckey，也没有批量进度接口；改为按变化增量——书架与笔记本概览整份拉（约 7 个请求），只对新书和最近阅读 / 最近笔记时间变化的书逐本补拉，指纹存 `synckeys.progress`；补拉失败不记指纹、下次重试（原每分钟补偿队列移除）；同步按钮旁的菜单保留「全量重新同步」。已不在书架与笔记本里的书从缓存删除（旧实现只增不删）。
- 布局校正（同日）：书架整页放进一张 surface 大纸（页头、分类行固定在纸顶，书目在纸内滚动），「在读」卡与列表不再各自成卡；分类 chips 行 `w-0 flex-1` 自身横向滚动 + 右缘渐隐，修复分类多时撑宽页面导致右侧截断。
- 退役：`pages/WeRead` 及表格视图体系按 04 清单 §weread 登记，锚点 P-weread（Electron 内走查通过后删除）；`services/weread/sync-manager.ts` 零消费者已删。

## D-060 Skill 管理页定稿（方案 B「卡片库 + 抽屉 + 整页编辑」）+ 调用方式 + `$` 点名 + 关联目录 + 脚本执行与通用工具权限模式

- 背景（2026-09-26）：legacy `pages/SkillManagement`（895 行，antd + react-icons）是整个 skills 目录的一棵文件树 + 编辑器；内置 4 个 Skill 不在树里；没有逐 Skill 开关，所有 Skill 描述无差别注入系统提示词；frontmatter 只解析 `description`，名字取文件夹名；`scripts/` 只能被读、不能执行。参考 Claude.ai（Capabilities → Skills）、Claude Code、Cursor、Codex、VS Code Copilot（2025 年底 Agent Skills 成为开放标准，五家共用 `SKILL.md` 格式）出 mockup：`mockups/skills/`（A 列表 + 工作区 / B 卡片库 + 编辑页 / C 设置式单列）。
- 裁决（2026-09-26）：① **B**，与 MCP 页（D-058）同构；编辑页左侧文件树**不用深色底**，透明沿用纸面；**不做「试一试」**；② **开关 + 调用方式**：每个 Skill 三态「自动 / 仅手动 / 停用」——自动 = 描述进系统提示词、AI 自行决定加载（现有行为）；仅手动 = AI 看不到、不占提示词，只在用户点名时加载；停用 = 完全不可用；③ 手动点名**只用 `$` 触发**（`/` 已被编辑器 slash command 占用），＋ 面板不加 Skill；④ 添加方式本期全做：新建（空白 / 模板）、用 AI 创建、导入 .zip / 文件夹 / GitHub 链接、关联目录；⑤ **关联外部目录**本期做：预置 `~/.claude/skills`、`~/.codex/skills`、`~/.agents/skills` 开关 + 自定义目录，只读挂载，想改就「复制为我的」；⑥ 内置 Skill **允许停用**（仍只读，可复制为我的再改）；⑦ SKILL.md 编辑用**双视图**：「编辑」= frontmatter 表单（名称 / 标识 / 描述，带字数与触发场景提示）+ 富文本正文，「源码」= 整份 md；⑧ 做**使用记录**（加载次数、自动 / 点名来源、最近对话），不做试一试；⑨ `scripts/` **支持执行**，并借此落地**通用工具权限模式**（见下）。
- 调用方式落地：偏好（停用 / 仅手动）只存本机、不改原文件（内置与关联目录只读也能设）；新建 / 编辑「我的」Skill 时，仅手动写回 frontmatter `disable-model-invocation: true`（Claude Code 同名字段，读取外部 Skill 时同样识别为仅手动的默认值）。发送前按「启用且自动 ∪ 本条消息 `$` 点名」过滤后交给 agent；点名的 Skill 直接把 SKILL.md 全文注入本轮提示词，并在回复里标「已加载 Skill」。
- 通用工具权限模式（用户要求：不仅限于 Skill，内容编辑、将来的 SQL 写入 / 文件操作 / bash 共用）：工具声明风险级别 `read | write | execute`；全局模式三档——**手动确认**（write / execute 每次问）、**自动允许编辑**（write 直接执行、execute 仍问）、**跳过确认 Bypass**（都不问）。需要确认时对话里的工具行原地展开确认条（工具名 · 参数摘要 · 允许 / 拒绝 / 本会话始终允许），拒绝则把「用户拒绝执行」作为工具结果回给模型。agent 包新增 `policies.authorizeToolCall` 钩子与 `awaiting-approval` 执行状态，决策逻辑在桌面端。模式在设置「AI」分区与输入框工具行可切。首批接入：`run_skill_script`（execute）与内容编辑工具（write）。
- 脚本执行：新工具 `run_skill_script`（Skill 名 + 脚本相对路径 + 参数）；主进程按扩展名选解释器（`.py` → python3、`.js/.mjs/.cjs` → 内置 Node、`.sh` → bash，其它要求可执行位），工作目录为该 Skill 目录，超时 120s、输出截断，路径必须落在该 Skill 目录内（关联目录的 Skill 同样可执行，同样受权限模式约束）。内置 Skill 无脚本。
- 页面：`features/skills`（definePage key `skills`，替换 legacy 占位）。卡片库分「我的 / 内置 / 关联目录」，顶部筛选（全部 / 已启用 / 仅手动 / 需要处理）+ 常驻上下文预算（自动 Skill 描述合计 tokens，描述缺失 / 过长标黄）；卡片开关即时生效。点卡片右侧抽屉：概览（AI 看到的描述 + SKILL.md 渲染 + 元信息）/ 设置（调用方式三选一、导出、删除）/ 使用记录；「编辑」推入整页编辑器（`skill-edit` 页，面包屑「Skill / 名称」）：左文件树（新建 / 重命名 / 删除）+ 右编辑区双视图。
- 数据：主进程 `skill` 模块改为多根：`userData/.skills`（可写）+ 关联目录（只读），所有路径校验改为 resolve 后按根目录前缀判定（修掉原 `startsWith` 可被同前缀目录绕过的问题）；列表返回来源、frontmatter（name / description / disable-model-invocation / allowed-tools）与文件数；新增导入（zip / 文件夹 / GitHub 目录）、关联目录配置、执行脚本 IPC。渲染端 `useSkillStore` 增加本机偏好（停用 / 调用方式）与使用记录。
- 评审追记（2026-09-26）：列表页与编辑页都改为「一整张纸」（同微信读书），纸内卡片细描边不叠阴影；编辑页文件树是纸内透明左栏、开关在面包屑，SKILL.md 头部改为文档式（大标题 + 「AI 看到的描述」描边块，不用米灰填充）；编辑页原「默认仅手动」开关与卡片开关语义冲突，改为与卡片 / 抽屉同一份状态的「自动 / 仅手动 / 停用」分段（front-matter 的 `disable-model-invocation` 只在源码视图改）；源码视图用 CodeMirror 5 语法高亮（配色取主题 token），代码框撑满剩余高度、框内 FadeScroll 滚动。
- 退役：`pages/SkillManagement`（index / CreateSkillModal / SkillDetailModal）、`TabType.SkillManagement` 的 TabContent 分支、`LEGACY_PAGES.skills` 占位。

- pi 迁移追记（2026-09-27，M3-a）：上述权限语义保留，旧 agent policies 与渲染端审批 resolver 退役。统一在主进程包装 pi 原生 `beforeToolCall`，先执行 pi 扩展钩子，再按最终参数审批；原生 signal 用于中止挂起。待审批请求与会话授权归 pi 宿主，渲染端只消费带版本快照，切页不清理、重载可收养；恢复续流监听就绪后才开放审批按钮。内置文件写入、shell、Skill 脚本与外部 MCP 接入同一入口，外部 MCP 默认按 execute 审批；交互场景已有内容审阅卡免除重复审批，无交互界面的入口需要确认时直接拒绝。授权按 pi 会话实例 + 工具名记忆，仅当前进程有效，真正重建会话时重置；渲染层重载不重建同模型宿主。主进程重启后的完整 JSONL 恢复留 M4。

## D-061 日程页当日时间线改为非模态抽屉

- 背景：日程页第一版（方案 C 月刊）为对开两栏，右栏 360px 当日时间线全高贴纸右缘、宽度动画收起。用户在番茄 / 待办 / 闪卡相继把常驻右栏改为 Drawer 后，要求日程页同样处理。
- 选择：① 主视图（月 / 周 / 议程）占满宽度；`DayColumn` 移进非模态 `Drawer`（fill，width 360，初版盖在主视图区右侧不盖页头，见下方追记改为整纸高）；× 浮在抽屉右上角，`DayColumn` 头部右侧 pr-12 让位；Esc 经 `useOverlayDismiss`。② 开合仍走 `useCalendarStore.showDayPanel`（持久化，记住上次开合），默认值改为 false：抽屉盖住月视图右侧几列，首次进入不默认遮挡。
- **追记（同日）**：① 开关由孤立图标改为带信息的按钮「今天 · 2 项」/「9/28 周一 · 无安排」（选中日 + 项数，打开时 soft 态；`useDayEvents` 与时间线共用）；② 抽屉改为与整张纸同高（挂在纸上，默认上右下 12px 内缩），会盖住页头右侧的视图切换与「新建日程」——关闭走 × / Esc。
- **追记（同日，日程详情改抽屉）**：点日程由锚定速览 Popover（`EventPeek`，只读 + 「编辑」再进弹窗）改为纸内右侧整高的非模态 `EventDrawer`：头部 = 色块 · 标题 · 日期时间 · 日历，正文即可编辑表单，底栏删除 / 关闭 / 保存（保存后关闭 + Toast）。与时间线抽屉同位，打开时暂代它、关掉回到时间线。表单逻辑从 EventDialog 抽成 `EventDialog/useEventForm.tsx` 共用；`EventDialog` 只留新建（月 / 周视图双击空白、空档安排、页头新建）；月视图「+N 项」列表点日程同样进抽屉。`peekStore.peek(event)` 不再带锚点。
- **追记（同日，未保存修改守卫）**：`useEventForm` 载入完成后记基线快照（备注按纯文本比较，避开编辑器规范化改 JSON 的误报），返回 `dirty`；保存 / 删除成功即以当前值为新基线。`EventDrawer` 所有关闭 / 换条请求（×、关闭、Esc、点别的日程）都经 `peekStore`，抽屉只在表单干净时跟随；dirty 时弹 ConfirmDialog「放弃未保存的修改？」（继续编辑 = 把 store 拨回当前这条 / 放弃修改）。底栏 dirty 时左侧显示「有未保存的修改」并隐藏删除按钮。新建弹窗 EventDialog 未接守卫。放弃修改时调 `form.reset()` 按原日程重新载入——关闭后抽屉保留同一条做退场动画，表单不会自动重载，不重置会残留 dirty（再点任意日程仍被拦）且重开同一条会带着改过的值。
- 实现：`features/schedule/views/ScheduleView.tsx`、`components/DayColumn.tsx`（去掉左细线与定宽）、`components/CalendarHeader`（注释）、`stores/useCalendarStore.ts`（默认值）。

## D-062 Vibe Learning 项目页定稿（方案 C「学习台」）

（2026-09-26，已定；样板间 `mockups/vibe-learning/`，A 纸内三栏 / B 对话为主 / C 学习台三选一，用户选 C）

- 结构：一整张纸，纸内三栏——左 = 目录（「资料」+「产物」两组，可拖宽，开关复用项目详情面包屑的侧栏按钮 `useProjectTreeStore`），中 = 阅读区，右 = 对话。什么都没打开时对话占满中间；打开资料或笔记后对话退到右栏（可拖宽 320–600、可在阅读区头部收起）。对话面板始终挂在同一位置，切换布局不打断进行中的回答。上次打开的条目按项目记住（localStorage）。进入 Vibe Learning 项目同文档树项目一样收起全局侧栏。
- 目录：行式（图标 + 名称 + 尾部状态，悬停在固定槽位淡入「更多」，右键同一份菜单），无分隔线。资料组保留拖拽排序、处理状态（处理中 accent + 进度 / 失败 danger / 需重建等 warn，完成不标）、重新处理 / 索引、重命名、删除，文档类多「用默认程序打开」。产物组把原「创作内容」与「测验集」合成一列按更新时间排序；＋ 菜单 = 新建笔记 + 8 个生成应用（原应用 8 格去掉）；测验集点行即开始测验，记录 / 编辑 / 删除在菜单里；PPT / 报告的「AI 编辑」在行菜单与阅读区头部。
- 阅读区：统一头部（图标 + 标题 + 元信息 + 动作 + 对话开关 + 关闭）。音视频为居中阅读列 + 字幕跟读（时间 | 文字两列，当前句 selected 底）；网页、图片直接铺开；来自笔记的资料就地编辑；**文档类新增页内文本阅读**——分段读取转换后的 Markdown（`vl-read-resource-range`，每段在空行处切开、触底续读），原件仍可用默认程序打开；尚未转换出文本的文档点开仍直接交给系统程序。笔记编辑器（原右栏 NoteEditorView）移进阅读区，标题就地改、更多菜单换 `@tau/ui` Menu。有文本的资料底部一行「基于这份资料」（大纲 / 重点 / 导图 / 测验 + 更多），生成弹窗只预选当前这份（`setVLGenerationScope`）。
- 代码：`VibeLearningView/` 重组为 `tree/`（目录）、`stage/`（阅读区）、`generate/`（原 AppSidebar，只剩生成与 AI 编辑弹窗，8 个开关合成一个 active 状态）、`appMeta.ts`、`resourceKinds.ts`；删除 `ResourcePanel`、`AppSidebar/index`+`AppListView`、`ResourcePreview/index`，以及死代码 `QuizApp` / `OutlineApp` / `EmptyState` / `SimpleButton`。测验记录弹窗改 `@tau/ui` Dialog。页面主路径的 antd 残留清掉：`useVLResourceSelection`、`usePodcastGeneration`、`InsertNoteToTreeModal` 的 `App.useApp` / `message` 改 `toast`，资源行的 react-icons 拖拽柄去掉（整行可拖）。
- 未做（下一轮单独出）：生成配置弹窗、添加资料弹窗、测验答题 / 编辑弹窗仍是 legacy `CustomModal` 皮；「在对话中引用」当前资料暂不做（输入框没有外部注入引用的接口）。
- **追记（2026-09-26，生成改后台任务 + 弹窗换新组件）**：用户要求「配置好就关弹窗，侧栏出条目并标识正在输出，点进去看模型的执行过程（分析、调了什么工具、工具渲染、开始输出、输出的流式中间态），要让人感觉模型在持续输出（字数 / token 在涨），文档类直接看流式正文」「任务在后台跑，离开页面也不停」。裁决：**完成即落库**（去掉导图 / 测验 / PPT / 报告原来的「预览 → 保存为笔记」步骤；测验题全部保存，不要的在「编辑题目」里删）；**执行过程本次运行内可看**（不落库，重启后只剩产物）；**PPT / 报告的 AI 编辑一起改**。
  - 执行器 `tasks/runner.ts`（模块级，不随组件卸载）：点「开始」先建产物占位（笔记类建空 content + VLNote，测验建空测验集，AI 编辑直接以原笔记为目标），再在后台跑；逐轮记录推理 / 工具调用 / 正文到 `useVLTaskStore`（80ms 节流），结束按类型落库（大纲 / 重点 / 文章生成中每 3 秒存一次正文；PPT / 报告清洗 HTML 并取 `<title>` 更新标题；测验整批建题；播客脚本 → 逐句 TTS → 合并 → 上传 → 建播客记录后补 `podcastId`）。停止 / 失败时文档类与导图保留已写部分，可「重新生成」写回同一产物。播客原预览页的「单段重新合成」随预览步骤取消。
  - 资料检索工具不再挂全局注册表（同名先到先得：对话面板先注册时任务用的是它那份，离开页面就丢；两个项目并发会查错项目）：改为每个任务经 `additionalTools` + `executeToolCall` 带自己绑定项目的 `vibe_learning_query`，`useChatLLM` 的工具源让按次传入的工具覆盖全局同名工具；编排器 `runGenerationTask` 改走 `chatStreamCore` 并关掉 rAF 缓冲（窗口在后台不被节流），补透传推理 / 用量回调与按次工具（可选参数，其他调用方不变）。
  - 执行过程页 `stage/TaskStage.tsx`：头部停止 / 重新生成 / 查看产物（测验为「开始测验」）；正文按轮次渲染——推理、工具沿用对话的 `ReasoningBlock` / `ToolCallBlock` 淡墨折叠行（需要确认的工具同样出确认条），过渡性正文淡墨小字；产物中间态按类型：文档直接渲染 Markdown、导图实时出图、测验增量解析逐题出现（`parsePartialQuizPrompts` 扫描已闭合的 JSON 对象）、PPT / 报告显示源码尾部与行数、播客先出脚本再显示合成进度条；底部常驻计数条「阶段 · 已写 N 字 · N tokens · 用时」，运行中呼吸点。运行中贴底跟随（用户上翻则不跟）。
  - 目录：进行中的条目转圈 + 「生成中 / 改写中」，失败 danger、停止 ink-3；笔记任务进行中点开即执行过程，结束自动切到产物，产物头部「生成过程」可回看；测验集生成中点行看过程，完成后点行照旧开始测验。
  - 弹窗：10 个旧生成 / AI 编辑弹窗合成一张 `generate/GenerateDialog.tsx`（`@tau/ui` Dialog）：公共「资料」勾选清单 + 「额外要求」，文章多风格卡片、PPT / 报告多模板缩略图、测验多可选名称、播客多名称 / 说话人（沿用 `SpeakerConfig` / `VoiceClonePanel`）/ 时长，AI 编辑为「修改要求」+ 可选参考资料；底部影响行给出还缺什么或「开始后在后台生成」。添加资料弹窗换 `@tau/ui` Dialog + Segmented（文件 / 网页 / 视频 / 笔记），输入与下拉换 Input / Select，粉色 / 红色硬编码换语义色；笔记页签改用公共 `EntityPicker`（卡片 / 文章 / 项目文档 / 日记多选，已加入的置灰），删除 `NoteSelector`。
  - 删除：`generate/apps/*GenerateModal`、`PPTEditModal`、`ReportEditModal`、`generate/components/*`、`hooks/useQuizGeneration`、`hooks/useVLTools`、`stores/useOutlineGenerationStore`。测验答题 / 编辑弹窗（`QuizTestModal` / `QuizEditModal`）仍是 legacy 皮，下一轮。

## D-063 卡片 / 文章 / 项目文档编辑窗口合一 + 主进程窗口模块重写

（2026-09-26，已定；样板间 `mockups/editor-window/`，外壳 A 纸面托盘 / B 满铺纸面二选一，用户选 A）

- 选择：三个独立编辑窗口（`SingleCardEditor` / `SingleArticleEditor` / `SingleProjectItemEditor`）合成一个路由 `/editor-window?kind=&db=&id=`，窗口可多开，同一文档只开一个（再次打开聚焦）。外壳与主窗口同一语言：46px 自绘标题栏（mac 信号灯 / Win 三键）、page 底上的纸面（圆角 + card 阴影）、FadeScroll、`@tau/ui` 组件。类型差异收在 `features/editor-window/documentDrivers.ts`：卡片无标题（标题栏取首行摘要）、项目文档无标签且注入项目卡片列表扩展。
- 功能：主题切换（全窗口经 storage 事件同步，主窗口 / 番茄辅助窗同一 `useThemeRuntime`）、字数 / 阅读时长 / 选中字数、大纲（按类型记忆开关，窗宽 < 900 改为标题栏 Popover）、标签、窗口置顶、专注模式（⌘.）、打字机滚动、查找（复用全局查找条）、复制 / 导出 Markdown、在主窗口打开（BroadcastChannel 请求主窗口 `openContent`）、文档被删时的空态（窗口重新聚焦时回查）。
- **不做 Markdown 源码模式**：Markdown 往返对白板、数据库、分栏等块有损，编辑窗口会失去这些块的编辑能力；源码模式只留在 Markdown 文件窗口（文件本身就是 Markdown，无此类块）。
- 协作：沿用 `ContentCollaborationControl`（标题栏成员条 + ⋯「发起协作 / 协作成员」），状态栏共享时显示协作连接态，frozen 期间横幅 + 只读。标题绑定会话文档的 title（`CollaborativeTitleField`），本地与共享模式一致。加入他人共享（本机无实体）的文档不进编辑窗口。
- 数据库：按 URL 的库名连接（协作页「回到原内容」会开其它数据库的文档）；**不再在卸载时 `closeDatabase`**——连接全局共享，旧页面关库会连带主窗口失去连接。
- 主进程：删除 `modules/window-manager.ts`，改为 `main/windows/`：`createWindow`（唯一的 BrowserWindow 构造入口：标题栏形态 custom / native / none、事件转发、加载、Win 最后可见窗口关闭即退出）、`window-registry`（键控窗口表）、`window-state`（按类型记忆尺寸位置 + 级联错开）、按窗口类型各一个模块、`ipc.ts` 统一注册。新 IPC `open-editor-window` / `close-editor-window`（`@tau/platform` `WindowApi.openEditorWindow` / `closeEditorWindow`）替代三条 `open-*-in-new-window` 与 `close-article-window`；ws 端保留三条旧方法名供 CLI 调用（此前文章 / 项目文档两条在 ws 端未注册）。模块初始化窗口类型 card / article / project-item 合并为 `editor`。

## D-064 浏览器插件聊天并入桌面数据域：统一消息模型

- 背景（2026-09-26）：插件与桌面端的聊天在 UI 组件层已共享（`@tau/shared` 的 ChatContainerCore / ChatInputArea / ChatMessageView），但消息模型各自定义且已分叉（桌面 `src/types/llm.ts` 的 AssistantBlock 体系 vs shared `ChatComponents/types.ts` 的 contentBlocks；`ToolCallPayload` / `ToolCallExecutionState` 两处定义、可选性不一致），会话类型同名不同义（桌面 `ChatMessage` = 会话记录，shared `ChatMessage` = 单条消息）。插件 AI 问答本就依赖桌面在线（`ai.chat` 走 WS 到桌面渲染进程），产品裁决深度统一：插件成为桌面的远程聊天终端，聊天记录两端互通。
- 裁决（2026-09-26）：① 消息 / 会话 / 流式块类型单一来源 = `packages/shared/src/chat-core/messages.ts`，桌面 `src/types/llm.ts`、`src/types/chat-message.ts`、`src/types/tool.ts`、`src/constants/llm.ts`（Role enum）仅 re-export，两端禁止再各自定义；② 插件不做离线历史缓存（chrome.storage 会话最终迁入桌面 sqlite，迁移先导入验证、稳定后再清理本地）；③ 类型冲突取值：`ToolCallPayload` 收敛为宽松版（`type?` / `arguments?`），`ToolCallExecutionState` 收敛为严格版（`timestamp` 必填）；④ 桌面会话类型在 shared 定名 `ChatSessionRecord`，桌面以 `ChatMessage` 别名 re-export 保持存量零改动；⑤ 插件旧模型 `ChatMessageType`（含 `ChatMessage` 别名导出）保留为迁移期兼容，随插件侧切换完成后清理。
- 结构（五阶段，每阶段独立可交付）：阶段 1 消息模型统一（本条）；阶段 2 流式状态机收敛（`assistantMessageBlocks` + 流聚逻辑抽入 `chat-core`，接线既有 `ChatRuntimeAdapter`，桌面 ChatContainer 与插件 useAiChat 共用）；阶段 3 插件会话存储接入桌面（aiServer 扩展 chat 命令面，`chat_message` 表加 `source` 列，chrome.storage 一次性迁移）；阶段 4 会话管理 UI 统一（headless hooks + `@tau/ui` 版简化管理面板）；阶段 5 行内问答换型、删除插件自研状态机与存储层。

### D-064 实施记录（2026-09-26）

- 阶段 1–3 已落地：① 消息模型单一来源 `packages/shared/src/chat-core/`（messages / messageSchema / assistantBlocks / streamEvents，归约器测试 `streamEvents.test.ts` 守护），桌面 `types/llm.ts`、`types/chat-message.ts`、`types/tool.ts`、`constants/llm.ts`、`services/chatMessageSchema.ts`、`services/assistantMessageBlocks.ts` 全部 re-export（后三者走 `@tau/shared/src/chat-core/*` 子路径——主进程 bundle 会包含它们，禁止引 `@tau/shared` 主入口把 React UI 包拖进主进程）；② `aiServer` 流通知升级为快照语义（全量文本 + turnId + 新增 `ai.stream.turn-finish`），插件 `useAiChat` 手写拼块删除、经 `applyChatStreamEvent` 归约，`useInlineAiChat` / `OverviewTab` 同步快照化；③ 插件会话存储接入桌面 sqlite：`chat_message` 表加 `source` 列（'desktop' | 'browser'），aiServer 新增 `chat.list/get/create/update/delete/branch + chat.groups.list + chat.group.ensure` 命令面（渲染端直调既有 IPC，主进程零新增模块），插件侧新增 `services/chatStoreClient.ts`（模块级 RPC 服务 + URL→ChatGroup 映射）、`services/chatModelBridge.ts`（渲染/存储模型双向桥，assistant 旧 contentBlocks 走 legacy `content_blocks` 字段经 migrate 升级）、`services/chatMigration.ts`（chrome.storage 旧会话按 URL 分组断点续传导入，不清原始数据，`tau-chat-store-changed` 事件通知刷新），`useChatSessions` 重写为 RPC 后端（对外接口不变，会话 id 转 number），`ChatSession.systemPromptSnapshot` 持久化形态变为会话 messages 首条 system 消息。
- 阶段 4 缩减裁决：插件会话管理 UI 维持现有 `ChatDropdownSelector`（已接统一数据层，功能完整：列表/分支树/重命名/删除/新建），**@tau/ui 视觉统一不纳入本次交付**——插件侧是 antd + Tailwind 混合生态，引入 @tau/ui 需 tokens.css 注入与前缀隔离，属独立视觉改造，避免与数据统一混在一个变更里放大回归面。
- 评审修正（2026-09-26，review 后落地）：① `update-chat-message` 改部分更新语义（`Partial<Omit<ChatMessage,"updateTime">>`，未提供字段保留库中现值，动态 SET 只含显式列），插件 `chat.update` 只提交增量（消息保存只传 `{id, messages}`、改名只传 `{id, title, titleDirty}`），消除全量覆盖清空 title/group/分支关系的问题与改名-落库竞态；② `chat.create` 透传 `groupId`、`chat.branch` 继承父会话分组（原先被丢弃导致插件会话无法归组、列表失联并反复新建空会话）；③ 新增 `get-chat-message-list` 轻量列表命令（不含 messages 大字段、SQL 侧按 group_id 过滤），`chat.list` 不再全表拉取；④ 插件 `useChatSessions` 待落盘快照绑定触发时的会话 id（debounce 到点或切换/卸载前 flush），防止消息写入切换后的会话；⑤ `chatMigration` 断点粒度细化到 session（`sessionIdMap` 持久化 legacy→桌面 id 映射，重跑不重复建行），`sortParentsFirst` 加环检测；⑥ `source` 列同步进 db-schema bundle（`schema/main/20_content.sql`）。
- 后续优化项（不阻塞）：插件请求历史构建仍走显示模型（`mapChatMessageToAiRequestMessage`），多轮工具循环的历史回放语义有损（插件旧实现固有），待插件消息链路整体切到存储模型后统一改 `buildAssistantHistoryMessages`；chrome.storage 旧数据清理动作待迁移稳定一个版本后单独执行；WebSocketClient/Server 双副本合并入 @tau/rpc 待议（插件侧 WS 地址常量已收敛到 `utils/aiServerAddress.ts`）。
- **被 D-065 取代的部分**（2026-09-29）：阶段 3 的「插件会话存桌面 sqlite」与 `chat.create/update/branch/groups.*` 命令面、`chat_message.source` 列、`chatMigration`、`ai.chat` + `ai.stream.*` 协议均已退役——插件对话改存按页面分目录的 pi 会话文件，协议换成 v2。阶段 1 的消息模型单一来源仍有效。

## D-065 AI 运行时换成 pi agent，会话事实源改 pi JSONL（pi 迁移收尾）

（2026-09-29，已定；执行记录与踩坑清单见 `../pi-migration-handoff.md`，本条只记最终形态与裁决）

- 选择：自研 agent 运行时（协议适配 + SSE 传输 + Agent 循环 + chat-core 展示层，约 1 万行）整体替换为 pi agent（`@earendil-works/pi-coding-agent` 0.87.x）。Big-bang、无兼容层，以 pi 为准：设置模型对齐 pi（v2 服务商/模型，旧设置一次性转化）、思考档位全仓一套 `ThinkingLevel`（shared）、内置工具 read/bash/edit/write 默认启用、工具审批沿用 D-060 三档并映射到 pi 的 `beforeToolCall`、提问（ask-question）为宿主原生工具。
- 运行位置：会话宿主在主进程（`pi-session-host`），渲染端只做投影与发送编排；跨轮次、跨页面的运行态放模块级 `piChatRuntime`（组件卸载不打断归约与落盘）。单发生成走 `pi-ai:single-shot`。
- **会话事实源 = pi JSONL**：`~/.editor/sessions/<库名>/*.jsonl`；sqlite 只留目录表 `chat_session`（id = pi 会话 id，scope + domainRef 分五个场景，只存标题/分组/置顶/归档/消息数）。桌面展示形态存 `desktop-display` custom entry，叶子挪动写 `desktop-leaf` 标记。**分支 = 同一文件内的会话树**（编辑重发、重新生成、从这里分叉都是树上的分叉，消息上 `‹ i/n ›` 切版本，树谱浮层），不再是多文件多目录行。
- 2026-09-28 重试语义补充：末尾问题没有正文或工具调用时，操作为「重试」，保留原用户消息并在当前路径续跑，不创建版本；已有结果或后续追问时仍「重新生成」并保留旧分支。思考中断但未产出结果允许重试，已有工具调用按已有结果处理，避免把执行记录当空失败丢弃。首轮提交前失败也允许原位重试。
- 同步：数据库与会话 ZIP 仍整包传输，每次上传使用不可变对象名，最后发布带 `databaseObject/sessionsObject` 的版本指针。同步信封版本为 2，数据库内部模型版本保持 1；旧端会在下载前拒绝新快照，使用前需更新全部同步客户端。移动端读取新对象名，上传时保留会话包引用；CLI 已支持配对快照的 push/pull/status，并与桌面共享 `@tau/db-schema/sync` 的打包、校验、安装与恢复协议。此变更修复成对提交，不引入增量同步。
- 浏览器扩展：侧栏对话由主进程 `browser-bridge` 驱动（`/aiServerMain`，渲染层重载不打断，重开侧栏接回在跑的回答），走 AI 运行协议 v2（`packages/shared/src/chat-core/aiRunProtocol.ts`：`ai.run.start/event/abort/state/approve/answer`，settled 唯一终态）；提问与审批走桌面宿主；对话存 `~/.editor/browser-sessions/<页面键>/`，不进目录表、不同步。
- 老数据：开库时一次性迁移（老对话 → 会话文件，分支并进父对话的会话树，思考内容不迁），两次迁移都记账后备份整库并删除旧聊天表（`chat_message`/`pdf_chats`/`video_note_chats`/`vibe_learning_chats`/`audio_note_chats`，后者无界面、未迁移、直接丢弃）与 `chat_run`。迁移器长期保留（老库与旧远程下载的 `.db` 靠它升级）；移动端不读聊天，不做迁移。
- 已删：`packages/agent` 整包、`modules/llm.ts`（Minimax Key 测试改走 `pi-ai:verify-key`）、`modules/stream-fetch.ts`、渲染端 `useChatLLM`/`chatStreamCore`/协议适配器、chat_run 表与 handler、五个旧聊天表模块、扩展本地提问机制（`askQuestionSessionStore`）。
- 不做 / 已知边界：WSL 作为命令执行环境（用户裁决不做）；同一对话的多个分支同时运行；分支命名；重启后等待中的审批与提问标为已中断，不重新弹出；待发送队列与未送达插话不跨重启保留；首轮在第一条回答之前就失败的对话 pi 不落盘。

### 审查修正：身份、写入与恢复边界

- 桌面运行身份包含库名、场景和会话 ID，异步回写使用创建时捕获的库名；切库保留后台运行，同库重新连接清除旧投影。删除与替换使迟到投影、标题作废。
- 宿主创建先取得会话租约；准备图片、prompt、steer 均计入忙态，释放先取消并等待在途操作。改历史、同步替换不得与创建交错；已有文件依赖 pi 追加写，不再整文件覆盖。恢复尚未落盘的目录行时保持原文件名。
- 老行身份保存在 `migration_meta`，中断重试复用原会话；迁移、树合并、退役独立判定，不因上一阶段已完成而跳过后续阶段。
- 下载先验证配对快照，替换前写回滚日志，开库恢复未提交的数据库和会话目录。同步期间锁定库的会话目录；仍有回答运行时拒绝同步，保留回答。
- 未声明风险的工具按 execute 审批；只读工具显式声明 read，日历和学习产物写入声明 write。页面工具由会话持有执行快照，避免卸载后失效。
- 图片生成与图片编辑由用户主动发起，两者按 read 放行，不增加工具审批；生成结果落文件不改变这一交互约定。
- CLI 同步持有跨进程文件锁；桌面运行时，经 `cli-sync:begin/version/finish` 请求静默会话、关闭主库和索引、更新版本并重连。运行中回答会阻止同步；CLI 退出后由文件锁状态触发恢复，异常中断保留回滚日志。离线 CLI 不启动代理运行时；旧聊天表保留到桌面维护开库迁移。
- 目录外模型的容量不再猜测；缺少上下文窗口或最大输出时要求用户补齐后使用。非 Windows 使用系统 shell，PowerShell 兜底只用于 Windows。

### 独立复审后的修正：执行快照与同步提交

- 工具定义与执行器在第一次异步创建前同时捕获，整个会话使用同一执行快照；收养只能恢复定义一致的工具。工具上下文必须携带数据库身份和取消信号，普通业务命令不能重新取当前窗口库。正文编辑提案及检查点保存库名，切库后不更新其他库的活动编辑器。取消经工具桥传到渲染端及 MCP SDK；错误必须进入 pi 的失败终态。
- 旧设置的协议是模型属性，混合协议模型及其有效功能分配全部保留。只有删除差异的旧分支无法无损合并时保留独立对话，不按空合并删除。
- 同步信封升级为 3（数据库内部版本仍为 1）。整包与不可变数据对象不变；发布通过原子创建唯一后继记录仲裁，`database_<库名>.json.next-<父版本>` 含 `parentVersion/commitId` 和完整配对引用。版本指针降为加速提示，读端必须追随后继记录；已提交但响应丢失时按提交身份核验，禁止直接覆盖重试。后继记录不得按普通过期对象清理。
- 后端必须支持原子创建：S3/WebDAV `If-None-Match: *`、GitHub 不带 SHA 的创建、OSS `x-oss-forbid-overwrite`。OSS 启用或挂起版本控制时不提供该保证，拒绝发布；不得用 GET 后普通 PUT 模拟原子条件。依据：[OSS PutObject](https://www.alibabacloud.com/help/en/oss/developer-reference/putobject)。全部客户端需升级；移动端上传保留自己下载基底的会话包关联。
- ZIP 新增摘要清单，并校验目录身份及树结构；旧包只保证结构校验。库锁延伸到维护重连之后，心跳放到独立线程，避免同步压缩或迁移阻塞主线程后被误接管。失锁后拒绝继续使用旧租约。checkpoint 失败不得关闭后复制裸数据库或删除 WAL。
- 扩展只持久化规范页面下的选中会话 ID，以便首轮未落盘时接回；待发送内容仍不持久化。异步列表、选择和改历史结果只有在页面、会话、请求代次仍匹配时才能写回。

## D-066 Markdown 文件窗口重设计（对标 Typora）

（2026-09-26，已定；样板间 `mockups/markdown-window/`）

- 定位：编辑磁盘上的 Markdown 文件 / 文件夹，与 D-063 的数据库文档编辑窗口分开；外壳同一语言（`AuxWindowTitlebar` 自绘标题栏，Win 也自绘三键；page 底上的纸面）。路由 `/markdown-window?filePath= | rootPath=`，无参数为欢迎页；旧 `pages/SingleMarkdownEditor` 整体删除。
- 布局：左侧栏落在 page 底上，页签「文件 / 大纲」（大纲进侧栏，同 Typora）；标题栏 = 侧栏开关（⌘\）· 路径面包屑（未保存时 accent 圆点）· 主题 · ⋯。单文件打开时侧栏默认收起。全文搜索页签下一轮。
- 源码模式入口刻意低调：⌘/ + 状态栏最左淡色 `</>`（开启时轻染）+ ⋯「源码模式」勾选项，标题栏不放；光标双向映射沿用旧逻辑（`markdown/useSourceMode.ts`）。
- 文件树：文件与文件夹都有右键菜单（新建文件 / 文件夹、重命名、复制路径 / 相对路径、在访达中显示、移到废纸篓）；新建与重命名行内输入；拖拽移动；文件名筛选（递归扫描，上限 5000 条）；默认隐藏点开头的文件、node_modules 与不支持的类型（⋯「显示所有文件」）；展开状态按根目录记忆；目录变化只刷新那一层。删除改走 `shell.trashItem`（新 IPC `trash-item`）。
- 保存：每个文件一个编辑会话（`useTextFileSession`，视图按路径 key 重建），切换 / 改名 / 删除 / 关窗前先 flush——修掉旧实现切到代码 / 图片文件后自动保存可能把 Markdown 写进该文件的问题。当前内容序列化后等于「原文的归一化结果」时按原文比较，只打开不修改不会改写文件。外部修改：无本地改动静默载入；冲突与文件被删改为纸面横幅（载入外部 / 保留我的；重新保存 / 另存为），不再弹 Modal。
- 其它：粘贴图片仍存 md 同目录；不做多文件标签页；去掉只读开关；宽版心进 ⋯；复制（Markdown / 公众号）与导出（Markdown / 图片 / EPUB / PDF）进 ⋯。最近打开改为文件与文件夹都记（最多 10 条，Dock / 任务栏取前 5）；新主窗口命令面板加「打开 Markdown 文件 / 文件夹」；主进程 `open-markdown-window` 只收一个可选路径并自行判断文件 / 文件夹，欢迎页每次新开。
- **追记（同日，不开主应用直接打开文件夹）**：命令行带路径、双击 .md、Windows 文件夹右键「使用 Tau 打开」（`build/installer.nsh` 早已注册）冷启动时都跳过主窗口。补齐 macOS：`electron-builder.yml` 的 `mac.extendInfo` 声明文件夹文档类型（`public.folder`，`LSHandlerRank: Alternate`，只作访达「打开方式」备选），补 `.markdown` 关联；`open-file` 改为文件夹也接收，统一走 `handleFileOrFolder`。

## D-067 统计页并入今日页（一页三段）+ 今日页条目直达具体项

（2026-09-26，已定）

- 选择：删除独立统计页（`features/stats`、侧栏「工具 · 统计」入口，不做旧入口兼容），内容并入今日页。今日页一页滚动，按时间方向分三段：**今天**（复习 / 待办 / 日程）→ **继续**（最近编辑 / 探究中的问题）→ **回顾**（全年热力图、写作趋势、知识构成、记忆保持、专注节律）。外壳为一整张纸（同文章 / 卡片库 / 白板）：纸顶固定问候与今天的数字，三段在纸内 FadeScroll 滚动，纸上卡片改细描边（`Panel` 新增 `variant="outline"`）。三段标题均不吸顶；回顾段标题右端时间窗（近 30 天 / 近 90 天 / 今年 / 全部）只作用于窗口化数据；热力图固定全年、知识构成为累计。
- 去重：同一份数据全页只出现一次。今天的数字（专注 / 字数 / 新建 / 连续活跃）只在 hero；删除今日页底部四张 sparkline 统计卡与统计页速览小卡；卡组只在「今天 · 复习」（三段条：到期 / 学习中 / 已掌握），删除统计页「闪卡牌组」卡；记忆保持不再重复「今天 N 张到期」。
- 数据：`HomeSnapshot` 去掉 weekly / totals / trend，新增 `heatmap`（含 streak）；回顾段 `useRetroSnapshot`（`features/home/retroQueries.ts`，key `["home", "retro", range]`，各域失效 `["home"]` 即一并刷新）在回顾段进入滚动区视口后才拉取。
- 直达：每行点击都落到具体项——卡组 → `review {deckId}` 选中卡组；待办 → `todos {selectedId}` 选中并滚到该行（不在当前项目筛选内时回到全部）；日程 → `schedule {eventId}` 翻到当天并打开详情抽屉；卡片 / 文章 → 详情页；日记 → `diary {date}`；知识构成行 → 对应列表。热力图只做展示，点击不跳转。目标页的定位参数进入后即消费（原位更新参数），关掉后再次从今日页进入同一项仍能定位。

## D-068 数据库 / Vibe Learning 拆为独立顶级模块（项目即文档树）

（2026-09-28，已定）

- 背景：`project` 一张表同时承担三种语义（`project_type` = document-tree / data-table / vibe-learning），三者的工作台形态、数据层、级联删除范围完全不同，却共享列表页、详情 page、侧栏入口与 `["projects"]` 查询域；新建弹窗要三选一且创建后不可改型（D-031 ⑥），侧栏还得用「类型子项」把三者挤进一个入口（D-031 ③）。这些都是一表三义的代价，不是信息架构的选择。
- 选择：拆成三个独立顶级模块——**项目 = 文档树**（`features/projects`，侧栏「学习」组）、**数据库**（`features/databases`，侧栏「知识」组，紧随白板）、**Notebook**（`features/vibe-learning`，侧栏「学习」组，紧随项目）。**命名（2026-09-28 用户裁决）**：原类型名「Vibe Learning」对外改称 **Notebook**——这个模块本就是仿 NotebookLM，直说比绕（侧栏已有 Skill / MCP 服务器 / pi 会话等英文标签，不算破例）；中途试过的「学习项目」被否（「项目」二字与隔壁模块撞车，而拆开正是本条的目的），「课题 / 专题 / 研习 / 书案」等中文候选均被判「没灵性」。**page key / 表名 / IPC 频道 / feature 目录一律沿用 `vibe-learning`**：对外名可换，标识符跟数据库走。英文模块名顺带纠出一个设计错误：驾驶舱原先用「动词 + 名词」拼文案（`新建${noun}`），中英混排就要补空格，量词顺序也会错（「0 个 Notebook · 份资料 0」）。**改为 `CockpitCopy` 里一律写完整字面量**（title / createLabel / createTitle / editTitle / descPlaceholder / emptyTitle / deleteTitle / deleteDescription 等），空格写在字面量里，一行拼接逻辑都不留；菜单项与段头改用不带名词的中性词（「归档」「删除」「置顶」「全部」「已归档」），名词只出现在标题、按钮与确认文案上。附带修掉空态不垂直居中——它原本是滚动区里的 `py-20` 普通段落（照搬旧 ProjectsView），改为撑满滚动区高度并居中。由此：① `EProjectType`、`projectTypeMeta`、类型 pills、`ProjectsNav` 子项槽（`project-types`）、新建弹窗的三选一与「类型创建后不可更改」全部删除，本条修订 D-031 ③⑥⑦ 与 D-033 的「三型分派」；② 侧栏主导航 17 → 19 条；③ 三个列表页共用 `features/shared/cockpit`（驾驶舱：置顶 hero 段 + 全部网格 + 归档折叠段 + 新建/编辑弹窗），差异收敛为 `CockpitVisual`（图标与类型派生色，沿用 D-031 的青蓝/紫罗兰/accent）+ `CockpitCopy`（名词、大数字单位、空态引导、删除影响）+ `CockpitMutations`；卡面大数字按模块取义：项目 = 文档数、数据库 = 行数、Notebook = 资料数（后两者由主进程 `list` 顺带聚合，不把 `rows` blob 传到渲染层）。
- 数据：新增 `database_item`（id/时间/标题/desc/archived/pinned/data_table_id）与 `vibe_learning_project`（同前者去掉 data_table_id）两张列表实体表（schema 分片 `main/31_module_split.sql`，主库表数 64 → 66）。**id 原样搬迁、绝不重编号**——VL 的 per-project 索引库 `{mainDb}-project-{id}.db`、`<appDir>/vibe-learning/<db>/<id>` markdown 目录、`chat_session.domain_id`、`vl_note.project_id`、`operation`、`publish_selections` 都以该 id 命名；三张表共用 `migration_meta:'project:id-seq'` 序列（抽到 `tables/module-entity-id.ts`，取号时对三表 MAX(id) 取最大），保证跨模块不撞、历史 id 永不复用。`vibe_learning_resources.project_id` 的外键从 `project(id)` 改指 `vibe_learning_project(id)`（SQLite 不能改外键，按基线重建表）；**重建必须排在 `DELETE FROM project` 之前**，否则删父行触发外键约束（移动端 `foreign_keys=ON`，这一步写反会直接中止升级）。`project.project_type` / `data_table_id` 本版保留为 dead column（老库要靠它们被读到才能迁移），下一版 rebuild `project` 时去掉。
- 迁移：桌面走 `ProjectTable.upgradeTable` 内的 `migrateSplitModules`，`migration_meta` 键 `project:split-modules` 幂等（沿用 `project:legacy-web-links` 的写法）；非文档树项目若携带 `children` 只告警不阻断，避免误删树。移动端 `MAIN_SCHEMA_VERSION` 3 → 4，`main_upgrade::split_project_modules` 实现同一套（建表由既有的 `table_definitions` 循环按基线完成）；移动端本来就只允许新建文档树（另两型点了只弹「即将上线」），故前端直接删三选一、`ProjectType` 与 `Project.projectType`。
- 收尾：`DatabaseWorkspace` 从 `features/projects/components/ProjectView/shared/` 提升到 `features/shared/database/`（数据库详情与文档树的 table-view 条目共用）；`VibeLearningView/` 30 文件整目录搬到 `features/vibe-learning/views/`，左栏折叠态从共用的 `projectTreeStore` 分出 `vibe-learning/panelStore`（同 key 会让两模块互相干扰）；`InsertNoteToTreeModal` 的「只挑文档树」过滤条件失效后删除（VL 笔记插入文档树是刻意保留的跨模块通路）。验证：桌面 tsc 0 错误、vitest 新增 `project-split-modules-migration.test.ts`（外键重建 / id 不复用 / 幂等）+ VL 删除测试改挂 `VibeLearningProjectTable`；移动端 tsc、`cargo check`、`cargo test` 81 通过（新增 `split_modules_moves_parasite_projects_and_rewires_resource_foreign_key`）。

## D-069 PDF 列表页定稿（A 文档墙 + 列表排布）+ 过渡阅读页

（2026-09-29，已定）

- 背景：新壳层里 PDF 没有任何入口（navigation 无条目，legacy 占位机制已删），只能在 `/legacy` 的旧 Tab 里用；旧列表 `pages/PdfView/PdfListView` 只显示文件名 + 本地 / 远程标签，右下角浮动 + 打开 antd 弹窗（单选文件），`tags / category` 字段从未有 UI。mockup：`mockups/pdfs/`（A 文档墙 + 列表切换 / B 纯列表 / C 列表 + 预览栏）。
- 裁决（2026-09-29，均按推荐）：① **A 文档墙 + 列表排布**，与微信读书书架同构，右上角切「封面 / 列表」，列表只点列头排序；② 封面用**首页缩略图**，未生成时按 id 派生粉彩底 + 文件名；③ 保留「**最近打开**」续读行（读到第几页）；④ 分类 / 标签**暂不做**（`tags / category` 字段保留不用），只按来源（全部 / 本地 / 远程）筛选 + 文件名搜索；⑤ AI 检索状态只在列表排布露出一列，菜单可「建立 / 重建 AI 索引」；⑥ 添加 = 对话框（本地文件多选 / 链接，名称从链接推断）+ 整页拖入，「同时上传到云端」为本机偏好。
- 数据：`pdfs` 表加 `page_count / last_open_time / last_page` 三个可空列（schema 分片 `10_core.sql`；桌面 `PdfTable.upgradeTable` 补列，移动端不读此表、由基线补齐循环在下次升级时带上，表 / 索引数不变）。新命令：`pdf:library`（Pdf 行 + 标注数子查询 + 缩略图路径 / 修改时间 + 本地文件是否丢失，一次返回）、`pdf:record-open` / `pdf:record-page`（**不改 update_time、不记 operation**——阅读器以 updateTime 作重载键，翻页写它会整个重挂载）、`pdf:save-thumbnail`（落盘并记页数，行已删则不写）、`pdf-index:status-batch`（只查已有索引库的文件，`getDatabase` 会按需建库，列表查询不能用它）。
- 缩略图：渲染端 pdfjs 画第 1 页 → 360px 宽 webp，主进程存 `<编辑器目录>/pdf-thumbnails/<库名>/<id>.webp`（经 `convertFileSrc` 显示，地址带修改时间作版本），删 PDF 时一并删除。生成时机：导入时（已有字节）、打开阅读页时（文件已就位）、列表页为缺图的**本地**文件串行补生成；远程文件在列表页不补（会触发下载），打开过一次后才有图；本次运行失败过的不重试。
- 阅读页（过渡）：`pdf-detail`（params `pdfId`，status **migrating**）只承载 `PdfEmbedViewer`（标注 / 书签 / 页内搜索），打开即记录打开时间、跳到上次读到的页，翻页 1.5s 防抖写回、离开时冲洗；AI 对话（legacy `PdfChatPanel`）不在本页，随详情页正式迁移补上。`PdfEmbedViewer` 新增可选 `onPageChange` / `onFileResolved`，旧调用方不受影响。
- 共享层：weread 的分类 pill 提升为 `@tau/ui` 的 `FilterPill`（weread 与 PDF 共用，样板间已建档）；`FileDropZone` 新增 `onFiles` 多选模式（`onFile` 单选语义不变）。同日追记：闪卡卡组 pills（`DeckPills`）与 Skill 筛选 pills 也改用 `FilterPill`——二者未选中是 surface 底 + 卡片投影的浮起皮肤，与 weread 的描边皮肤不同且无裁决记录，故 `FilterPill` 增 `variant="outline" | "raised"`（默认 outline）与 `icon` 槽保持各页原样，不借机统一外观；Skill「需要处理」的警示色经 className（cn 合并）覆盖。卡组 pill 顺带补上 `aria-pressed`。
- 删除：「删除 PDF」连标注、书签、索引库、AI 对话、缩略图一起删；工作区 resources 里的文件副本仍不删（沿用旧行为，确认文案如实说明）。legacy 列表页按 04 清单 §pdfs 登记，锚点 P-pdfs。

## D-070 PDF 阅读页定稿（方案 B「页边图钉 + 纸内对话」）+ 页面接管 AI 对话开关

（2026-09-29，已定；样板间 `mockups/pdf-detail/`，A 沉浸阅读 / B 边注 / C 学习台三选一，用户选 B 并两轮校准）

- 背景：旧阅读器 `components/PdfEmbed`（约 1640 行，embedpdf 引擎）顶部一整条工具栏 + 「工具模式」（先选高亮 / 下划线 / 截图工具再操作）+ 左侧五页签（目录 / 搜索 / 缩略图 / 书签 / 笔记），antd（Tooltip / App / Result / Empty / Dropdown）与 react-icons 混用，笔记编辑是屏幕底部的大面板；AI 对话在 legacy `pages/PdfView/PdfChatPanel`，D-069 的过渡阅读页没有接上。
- 一轮裁决：选 **B**，其余按样板间 ③ 的推荐：新建标注只给「高亮 + 下划线」（旧的波浪线 / 删除线照常显示、编辑，不能新建）；5 色（黄 / 红 / 绿 / 蓝 / 紫，旧的粉色照常显示）；笔记为轻量富文本（沿用 `pdf_annotations.notes` 的 Slate JSON）；删除标注直接删 + toast 撤销；进入本页收起全局侧栏、离开还原。**AI 对话放纸内右栏**（样板间 B 原画在壳层停靠栏，与推荐冲突，问过用户后选纸内）。
- 二轮校准：① 边注栏挤窄正文 → **不做常驻边注栏**，有笔记的标注只在页面右页边内放一枚图钉（标注色），悬停浮出笔记卡、点击钉住，卡片浮在正文上方不占宽；② 左面板**恢复「标注」页签**（目录 / 页面 / 标注 / 书签），用于浏览与跳转（点一条 → 滚到原文，有笔记的图钉闪一下并钉住）；③ 阅读区背景与纸同色（不用 sunken 深底），页面只靠投影区分；问 AI 的引用条同样不用 sunken。偏好记入 PREFERENCES（背景别太深 / 悬停不要夸张位移与阴影 / 批注不占阅读宽度）。
- 交互（三方案共用，A 为交互标本）：没有「工具模式」——划线后原地弹浮动工具条（5 色点即建标注，沿用上次颜色与样式；高亮 / 下划线切换；写笔记；问 AI；复制）；点已有标注弹同一条工具条（当前色打勾，多删除）；按住 Alt 拖动框选区域，松开出工具条（存为区域标注 / 问 AI / 复制图片）；页角悬停出书签，快捷键 B；Ctrl/⌘+F 在阅读区右上角弹查找条（关键词 = 引擎全文检索逐个跳转高亮；按意思找 = AI 索引）；顶部工具栏去掉，翻页 / 页码 / 缩放 / 查找 / ⋯ 收进底部悬浮 HUD（常驻显示；原定「滚动时变淡」，实机上半透明叠在正文上显得乱，2026-09-30 用户裁决取消），⋯ 里放双页（D）、旋转（R）、夜间页面（反色，只反页面位图、标注不反）、全屏、在文件夹中显示、重建 AI 索引；抓手工具去掉，按住空格临时平移，Ctrl+滚轮 / 触控板捏合缩放；←/→ 翻页。键位只在焦点位于阅读器（或无焦点）时生效，让位编辑上下文与输入法组合；Alt+←/→ 仍归导航，单独按下的 Alt 才是框选修饰键；Esc 一律经 `useOverlayDismiss`（工具条、笔记卡、钉住的卡、查找条）。
- 问 AI：选区 / 标注 / 截图作为**引用 chip** 带进对话输入框，不自动发送，给「解释 / 翻译 / 举个例子 / 找相关段落」快捷问法（填进输入框由用户改）；发送时引用以 `>` 引用块并进这条用户消息（截图作为图片附件）。回答里的 `:pdfref` 页码角标点了跳回原文，并按摘录在页内定位、闪一下。
- **页面接管 AI 对话开关（壳层改动）**：新增 `app/assistOwner.ts`——页面在栈顶期间用 `useOwnAssist(pageKey, toggle)` 注册自己的对话开关，Ctrl/⌘+J 与命令面板「AI 对话」改为开合页面自己的对话栏，标题栏停靠栏按钮与壳层停靠栏在该页隐藏（开合状态保留，离开即恢复）。只给「这份内容专属会话」的页面用，页面本身就是通用对话时隐藏全局停靠栏。保活隐藏的实例 effect 已清理，注册随之撤销。
- 共享层：`ChatContainer` 新增可选 `composerAccessory`（输入框正上方的附件区）与 `prepareUserContent`（发送 / 排队前改写用户消息），其他调用方不受影响。闪卡沉浸复习的 `useReviewSidebar` 提升为 `app/useSidebarCollapsedWhile`，PDF 阅读页共用。embedpdf 引擎的交互管理插件登记排除属性 `data-pdf-overlay`，页内浮层打上它，点浮层不会被引擎当成页面点击（清选区 / 开始新划线）。
- 数据：标注 / 书签 / 单文件索引状态收编 react-query（`features/pdfs/reader/data.ts`，按库分 key，写后直接改缓存，同一引擎标注的写入串行——「创建」未落库就来「更新」会写出两条）；索引状态只经 `pdf-index:status-batch` 读（单查接口会为没建过索引的文件建库），文件就位后自动准备一次索引。文本标注的颜色以写进 PDF 对象的十六进制为准（与旧数据一致），界面色块经 `COLOR_SPECS` 映射到主题数据色 `tag-*`（与微信读书划线同一套对应），外来颜色按最近距离归档。阅读状态仍只经 `pdf:record-*` 写，不改 update_time。
- 结构：`features/pdfs/reader/`（`PdfReader`：`PdfReaderView` 由宿主注入文件与索引、`PdfReader` 独立使用；`ReaderLayout` 交互编排；`components/` 浮动工具条 / 标注工具条 / 笔记卡 / 每页叠加层 / 左面板 / 查找条 / HUD；`annotationModel.ts`、`outline.ts` 纯逻辑带单测；`readerPrefs.ts` 本机偏好）、`features/pdfs/chat/`（`PdfChatPanel` + `usePdfChatTools`，由 legacy 搬迁重写）。项目里的 PDF 条目（`PdfProjectItemView`）改用独立 `PdfReader`（无对话，左面板开关在 HUD）。
- 删除：`components/PdfEmbed/` 整目录（引擎参考文档移到 `docs/embedpdf/`，`usePinchZoom` 搬进 reader）、`components/EditPdf.tsx`、`pages/PdfView/PdfChatPanel.tsx` / `usePdfChat.ts`。按 04 清单 §pdfs 的 P-pdf-detail 锚点执行，删前 rg 复核消费者清零。
- **追记（2026-09-29，项目域 PDF 引用收编）**：用户指出项目域（新架构）仍引用旧件——「关联已有 PDF」弹窗 `components/SelectPdfModal`（antd + legacy `pages/PdfView/PdfCard`）与建记录用的 zustand `usePdfsStore`（与 PDF 域 react-query 各读各的库，列表页改名 / 新增互不同步）。裁决：选择弹窗重写为 `features/pdfs/components/SelectPdfDialog`（`@tau/ui` Dialog；与列表页同一份 `pdf:library` 数据、封面与信息行；按最近打开排序、文件名过滤、单选，双击 / ↵ 直接关联；选中态归弹窗，`useAddRefPdf` 只管开合与排除项）；PDF 域导出 `useCreatePdfRecord` 给项目域建记录（写后失效 `["pdfs"]`，本地文件顺带生成缩略图）；`PdfProjectItemView` 改 react-query（条目 + `usePdfDetail`）；删除 `SelectPdfModal`、`PdfCard`、`usePdfsStore` 与目录树里只为预选而下传的 `pdfs` prop。项目域经 `@/features/pdfs/...` 引用 PDF 域的组件与 query，依赖方向为「PDF 归 PDF 域、项目只存 refId」。
- **追记（2026-09-30，实机校准）**：① 底部 HUD 取消「滚动时变淡」，常驻不透明（半透明叠在正文上显得乱）；② 纸内对话栏可拖宽（320–560，默认 380，双击恢复，本机偏好 `readerPrefs.chatWidth`）——壳层停靠栏原有的拖宽热区抽为 `@tau/ui` 的 `ResizeHandle`（停靠栏与 PDF 对话栏共用，样板间已建档）；③ 阅读区视口挂 `FADE_SCROLL_CLASS` + `useEdgeFade`（细滚动条上下内缩 10px、边缘渐隐），页面加 line-1 细边、末页下留 HUD 高度的空白；④ 每页等整页位图加载完再显示标注与叠加层；⑤ 点浮层以外任意处（捕获阶段、先于引擎）收起所有工具条 / 钉住的卡与标注选中，新选区与标注工具条互斥；⑥ Alt 框选松手后用虚线框标出选中区域，直到存为标注或关闭；⑦ **恢复抓手工具**（推翻一轮的「抓手工具去掉」，用户反馈「只有选中的模式，缺少变小手拖拽的模式」）：HUD 加抓手开关（H），常开时拖动平移、再点回到选择文字；按住空格仍是临时平移，松开回到当前工具；⑧ 左面板缩略图列表接 FadeScroll（引擎面板经 `data-pdf-thumbs` 取元素），缩略图插件 `paddingY: 10`，选中页的外侧 accent 框不再被滚动容器裁掉；⑨ **Ctrl/⌘+F 查找接管**：全局页内查找条 `GlobalFindBar` 在 document 捕获阶段拦截 Ctrl/⌘+F 并阻止传播，PDF 阅读器与设置弹窗的分区搜索都收不到。新增 `components/GlobalFindBar/findOwner.ts`：自带查找的区域在生效期间 `useFindOwner(open, active)` 注册，全局查找条交给最后注册的接管者（LIFO，浮层优先于底下的页面），没有接管者才打开页内文本查找；阅读器与设置弹窗改走它，各自不再监听 Ctrl/⌘+F。

## D-071 侧栏分组重排（日常 / 知识 / 学习 / AI / 分享）

（2026-09-30，已定；用户裁决）

- 背景：原分组 工作台 / 知识 / 学习 / AI / 工具 的切分维度不统一——「知识」是资产、「学习」是活动，二者不互斥，D-068 拆出 Notebook / 数据库后「项目」归属失据；「工具」组只剩「发布」一项；「协作」是对外共享却放在工作台；日记放在知识组也不贴切。
- 选择：分组按「它是什么」划分，「拿它做什么」由页面内部表达：
  - **日常**（原工作台，改名——内容是以「天」为单位的时间轴，「工作台」语义偏工具）：今日 · 日程 · 待办 · 日记 · 番茄专注。日记是按天记录，自知识组迁入。
  - **知识**（有体系的产出）：卡片库 · 文章 · 项目 · 白板 · 数据库。项目自学习组迁入——项目与 Notebook 是两种学习形式，Notebook 偏「学」，项目偏「整体梳理成体系」；学习目标型项目与知识体系型项目结构相同，只是前后阶段，不按阶段拆两个入口。
  - **学习**（学习工作流：产生疑问 → 学习解决 → 沉淀卡片）：问题管理 · Notebook · 微信读书 · PDF · 闪卡复习。问题管理是起点，置顶。
  - **AI**：不变。
  - **分享**（原工具，改名）：协作 · 发布。协作自工作台迁入，二者都是对外动作。
- 组序：知识在学习之前（用户裁决，高频入口靠上）。组折叠状态按组名持久化（`shellStore.navSectionCollapsed`），改名的两组折叠态回到默认展开，旧键残留无副作用。
- 实现：`app/navigation.ts`（命令面板 page 命令的 section 与之同源，随之更新）。

## D-072 演示模式重做：画框舞台 + 分节镜头推进，放大与编辑器实现解耦

（2026-09-30，已定；用户裁决）

- 背景：旧演示模式参考早期 Slidev 思路，靠容器 `font-size: 40px` 让编辑器按 em 级联放大——等于强制编辑器每个块只用 em，px / rem 写法（现存二十余处）在演示里不放大；D-028 的「演示模式字号继承修复」追记（2026-09-23）同属这一耦合。交互上翻页只认 ←/→（翻页笔的 PgUp/PgDn 无效），全览键盘被两处 window 监听重复处理，`⌘H` 撞 macOS 隐藏应用，`D` 键直接改写全局明暗设置，样式为 less + antd 图标 + `--th-*`。
- 方案对比（`mockups/presentation/`）：A 纸面沉浸（整张纸放大连续滚动）、B 画框舞台（固定 16:9 画布）、C 聚光讲稿（逐块高亮）。用户选 B；针对「文档不是为幻灯片写的，长度不可控」再比较「按高度自动分屏」与「分节 + 镜头推进」，定后者。
- 选择：
  - **放大 = 画框整体缩放**：画框逻辑尺寸 880×495，正文按编辑器常规字号（`--font-size`）排版，外层 `transform: scale` 适配窗口。演示层不对编辑器的字号单位做任何假设，**编辑器不再承担「必须用 em」的约束**。
  - **断节只看结构不看高度**：有分割线按分割线；否则按「出现两次以上的最高级标题」（单个 H1 文档标题不参与）；都没有则整篇一节。只含空段落的节丢弃。页码只数节，只有一节时不显示页码。
  - **一节放进画框的三级阶梯**：放得下居中 → 超出不多（缩到 80% 以内能放下）整体缩小 → 再长走镜头推进：画框不动，内容按块边界逐屏上移；标题不落单（随下一块进下一屏）；单块高过一屏时块内按 85% 屏高推进。块高由画框实测（ResizeObserver 跟踪图片 / 代码高亮等异步撑高），进上一节停在末屏为意图态，屏数增加后仍停末屏。
  - **交互**：推进键 → ↓ Space PgDn Enter / 后退 ← ↑ PgUp（兼容翻页笔）、Home/End、数字 + Enter 跳节、点击画面右 2/3 前进左 1/3 后退（链接等可交互元素与选区除外）、滚轮推进（惯性静默 450ms 才接受下一次）；`O` 全览（与放映共用同一份画框渲染，多屏节标「N 屏」）、`F` 窗口全屏（退出演示时撤销）、`?` 快捷键面板；到头回弹代替提示条；鼠标静止 2s 隐藏 HUD 与光标；进场 3s 快捷键提示代替首次强弹帮助。
  - **仲裁**：Esc 经 `useOverlayDismiss` 逐层退场（帮助 → 全览 → 退出）；推进键在捕获阶段接管并阻止冒泡（不让被遮住的页面响应），修饰键组合、编辑上下文（叠在上方的命令面板输入）与输入法组合一律放行；放映期间 `useFindOwner` 吞掉 Ctrl/⌘+F。
  - **不做**：演示内独立明暗切换——主题运行时只有整窗 `forceMode`（退出不复原）且编辑器 JS 读 `<html>` 明暗，局部覆盖需先扩展 `@tau/themes`，按需再议；「从当前光标所在节开始」与「退出后编辑器定位回当前节」需调用方配合，接口 `{ content, onExit }` 暂保持不变；节内拆分续页（列表 / 表格按行拆）留待镜头推进不够用时再做。
- 追记（2026-09-30，用户实机反馈「要全屏」）：画框卡片（下沉底色 + 四周留白 + 圆角投影）改为**全屏舞台**——进入演示即窗口全屏（退出还原到进入前状态，平台只提供 toggle，按目标状态查后再切），舞台铺满窗口：逻辑宽 1000 固定、高度随窗口比例（16:10 屏也用满高度，窗口过宽时逻辑高不低于 480），正文列 768 水平居中，底部多留 72 给 HUD；缩略图沿用放映比例。镜头计划末屏改为内容底边贴视口底边（原按块顶对齐，末屏下方留大段空白）。上文「880×495 画框」口径作废。
- 追记（2026-09-30，用户实机反馈「底部条时有时无、向下箭头奇怪、没看到 D 切深浅」）：① **HUD 显隐改为位置驱动**——仅在进场提示期间、鼠标位于屏幕底部 140px 带内、悬停 HUD 或全览 / 帮助打开时显示，离开即收起；原「任意移动唤出、静止 2s 隐藏」叠加「贴底边滑出胶片条把 HUD 顶上去」，表现为无规律闪现。光标仍按静止 2s 隐藏。② **胶片条删除**——与 `O` 全览重复，且与 HUD 抢底边。③ **画面底部的「下方还有」箭头删除**，多屏提示只留右侧屏点与上下渐隐。④ **恢复 `D` 切深浅色，只作用于演示层**：演示根节点写 `data-theme`（沿用当前主题族）+ `data-mode` + `th-scope-dark/light`，`@theme inline` 的语义色在子树内重算；编辑器经 `EditorThemeOverride` 按演示明暗渲染（shiki / mermaid 等 JS 取色随之切换，与导出预览 ContentExportModal 同一机制）。不写全局偏好、不动 `<html>`——这是「业务代码禁止操作 data-theme」的受控例外，仅限演示根节点这一局部作用域。已知边界：Tooltip 经 Portal 挂在 body，仍随应用明暗。上文「不做：演示内独立明暗切换」作废。
- 影响：`src/components/PresentationMode/` 整体重写（sections / cameraPlan 纯函数 + 单测、frame 常量、SlideFrame / SectionThumbnail / Overview / HelpPanel），旧 `components/`、`hooks/`、`index.module.less` 删除；调用方（文章 / 卡片 / 项目共五处）无改动；白板演示模式不受影响；03 指南 §5 新增「演示模式」小节。

## D-073 @tau/shared 聊天组件族 antd 就地换 @tau/ui（推翻「跨端阻断」预判）

（2026-09-30，已定；消费链调查驱动）

- 背景：§antd-exit 曾把 shared 聊天组件族记为 M5 前置阻断项（「mobile 与 desktop 共用、antd 打进移动端 bundle、需拆包或跨端替代」）。2026-09-30 消费链调查**推翻该预判**：聊天 UI 组件族（ChatInputArea / ChatContainerCore / ChatMessageView / ChatToolCallDisplay / ContextUsageIndicator / ImageGallery / MermaidRenderer）的消费者**仅 desktop**（ChatSidebar 链、SkillPickerPanel、InlineAIComposerPanel、MentionPanel）；mobile 只消费 shared 的编辑器模块（LocalVideo / LocalAudio / DepsProvider 族 / markdownCustomDirectives，均不含 antd，tree-shaking 后 mobile 产物无 antd）；browser-extension 的 sidepanel 用 MarkdownRenderer，但其 antd 是 `MessageInstance` **纯类型导入**，编译后消失；blog 不涉聊天 UI。
- 方案对比：**A 就地换 `@tau/ui` + lucide + 自定义最小类型接口**（选定）；B fork 到 desktop（双份维护，且无第二消费端存在的证据，YAGNI）；C 拆独立 chat-ui 包（消费面单一，过度设计）。
- 可行性已验证：依赖方向 `shared → @tau/ui` 无环（ui 仅依赖 @tau/themes）；`usePortalContainer` 无 Provider 时 fallback `document.body`（inline-ai 面板的独立 createRoot 安全）；shared 已依赖 lucide-react。
- 执行口径（按依赖形态分三档）：
  - 纯类型 ×3：`types.ts` 的 MenuProps、ChatMarkdownRenderer / MarkdownRenderer 的 `MessageInstance` → 自定义最小接口；
  - 仅图标 ×3：ChatMessageView / ChatToolCallDisplay / ImageGallery → lucide 直换；
  - 运行时组件 ×4：ChatContainerCore（Tooltip）、ContextUsageIndicator（Button/Popover）、ChatInputArea（Button/Upload/Dropdown/Tooltip/Input/Popover/message + icons + TextAreaRef）、MermaidRenderer（Tooltip/Alert/Spin）→ `@tau/ui` 对应原语 + toast。
- 影响：shared 的 package.json 增 `@tau/ui` 依赖；shared 清零后 desktop 的 `App.tsx` ConfigProvider 补丁链、`useSyncTwoToneColor`、e2e / ChatInputArea 测试宿主全部解锁随删；antd / @ant-design/icons 随之移出 desktop 与 shared 依赖，§antd-exit 收官。ext / blog 的自有 antd（各 7 / 1 文件）独立处理，与本裁决解耦。

## D-074 沉浸写作重做：全屏聚光 + 整列 zoom，放大与编辑器字号解耦

（2026-09-30，已定；用户裁决）

- 背景：旧沉浸模式是一层 `bg-white/95` 遮罩 + 写死 `font-size: 24px` 让编辑器按 em 级联放大（与 D-072 之前的演示模式同一耦合），不全屏、常驻圆形关闭钮与字数胶囊，颜色写死 `#1e1e1e`，Esc 自挂 window 监听（违反 D-003）。用户评价「完全没有沉浸感、设计过时」，要求完全重构并参考演示模式。
- 方案对比（`mockups/immersive/`）：A 静室（只剩字，光标越出舒适带才跟随）、B 聚光（iA Writer 式：打字机滚动 + 段落聚焦默认开）、C 书桌（下沉底 + 纸张 + 左缘大纲 + 写作目标环）。用户选 B。
- 选择：
  - **进入即窗口全屏**（与演示共用 `useFullScreenWhileMounted`，退出还原），背景 surface，无常驻 chrome：右下一行淡字数；控制条（字数 · 本次 +N · 用时 / 缩放 −·%·+ / 打字机 / 聚焦 / 深浅 / 退出）位置驱动显隐，一输入即收起并隐藏指针。
  - **放大 = 版心整列 CSS `zoom`**，按屏宽自适应（版心约占 60% 屏宽，1×–1.75×），控制条在其上 ±10% 微调（0.8–1.5）。**不用演示的 transform**：可编辑需要真实布局（光标命中、滚动高度、Portal 浮层定位不必换算；Chromium 标准化 zoom 后 getBoundingClientRect 即屏幕像素）。编辑器唯一一处「DOM 内 fixed + 视口坐标」的文件落点指示线改为按 `currentCSSZoom` 反除。
  - **打字机滚动**：光标行钉在视口 45%，上下留白 45vh / 55vh（在 zoom 之外）；关掉后退为舒适带跟随（越出 20%–75% 才滚）。只响应键盘引起的光标移动，鼠标点击 / 滚轮回看不拉回。
  - **段落聚焦**：编辑器通用能力 `focusMode`——按选区的文档路径（元素祖先链）标记，链外的同级兄弟退后（顶层块、列表项、表格单元格…一视同仁），不认元素类型与渲染 DOM；退后程度由宿主经 `--ed-focus-dim` 设定（打字机开 0.26、只开聚焦 0.42，与样板间一致）。初版曾在沉浸层按 DOM 结构（拖拽容器 / chunk / ul·li）找「顶层块」，列表整块常亮，属按实现打补丁，已废弃。实机「第一个标题之后全部常亮」的根因不在聚焦：标题折叠 `useHeaderCollapse` 挂载时就跑展开动画，给整节写内联 `opacity: 1` 且结束后不清，内联样式压过一切 class；已改为只在折叠状态变化时动画、结束后清掉 opacity（`header/__tests__/collapseStyles.test.tsx` 守护）。扩展以内联样式做动画时，结束后必须清干净。
  - 深浅色只作用于沉浸层（与演示共用 `useStageTheme`）；Esc 经 `useOverlayDismiss`；`useFindOwner` 吞掉 Ctrl/⌘+F。
- 不做：写作目标（C 的目标环，YAGNI）；缩放快捷键——`Ctrl+=` / `Ctrl+-` 已被主进程注册为整窗缩放全局快捷键，沉浸层只给控制条按钮；顶部标题 / 保存状态栏（接口不携带标题与保存态，按需再议）；开关状态跨次记忆。
- 影响：`src/components/ImmersiveEditorMode/` 原位重写（layout 纯函数 + 单测、useCaretFollow），编辑器新增 `focusMode`（`components/FocusPath`：focusPathOf / focusRoleOf 纯函数 + 单测、FocusAttributes 在 renderElement 里把标记并进 attributes，按节点身份判断角色——协作文档下 findPath 会给出过期路径；挂真实 Editor 与 Yjs 文档源的回归测试），`useTypewriterScroll` 删除；接口删去 `wordCount` / `readonly`（字数改由组件自身内容实时计算——卡片 / 项目传入的 count 要等持久化后才更新），`onInit` 改可选；演示模式的全屏 hook、HUD 胶囊与局部主题抽到 `hooks/useFullScreenWhileMounted` 与 `components/Stage` 共用；03 指南 §5 新增「沉浸写作」小节。

## D-075 快捷卡片窗口并入卡片编辑窗口：打开即建闪念笔记

（2026-09-30，已定；用户裁决：要「卡片打开新窗口」那种，而非新建卡片弹窗式的草稿 + 保存）

- 选择：`/quick-card` 不再是独立的草稿表单（旧 `QuickOpenLayout` + `pages/QuickCard`：编辑器 + 标签 + 「保存并关闭」），改为 `features/cards/windows/QuickCardWindow`：连库后新建一张闪念笔记（`ECardCategory.Temporary`，经卡片域 `useCardsMutations().create`），随即渲染 D-063 的 `EditorWindow`（卡片驱动，自动保存、大纲、⋯菜单、状态栏全部复用），正文打开即聚焦（`EditorWindow` 新增 `autoFocus`）。
- 空卡片不留存：关窗（beforeunload）时正文为空即删除；删除未及执行时，下次唤起按 localStorage `quick-card-last` 复用该空卡片，不再新建。
- 主进程：`createQuickCardWindow` 改为键控单例（`window-registry` key `quick-card`，再次 ⌘⇧N 聚焦已有窗口），尺寸同卡片编辑窗口并记忆位置；仍默认置顶。
- 编辑窗口纸面（三类内容共用）：正文列改纵向 flex，正文区撑满余高，标签行内容短时贴纸面底部、内容长时跟在正文末；点正文下方空白落到正文末尾。
- 随删：`layouts/QuickOpenLayout`（`layouts/` 目录清空）、`pages/QuickCard`、`components/FullScreenLoading`、`TitlebarIcon`、`GlobalTitlebar`、`stores/useModuleStore`（后四者唯一消费链来自 QuickOpenLayout）；主进程 `window-module-mapping` 的 `quick-card` 窗口类型同步删除。

## D-076 视频播放器重做：纸框底栏为常态，全屏切浮岛胶囊

（2026-09-30，已定；用户裁决）

- 背景：`@tau/shared` 的 VideoPlayer（编辑器视频块、视频笔记、Vibe Learning 预览、白板视频、mobile / blog / 浏览器扩展共用）是直角黑框 + 白色渐变控制条，不跟主题；音量滑条悬停时宽度 0→80px 顶开布局（违反「悬停不改变尺寸」）；控件隐藏后看不到进度；无快捷键；编辑器选中态只有四角句柄；缺 metaInfo 时显示裸红字。
- 方案对比（`mockups/video-player/`）：A 纸框底栏（控件在画面下方的纸色底栏，进度条贴接缝，常驻不显隐）、B 浮岛胶囊（画面内不透明深色胶囊，静置收起留 3px 进度细线）、C 边缘极简（进度条即卡片下沿，悬停浮出两角药丸）。用户选 **A 为常态 + 全屏用 B**，通用交互升级全部要。
- 选择：
  - 播放器根节点是纸面卡片（`rounded-tau-md bg-surface shadow-card`，调用方经 `cn()` 覆盖），内层纵向 flex：父级给定高度时画面区收缩让出底栏，不给时按视频比例撑开——消费方不要再给根节点加 `aspect-video` / padding。容器查询挂在底栏 / 胶囊上而不是根节点（根节点做 inline-size 容器会让 `w-fit` 外层按内容推宽时塌成 0）。
  - 控件原子件三套色板：`surface`（纸面底栏）、`float`（全屏胶囊，`bg-ink-1` + `ink-inverse`）、`light`（音频卡，待音频重做时换掉）。音量改为上方弹出的竖向滑杆，悬停时滚轮调节。
  - 通用能力：进度条帧预览（悬停停留 400ms 才出时间 / 帧气泡并开始取帧，拖动时立即显示——每次路过进度条都闪一下体验差；首次取帧才创建离屏 video 解码同一地址，同一时刻只有一次 seek 在途、只保留最新请求）；续播（`persistKey` 启用，存储键沿用 `video_position_` 前缀兼容旧数据，开头 / 结尾 5 秒内不续播，底栏提示 8 秒并给「从头播放」）；键盘快捷键（仅播放器聚焦时生效，带 ⌘/Ctrl/Alt 的组合键与输入法组合放行，Esc 退出全屏交给浏览器原生，不接入 D-003 浮层仲裁）+ 画面中央 OSD 反馈；画中画；倍速改动经 `onPlaybackRateChange` 交宿主持久化。
  - 编辑器视频块：选中改为圆角 outline（外扩 3px），上方浮出属性条（对齐 / 宽度 50·75·100% / 复制地址），选中改在容器捕获阶段完成（原先暂停态的播放覆盖层吞掉点击，只有播放中点画面才能选中）；倍速写回节点；底栏信息位显示「来源 · 标题」（Provider 新增 `label`，插入 B 站 / YouTube 时把标题写进 metaInfo，老节点无标题只显示来源名，直链 / 本地文件退回文件名）。
  - 在线视频取源浮层：`VideoSourceLoader` 新增 `framed`（自带 16:9 纸面卡片，与播放器同形，就绪原位替换不跳高度）与 `onRetry`（取源 hook 新增 `retry`）；缺 metaInfo 改走同一失败版式。
- 不做：进度条章节 / 时间戳标记（只有视频笔记用得上，YAGNI）；属性条「更多」（块菜单已有）；帧预览缩略图缓存。
- 影响：`packages/shared/src/components/MediaPlayer/` 重写 VideoPlayer / MediaControls / ProgressBar，新增 `useFramePreview`、`usePlaybackResume`、`videoShortcuts`（纯函数 + 单测）；desktop `LocalVideo` 与扩展 `RpcLocalVideo` 删去各自的播放位置持久化改传 `persistKey`；编辑器 `VideoSlotProps` 增 `onPlaybackRateChange` / `info`；视频 Markdown codec 的 metaInfo 解码改为与编码对称的 UTF-8（原先 `atob` 直解，中文标题往返会乱码）；视频笔记、Vibe Learning、白板三处外框按新布局调整，视频笔记的非缓存直链路径也换成 VideoPlayer。

## D-077 音频播放器重做：波形卡（与视频共用控件与交互）

（2026-09-30，已定；用户裁决）

- 背景：`@tau/shared` 的 AudioPlayer（编辑器音频块、markdown 窗口、Vibe Learning 预览、blog / mobile / 浏览器扩展共用）仍是 legacy `light` 灰卡皮肤；标题输入框聚焦灰底跳变；TTS 插入时存了 `audioText` 但界面无入口；无悬停时间、无快捷键，续播在 LocalAudio 里静默发生；LocalAudio 解析地址期间返回 null，块凭空消失再出现，播放失败无提示。
- 方案对比（`mockups/audio-player/`）：A 单行条（视频底栏同构，64px 一行）、B 波形卡（标题行 + 真实波形即进度条）、C 播客卡（封面 + 章节刻度 + ±15 秒，可顺带替换音频笔记的私有播放器）。推荐 A（文档）+ C（音频笔记），用户选 **B**，音频笔记不纳入。
- 选择：
  - 卡片同视频纸面卡片；标题行 = 42px accent 播放钮 + 标题（可被编辑器输入框替换）+ 信息位（来源 · 时长）+ 音量 / 倍速；波形行 = 当前时间 + 波形 + 总时长，行高固定，数据未就绪或不画波形时同位退回进度线，不跳高度。
  - 波形取真实峰值（不造数据）：时长 ≤ 30 分钟才解码，8kHz 单声道 OfflineAudioContext 离线解码，240 个峰值按宽度最大值池化，结果按持久化键 LRU 缓存 32 条；取数默认 `fetch(src)`，宿主可注入 `loadWaveformData`——desktop 本地文件走 `readBinaryFile`（`ltoh://` 未注册为可 fetch 的特权协议，渲染进程 fetch 不到）；任何失败静默退回进度线。
  - 通用能力与视频一致：悬停停留 400ms 出时间气泡（拖动立即）、快捷键 + 卡片中央 OSD（全屏 / 画中画 / 逐帧放行）、竖向音量弹层、统一倍速档位；续播沿用 `audio_position_` 存储前缀兼容旧数据，**1 分钟以内的音频不续播**。
  - 状态内置：src 为空即加载态（保留卡片、播放钮转圈、时长 `--:--`），LocalAudio / RpcLocalAudio 解析期间以空 src 渲染而非返回 null；播放失败在播放钮位显示警示、信息位说明原因（按 MediaError code），「重试」重新 load。
  - 文本生成：`sourceText` 提供时标题旁显示「文本生成」+「原文」，原文在卡片内展开（可选中复制）；编辑器音频块对 `isFromGenerate` 节点传入 `audioText`。
  - 标题就地编辑：常态即文字，悬停浅底，编辑时纸色底 + 细线 + 焦点环（常态与编辑同底色）。
- 不做：音频笔记播放器统一（用户明确不要）；章节刻度与 ±15 秒（C 的能力）；波形 Web Worker 化（30 分钟上限下主线程计算峰值约数十毫秒）。
- 影响：MediaPlayer 抽出音视频共用件——`useScrubber` / `ScrubTooltip`（进度条与波形共用的拖动 + 悬停延迟内核）、`useMediaKeyboard`（快捷键执行 / OSD / 静音切换）、`MediaOsd` / `ResumeNotice`；`videoShortcuts` 更名 `mediaShortcuts`（`resolveMediaShortcut`）；控件色板删除 `light`，只剩 `surface` / `float`；`usePlaybackResume` 增 `prefix` / `minDuration` 选项；新增 `useAudioPeaks`（`computePeaks` / `resamplePeaks` 纯函数 + 单测）与 `Waveform`；编辑器 `AudioSlotProps` 增 `sourceText`；三端 LocalAudio 的播放位置持久化收进播放器。

## D-078 音频笔记功能整体移除（含数据库表）

（2026-09-30，已定；用户裁决）

- 背景：项目条目类型 `audio-note`（AudioNoteView 的转写 / 高亮 / 摘要 / 笔记视图、小宇宙 / B 站 / YouTube 音频抓取缓存及相关主进程 IPC handler）功能整体下线；移动端仅有 `soon: true` 占位，无实现。用户裁决全面清除，已有音频笔记数据不再保留访问入口。
- 边界（勿误删，均属其它功能）：编辑器通用音频块 `:::audio`（D-077 波形卡的宿主，TTS 配音 / 播客嵌入依赖）；共享转写链路（`transcription.ts` / `TranscriptionQueueManager.ts`，视频笔记与 Vibe Learning 共用）；播客（podcasts 表）、TTS、背景音；`RemoteAudioSelectModal` 组件本体（白板仍在用）；`remote-audio-cache` / `LocalAudio` / `useLocalPath`；`audio_note_chats` 历史表清理器与 parity 护栏。该历史表正文不再参与知识引用迁移，TS / Rust 同步移除其 messages 映射；桌面历史聊天退役后数据仅留备份，移动端沿用既有保留策略。
- 删除面：`audio_notes` / `audio_note_item` 两表（`check-schema-parity.mjs` 常量 65→63 / 104→103，两表登记 `REMOVED_TABLES`）；主进程 `tables/audio-note*.ts`、`xiaoyuzhou.ts`、`bilibili-audio-cache.ts`、`youtube-audio-cache.ts` 及其模块注册；渲染端 `AudioNoteView/`、`useAudioHandlers`、`commands/audio-note*.ts` / `xiaoyuzhou.ts` / `*-audio-cache.ts` / `audio-cache-progress.ts`、`useBilibiliAudio` / `useYoutubeAudio`；`EProjectItemType.AudioNote` 枚举成员与「添加音频」菜单、三音频弹窗接线；设置页缓存管理的 YouTube / Bilibili 音频两桶；移动端类型占位。`mockups/audio-player/` 是 D-077 波形卡播放器的方案对比 mockup（编辑器音频块，保留侧），不随迁删除。
- 附带重构：`database-event-transaction.ts`（xiaoyuzhou 事件的免事务豁免是其唯一用途）随迁删除，database 事件统一包事务；`project.ts` 删除项目条目时不再联动清理音频笔记。
- 旧库退役：桌面开库、下载校验、CLI 和移动端升级接入现有功能退役流程，实际删除两表及专属索引；删除前整库备份，失败回滚、恢复旧库后重新检测。存量音频项目节点删除，普通后代按原顺序提升并去重、更新 parents / projects；正文按移除的持有引用释放，仍有实体引用时保留。独立 FTS / 向量索引按退役节点记录清理，已复用 ID 的新文档保留，失败可重试。
- 文档守护：内置数据库 Skill 对账测试由内存 SQLite 读取表与列定义，包含虚拟表、排除影子表；字段及顺序须与实际 schema 一致，同步补齐存量文档缺失的 47 个字段。

## D-079 编辑器图片重做：暗房灯箱、上方属性条、全屏裁剪编辑器（覆盖图片块 / 行内图片 / 画廊）

（2026-09-30，已定；用户裁决）

- 背景：图片块悬停即在右上角弹出深色半透明操作条（压在图片上、6 个图标只有对齐有提示、对齐点一下轮换方向），选中后「再点一次」才预览；LocalImage 解析期间返回 null，块先塌陷再撑开；失败只剩破图标；说明文字与阴影写死 rgba；灯箱只有黑遮罩 + 左右切换，点图就关；裁剪弹窗是下拉 + 复选框 + react-icons 按钮，裁剪框与图片缩放两套拖动混杂，输出一律转 JPEG（PNG 透明丢失）。画廊三种布局各自挂一个 shared 的旧灯箱，行内图片悬停就有 8 个隐形缩放热区。
- 方案对比（`mockups/image-editing/`）：灯箱 A 暗房 / B 纸面；工具条 A 上方浮条 / B 下方停靠条；裁剪 A 就地 / B 全屏编辑器。用户选 **灯箱 A、工具条 A、裁剪 B**，行内图片与画廊一并纳入。
- 选择：
  - 交互原则（三种图片一致）：悬停不出任何控件；单击选中、双击进灯箱；只读下单击即预览；选中后 Delete 删除、Esc 取消。块级快捷键在 document 捕获阶段处理，但按键目标在浮层（`aria-modal`）或文本输入里时让行（`utils/keyboardTarget`）——否则灯箱里的 Esc / Delete 会被已选中的图片吃掉。
  - 属性条：抽出 `components/MediaToolbar`（上方浮出、放不下翻到下方、按下不抢编辑器选区；按钮带文字或悬停名称 + 快捷键），视频块同步换用。图片：对齐 / 宽度 50·75·100% / 裁剪 / 宿主动作（AI 编辑）/ 预览 / 更多；「更多」与块手柄菜单同一份条目（`resolveElementMenu`）。画廊：布局 / 编辑图片 / 预览 / 更多。
  - 缩放：四角等比 + 两侧拖宽，居中对齐时两侧对称伸缩，靠近 50 / 75 / 100% 吸附（`utils/mediaWidth`），拖动时显示「占比 · 像素」。
  - 组件状态：首次加载把显示图宽高写进节点（`naturalWidth / naturalHeight`），之后按比例占位、骨架淡出；失败显示路径 + 重试 / 替换；选中时拖入或 ⌘V 图片即替换（保留宽度、对齐、说明，作废裁剪）；说明就地编辑：悬停只加深文字色，编辑时不加输入框只有光标（与展示同一版式）。外观预设改吃主题尺度：圆角 `--tau-radius-*`、阴影 `--ed-shadow-card / lift / float`（新增 `--ed-shadow-lift`）。插槽契约新增 `onLoadError`（宿主回退地址也失败才回调）、`onDoubleClick`、`loading`、`draggable`。
  - 灯箱 `components/ImageLightbox`：文档内全部图片（图片块显示裁剪结果、画廊每一张、行内图片）按文档顺序，从点击处定位；滚轮以指针为锚缩放、放大后拖动、双击 适应 ⇄ 200%、← → + − 0、Esc；顶栏复制 / 下载，底部缩略条。固定深色不随主题。替换 `ImagesOverview` 与 shared `ImageGallery`（已删除）。
  - 裁剪 `components/ImageCropEditor`：自研，删除 cropperjs 与 shared `ImageCropper`。裁剪框 + 图片平移 / 滚轮缩放 + 角度拨盘 ±45° + 90° 旋转 + 水平翻转 + 比例（原始 / 自由 / 1:1 / 4:3 / 3:2 / 16:9 / 3:4）；几何是纯函数（`geometry.ts`，覆盖约束、旋转翻转、互转，含单测）。原图 `url` 永不改，裁剪参数 `cropTransform`（v2，按图片像素存，与视图无关）写回节点，再次裁剪从原图恢复；旧版 cropperjs 参数不解读、按原图重新开始。按原格式导出（PNG / WebP / JPEG 保持，其余出 PNG），上传失败留在编辑器可重试。
  - 导出链路：图片 Markdown 与 HTML 序列化改取 `previewUrl || url`，裁剪结果能导出（Markdown 表达不了裁剪参数）。
- 不做：灯箱「在文件夹中显示」（编辑器文件服务没有该能力）；就地裁剪（用户选了全屏编辑器）；画廊内单张图的裁剪（画廊图片编辑仍走「编辑画廊」对话框）。
