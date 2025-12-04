# Monorepo 重构迁移方案

## 目标

- 重构为标准 monorepo：`apps/desktop`（主桌面+Electron）、`apps/blog`（博客模板），公共能力下沉至 `packages/*`。
- 消除博客对桌面 `@` 别名的反向引用；桌面/博客通过公共包依赖共享编辑器与基础组件。
- 规范构建脚本、别名与 TypeScript 配置，确保两端独立构建但共享依赖。

## 现状快照

- 桌面端：`src`、`src-electron`，Vite/Electron 配置在根；别名 `@`/`@editor` 指向根 `src`。
- 博客：独立 Vite 配置，但 `paths`/alias 指向根 `src` 与 `src/components/Editor`；直接使用 `Editor`、`Outline`、`DndProvider`、`getInlineElementText`，并引用 `src/themes/*.less` 和 Editor Tailwind `@source`。
- Workspace：`pnpm-workspace.yaml` 仅包含 `packages/*` 与 `blog`；已有第三方包 `packages/foliate-js`。

## 目标目录结构（建议）

```
apps/
  desktop/
    package.json
    tsconfig.json
    vite.config.mts
    electron-builder.yml
    src/
    src-electron/
    index.html
  blog/
    package.json
    tsconfig.json
    vite.config.ts
    src/
packages/
  editor/    # Editor 组件与内部扩展
  shared/    # 轻量通用组件/工具（Outline、DndProvider、For/If 等）
  themes/    # 公共主题与 Tailwind source（可与 shared 合并）
  foliate-js/
pnpm-workspace.yaml
```

## 包职责拆分

- `packages/editor`
  - 搬迁 `src/components/Editor/**`，对外导出 `Editor`、`types`（含 `HeaderElement` 等）、必要工具（`getInlineElementText` 等）。
  - 将对应用层能力（`@/commands`/`@/stores`/`@/services`/`@/components` 非通用部分）改为可注入接口 `EditorServices`（定义在包内 `services/types.ts`），由应用层提供实现。
  - 保留编辑器内部依赖（Slate、ahooks、classnames 等）为 peerDependencies；内部必须的运行时依赖放 dependencies。

- `packages/shared`
  - 搬迁博客直接依赖的轻量组件/工具：`Outline`、`DndProvider`、`For`/`If`、`useThemeColors`（若无全局状态依赖）、`utils/editor.tsx` 中只读相关方法等。
  - 不允许依赖 Electron 或桌面端状态。

- `packages/themes`（可与 shared 合并）
  - 搬运 `src/themes/light.less`、`dark.less` 以及编辑器 Tailwind `@source` 路径，封装为可供两端直接引用的入口。

- 应用层
  - `apps/desktop`：保留业务代码与 Electron 构建；提供 `EditorServices` 的完整实现（资源、文件、AI、白板、数据库等）。
  - `apps/blog`：仅依赖 `@tau/editor`、`@tau/shared`、`@tau/themes`，不再引用根 `src`。

## 迁移步骤（顺序化）

1. ​​**目录重排**

- 创建 `apps/desktop` 并移动：`src`、`src-electron`、`vite.config.mts`、`electron-builder.yml`、`tsconfig.json`、`index.html`、`vite-env`/`global` 配置等。
- 将 `blog` 目录移动到 `apps/blog`。
- 更新 `pnpm-workspace.yaml`：`packages/*`、`apps/*`。

1. ​​**基础包初始化**

- 创建 `packages/editor`、`packages/shared`、`packages/themes`（可选合并），添加 `package.json`（如 `@tau/editor`、`@tau/shared`）、`tsconfig.json`（`composite: true`）、入口 `src/index.ts`。
- 设置 peerDependencies（`react`、`react-dom`、`slate`、`slate-react`、`slate-history`、`ahooks`、`classnames`、`antd` 等）和 devDependencies 锁版本；避免重复打包。

1. ​​**代码迁移与解耦**

- 将 `src/components/Editor/**` 移动到 `packages/editor/src`，内部 import 全量改用包内相对路径或 `@tau/shared`，禁止残留 `@/`。
- 对 `@/commands`/`@/stores`/`@/services`/`@/components` 的依赖：
  - 通用 UI/工具（如 `PortalToBody`、`CustomModal`、`ModernTabs` 等若无业务耦合）下沉到 `packages/shared`。
  - 业务能力改为从 `EditorServices` 获取（文件选择、资源上传、AI、白板、数据库等）；桌面实现放 `apps/desktop/src/editor-services/*`，博客实现只读/空实现。

- 将 `Outline`、`DndProvider`、`For`/`If`、`getInlineElementText`、`useThemeColors`（若无全局状态耦合）迁移到 `packages/shared` 并更新两端引用。
- 将 `themes`、编辑器相关 Tailwind `@source` 放到 `packages/themes`（或 shared）并暴露入口，替换博客 `@source "../../../src/components/Editor"`。

1. ​​**配置与脚本调整**

