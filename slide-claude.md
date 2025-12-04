# Slide 演示功能技术方案（融合版）

## 一、概述

基于 slidev 的核心理念，结合项目现有的 Slate Editor 和 WhiteBoard 架构，设计一套完整的 Slide 演示功能。本方案融合了两份技术设计的优点。

### 核心特性

- ​**双编辑模式**：沉浸式单页编辑 + 导航式编辑（左侧缩略图 + 右侧主编辑区）
- ​**等比缩放渲染**：编辑和演示效果完全一致
- ​**动画系统**：独立动画配置层 + 可视化动画面板
- ​**演讲者模式**：双屏演示（投影屏 + 演讲者屏含注释）+ 指针同步 + 注释 Overlay
- ​**插件式架构**：动画、过渡、主题、导出可扩展
- ​**Slidev 互操作**：支持导入/导出 slidev 格式

---

## 二、总体架构设计

```
┌────────────┐   ┌────────────────┐   ┌───────────────┐   ┌─────────────┐
│ Slide Store│→→│ Slide Workspace │→→│ Slide Runtime  │→→│ Renderer    │
│ (SQLite/IPC│   │ (@Editor + UI) │   │ (AST→ViewModel)│  │ (React)     │
└────────────┘   └──────┬─────────┘   └──────┬─────────┘   └────┬────────┘
                        │                    │                   │
                        ↓                    ↓                   ↓
                Plugin Pipeline      Animation Engine     Presenter/Export
```

### 五层平面架构

1. ​**数据平面**：SQLite `slide_decks`/`slide_pages` 表 + IPC Commands，Zustand `useSlideDeckStore` 缓存
2. ​**编辑平面**：`SlideWorkspace` 页面，中心 `SlideEditorView`，侧边 `NavigatorPanel` / `InspectorPanel`
3. ​**渲染平面**：`SlideRuntime` 将 Slate AST 转成主题感知的渲染树，`SlideViewport` 执行等比缩放
4. ​**控制平面**：`SlideController` 统一处理导航、点击序列、Presenter 同步、导出
5. ​**插件平面**：`SlidePlugin` 接口支持主题、动画、导出扩展

---

## 三、数据结构设计

### 3.1 数据库表结构

#### 内容存储模式 (storageMode)

为了灵活支持不同场景，设计两种内容存储模式：

| 模式        | 说明                                 | 适用场景                                       |
| ----------- | ------------------------------------ | ---------------------------------------------- |
| `reference` | 通过 `content_id` 引用 `contents` 表 | 默认模式，复用现有内容管理、版本历史、全文检索 |
| `embedded`  | 直接在 `slide_pages` 中存储 JSON     | 导出/导入、离线场景、快速迁移                  |

在 `slide_decks.metadata` 中通过 `storageMode` 字段标记：

```TYPESCRIPT
interface SlideDeckMetadata {
  storageMode: 'reference' | 'embedded';
  // 其他配置...
}
```

#### slide_decks 表（幻灯片集合）

```SQL
CREATE TABLE IF NOT EXISTS slide_decks (
  id INTEGER PRIMARY KEY NOT NULL,
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT DEFAULT '[]',
  -- 尺寸配置
  width INTEGER NOT NULL DEFAULT 1920,
  height INTEGER NOT NULL DEFAULT 1080,
  base_font_scale REAL NOT NULL DEFAULT 1.0,
  -- 主题
  theme_id TEXT,
  theme_config TEXT,  -- SlideTheme JSON
  -- 页面顺序
  page_ids TEXT DEFAULT '[]',
  -- 元数据
  metadata TEXT DEFAULT '{}',
  -- 缩略图
  thumbnail TEXT,
  -- 软删除
  deleted INTEGER DEFAULT 0
);
```

#### slide_pages 表（单页幻灯片）

```SQL
CREATE TABLE IF NOT EXISTS slide_pages (
  id INTEGER PRIMARY KEY NOT NULL,
  deck_id INTEGER NOT NULL,
  create_time INTEGER NOT NULL,
  update_time INTEGER NOT NULL,
  page_index INTEGER NOT NULL,
  -- 内容（复用 contents 表）
  content_id INTEGER NOT NULL,
  -- 演讲者注释
  speaker_notes_content_id INTEGER,
  -- 页面样式
  background TEXT,  -- SlideBackground JSON
  style_override TEXT,
  -- 动画配置（独立于内容）
  clicks_config TEXT DEFAULT '{}',  -- SlideClicksConfig JSON
  animations TEXT DEFAULT '[]',  -- SlideAnimation[] JSON
  -- 页面过渡
  transition_config TEXT,
  -- 版本控制
  version TEXT,
  -- 缩略图
  thumbnail TEXT,
  -- 软删除
  deleted INTEGER DEFAULT 0,

  FOREIGN KEY (deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE,
  FOREIGN KEY (content_id) REFERENCES contents(id)
);
```

#### slide_assets 表（资源引用，便于导出）

