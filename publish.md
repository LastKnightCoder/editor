# 博客发布功能技术方案文档

## 一、功能概述

### 1.1 项目目标

实现类似 VitePress/Hexo 的静态博客发布功能，支持将应用中的卡片、文章、项目（文档类型）和知识库发布为静态网站，部署到 GitHub Pages 或 S3 兼容的对象存储服务。

### 1.2 核心特性

- **多内容类型支持**：卡片、文章、项目、知识库
- **多发布源支持**：GitHub Pages、S3 静态托管
- **增量发布**：只上传新增/修改的文件，删除取消发布的内容
- **失败重试**：文件上传失败时自动重试（最多3次，指数退避）
- **发布选择记忆**：记住用户上次选择的发布内容
- **实时进度反馈**：通过 WebSocket 实时推送发布进度

---

## 二、整体架构

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          前端 (Renderer)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │  PublishSetting │  │ PublishSelector │  │   进度/结果展示    │   │
│  │    (设置页面)    │  │  (内容选择器)   │  │                   │   │
│  └────────┬────────┘  └────────┬────────┘  └─────────▲─────────┘   │
│           │                    │                     │             │
│           └────────────┬───────┘                     │             │
│                        │ commands                    │ WebSocket   │
│                        ▼                             │             │
├────────────────────────┼─────────────────────────────┼─────────────┤
│                        │                             │             │
│  ┌─────────────────────▼─────────────────────────────┴──────────┐  │
│  │                     Electron Main Process                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │ publish.ts   │  │  Providers   │  │ BackendWebSocket   │  │  │
│  │  │ (发布核心)    │──│ (发布提供者)  │  │   (进度推送)        │  │  │
│  │  └──────┬───────┘  └──────────────┘  └────────────────────┘  │  │
│  │         │                                                      │  │
│  │  ┌──────▼───────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │   SQLite     │  │ Template     │  │  File System       │  │  │
│  │  │  (选择/历史)  │  │ (模板处理)    │  │  (临时文件)         │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                          后端 (Main)                                 │
└─────────────────────────────────────────────────────────────────────┘

                                 │
                                 │ HTTP/API
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         外部服务                                     │
│  ┌─────────────────────┐        ┌─────────────────────┐            │
│  │   GitHub Pages      │        │   S3 Compatible     │            │
│  │   (gh-pages 分支)    │        │   (静态网站托管)     │            │
│  └─────────────────────┘        └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户选择内容 → 保存到 publish_selections 表
     │
     ▼
用户点击发布 → 下载模板 → 生成静态文件 → 计算文件哈希
     │                         │
     │                         ▼
     │              对比 publish_history 表
     │                         │
     │              ┌──────────┴──────────┐
     │              ▼                     ▼
     │         新增/更新文件          未变化文件(跳过)
     │              │
     │              ▼
     │         上传到目标服务
     │              │
     │              ▼
     │         更新 publish_history
     │              │
     ▼              ▼
WebSocket 推送进度 ← 发布完成
```

---

## 三、目录结构

### 3.1 博客模板项目 (`blog/`)

```
blog/
├── index.html                    # 开发调试入口页
├── package.json                  # 依赖配置
├── vite.config.ts               # Vite 多入口配置
├── tsconfig.json                # TypeScript 配置
└── src/
    ├── mock/
    │   └── data.ts              # Mock 数据（开发调试用）
    ├── styles/
    │   └── global.css           # 全局样式 + CSS 变量
    ├── types/
    │   └── index.ts             # 类型定义
    ├── utils/
    │   └── index.ts             # 工具函数
    ├── components/
    │   ├── Layout/
    │   │   ├── Header.tsx       # 页头（导航 + 主题切换）
    │   │   ├── Footer.tsx       # 页脚
    │   │   └── Sidebar.tsx      # 侧边栏（文档导航/文章列表/标签树）
    │   └── Common/
    │       ├── Tag.tsx          # 标签组件
    │       ├── Breadcrumb.tsx   # 面包屑导航
    │       └── Pagination.tsx   # 分页组件
    └── templates/
        ├── home/                # 首页模板
        │   ├── index.html
        │   ├── main.tsx
        │   └── HomePage.tsx
        ├── card/                # 卡片详情模板
        │   ├── index.html
        │   ├── main.tsx
        │   └── CardPage.tsx
        ├── article/             # 文章详情模板
        │   ├── index.html
        │   ├── main.tsx
        │   └── ArticlePage.tsx
        ├── doc/                 # 文档模板（项目/知识库）
        │   ├── index.html
        │   ├── main.tsx
        │   └── DocPage.tsx
        └── list/                # 列表模板
            ├── index.html
            ├── main.tsx
            └── ListPage.tsx
