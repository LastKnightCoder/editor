# 决策记录（轻量 ADR）

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

- 承载 = app 壳层挂载的 feature 级浮层（`features/search/SearchPalette`，fixed 定位，不经路由与页面栈；可 import `app/navigation.ts` 纯数据清单，与侧栏同源）。交互定稿 = mockups/search/ 方案 A「统一混合面板」+ 用户追加（类型多选、前缀追加、全角冒号、退格删筛选、IME 组合中不改写）。
- Esc 仲裁收口 PageProvider：浮层退场注册表（`useOverlayDismiss`，Map 保序 LIFO）——Esc 先关最上层浮层，优先于编辑上下文与后退；Ctrl+K/P 面板自监听 toggle。命令源 = navigation.ts 全量 + 已接线动作（不造假）；内容检索复用 legacy searchHybridContent 管线（react-query 防抖，未配 embedding 走 FTS）；空态「最近访问」来自 searchStore（localStorage `tau-search-history`；不复用旧 useNavigationHistoryStore——绑旧 TabType）。
- 追记（同日用户裁决）：结果区改**相关性平铺**（命令置顶，内容不分组不收起）；摘要提取用双端同构 `utils/richTextText.ts`；主题动作为深浅直切（不循环 system）。
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
- 验证：`src/ui/__tests__/cn.test.ts` 守护①词表与 tokens.css 的尺度词一一对应（新增 token 漏登记即红）②合并语义（同类覆盖取后者、字号与语义色不相残）；样板间 IconButton 档案目验 27/30 两标本图标共线。

## D-009 档案内标识块底色回正：代码 chip / 路径徽标 → surface 亮底 + 描边

- 缺陷：定稿稿（`mockups/showcase/plan-a-inspector.html`）里代码 chip 与路径徽标都是"比周围亮"的浅底药丸，实现却落 `bg-sunken`（最深档）——D-006 把 group/sunken 沉到 page 之下时没复核这两处归类，行内小药丸因此变成重色块（用户观感「代码块颜色太深」）。补一步验证又发现：改投 `bg-group` 只是「浅一点的褐块」，在深色主题下几乎融进 page（chip #19150e vs page #221d16），既没达到定稿稿的亮底观感、也读不清。
- 选择：代码 chip（MatrixRow 说明、API 表）与 DocHead 的 src 徽标统一为 **`bg-surface` + `border-line-1` 描边**——与 D-007 表单控件「亮底+描边=浮起物」同一语言，浅色下是白药丸、深色下比 page 亮，两种主题都显形；`bg-sunken` 退回「进度轨道 / 凹陷画布」专档，`bg-group` 只服务 group 语义（kbd 提示、徽章、标签、次级按钮、EmptyNote）。
- 排除：调 `sunken` 取值——治不了「把最深档用在文字行内」的归类错；统一透明底+描边——在白卡内的 chip 会与卡片底同色，失去药丸感。
- 验证：`theme-parity.test.ts` 补 `ink-1` 对 `bg-group` ≥ 4.5（更严，次级按钮场景）；02 §2.3/§2.5 措辞同步；样板间双主题目验代码 chip 与 src 徽标（浅色 #fffdf9 / 深色 #2e2820，均带 line-1 描边）。

## D-010 Menu 基础件：方案 B「现代产品」形制 + 复合组件 API + useListNavigation 抽取