```SQL
CREATE TABLE IF NOT EXISTS slide_assets (
  id INTEGER PRIMARY KEY NOT NULL,
  deck_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,  -- 'image' | 'font' | 'video' | 'audio'
  asset_url TEXT NOT NULL,
  local_path TEXT,
  create_time INTEGER NOT NULL,

  FOREIGN KEY (deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE
);
```

### 3.2 核心 TypeScript 类型

```TYPESCRIPT
// src/types/slide.ts

// ============ 基础配置 ============

interface SlideDeck {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  description?: string;
  tags: string[];
  // 尺寸
  width: number;
  height: number;
  baseFontScale: number;
  // 主题
  themeId?: string;
  themeConfig?: SlideTheme;
  // 页面
  pageIds: number[];
  pages?: SlidePage[];  // 懒加载
  // 元数据
  metadata: Record<string, any>;
  thumbnail?: string;
  deleted?: boolean;
}

interface SlidePage {
  id: number;
  deckId: number;
  createTime: number;
  updateTime: number;
  pageIndex: number;
  // 内容
  contentId: number;
  content?: Descendant[];  // 懒加载
  // 注释
  speakerNotesContentId?: number;
  speakerNotes?: Descendant[];
  // 样式
  background?: SlideBackground;
  styleOverride?: Record<string, any>;
  // 动画（独立配置层）
  clicksConfig: SlideClicksConfig;
  animations: SlideAnimation[];
  // 过渡
  transitionConfig?: TransitionConfig;
  // 版本
  version?: string;
  thumbnail?: string;
  deleted?: boolean;
}

// ============ 主题系统 ============

interface SlideTheme {
  id: string;
  name: string;
  background: SlideBackground;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    textSecondary: string;
    accent: string;
  };
  fonts?: {
    heading: string;
    body: string;
    code: string;
  };
  codeTheme?: string;
}

interface SlideBackground {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

// ============ 动画系统（独立配置层）============

/** 元素路径（Slate path 字符串化） */
type SlideElementPath = string;  // 如 "0-1-2"

/** 点击时机 */
type SlideClickAt = number | `+${number}` | [number, number];

/** 点击配置 */
interface SlideClicksConfig {
  /** 起始点击序号 */
  clicksStart: number;
  /** 总点击数（可覆盖自动计算） */
  clicksTotal?: number;
  /** 点击规格列表 */
  clicks: SlideClickSpec[];
}

/** 单个点击规格 */
interface SlideClickSpec {
  id: string;
  /** 目标元素路径 */
  targetPaths: SlideElementPath[];
  /** 进入时机 */
  enterAt: SlideClickAt;
  /** 退出时机（可选） */
  exitAt?: SlideClickAt;
  /** 进入效果 */
  enterEffect?: AnimationEffect;
  /** 退出效果 */
  exitEffect?: AnimationEffect;
}

/** 高级动画（时间轴触发等） */
interface SlideAnimation {
  id: string;
  targets: SlideElementPath[];
  trigger:
    | { type: 'click'; at: SlideClickAt }
    | { type: 'timeline'; ms: number }
    | { type: 'afterPrevious'; delay?: number };
  effect: AnimationEffect;
  persist?: boolean;
}

/** 动画效果 */
interface AnimationEffect {
  type: 'fade' | 'slide' | 'zoom' | 'bounce' | 'none';
  direction?: 'up' | 'down' | 'left' | 'right';
  duration: number;
  delay?: number;
  easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/** 页面过渡 */
interface TransitionConfig {
  type: 'none' | 'fade' | 'slide' | 'zoom' | 'flip';
  direction?: 'left' | 'right' | 'up' | 'down';
  duration: number;
}

// ============ 运行时上下文 ============

/** 渲染上下文 */
type SlideRenderContext = 'editor' | 'presenter' | 'audience' | 'overview' | 'export';

/** 点击上下文 */
interface SlideClicksContext {
  current: number;
  total: number;
  disabled: boolean;
  next: () => boolean;
  prev: () => boolean;
  goTo: (click: number) => void;
  /** 计算元素可见性 */
  getVisibility: (elementPath: SlideElementPath) => ElementVisibility;
}

interface ElementVisibility {
  isVisible: boolean;
  isEntering: boolean;
  isCurrent: boolean;
  isExiting: boolean;
  enterEffect?: AnimationEffect;
  exitEffect?: AnimationEffect;
}

// ============ 演示状态 ============

interface PresentationState {
  slideId: number;
  currentPage: number;
  currentClick: number;
  isFullscreen: boolean;
  startTime?: number;
}

/** 跨窗口共享状态 */
interface SharedPresentationState extends PresentationState {
  /** 指针位置（归一化坐标） */
  cursor?: { x: number; y: number };
  /** 来源窗口 */
  sourceWindowId: string;
  timestamp: number;
}

// ============ 编辑器模式 ============

type SlideEditorMode = 'immersive' | 'navigation' | 'overview';
```

---

## 四、渲染架构设计