```

### 3.2 主项目相关文件

```
src/
├── types/
│   └── publish.ts                    # 发布相关类型定义
├── stores/
│   └── useSettingStore.ts            # 发布配置存储（扩展）
├── commands/
│   └── publish.ts                    # 前端调用的发布命令
└── pages/Settings/PublishSetting/
    ├── index.tsx                     # 发布设置主页面
    ├── GithubPublishSetting.tsx      # GitHub 发布配置
    ├── S3PublishSetting.tsx          # S3 发布配置
    └── PublishSelector.tsx           # 内容选择器

src-electron/main/modules/
├── tables/
│   ├── publish-selection.ts          # 发布选择记录表
│   └── publish-history.ts            # 发布历史记录表
├── publish-providers/
│   ├── types.ts                      # 发布提供者接口
│   ├── github-pages.ts               # GitHub Pages 实现
│   ├── s3-hosting.ts                 # S3 托管实现
│   └── index.ts                      # 提供者工厂
└── publish.ts                        # 发布核心模块
```

---

## 四、数据库设计

### 4.1 发布选择表 (`publish_selections`)

记录用户选择要发布的内容。

```sql
CREATE TABLE publish_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,           -- 内容类型：card/article/project/document
  content_id INTEGER NOT NULL,          -- 内容 ID
  parent_path TEXT DEFAULT '',          -- 父级路径（用于项目/知识库层级）
  selected INTEGER DEFAULT 1,           -- 是否选中：0-否，1-是
  update_time INTEGER NOT NULL,         -- 更新时间戳
  UNIQUE(content_type, content_id)
);
```

### 4.2 发布历史表 (`publish_history`)

记录已发布文件的信息，用于增量发布。

```sql
CREATE TABLE publish_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,       -- 发布的文件路径
  content_hash TEXT NOT NULL,           -- 内容哈希（MD5）
  source_type TEXT NOT NULL,            -- 来源类型：card/article/project/document
  source_id INTEGER NOT NULL,           -- 来源内容 ID
  publish_time INTEGER NOT NULL         -- 发布时间戳
);
```

---

## 五、配置设计

### 5.1 发布配置结构 (`ISetting.publish`)

```typescript
interface IPublishSetting {
  active: EPublishProvider; // 当前激活的发布提供者
  github: {
    repo: string; // 仓库名 (user/repo)
    branch: string; // 发布分支，默认 'gh-pages'
    // basePath 自动推导：
    // - user.github.io 仓库 → '/'
    // - 其他仓库 → '/repo-name/'
  };
  s3: {
    bucket: string; // S3 存储桶
    region: string; // 区域
    path: string; // 上传路径前缀
    basePath: string; // 访问路径（用户自定义）
  };
  site: {
    title: string; // 站点标题
    description: string; // 站点描述
  };
}

enum EPublishProvider {
  Github = "github",
  S3 = "s3",
}
```

### 5.2 凭证复用

发布功能复用集成设置中的凭证：

- **GitHub**：`integration.github.token`、`integration.github.user`
- **S3**：`integration.s3.accessKeyId`、`integration.s3.secretAccessKey`、`integration.s3.endpoint`

---

## 六、发布提供者

### 6.1 接口定义

```typescript
interface IPublishProvider {
  name: string;

  // 上传单个文件
  uploadFile(path: string, content: Buffer): Promise<void>;

  // 删除单个文件
  deleteFile(path: string): Promise<void>;

  // 列出已发布的文件
  listFiles(prefix?: string): Promise<string[]>;

