# 决策记录（轻量 ADR）

> 每条决策一行式：背景 → 选项 → 选择 → 理由 → 影响。回看时能知道"当时为什么这么定"。
> 状态：`已定` / `待确认` / `已推翻`（推翻必须写理由，不允许无意识翻烧饼）。

---

## D-001 新架构基于声明式页面协议（原命名 Surface，已改 definePage）`待确认（蓝图已详述）`

- 背景：Tab 系统导航/状态/渲染纠缠（useTabStore 1183 行 + TabContent 33 分支），切页丢状态是机制性的。
- 选项：A. 修补 Tab 系统（加 keep-alive 容器）；B. 移植移动端 definePage 五层架构为桌面 Surface 协议。
- 选择：B。
- 理由：移动端已验证同构方案（栈机纯函数可单测、Activity 保活、结果通道、声明式页面数据）；A 只是给烂根施肥。
- 影响：新增 `src/surface/` 框架层与 `src/features/` 域结构；旧 Tab 系统降级为 legacy 兼容层（蓝图 §3.5）。
- 注：命名与目录已于 D-016 全面改为 Page/`src/page/`；本条架构裁决本体不变。

## D-002 `--th-*` 语义 token 体系保留并升级 `已推翻（2026-09-14，用户裁决）`

- 背景：`src/styles/theme-colors.css` 已有 oklch + accent h/c/l 派生体系，packages/editor 在消费。
- 原选择：保留 `--th-*` 前缀与派生机制作为新设计系统 semantic 层（理由：编辑器桥接零成本）。
- 推翻理由（原话精神）：**不要使用已有的 token，彻底重构，旧页面失效也无所谓，反正每页都会完全重写**——新体系不背旧命名包袱。
- 影响与接管：见 D-008（全新 `--tau-*` 词汇表）、D-009（defineTheme 协议）。`packages/editor` 改为消费 `--tau-*`（自有包一次性改造）；旧文件在 M1 换壳时删除。渐进式迁移策略不受影响——旧页面样式靠 antd 自带体系，本就不依赖我们的语义 token。

## D-003 样式单轨制：Tailwind v4 语义类 `已定`

- 背景：Tailwind 原子类 / less CSS Modules / classnames 三轨混用（447/144/297 个文件）。
- 选择：新代码只写 Tailwind 工具类，且必须经 `@theme inline` 语义映射（`bg-page` 可以，`bg-[#f6f1e7]` 禁止）；CSS Modules 随 legacy 页面消亡。
- 理由：学移动端验证过的写法；语义类名让主题切换与视觉调整不动组件代码。

## D-004 图标库换用 lucide-react `待确认`

- 背景：antd 退场需连 @ant-design/icons 一起退。
- 选项：A. lucide-react；B. 自绘 SVG 集。
- 选择：A（16/20/24 三档、stroke 1.5）。
- 理由：线性风格统一、tree-shake、覆盖面广；自绘维护成本高。图标选用的口味变化记 PREFERENCES.md。

## D-005 导航方案 `待确认（推荐方案 4）`

- 背景：浏览器式 Tab 是否废弃。
- 选项：0 维持 Tab / 1 侧边栏 / 2 侧边栏+master-detail / 3 自由多面板 / 4 侧边栏骨架 + 页内 master-detail + 受控分屏逃生舱。
- 推荐：4。理由与对比见蓝图 §4；线框对比见 `mockups/index.html`。

## D-006 设计方向（三选一或混搭）`待确认`

- 候选：A 暖纸工作台 / B 石墨工作台 / C 墨韵编辑部，见 `mockups/`。
- 定稿后：取值回填 02 规范 §2.2，落选方案归档 `mockups/archive/` 并在 PREFERENCES.md 记反例要点。

## D-007 antd 退场采用棘轮机制 `已定`

- 禁止新增 import（eslint no-restricted-imports + 存量白名单），页面迁移时白名单自动缩短，M5 移除依赖。禁止"先全量替换再上线"的大爆炸。

## D-008 token 体系全新切割：`--tau-*` 词汇表，不继承旧 `--th-*` `已定（2026-09-14，用户裁决，推翻 D-002）`

- 背景：新设计系统的 token 前缀与词汇从哪来。
- 选项：A. 沿用 `--th-*`（改名代价小）；B. 全新 `--tau-*` 词汇表，与移动端词汇对齐（`bg-page / ink-1 / line-1 / ok …`），两端同词汇各自取值。
- 选择：B。旧 `theme-colors.css` 不迁移不复用，M1 删除；旧页面"失效"可接受（样式层零妥协）。
- 理由：不背历史包袱；词汇与移动端对齐降低双端心智；样板间 demo 本来就用的这套词汇（bg-page/ink-1/…），定稿后直接转成首个 theme 文件。
- 影响：`packages/editor` 消费 `--tau-*`（自有包，M0 一次性改造，必要时临时桥接 M2 前拆除）；tailwind `@theme inline` 映射按新词汇重建；渐进式迁移不受影响（旧页面靠 antd 自带样式）。

## D-009 主题采用 defineTheme 协议 `已定（2026-09-14，用户提出，已细化）`

