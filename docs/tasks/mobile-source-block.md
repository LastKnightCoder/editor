# 移动端源码块交互

状态：进行中（P1 完成，P2 主体完成）
目标：让 TikZ、Typst、HTML、乐谱、自定义块以及内置 Mermaid、PlantUML 这类「源码 + 预览」块在手机上好看、好用：正文只显示内容，点选后经配件栏操作，编辑时能边写边看预览；源码编辑器两端统一为与代码块相同的原生输入框 + Shiki 高亮。

视觉稿：`apps/mobile/mockups/source-block-mobile/`（静态页，需从仓库根起 HTTP 服务访问，`.claude/launch.json` 的 `mobile-sync-mock`，入口 `http://localhost:8835/apps/mobile/mockups/source-block-mobile/`）。下文小节后的「A3」「W2」等对应 mockup 帧号；mockup 第 5 页 W1 / W3、第 6 页符号表与各帧里的符号行、「查看」入口已按第 2 节取消。

## 1. 现状与根因

所有插件源码块经 SDK `SourceBlockEditor` → `@tau/editor/source` 的 `BoundSourceBlock` → `PreviewWithEditor` 渲染；移动端内容 kit 注册 `IElementEditingPolicy.sourcePresentation: "touch"` 后走 `packages/editor-source-view/src/TouchPreviewWithEditor.tsx`。块公式（`inPlace`）不走触屏分支，不在本任务范围。

| 问题                                                                                     | 位置                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 预览下固定两个 `Button`（「编辑{title}源码」「块操作」），点预览无反应                   | `TouchPreviewWithEditor`                                                              |
| 源码层是 portal 到 body 的全屏 CodeMirror 5，看不到预览、长行不换行                      | `TouchPreviewWithEditor` + `SourceCodeEditor`（`lineWrapping` 默认关）                |
| 源码层没有 `.ed-preview-codemirror`，配件栏识别不到，Mermaid 符号键失效                  | `apps/mobile/.../editorToolbar/editingContext.ts` 的 `mermaid` 上下文只在桌面路径成立 |
| 插入后不进编辑、块后空段退格无反应                                                       | 触屏分支未监听 `preview-editor-focus`，也未 `registerBlockNavigation`                 |
| 无空态占位；错误是无样式 `<p role="alert">`，不保留上次结果                              | `TouchPreviewWithEditor`                                                              |
| 宽内容裁切                                                                               | 预览无宽度约束（TikZ SVG 固有尺寸、Typst `width: auto`、HTML 原样）                   |
| 字段绑定下「关闭」「完成」等价，按钮重复                                                 | `TouchPreviewWithEditor`                                                              |
| CodeMirror 5 自绘选区，iOS 无系统手柄 / 放大镜，曾修过快速回车丢字                       | `SourceCodeEditor`                                                                    |
| 触屏判定有两份：`IElementEditingPolicy.sourcePresentation` 与 `IEditorInteraction.touch` | 前者只在 `getMobileContentKit` 注册，其他 kit 在手机上会退回桌面交互                  |
| Typst 错误显示两次、高亮用 `mode="stex"`                                                 | `plugins/tau-plugin-typst/src/editor/TypstPreview.tsx`、`TypstBlock.tsx`              |

可复用：媒体块的触屏选中（`useTouchMediaSelection`）与配件栏媒体上下文（`mediaAccessory.tsx`、`ActionSheet`、`requestBlockSelection`、`focusAfterMedia`）；代码块的「原生 textarea + Shiki 叠层」（`ShikiOverlayEditor`，已支持 `textBinding` / `wrap` / `lineNumbers`）；`OverlayBackDismiss`；`ErrorBar` / `KindLabel`；`previewActionsMap`。源码字段已统一经 `IEditorTextFields` 绑定（无文档绑定时 `CoreEditor` 提供本地字段），与「编辑器节点数据契约」任务的 `element + field` 方案一致。

## 2. 决策

2026-10-25 用户确认：

| 事项           | 选择                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| 编辑入口       | A：点选 + 分屏源码页                                                                                      |
| 点块行为       | 先选中，再点配件栏「编辑」                                                                                |
| 正文宽内容     | 一律保持排版，超宽时块内横向滚动；不做等比缩放与查看器                                                    |
| 源码编辑器内核 | 两端统一原生 textarea + Shiki 高亮叠层（`ShikiOverlayEditor`），与代码块一致；源码块不再使用 CodeMirror 5 |
| 源码页预览区   | 可拖动高度                                                                                                |
| 符号键         | 不做符号行                                                                                                |
| 保存方式       | 统一即时同步 + 撤销，不保留「保存 / 取消」草稿                                                            |

与 mockup 的有意差异（实现时按此执行，视觉稿不再改）：