  // 测试连接
  testConnection(): Promise<boolean>;
}
```

### 6.2 GitHub Pages 提供者

**关键文件**：`src-electron/main/modules/publish-providers/github-pages.ts`

**实现要点**：

- 使用 GitHub API 操作仓库内容
- 通过 Trees API 批量提交文件（减少 API 调用）
- 自动推导 basePath（基于仓库名）
- 支持配置发布分支（默认 `gh-pages`）

**basePath 推导规则**：

```
仓库名为 <username>.github.io → basePath = '/'
其他仓库 → basePath = '/<repo-name>/'
```

### 6.3 S3 托管提供者

**关键文件**：`src-electron/main/modules/publish-providers/s3-hosting.ts`

**实现要点**：

- 使用 AWS SDK v3 (@aws-sdk/client-s3)
- 支持自定义 endpoint（兼容各种 S3 兼容存储）
- 支持 path-style 和 virtual-hosted-style URL
- basePath 由用户配置（因为可能绑定自定义域名）

---

## 七、发布流程

### 7.1 完整发布流程

```
1. 准备阶段
   ├── 验证发布配置完整性
   ├── 获取已选择的发布内容
   └── 下载/解压模板（如果需要）

2. 生成阶段
   ├── 遍历选中内容
   ├── 为每个内容生成 HTML 文件
   │   ├── 读取对应模板
   │   ├── 注入数据到 window._INIT_DATA_
   │   └── 替换 basePath
   ├── 生成首页（时间线）
   ├── 生成列表页
   └── 计算所有文件的 MD5 哈希

3. 对比阶段
   ├── 读取 publish_history 表
   ├── 对比文件哈希
   └── 生成发布计划：
       ├── toUpload: 新增或内容变化的文件
       ├── toDelete: 之前发布但这次未选中的文件
       └── unchanged: 内容未变化的文件（跳过）

4. 执行阶段
   ├── 并发上传文件（带重试机制）
   ├── 删除旧文件
   ├── 更新 publish_history 表
   └── 通过 WebSocket 推送进度

5. 完成阶段
   └── 返回发布结果（成功/失败统计）
```

### 7.2 增量发布逻辑

```typescript
interface PublishPlan {
  toUpload: FileInfo[]; // 新增或更新的文件
  toDelete: string[]; // 需要删除的文件
  unchanged: string[]; // 未变化的文件（跳过）
}

function buildPublishPlan(
  newFiles: FileInfo[],
  history: PublishHistory[],
): PublishPlan {
  const historyMap = new Map(history.map((h) => [h.filePath, h.contentHash]));
  const newFileSet = new Set(newFiles.map((f) => f.path));

  const toUpload = newFiles.filter((file) => {
    const oldHash = historyMap.get(file.path);
    return !oldHash || oldHash !== file.hash;
  });

  const toDelete = history
    .filter((h) => !newFileSet.has(h.filePath))
    .map((h) => h.filePath);

  const unchanged = newFiles
    .filter((file) => historyMap.get(file.path) === file.hash)
    .map((f) => f.path);

  return { toUpload, toDelete, unchanged };
}
```

### 7.3 失败重试机制

```typescript
interface UploadOptions {
  maxRetries: number; // 默认 3
  retryDelay: number; // 重试间隔，默认 1000ms
  concurrency: number; // 并发数，默认 5
}

