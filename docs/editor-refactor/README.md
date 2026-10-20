# Editor 职责重构 · 总入口

写给接手的会话。**先读这份，再按需读其他文件**，不需要翻旧对话。
路径默认相对仓库根目录。

**门禁退役（2026-10-20）**：迁移数量基线（包括 ContentEditor 使用文件数）、编辑器扩展边界独立扫描（含 Node/headless 与 bundle 检查）和 antd 专项检查已删除，`check:editor-refactor` / `check:editor-boundaries` / `check:antd` 命令全部退役。现有 ESLint 架构规则、类型检查和独立行为测试继续执行。历史阶段表和执行日志保留当时事实，不再要求更新基线或运行已删除脚本。

**editor 改造已提交为 226a9b28d，随后合入 desktop 分支，未发布。** 核心 Kit 仅内建段落/文本，四端显式选择产品扩展；25 个完整功能包位于 editor-extensions，产品组合在核心之外。copy/marks/textCodecs、领域空态/转换/导航与根 UI 贡献、服务归属、公开入口及外部示例已完成。改造验收快照见 11，首次合并决策和复验见 12；最新 desktop 增量合并见 16。05 的旧批次及 06 的基础领域合包建议不再作为实施依据。

最新进展：Markdown 与连续生成草稿统一经本地 Y.Doc 更新，整体设值接口及桌面旧正文更新 Hook 已退役（14/15）；已接入 desktop 的预览工作台、主题配色、工作目录和列表视图更新，维持拆包边界（16）。扩展可声明暂态装饰 `decorations`（ER-055，首个消费者为桌面文档待办）；勾选项新增 `taskId`（`@tau/editor-list` 规范化补齐与去重）。

**阅读入口**：[11-完成审计与验证矩阵.md](11-完成审计与验证矩阵.md)、[10-公开入口与迁移对照.md](10-公开入口与迁移对照.md) 和各包 README；08/09 保留设计与行为约定。视觉/实机由用户后续验收；历史图片映射与旧版文本载体限制不因拆包消失。source-view 保留独立支撑包，聊天治理、动态加载/市场/沙箱不在范围内。

| 文件                                                                 | 内容                                       | 何时更新             |
| -------------------------------------------------------------------- | ------------------------------------------ | -------------------- |
| [README.md](README.md)                                               | 背景、当前进度、下一步、接手步骤           | 每次提交             |
| [01-目标架构.md](01-目标架构.md)                                     | 分层、依赖方向、扩展 API、主题三层 token   | 架构有变化时         |
| [02-阶段计划.md](02-阶段计划.md)                                     | 分阶段任务清单、验收标准、验证命令         | 勾选任务、调整范围时 |
| [03-决策记录.md](03-决策记录.md)                                     | 已定/待定/已推翻的决策（ER-xxx）           | 做出或推翻决策时     |
| [04-执行日志.md](04-执行日志.md)                                     | 按时间记录做了什么、踩的坑、遗留问题       | 每次提交             |
| [05-服务归属与扩展拆包方案.md](05-服务归属与扩展拆包方案.md)         | 后续服务契约、扩展分组、迁移批次与验收建议 | 方案评审时           |
| [06-包边界整体审视.md](06-包边界整体审视.md)                         | 包现状调查与历史方案比较                   | 调查结论变化时       |
| [07-核心与扩展边界及推进约定.md](07-核心与扩展边界及推进约定.md)     | 最新已定边界、待设计接口、推进顺序与验收   | 设计与实施推进时     |
| [08-段落公共能力与显式装配设计.md](08-段落公共能力与显式装配设计.md) | 四端场景、段落 API、Kit 迁移与验收矩阵     | 接口与装配实施时     |
| [09-复制与标记贡献接口设计.md](09-复制与标记贡献接口设计.md)         | copy/marks/textCodecs 提案及保真缺口       | 贡献接口实施时       |
| [10-公开入口与迁移对照.md](10-公开入口与迁移对照.md)                 | 当前公开入口、旧用法迁移与验证范围         | 公共入口变化时       |
| [11-完成审计与验证矩阵.md](11-完成审计与验证矩阵.md)                 | 当前源码证据、P/K 验收对应、实际结果与限制 | 最终验证与交付时     |
| [12-desktop分支合并记录.md](12-desktop分支合并记录.md)               | desktop 分支合并决策、冲突处理与复验       | 分支合并时           |