- 状态行只显示错误，不显示「已编译 · 耗时」：渲染器只上报错误，宿主拿不到编译完成信号，不为此扩 SDK。
- 顶栏撤销 / 重做不置灰：`EditorTextField` 不提供可撤销状态。
- 配件栏标签不区分插件块紫色，所有源码块同一样式。
- 文档类（HTML、自定义块）整块横向滚动，不只限 `table` / `pre`：不改写用户 HTML 的样式。
- 不做出错行跳转（A4「第 5 行」按钮）：见下方 2026-10-25 裁决。

2026-10-25 用户纠正：**依赖方向是插件 → 宿主**。宿主（editor-source-view、移动端配件栏）不得出现具体插件的知识——不按 TikZ / Typst / HTML / 乐谱的 mode 预设符号键或高亮，不靠观察哪些插件声明了 `center` 来推断行为；插件差异一律由作者经 SDK 声明，宿主只提供通用机制与通用默认值。内置块（Mermaid、PlantUML）同样经声明接入。已写入 `docs/decisions.md`「插件开放」。

同日用户裁决：不为此新增 SDK 属性（曾考虑的 `symbols` 符号键、`figure` 图形声明都不加），依赖它们的功能一并去掉——源码页不做符号行与光标键，正文不做等比缩放、查看器与「查看」入口。

同日用户裁决：不为错误行号扩展 SDK（`useReportPreviewError` 不加 `line`，宿主不做行号展示与跳转）——当前只有 Typst 一个使用者，等有第二个块能报出行号时再议；Typst 把行号写进自己的错误消息。

同日用户裁决：源码编辑器两端必须一致，不允许桌面 CodeMirror、移动 Shiki 的分叉；统一到代码块已在两端使用的原生输入框 + Shiki 高亮，桌面源码块随之迁移（见 3.7）。移除 CodeMirror 绑定文件 `textFieldCodeMirror.ts` 等另一方改动落定后再做。

待单独确认（新入口，未确认前不做）：⋯ 里的「复制为图片」。

范围外：带外框的插件块（`ElementFrame`，如图库）在触屏下的「块操作」按钮问题相同，另起任务处理；块公式 / 行内公式维持现状。

## 3. 方案

### 3.1 触屏判定合一

源码块的触屏分支改读 `IEditorInteraction.touch`（`useTouchInteraction`），删除 `IElementEditingPolicy.sourcePresentation` 字段及其全部设置点：`apps/desktop/src/services/editorKit.ts` 两处 `"pointer"`、`apps/mobile/src/services/editorKit.ts`、`ElementFrame`（触屏判断同样改读 `IEditorInteraction`，按钮本身留给范围外任务）、`apps/mobile/validation/spike/main.tsx` 与两处测试。删前 `rg sourcePresentation` 复核清零。

### 3.2 正文里的源码块（A1 / A2）

重写 `TouchPreviewWithEditor`，桌面 `PointerPreviewWithEditor` 不动：

- **显示**：只渲染预览，不放按钮。空内容显示与桌面一致的斜纹占位「{title} · 点按开始编写」（从 Pointer 版抽成 `parts.tsx` 的 `EmptySourcePlaceholder` 两端共用）；错误用 `ErrorBar`，`stale` 时预览降淡，与桌面同一表现。
- **选中**：编辑态单击把 Slate 选区折叠进该 void（与媒体同一语义）。`useTouchMediaSelection` 移到 `@tau/editor/api` 改名 `useTouchVoidSelection`，媒体与源码块共用；选中态外框与媒体一致。
- **动作登记**：扩展 `@tau/editor-source-view/menu` 的 `previewActionsMap`，值增加 `title`、`icon`、`openSource()`、`copySource()`；桌面仍只用 `edit`。移动端配件栏据此识别源码块并执行动作，不认具体块类型。
- **进入编辑**：监听 `preview-editor-focus` 并 `registerBlockNavigation`，插入新块和块后空段退格都直接打开源码页。
- **只读**：不拦截点击（HTML 链接、自定义块按钮照常可用）。

### 3.3 宽内容（W2）

所有源码块同一处理：预览容器按正文宽度排版、`overflow-x: auto`，超宽内容在块内横向滚动，右缘渐隐提示还有内容；滚动区避开屏幕左缘，留给系统返回手势。宿主不区分内容是否为图形。

### 3.4 源码页（A3 / A4）

新组件 `SourceEditorPage`（editor-source-view），portal 到 body，返回经 `OverlayBackDismiss` 仲裁，高度取 `--kb-viewport-height`：

