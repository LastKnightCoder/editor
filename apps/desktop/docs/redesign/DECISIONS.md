# 决策记录（轻量 ADR）

> 每条决策一行式：背景 → 选项 → 选择 → 理由 → 影响。回看时能知道"当时为什么这么定"。
> 状态：`已定` / `待确认` / `已推翻`（推翻必须写理由，不允许无意识翻烧饼）。

---

## D-001 新架构基于 Surface 协议（defineSurface）`待确认（蓝图已详述）`

- 背景：Tab 系统导航/状态/渲染纠缠（useTabStore 1183 行 + TabContent 33 分支），切页丢状态是机制性的。
- 选项：A. 修补 Tab 系统（加 keep-alive 容器）；B. 移植移动端 definePage 五层架构为桌面 Surface 协议。
- 选择：B。
- 理由：移动端已验证同构方案（栈机纯函数可单测、Activity 保活、结果通道、声明式页面数据）；A 只是给烂根施肥。
- 影响：新增 `src/surface/` 框架层与 `src/features/` 域结构；旧 Tab 系统降级为 legacy 兼容层（蓝图 §3.5）。

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

---

## Surface 迁移清单（M2 起滚动勾选）

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