async function uploadWithRetry(
  provider: IPublishProvider,
  file: FileInfo,
  options: UploadOptions,
): Promise<UploadResult> {
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      await provider.uploadFile(file.path, file.content);
      return { success: true, path: file.path };
    } catch (error) {
      if (attempt === options.maxRetries) {
        return { success: false, path: file.path, error };
      }
      // 指数退避
      await delay(options.retryDelay * Math.pow(2, attempt - 1));
    }
  }
}
```

---

## 八、模板系统

### 8.1 SSG 方案

采用**模板 + 数据注入**的手动 SSG 方案：

1. **模板预构建**：使用 Vite 构建多入口模板，每种页面类型一个 HTML
2. **数据占位符**：HTML 中包含 `window._INIT_DATA_ = "__DATA_PLACEHOLDER__"`
3. **发布时替换**：将 `__DATA_PLACEHOLDER__` 替换为实际的 JSON 数据

### 8.2 Vite 多入口配置

**关键文件**：`blog/vite.config.ts`

```typescript
export default defineConfig({
  base: "./", // 相对路径，支持任意部署位置
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, "src/templates/home/index.html"),
        card: resolve(__dirname, "src/templates/card/index.html"),
        article: resolve(__dirname, "src/templates/article/index.html"),
        doc: resolve(__dirname, "src/templates/doc/index.html"),
        list: resolve(__dirname, "src/templates/list/index.html"),
      },
    },
  },
});
```

### 8.3 数据结构

**初始化数据结构** (`window._INIT_DATA_`)：

```typescript
interface InitData {
  site: {
    title: string;
    description: string;
    basePath: string;
  };
  navigation: NavItem[]; // 顶部导航
  sidebar?: SidebarItem[]; // 文档侧边栏（层级结构）
  articleList?: ArticleListItem[]; // 文章列表（博客侧边栏）
  cardTagTree?: CardTagTree[]; // 卡片标签树（卡片侧边栏）
  activeTag?: string; // 当前激活的标签
  content: ContentData; // 页面具体内容
  meta: PageMeta; // 页面元信息
}
```

### 8.4 内容渲染

**重要设计决策**：

- `content` 字段使用 `Descendant[]`（Slate 编辑器数据结构），而非 HTML 字符串
- 复用主项目的 `Editor` 组件（只读模式）渲染内容
- 复用主项目的 `Outline` 组件生成目录
- 复用主项目的主题样式（`dark.less`、`light.less`）

---

## 九、页面模板详解

### 9.1 首页模板 (`home`)

**布局**：Hero 区域 + 时间线内容列表

**数据**：

```typescript
interface HomeData {
  hero?: {
    title: string;
    description: string;
  };
  timeline: TimelineItem[]; // 最新内容（混合卡片、文章、文档）
}
```

### 9.2 卡片模板 (`card`)

**布局**：三栏布局

- 左侧：标签树导航（支持层级标签，如 `技术/前端/React`）
- 中间：卡片内容（Editor 组件渲染）
- 右侧：目录 + 关联卡片 + 相关卡片

**标签匹配规则**：

- 卡片只显示在**完全匹配**的标签下
- 例如：卡片标签为 `技术/前端`，点击 `技术` 不显示，点击 `技术/前端` 才显示

**数据**：

```typescript
interface CardData {
  id: number;
  content: Descendant[];
  tags: string[];
  category: "temporary" | "permanent" | "theme" | "literature";
  linkedCards?: LinkedCardInfo[]; // 双向链接的卡片
  relatedCards?: LinkedCardInfo[]; // 相同标签的卡片
  createTime: number;
  updateTime: number;
}
```

### 9.3 文章模板 (`article`)

**布局**：三栏布局

- 左侧：文章列表导航
- 中间：文章内容（Editor 组件渲染）
- 右侧：目录

**数据**：

```typescript
interface ArticleData {
  id: number;
  title: string;
  author: string;
  content: Descendant[];
  tags: string[];
  bannerBg?: string;
  createTime: number;
  updateTime: number;
}
```

### 9.4 文档模板 (`doc`)

**布局**：三栏布局

- 左侧：文档层级导航（树形结构）
- 中间：文档内容 + 上一页/下一页
- 右侧：目录

**数据**：

```typescript
interface DocData {
  id: number;
  title: string;
  content: Descendant[];
  breadcrumb: { label: string; href: string }[];
  prevPage?: { title: string; href: string };
  nextPage?: { title: string; href: string };
  createTime: number;
  updateTime: number;
}
```

### 9.5 列表模板 (`list`)

**布局**：两栏布局

- 主体：内容卡片列表 + 分页
- 侧边：标签筛选

**数据**：

```typescript
interface ListData {
  title: string;
  type: "card" | "article" | "doc";
  items: ListItem[];
  pagination?: {
    current: number;
    total: number;
    pageSize: number;
  };
  tags?: { name: string; count: number }[];
  activeTag?: string;
}
```

---

## 十、主题系统

### 10.1 主题切换

- 使用 `html` 元素的 `data-theme` 属性控制主题
- 支持 `light` 和 `dark` 两种主题
- 主题偏好存储在 `localStorage`
- 首次访问时跟随系统偏好

### 10.2 CSS 变量

**关键文件**：`blog/src/styles/global.css`

```css
:root {
  /* 背景色 */
  --color-bg-page: #f3f4f6;
  --color-bg-container: #ffffff;
  --color-bg-canvas: #f9fafb;

  /* 文字色 */
  --color-text-primary: #111827;
  --color-text-secondary: #4b5563;
  --color-text-tertiary: #6b7280;

  /* 边框色 */
  --color-border-primary: #e5e7eb;

  /* 品牌色 */
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
}