- 背景：主题不能再是手写 CSS 块的堆叠（旧 theme-colors.css 模式），要延续 defineXxx 哲学。
- 选择：`ui/themes/*.theme.ts` 一个文件声明一个主题（key/mode/palette/tokens 映射函数/氛围），`tokenContract` 为词汇单一事实源；编译期 codegen 生成 `[data-theme]` CSS + 注册表清单；对比度不过 AA 构建失败。
- 理由：漏 token 编译不过（杜绝补丁复发）；派生逻辑显式可读可单测；新增主题零登记表；运行时仍是 data-theme + CSS variables 零 JS 切换；未来可平滑支持用户自定义主题。
- 详见：02-UI设计系统规范 §2.2。

## D-010 壳层采用融合骨架 + A2 柔和版为视觉基准；代码初版落地 `已定（2026-09-14）`

- 背景：用户对样板间三轮校准（割裂感→融合骨架；硬切横线→去线柔和；宽度浪费/首页空洞→宽容器+丰满布局；收起态图标遮挡→同位镜像反转）。
- 定案：侧栏透明整高贯通、标题栏/状态栏只属右列、零横线分组、宽容器（窄列仅正文阅读列）、今日页丰满布局。视觉基准 = mockups/direction-a-soft.html（A2）。
- 落地：surface 框架 + defineTheme + AppShell + 今日页已写入 `apps/desktop/src/{app,surface,ui,features}/`，挂载 `#/shell`，tsc 绿。**后续开发以 docs/redesign/03-架构实现指南.md 为权威交接文档。**

## D-011 新页面数据层统一 react-query `已定（2026-09-15，评审修复裁决）`

- 背景：初版首页/统计页手写 useState+useEffect 拉取，绕过了已有的 react-query（Provider 在 main.tsx 全局挂载，旧首页本就在用）：无缓存失效、无聚焦刷新、每域各养一份手写 hook。
- 选择：`useQuery` + 按 query 开启 `refetchOnWindowFocus`（全局默认关），协议样板见 03 指南 §3「新增页面数据」。
- 理由：蓝图防线二"query 缓存 = 服务端状态单一事实源"的兑现；卡片域（M2）开工前定案，样板写法将被后续 14 个域复制。
- 影响：禁止新页面手写 useEffect 拉取（已固化进 AGENTS.md）。

## D-012 主题取值改 `[data-theme]` CSS 数据块 + 首帧预置脚本 `已定（2026-09-15，评审修复裁决）`

- 背景：初版 applyTheme 逐变量 JS 注入，首帧（React 加载前）无主题色闪变；且与 D-009 声明的"data-theme + CSS variables 零 JS 切换"不符。
- 选择：tokens.css 内 `[data-theme="<key>"]` 数据块承载取值；index.html 内联脚本在 React 前按 localStorage 预置 data-theme（无记录用默认主题）；applyTheme 只切属性 + 持久化。
- 理由：兑现 D-009 的零 JS 切换；首帧零闪变；手工同步期由 theme-parity 测试守护 CSS 块与 defineTheme 产物一致，codegen（03 §9 任务 7）落地后测试退位给生成产物。
- 影响：新增主题必须同时补数据块（已固化进 AGENTS.md 与 03 指南 §3）。

## D-013 样式载体：Tailwind 优先 + 语义化类名，废弃模板导出工作流 `已定（2026-09-15，用户裁决）`

- 背景：壳层/首页初版样式经 mockups HTML 模板"脚本导出"为 shell.css（119 类）+ 域内 CSS（home.css/stats.css），存在三个问题：①导出脚本未入库，"先改模板再导出、禁手改"流程不可复现，规范与现实脱节；②类名非语义化且强依赖模板 DOM 结构（board/nav-item/todo-row…）；③与 D-003"新代码只写 Tailwind 语义类"单轨制自相矛盾（03 §4 却规定不自创 Tailwind 视觉类）。
- 选择：样式载体改为 **Tailwind v4 工具类优先**——颜色走既有 `@theme inline` 语义类（bg-page/text-ink-1…），尺度（字号/圆角/阴影/缓动）补进 `@theme` 用 `tau` 命名空间词（text-tau-\*/rounded-tau-\*/shadow-card/ease-tau-out，不覆盖 legacy 在用的默认刻度）；一次性展示字号（热力图轴标/统计大数字）允许 `text-[24px]` 类任意值；跨域复用视觉模式收口为 `ui/` 组件（Panel/IconButton…），组件内写 Tailwind。
- CSS 保留白名单（仅四类，逐例裁决、默认不许）：`.app` 作用域全局 reset（base.css）、@keyframes（经 `--animate-*` 消费）、主题数据块（tokens.css，D-012 机制不动）、Tailwind 表达不了的个别复杂伪元素/全局状态。
- mockups HTML 降级为视觉参考（浏览器对照截图），不再是导出源；调视觉直接改组件。D-010 视觉基准（A2 柔和版）地位不变，仅维护方式变更。
- 推翻：03 指南 §4"组件 className 与模板类名 1:1 / 禁手改 shell.css / 先改模板再导出"；shell.css 约 90 个无消费者的预置模板类（palette-\*/card-\*/detail-\*/btn-\* 等）直接删除，将来做对应页面时用 Tailwind 语义类重写。
- 影响：AGENTS.md「UI 与主题」、03 指南 §2/§3/§4、02 规范 §3/§5.4、redesign/README 同步更新；tokenContract 语义词（bg-surface/bg-hover 等）全局唯一归属 `--tau-*`（tailwind.css 旧手写同名类删除，经核实零有效消费者）。