- **布局**：顶栏（返回、`KindLabel`、撤销、重做）→ 预览区 → 拖动把手 → 状态行（仅出错时显示错误）→ 源码区 → 键盘。键盘收起时底栏给「复制源码」与「键盘」（回到输入），弹起时底栏让出。预览区默认占剩余高度 40%，可拖动，拖到底收起；键盘收起时源码区让出高度给预览。高度只在本次打开内有效，不持久化。
- **预览只渲染一份**：页面打开期间，块的 `children` 经 portal 渲染进预览区，正文里的块保留打开前的高度占位，避免重复编译（TikZ / Typst 编译较重）。`PreviewErrorContext` 包住同一份 children，错误在页面与正文共用。
- **源码区**：用与桌面源码块、代码块相同的 `ShikiOverlayEditor`（`wrap` + `lineNumbers` + `textBinding`），高亮语言直接取块声明的 `mode`，宿主只把 SDK 既有词表里 CodeMirror 自己的 mode 名换成通用语言名（`stex`→`latex`、`htmlmixed`→`html`），不列任何插件专属语言；Shiki 按名字按需 `loadLanguage`，不认识的名字已有纯文本兜底。插件想要更准的高亮，自己把 `mode` 写成通用语言名（如 Typst 写 `typst`）。
  `ShikiOverlayEditor` 现在在 code-block 扩展里，editor-source-view 直接引用会违反 ESLint 边界（扩展只能经 `@tau/editor/api` 访问内核）。处理：把 `ShikiOverlayEditor` 与高亮工具下沉到 editor-source-view，code-block 反过来从这里引用（code-block 本来就依赖 editor-source-view，方向一致）；该文件有另一方未提交的改动，等其落定后再搬。
- **不做符号行**：括号、反斜杠等靠系统键盘输入。
- **写入**：字段绑定即时同步，返回即完成。非绑定的 `onChange` 路径（Mermaid / PlantUML 无 `IEditorTextFields` 时）改为 300ms 防抖即时写入、关闭时冲刷，删除草稿、冲突提示与「保存 / 取消」。
- **只读或不可编辑**：不打开源码页，配件栏只给「复制」。

### 3.5 移动端配件栏的源码上下文（A2 / A5）

`apps/mobile/src/features/cards/editorToolbar/`：

- `editingContext.ts` 新增 `source` 上下文：选区折叠在某 void 内且该元素在 `previewActionsMap` 有触屏动作；优先级与媒体同级。删除 `mermaid` 上下文、`context-mermaid` 白名单项与对应渲染分支，白名单新增 `context-source`。
- 配件栏：左端 `KindLabel` 同款标签（块的 `title` / `icon`），中段「编辑」「复制」，右端「⋯」「键盘」。
- 「⋯」用 `ActionSheet`：复制源码、块操作（经 `requestBlockSelection` 进块选择）、删除；插件经 `menu` 贡献的块菜单项按现有 `resolveBlockMenu` 规则并入。
- 「键盘」：`focusAfterMedia` 泛化为 `focusAfterBlock`，媒体与源码块共用。

### 3.6 插件侧

- SDK 的 `SourceBlockEditor` 不加属性。作者文档（`plugins/tau-plugin-template/docs/editor.md`）补一句：移动端源码块由宿主提供源码页与配件栏，`mode` 用通用语言名可获得源码高亮。
- `tau.typst` 自行修复：`mode` 改为 `typst`；在源码预览块内不再自己渲染错误（`useReportPreviewError` 返回 `true` 时交给块显示）；编译改用编译器的结构化诊断格式，错误消息带原始原因与用户源码行号。其他插件不改。

### 3.7 源码编辑器两端统一（桌面源码块迁移）

源码块（插件块、Mermaid、PlantUML、块公式的原位编辑）的编辑器从 CodeMirror 5 换成 `ShikiOverlayEditor`，两端同一组件；桌面 Markdown 文件窗口、Skill 编辑器、代码文件视图的 CodeMirror 不属源码块，不动，`apps/desktop` 保留该依赖。

1. **编辑器归属**：`ShikiOverlayEditor` 与高亮工具（`shikiHighlighter.ts`，含 `.ed-code-overlay` 样式）下沉到 editor-source-view，代码块改从这里引用（代码块本来就依赖 editor-source-view，方向不变）；删除 P1 加的 `@tau/editor/extensions/code-block/overlay` 入口，源码页的 ESLint 边界错误随之消失。
2. **按键行为共用**：代码块输入框已有的撤销重做、Tab / Shift+Tab 缩进、空内容退格删块、上下键到首末行时跳到前后块，抽成 editor-source-view 里的按键处理（经 `ShikiOverlayEditor` 的 `onKeyDown` 与 `OverlayKeydownHelpers`），代码块与源码块共用。CodeMirror 的自动补全括号、智能缩进不再提供（代码块本来也没有）。
3. **`PointerPreviewWithEditor` 换编辑器**：`SourceCodeEditor` 换成 `ShikiOverlayEditor`；原先调用的 CodeMirror 接口按下表改写，`refresh()` 调用删除（不再有 CodeMirror 自绘布局）。

   | 现用 CodeMirror 接口                                     | 改为                                                       |
   | -------------------------------------------------------- | ---------------------------------------------------------- |
   | `getValue` / `setValue`                                  | 控制器 `getValue` / `setValue`（绑定模式经绑定写入）       |
   | `getDoc().setCursor`、`getCursor`、`lastLine`、`getLine` | 控制器与 `OverlayKeydownHelpers` 的同名方法                |
   | `focus`、`refresh`                                       | 控制器 `focus`；`refresh` 删除                             |
   | `onKeyDown(editor, event)`                               | `onKeyDown(event, helpers)`，逻辑并入第 2 步的共用按键处理 |
   | `lineWrapping`（原位模式）                               | `wrap`                                                     |

   原位模式（块公式）的 `delimiters` 布局、在原位模式里按空格 / 回车进入编辑、`preview-editor-focus` 与块导航、失焦冲刷防抖、桌面工具条（编辑 / 复制 / 删除）保持现有行为。