- 背景：Menu 三方案设计稿（`mockups/menu/`，A 经典桌面 / B 现代产品 / C 密集工作台，同内容共行为只换皮），2026-09-17 用户裁决方案 B。技术底盘非分歧点：定位复用 D-004 引擎（`computeTooltipPosition` gap 4，主层 bottom-start/end、子层 right-start 锚父项、右键锚 = 命中点 0 尺寸虚拟 rect），Esc 走焦点链 LIFO 不进 D-003 注册表（同 D-007 Select 口径：子菜单 → 主菜单 → 关闭还焦触发器）。
- 选择：① **形制 = 方案 B**——行 34px 药丸（rounded-tau-sm + 2px 行距）、勾选 = 显式控件（15px 方框填 accent / 圆圈内点）、快捷键 kbd chip（surface 亮底 + 描边，D-009 口径）、danger 高亮实心红底反色字、图标随需出现无图标不留空位；② **API = 复合组件**（`Menu.Item/.CheckboxItem/.RadioGroup/.RadioItem/.Submenu/.Separator/.Group` + `ContextMenu` 右键承载，trigger 克隆注入）——菜单项是异构序列（命令/开关/单选/分隔/子菜单），数据驱动必须发明 DSL；**D-007 的「数据驱动」是 Select 单选语义下的裁决，不外推到 Menu**；③ **语义分界**：命令项触发即关整树、checkbox/radio 触发不关（连续操作），danger 不做二次确认（确认归 ConfirmDialog、撤销归 Toast，D-003 家族分工）；④ **useListNavigation 抽取**（D-007 预告兑现）：环游移动/边缘直达/type-ahead 三段纯逻辑成 `ui/primitives/useListNavigation.ts`，Select 与 Menu 共用；抽取顺手修复 Select 存量隐患——全 disabled 序列 + 方向键原实现会死循环（do-while 回不到起点 -1），hook 改计数守卫环游。
- 排除：A/C 形制（行高/勾选/danger/图标列四维度必须整体三选一，拼盘必割裂）；数据驱动 API（上述）；子菜单进场动画（动态挂载两帧动画换不来可感知收益、换来测试与时序复杂度，主层动画保留 160ms fade+位移已够）；子菜单嵌套超一层（可渲染但不测，YAGNI）；菜单内搜索（长清单用 LIMIT 渐进）。
- API 补充：`Menu.Submenu` 支持 `disabled`，已展开的头项再次点击收起并还焦父层；`ContextMenu.className` 与 `Menu.className` 一致，控制浮层，内容区尺寸由 children 的真实元素承担。type-ahead 只读取声明树中的文本，不执行自定义组件以提取其渲染结果。
- 运行时：`useMenuTree` 统一维护整树关闭、容器登记、外点和跨实例互斥；关闭回调读取最新 props。任意层 Tab/Shift+Tab 关闭整树，还焦触发位置后保留浏览器默认焦点移动；子层键盘事件不重复驱动父层导航。
- 验证：`__tests__/Menu.test.tsx` 覆盖触发即关/开关不关/radio 互斥/子层键盘与退场/Home·End/受控开合与回调更新/禁用子菜单/外点/右键/全局单开互斥；`__tests__/useListNavigation.test.tsx` 守护导航边界，`select.test.tsx` 守护复用回归；样板间「Menu · ContextMenu」档案提供 LIVE 标本、状态矩阵与 API 备忘。

## D-011 Dialog/ConfirmDialog 基础件：方案 B「现代产品」形制 + 三件嫁接

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

## D-014 Popover 基础件：方案 B「现代产品」形制 + 浮层公共底盘抽取（useAnchoredPosition / FloatingArrow / mergeRefs / useLayerDismiss）