## D-014 主进程模块去窗口耦合：应用级模块统一 BACKGROUND `已定（2026-09-15）`

- 背景：主窗口从 ContentLayout 切到 AppShell（`ba3ac036`）后不再调用 `module-init:init-for-window`，而 39 个 ON_DEMAND 模块的初始化**只**由该入口（「窗口类型 → 模块组」）拉起，handler 全部未注册。表现为启动 5s 后 `updater:check` 报 "No handler registered"；其余模块要等用户点到对应功能才暴露，并存在静默失效（`useWeReadSessionBootstrap` 以 `useModuleStore` 的模块状态为门槛，而该镜像只由旧主界面的初始化流程刷新）。
- 选择：39 个模块统一改 `layer: BACKGROUND`，随应用启动后台并行初始化；`InitLayer.ON_DEMAND` 机制保留，当前无成员。
- 理由：实测这 39 个模块的 `init()` 只做注册 handler 与建目录（22 个纯注册、12 个轻量、5 个带延后机制），无一在 init 发起网络；把初始化绑在「窗口类型」上是错误抽象——模块本身与窗口无关，主窗口一换入口就全线失守且无告警。归入 BACKGROUND 后，初始化不再依赖任何调用方。
- 连带修复：`initWebSocketDependentModules` 原先绕过管理器直接 `publishModule.init()`（BACKGROUND 化后会二次注册 handler 抛错），改走 `initModule("publish")` 复用「已就绪即跳过」；`useWeReadSessionBootstrap` 改为自行 `ensureModule("weread")`，不再依赖状态镜像。
- 防线：渲染端 `ensureModule`/`withModule`（`commands/module-init.ts`）统一了原先 4 处各自为政的懒初始化实现；`module-init/__tests__/module-layering.test.ts` 守护「ON_DEMAND 模块必须有渲染端兜底」。
- 影响：AGENTS.md 新增「主进程能力」小节；03 指南新增 §2.5。

## D-015 深色主题 cocoa + 模式运行时照搬移动端 themeStore `已定（2026-09-16）`

- 背景：主题体系仅有 cream（浅色），无深色主题、无切换入口；`theme.ts` 的 `initTheme()` 硬编码 cream，会覆盖 index.html 预置的 localStorage 值（现存 bug）；parity 测试硬编码 cream 无法守护新主题。
- 选择：① 深色主题 `cocoa`「暖纸·夜」——延续 cream 暖调基因（深可可纸底/奶油墨/陶土橙提亮），层级与浅色对称翻转（surface 最亮、sunken 最暗），不采纳中性冷灰方向（PREFERENCES.md 暖纸偏好）；② 模式模型照搬移动端：`mode: 主题 key | "system"` + resolved 派生 + prefers-color-scheme 仅 system 跟随 + localStorage 持久化；③ 入口 = Titlebar 循环按钮（浅→深→跟随系统，icon 反映当前态），完整外观设置留 M5 设置中心；④ 持久化走 localStorage（首帧防闪内联脚本必须同步读；跨端同步后续需要再桥 setting.json，不启用闲置的 settingCommands）。
- 连带修复：`initTheme()` 硬编码移除（AppShell 挂载改调 `initThemeRuntime()`，幂等应用 resolved，可恢复 /legacy 往返时 useSyncTheme 对 data-theme 的覆写）；`theme-parity.test.ts` 泛化为遍历注册表全主题 + 新增 02 §2.5 对比度指标的 WCAG 断言；cream 三处取值微调达 AA（accentLight 55→42、accent-text→#a05236、ink-2→#736552；原值 accent 实底对 ink-inverse 仅 ~3:1、ink-2 对 bg-page ~4.4:1）——**对比度硬指标优先于 mockups 原取值**；深色首帧防闪白补 `base.css` 的 `html { background: var(--tau-bg-page, …) }`。
- 手工同步点（codegen 统一前）：新增主题需同步 `themeStore.ts` 的 ThemeMode 联合、`index.html` 首帧脚本白名单、`theme.ts` 默认 key 常量。
- 影响：03 指南 §1/§2/§3、02 规范 §2.4 已同步；AGENTS.md「UI 与主题」补模式切换约定。

## D-016 Surface 协议全面更名 Page 协议；kind（dialog/drawer）移出 definePage `已定（2026-09-16，用户裁决）`