4. **样式**：`.ed-preview-codemirror` 与 `--in-place` 变体改为作用在 `.ed-code-overlay` 外层的源码块样式（底色、字号、内边距沿用现值）；`PreviewWithEditor.vendor.css` 中 `cm-s-tau` 配色等清理步骤 6 再删。
5. **移动端配件栏**：块公式原位编辑的识别从 `.ed-preview-codemirror` 内的 CodeMirror 改为块公式节点内的 `.code-block-shiki-input`；公式符号键改用 `insertIntoTextControl`，删除 `insertSourceText`（取 CodeMirror 实例）。流程图上下文在 P4 随源码上下文一起删除。
6. **移除 CodeMirror（等另一方改动落定）**：删除 `SourceCodeEditor.tsx`、`modes.ts`、`textFieldCodeMirror.ts` 及其测试、`PreviewWithEditor.vendor.css` 的 CodeMirror 部分、`packages/editor/styles.css` 的两条 CodeMirror 样式导入；从 editor-source-view、`packages/editor`、`apps/browser-extension` 的 `package.json` 去掉 `codemirror` / `react-codemirror2` / `@types/codemirror`（删前 `rg` 复核消费者清零）。桌面 Markdown 文件窗口、代码文件视图此前可能借用这里导入的 CodeMirror 基础样式与 mode，删除前逐个确认它们自行导入，缺的补上。
7. **测试**：`preview.test.tsx` 去掉对 `react-codemirror2` 的模拟，改用真实输入框；`packages/editor-collab/src/__tests__/node-tree-source.test.tsx`（真实 CodeMirror 输入写共享字段）改为输入框；桌面 `external-extensions.test.tsx`、`editorOverlayIntegration.test.tsx` 去掉 `react-codemirror2` 模拟与 `.CodeMirror` 断言；移动验证驱动（`validation/host/*`、`validation/spike/verification.ts`）中取 `.CodeMirror` 实例的步骤在 P4 一并改为写输入框。

## 4. 实施计划

每期独立可提交，提交前跑本期验证；视觉由用户验收，问题记进第 6 节清单。

- [x] **P1 共享件抽取（不改行为）**：`useTouchMediaSelection` → `useTouchVoidSelection`；`EmptySourcePlaceholder` 抽出；`ShikiOverlayEditor` 新增导出入口。
      验证：editor、editor-source-view、mobile 现有测试与 `npx tsc --noEmit` 全过。
- [x] **P2 源码页**：`ShikiOverlayEditor` 下沉到 editor-source-view；`SourceEditorPage`（布局、预览 portal、拖动高度、Shiki 编辑区、撤销重做、返回仲裁、非绑定即时写入）。
      验证：新增行为测试——打开 / 返回、输入经绑定写入字段、撤销重做、只读不打开、`OverlayBackDismiss` 返回关闭、预览只挂一份。
- [x] **P2b 桌面源码块换编辑器**（3.7 第 1–5、7 步）：编辑器下沉、按键共用、`PointerPreviewWithEditor` 改写、样式、移动端块公式识别与符号键。
      验证：`preview.test.tsx` 桌面用例全部改为真实输入框后通过（编辑回写、外部更新、方向键跳块、空源码退格、失焦冲刷、原位模式）；代码块现有测试不变通过；editor-collab 源码字段协作用例通过；移动端公式配件栏用例改写后通过；桌面与移动 `tsc --noEmit`、editor-source-view ESLint 无边界错误。
- [x] **P3 正文块**：重写 `TouchPreviewWithEditor`（选中、空态、错误条、宽内容横向滚动、动作登记、`preview-editor-focus` / 块导航）；3.1 判定合一并删除 `sourcePresentation`。
      验证：`preview.test.tsx` 触屏用例改写并补充——点选进 void、插入即打开、退格进入、只读不拦截点击；`rg sourcePresentation` 为空。
- [x] **P4 移动配件栏与验证驱动**：`source` 上下文、按钮与「⋯」、`focusAfterBlock`，删除 `mermaid` 上下文；改写 `apps/mobile/validation/host/editors.ts` / `run.ts` / `center.ts` 的源码步骤（点块 → 「编辑」→ 输入 → 返回；「取消草稿」检查改为撤销检查）。同步 `docs/architecture/mobile.md`「编辑器配件栏与键盘预留」一节，以及 `docs/architecture/desktop.md` 中「源码预览块的编辑与预览归 editor-source-view」那条描述。
      验证：`mobileEditorSourceToolbar.test.tsx` 改写、新增源码上下文识别与「⋯」菜单测试；mobile 构建通过；`pnpm check:docs`。