[data-theme="dark"] {
  --color-bg-page: #0f172a;
  --color-bg-container: #1e293b;
  /* ... 暗色主题变量 */
}
```

---

## 十一、前端 UI

### 11.1 发布设置页面

**关键文件**：`src/pages/Settings/PublishSetting/index.tsx`

**功能模块**：

1. **发布目标**：选择 GitHub Pages 或 S3，配置相关参数
2. **站点配置**：设置站点标题和描述
3. **发布内容**：选择要发布的卡片、文章、项目、知识库
4. **发布操作**：预览发布计划、执行发布、查看进度和结果

### 11.2 内容选择器

**关键文件**：`src/pages/Settings/PublishSetting/PublishSelector.tsx`

**功能**：

- 标签页切换不同内容类型
- 卡片按标签分组显示
- 支持全选/单选
- 显示已选择数量
- 选择状态自动保存到数据库

### 11.3 进度展示

通过 WebSocket 实时接收进度：

```typescript
interface IPublishProgress {
  phase: "preparing" | "uploading" | "deleting" | "finishing";
  current: number;
  total: number;
  currentFile?: string;
}
```

---

## 十二、通信机制

### 12.1 命令调用

前端通过 `commands` 调用后端功能：

**关键文件**：`src/commands/publish.ts`

```typescript
// 检查连接
export const checkPublishConnection = (params) =>
  invoke("check-publish-connection", params);

// 预览发布计划
export const previewPublishPlan = () => invoke("preview-publish-plan");

// 执行发布
export const executePublish = (params) => invoke("execute-publish", params);

// 下载模板
export const downloadPublishTemplate = () =>
  invoke("download-publish-template");

// 获取/保存发布选择
export const getPublishSelections = () => invoke("get-publish-selections");
export const batchUpsertPublishSelections = (items) =>
  invoke("batch-upsert-publish-selections", items);
```

### 12.2 进度推送

发布模块通过 WebSocket 的 `publish-progress` 通知实时广播状态，`publish.ts` 初始化后会注入 `BackendWebSocketServer`，所有进度更新都统一由后台推送，前端通过 `useBackendWebsocketStore` 订阅即可。

**后端发送**：

```typescript
// src-electron/main/modules/publish.ts
this.backendServer?.sendNotification("publish-progress", {
  phase: "uploading",
  current,
  total,
  currentFile: file.path,
});
```

**前端接收**：

```typescript
// src/pages/Settings/PublishSetting/index.tsx
useEffect(() => {
  if (!client) return;

  const handleProgress = (data: unknown) => {
    setProgress(data as IPublishProgress);
  };

  client.registerNotificationHandler("publish-progress", handleProgress);

  return () => {
    client.unregisterNotificationHandler("publish-progress", handleProgress);
  };
}, [client]);
```

---

## 十三、开发调试

### 13.1 模板开发

```bash
cd blog
pnpm install
pnpm dev
```

访问 `http://localhost:5173/` 查看模板选择页面。

### 13.2 Mock 数据

**关键文件**：`blog/src/mock/data.ts`

开发环境自动加载 Mock 数据：

```typescript
if (import.meta.env.DEV) {
  import("@blog/mock/data").then(({ mockCardPageData }) => {
    window._INIT_DATA_ = mockCardPageData;
    // 渲染页面...
  });
}
```

### 13.3 链接处理