## 1. 为什么要做

`packages/editor` 在反向依赖业务：

- 主题：组件读宿主给的 Tailwind 类名（`useThemeColors`）、宿主定义的旧 CSS 变量（`--th-*` / `--color-*`），`--tau-*` 新主题一个都没用上。每换一次宿主主题，Editor 就得跟着改。
- 配置：`EditorProvider` 的 `config` 是个杂物袋（主题、图片外观、`openUrl`、plantuml 地址、`formatDate`），并且隐式按组件树继承。
- 扩展：内置扩展和宿主扩展共用 `IExtension`，核心手段是链式改写 Slate 方法，没有错误隔离，扩展没法自带 Markdown 序列化。
- 协作：内核靠 `collaboration` prop 特判，硬依赖 yjs；desktop 每个内容编辑都包一层 `ContentEditor`，发起或结束共享时 documentId 变、`<Editor key>` 重建，编辑器会闪一下。
- Markdown：三份实现（desktop utils、editor `markdownImport.ts`、没人用的 `slate-markdown`），能力已经分叉；Electron 主进程也在用，不能依赖 DOM。**P5 已合并为 `@tau/markdown`。**

## 2. 目标（一句话版）

内核提供机制与基础段落/文本，领域功能通过与外部插件相同的公开 API 实现；Editor 只依赖主题**契约**不依赖宿主；宿主用显式 `EditorKit` 选择功能；协作拆成「文档源 + 协作适配」，共享切换不重建编辑器；Markdown 合并为一份 headless 实现。本期以内部扩展和公开 API 示例验证边界，不实现第三方加载或市场。

## 3. 用户已确认的边界（2026-09-28）

1. 第三方插件、插件市场后做；本期只解决内部模块化，但 API 设计要保证将来开放时**不需要大改**。
2. blog / mobile / browser-extension 统一接入 `--tau-*` 主题体系；方式是桥接，外观不变（ER-012）。
3. custom-block 保留「在文档里写 JS」的能力，安全（沙箱）问题后续再考虑。
4. 协作治理和 Markdown 合并纳入本次重构，一次性解决（ER-009、ER-010）。
5. Markdown 导入导出不能依赖 DOM（Electron 主进程在用）；源码 ↔ 富文本双向位置映射必须保留（Markdown 窗口在用）。

## 4. 当前进度

| 阶段 | 内容                                                           | 状态   |
| ---- | -------------------------------------------------------------- | ------ |
| P0   | 基线、护栏、协作两个 spike                                     | ✅     |
| P1   | 主题整体迁到 `@tau/themes`                                     | ✅     |
| P2   | 各平台接入 `--tau-*`（桥接，外观不变）                         | ✅     |
| P3   | Editor 组件 token（`--ed-*`）+ ThemeService，迁移主题耦合      | ✅     |
| P4   | 拆解 EditorConfig                                              | ✅     |
| P5   | Markdown 合并为 headless 的 `@tau/markdown`（可与 P1–P4 穿插） | ✅     |
| P6   | EditorKit + 文档源，替换 EditorProvider                        | ✅     |
| P6.5 | desktop 宿主扩展收进 kit（消掉 `extensions` 透传）             | ✅     |
| P6.6 | desktop kit 按场景拆分，恢复平滑性                             | ✅     |
| P7   | 协作治理：`editor-collab`、会话升级、无缝换源                  | ✅     |
| P8   | 扩展 API v2（声明式贡献点、错误隔离、codec 归属）              | ✅     |
| P9   | 拆包（custom-block 试点、diagram）                             | ✅     |
| 远期 | 第三方加载、市场、授权、custom-block 沙箱                      | 不排期 |