- [x] **P5 插件与作者文档**：Typst 自身修复；作者文档。发版随插件仓库的提交进行。
      验证：Typst 插件测试；作者文档示例与 SDK 导出一致。
- [x] **移除 CodeMirror**（3.7 第 6 步）：删文件与依赖，`rg` 复核清零，桌面 Markdown 文件窗口与代码文件视图样式自检。
      验证：全仓 `rg "react-codemirror2|codemirror"` 只剩桌面三个非源码块功能；桌面构建、移动构建通过。
- [ ] **收尾**：模拟器跑移动插件原生验证（`plugin-validation` 模式，Android / iOS 各一次，环境不可用则记录未验证项）；交用户视觉验收；按 tasks/README 三步收尾，源码块触屏交互的现状沉淀进 `docs/architecture/mobile.md`。

## 5. 风险

- `ShikiOverlayEditor` 与代码块 v2 改造（「编辑器节点数据契约」任务的 code-step 子节点）并行修改：下沉（3.7 第 1 步）等该任务改动落定后进行，搬移时不改其内部逻辑；合并前重查该文件的变更。
- 桌面源码块换编辑器后失去 CodeMirror 的自动补全括号与智能缩进，书写手感变化，由用户验收时判断是否需要补。
- 长源码（上千行 HTML）每次输入都重新高亮：沿用代码块现状；桌面原地编辑也受影响，P2b 验证时测输入延迟，超标再加降级（超过阈值关闭高亮）。
- 预览 portal 后部分渲染器可能依赖挂载位置测量尺寸（如 Mermaid）：P2 对内置 Mermaid、PlantUML 与五个插件逐一核对。

## 6. 进度与视觉问题清单

- 2026-10-25：完成调研与 mockup，用户确认方案 A 及第 2 节各项；尚未开工。
- 2026-10-25 P1 完成（随后按用户裁决缩减）：保留 `useTouchVoidSelection`（原媒体 `useTouchMediaSelection` 移到 `@tau/editor/api`，四个媒体组件改用）、`parts.tsx` 的 `EmptySourcePlaceholder`（桌面空块改用，`hint` 传动作词）、`@tau/editor/extensions/code-block/overlay` 导出入口（P2 下沉后删除）。为符号行与查看器做的抽取已撤回：`useZoomPanGesture`、`insertIntoTextControl` 迁移、`@tau/editor-source-view/symbols` 全部还原，灯箱与移动端配件栏代码回到原状。
  验证（缩减前）：editor `src/core` + `src/extensions/media` 536 项、editor-source-view 22 项、mobile `src/features/cards` 364 项通过；缩减后三个包 `tsc --noEmit` 无错误。
  未提交：工作区同时有另一方未提交的大量改动（约 436 个文件，含 `PreviewWithEditor.tsx`、`packages/editor/package.json`、`api/index.ts`），且编辑期间仍有文件在变化，本期改动与其混在同一工作区，需由用户决定提交方式。
- 2026-10-25 P2 中途：已写 `SourceEditorPage`、`TouchPreviewWithEditor` 接入（预览 DOM 移入页面、非绑定防抖写回），未跑测试。用户纠正依赖方向、裁决不加 SDK 属性后：源码页去掉符号行与光标键；高亮语言改为 `sourceLanguage.ts` 的通用映射（只换 CodeMirror 自己的 mode 名）。`SourceEditorPage` 直接引用 code-block 的 overlay 入口仍违反 ESLint 边界，`ShikiOverlayEditor` 下沉需等另一方改动落定。
- 2026-10-25 P2 主体完成（未勾选，等 `ShikiOverlayEditor` 下沉）：`SourceEditorPage`（顶栏返回 / 撤销 / 重做，预览区 + 拖动把手，出错时 `ErrorBar` 状态行，原生输入框 + 高亮叠层带行号与换行；键盘收起时底栏给「复制源码」「键盘」）；`TouchPreviewWithEditor` 改为打开源码页，预览 DOM 经稳定挂载点移入页面、块留高度占位，非绑定模式 300ms 防抖写回、返回立即写入、外部改写时页面重置。按钮「编辑{title}源码」「块操作」仍在，P3 移除。
  验证：editor-source-view 4 个文件 27 项通过（新增 `source-page.test.tsx` 8 项：预览移入且只挂一份、绑定即时写入与撤销重做、事件不冒泡、系统返回与 Esc、Activity 隐藏、只读无入口、非绑定防抖与返回写入、外部改写；做过两处变异确认用例能抓到回归；`preview.test.tsx` 删去旧「保存 / 取消」两例，块菜单一例保留）；editor math / diagram / media 176 项、mobile cards 365 项通过；三个包 `tsc --noEmit` 无错误。
  未解决：`SourceEditorPage` 引用 `@tau/editor/extensions/code-block/overlay` 仍有 1 条 ESLint 边界错误，等下沉。保存 / 取消按钮已没有，`apps/mobile/validation/host/` 的原生验证驱动在 P4 改写前跑不通。发现另一任务的 `useTextFieldBinding` 在 Activity 隐藏再显示时报「源码字段已释放」（桌面同样），已记入「编辑器节点数据契约」任务文档，本任务测试改用非绑定模式绕开。预览区按页面高度的比例显示，键盘收起时随页面一起变高。