### 4.1 SlideRuntime（AST 归一化层）

```TYPESCRIPT
// src/components/Slide/runtime/SlideRuntime.ts

class SlideRuntime {
  private deck: SlideDeck;
  private theme: SlideTheme;

  /** 归一化页面内容，生成渲染树 */
  normalize(page: SlidePage): RuntimeNode[] {
    const content = page.content || [];
    return this.transformNodes(content, page.clicksConfig);
  }

  /** 为节点附加动画信息 */
  private transformNodes(
    nodes: Descendant[],
    clicksConfig: SlideClicksConfig,
    parentPath: number[] = []
  ): RuntimeNode[] {
    return nodes.map((node, index) => {
      const path = [...parentPath, index];
      const pathStr = path.join('-');

      // 查找该元素的点击配置
      const clickSpec = clicksConfig.clicks.find(c =>
        c.targetPaths.includes(pathStr)
      );

      return {
        ...node,
        _runtime: {
          path: pathStr,
          clickSpec,
          // 子节点递归处理
          children: Element.isElement(node)
            ? this.transformNodes(node.children, clicksConfig, path)
            : undefined,
        },
      };
    });
  }

  /** 生成 CSS 变量 */
  generateCSSVariables(): Record<string, string> {
    return {
      '--slide-width': `${this.deck.width}px`,
      '--slide-height': `${this.deck.height}px`,
      '--slide-font-scale': String(this.deck.baseFontScale),
      '--slide-primary': this.theme.colors.primary,
      '--slide-secondary': this.theme.colors.secondary,
      '--slide-text': this.theme.colors.text,
      '--slide-accent': this.theme.colors.accent,
    };
  }
}
```

### 4.2 SlideViewport（等比缩放容器）

```TYPESCRIPT
// src/components/Slide/components/SlideViewport/index.tsx

interface SlideViewportProps {
  children: React.ReactNode;
  deck: SlideDeck;
  backgroundOverride?: SlideBackground;
  /** 是否适应容器 */
  fitContainer?: boolean;
  /** 固定缩放 */
  fixedScale?: number;
}

const SlideViewport: React.FC<SlideViewportProps> = ({
  children,
  deck,
  backgroundOverride,
  fitContainer = false,
  fixedScale,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (fixedScale) {
      setScale(fixedScale);
      return;
    }
    if (!fitContainer || !containerRef.current) {
      setScale(1);
      return;
    }

    const updateScale = () => {
      const container = containerRef.current!;
      const wScale = container.clientWidth / deck.width;
      const hScale = container.clientHeight / deck.height;
      setScale(Math.min(wScale, hScale));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [deck.width, deck.height, fitContainer, fixedScale]);

  // 字体缩放
  const fontSize = deck.baseFontScale * scale * 16;

  return (
    <div ref={containerRef} className="slide-viewport-wrapper">
      <div
        className="slide-viewport"
        style={{
          width: deck.width,
          height: deck.height,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          fontSize: `${fontSize}px`,
          '--slide-scale': scale,
        } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
};
```

### 4.3 SlideLayerStack（分层渲染）

```TYPESCRIPT
// src/components/Slide/components/SlideLayerStack/index.tsx

interface SlideLayerStackProps {
  page: SlidePage;
  deck: SlideDeck;
  context: SlideRenderContext;
  clicksContext: SlideClicksContext;
}

const SlideLayerStack: React.FC<SlideLayerStackProps> = ({
  page,
  deck,
  context,
  clicksContext,
}) => {
  return (
    <div className="slide-layer-stack">
      {/* 背景层 */}
      <BackgroundLayer background={page.background || deck.themeConfig?.background} />

      {/* 内容层 */}
      <ContentLayer
        page={page}
        context={context}
        clicksContext={clicksContext}
      />

      {/* 动画层（处理进入/退出动画） */}
      <AnimationLayer clicksContext={clicksContext} />

      {/* 辅助层（选区、标尺等，仅编辑模式） */}
      {context === 'editor' && <AuxiliaryLayer />}

      {/* 注释 Overlay（仅 presenter 模式） */}
      {context === 'presenter' && <AnnotationOverlay />}
    </div>
  );
};
```

---

## 五、动画系统设计

### 5.1 动画配置与内容解耦

动画配置独立存储在 `slide_pages.clicks_config` 和 `animations` 中，通过 `SlideElementPath` 引用目标元素。

​**优点**：

- 同一元素可有多个动画（不同时间点）
- 动画配置变更不影响内容
- 便于可视化编排

​**路径同步机制**：

- 内容变更时，通过 Slate 的 Operation 更新受影响的 path
- 删除元素时，自动清理相关动画配置

### 5.2 SlideClicksContext 实现