状态图例：⏳ 未开始 / 🚧 进行中 / ✅ 完成 / ⏸ 暂停（写原因）。

**P9 已完成代码拆包与自动化验收**：custom-block 与现存五种图表分别归 `editor-custom-block`、`editor-diagram`，四端显式接线；内核不反向引用新包，Markdown 与 editor 的循环依赖已切断。已删除能力不恢复。工作环境及基线见 [拆包任务记录.md](拆包任务记录.md)，验证明细见 04。

**实机确认由用户负责**：四端编辑、插入、主题和协作交互，以及 Electron Typst 编译。TikZ 的 `input.dvi` 错误已在起点组件复现，仍是既有未解决事项。按用户要求停止后续视觉验证，临时页面与预览进程已清理。

**后续拆包已完成前两批**：服务契约与 HTML 首批已提交 `468371efe`。源码预览/CodeMirror/预览菜单归 `editor-source-view`，代码块 textarea＋Shiki/控制器/codec 归 `editor-code-block`；公式因直接消费预览在同批前置迁入 `editor-math`。四端显式组合稳定实例，桌面源码定位经代码块 `/runtime`，内核不反向引用新包、不再加载 CodeMirror/Shiki。导航、回写、空态删除、退出保存与往返快照通过。第三批数学渲染/表情及聊天/浮层边界已在工作树实施并经过本轮收口，尚未提交；常规依赖环境已恢复，93 例定向回归、四端/相关包类型与浏览器扩展生产资源验证通过，详见 04 最新记录。当前不继续媒体及基础领域。

**前阶段记录**：P8 已完成（2026-09-30：内置扩展 43 个 + 内核热键 13 个命令 + desktop 宿主扩展 8 个

