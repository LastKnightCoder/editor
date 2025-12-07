# Monorepo 重构迁移方案（完善版）

## 一、现状分析

### 1.1 当前目录结构

```
editor/
├── src/                      # 桌面端源码（97 组件、70+ commands、34 stores）
├── src-electron/             # Electron 主进程（40+ 模块）
├── blog/                     # 博客模板（workspace 包）
├── packages/foliate-js/      # 第三方电子书库（workspace 包）
├── pnpm-workspace.yaml       # 仅包含 packages/* 和 blog
├── package.json              # 所有依赖集中于此（200+）
├── vite.config.mts           # 桌面端 Vite 配置
└── tsconfig.json             # 别名: @->src, @editor->src/components/Editor
```

### 1.2 核心问题

|  问题           |  描述                                                 |  影响           |
| ------------- | --------------------------------------------------- | ------------- |
|  半 monorepo   |  桌面端不在 workspace，依赖全部集中在根                           |  无法独立管理依赖     |
|  反向引用         |  blog 直接 import `@/components/Editor` 等             |  构建耦合、无法独立发布  |
|  Editor 深度耦合  |  Editor 依赖 commands/stores/services/hooks 等 527+ 处  |  无法独立抽包       |
|  别名重复         |  vite.config/tsconfig 多处定义相同别名                      |  维护困难         |

### 1.3 Blog 对桌面端的具体依赖

​**涉及文件：** `CardPage.tsx`、`DocPage.tsx`、`ArticlePage.tsx`

|  依赖项                     |  来源路径                         |  用途        |
| ------------------------ | ----------------------------- | ---------- |
|  Editor                  |  `@/components/Editor`        |  只读模式渲染内容  |
|  Outline                 |  `@/components/Outline`       |  目录导航      |
|  DndProvider             |  `@/components/DndProvider`   |  拖拽上下文     |
|  HeaderElement           |  `@/components/Editor/types`  |  标题元素类型    |
|  getInlineElementText    |  `@/utils/editor.tsx`         |  提取行内元素文本  |
|  light.less / dark.less  |  `@/themes/`                  |  主题变量      |

### 1.4 Editor 对桌面端的依赖分类

​**A. 命令层 (@/commands) - 需接口化**

- `createOrUpdateResource`, `decrementResourceRefCount` - 资源管理
- `createDataTable`, `deleteDataTable` - 数据表
- `selectFile`, `readTextFile`, `getHomeDir` - 文件操作
- `openExternal` - 外链打开
- `getYoutubeVideoInfo` - 视频解析
- `compileTypst` - Typst 编译
- `getAllWhiteBoards` - 白板列表
- `textToSpeech` - 文本转语音

​**B. 状态层 (@/stores) - 需接口化**

- `useSettingStore` - 应用设置（代理、AI 模型等）
- `useCustomBlockStore` - 自定义块模板

​**C. 服务层 (@/services) - 需接口化**

- `tailwindRuntime.compileCustomBlockTailwind` - Tailwind 运行时编译

​**D. Hooks (@/hooks) - 部分可下沉**

- `useTheme`, `useThemeColors` - 主题相关（可下沉）
- `useChatLLM` - AI 聊天（需接口化）
- `useBilibiliVideo`, `useYoutubeVideo`, `useNotionVideo` - 视频解析（需接口化）
- `useUploadResource` - 资源上传（需接口化）
- `useEditDatabase` - 数据库编辑（需接口化）

​**E. 组件 (@/components) - 部分可下沉**

- 可下沉：`If`, `For`, `PortalToBody`, `ErrorBoundary`, `ResizeHandle`
- 需保留在桌面端：`LocalVideo`, `LocalAudio`, `WhiteBoard`, `Database`, 各种 Modal

---

## 二、目标目录结构

```
editor/
├── apps/
│   ├── desktop/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.mts
│   │   ├── electron-builder.yml
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── editor-services/    # EditorServices 实现
│   │   │   ├── commands/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   └── ...
│   │   └── src-electron/
│   └── blog/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── editor-services/    # EditorServices 只读实现
│           └── templates/
├── packages/
│   ├── editor/                     # @tau/editor
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── Editor.tsx
│   │   │   ├── types/
│   │   │   ├── extensions/
│   │   │   ├── plugins/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── utils/
│   │   │   └── services/
│   │   │       └── types.ts        # EditorServices 接口定义
│   │   └── styles/
│   │       └── index.css
│   ├── shared/                     # @tau/shared
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── components/         # Outline, DndProvider, If, For, etc.
│   │       ├── hooks/              # useThemeColors 等无状态依赖的 hook
│   │       └── utils/              # getInlineElementText 等
│   ├── themes/                     # @tau/themes
│   │   ├── package.json
│   │   └── src/
│   │       ├── light.less
│   │       ├── dark.less
│   │       └── index.ts
│   └── foliate-js/
├── pnpm-workspace.yaml
└── package.json                    # 根配置（scripts、devDependencies）
```

