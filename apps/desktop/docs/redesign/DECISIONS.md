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
- **RowDetailModal 保留 CustomModal 壳**：其全屏展开（覆盖标题栏、px-12 版式）是 Dialog 尺寸体系外的高度自定义表面，为不重构展开特性而保留自建壳（壳本身无 antd）；内部确认弹窗/图标/灰阶已换 tau。ViewTypeSelectModal / ColumnEditModal 已迁 Dialog。
- select 选项色：`constants/select.ts` 的 per-theme rgba 色表删除，`SELECT_COLORS` 七色词与 Tag 七色板恒等映射，展示统一 Tag（D-021 语感）；颜色修改走 ColorSwatch。
- `theme: "light"|"dark"` prop 线保留：CellPlugin 的 Editor/Renderer 契约含 theme，清签名属数据契约变更，超出换皮边界；组件内已不再消费。
- `editor-extensions/database/index.module.less` 保留：拖放视觉（drop-common/drag-common）是全部 editor 扩展共享的存量惯例，仅将包装层颜色换 `--tau-*` 变量，随 editor 域迁移一并清理。
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

## Page 迁移清单（M2 起滚动勾选）

> 33 个 TabType 的完整映射与合并方案见蓝图 §5.3，此处只跟踪迁移状态。

- ~~cards 卡片库（M2 样板域，第一个）~~ ✅ 2026-09-20 A1 卡片墙+时间分组落地（mockups/cards 七轮评审定稿；CardDatabaseView 提升至 components 共用，04 清单 §cards）
- ~~card-detail 卡片详情~~ ✅ 2026-09-20 A 素卡 v2 落地（mockups/card-detail 三案评审 + 二轮反馈定稿：⋯ 菜单回卡头时间右侧、连接区有关联才渲染、暂不做闪卡关联与图谱入口、面包屑无速切器；预览弹窗「进入详情」接线 navigator.push）
- library 知识库（documents/pdf/vec 合并）
- ~~articles 文章~~ ✅ 2026-09-19 A3 月刊落地（D-015）
- feed 订阅/稍后读
- ~~projects 项目~~ ✅ 2026-09-23 C 学习驾驶舱落地（D-031；project-detail 占位，三型工作台待迁移）
- learning（vibe-learning + flashcard 合并）
- schedule（calendar + time-record 合并）
- diary 日记
- whiteboard 白板
- weread 微信读书
- resources 资源管理
- chat 归位 feature
- settings 拆解（15 子页）
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

- 背景：project-detail 需承载三型工作台（文档树 / 数据表格 / Vibe Learning）。用户裁决（2026-09-23）：**以新版为准**——不造新版不需要的 Context/桥、不迁就 legacy（/legacy 详情可断，编译通过是唯一硬要求）、组织架构按新版合理方式（业务归业务域，不把业务塞共享层）、尽可能复用、不改功能不换皮；违规先指出后处理。
- 选择：① **归置**——ProjectView（三型分派 + 文档树 + 八型 item 视图，72 文件）与 VibeLearningView（40 文件）整目录 `git mv` → `features/projects/components/`；跨域件提升：EditPdf + EpubReader → `@/components`（library 域将来复用）、InsertNoteToTreeModal + LoadingSpinner（白板/Feed/扩展笔记消费）、VideoNotePanel 闭包 9 文件 + extensions（白板嵌入视频笔记——**功能保留不删**，白板未迁移≠可删用户否决删子功能提案）、projectTree / mindMapTreeUtils → `@/utils`（batch-export / DocumentView 跨域消费的纯树工具）；② **传参**——不伪造 TabProvider 桥：入口 props 化（ProjectView `{projectId, itemId?}`、VibeLearningView `{projectId}`）、ProjectList 改读 ProjectContext，useTabParams 消费清零；③ **legacy 清理**——TabContent 删 ProjectView lazy 与 `case TabType.ProjectDetail`；`useTabStore(navigateTo)` 残留 7 处保留（新壳层下无效果但不崩溃，换皮时接 navigator）。
- 违规随迁清单（换皮阶段处理）：antd 约 51 文件 / @ant-design/icons 19 文件（棘轮只减不增）；4 个 `.module.less`；A2 视觉违反（antd 皮、硬编码边框色、横线）；`DataTableProjectView` 与 `TableProjectItemView` 同构重复（合并）；`batch-export`（utils）仍依赖 `@/pages/DocumentView` 的 documentTree（知识库域迁移时收编）；`hooks/useDynamicExtensions`、`editor-extensions/ProjectListSlate` 引 features 域的 ProjectContext（hooks→features 无明文红线但方向倒挂，项目域 editor-extensions 归位时处理）。
- 实现：薄壳 `views/ProjectDetailView.tsx`（判存在 + usePageBreadcrumb 项目标题 + 渲染 ProjectView）；文档同步 04 清单 §projects（ProjectDetail 分支删除登记 + 提升件消费者表）与 03 指南 §1/§2。验证：tsc 全绿（含 src-electron）、搬入目录 eslint 0 error（存量 warning 随迁不修保 rename）、vitest 36 例全过（含随迁的 InsertNoteToTreeModal / VideoNotePanel / projectTree 测试）。