- editor-webview 全部迁到 v2；editor-collab 核实为非扩展无需迁移；ESLint headless 规则落地。
  热键全量走命令注册表，宿主命令命名空间 host.* 开用）。**legacy 适配层也已删除（ER-019）**：
  三端与 VideoNotePanel 系的旧扩展全部迁 v2 后，Base / IExtension / fromLegacyExtension /
  装配层 legacy 分支一并移除，全仓再无 legacy 扩展。下一阶段是 P9 拆包（custom-block 试点、
  diagram 类拆包，清单见 02 P9）；实机待确认清单见下方。
  2026-09-30 整体审查确认的 8 项问题已修复并补回归测试：剪切失败与异步目标保护、音频上传路径漂移、
  普通文档/kit 切换初始化、未知行内 Markdown 换行往返、协作换源光标开关、命令谓词与异步错误隔离、
  同明暗主题订阅、未知节点位置缓存。验证结果见 02「P8 整体审查修复」与 04 最新条目。
  标签页块重设计为「书签下划线」，三个组件裸色清零、全走 `--ed-*`（mockup 在 `apps/desktop/mockups/editor-tabs/`，见 04 同名条目）。
  引用块重设计为「大引号 + 中性竖线尾迹」，去掉伪斜体与 accent 竖条，新增 `--ed-quote-*` 五个 token，嵌套内层只留竖线；PDF 与编辑器一致，公众号 / EPUB 因不支持定位用文档流降级版（mockup 在 `apps/desktop/mockups/blockquote/`，见 04 同名条目；视觉待实机确认）。
  源码预览块（`PreviewWithEditor`）重设计为「卡片展开」：浅色悬停操作条、编辑态描边卡片 + 类型标题行 + 完成、统一空块占位、渲染出错保留上次结果（`useReportPreviewError`，除 HTML 块外的渲染器全部接入）、全屏改为左右工作台（滚轮缩放、拖动平移、Esc 关闭）；代码块操作条同步换为共用的浅色 `FloatingToolbar`；源码类块底色统一为 surface-hover（ER-054，mockup 在 `apps/desktop/mockups/preview-editor/`；视觉待实机确认）。
  远程 ER-019 已与本地后续重构整合：协作与桌面 kit 测试夹具补迁 v2，桌面审阅子树遍历补统一类型；原本未提交的图库设置修改保留，验证见 04「远程整合」。
  已完成：第一块（错误隔离 + 未知节点占位，Markdown 兜底语法见 ER-006）；第二块（`defineExtension`、
  `@tau/editor/api`、`fromLegacyExtension`，divide-line 已迁到 v2）；第三块（移除 antd，UI 直接用 `@tau/ui`，ER-018）；
  mobile 注册了自己的编辑器提示服务（mobile toast + `MobileConfirmDialog` + 输入用 `BottomSheet`，返回手势等同取消；
  内核单行输入框经 `IEditorNotifier.prompt` 交给宿主，见 ER-020）；
  拖拽样式收口为 `BlockDrag`；编辑器 less 全部转 Tailwind（67 → 0，第三方覆盖留两份 `.vendor.css`）；
  第四块（Markdown codec 按扩展归属：`@tau/editor/markdown` 聚合 40 个内置 codec，`@tau/markdown` 变纯框架，
  宿主只合成一次 codec 列表，desktop 往返基准快照逐字节不变）；第五块（导入端 walker 去类型化：方言完全由 codec
  声明——fence / importNode / normalize / inlineForm / childSeparator，框架零元素类型知识，插件作者可声明新围栏语言；
  master 差分门 35 语料八维度零未知差异，顺带修掉 definition 节点导出崩溃的既有缺陷）。第六块（命令注册表：命令成为唯一动词层，热键绑命令 id，内置格式六命令与全选已迁移，editor.commands 可程序化执行）。
  第七块（菜单贡献层：手柄菜单与右键菜单统一为一个贡献点，条目只引用命令 id；内核默认菜单扩展贡献
  block 组与 transform 组，16 个菜单接线点全部声明式收敛，运行时动作经 WeakMap 注册表；同 id 覆盖让扩展可替换默认条目）。
  第八块（拖拽声明化：元素声明 drag 二维（self/children）+ accepts 谓词 + handleClassName，未声明的类型没有 chrome；
  BlockDragHost 成为手柄/插入线/手柄菜单唯一渲染点，22 个接线点去接线；canDrag/canDrop 沿祖先链求值，
  两处跨扩展感知硬编码与 disableDrag 数据字段一并删除）。
  第九块（ingest 内容注入：drop 与 paste 归并为认领式管线——files 按声明分桶认领、text 谓词认领排在
  markdown 导入前，每环隔离熔断；image/inline-image/audio/video 收敛为四个 ingest 声明，七个 paste/drop
  旧插件与 withFileDrop、editor.dropHandlers 删除；相同 accept 建 kit 抛错）。
  第十块（内置扩展迁 v2 第一批：callout / blockquote / bulleted-list / numbered-list / header。
  插件改写全部转声明式行为（quit/退格/规范化 → behaviors，段落快捷语法 `> ` `- ` `1. ` `# ` → behaviorsFor.paragraph），
  header 热键首个切命令 id（alt+=/alt+- → tau.header.promote/demote）、构造选项改 createHeaderExtension 工厂；
  等价性用「HEAD 对照 + 反向验证」守护，既有插件单测换真实 kit 装配，editor 283 例全过）。
  第十一块（第二批 5 个：custom-block / audio / video / detail / highlight-block。ingest 声明首次随迁；
  「段首退格 × 前一个特殊块」behaviorsFor 模式落满三例；custom-block 的 loadable 渲染包一层函数组件、
  旧退格插件嵌套容器误删整容器的缺陷随迁修正，editor 290 例全过）。
  第十二块（第三批 6 个：check-list 系 / list-item / tabs 系 / table 系。热键切命令 id 扩到 18 个
  （Tab 缩进、mod+方向移动、表格 11 键导航与插删行列）；table 的 delete/deleteFragment 改写保留为
  受信任层插件（行为 API 方法面之外的第一个案例）；测试抓出并修复一次行为分发顺序与旧插件分支顺序的
  冲突（跨两层挂行为的让路模式），editor 300 例全过）。
  第十三块（code-block：``` 围栏语法与前块聚焦挂 behaviorsFor、mod+` 切命令、loadable 渲染包函数