```TYPESCRIPT
// src/components/Slide/context/SlideClicksContext.tsx

const SlideClicksProvider: React.FC<{
  page: SlidePage;
  disabled?: boolean;
  initialClick?: number;
  onClickChange?: (click: number) => void;
  children: React.ReactNode;
}> = ({ page, disabled = false, initialClick = 0, onClickChange, children }) => {
  const [current, setCurrent] = useState(initialClick);

  const { clicksStart, clicksTotal, clicks } = page.clicksConfig;
  const total = clicksTotal ?? inferTotalClicks(clicks);

  // 构建 path -> clickSpec 映射
  const pathToClickSpec = useMemo(() => {
    const map = new Map<string, SlideClickSpec>();
    clicks.forEach(spec => {
      spec.targetPaths.forEach(path => map.set(path, spec));
    });
    return map;
  }, [clicks]);

  const getVisibility = useCallback((elementPath: string): ElementVisibility => {
    const spec = pathToClickSpec.get(elementPath);
    if (!spec || disabled) {
      return { isVisible: true, isEntering: false, isCurrent: false, isExiting: false };
    }

    const enterAt = normalizeClickAt(spec.enterAt, current);
    const exitAt = spec.exitAt ? normalizeClickAt(spec.exitAt, current) : Infinity;

    const isVisible = current >= enterAt && current < exitAt;
    const isEntering = current === enterAt;
    const isExiting = spec.exitAt && current === exitAt;
    const isCurrent = isEntering;

    return {
      isVisible,
      isEntering,
      isCurrent,
      isExiting,
      enterEffect: isEntering ? spec.enterEffect : undefined,
      exitEffect: isExiting ? spec.exitEffect : undefined,
    };
  }, [pathToClickSpec, current, disabled]);

  const next = useCallback(() => {
    if (current >= total) return false;
    const newClick = current + 1;
    setCurrent(newClick);
    onClickChange?.(newClick);
    return true;
  }, [current, total, onClickChange]);

  const prev = useCallback(() => {
    if (current <= clicksStart) return false;
    const newClick = current - 1;
    setCurrent(newClick);
    onClickChange?.(newClick);
    return true;
  }, [current, clicksStart, onClickChange]);

  const goTo = useCallback((click: number) => {
    const clamped = Math.max(clicksStart, Math.min(click, total));
    setCurrent(clamped);
    onClickChange?.(clamped);
  }, [clicksStart, total, onClickChange]);

  const value = useMemo(() => ({
    current,
    total,
    disabled,
    next,
    prev,
    goTo,
    getVisibility,
  }), [current, total, disabled, next, prev, goTo, getVisibility]);

  return (
    <SlideClicksCtx.Provider value={value}>
      {children}
    </SlideClicksCtx.Provider>
  );
};
```

### 5.3 AnimatedElement 组件

```TYPESCRIPT
// src/components/Slide/components/AnimatedElement/index.tsx

import { motion, AnimatePresence } from 'framer-motion';

interface AnimatedElementProps {
  path: string;
  children: React.ReactNode;
}

const AnimatedElement: React.FC<AnimatedElementProps> = ({ path, children }) => {
  const { getVisibility, disabled } = useSlideClicksContext();
  const visibility = getVisibility(path);

  if (disabled) {
    return <>{children}</>;
  }

  const variants = getMotionVariants(visibility.enterEffect);

  return (
    <AnimatePresence mode="wait">
      {visibility.isVisible && (
        <motion.div
          key={path}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          data-slide-path={path}
          data-is-current={visibility.isCurrent}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
```

---

## 六、编辑器架构设计

### 6.1 组件结构

```
SlideWorkspace
├── SlideToolbar
│   ├── ModeSwitch（沉浸/导航/概览）
│   ├── PageActions（新增/复制/删除）
│   ├── PresentButton
│   └── ExportButton
│
├── SlideEditorBody
│   ├── NavigatorPanel（左侧，可折叠）
│   │   ├── ThumbnailList（拖拽排序）
│   │   └── AddPageButton
│   │
│   ├── SlideEditorView（中央）
│   │   ├── SlideViewport
│   │   │   └── SlideLayerStack
│   │   │       ├── BackgroundLayer
│   │   │       ├── ContentLayer（Slate Editor）
│   │   │       └── AuxiliaryLayer
│   │   └── PageIndicator
│   │
│   └── InspectorPanel（右侧，可折叠）
│       ├── PageStyleTab（背景、布局）
│       ├── AnimationTab（点击配置、动画列表）
│       ├── TransitionTab（页面过渡）
│       └── NotesTab（演讲者注释）
│
└── CommandPalette（Goto Slide 等命令）
```

### 6.2 三种编辑模式

1. ​**Navigation 模式**：左侧缩略图 + 右侧编辑区，类似 PowerPoint
2. ​**Immersive 模式**：全屏单页编辑，隐藏导航，沉浸体验
3. ​**Overview 模式**：网格显示所有页面缩略图，快速导航和排序

快捷键：

- `F11`：切换沉浸模式
- `Ctrl+Enter`：新增页面
- `Ctrl+Shift+D`：复制当前页
- `Ctrl+G`：Goto Slide 命令

### 6.3 InspectorPanel 动画配置