开发环境下，`joinPath` 函数自动将链接转换为模板页面路径：

- `/cards/123` → `/src/templates/card/index.html`
- `/articles/456` → `/src/templates/article/index.html`

---

## 十四、关键文件清单

| 文件路径                                                      | 说明                   |
| ------------------------------------------------------------- | ---------------------- |
| `blog/vite.config.ts`                                         | 模板构建配置           |
| `blog/src/styles/global.css`                                  | 全局样式和 CSS 变量    |
| `blog/src/types/index.ts`                                     | 模板类型定义           |
| `blog/src/utils/index.ts`                                     | 工具函数               |
| `blog/src/mock/data.ts`                                       | Mock 数据              |
| `blog/src/templates/*/`                                       | 各页面模板             |
| `blog/src/components/Layout/Sidebar.tsx`                      | 侧边栏组件（含标签树） |
| `src/types/publish.ts`                                        | 发布类型定义           |
| `src/stores/useSettingStore.ts`                               | 发布配置存储           |
| `src/commands/publish.ts`                                     | 前端命令封装           |
| `src/pages/Settings/PublishSetting/index.tsx`                 | 发布设置主页面         |
| `src/pages/Settings/PublishSetting/PublishSelector.tsx`       | 内容选择器             |
| `src-electron/main/modules/tables/publish-selection.ts`       | 发布选择表             |
| `src-electron/main/modules/tables/publish-history.ts`         | 发布历史表             |
| `src-electron/main/modules/publish-providers/types.ts`        | 提供者接口             |
| `src-electron/main/modules/publish-providers/github-pages.ts` | GitHub 提供者          |
| `src-electron/main/modules/publish-providers/s3-hosting.ts`   | S3 提供者              |
| `src-electron/main/modules/publish.ts`                        | 发布核心逻辑           |

---

## 十五、后续优化方向

1. **模板定制**：支持用户自定义模板主题
2. **评论系统**：集成 Giscus/Utterances 等评论服务
3. **SEO 优化**：生成 sitemap.xml、robots.txt
4. **RSS 订阅**：生成 RSS/Atom feed
5. **搜索功能**：集成 Algolia 或本地搜索
6. **图片处理**：自动压缩和 WebP 转换
7. **CDN 加速**：支持配置 CDN 域名
8. **自定义域名**：GitHub Pages CNAME 文件生成

---

## 十六、模板构建与分发

### 16.1 构建产物流程

1. 在 `blog/` 目录内执行 `pnpm install` 保证依赖一致。
2. 使用工作区命令拉起一次构建，输出位于 `blog/dist`：

```bash
pnpm --filter tau-blog-template build
```

3. 运行模板打包脚本（将添加到 `scripts/build-publish-template.mts`），将 `dist` 复制到 `release/templates/blog-template-v<version>`，生成 `manifest.json` 并压缩为 `blog-template-v<version>.zip`。
4. 将 zip 包与 manifest 上传到对象存储或 GitHub Release，记录版本号与下载地址。

整个流程在 CI 中串联，保证应用版本号与模板版本一致（例如 `appVersion` `0.20.0` → `blog-template-v0.20.0.zip`），方便客户端按需拉取。

### 16.2 模板包结构

压缩包内部保持扁平结构，方便主进程直接读取：

```
blog-template/
├── manifest.json                # 构建时间、版本号、sha256 列表
├── assets/                      # Vite 构建出的静态资源
│   ├── home-*.js
│   ├── card-*.js
│   └── *.css
├── home.html                    # 首页模板
├── card.html                    # 卡片详情模板（对应 card/index.html 入口）
├── article.html                 # 文章模板
├── doc.html                     # 文档模板（项目/知识库）
└── list.html                    # 列表模板
```

HTML 内部只包含 `window._INIT_DATA_ = "__DATA_PLACEHOLDER__"` 占位符，其余逻辑由打包后的 JS 完成。这样发布模块只需把 JSON 注入到每个 HTML 文件即可。

### 16.3 Manifest 与多镜像

`manifest.json` 用来描述可用版本、下载地址和校验信息，示例：

