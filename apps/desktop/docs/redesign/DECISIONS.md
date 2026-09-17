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