- 背景：D-001 落地后作者侧 API 为 `defineSurface`，与移动端 `definePage` 同构不同名（蓝图刻意区分）；用户明确不喜欢该命名，且认为 dialog/drawer 不应放进页面声明协议。
- 选择：① 词汇全面切换 Surface→Page——`defineSurface`→`definePage`、`*.surface.tsx`→`*.page.tsx`、`surfaces/`→`pages/`、`src/surface/`→`src/page/`、`SurfaceProvider`→`PageProvider`、`useSurface`→`usePage`、`SurfaceMeta`→`PageMeta` 等类型与注册函数同步更名、CSS 钩子 `data-surface-key/-id`→`data-page-key/-id`（git mv 保留历史）；② 删除 `kind: "page" | "dialog" | "drawer"` 字段与 `SurfaceKind` 类型——协议只承载页面，浮层（dialog/drawer）不经 definePage，承载方式待裁决（如启动 OverlayHost/浮层导航须先新增 DECISIONS 条目）。
- 理由：与移动端 definePage 同名同构，双端零翻译成本（对齐 D-008「两端同词汇」取向）；单一取值的 kind 字段无信息量（YAGNI），`definePage({ kind: "dialog" })` 语义自相矛盾；业务侧当时仅 home/stats 两处调用点，改名成本集中在框架内部与文档。
- 排除（撞名不同义，不随改）：主题 token `bg-surface`/`--tau-bg-surface`（D-013 语义词）、白板 `wb-node-surface-*`、报表模板 `--surface-alt`、移动端自己的 surface 词汇。
- 影响：01 蓝图 §3/§4/§5、02 规范、03 指南、04 清单、README、PREFERENCES、AGENTS.md 同步更名；D-001 追加命名注记。

## D-017 命令面板（全局搜索浮层）承载方式与 Esc 浮层仲裁 `已定（2026-09-17）`

- 背景：03 指南 §9 任务 3/4——Ctrl+K 命令面板落地；D-016 裁决 dialog/drawer 不经 definePage，承载方式待新增条目。交互定稿 = mockups/search/ 方案 A「统一混合面板」（用户裁决，多选筛选/前缀追加/全角冒号/退格删筛选均为用户追加需求）。
- 选择：① 承载 = app 壳层挂载的 feature 级浮层组件（`features/search/SearchPalette`，AppShell 内 fixed 定位渲染，不经路由与页面栈；`features/search` 允许 import `app/navigation.ts`——纯数据清单单一事实源，与侧栏同源不漂移）；② Esc 仲裁扩展收口在 PageProvider——新增浮层退场注册表（`useOverlayDismiss`，Map 保序 LIFO），Esc 先关最上层浮层、**优先于编辑上下文与后退**（面板输入框里的 Esc 同义关面板），落实 03 指南 §5「浮层接入后改为先关浮层」；Ctrl+K / Ctrl+P 由面板自身全局监听 toggle，Titlebar 按钮同源 `searchStore`；③ 命令源 = navigation.ts 全量 + 真实动作组（切换深浅主题）；**未接线动作不进面板**（不造假，新建卡片等随模块迁移补）；④ 内容检索复用 legacy `searchHybridContent` 管线（FTS+向量，react-query 防抖 250ms、limit 24、keepPreviousData），未配 embedding 自动只走 FTS；⑤ 空态「最近访问/常用」来自 searchStore 的页面访问记录（AppShell 随页面栈记录，localStorage `tau-search-history` 持久化），不复用 legacy `useNavigationHistoryStore`（其绑定旧 TabType，新架构记 page key）；⑥ 输入前缀「卡片:」追加语义、连续输入叠加、逗号多类、全角冒号、IME 组合中不改写（compositionend 后解析）——与 mockup 行为一致，该坑对后续所有含输入的浮层通用；⑦ 内容详情页迁移前，命中项与「查看全部」跳对应模块列表页（卡片详情页迁移后改跳详情）。
- 排除：Notion 式两层（方案 D 搜索中心）暂不做，留档 mockups/search/；toast 反馈待 ui/primitives 补 Toast 基础件后再加（当前跳转/执行直接生效）；「某类型最近内容」空查询态（模板展示该类型最近 8 条）v1 以输入引导提示代替——避免为空态全量拉表。
- 追记（2026-09-17，用户裁决）：结果区由方案 A 的「按类型分组 + 组尾『查看全部 N 条』深入条目」改为**相关性平铺**——命令组置顶，内容不分组、不收起，按检索管线返回的相关性顺序全部展开；深入条目与点击携带查询词的设计随列表页迁移时再议。摘要提取对齐移动端 unified_search/文章列表管道（`utils/richTextText.ts` 双端同构：Slate text 节点拼接 + 中文友好截断，无 Markdown 剥离；空内容兜底「类型 #id」）；卡片无标题以正文开头派生。主题动作「切换深浅主题」为深浅直切（不经 system 循环，避免空拍）。
- 已知限制（2026-09-17 评审）：legacy `searchContent` 管线 catch 后返回空数组，检索故障时面板展示「无结果」空态而非错误提示——错误态与空态混淆，待检索管线迁移（或 ui/primitives 补 Toast）时区分；`useOverlayDismiss` 注册表的 LIFO/优先级/注销语义由 `src/page/__tests__/overlayDismiss.test.tsx` 守护。Esc 仲裁与 Tab 焦点圈闭、关闭后焦点恢复到触发元素的完整收口，留待通用浮层基建（§9 任务 4）统一处理（面板已做最小版：关闭时焦点还回触发元素）。
- 影响：03 指南 §2（目录树 +features/search、PageProvider 职责）、§5（Esc 仲裁落定）、§9 任务 3 完成；tokens.css 补 `--color-overlay` 的 @theme 映射（token 协议四处同步完成：contract/两主题数据块/映射）。

## D-018 Tooltip 与浮层定位引擎选型：自研 JS mini 引擎（方案 B）`已定（2026-09-17，用户裁决）`