```json
{
  "version": "0.20.0",
  "buildTime": 1714809600000,
  "files": {
    "zip": {
      "sha256": "7637c1...",
      "size": 3548291,
      "mirrors": [
        "https://static.tau.oss/template/blog-template-v0.20.0.zip",
        "https://github.com/xxx/releases/download/template-v0.20.0/blog-template.zip"
      ]
    }
  }
}
```

客户端（`downloadPublishTemplate`）先访问 manifest，按镜像顺序尝试下载 zip，校验 `sha256` 后再解压，避免硬编码单一 URL。

### 16.4 下载与缓存策略

- 模板解压路径：`path.join(app.getPath("userData"), "publish-templates", version)`，以版本号作为目录，便于离线重用。
- 若本地已有相同版本且校验通过，跳过下载直接复用（对比当前 `tmpdir` 随机路径的实现，可减少重复下载）。
- 下载失败时按照镜像顺序回退，全部失败后回退到「上一版本模板」（在缓存中查找最新可用版本）。
- 镜像地址写在 `src-electron/main/modules/publish.ts` 顶部的 `TEMPLATE_MANIFEST_URLS` 常量中，发布新版本时由我们更新该常量，用户无需感知模板配置。

### 16.5 模板分发渠道

| 渠道           | 用途                        | 操作方式                              |
| -------------- | --------------------------- | ------------------------------------- |
| GitHub Release | 全球访问、版本追溯          | `gh release upload template-vX file`  |
| OSS/S3（国内） | 国内加速、CI 拉取           | `ossutil cp blog-template.zip oss://` |
| 本地缓存       | 离线 fallback、测试环境使用 | 构建脚本直接写入缓存目录              |

客户端优先级：本地缓存 → 国内 OSS → GitHub Release，这样在网络条件受限时仍可完成发布。

---

## 十七、数据组装与静态路径

### 17.1 生成职责总览

- `buildPublishPlan`：读取 `publish_selections`、`publish_history`，调用 `generatePublishFiles` 拿到最新文件列表。
- `generatePublishFiles`：负责复制模板静态资源、为每个选择项构建 `IPublishInitData`、注入数据、决定输出路径。
- `PublishHistoryTable`：写入 `{ filePath, contentHash, sourceType, sourceId }`，供增量比对和回滚参考。

### 17.2 卡片数据

- 数据源：`CardTable` + `ContentTable`（正文），必要时联查 `content_link` 以解析正文内的卡片引用。
- 结构：`CardData`（`tags`、`category`、`linkedCards`、`relatedCards`、`createTime`、`updateTime`）。
- 辅助数据：
  - `cardTagTree`：使用 `generateCardTree` 构建多层标签树，`activeTag` 读取自 `parentPath`。
  - `linkedCards`：根据 `links` 字段 + 富文本内的 `content-link` 组件去重后的 ID 列表。
  - `relatedCards`：同标签卡片 Top N，按更新时间排序。
- 静态路径：`cards/<cardId>.html`，列表页为 `cards/index.html`。

### 17.3 文章数据

- 数据源：`ArticleTable.getArticleByIds`，包含 `content`、`tags`、`bannerBg` 等字段。
- 结构：`ArticleData`（`title`、`author`、`content`、`tags`、`bannerBg`、`createTime`、`updateTime`）。
- 文章导航：构建 `articleList`（标题、摘要、href）供左侧列表使用，默认按照置顶 + 创建时间倒序。
- 静态路径：`articles/<articleId>.html`，聚合页 `articles/index.html`。

### 17.4 项目/知识库文档

- 数据源：
  - 项目：`ProjectTable` + `ProjectItem`（仅 `project_type="document-tree"`）。
  - 知识库：`DocumentTable` + `DocumentItem`。
- 路径策略：
  - 根列表：`projects/index.html`、`documents/index.html`（可选）。
  - 具体文档：`docs/<type>/<entityId>/<itemId>.html`，其中 `<type>` ∈ {`project`, `document`}。
  - `parent_path` 字段用于存储树形层级（例如 `project:12/parent/child`），方便生成面包屑和 slug。