- 背景：Popover 三方案设计稿（`mockups/popover/`，A 经典桌面 / B 现代产品 / C 密集工作台，同内容共行为只换皮），2026-09-18 用户裁决方案 B。设计稿同步回答「与 Tooltip 能抽多少公共」：定位引擎早已公共（D-004），真正的账在引擎之外——定位跟随 useLayoutEffect / 箭头几何 / ref 合并在 Tooltip、Menu、Select 三处各有一份近似实现，Popover 是第四消费者，按「两例交集才抽」（D-007 原则）本次一并兑现。家族分工：Tooltip 瞬态说明（hover/focus、不可交互）、Menu 命令面板、Select 表单值选择、Dialog 模态决策、Toast 回执；Popover 收「点击触发、内容可继续操作」的非模态浮层。
- 选择：① **形制 = 方案 B**——无标题栏内容卡（surface + line-1 + radius-lg + shadow-float）、头行随需（icon 圆底 + 标题 + ghost ×，色板/成员卡可无头行零框架税）、footer 随需（hairline 之上按钮右对齐）、8px 菱形箭头 surface 档（与 Tooltip 同几何）、进场 translateY(4px)+scale(0.98) 160ms 方向随 flip——与 Menu B/Toast/Dialog B 同一浮层语言；② **API = 复合组件**（`Popover.Header/.Body/.Footer` + trigger 克隆注入）——内容任意（说明卡/过滤器/色板/成员卡），数据驱动无 DSL 可言，同 Menu 复合裁决不外推反例；③ **行为**：click toggle 内建（hover 说明归 Tooltip、右键归 ContextMenu，不设 trigger props）；定位 D-004 引擎 **placement 12 向全表的首个消费者**（gap 8、宽随内容 180–340、无 matchTriggerWidth 概念）；Esc 焦点链 LIFO（同 D-007/D-010/D-011 口径，不进 D-003 注册表）；Tab 移出即关（非模态不圈闭，还焦触发器后浏览器续移）；初始焦点落 `data-autofocus`（无则卡片自身）；受控 open（§5.3）。
- 公共底盘四件抽取（同提交兑现）：① `tooltipPosition.ts` → **`anchoredPosition.ts`**（函数更名 `computeAnchoredPosition`，Tooltip/Menu/Select/测试引用点同步；`TooltipPlacement` 等类型在 Tooltip.tsx 保留别名，存量引用不动；箭头投影写入 `applyArrowPosition` 与 ARROW_SIZE/ARROW_TIP_OFFSET 常量同住引擎文件，组件文件只导出组件）；② **`useAnchoredPosition`**——三处同构的「双遍进场定位 + scroll(capture)/resize rAF 合并重算」收口，Tooltip 特有的 rAF 轮询动态锚参数化为 `pollAnchor`，Select 的 minWidth 写入走 `onPlace` 回调，内容尺寸变化经 ResizeObserver 自适应重定位（评审修正：初版以内容 props 做 `deps`，父级无关 re-render 也会换 identity 导致整个生命周期重挂，改为观察浮层自身尺寸，jsdom 无 RO 静默跳过）；③ **`FloatingArrow` + `applyArrowPosition`**——箭头几何与投影写入组件化，配色两档（tooltip 反相 ink-1 / surface 亮底），宿主约定 `group/float` + `data-side`；④ **`mergeRefs`**——三处克隆注入的 ref 合并收口。有意不抽两件：hover intent（Tooltip 特有瞬态意图判定，click 语义无对应物）、触发器事件注入（hover+focus 与 click 键盘开合事件集不同，合并即「参数选模式」复合体）。
- **useLayerDismiss（登记制外点仲裁）**：外点关闭（pointerdown capture）+ 嵌套链（子层触发器落在哪个已开层 DOM 内即为其子层，Portal 兄弟无法 contains 判定）+ 顶层互斥（开新层关非祖先链层）+ **层序分配**（登记时按全局开合序递增 zIndex：React 深度优先提交让嵌套浮层的 portal 先于宿主插入 body，同 z-[250] 时 DOM 靠后者绘制在上、子层反被父层盖住——2026-09-18 用户实机反馈「高级选项被一级盖住」；内联 zIndex 覆盖静态基线，后开恒在上，Dialog 340 / Tooltip 300 不走本表不受影响）。消费者：Popover/Select 走 hook；**Menu 的 useMenuTree 卸下外点监听与 activeMenuClose 互斥单例**——两套监听并存时同一 pointerdown 双关，受控 onOpenChange 会收到两次回调（测试实测），职责单化到 dismiss 层；MenuSurface 逐层登记（主层 isAnchor+getAnchorEl 传根触发器、子层 getAnchorEl 传父项），useMenuTree 只剩受控 open 与整树关闭还焦。useMenuTree 的 registerContainer 容器登记随之删除（子层自身即独立层，链判定取代容器集合）。
- 迁移口径（antd Popover）：`trigger="hover"` 用法迁 Tooltip、`trigger="focus"` 逐例复核（focus-visible 显示归 Tooltip）；placement 12 向同名直映；title/content 二分对应 Header/Body；04 删除清单随锚点事件补章节。
- 影响：`ui/primitives/`（Popover.tsx 新增；anchoredPosition.ts 更名；useAnchoredPosition/FloatingArrow/mergeRefs/useLayerDismiss 新增；Tooltip/Menu/Select 改造为消费者）、`__tests__/`（tooltip.test.ts → anchoredPosition.test.ts 更名、popover.test.tsx 新增）、样板间「Popover」档案（Dialog 之后，四种头行形态 + 嵌套链演示）、03 指南 §2 目录树 primitives 补齐 / §5 Popover 使用边界 / §9 任务 2 勾选、`mockups/popover/plan-b-modern.html` 已标注定稿口径（A/C 留档对照）。Popover.Body 滚动条：thumb 走全局 4px 细墨条（Dialog 的 track 间距/圆角专属形制勿外推，D-012），但**距右缘 4px 的透明右边框挤位手法扩展到 Popover**（2026-09-18 用户实机反馈：滚动条贴容器右缘）——D-012「勿外推」收窄为 thumb 形制不外推，右缘内缩是浮层滚动区的通用口径。
- 验证：`__tests__/popover.test.tsx` 11 例（开合 aria 与 labelled-by 接头行 · data-autofocus 初始焦点 · Esc 两处消费不冒泡还焦 · Tab 放行默认行为 · 触发器键盘开合 · 外点/浮层内点击/× · 嵌套链不误伤 + Esc LIFO · 顶层互斥 · 受控 open · 箭头 prop）；既有 65 例回归全绿（Menu 65→58 内含子层链路经 dismiss 层重验）；tsc 0 错误；样板间双主题目验。

---

## Page 迁移清单（M2 起滚动勾选）

> 33 个 TabType 的完整映射与合并方案见蓝图 §5.3，此处只跟踪迁移状态。

- cards 卡片库（M2 样板域，第一个）
- card-detail 卡片详情
- library 知识库（documents/pdf/vec 合并）
- ~~articles 文章~~ ✅ 2026-09-19 A3 月刊落地（D-015）
- feed 订阅/稍后读
- projects 项目
- learning（vibe-learning + flashcard 合并）
- schedule（calendar + time-record 合并）
- diary 日记
- whiteboard 白板
- weread 微信读书
- resources 资源管理
- chat 归位 feature
- settings 拆解（15 子页）
- home 首页看板