```TYPESCRIPT
// src/components/Slide/SlideEditor/components/InspectorPanel/AnimationTab.tsx

const AnimationTab: React.FC<{
  page: SlidePage;
  onConfigChange: (config: SlideClicksConfig) => void;
}> = ({ page, onConfigChange }) => {
  const { clicks } = page.clicksConfig;

  return (
    <div className="animation-tab">
      <div className="click-sequence">
        <h4>点击序列</h4>
        <DndContext onDragEnd={handleReorder}>
          <SortableContext items={clicks.map(c => c.id)}>
            {clicks.map((spec, index) => (
              <ClickSpecItem
                key={spec.id}
                spec={spec}
                index={index}
                onUpdate={(updated) => updateClickSpec(spec.id, updated)}
                onRemove={() => removeClickSpec(spec.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="add-animation">
        <p>选中元素后点击添加动画</p>
        <Button onClick={handleAddClick}>添加点击动画</Button>
      </div>

      <div className="animation-presets">
        <h4>动画预设</h4>
        <PresetGrid presets={animationPresets} onSelect={applyPreset} />
      </div>
    </div>
  );
};
```

---

## 七、演示模式架构

### 7.1 SlideController（统一控制器）

```TYPESCRIPT
// src/components/Slide/controller/SlideController.ts

class SlideController extends EventEmitter {
  private deck: SlideDeck;
  private state: PresentationState;
  private syncChannel: BroadcastChannel;

  constructor(deck: SlideDeck) {
    super();
    this.deck = deck;
    this.state = {
      slideId: deck.id,
      currentPage: 0,
      currentClick: 0,
      isFullscreen: false,
    };
    this.syncChannel = new BroadcastChannel(`slide-${deck.id}`);
    this.syncChannel.onmessage = this.handleSyncMessage.bind(this);
  }

  /** 下一步（点击或页面） */
  next(): boolean {
    const page = this.getCurrentPage();
    const totalClicks = page.clicksConfig.clicksTotal ?? inferTotalClicks(page.clicksConfig.clicks);

    if (this.state.currentClick < totalClicks) {
      this.state.currentClick++;
      this.broadcast();
      this.emit('clickChange', this.state.currentClick);
      return true;
    }

    if (this.state.currentPage < this.deck.pageIds.length - 1) {
      this.state.currentPage++;
      this.state.currentClick = 0;
      this.broadcast();
      this.emit('pageChange', this.state.currentPage);
      return true;
    }

    return false;
  }

  /** 上一步 */
  prev(): boolean {
    if (this.state.currentClick > 0) {
      this.state.currentClick--;
      this.broadcast();
      this.emit('clickChange', this.state.currentClick);
      return true;
    }

    if (this.state.currentPage > 0) {
      this.state.currentPage--;
      const prevPage = this.deck.pages![this.state.currentPage];
      this.state.currentClick = inferTotalClicks(prevPage.clicksConfig.clicks);
      this.broadcast();
      this.emit('pageChange', this.state.currentPage);
      return true;
    }

    return false;
  }

  /** 跳转到指定页面 */
  goToPage(pageIndex: number, click = 0): void {
    this.state.currentPage = Math.max(0, Math.min(pageIndex, this.deck.pageIds.length - 1));
    this.state.currentClick = click;
    this.broadcast();
    this.emit('pageChange', this.state.currentPage);
  }

  /** 更新指针位置 */
  updateCursor(x: number, y: number): void {
    this.broadcast({ cursor: { x, y } });
  }

  /** 广播状态 */
  private broadcast(extra: Partial<SharedPresentationState> = {}): void {
    this.syncChannel.postMessage({
      ...this.state,
      ...extra,
      sourceWindowId: getWindowId(),
      timestamp: Date.now(),
    });
  }

  private handleSyncMessage(event: MessageEvent<SharedPresentationState>): void {
    if (event.data.sourceWindowId === getWindowId()) return;
    // 同步状态
    this.state.currentPage = event.data.currentPage;
    this.state.currentClick = event.data.currentClick;
    this.emit('sync', event.data);
  }
}
```

### 7.2 演示窗口布局

​**观众窗口 (SlidePresentation)**：

- 全屏显示当前页
- 键盘/鼠标控制导航
- 显示指针位置（从 Presenter 同步）

​**演讲者窗口 (SlidePresenter)**：

```
┌─────────────────────────────────────────────────┐
│ [计时器]  3/10 页  点击 2/5  [上一步] [下一步]    │
├───────────────────────┬─────────────────────────┤
│                       │                         │
│    当前幻灯片 (大)     │    下一页预览 (小)       │
│                       │                         │
├───────────────────────┴─────────────────────────┤
│                                                 │
│              演讲者注释 (富文本)                  │
│                                                 │
├─────────────────────────────────────────────────┤
│ [1] [2] [3] [4] ... [10]  页面快速导航           │
└─────────────────────────────────────────────────┘
```

### 7.3 注释 Overlay