---

## 三、EditorServices 接口设计（Context Provider 方式）

### 3.1 接口定义

```TYPESCRIPT
// packages/editor/src/services/types.ts

export interface EditorServices {
  // 资源管理
  resource: {
    upload: (file: File) => Promise<string | null>
    create: (config: CreateResourceConfig) => Promise<void>
    decrementRef: (url: string) => Promise<void>
  }

  // 数据表管理
  dataTable: {
    create: (config: CreateTableConfig) => Promise<void>
    incrementRef: (tableId: string) => Promise<void>
    delete: (tableId: string) => Promise<void>
  }

  // 文件操作
  file: {
    select: () => Promise<string | null>
    readText: (path: string) => Promise<string>
    getBaseName: (path: string) => string
    getHomeDir: () => string
  }

  // 媒体服务
  media: {
    getYoutubeInfo: (url: string, proxy?: string) => Promise<VideoInfo>
    getBilibiliInfo: (url: string) => Promise<VideoInfo>
    getNotionInfo: (url: string) => Promise<VideoInfo>
  }

  // AI 服务
  ai: {
    chatStream: (prompt: string) => AsyncIterable<string>
    textToSpeech: (text: string) => Promise<string | null>
  }

  // 编译服务
  compiler: {
    typst: (content: string) => Promise<void>
    tailwind: (css: string) => Promise<string>
  }

  // 白板服务
  whiteboard: {
    getAll: () => Promise<WhiteBoard[]>
  }

  // 设置服务
  settings: {
    get: () => AppSettings
    getYoutubeProxy: () => string | null
  }

  // 主题服务
  theme: {
    current: () => 'light' | 'dark'
    colors: () => Record<string, string>
  }

  // 外部链接
  openExternal: (url: string) => void
}
```

### 3.2 Context Provider 实现

```TYPESCRIPT
// packages/editor/src/services/EditorServicesContext.tsx
import { createContext, useContext, ReactNode } from 'react'
import type { EditorServices } from './types'

const EditorServicesContext = createContext<EditorServices | null>(null)

export function EditorServicesProvider({
  services,
  children
}: {
  services: EditorServices
  children: ReactNode
}) {
  return (
    <EditorServicesContext.Provider value={services}>
      {children}
    </EditorServicesContext.Provider>
  )
}

export function useEditorServices(): EditorServices {
  const services = useContext(EditorServicesContext)
  if (!services) {
    throw new Error('useEditorServices must be used within EditorServicesProvider')
  }
  return services
}

// 用于只读模式，提供空实现
export function useEditorServicesOptional(): EditorServices | null {
  return useContext(EditorServicesContext)
}
```

### 3.3 使用示例

​**桌面端（完整功能）：**

```TSX
// apps/desktop/src/App.tsx
import { EditorServicesProvider } from '@tau/editor'
import { desktopEditorServices } from './editor-services'

function App() {
  return (
    <EditorServicesProvider services={desktopEditorServices}>
      <Editor value={content} onChange={handleChange} />
    </EditorServicesProvider>
  )
}
```

​**博客端（只读模式）：**

```TSX
// apps/blog/src/templates/article/ArticlePage.tsx
import { EditorServicesProvider, Editor } from '@tau/editor'
import { readonlyEditorServices } from '../../editor-services'

function ArticlePage() {
  return (
    <EditorServicesProvider services={readonlyEditorServices}>
      <Editor value={content} readOnly />
    </EditorServicesProvider>
  )
}
```

---

## 四、分阶段迁移计划

> ​**策略说明**：采用分阶段迁移，每个阶段完成后确保项目可编译运行，降低风险。

### Phase 1：目录重排（基础骨架）

​**目标**：将文件移动到新目录结构，更新配置，确保 `pnpm dev` 可运行。

​**步骤**：

