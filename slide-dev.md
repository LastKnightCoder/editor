# Slide 制作与演示系统技术方案（Codex Slide Dev）

## 1. 背景与目标

- 将 `@Editor`（Slate + 自研扩展）升级为可沉浸式制作 Slide 的工作区，支持逐页编辑与 PPT 类侧边导航。
- 复用 slidev 的优势（配置化尺寸、等比缩放、Presenter notes、v-click 动画等），但输入改为所见即所得数据结构而非 Markdown。
- 让编辑态与演示态的排版 100% 一致，演示时按定义的 `width * height`、字体基准等比缩放。
- 支持注释（Presenter Notes + 第二屏提示）和基础动画，后续扩展至复杂编排。
- 方案需具备插件化扩展点，可逐步演进到主题市场、导出为网页/PDF。

## 2. slidev 核心机制拆解

### 2.1 Markdown → AST → Slide

- `@slidev/parser`（`slidev/packages/parser/src/core.ts`）负责：
  - 以 `--- frontmatter/yaml` 识别 slide 元数据（title、layout、clicksStart 等），生成 `SlidevMarkdown`。
  - 将 `<!-- ... -->` 末尾注释解析为 Presenter notes。
  - `SlidevDetectedFeatures` 统计是否使用 KaTeX、Monaco、Mermaid、Tweet 等，用于按需加载。

- Parser 输出 `SlideInfo` 列表，包含 `frontmatter`、`content`、`note`、`revision`，后续交给 runtime。

### 2.2 渲染与缩放

- `slidev/packages/client/internals/SlideContainer.vue` 动态计算缩放：

  ```TS
  const scale = Math.min(containerWidth / slideWidth, containerHeight / slideHeight)
  ```

  并写入 CSS 变量 `--slidev-slide-scale`，确保编辑/预览/导出一致。

- `SlidesShow`、`SlideWrapper` 通过 `renderContext`（`slide`/`overview`/`presenter` 等）复用同一渲染组件。

### 2.3 Presenter & Notes

- `pages/presenter.vue` 将主屏、下一页预览、Notes、控制条放在独立窗口，使用共享状态 `sharedState` 同步当前页、点击数、指针位置。
- Notes 支持编辑（dev）与只读（prod），并可调字号（`presenterNotesFontSize`）。

### 2.4 动画（v-click）

- `modules/v-click.ts` / `types/src/clicks.ts` 使用 `ClicksContext` 维护当前点击序号，`v-click`/`v-clicks`/`v-click-hide` 等指令把元素与点击区间绑定。
- Slide frontmatter 可声明 `clicksStart`/`clicks`, 并在 Presenter、导出、打印模式中统一生效。

> 以上机制为我们设计 WYSIWYG 方案时的“标杆”：抽象清晰的 Data → Render → 控制流、等比缩放、Presenter 双屏、点击序列和插件式扩展。

## 3. 总体架构设计

```
┌────────────┐   ┌────────────────┐   ┌───────────────┐   ┌─────────────┐
│ Slide Store│→→│ Slide Workspace │→→│ Slide Runtime  │→→│ Renderer    │
│ (SQLite/IPC│   │ (@Editor + UI) │   │ (AST→ViewModel)│  │ (React/Vite)│
└────────────┘   └──────┬─────────┘   └──────┬─────────┘   └────┬────────┘
                         │                   │                   │
                         ↓                   ↓                   ↓
                 Plugin Pipeline      Animation Engine     Presenter/Export
```

- ​​**数据平面**：SQLite `slide_*` 表 + IPC Commands，Zustand `useSlideDeckStore` 缓存。
- ​​**编辑平面**：`SlideWorkspace` 页面，中心 `SlideEditorView`（沉浸式），侧边 `NavigatorPanel` / `InspectorPanel`。
- ​​**渲染平面**：`SlideRuntime` 将 Slate AST 转成主题感知的虚拟节点树，`SlideViewport` 执行等比缩放。
- ​​**控制平面**：`SlideController` 统一处理导航、点击序列、Presenter 同步、导出。
- ​​**插件平面**：借鉴 `slidev` 的 preparser/theme/exporter 思路，新增 WYSIWYG 可视插件。

