# 测试清理审查快照

审查日期：2026-10-31。目标：减少缺乏独立保护价值的测试及维护负担，保留有用的现有测试，不新增测试。

## 范围与结论

- 盘点时共 1,600 个 TS/JS `test/spec` 文件：桌面渲染侧 454、桌面主进程/工程脚本/任务验证/示例/e2e 301、共享包 481、其他应用与插件 364。后者含 83 个独立插件子模块测试文件。
- 三个子 Agent 分区审查，主 Agent 负责剩余范围与逐项复核。全量枚举并静态初筛导入、断言、样式耦合、mock、自测副本、跳过条件与引用；对删除候选及其生产实现具体检查。没有逐行人工复审全部用例，也没有执行全仓测试。
- 移动端另有 67 个 Rust 源文件内嵌 341 条测试，按测试名称与模块职责初筛，集中在事务、授权、存储、同步、取消，本轮全部保留，未逐条深审。
- 删除 13 个文件（21 条用例声明），从 13 个混合测试文件移除 20 条用例声明；连同测试配置清理，代码净减少 1,038 行。
- 不修改生产代码、不新增测试；未修改已有未提交测试或插件子模块。盘点期间其他工作继续产生新文件，它们不自动计入本次审查结论。

## 删除的完整文件

| 文件                                                                                          | 依据与边界                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/desktop/src-electron/main/modules/__tests__/publish-appearance-settings.test.ts`        | 仅复述两项图片外观字段的透传与默认值，不涉及发布事务或敏感信息过滤。 测试输入只含 borderRadius/shadow，输出逐字段相同；生产函数只是 ?? 默认值映射。所谓“只保留”用例没有注入任何无关或敏感字段，不能证明过滤正确性。                                                                                                                                                      |
| `apps/desktop/src/components/AddTag/__tests__/addtag-dump.test.tsx`                           | 无断言调试残留 唯一用例 dumps markup 只 render AddTag 并 writeFileSync(os.tmpdir()/addtag-dump.html)；未调用 expect/assert，且未卸载 React 根。AddTag 的 editing.test.tsx 与 divided.test.tsx 已覆盖真实编辑行为。                                                                                                                                                       |
| `apps/desktop/src/components/ChatSidebar/__tests__/MarkdownRenderer.blockquote.test.tsx`      | 仅锁定共享排版的静态 class 和示例文案 唯一用例只查询 blockquote，断言 border-l-2/text-ink-2 和两行原样引用文本。MarkdownRenderer 的排版来自 @tau/chat-ui markdownTypographyComponents；公共 ChatMarkdownRenderer.test.tsx 已检查基本 Markdown 引用渲染。                                                                                                                 |
| `apps/desktop/src/components/ChatSidebar/__tests__/MarkdownRenderer.editor-language.test.tsx` | 仅锁定列表和分割线的静态 Tailwind 排版 唯一用例只断言 list-disc/list-decimal/my-1/bg-line-1 和输入中的文本。被测组件没有桌面特有列表行为，使用公共排版组件。                                                                                                                                                                                                             |
| `apps/desktop/src/features/settings/__tests__/IntegrationSection.test.tsx`                    | 静态提示文案和已移除品牌名单的快照式检查 将 useDesktopPlugins mock 为 null，只 render 无插件场景，断言 在线视频/提示文案 与不存在的品牌词及 YouTube 代理 aria-label；没有执行配置、跳转、选用或保存行为。IntegrationSection 当前仅转交 OnlineVideoPluginSettings。                                                                                                       |
| `apps/desktop/src/features/settings/__tests__/UploadPluginSection.test.tsx`                   | 外部输入默认跳过的旧上传设置流程验收，已与当前产品结构不符 it.skipIf(!process.env.TAU_UPLOAD_PLUGIN_ZIP) 默认不执行；测试在 ResourceSection 寻找 保存并使用 按钮并断言 已保存并选为上传目标。当前 ResourceSection 只提供 ProviderChoiceList/本地选项/压缩开关，不含配置表单或该按钮，配置已迁到插件详情。仓库脚本/package.json 未发现 TAU_UPLOAD_PLUGIN_ZIP 的执行接线。 |
| `packages/editor/src/extensions/header/src/__tests__/placeholder.test.tsx`                    | 整文件只检查一个 Tailwind 类名，不能验证实际占位文字是否折行。 唯一用例在挂载整个编辑器后仅断言 h2.className 含 [&_[data-slate-placeholder]]:whitespace-nowrap；注释明确 jsdom 不渲染 Slate 占位文字。实现 HeaderContent 直接包含同一字面量。                                                                                                                            |
| `packages/editor/src/extensions/blockquote/src/__tests__/render.test.tsx`                     | 仅验证装饰性引号数量，启动完整 Slate/DnD 栈维护成本高。 两个用例只统计 span[aria-hidden] 的 “ 数量及 contenteditable=false；Blockquote 实现由 InsideBlockquoteContext 控制装饰，无正文、编辑、导航或持久化断言。                                                                                                                                                         |
| `packages/database/src/__tests__/SortPanel.test.ts`                                           | 测试仅逐项复写三分支提示文案映射，不验证排序行为。 directionHint 实现 date/number/default 三种类型各按 asc/desc 返回固定字符串；唯一用例列举相同的 7 个字符串。数据库 projection/formula/undo 等真实排序与数据测试保留。                                                                                                                                                 |
| `packages/whiteboard/src/components/__tests__/shortcutText.test.tsx`                          | 完整白板挂载仅检查提示文字，格式化算法已有覆盖。 6 个用例只查询 kbd/menu 文本，未执行对应缩放/适应/展开命令；hotkeyFormat.test.ts 对 mac/other 的 mod+=、mod+-、shift+1、Digit1/2/0、enter、z 均有直接映射测试。                                                                                                                                                         |
| `apps/mobile/src/features/articles/__tests__/queries.pagination.test.ts`                      | 测试内复制生产算法并自测，未连接生产实现。 第 4–7 行在测试文件自行定义 nextOffset；唯一业务导入是 ArticleListResponse 的 type。真正逻辑在 apps/mobile/src/features/articles/queries.ts 的 useArticlesQuery/getNextPageParam。生产算法被破坏、删除或换成错误结果时，这两条测试仍通过。                                                                                    |
| `apps/mobile/src/components/__tests__/icons.lucide.test.ts`                                   | 一次性图标替换检查，只约束源码写法且维护固定文件清单。 唯一测试逐个读取 10 个 TSX 源码文件并禁止 /<svg\b/，不导入组件、不验证图标可见性/可访问名称/交互。合法内联 SVG 也会失败，而图标缺失仍通过。                                                                                                                                                                       |
| `apps/plugin-portal/web/src/app/topBar.test.tsx`                                              | 纯 Tailwind 类名断言，不能验证它声称的窄屏布局。 唯一测试渲染 TopBar 后仅检查 shrink-0、whitespace-nowrap、order-3、w-full、overflow-x-auto、sm:order-none 等 className。jsdom 不计算断点或布局；删除实际 CSS、使布局失效仍可通过。生产 TopBar 的登录/登出、路由、计数与账号菜单均没有被这个测试验证。                                                                   |

这些文件的删除风险主要是失去固定展示细节的自动检查；视觉验收仍由用户完成。不同平台对同一协议的测试，以及仅部分重叠的并发/异常测试，没有按“重复”删除。

## 混合文件中的局部清理

| 文件 | 移除用例 | 保留边界 |
| --- | --- |
| `apps/desktop/src/components/AddTag/__tests__/divided.test.tsx` | divided 时标签行自带上分割线，不依赖正文末块的外边距 | 保留同文件其他真实行为用例 |
| `apps/desktop/src/components/ContentOutline/__tests__/ContentOutline.test.tsx` | 二级标题相对一级标题缩进，三级标题保持缩进 | 保留同文件其他真实行为用例 |
| `apps/desktop/src/components/__tests__/ChatInputArea.editor.test.tsx` | 应限制编辑器区域高度，并允许长内容在输入区内部滚动 | 保留同文件其他真实行为用例 |
| `packages/ui/src/primitives/__tests__/Button.test.tsx` | 变体/尺寸/block 类落地，默认 secondary + md；icon 渲染左位 svg | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/ui/src/primitives/__tests__/choice.test.tsx` | 形制类：命中 24×24、ring/disabled 走锚格 has- 变体、错误态变体；形制类：轨道色条件互斥（选中 accent / 未选中 bg-track）、thumb 描边、位移、两档尺寸 | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/ui/src/primitives/__tests__/segmented.test.tsx` | 形制类：连体描边容器、段间分割线、激活轻染、hover 只落未选段、ring 锚；md 档：容器 radius 9、段高 32 / tau-meta 字号 | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/ui/src/primitives/__tests__/radio.test.tsx` | 形制类：锚 24×24 圆、ring/disabled 走锚格 has- 变体、环+点 peer 类、错误态选中优先；描述行：desc 渲染 + label 容器顶对齐（items-start）；无 desc 居中；orientation：默认横向 flex-wrap，纵向 flex-col 顶对齐 | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/ui/src/primitives/__tests__/filterPill.test.tsx` | 未选皮肤：outline 描边、raised 浮起；图标渲染在标签前 | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/ui/src/primitives/__tests__/tag.test.tsx` | 形制：药丸单尺寸（高 22 / tau-sm / leading-none）+ truncate 文字位 + max-w-full | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/ui/src/primitives/__tests__/Dialog.test.tsx` | 尺寸档与 width 任意值 | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/whiteboard/src/components/Toolbar/__tests__/toolbar-ui.test.tsx` | 工具栏内激活按钮只改文字色，不带 bg-accent-soft；工具栏外的 ChromeButton 激活态仍带 bg-accent-soft | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `packages/shared/src/components/MediaPlayer/__tests__/VideoPlayer.test.tsx` | 底栏渲染信息位 | 保留受控状态、禁用、焦点、事件、主题及样式覆盖等现有保护 |
| `scripts/plugins/stickman/combination.test.ts` | 旧 schemaVersion 快照显式转换 | 转换模块已删除、旧 JSON 白板转换已退役；同步删失效 import，保留当前包/宿主/服务组合用例 |