```BASH
# 1.1 创建目录
mkdir -p apps/desktop apps/blog packages/editor packages/shared packages/themes

# 1.2 移动桌面端
mv src apps/desktop/
mv src-electron apps/desktop/
mv index.html apps/desktop/
mv vite.config.mts apps/desktop/
mv tsconfig.json apps/desktop/
mv electron-builder.yml apps/desktop/

# 1.3 移动博客端
mv blog/* apps/blog/
rmdir blog

# 1.4 创建根配置
# - 更新 pnpm-workspace.yaml
# - 创建新的根 package.json（仅保留 scripts 和 workspace 配置）
```

​**配置更新**：

- `pnpm-workspace.yaml`: `packages: ["packages/*", "apps/*"]`
- `apps/desktop/package.json`: 从根 package.json 迁移依赖
- `apps/blog/package.json`: 更新依赖引用
- 调整 vite.config 和 tsconfig 的路径

​**验证点**：

- `pnpm install` 成功
- `pnpm --filter desktop dev` 可启动
- `pnpm --filter blog dev` 可启动

---

### Phase 2：初始化公共包骨架

​**目标**：创建 `@tau/editor`、`@tau/shared`、`@tau/themes` 包的基础结构，暂时使用空导出。

​**步骤**：

​**2.1 packages/shared**

```TYPESCRIPT
// packages/shared/package.json
{
  "name": "@tau/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "peerDependencies": {
    "react": "^18.2.0",
    "react-dnd": "^16.0.1",
    "react-dnd-html5-backend": "^16.0.1"
  }
}

// packages/shared/src/index.ts
export {} // 占位
```

​**2.2 packages/themes**

```TYPESCRIPT
// packages/themes/package.json
{
  "name": "@tau/themes",
  "version": "0.1.0",
  "main": "src/index.ts"
}

// packages/themes/src/index.ts
export {} // 占位
```

​**2.3 packages/editor**

```TYPESCRIPT
// packages/editor/package.json
{
  "name": "@tau/editor",
  "version": "0.1.0",
  "main": "src/index.ts",
  "peerDependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "slate": "^0.118.1",
    "slate-react": "^0.119.0",
    "slate-history": "^0.109.0"
  }
}

// packages/editor/src/index.ts
export {} // 占位
```

​**2.4 更新别名配置**

```TYPESCRIPT
// apps/desktop/vite.config.mts 添加别名
"@tau/editor": path.resolve(__dirname, "../../packages/editor/src"),
"@tau/shared": path.resolve(__dirname, "../../packages/shared/src"),
"@tau/themes": path.resolve(__dirname, "../../packages/themes/src"),

// apps/blog/vite.config.ts 同样添加
```

​**验证点**：

- `pnpm install` 成功（workspace 识别新包）
- 别名解析正常

---

### Phase 3：迁移 shared 包（低风险）

​**目标**：迁移简单的、无业务耦合的组件到 `@tau/shared`。

​**迁移内容**：

|  源路径                                         |  目标路径                                           |
| -------------------------------------------- | ----------------------------------------------- |
|  `apps/desktop/src/components/For/`          |  `packages/shared/src/components/For/`          |
|  `apps/desktop/src/components/If/`           |  `packages/shared/src/components/If/`           |
|  `apps/desktop/src/components/DndProvider/`  |  `packages/shared/src/components/DndProvider/`  |
|  `apps/desktop/src/components/Outline/`      |  `packages/shared/src/components/Outline/`      |
|  `apps/desktop/src/hooks/useThemeColors.ts`  |  `packages/shared/src/hooks/useThemeColors.ts`  |
|  `apps/desktop/src/utils/editor.tsx` (部分)    |  `packages/shared/src/utils/editor.ts`          |

​**导出**：

```TYPESCRIPT
// packages/shared/src/index.ts
export { default as For } from './components/For'
export { default as If } from './components/If'
export { default as DndProvider } from './components/DndProvider'
export { default as Outline } from './components/Outline'
export { useThemeColors } from './hooks/useThemeColors'
export { getInlineElementText } from './utils/editor'
```

​**处理依赖**：

- `Outline` 依赖 `useThemeColors` → 使用包内相对路径
- `Outline` 依赖 `For` → 使用包内相对路径
- 移除对 `@/` 路径的引用

​**验证点**：

- `packages/shared` 可独立编译
- 桌面端替换为 `@tau/shared` 后可运行

---