- 根 `package.json` 脚本改为 monorepo 风格：`dev:desktop`/`build:desktop`、`dev:blog`/`build:blog` 使用 `pnpm --filter`；保留/调整 electron-builder 入口。
- `apps/desktop/vite.config.mts`：别名 `@` 指向 `apps/desktop/src`，新增 `@tau/editor`、`@tau/shared`、`@tau/themes`；Electron 构建路径（workers、ffmpeg、dict.txt）按新相对路径修正。
- `apps/desktop/tsconfig.json`：`baseUrl` 指向本地 `src`；`paths` 绑定新包名称；`include` 仅覆盖 `src`、`src-electron`。
- `apps/blog/vite.config.ts`/`tsconfig.json`：移除对根 `src` 的别名和 include，只保留 `@blog/*`、`@tau/editor`、`@tau/shared`、`@tau/themes`；Tailwind `@source` 路径指向新包。

1. ​​**引用替��与清理**

- 博客侧将 `@/components/Editor`、`@/components/Outline`、`@/utils` 等引用替换为包路径。
- 桌面侧替换 `@editor/*` 为包导出；内部相对路径适配迁移后的包结构。
- 清理旧别名定义（根 tsconfig、Vite alias 中对 `src` 的引用）。

1. ​​**验证**

- `pnpm install`（workspace 正常解析）。
- `pnpm --filter desktop dev`、`pnpm --filter desktop build`（含 Electron 打包）。
- `pnpm --filter blog build`（编辑器只读渲染、Outline 滚动定位、主题样式）。
- 手动回归：桌面端 Editor 读写、资源上传/白板/数据库/AI 注入能力正常；博客模板页面渲染无样式/脚本缺失。

## 配置要点与接口清单

- ​​**别名/路径**：统一使用包名（`@tau/editor`、`@tau/shared`、`@tau/themes`）；`@` 仅在各自 app 内指向本地 `src`。
- ​​**EditorServices 接口（示例）**：文件选择/读取、资源上传与引用计数、AI/LLM 请求、白板/数据库 CRUD、外链打开、主题/设置获取等。不可直接从包内引用应用 store 或 Electron API。
- ​​**Tailwind/样式**：博客 `@source` 改指包内路径；主题 less 通过 `@tau/themes` 引入，避免硬编码相对路径。
- ​​**Electron 构建**：`dist-electron` 输出路径基于 `apps/desktop`；workers/ffmpeg/jieba dict 复制路径同步更新。

## 风险与规避（项目级详化）

- ​**Editor 依赖桌面端命令/Store 较多**
  - 风险：直接搬迁会造成大量 `@/commands`/`@/stores` 未定义或循环引用。
  - 规避：搬迁前先列出 Editor 内所有 `@/` 引用，分类为「可下沉 UI/工具」与「必须接口化的业务能力」，先完成接口设计与 stub，再迁移代码。

- ​**博客样式/编译路径依赖旧相对位置**
  - 风险：Tailwind `@source "../../../src/components/Editor"`、主题 less 路径变更导致博客渲染无样式或产物缺失。
  - 规避：提供包内样式入口（`@tau/themes` 或 `@tau/editor/styles`），更新 `@source` 为包路径；迁移后第一时间跑 `pnpm --filter blog build` 验证。

- ​**依赖重复与版本冲突**
  - 风险：Editor/Shared 引入 React/Slate/ahooks 等 runtime 作为 dependencies，可能与 apps 版本不一致，导致多份 bundle 或 hook 冲突。
  - 规避：这些库设为 peerDependencies，apps 指定统一版本；必要的次级库（如 classnames）可放 dependencies。

- ​**Electron 构建路径变化**
  - 风险：worker、ffmpeg、jieba 词典复制路径相对根目录变化，打包后缺文件。
  - 规避：在 `apps/desktop` 重新校对 `copy` 路径并在 `pnpm --filter desktop build` 后检查 `dist-electron` 文件完整性。

- ​**TS 路径与 alias 残留**
  - 风险：旧的 `@`/`@editor` 路径残留在代码或配置，导致编译失败或引用到错误位置。
  - 规避：重写 tsconfig/Vite alias 后全仓 `rg "@/`/`@editor"` 排查替换；CI 添加 `pnpm lint`/`pnpm test` 阶段验证。

- ​**共享包不应依赖 Electron/Node 专有 API**
  - 风险：Shared/Editor 不小心引用 `fs`、`ipcRenderer` 等，破坏浏览器端或 SSR。
  - 规避：在包内增加 lint 规则或类型隔离（`"types": ["dom"]`），Node/Electron 能力通过 `EditorServices` 注入。

- ​**pnpm workspace 目录调整后的脚本失效**
  - 风险：原根脚本、CI 配置、husky 钩子使用旧路径。
  - 规避：同步更新根脚本与 CI workflow 的工作目录与缓存路径；在本地跑一遍 `dev/build/test` 验证。

- ​**样式变量/主题 token 依赖全局上下文**
  - 风险：`useThemeColors` 可能依赖桌面端全局 store，迁移后博客侧报错或失效。
  - 规避：抽象为纯函数或可注入的 theme provider；博客端提供静态主题上下文。

## 建议执行顺序

1. 完成目录重排和 workspace 配置，确保 `pnpm install`、`pnpm --filter desktop dev` 基础可跑（无代码搬迁）。
2. 初始化公共包骨架，替换别名/paths 配置。
3. 分批下沉 Editor：先搬 UI/样式与无业务耦合部分，再对命令/存储调用进行接口化注入。
4. 更新博客引用与 Tailwind source，运行 `pnpm --filter blog build` 校验。
5. 完整回归三套构建（desktop dev/build、blog build），再清理遗留别名与无用文件。