## 4. 数据结构与库表

### 4.1 SQLite 表

1. `slide_decks`

| 字段                      | 类型       | 说明                                   |
| ------------------------- | ---------- | -------------------------------------- |
| `id` PK                   | INTEGER    | Deck 主键                              |
| `title`                   | TEXT       | 名称                                   |
| `width`/`height`          | INTEGER    | 设计尺寸，默认 1280×720                |
| `base_font_scale`         | REAL       | 字体基准（1.0=16px）                   |
| `theme_id`                | TEXT       | 主题/模板                              |
| `thumbnail`               | TEXT       | 缩略图 url                             |
| `metadata`                | TEXT(JSON) | 自定义配置（背景、动画默认、插件开关） |
| `created_at`/`updated_at` | INTEGER    | 时间戳                                 |

1. `slide_pages`

| 字段          | 类型       | 说明                     |
| ------------- | ---------- | ------------------------ |
| `id` PK       | INTEGER    |                          |
| `deck_id` FK  | INTEGER    | 关联 deck                |
| `index`       | INTEGER    | 顺序                     |
| `content`     | TEXT(JSON) | Slate Descendant[]       |
| `note`        | TEXT(JSON) | Presenter Notes（Slate） |
| `background`  | TEXT(JSON) | 局部样式                 |
| `clicks_meta` | TEXT(JSON) | 预计算的点击序列         |
| `animations`  | TEXT(JSON) | 高级动画轨道             |
| `version`     | TEXT       | revision/etag            |
| `deleted`     | INTEGER    | 软删                     |

1. `slide_assets`

- 记录 deck 级别引用的媒体、字体、插件配置，方便导出。

1. `slide_animation_tracks`（可选）

- 将复杂动画拆分为独立表，字段：`page_id`、`element_path`、`trigger`, `effect`, `timeline`.

> ​**与现有内容体系协同**：可仿照 `slide-claude.md` 中 `content_id`/`speaker_notes_content_id` 的设计，为 `slide_pages` 增加 `content_id`、`note_content_id`（或直接复用现有 `contents` 表的主键），从而让幻灯片页与 Notes 共享我们的富文本存储、附件、历史版本与全文检索。`slide_decks.metadata.storageMode` 用于标记某个 deck 是“引用型”（存储 ID）还是“内嵌型”（直接存 JSON），迁移旧文档时只需批量写入 ID，并继续沿用当前备份/同步策略。

### 4.2 TypeScript 模型

```TS
type SlideElementPath = string; // Slate path, 如 "0-1-2"

interface SlideDeck {
  id: number;
  title: string;
  size: { width: number; height: number };
  baseFontScale: number;
  themeId: string;
  metadata: Record<string, any>;
  pages: SlidePage[];
}

interface SlidePage {
  id: number;
  deckId: number;
  index: number;
  content: Descendant[];
  note: Descendant[];
  background: SlideBackground;
  clicks: SlideClickSpec[];
  animations: SlideAnimation[];
  revision: string;
}

interface SlideClickSpec {
  id: string;
  targetPath: SlideElementPath[];
  enterAt: SlideClickAt; // number | '+1' | [start, end]
  exitAt?: SlideClickAt;
  effect?: 'fade' | 'scale' | 'none';
}

interface SlideAnimation {
  id: string;
  targets: SlideElementPath[];
  trigger: { type: 'click'; at: SlideClickAt } | { type: 'timeline'; ms: number };
  effect: { type: 'preset'; name: 'fade' | 'pop' | 'slide'; params?: Record<string, any> };
  persist?: boolean;
}
```