复用 WhiteBoard 的绘制能力，在 Presenter 窗口可以：

- 使用画笔标注
- 绘制的内容同步到观众窗口
- 按 `C` 清除标注

---

## 八、插件式架构

### 8.1 SlidePlugin 接口

```TYPESCRIPT
// src/components/Slide/plugins/types.ts

interface SlidePlugin {
  name: string;
  version: string;

  /** 生命周期 */
  onLoadDeck?(deck: SlideDeck): Promise<void>;
  onUnloadDeck?(deck: SlideDeck): void;

  /** 页面转换 */
  transformPage?(page: SlidePage, context: SlideRenderContext): SlidePage;

  /** UI 扩展 */
  providePanelWidgets?(): React.ReactNode[];
  provideToolbarItems?(): ToolbarItem[];

  /** 快捷键 */
  registerShortcuts?(): ShortcutConfig[];

  /** 导出 */
  provideExporters?(): SlideExporter[];
}

interface SlideExporter {
  format: string;
  name: string;
  icon?: React.ReactNode;
  export(deck: SlideDeck): Promise<Blob | string>;
}
```

### 8.2 内置插件

1. ​**ThemePlugin**：管理主题，注入 CSS 变量
2. ​**AnimationPlugin**：注册动画预设（fade, slide, zoom, bounce）
3. ​**TransitionPlugin**：注册页面过渡效果
4. ​**ExportPlugin**：PDF、PNG、HTML、Slidev Markdown 导出
5. ​**KeynotePlugin**：Keynote 风格的 HoverToolbar

### 8.3 插件注册

```TYPESCRIPT
// src/components/Slide/plugins/index.ts

const pluginRegistry = new PluginRegistry();

pluginRegistry.register(themePlugin);
pluginRegistry.register(animationPlugin);
pluginRegistry.register(transitionPlugin);
pluginRegistry.register(exportPlugin);

export { pluginRegistry };
```

---

## 九、Markdown 序列化与 Slidev 互操作

### 9.1 序列化策略（复用现有工具链）

​**核心原则**：充分复用项目现有的 Markdown 序列化能力，避免重复实现。

#### 现有工具链

| 工具                         | 路径                                      | 用途                     |
| ---------------------------- | ----------------------------------------- | ------------------------ |
| `markdownSerializerRegistry` | `src/utils/markdownSerializerRegistry.ts` | 注册各类型节点的序列化器 |
| `getMarkdown`                | `src/utils/markdown-helper.ts`            | Slate → Markdown         |
| `markdownToDescendant`       | `src/utils/markdown.ts`                   | Markdown → Slate         |
| `@slidev/parser`             | `slidev/packages/parser`                  | 解析 slidev 格式         |

#### 导出为 Markdown

```TYPESCRIPT
// src/components/Slide/interop/slidevExport.ts

import { getMarkdown } from '@/utils/markdown-helper';
import { markdownSerializerRegistry } from '@/utils/markdownSerializerRegistry';
import yaml from 'yaml';

function exportSlidevMarkdown(deck: SlideDeck): string {
  const lines: string[] = [];

  // 1. Global frontmatter
  const globalFrontmatter = {
    title: deck.title,
    theme: deck.themeId || 'default',
    canvasWidth: deck.width,
    canvasHeight: deck.height,
    fonts: deck.themeConfig?.fonts,
  };
  lines.push('---');
  lines.push(yaml.stringify(globalFrontmatter).trim());
  lines.push('---');
  lines.push('');

  // 2. 逐页序列化
  deck.pages?.forEach((page, index) => {
    if (index > 0) {
      lines.push('---');
      // Page frontmatter（如有特殊配置）
      if (page.background || page.clicksConfig.clicksStart > 0) {
        const pageFrontmatter: Record<string, any> = {};
        if (page.background) {
          pageFrontmatter.background = page.background.value;
        }
        if (page.clicksConfig.clicksStart > 0) {
          pageFrontmatter.clicksStart = page.clicksConfig.clicksStart;
        }
        if (page.clicksConfig.clicks.length > 0) {
          pageFrontmatter.clicks = inferTotalClicks(page.clicksConfig.clicks);
        }
        lines.push(yaml.stringify(pageFrontmatter).trim());
        lines.push('---');
      }
      lines.push('');
    }

    // 3. 内容：复用现有 getMarkdown
    if (page.content) {
      const contentMd = getMarkdown(page.content);
      lines.push(contentMd);
    }

    // 4. Notes：以 HTML 注释形式
    if (page.speakerNotes && page.speakerNotes.length > 0) {
      const notesMd = getMarkdown(page.speakerNotes);
      lines.push('');
      lines.push('<!--');
      lines.push(notesMd.trim());
      lines.push('-->');
    }

    lines.push('');
  });

  return lines.join('\n');
}
```

#### 从 Markdown 导入