- 2026-10-25 用户裁决两端统一编辑器：补 3.7 迁移步骤与 P2b、移除 CodeMirror 两期；尚未开始改代码。
- 2026-10-25 P3 完成：`TouchPreviewWithEditor` 正文只显示预览（无按钮），编辑态点按经 `useTouchVoidSelection` 把选区放进块并显示 `ELEMENT_SELECTED_OUTLINE_CLASS` 外框；空块用 `EmptySourcePlaceholder`（「{title} · 点按开始编写」，点按打开源码页）；错误改用 `ErrorBar`，`stale` 时预览降淡；预览容器 `overflow-x-auto`，可继续右滑时右缘渐隐，声明 `center` 的块内容居中、过宽从左缘起滚动；块下保留 `AddParagraph`。新增 `focusRequests.ts` 的 `useSourceFocusRequests`（`preview-editor-focus` 与块导航），桌面 `PointerPreviewWithEditor` 改用同一 hook；`previewActionsMap` 的值改为 `{ title, icon, edit, copySource }`，两端都登记。`sourcePresentation` 字段与全部设置点已删除，`PreviewWithEditor`、`ElementFrame` 改读 `IEditorInteraction`，`rg sourcePresentation` 只剩本文档与 mockup。
  验证：editor-source-view 4 个文件 32 项通过（`source-page.test.tsx` 14 项，新增正文块 6 项：无按钮与点按选中外框、空块占位打开源码页、方向键进入、动作登记与复制、错误条位置、横向滚动容器；只读用例改为验证不拦截预览点击；`preview.test.tsx` 删去依赖「块操作」按钮的一例）；editor `src/core` + math 443 项通过；三个包 `tsc --noEmit` 中 editor-source-view、mobile 无错误，editor 仅另一方新增的 `text-field-activity.test.tsx` 报 1 个类型错误。桌面 `external-extensions` / `editorOverlayIntegration` 8 项、mobile `pluginCenter` 2 项失败，把本任务对 `PreviewWithEditor` 的改动临时还原后桌面同样 8 项失败，报错为「字段未声明文本编辑语义」与插件版本校验，属另一方进行中的改动，未处理。
  P3 与 P4 之间：手机上非空源码块暂时只能经插入、方向键或块菜单「编辑」进入源码页，配件栏的「编辑」在 P4 加上；块操作改由块选择承担（P4 的「⋯」）。
- 2026-10-25 P4 完成：`editingContext.ts` 新增 `source-block` 上下文（`resolveSourceBlockContext`，经 `@tau/editor-source-view/menu` 新导出的 `getPreviewEditorActions` 识别，与媒体同级），删除 `mermaid` 上下文、`context-mermaid` 白名单项与 `MERMAID_SYMBOL_KEYS`（流程图在手机上走源码页，原上下文已无入口），白名单新增 `context-source-block`；`sourceBlockAccessory.tsx` 渲染源码块模式（块名标签、编辑 / 复制、⋯ 块操作与删除、键盘），不可编辑的块不给编辑与删除。块登记的动作增加 `readOnly`。controller 的 `focusAfterMedia` 改为 `focusAfterVoid(place)`，媒体用 `placeCaretAfterMedia`、源码块用新的 `placeCaretAfterBlock`；选中源码块时与媒体一样收起键盘。`TouchPreviewWithEditor` 打开源码页时取消正文选区（配件栏不在页面底下维持本块上下文），用户返回后重新选中本块。验证驱动 `validation/host/` 新增 `sourcePage.ts`（点选块 → 配件栏「编辑」→ 写输入框 → 返回），`run.ts` / `center.ts` / `editors.ts` 改用它，「取消草稿」检查改为源码页「撤销」检查。同步 `mobile.md`（新增「源码块（触屏模式）」条目、上下文与白名单描述）与 `desktop.md`。
  与方案的差异：「⋯」不含「复制源码」（中段已有「复制」）；插件经 `menu` 贡献的块菜单项不并入「⋯」，经「块操作」进入块选择后的「更多」可用，与媒体一致。
  验证：mobile `src/features/cards` 46 个文件 371 项通过（新增 `sourceBlockContext.test.ts` 3 项、`mobileEditorSourceBlockToolbar.test.tsx` 5 项，改写公式 / 媒体 / 控制器用例；两处变异确认新用例能抓到回归）；editor-source-view 33 项通过（新增打开时取消选区、返回后选中本块）；mobile `tsc --noEmit` 无错误，`vite build` 到临时目录通过（仅既有大分包告警）。模拟器原生验证未运行。
  已知：源码页 `z-[400]` 高于移动端 Toast（`Z_INDEX.TOAST` 80），在源码页里点「复制源码」的提示会被页面盖住，记入视觉问题清单；插入新块时源码页由 `focusInsertedPreviewElement` 的定时器打开，不在用户手势内，iOS 不会自动弹出键盘，需再点一下输入框。