`SlideClickAt` 与 slidev 的 `NormalizedAtValue` 对齐，方便互导。

### 4.3 版本与同步

- 每个 page 保存 `revision`（hash），对比 slidev `parseSlide` 的 `hash(raw)` 逻辑，可快速判断是否需要刷新 Presenter。
- IPC 命令：`slide:getDeck`, `slide:savePage`, `slide:duplicatePage`, `slide:export`.
- `AutoSyncManager` 可监听 `slide:*` channel，实现云同步。

## 5. 编辑器与工作区

### 5.1 视图布局

1. ​​**沉浸式单页模式**：只显示当前 Slide，背景填充屏幕（黑/白/主题色），四周留 24px padding，隐藏多余 UI。
2. ​​**PPT 式导航**：左侧 `NavigatorPanel`（垂直缩略图，支持拖拽排序、分组），可折叠。
3. ​​**双模式切换**：快捷键 `F11` 或 UI 切换沉浸/导航模式，遵循 slidev 的 `Overview` 概念（`src/components/PresentationMode/components/OverviewMode`）但在编辑态即可使用。
4. ​​**右侧属性面板**：`InspectorPanel` 用于调节布局、主题、动画、Notes。

### 5.2 `@Editor` 扩展

- 新增 Node：
  - `slide-page`：每页根节点，控制 `width/height/fontScale`。
  - `slide-divider`：用于从旧文档自动拆分（兼容当前 `type === "divide-line"`）。
  - `slide-element`：封装与动画绑定的元素（文本框、图片、代码块等），附带 `data-slide-id`。

- 插件：
  - `withSlidePagination`：在 Slate tree 中维护 Page 切片，与 `useSlides` hook 一致但更可靠。
  - `useSlideHotkeys`：`Ctrl+Enter` 新增下一页、`Ctrl+Shift+D` 复制。
  - `SlideHoverToolbar`：仅在当前页显示工具条，聚焦体验类似 Keynote。
  - `SlideThemeVariables`：将 deck/theme 变量注入 CSS，自适应 dark/light。

### 5.3 导航与交互

- Navigator 缓存每页的缩略图（通过 `SlideRenderer` 输出 canvas 或使用 `snapshotManager` 方案）。
- 支持批量选中/拖拽、多级大纲（参考 slidev TOC，frontmatter `level`、`title` 自动生成）。
- 搜索/命令面板：复用 `useCommandPanelStore`，新增 `Goto Slide` 命令。

### 5.4 模板与主题

- Deck metadata 中记录 `themeId` 与主题变量（配色、字体、装饰），渲染层读取并注入 CSS。
- 未来可在 `packages/themes` 目录放主题包，结构参考 slidev `resources/theme-gallery`。

## 6. 渲染与演示

### 6.1 SlideRuntime → SlideRenderer

1. ​​**AST 归一化**：`SlideRuntime.normalize(page.content)`，生成 `RuntimeNode`，补齐 layout props。
2. ​​**主题注入**：根据 deck/theme 生成 CSS 变量，使用 Less/Tailwind token（参考 `src/themes`）。
3. ​​**渲染组件**：`<SlideRenderer page={page} context="editor" />`，内部包含：

- `SlideViewport`：等比缩放（复刻 slidev `SlideContainer` 逻辑）。
- `SlideLayerStack`：背景层、主内容层、辅助层（动画/选区/标尺）。
- `AnimationLayer`：渲染 `click` 状态和 timeline 动画。

### 6.2 尺寸与缩放

- Deck 级别 size 由用户设置，页面 `style` 中写入 `--slide-width/height`。
- `SlideViewport` 算法：

  ```TS
  const wScale = containerWidth / deck.width;
  const hScale = containerHeight / deck.height;
  const scale = Math.min(wScale, hScale);
  ```

  - 写入 `--slide-scale`，并将 `font-size` 设为 `baseFontScale * scale * 16px`。
  - 在编辑态允许用户强制缩放（类似 slidev `slideScale` setting）。