### Phase 4：迁移 themes 包（低风险）

​**目标**：迁移主题文件到 `@tau/themes`。

​**迁移内容**：

|  源路径                                   |  目标路径                              |
| -------------------------------------- | ---------------------------------- |
|  `apps/desktop/src/themes/light.less`  |  `packages/themes/src/light.less`  |
|  `apps/desktop/src/themes/dark.less`   |  `packages/themes/src/dark.less`   |

​**导出**：

```TYPESCRIPT
// packages/themes/src/index.ts
import './light.less'
import './dark.less'
```

​**验证点**：

- 桌面端使用 `import '@tau/themes'` 后样式正常
- 博客端使用 `import '@tau/themes/src/light.less'` 后样式正常

---

### Phase 5：迁移 Editor 包 - 文件结构（中风险）

​**目标**：将 Editor 目录移动到 packages/editor，暂时保留对 `@/` 的引用（通过别名）。

​**步骤**：

1. 复制 `apps/desktop/src/components/Editor/` → `packages/editor/src/`
2. 在 `apps/desktop` 中删除原 Editor 目录
3. 更新 `apps/desktop` 的 vite.config，`@editor` 指向 `packages/editor/src`
4. 在 `packages/editor/vite.config.ts` 中添加 `@/` 别名指向 `apps/desktop/src`（临时）

​**验证点**：

- 桌面端编译通过
- Editor 功能正常（此时仍依赖桌面端代码）

---

### Phase 6：Editor 接口化 - 定义 EditorServices（中风险）

​**目标**：定义 EditorServices 接口和 Context Provider，但暂不实现。

​**创建文件**：

```
packages/editor/src/services/
├── types.ts              # EditorServices 接口定义
├── EditorServicesContext.tsx  # Context Provider
└── index.ts
```

​**验证点**：

- 类型定义完整
- Context Provider 可导入

---

### Phase 7：Editor 接口化 - 逐步替换（高风险，分批）

​**目标**：将 Editor 内部的 `@/` 引用逐步替换为 EditorServices 调用。

​**分批顺序**（按复杂度从低到高）：

​**Batch 7.1：主题服务**

- 替换 `useTheme`、`useThemeColors` → `useEditorServices().theme`
- 涉及文件：约 11 个

​**Batch 7.2：设置服务**

- 替换 `useSettingStore` → `useEditorServices().settings`
- 涉及文件：约 3 个

​**Batch 7.3：资源服务**

- 替换 `createOrUpdateResource`、`decrementResourceRefCount`、`uploadResource` → `useEditorServices().resource`
- 涉及文件：图片/视频/音频相关扩展

​**Batch 7.4：文件服务**

- 替换 `selectFile`、`readTextFile`、`getHomeDir` → `useEditorServices().file`
- 涉及文件：音频、视频、自定义块扩展

​**Batch 7.5：媒体服务**

- 替换 `useBilibiliVideo`、`useYoutubeVideo`、`useNotionVideo` → `useEditorServices().media`
- 涉及文件：视频扩展

​**Batch 7.6：AI 服务**

- 替换 `useChatLLM`、`textToSpeech` → `useEditorServices().ai`
- 涉及文件：AI 块、TTS 扩展

​**Batch 7.7：其他服务**

- 替换白板、数据表、编译器相关
- 涉及文件：whiteboard、database、typst、custom-block 扩展

​**每批次验证点**：

- 替换后 Editor 可编译
- 传入 mock services 后功能可用

---

### Phase 8：桌面端实现 EditorServices

​**目标**：在 `apps/desktop` 中实现完整的 EditorServices。

​**创建文件**：

```
apps/desktop/src/editor-services/
├── index.ts              # 导出完整的 desktopEditorServices
├── resource.ts           # 资源管理实现
├── dataTable.ts          # 数据表实现
├── file.ts               # 文件操作实现
├── media.ts              # 媒体服务实现
├── ai.ts                 # AI 服务实现
├── compiler.ts           # 编译服务实现
├── whiteboard.ts         # 白板服务实现
├── settings.ts           # 设置服务实现
└── theme.ts              # 主题服务实现
```

​**验证点**：

- 桌面端所有 Editor 功能正常
- 资源上传、AI、视频解析等全部可用

---

### Phase 9：博客端实现 EditorServices（只读）

​**目标**：在 `apps/blog` 中实现只读版 EditorServices。

​**创建文件**：

