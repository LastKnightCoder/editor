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

---

## Page 迁移清单（M2 起滚动勾选）

> 33 个 TabType 的完整映射与合并方案见蓝图 §5.3，此处只跟踪迁移状态。

- cards 卡片库（M2 样板域，第一个）
- card-detail 卡片详情
- library 知识库（documents/pdf/vec 合并）
- articles 文章
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