- 背景：02 规范 §5.2 裁定 Tooltip/Popover/Menu/Select 共享一个浮层定位引擎（M0 专项）。mockups/tooltip/ 出三路线交互稿（A 原生锚定 popover+CSS Anchor Positioning / B JS 引擎 / C 伪元素·title 凑合），Electron 43（Chromium ~150）实机验证后用户裁决定 B。
- 实测关键结论（留档，决定性）：① CSS 无 floating-ui 式任意 shift，`position-try-fallbacks` 只有 flip 族且候选「整块放得下才启用、全失败回首选位」；② `safe anchor-center` 语法可解析但布局异常（被误判溢出降级 start，Chromium 146 实测）；③ `[popover]` 的 UA 样式（`inset:0; overflow:auto; width/height:fit-content`）必须显式重置，否则 position-area 合成被破坏、出滚动条、箭头被裁——方案 A 的这三条保守性使用户倾向 B 的「策略可编程」。
- 选择：① `ui/primitives/Tooltip.tsx` = Portal（body + fixed z-[300]）+ 自研 mini 引擎（`tooltipPosition.ts` 纯函数：offset(8) → flip → shift(视口 pad 8) → arrow 投影），单测 8 例守护引擎数学；② 箭头 = 8px 旋转方块、尖端单角 2.5px 圆角、中心落边框外缘（-5px 补 padding-box 包含块差），top/bottom 描 right/bottom、left/right 描 left/top；③ 行为内建：hover intent 450ms + 400ms 内重开免延迟（组联动）、focus-visible、aria-describedby 自动接线、disabled 子元素自动包 wrapper、动态锚 rAF 跟随、scroll(capture)/resize 重算；受控 `open` 对齐 §5.3 契约；④ 反相配色复用 `bg-ink-1 text-ink-inverse`（深浅主题自动反相，零新增 token）；⑤ 不接 Esc、不进浮层退场注册表（瞬态非阻断，同 Toast 的 D-017 口径）；不承载可交互内容（那是 Popover/Menu）。
- 排除：方案 A 留档 mockups/tooltip/plan-a-native.html（若未来某组件 CSS 锚定足够，可局部评估，不动本条）；floating-ui 依赖不引入（引擎 ~100 行自研可测，够用再加）；方案 C（伪元素/title）禁入产品代码。
- 首批接入：stats 页（写作趋势受控模式 + 专注节律/到期柱图/构成与评分条），消灭该页全部原生 title。
- 影响：03 指南 §9 任务 2（Tooltip 完成，余 Button/Input/Select/Menu）；Menu/Select/Popover 后续复用 `tooltipPosition.ts` 引擎扩展中间件（size 同宽、虚拟锚点等届时再议）。
- 追记（2026-09-17，用户报告「下面的 tooltip 上来了、堆叠在一起」后修正两处引擎 bug）：
  ① **shift 中间件加闸门：锚点与视口不相交时完全不夹**。原实现无条件把 x/y 夹进视口，锚点滚出视口后 tip 被强行钉在视口边缘、与锚点脱钩——一屏多个离屏锚点全挤在同一条边上，即样板间 12 个常显 tip 的「堆叠上浮」。锚点离屏时让它自然跟随锚点离屏即可（几何上就不可见，无需额外的显隐态管理）。**闸门取"相交"而非"完全可见"**：锚点半露在折线外时仍照常夹，符合"贴边仍要可读"的本意。
  ② **flip 判空间改用主轴占位尺寸**：原实现上下位、左右位一律拿 `pop.offsetHeight` 比。左右位的主轴是横轴，应比宽度——横向明明放不下却被误判为放得下，于是不翻对侧、被 shift 钉在视口侧边压住锚点。
  两条都是纯函数缺陷，已在 `__tests__/tooltip.test.ts` 补 4 例守护（含闸门边界：锚点只要还与视口相交就照常夹）。
- 追记（2026-09-17，样板间侧）：Tooltip 档案的锚点由「`size-2` 示意圆点」改为**真实控件**（位置矩阵用 `IconButton` + Info 图标、内容形态用 `DemoButton`）——tooltip 的真实宿主就是按钮，圆点既看不出锚点尺寸对 flip/shift 的影响，也示范不了真实接线。

## D-019 组件样板间（组件检查器）：独立 Vite MPA + ui/primitives 真实现 `已定（2026-09-17，用户裁决）`