```
apps/blog/src/editor-services/
├── index.ts              # 导出 readonlyEditorServices
└── readonly.ts           # 所有方法返回空实现或 console.warn
```

​**实现示例**：

```TYPESCRIPT
export const readonlyEditorServices: EditorServices = {
  resource: {
    upload: async () => {
      console.warn('Editor is in readonly mode')
      return null
    },
    // ...
  },
  theme: {
    current: () => 'light', // 或从 URL 参数读取
    colors: () => ({ /* 静态主题色 */ })
  },
  // ...
}
```

​**验证点**：

- 博客端 Editor 渲染正常
- 只读模式下不会调用业务逻辑

---

### Phase 10：更新博客端引用

​**目标**：将博客端的 `@/` 引用全部替换为包引用。

​**替换**：

```TYPESCRIPT
// CardPage.tsx, DocPage.tsx, ArticlePage.tsx

// 旧
import Editor from "@/components/Editor"
import Outline from "@/components/Outline"
import { HeaderElement } from "@/components/Editor/types"
import { getInlineElementText } from "@/utils"
import DndProvider from "@/components/DndProvider"
import "@/themes/light.less"
import "@/themes/dark.less"

// 新
import { Editor, EditorServicesProvider } from "@tau/editor"
import type { HeaderElement } from "@tau/editor"
import { Outline, DndProvider, getInlineElementText } from "@tau/shared"
import "@tau/themes/src/light.less"
import "@tau/themes/src/dark.less"
```

​**验证点**：

- 博客端编译通过
- 博客端渲染正常

---

### Phase 11：清理与最终验证

​**目标**：删除临时别名、清理冗余代码、全量验证。

​**清理**：

- 删除 `packages/editor` 中临时的 `@/` 别名
- 删除桌面端已迁移到 packages 的重复文件
- 更新所有 tsconfig.json 的 paths

​**最终验证**：

```BASH
pnpm install
pnpm --filter desktop dev      # 开发模式
pnpm --filter desktop build    # 生产构建 + Electron 打包
pnpm --filter blog dev         # 博客开发
pnpm --filter blog build       # 博客构建
```

​**功能回归清单**：

- Editor 基本编辑（文本、格式）
- 图片/视频/音频上传
- 资源引用计数
- AI 功能（继续写、TTS）
- 白板
- 数据库表格
- Typst 编译
- 自定义块
- 博客 Outline 导航
- 主题切换

---

## 五、风险与规避

|  风险                         |  规避措施                                 |
| --------------------------- | ------------------------------------- |
|  Editor 依赖过多，迁移工作量大         |  分批迁移：先 UI/样式，再接口化业务能力                |
|  博客样式/Tailwind source 路径失效  |  迁移后第一时间跑 `pnpm --filter blog build`  |
|  依赖版本冲突（React/Slate 等）      |  公共库设为 peerDependencies，apps 统一版本     |
|  Electron 构建路径变化            |  校对 worker/ffmpeg/jieba 复制路径          |
|  残留的 @/ 别名导致编译失败            |  全仓 `rg "@/" --type ts` 排查            |
|  shared 包误引入 Electron API   |  包内设置 `"types": ["dom"]`，Node 能力走接口   |
|  pnpm 脚本/CI 配置失效            |  同步更新工作目录和缓存路径                        |

---

## 六、关键文件清单

### 需要迁移的核心文件

- `src/components/Editor/` → `packages/editor/`
- `src/components/Outline/` → `packages/shared/`
- `src/components/DndProvider/` → `packages/shared/`
- `src/components/For/` → `packages/shared/`
- `src/components/If/` → `packages/shared/`
- `src/themes/` → `packages/themes/`
- `src/utils/editor.tsx`（部分）→ `packages/shared/`
- `src/hooks/useThemeColors.ts` → `packages/shared/`

### 需要修改的配置文件

- `pnpm-workspace.yaml`
- `package.json`
- `vite.config.mts` → `apps/desktop/`
- `tsconfig.json` → `apps/desktop/`
- `electron-builder.yml` → `apps/desktop/`
- `blog/vite.config.ts` → `apps/blog/`
- `blog/tsconfig.json` → `apps/blog/`

### 需要更新引用的文件

- `apps/blog/src/templates/card/CardPage.tsx`
- `apps/blog/src/templates/doc/DocPage.tsx`
- `apps/blog/src/templates/article/ArticlePage.tsx`