```TYPESCRIPT
// src/components/Slide/interop/slidevImport.ts

import { parse as parseSlidev } from '@slidev/parser';
import { markdownToDescendant } from '@/utils/markdown';

async function importSlidevMarkdown(markdown: string): Promise<SlideDeck> {
  // 1. 使用 @slidev/parser 解析
  const parsed = await parseSlidev(markdown);

  // 2. 提取全局配置
  const deck: Partial<SlideDeck> = {
    title: parsed.headmatter?.title || 'Imported Slide',
    width: parsed.headmatter?.canvasWidth || 980,
    height: parsed.headmatter?.canvasHeight || 552,
    themeId: parsed.headmatter?.theme,
    metadata: {
      importedFrom: 'slidev',
      originalFrontmatter: parsed.headmatter,
    },
  };

  // 3. 逐页转换
  const pages: SlidePage[] = [];
  for (let i = 0; i < parsed.slides.length; i++) {
    const slide = parsed.slides[i];

    // 复用现有 markdownToDescendant
    const content = await markdownToDescendant(slide.content);

    // Notes 转换
    let speakerNotes: Descendant[] | undefined;
    if (slide.note) {
      speakerNotes = await markdownToDescendant(slide.note);
    }

    // 提取点击配置
    const clicksConfig: SlideClicksConfig = {
      clicksStart: slide.frontmatter?.clicksStart ?? 0,
      clicksTotal: slide.frontmatter?.clicks,
      clicks: extractVClicksFromContent(slide.content), // 解析 v-click 标记
    };

    pages.push({
      id: 0, // 待数据库分配
      deckId: 0,
      pageIndex: i,
      content,
      speakerNotes,
      background: slide.frontmatter?.background
        ? { type: 'color', value: slide.frontmatter.background }
        : undefined,
      clicksConfig,
      animations: [],
    });
  }

  return { ...deck, pages } as SlideDeck;
}

/** 从 Markdown 内容中提取 v-click 标记（简化版） */
function extractVClicksFromContent(content: string): SlideClickSpec[] {
  const clicks: SlideClickSpec[] = [];
  // 解析 <v-click>, <v-clicks>, {.v-click} 等标记
  // 映射为 SlideClickSpec
  // 此处为示意，实际需要根据 AST 分析
  return clicks;
}
```

#### 序列化器扩展

对于 Slide 特有的节点类型，在 `markdownSerializerRegistry` 中注册：

```TYPESCRIPT
// src/components/Slide/interop/slideSerializers.ts

import { markdownSerializerRegistry } from '@/utils/markdownSerializerRegistry';

// 注册 Slide 特有节点的序列化器
export function registerSlideSerializers() {
  // 示例：动画标记节点
  markdownSerializerRegistry.register('slide-animated-block', {
    serialize: (node, children) => {
      const clickOrder = node.slideAnimation?.clickOrder;
      if (clickOrder) {
        // 输出为 slidev 的 v-click 格式
        return `<v-click>${children}</v-click>`;
      }
      return children;
    },
    deserialize: (md, children) => {
      // 解析 <v-click> 标记
      // ...
    },
  });
}
```

#### 互导一致性校验

```TYPESCRIPT
// src/components/Slide/interop/validation.ts

async function validateRoundTrip(deck: SlideDeck): Promise<ValidationResult> {
  // 1. 导出为 Markdown
  const exported = exportSlidevMarkdown(deck);

  // 2. 重新导入
  const reimported = await importSlidevMarkdown(exported);

  // 3. 对比
  const diffs: string[] = [];

  deck.pages?.forEach((original, i) => {
    const imported = reimported.pages?.[i];
    if (!imported) {
      diffs.push(`Page ${i + 1}: missing after reimport`);
      return;
    }

    // 对比内容 hash
    const originalHash = hashContent(original.content);
    const importedHash = hashContent(imported.content);
    if (originalHash !== importedHash) {
      diffs.push(`Page ${i + 1}: content mismatch`);
    }
  });

  return {
    success: diffs.length === 0,
    diffs,
    warnings: [], // 如：某些节点类型无法完美转换
  };
}
```

---

## 十、文件结构