- 2026-10-25 P5 完成：调查 Typst 时发现原调用 `compile(…, 0)` 出错时抛出的是 Rust 调试字符串（`[SourceDiagnostic { … }]`），而 `formatDiagnostics` 只认数组，所以两端出错都只显示「Typst 编译失败：编译失败」。改用诊断格式 3：不抛异常，返回 `{ result }` 或 `{ diagnostics: [{ path, range, severity, message }] }`；错误消息改为「第 N 行：<编译器消息>」（行号扣除前置的页面设置行，非用户源码的诊断不带行号），警告不视为失败。`TypstPreview` 在 `useReportPreviewError` 返回 `true` 时不再自己渲染错误；`TypstBlock` 的 `mode` 改为 `typst`（Shiki 自带 Typst 语法；桌面 CodeMirror 无此 mode，按纯文本显示，P2b 后两端一致）。插件 `CHANGELOG.md` 加「未发布」条目。作者文档 `plugins/tau-plugin-template/docs/editor.md`「源码预览块」改为 `field` 绑定写法（原示例仍是已移除的 `initValue` / `onChange`），补 `collaboration.textFields` 要求、`mode` 取值、两端交互说明、`useReportPreviewError` 返回值含义与 `insertSourceBlock` 在手机上的行为。错误行号的 SDK 字段与宿主展示做到一半后按用户裁决撤回，契约与 editor-source-view 回到原状。
  验证：Typst 插件 14 项单测通过（新增结构化诊断格式化、块内不重复渲染错误；删除「字符串诊断视为编译失败」旧断言）；`TYPST_E2E=1` 真实下载编译器的端到端 3 项通过，含真实报错「Typst 编译失败：第 3 行：unknown variable: sun」；插件 `tsc --noEmit` 无错误；editor-source-view 撤回后 33 项通过。插件未构建、未发版。
  注意：Typst 子模块里另一方已有未提交的字段绑定改动（`TypstBlock` 改 `field`、`extension.tsx` 声明 `textFields`、`block.test.tsx`），本期改动与其同在工作区。
- 2026-10-25 P2b 与移除 CodeMirror 完成（用户确认另一方已收敛这部分改动）：`ShikiOverlayEditor`、`shikiHighlighter`、`highlightLineRanges` 及其测试与 `.ed-code-overlay` 样式从 code-block 移到 `packages/editor-source-view/src/overlay/`，经新入口 `@tau/editor-source-view/overlay` 导出（控制器类型改名 `OverlayEditorController` / `OverlayCursorPosition`，code-block 的 `types.ts` 以别名转出，`code-block/runtime` 对外不变）；删除 P1 加的 `@tau/editor/extensions/code-block/overlay` 入口，源码页 ESLint 边界错误消失。代码块按键处理抽成 `overlay/sourceKeys.ts` 的 `handleSourceKeyDown`（字段撤销重做、空块退格删块、首末位置上下键跳块、括号引号成对、Tab / Shift+Tab、回车保持缩进），代码块保留自己的「末尾两个空行回车跳出」后调用它，桌面源码块直接用它——因此桌面源码块新增成对括号与回车缩进，原 CodeMirror 的自动补全括号行为由它承担。`PointerPreviewWithEditor` 改用 `ShikiOverlayEditor`（`wrap` 仅原位模式），容器类改为 `.ed-preview-source` / `--in-place`，`PreviewWithEditor.vendor.css` 只剩这两组外观覆盖。移动端块公式识别改为 `.ed-preview-source` 内的输入框（先于代码块判断），公式符号键统一 `insertIntoTextControl`，删除 `insertSourceText`。删除 `SourceCodeEditor.tsx`、`modes.ts`、`textFieldCodeMirror.ts` 及其测试，`packages/editor/styles.css` 去掉两条 CodeMirror 样式导入并改指新样式路径；editor-source-view、`packages/editor`、`apps/browser-extension` 去掉 `codemirror` / `react-codemirror2` / `@types/codemirror`，editor-source-view 新增 `shiki` / `shiki-magic-move`（`pnpm install --offline` 更新锁文件）。桌面 Markdown 文件窗口、代码文件视图、Skill 编辑器各自导入 CodeMirror 样式与 mode，保留依赖。
  测试改写：`preview.test.tsx` 去掉 `react-codemirror2` 模拟、改用真实输入框（10 项，新增成对括号一项）；editor-collab `node-tree-source.test.tsx` 改为输入框写共享字段、远端变化、撤销与 Activity 恢复；桌面 `external-extensions` / `editorOverlayIntegration` 去掉 `react-codemirror2` 模拟，前者补 jsdom `Range.getBoundingClientRect` 桩（源码块进入编辑会聚焦真实输入框，后续斜杠菜单用例读取选区位置）；移动 `editingContext` / 公式配件栏 / `sourceEditorInput` 测试改为输入框；spike 验证驱动改写输入框。
  验证：editor 139 个文件 815 项、editor-source-view 42 项、editor-collab 70 项、mobile cards 368 项通过；editor、editor-source-view、mobile、desktop、browser-extension `tsc --noEmit` 无新增错误（editor 仅另一方 `text-field-activity.test.tsx` 1 处）；改动文件 ESLint 无错误；mobile 与 desktop 渲染层 `vite build` 到临时目录通过；`rg` 复核 CodeMirror 只剩桌面三个非源码块功能。桌面 `src/services` + markdown-window + skills 76 个文件中 14 项失败，均非本任务：plantuml、块公式两项因本次改动转为通过；仍失败的为「字段未声明文本编辑语义」（custom-block / HTML，另一方字段绑定迁移）、`compiledFrom` 断言（另一方已删 Mermaid SVG 缓存，测试未同步）、`preview-workbench`「完成」按钮（块公式早已改为原位编辑）、代码块 code-step 在本地 Markdown 文档里 `textBinding` 为 `null` 时输入框不受控（另一方新增的 `textBinding` 分支）、宿主扩展未装载、项目引用身份等。