- `DocData` 内容：
  - `sidebar`：根据 `children` 数组递归生成，标记当前节点。
  - `breadcrumb`：由根到当前节点的标题/链接。
  - `prevPage` / `nextPage`：同层顺序遍历得到。
  - 知识库与项目共用 `doc` 模板，通过 `meta.type` 区分。

### 17.5 列表与首页

- 列表页 (`list.html`)：
  - `type`: `"card" | "article" | "doc"`。
  - `items`: 包含 `title`、`summary`、`href`、`tags`、`updateTime`。
  - `pagination`: 仅在内容超过 `pageSize`（默认 30）时生成。
  - `tags`: 统计数量用于筛选，生成 `/cards/index.html#tag=xxx` 形式的链接。
- 首页 (`home.html`) 时间线：
  - 从卡片、文章、项目文档、知识库文档中取最近 `N`（默认 20）条，根据 `updateTime` 合并排序。
  - `TimelineItem` 包含 `type`、`title`、`summary`、`href`、`tags`、`timestamp`。
  - 可配置 `hero` 文案来自站点设置。

### 17.6 静态文件映射

| 内容类型         | 输出路径示例                 | 模板      | `sourceType` / `sourceId`         |
| ---------------- | ---------------------------- | --------- | --------------------------------- |
| 首页             | `index.html`                 | `home`    | `home` / `0`                      |
| 卡片详情         | `cards/123.html`             | `card`    | `card` / `card.id`                |
| 卡片列表         | `cards/index.html`           | `list`    | `card` / `0`                      |
| 文章详情         | `articles/456.html`          | `article` | `article` / `article.id`          |
| 文章列表         | `articles/index.html`        | `list`    | `article` / `0`                   |
| 项目文档         | `docs/project/12/789.html`   | `doc`     | `project` / `project_item.id`     |
| 知识库文档       | `docs/document/5/321.html`   | `doc`     | `document` / `document_item.id`   |
| 文档索引（可选） | `docs/project/12/index.html` | `list`    | `project` / `project.id`          |
| 静态资源         | `assets/**`                  | -         | 记录在 `publish_history` 便于清理 |

### 17.7 附件与资源

- Slate 内容内可能包含本地图片、文件、音频等资源，引用 `resource` 表或 `remote-image-cache`。
- 生成阶段需要将引用的本地文件复制到 `assets/uploads/<hash>.<ext>`，同时在注入数据前重写节点中的 `src`、`href`。
- 为了与增量发布对齐，附件文件同样写入 `publish_history`（`sourceType` 设置为 `resource`），当卡片/文章取消选择时对应附件可自动删除。

---

## 十八、通信与可观测性

### 18.1 进度广播与多窗口

- `publish` 模块初始化时接收 `BackendWebSocketServer` 实例，所有进度通过 `backendServer.sendNotification("publish-progress", payload)` 广播给所有客户端。
- Renderer 端 `useBackendWebsocketStore` 统一使用 `registerNotificationHandler` 订阅进度消息，任意窗口都可以实时看到执行状态。
- 进度消息结构：`{ phase, current, total, currentFile }`，前端根据 `phase` 渲染“上传/删除/完成”状态。

### 18.2 失败重试与回滚

- `retryPublishFiles` 已暴露命令，UI 层需要在结果卡片上渲染「仅重试失败文件」按钮，调用 `retryPublishFiles` 时携带原 provider 配置。
- 结合 `PublishHistoryTable` 可实现“回滚”能力：新增 `rollback-publish` 命令，根据历史记录重新上传旧版本文件，并删除新增文件。
- 所有失败记录会写入 `electron-log`，包含 provider 名称、文件路径、错误堆栈，方便排查。

### 18.3 运行记录与监控

- 每次发布结束后，在 SQLite 新增 `publish_jobs`（jobId、provider、selectionCount、duration、status、createdAt）用于统计与 UI 列表。
- 暴露 `get-publish-jobs` 命令，在设置页增加“历史记录”抽屉，用于查看每次发布的摘要、日志下载链接。
- 长时间运行的上传操作需要定期心跳（例如每 30s）向 WebSocket 推送 `phase: "uploading"`，前端据此展示“仍在执行”提示，避免用户误以为程序卡死。