### 6.3 演示模式

- `SlidePresentationMode`（升级版 `src/components/PresentationMode`）：
  - 使用 `SlideRenderer` 的 `renderContext="presenter"`。
  - 继承 `useSlides` / `useKeyboardNavigation`，但数据来源改为 `SlideDeckStore`（而非一次性 Descendant）。
  - 观众屏：仅显示当前页，支持 `Overview`。
  - Presenter 屏：
    - 主内容 + 下一页预览 + Notes（富文本） + 点击进度条。
    - `sharedState`（Zustand + electron IPC）同步当前页号、Clicks、Pointer（仿照 slidev `sharedState.cursor`）。
    - Notes Pane 支持“编辑/只读”两种模式。

  - 注释 Overlay：复用 `WhiteBoard` or `Drauu` 能力，在 presenter 屏绘制并同步至主屏。

### 6.4 注释 & 双屏

- Electron 新增 `SlidePresenterWindow`，`BrowserWindow` 参数 `fullscreen: false` + `alwaysOnTop`.
- 主窗口通过 IPC `slide:presenter-update` 推送状态；Presenter 窗口可 `requestPointerCapture` 并将位置回传。
- Notes 数据来自 `slide_pages.note`，支持 Slate 渲染 + Markdown 导出。

### 6.5 导出/发布

- ​​**网页预览**：使用 Vite + React + `SlideRuntime` 打包成静态 SPA，可放入 `dist/slides/{deckId}`。
- ​​**PDF/图片**：利用 `electron` `BrowserWindow` + `webContents.printToPDF` 或无头 Chromium。
- ​​**Slidev 互导**：调用 `@slidev/parser`（已有源码）将 WYSIWYG 内容序列化为 Markdown + frontmatter，或反向解析导入。

## 7. 动画与点击系统

### 7.1 数据建模

- `SlideClickSpec` 与 slidev `v-click` 对齐，字段 `enterAt`/`exitAt` 允许绝对（数字）或相对（`'+1'`）值。
- 复杂动画用 `SlideAnimation`（触发器 + 效果 + 目标）。
- Page frontmatter（`slide_pages.background`）可缓存 `clicksTotal`，类似 slidev `frontmatter.clicks`.

### 7.2 运行时

- `useSlideClicks(page)` 生成 `ClicksContext`：

  ```TS
  const ctx = createClicksContext({
    start: frontmatter.clicksStart ?? 0,
    total: inferredTotal,
  })
  ```

  - `SlideElement` 渲染时注册自己到 `ctx`, 依赖 `data-slide-id`.
  - `SlideController.next()`/`prev()` 修改 ctx.current，驱动 enter/leave class。

- 动画执行：
  - 基础：通过 CSS class（`.slide-click-enter`, `.slide-click-leave`）+ `opacity/transform`。
  - 扩展：引入 `framer-motion` 或 `react-spring`，`SlideAnimationRuntime` 将 effect 映射成帧动画。

### 7.3 未来扩展

- 时间轴模式：`trigger.type='timeline'`，允许延迟/自动播放。
- 元素级复用：把 `SlideAnimation` 抽象为插件 Hook，可在 `plugins/slide-animations` 注册自定义 effect。

### 7.4 动画组件与面板实现细节（借鉴 slide-claude）