- 2026-10-25 修复 `ShikiOverlayEditor` 在 `textBinding` 为 `null`（绑定未就绪或文档不支持字段）时把输入框当成非受控、显示为空：只有拿到绑定才交给绑定写入，否则按受控 `value` 显示与编辑（`value={textBinding ? undefined : value}`）。曾考虑按绑定状态给输入框换 `key` 以避免受控切换告警，实测 React 对 textarea 的这次切换不告警、去掉 `key` 行为一致，按简单写法处理。新增用例「绑定就绪前显示传入的源码并按受控方式编辑，就绪后改由绑定写入」，变异确认能抓到原问题；editor-source-view 43 项、code-block 31 项、editor-collab 70 项通过。另一方已修复 Activity 隐藏后「源码字段已释放」，`source-page.test.tsx` 的隐藏用例改回字段绑定模式并通过。
  未解决（另一方范围）：桌面 Markdown 文件窗口的两项代码块测试只恢复了一半——首屏显示已正确（`getValue()` 为原文），但输入后不落库。该窗口的文档经 `createLocalYjsDocument` 创建，不注册 `IEditorTextFields`，而带文档绑定时 `CoreEditor` 不提供本地字段，于是代码块 v2 的 code-step 与所有 `field` 绑定的源码块在该窗口里绑定始终为 `null`、只读。「编辑器节点数据契约」任务已退役为 `docs/notes/2026-10-25-editor-collaboration-verification.md`（一次性快照，不再追加），缺口只记在本条；复现为 `apps/desktop/src/features/markdown-window/markdown/__tests__/markdownYjsExtensions.test.tsx` 与 `MarkdownRichSurface.test.tsx` 的代码块用例。
- 2026-10-25 修复本地 Y.Doc 文档不提供源码字段服务（用户要求在本任务内处理）：`@tau/editor/api` 新增 `slateTextFields`（`core/api/slateTextFields.ts`，每个编辑器首次打开字段时用 `createLocalTextFields` 建一份，按该编辑器装配的节点声明校验 `textFields`）；`createLocalTextFields` 的第二个参数也可传按类型查找声明的函数，头注释改为说明它适用于以节点属性承载源码的文档。`createLocalYjsDocument` 经 `services` 注册它，于是桌面 Markdown 文件窗口与 `useLocalEditorDocument`（视频笔记导出草稿、网页项目摘录）里的代码块 v2 与 `field` 绑定的源码块可编辑：写入经 Slate 操作由 slate-yjs 进 Y.Doc，撤销走文档的 UndoManager。同步 `docs/architecture/collaboration.md` 与 `packages/editor-collab/README.md`。桌面两项代码块测试的断言原按代码块 v1（源码在块上）写，改为 v2 形状（源码在 `code-step` 子节点上）后通过，含撤销。顺带修正 P2b 改写 spike 验证驱动时 `until` 无返回值导致的 1 处类型错误。
  验证：editor-collab 新增「源码字段经 field 绑定在本地文档里可编辑」（写入 Y.Doc、外部更新同步、撤销、未声明字段拒绝），变异确认去掉注册后该用例与桌面代码块用例都失败；editor 815 项、editor-collab 71 项、editor-source-view 43 项通过；桌面 `src/services` + markdown-window + skills + hooks 已回归 435 项全部通过（90 个文件，0 失败、0 跳过）：同步公式与 Mermaid 行为断言、项目身份夹具及宿主初始化，更新自定义块与 HTML 插件产物和固定夹具，并补齐首次 HTML 导出的插件契约准备；editor（另一方 1 处除外）、editor-source-view、mobile、desktop、browser-extension `tsc --noEmit` 无错误。