- 背景：主题重写后适配新页面前需要组件样板间（living style guide）对照审阅。mockups/showcase/ 三方案（A 检查器 / B 画廊 / C 主题对照台）+ 三轮视觉迭代（v1 全主题色但 ink-3 说明对比不足且舞台与展品同底；v2 中性工作台 `--wb-*` 因「白卡套色块」双层嵌套被否；v3 单层舞台+工作台明暗联动仍属主题外第二套配色被否）后定稿 v4「全主题色版」：配色零发明，层级 = page（环境）→ surface（画布卡/API 卡，即 Panel 视觉）→ sunken（展品舞台，token「沉底」语义）→ 展品，说明文字 ≥ ink-2（AA），排版直接用 tau 字号词表五档。
- 选择：① 承载 = 独立 Vite MPA——`showcase.html` + `src/showcase/`（kit 布局原语 + 8 个档案 sections + registry），`vite.config.showcase.mts`（端口 6199，`server.open` 自动开浏览器，无 electron 插件纯浏览器），script = desktop `showcase` + 根透传 `pnpm showcase`。不经 definePage/Page 协议（开发工具页非业务页面，不进导航栈）；② 展品一律 import `ui/primitives` 真实现，零样式复刻——瞬态锁定 = 直接施加 hover 视觉类（`className="bg-hover text-ink-1"` 常驻），Tooltip 常显标本 = 受控 `open`（引擎实时定位，滚动同步跟随），Toast 常显标本 = `ToastPill` 本体构造 duration=0 的 item；③ 样式全 Tailwind 语义类（D-013），唯一 CSS 入口 `showcase.css`（tailwind + tokens.css + base.css，刻意不引主入口 tailwind.css 的 legacy theme-colors）；④ 主题复用 themeStore（`initThemeRuntime`，localStorage 与主应用共享偏好）；热力图为确定性伪随机演示数据（注明）。
- 排除：Storybook/Ladle（8 档案规模 YAGNI，03 指南 §9 落地路径原判）；mockup HTML 作为长期样板间（复刻漂移，降级为视觉定稿稿留档 mockups/showcase/）。
- 追记（2026-09-17，用户裁决，v5）：① 去掉展品背后的底色块——sunken 舞台与托盘底色、顶栏「展品底」四档切换一并移除（FloorContext 删除），层级简化为 page → surface 卡 → 展品，展品直接坐在 surface 卡上（Panel 靠 shadow-card 浮起）；② LIVE 标注行与演示内容间距加大到 20px（`stageClassName` 改为档案必填，顺带消除与默认类同属性争优先级的竞态）。
- 维护义务（防腐化）：新增/修改 primitives 或 token 时，同一提交在 `src/showcase/sections/registry.tsx` 与对应档案同步（新组件 = 新档案一行 + section 文件）；样板间与源码不一致视同文档腐化。
- 影响：`Toast.tsx` 导出 `ToastPill`/`ToastItem`（注释约定仅样板间消费，产品代码仍走 toast API + ToastHost）；03 指南 §9 任务 2 的配套审阅工具就位。

## D-020 样板间 v6：排版/配色重排 + Token 色板真实用法化 `已定（2026-09-17，用户裁决"对配色和排版都不满意，重构一番"）`

- 背景：D-019 定稿的 v4/v5 骨架在实机截图上暴露两类病灶。**配色**：① Token 档案的透明棋格用 `repeating-conic-gradient(…, transparent 0% 50%)` 衬底，`transparent` = rgba(0,0,0,0)，sRGB 插值把整块染成脏绿棋盘，是页面最刺眼的污染源，且把色芯本身压暗（accent 看着发黑）；② accent 全页只在 1.5px 装饰点上出现，页面读起来"米黄一坨、没上色"；③ `bg-group` 之于 `bg-surface` / `bg-page` 的亮度差不足（cream：#faf6ec vs #fffdf9 vs #f3eee2），EmptyNote、Loading 演示底这类"灰底行"基本看不见。**排版**：① 字号阶梯 9 档相邻仅差 0.5px，越挤的档位越该有强对比的地方反而没有；② 状态行说明只有 11.5px（micro）中文读起来吃力，且强制 `min-h-24`（96px）把 IconButton 四个状态拉到 700px 高——又长又空；③ 小节题用 11px uppercase + 0.09em 字距，uppercase 对中文无效，中英混排只剩"工程 README"气质；④ 内容限宽 1000px + 状态行第二列 1fr 拉满，展品左对齐后右侧大片空白；⑤ 行内 `code` 在状态行说明里没有代码样式，`bg-hover`、`size-[27px]` 与正文同形无法辨识。
- 选择（均在样板间自身范围内，不动主题取值、不动产品组件）：
  1. **棋盘格换两色实体**：色芯改 `linear-gradient(var(--tau-token), var(--tau-token))` 叠在 `repeating-conic-gradient(var(--tau-line-2) …, var(--tau-bg-surface) …)` 上，杜绝 `transparent` 参与插值；幅面 16px 降噪。
  2. **色芯按真实用法渲染**（TokenSection 的 kind 三分）：`fill` 涂色块、`text` 直接用该墨色渲染"文字示例"（比色块更能回答"够不够黑"）、`line` 放大成 3px 条（1px 发丝线在该尺度不可见）。色值全部经 CSS 变量内联，切主题零重算。
  3. **accent 升为容器锚点**：LIVE / API 卡的标注行 = accent 实心点 + accent-text 标签（cap 与说明拆成两个 prop，说明退为 ink-3 小字），全页因此有稳定的暖橙出现位；表面依旧中性，颜色仍只表意（不违反 02 §1 视觉宪法）。
  4. **排版重建**：状态行去 `min-h-24` 改内容撑开（py-3.5 + 展品区 min-h 60px），左列 230px、说明抬到 12.5px 并补行内 code 样式；小节题改中文 semibold 主 + 英文 mono 副（`en` prop），去 uppercase 与大字距；档案内容去掉页面级限宽（改由 DocHead 的 74ch / Note 的 80ch 逐段限宽），API 表单独 `max-w-[860px]` 防宽屏拉伸；**说明性正文下限 12.5px**，11.5px 只留给角标、token 值与图注。
  5. **CanvasCard `stage` 双模**：`card`（默认，白卡画布）/ `page`（无底色，展品坐 page 环境）。Panel 档案改用 `page`——展品本身是白卡，白卡叠白卡只能靠阴影分辨，这是 D-019 去掉 sunken 展品底之后遗留的自证缺口。
  6. **主题入口改三态分段**（浅色 / 深色 / 系统）：样板间的主要用途是配色对照，Titlebar 那枚循环按钮看完不知道当前在哪一档。分段控件轨道用 `bg-sunken`（`bg-group` 做轨道时选中胶囊会消失在 surface 里）。Toast 档案的位置选择同款复用 `Segmented`。
  7. **侧栏保持"复刻真实 Sidebar"定位**：图标改回不指定颜色、随按钮色继承（原实现钉死 `text-ink-3`，激活态会出现灰图标 + 深标签的漂移），其余条目/激活态样式一律不动。