- ​**BlockAnimationMark**：在 Slate 节点属性上增加 `slideAnimation` 字段，包含 `clickOrder`、`withPrevious`、`enterAnimation`（`type/duration/delay/easing`）、`exitAnimation` 等配置，映射到 `SlideClickSpec` 与 `SlideAnimation`，并直接被 Inspector 面板读取。
- ​**AnimatedBlock**：对带有 `slideAnimation` 的节点，渲染时包裹 `AnimatedBlock` 组件（基于 `framer-motion`），由 `ClicksContext.calculateVisibility` 判断是否进入/可见/离场，在 `isEntering` 时播放 `enterAnimation`，在 `isVisible=false` 时按配置淡出，实现 `v-click`、`v-click-hide` 等效果。
- ​**动画面板**：右侧 `AnimationPanel` 显示当前页所有动画块的时间线：
  1. 列表区域支持拖拽排序（可采用 `@dnd-kit`），实时更新 `clickOrder` 和 `withPrevious`。
  2. 属性区域提供动画类型、持续时间、缓动函数、延迟等字段的下拉或滑杆选择。
  3. 面板底部提供“模拟播放”按钮，驱动 `ClicksContext` 自动递增，方便预览；同时可锁定到指定块，检查 enter/exit 行为。

- ​**页面过渡**：在 `slide_pages.background` 中追加 `transitionConfig`，由 `PageTransition` 组件读取，在 `SlideController.goToSlide` 时结合路由方向触发（fade/slide/zoom/flip），与块级动画共享同一配置结构，方便主题或插件扩展预设。

## 8. 插件式架构

### 8.1 Pipeline Hook

- 设计 `SlidePlugin` 接口：

  ```TS
  interface SlidePlugin {
    name: string;
    onLoadDeck?(deck: SlideDeck): Promise<void>;
    transformPage?(page: SlidePage, context: RenderContext): SlidePage;
    providePanelWidgets?(): ReactNode;
    registerShortcuts?(): void;
  }
  ```

- 执行顺序：`load deck → run plugin.onLoadDeck → editor/render`.

### 8.2 主题插件

- Theme 包输出 `theme.css` + `theme.json`（色板、字体、组件），`SlideRenderer` 在运行时注入。
- 参照 slidev 的 theme 包结构（`package.json` 中 `slidev` 字段），可重用 CLI 打包逻辑。

### 8.3 动画/导出插件

- 导出插件实现 `SlideExporter` 接口，支持 `pdf`, `png`, `html`, `slidev-md` 等。
- 动画插件可注册 effect 列表，供 Inspector 选择。

## 9. 与 slidev 的互操作

1. ​​**导入 slidev**：

- 调用 `@slidev/parser` 读取 `.md`，把 `SlideInfo.content` 转成 Slate AST（Markdown → Slate 已有转换器）。
- Frontmatter 映射：`title`、`layout`、`clicks`、`background` → page metadata；`note` → `slide_pages.note`.

1. ​​**导出 slidev**：

- 将 deck metadata 转成 global frontmatter（尺寸 `layout`, `theme` 等）。
- 每页序列化：`frontmatterDoc` + 内容（Markdown）+ `<!--note-->`。

1. ​​**共享 runtime**：

- 将 `SlideRenderer` 封装成可运行于 React/Vite 页面，导出 `deck.json` + assets → static site，达到 slidev “编译为网页” 的效果。

## 10. Markdown 序列化与还原

- ​**导出为 Markdown**：复用现有的 `markdownSerializerRegistry`（`src/utils/markdownSerializerRegistry.ts`）与 `getMarkdown`（`src/utils/markdown-helper.ts`）能力。具体做法：
  1. 将每个 `SlidePage.content` 传入 `getMarkdown`，得到 Slate → Markdown 的内容串；Notes 同样转换后以 `<!-- ... -->` 存放在页面末尾。
  2. 使用 deck / page metadata 生成 frontmatter（尺寸、主题、clicks、动画配置等），格式与 slidev 保持一致，这样导出的 `.md` 可以直接被 slidev 解析。
  3. 依次拼接 `--- frontmatter ---` + Markdown 内容，幻灯片之间用空行或 `---` 分隔，最终写入 `.md` 文件。
  4. `SlideExporter` 插件新增 `markdown` 选项，对外提供“一键导出 slidev Markdown”。

