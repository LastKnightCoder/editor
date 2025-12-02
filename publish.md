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

使用 WebSocket 推送发布进度：

**后端发送**：

```typescript
// src-electron/main/modules/publish.ts
backendServer.sendNotification("publish-progress", {
  phase: "uploading",
  current: 5,
  total: 20,
  currentFile: "cards/123.html",
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