- 已知缺陷（本轮**只记录不修**，需用户裁决，均属主题/产品层而非样板间层）：
  - `bg-group` 与 `bg-surface`、`bg-page` 的亮度差不足，作为"分组底 / 次级填充"在两种底上都读不出来（正例对照见 Token 档案的 Background 组）。修它要动 `themes/cream.theme.ts` + `cocoa.theme.ts` + `tokens.css` + parity 断言，属全局调色板变更，影响 home/stats 已有页面，故不在本轮范围。
  - 真实 Sidebar 激活态 = `bg-hover`（5% 墨）+ 左缘 3px accent 竖点，"融合态"的代价是激活项在视觉上很弱（样板间如实复刻，未改）。若判定为缺陷，应改壳层而非样板间。
  - `ui/primitives/Panel.tsx` 的 `EmptyNote` 用 `bg-group`，在白卡内几乎不可见（同上第一条根因）。
- 排除：动主题色值（全局影响，另案）；多栏矩阵（宽屏下把状态行两栏并排）——档案条目数少、Tooltip/Loading 有宽展品，收益不抵结构风险，YAGNI；给 BlockTitle 加 accent 竖条——与侧栏激活态竖条语言重复，且属装饰性用色。
- 影响：`src/showcase/kit.tsx`（原语重写：DocHead/CanvasCard/BlockTitle/MatrixRow/ApiCard/Note 调整 + 新增 Segmented）、`ShowcaseApp.tsx`（壳层）、8 个 section 与 `TokenSection.tsx`（重做）同步；02 规范 §3 补"说明性正文下限 12.5px"一行。样板间维护义务与档案清单不变（D-019）。
- 追记（2026-09-17，版心三轮定稿）：本条目原定"去掉页面级限宽，改由 DocHead 74ch / Note 80ch 逐段限宽"——ch 在 13px 下只折出 **629 / 655px**，而档案内容区在 1440/1920 下是 1142/1622px，于是全页并存四种宽度（展品满宽 / API 表 860 / 职责说明 629 / 注记 655），最窄的一溜缩在角落、越往下越像断层。
  - 第二轮（用户「太宽了」，标注经像素比对落在 860 边界上）：收到 740px——860 在 13px 下约 66 个中文字/行，中文长句读起来累；740 约 57 字，是技术注记的舒适上限。
  - 第三轮（用户「有的设置了版心，有的是全宽，比如 live 面板，能不能统一设置版心，然后水平居中」）：**取消"展品满宽 + 文本列"两种宽度，改为全页唯一版心 `PAGE_COL = max-w-[740px]`，由 ShowcaseApp 在 titlebar / 内容区 / 状态栏三处同一 `mx-auto` 居中承载**。档案内的块（DocHead / Note / ApiCard）不再各自写 max-w——各写各的正是宽度漂开的根因。效果：Titlebar 面包屑、LIVE 画布卡、状态矩阵、API 表、正文注记、状态栏共用同一条左右竖线，1920 下两侧各留 481px 对称留白。
  - 代价与取舍（已验证）：LIVE 画布卡与热力图随之变窄——热力图是"全宽自适应"组件（周列 `flex-1` + 月份标签 `truncate`），740 卡片内实测 692px、无溢出，只是点距从 ~20px 收到 ~13px；Tooltip 位置矩阵（3×122px + 间距 = 398px）在 428px 装订道内仍单行放下。若将来出现放不下的展品，应改档案自身的呈现，不要再动版心（版心一旦分叉就会退回前三轮的循环）。
- 追记（2026-09-17，用户报告状态矩阵「排版太丑」后修正）：
  ① **矩阵行两列改共用一条顶线**：状态名与标本齐平、说明作为次行挂在名字下。原先整行 `items-center`，遇到高标本（Loading 演示框）标签被甩到盒子腰上像浮空；而矮标本（16px Spinner）又会跟"说明"那一行对齐而不是与状态名对齐——行的身份是名字，不是说明。标本区同时去掉 min-h（节奏交给 `py-4`），矮标本不再孤立悬在空槽中央。
  ② **标签列 230→280px**：说明文案少折一截，消掉「底 + accent 顶弧」这类孤字行。
  ③ **顺带修掉 `Loading` 的兜底高度不可覆盖**（`ui/primitives/Loading.tsx` API 变更）：原先兜底写成基础类 `min-h-[45vh]`，调用方传 `className="min-h-0"` 会被压掉——同名 utility 的胜负由 Tailwind **生成顺序**决定，不由 class 书写顺序决定，那个覆盖一直是静默失效的（样板间把 Loading 放进 168px 演示框时内容被 `overflow-hidden` 裁空才暴露）。改为 `minHeight` prop（默认仍 45vh，走 inline style，可靠覆盖）。产品侧唯一调用点 `AppShell` 不传该 prop，行为不变。