```
src/
├── components/Slide/
│   ├── index.tsx
│   │
│   ├── runtime/                    # 运行时
│   │   ├── SlideRuntime.ts
│   │   └── RuntimeNode.ts
│   │
│   ├── controller/                 # 控制器
│   │   └── SlideController.ts
│   │
│   ├── context/                    # React Context
│   │   ├── SlideClicksContext.tsx
│   │   ├── SlideDeckContext.tsx
│   │   └── SlideRenderContext.tsx
│   │
│   ├── components/                 # 通用组件
│   │   ├── SlideViewport/
│   │   ├── SlideLayerStack/
│   │   ├── AnimatedElement/
│   │   ├── PageTransition/
│   │   └── AnnotationOverlay/
│   │
│   ├── SlideEditor/                # 编辑器
│   │   ├── index.tsx
│   │   ├── SlideWorkspace.tsx
│   │   └── components/
│   │       ├── NavigatorPanel/
│   │       ├── InspectorPanel/
│   │       ├── SlideEditorView/
│   │       └── OverviewMode/
│   │
│   ├── plugins/                    # 插件系统
│   │   ├── types.ts
│   │   ├── PluginRegistry.ts
│   │   ├── ThemePlugin.ts
│   │   ├── AnimationPlugin.ts
│   │   ├── TransitionPlugin.ts
│   │   └── ExportPlugin.ts
│   │
│   ├── interop/                    # 互操作
│   │   ├── slidevImport.ts
│   │   └── slidevExport.ts
│   │
│   └── hooks/
│       ├── useSlideDeck.ts
│       ├── useSlideController.ts
│       └── useSlideKeyboard.ts
│
├── pages/
│   ├── SlideListView/
│   ├── SlideDetailView/
│   ├── SlidePresentation/
│   └── SlidePresenter/
│
├── types/slide.ts
├── stores/useSlideDeckStore.ts
└── commands/slide.ts

src-electron/main/modules/tables/
├── slide-deck.ts
├── slide-page.ts
└── slide-asset.ts
```

---

## 十一、实现步骤（MVP 优先）

### MVP 阶段

​**Step 1: 数据层**

- 创建 `slide_decks`、`slide_pages` 数据库表
- 定义 TypeScript 类型 (`src/types/slide.ts`)
- 实现 IPC 命令

​**Step 2: 基础渲染**

- 实现 SlideViewport 等比缩放
- 实现 SlideLayerStack 分层渲染
- 复用 Slate Editor 渲染内容

​**Step 3: 基础编辑器**

- 实现 SlideWorkspace 框架
- 实现 Navigation 模式（缩略图 + 编辑区）
- 页面 CRUD 操作

​**Step 4: 基础演示**

- 实现 SlidePresentation 窗口
- 键盘/鼠标导航
- 全屏支持

​**MVP 交付**：可创建 Slide、编辑多页内容、全屏演示

---

### 增强阶段

​**Step 5: 编辑器增强**

- 实现 Immersive 模式
- 实现 Overview 模式
- 实现 InspectorPanel（样式、注释）
- 快捷键系统

​**Step 6: 动画系统**

- 实现 SlideClicksContext
- 实现 AnimatedElement（framer-motion）
- 实现 AnimationTab 配置 UI
- 动画预设

​**Step 7: 演讲者模式**

- 实现 SlidePresenter 窗口
- 实现 SlideController 状态同步
- 指针位置同步

​**Step 8: 页面过渡**

- 实现 PageTransition 组件
- 过渡效果配置

---

### 高级阶段

​**Step 9: 插件系统**

- 实现 SlidePlugin 接口
- 实现内置插件

​**Step 10: 注释 Overlay**

- 复用 WhiteBoard 绘制
- 跨窗口同步

​**Step 11: Slidev 互操作**

- 导入 slidev markdown
- 导出 slidev 格式

​**Step 12: 导出功能**

- PDF 导出
- HTML SPA 导出
- 图片导出

​**Step 13: 优化**

- 缩略图缓存
- 虚拟滚动
- 性能优化

---

## 十二、风险与应对

| 风险                                      | 应对策略                                        |
| ----------------------------------------- | ----------------------------------------------- |
| ​**性能**：多页渲染卡顿                   | 虚拟滚动 + 缩略图缓存 + Slate Chunking          |
| ​**动画路径同步**：内容变更导致 path 失效 | 监听 Slate Operation，自动更新 path             |
| ​**双屏同步延迟**                         | BroadcastChannel + 增量更新 + 版本号校验        |
| ​**动画稳定性**                           | 借鉴 slidev ClicksContext，保持确定性，增加单测 |
| ​**数据迁移**                             | 编写迁移脚本，旧文档 divide-line 拆分为 pages   |
| ​**插件安全**                             | Electron preload 沙箱，限制可调用 API           |

---

## 十三、关键技术选型

| 功能        | 技术方案         | 理由                 |
| ----------- | ---------------- | -------------------- |
| 富文本编辑  | Slate Editor     | 复用现有 42 个扩展   |
| 动画        | framer-motion    | 声明式 API，性能优秀 |
| 拖拽排序    | @dnd-kit         | 项目已使用           |
| 跨窗口同步  | BroadcastChannel | 原生 API，延迟低     |
| 状态管理    | Zustand          | 与项目一致           |
| Slidev 解析 | @slidev/parser   | 直接复用             |

---

## 十四、关键文件参考

实现时需重点参考：

- `src-electron/main/modules/tables/whiteboard.ts` - 数据库表模式
- `src/components/Editor/extensions/base.ts` - Editor 扩展集成
- `src-electron/main/modules/window-manager.ts` - 窗口管理扩展
- `src/types/tab.ts` - Tab 类型定义
- `src/components/WhiteBoard/Board.tsx` - 插件系统参考
- `slidev/packages/client/internals/SlideContainer.vue` - 缩放逻辑参考
- `slidev/packages/client/composables/useClicks.ts` - 点击系统参考