组件。带插件与热键的复杂扩展全部迁完，editor 301 例全过）。
第十四块（第五批纯渲染 14 个 + 第六批 9 个：纯渲染全走 kind+isVoid+render 模板（plantuml、
image-gallery 构造选项改工厂）；第六批热键切命令 9 个（公式/链接/批注/注解/多列插删列）、
multi-column 行为转声明式，键位竞争（mod+shift+m、mod+方向）经核对顺序与旧链一致。
累计 41 个，仅剩 paragraph 与 image，editor 308 例全过）。
第十五块（第七批收官：paragraph（memo 渲染器 + drag 迁 v2，「展开选区输 \` 加 code 标记」
  是文本级全局快捷语法保留为插件）与 image（ingest / appearance 菜单工厂 / createImageExtension
  工厂）。**内置扩展迁移全部完成：43 个扩展、28 个命令，registry 旧类清零**，editor 313 例全过）。
  第十六块（内核 legacy 热键全部切命令 id：escape 清标记、mod+左右兜底拦截、方向键 inline 边界
  移动、slash 面板六键、块导航 up/down——热键全量走命令注册表，legacy 直通数组清空；键位仲裁
  核对结论见 02。editor 314 例全过。**实机待确认**：块导航（up/down 跨 void 块）、slash 面板键盘
  （backspace 关面板 / enter 确认 / 左右进出子菜单）、escape 清标记、mod+左右不再触发宿主卡片收展）。
  第十七块（desktop 宿主扩展迁 v2 第一批 6 个：database / file-attachment / flashcard-blank /
  project-card-list / whiteboard / inline-ai-assistant。database 与 whiteboard 的 apply 引用计数
  保留为受信任层插件；mod+j 切 host.inline-ai.open-composer——宿主命令命名空间 host.* 开用；
  包出口补命令类型、desktop 侧 IExtension[] 标注放宽。editor 315 例全过）。
  第十八块（content-link 与 skill-ref：@ 提及面板挂 behaviorsFor.paragraph.insertText +
  面板五键切 host.content-link.mention-_（esc 与内核 clear-marks 同键位经段序保持先后）；
  skill-ref 的 $ 面板同模式切 host.skill-ref._。**desktop editor-extensions 八个全部迁完、
  旧类清零**，editor 315 例全过）。
  第十九块（**P8 完成**：editor-webview 迁 v2（四端六个使用点收口，全仓再无 new XxxExtension()）；
  editor-collab 核实为非扩展（P7 已按文档源+协作绑定建包）无需迁移；ESLint headless 规则覆盖
  扩展 markdown.ts。editor 317 例全过、四端 tsc 0 error）。
  **实机待确认**：移除 antd 后各浮层（Tooltip、代码块语言选择、表情、批注、行内 HTML、样式文本调色、列表图标、
  表格操作、行内图片上传）的观感与开合；两种未知节点占位的观感；各块拖拽手柄的悬停显示（只亮最内层被悬停的块）与拖拽插入线；less 全量转 Tailwind 后的编辑态外观（代码块叠层编辑与全屏、源码 + 预览块的编辑 / 全屏、右键菜单与块面板、图片 / 视频缩放与工具条、分栏、行内公式选中态，blog 只读页覆盖不到编辑态）；**菜单贡献层：手柄菜单的组间分隔线与顺序（特有 → 转换成 → 移动/剪贴/删除）、新增的上移/下移/剪切/复制、void 块删除后补空段落与焦点落点、webview 删除确认框、代码块 Diff 动画与语言子菜单**；**拖拽声明化：chrome wrapper 对各块布局/间距的影响（margin 折叠应穿透）、手柄位置统一后的观感（标题/引用/勾选项的微调保留、其他块用默认位）、插入线统一位置、勾选项内段落不再有手柄、blockquote 拖放高亮变标准样式、嵌套块（分栏/标签页/详情内）的拖拽与手柄悬停**；**ingest：拖图片/音视频入正文与粘贴的落位与上传流（多文件逐个插入）、非空段落粘贴图片的行内落位、audio/video 上传失败的占位清理（粘贴清、拖放留）、拖任意文件（PDF 等）经 file-attachment 兜底认领上传成附件块、文件拖拽悬停时的落点指示线与实际插入位置一致**；P7 遗留的协作 e2e、结束共享、白板测高、
  mobile 回落与结束共享（清单见 02 P7 验收结果）。
  **实机待确认**：移除 antd 后各浮层（Tooltip、代码块语言选择、表情、批注、行内 HTML、样式文本调色、列表图标、
  表格操作、行内图片上传）的观感与开合；两种未知节点占位的观感；各块拖拽手柄的悬停显示（只亮最内层被悬停的块）与拖拽插入线；less 全量转 Tailwind 后的编辑态外观（代码块叠层编辑与全屏、源码 + 预览块的编辑 / 全屏、右键菜单与块面板、图片 / 视频缩放与工具条、分栏、行内公式选中态，blog 只读页覆盖不到编辑态）；P7 遗留的协作 e2e、结束共享、白板测高、
  mobile 回落与结束共享（清单见 02 P7 验收结果）。

## 5. 接手步骤

先读 07 和 ER-026/027，再按 02 的「核心与扩展边界后续阶段」处理具体接口设计；不能直接按旧批次搬包，也不能将文档定稿视为代码实现完成。

当前代码已完成独立审查后的架构纠偏（ER-025），不继续媒体或基础领域拆包：内核低级菜单不再公开，代码块高亮经命令统一分发；列表选择器保持原归属与能力，emoji-mart 准确登记为待迁依赖。此前授权的收口中，聊天展示与工具 renderer 契约/登记统一归 chat-ui；浮层契约归 editor，由宿主适配现有 Page/router 仲裁（ER-023/024）。第三批仍未提交；最新 ER-026 已确定 paragraph 为核心基础，不再引入任意默认块 schema，具体 API 仍待评审。

独立审查修复：聊天渲染入口补齐 KaTeX 样式所有权；高亮命令限制有效行号、容忍目标失效，并将路径解析纳入命令内部。段落导出已明确为迁移桥，退出条件见 01；验证结果及依赖环境限制见 04。边界论证依据职责与消费者，不以模块数、包级依赖清零或测试通过替代。

1. 读本文件 §4 找到当前阶段，去 [02-阶段计划.md](02-阶段计划.md) 看该阶段未勾选的任务。
2. 读 [04-执行日志.md](04-执行日志.md) 最后几条，确认上次停在哪、有什么遗留坑。
3. 用 `git log --oneline -20` 和 `git status` 核对代码实际状态，**以代码为准**；文档与代码不一致时先修文档。
4. 动手前看 [03-决策记录.md](03-决策记录.md)，不要重新讨论已定决策；确实要推翻，写明理由并告诉用户。

## 6. 文档纪律

- 每次提交同时更新：02 里的勾选、04 里的日志、本文件 §4 的状态与「下一步」。
- 踩坑写进 04 的「踩坑」小节，要写**现象 → 原因 → 解法**，让下一个人能直接避开。
- 阶段内范围变化（砍掉、推迟、新增任务）写进 02 并在 04 记一笔原因。
- 基线数字（旧变量数、`useThemeColors` 数等）只在 02 的 P0 基线表和各阶段验收里维护，不要散落各处。