## D-021 表面阶梯重排（bg-group/bg-sunken 下沉）+ 侧栏激活态改 bg-selected `已定（2026-09-17，用户裁决"修复这两个缺陷"）`

- 背景：D-020 只记录未修的两个主题/壳层缺陷，本轮修复。**缺陷一**：实测 WCAG 对比度证实 `bg-group` 是死档——cream 对 `surface` 仅 **1.062**、对 `page` 1.073（`page→surface` 参照值 1.140），即它在两个方向都读不出来；根因是它被夹在 page 与 surface 之间，而它的 5 个消费点（`Panel.EmptyNote`、`HomeView` kind 徽章、`Titlebar` kbd 提示、`AppShell` 次级按钮、`SearchPalette` 页脚与标签）都需要"在周围底色上显形"。`bg-sunken` 同病（对 page 1.085）。**缺陷二**：侧栏激活态用 `bg-hover`（5% 墨，对 page 1.086）承担"选中"语义太弱——真正的选中 token `bg-selected`（accent 叠层）当时只在命令面板选中行用了一处。
- 选择：
  1. **把 `group` / `sunken` 沉到 `page` 之下**，方向定为"凹陷填充"（这是唯一能让同一底色在 page 与 surface 上都显形的解——夹在中间则两头都读不出）。cream：`group` #faf6ec→**#ece4d4**（对 page 1.092 / 对 surface 1.244）、`sunken` #ece5d4→**#e2d8c0**（对 page 1.224）；cocoa 同构镜像（surface 最亮故"沉"= 更暗）：`group` #2a241b→**#19150e**、`sunken` #1a1611→**#100d08**。
  2. **cream `ink-2` 压深留余量** #736552→**#6a5c49**：原值对 page 只有 4.89:1、对 sunken 3.99:1，没有余量——底一加深就跌破 AA。压深 14% 后 page 5.60 / surface 6.38 / group 5.13 / sunken 4.57，全部达标且不破坏"柔和"（仍是 400 字重下的次墨）。cocoa `ink-2` 本来就有余量，不动。
  3. **补偿受影响的 meta 文字**：落在 group 上的 `ink-3` 从 2.55 掉到 2.18（本就 sub-AA 的装饰档），按 02 §2.3"meta 行用 ink-2，不单设 meta-ink"的既有口径改为 `ink-2`——`Panel.EmptyNote`、`HomeView` kind 徽章、`SearchPalette` 页脚提示三处（改动后 5.13，比原 2.55 更好）。
  4. **侧栏激活态 `bg-hover` → `bg-selected`**（`app/Sidebar.tsx` 的 `NavItemButton` + 样板间复刻）：对 page 从 1.086 提到 **1.174** 且带 accent 色相。02 §1 视觉宪法本就允许 accent 用于"选中"，此前是漏用而非越界。**文字保持 ink-1**（不再叠 accent-text），避免"竖条 + 底色 + 文字"三重 accent；悬停态仍用 `bg-hover`（悬停是反馈，选中才是状态）。
  5. **门禁补守卫**：`theme-parity.test.ts` 增三条 AA 断言——`ink-2` 对 `bg-group` / `bg-sunken`、`ink-1` 对 `bg-sunken`（≥4.5）。这是本轮真正防复发的机制：加深下沉档时会强制复核落在其上的墨色。02 规范新增 **§2.6 表面阶梯铁律**（四档单调有序 + 相邻档对比度 ≥1.10 + 加深下沉档必须复核其上墨色）。
- 排除：**不动 `page` / `surface`**（用户认可的"纸 + 卡"观感由这两档承担，动它波及全部页面）；不给侧栏激活项改 `accent-text` 文字色（三重 accent）；不全面整改 `ink-3` 的既有 sub-AA 用法（它是文档口径里的"占位/禁用"装饰档，对 page 只有 2.38:1，属存量问题，需单独立项裁决）。
- 影响：`themes/cream.theme.ts`、`themes/cocoa.theme.ts`、`theme/tokens.css`（两主题数据块同步，parity 测试守护取值一致）、`theme/__tests__/theme-parity.test.ts`、`app/Sidebar.tsx`、`ui/primitives/Panel.tsx`、`features/home/views/HomeView.tsx`、`features/search/SearchPalette.tsx`、样板间 `ShowcaseApp.tsx`（复刻同步）；02 规范 §2.3 词汇表注释、§2.5 指标、新增 §2.6。
- 验证：`theme-parity.test.ts` 6 项全过；`tsc --noEmit` 0 错误；浅/深双主题截图复验样板间（Panel 档案的 EmptyNote 从"几乎看不见"变为清晰凹陷行、代码 chip 变清晰、侧栏激活项可辨）。**真壳层未启动验证**（启动 Electron 会触发主进程初始化并动到本机真实数据库，代价与风险不成比例）——侧栏结论来自样板间的同 class 串复刻 + 对比度实测。

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