额外复核保留 VideoPlayer 的“调用方的 block 等显示类不破坏内部纵向布局”用例：它保护调用方 className 覆盖后组件仍能维持内部结构，不能只按 className 断言删除。

删除完整测试前确认 Git 跟踪且文件干净。复核发现发布专项配置显式引用 IntegrationSection 测试，已同步删除该 include 条目；其他候选由 glob 自动收集。历史任务 JSON 中的旧结果记录不修改。

## 明确保留

- 导航栈机、页面保活、浮层/编辑键盘仲裁、移动手势与焦点生命周期。
- 主库 Schema/技能字段对账、事务/回滚、引用计数与延迟回收、草稿和损坏文件保护。
- 插件权限、授权撤销、停用后迟到结果、并发写入和原子安装/更新。
- 协同乱序合并、幂等、跨窗口/跨库隔离与撤销重做。
- 主题/token/TS-CSS parity、颜色语义和 cn 样式覆盖协议。源码读取或样式断言本身不是删除依据。
- 有显式 bench 脚本或真实报告产物的按需评估工具；默认 skip 不等于无用。

## 暂保留的待判断项

| 文件                                                                                             | 本轮保留原因                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/features/plugins/__tests__/format3-authors.test.ts`                            | 仅 TAU_FORMAT3_AUTHORS_REPORT 外部输入才运行，固定24个包与旧版本；仓库无报告生成接线，但仍验证真实发行包跨平台装配。先保留，建议另行将其作为手动验收工具整理。 |
| `apps/desktop/src/features/plugins/__tests__/provider-settings-packages.test.ts`                 | 仅 TAU_PROVIDER_AUTHORS_REPORT 外部输入才运行，固定8个包；仍覆盖实际作者包表单声明，缺乏无用证据，先保留。                                                     |
| `apps/desktop/src/app/plugins/__tests__/upload-package-cancel.test.ts`                           | 需要外部 ZIP 默认跳过，但验证真实插件取消链，和宿主内存桩不同，保留。                                                                                          |
| `apps/desktop/src/tool-call-renderers/__tests__/TodoOperationRenderer.test.tsx`                  | 虽主要断言文案，仍经过真实 JSON payload 解析及动作映射；不能仅凭静态 DOM 判断无用，保留。                                                                      |
| `apps/desktop/src/tool-call-renderers/__tests__/CalendarOperationRenderer.test.tsx`              | 真实结果协议解析与动作展示保护，先保留。                                                                                                                       |
| `packages/editor/src/extensions/underline/src/components/Underline/__tests__/underline.test.tsx` | 主要是样式断言，但保护用户选色与主题色隔离、波浪线走不同着色属性。遵循主任务保留 token 相关保护，暂不删。                                                      |
| `packages/blog/src/ContentRenderer.test.tsx`                                                     | 公开参数的 expectTypeOf 单用例在普通 Vitest 中没有运行时价值，但同包 tsc include src 能实际做类型对账；删掉将降低 API 边界保护，暂留。                         |
| `packages/ui/src/__tests__/ResizableAndHideableSidebar.test.tsx`                                 | 前两个用例仅 overflow 类名，但目标是避免拖拽热区被裁剪，且同文件保存宽度恢复回归不能删；本轮保守保留。                                                         |
| `packages/contracts/src/setting.test.ts`                                                         | 简单桥接用例有些重复，但同时保护具体 IPC channel 与参数形状，删除收益很小，暂留。                                                                              |
| `packages/plugins/src/__tests__/api-support.test.ts`                                             | 文档成员覆盖检查只是文本存在性，强度弱；但用于约束跨平台 API 支持文档的完整性，没有等价工具覆盖，暂留。                                                        |
| `apps/mobile/src/components/__tests__/topbarSafeArea.test.ts`                                    | 有固定文件名单与精确源码写法问题，但同时保护 mobile.md 明确的 PageHeader/顶部安全区约定；暂保留，不能仅因读源码删除。若后续剪枝可只移除实底/边框视觉断言。     |
| `apps/mobile/src/features/speechInput/__tests__/DictationOverlay.test.tsx`                       | 9 条多数是静态提示与颜色，但计时格式/阈值及 portal 归属包含实际运行逻辑；不建议整文件删除。可以在后续局部清理文案和 className 用例。                           |
| `plugins/tau-blog-template/src/components/Outline/index.test.tsx`                                | 子模块有纯缩进样式用例，但另一条检查 activeIndex 和 aria-current，不能整文件删。本轮仅单列建议，不变更子模块。                                                 |
| `apps/mobile/src/features/cards/__tests__/mobileEditorBottomToolbar.test.tsx`                    | 有视觉断言且 stub 较多，但大量真实交互/焦点/只读/白名单/遮挡高度行为；文件已有用户未提交修改，本轮完全避开。                                                   |

## 验证

| 检查                                | 结果                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------- |
| 桌面局部修改的 3 个测试文件         | 11 条通过                                                                   |
| UI 7 个文件                         | 42 条通过                                                                   |
| 白板 toolbar-ui                     | 7 条通过                                                                    |
| shared VideoPlayer                  | 5 条通过                                                                    |
| 桌面发布专项配置（18 文件）         | 121 条通过                                                                  |
| 合计                                | 30 个文件，186 条现有测试通过                                               |
| 火柴人组合测试收集                  | 使用已有 0.1.12 本机构建包，8 条用例正常收集；未执行组合运行或重新打包插件  |
| TypeScript AST 对账                 | 13 个混合测试文件只删除计划内 20 条用例，其余用例标题与顺序保持，无语法诊断 |
| 定向 lint / 格式 / git diff --check | 通过；保留代码中的 any、非空断言、空 stub 等原有 lint 警告未扩展修复        |
| pnpm check:docs                     | 通过，0 警告                                                                |

本轮只调整测试及测试收集配置，未运行全仓测试、完整应用类型检查/构建、视觉走查或真实设备验收。火柴人组合仅确认收集成功，不能据此宣称八条组合行为均通过。

本报告为一次性审查快照；长期测试投入规则以根 AGENTS.md 为唯一事实源。