- ​**从 Markdown 还原**：基于 `src/utils/markdown.ts` 中的 `markdownToDescendant`、`remark-*` pipeline，实现 `slide:import-markdown`：
  1. 使用 `@slidev/parser` 或自研切分逻辑识别 frontmatter/notes，得到每页 AST。
  2. 逐页调用 `markdownToDescendant`（现有 Markdown → Slate 逻辑）恢复 `Descendant[]`，并根据 frontmatter 写入 `SlidePage.background`、`clicks`, `animations`。
  3. Notes 用相同流程解析 `<!-- -->` 内的 Markdown。
  4. 若某些自定义指令/组件未覆盖，可在 `markdownSerializerRegistry` 注册额外的序列化器，或在 `SlidePlugin` 提供 `serializeMarkdown/deserializeMarkdown` 钩子，供插件扩展特殊节点。

- ​**互导一致性校验**：导出后重新导入进行快照对比（例如生成 JSON hash 或截图），确保 Slate ↔ Markdown 循环不会丢失结构。对于不支持的节点，前端弹出提示，引导用户用插件补齐。

## 11. 迭代路线

1. ​​**Phase 1（MVP）**

- 完成 `slide_decks`/`slide_pages` CRUD + `SlideWorkspace` UI。
- 提供沉浸式编辑 + 左侧导航 + 简易 Presenter（仅当前页）。
- 支持 Notes（富文本）与演示界面一致缩放。
- ​**拆解任务（借鉴 slide-claude 的 Step 1~4）**：
  1. 数据层：创建 `slide_*` 表、实现 IPC/命令、打通 `content_id` 模式。
  2. 基础渲染：落地 `SlideViewport` + `SlideRenderer`（无动画），对接现有 Editor 扩展。
  3. 编辑器框架：导航模式、页面增删/拖拽、Tab/路由、命令面板。
  4. 演示窗口：独立全屏播放、键鼠导航、进度显示。

1. ​​**Phase 2（Presenter & 动画）**

- 实现双屏 Presenter、点击序列（v-click 等价）、基础动画效果。
- 导出静态网页（Vite 构建）与 PDF。
- ​**拆解任务**：
  1. 沉浸式编辑/Notes 面板/模式切换。
  2. `ClicksContext`、`AnimatedBlock`、动画属性 UI（BlockAnimationMark）。
  3. Presenter 窗口：当前页/下一页/Notes/控制条，`BroadcastChannel` + IPC 同步，指针/注释支持。

1. ​​**Phase 3（插件 & 互导）**

- 完成 SlidePlugin API、主题系统、Slidev 导入导出。
- 新增复杂动画（时间轴）、注释同步、录制/直播等高级功能。
- ​**拆解任务**：
  1. 动画时间线面板、页面过渡、动画/主题插件对接。
  2. 缩略图缓存、PDF/图片导出、虚拟滚动优化。
  3. Slidev Markdown 互导、静态站点编译链路、插件市场规范。

## 12. 风险与应对

- ​​**性能**：大文档多页渲染 → 通过虚拟滚动 + 缓存缩略图 + Slate Chunking（已有 `getChunkSize`）降低重排。
- ​​**数据兼容**：旧文档 `divide-line` 拆分可能丢格式 → 编写迁移脚本，将 `Descendant[]` 拆成 `slide_pages`。
- ​​**双屏同步**：Presenter 窗口与主窗口状态不一致 → 使用 `sharedState` + IPC ack，必要时引入 `BroadcastChannel`.
- ​​**动画稳定性**：点击序列/动画组合复杂 → 借鉴 slidev `ClicksContext`，保持 deterministic，增加单测。
- ​​**插件安全**：第三方主题/插件访问本地资源 → 在 Electron preload 层限制可调用 API，提供沙箱。

---

通过以上设计，我们可以在保持现有 `@Editor` 写作体验的同时，实现类似 slidev 的沉浸式幻灯片制作、呈现与扩展能力；并能在未来无缝引入主题、插件、导出等生态。
