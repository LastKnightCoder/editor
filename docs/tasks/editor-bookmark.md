# 网页书签块

状态：进行中
目标：编辑器新增块级「网页书签」：网站图标、网站名、标题、描述、封面，单击打开网页；桌面与移动端都可用。

视觉稿：`apps/desktop/mockups/web-bookmark/index.html`（`.claude/launch.json` 的 `web-bookmark-mock`，入口 `http://localhost:8846/apps/desktop/mockups/web-bookmark/index.html`）。

## 需求

- 三种外观：横向卡（默认，文字左封面右）、封面卡（封面在上 1.91:1，最宽 340px）、紧凑行（42px 一行）。存在节点上，「⋯ → 外观」随时切换，切换不重新抓取。封面卡在没有封面时按横向卡显示；横向卡在容器宽度 < 360px 时隐藏封面。
- 状态：抓取中（骨架，先显示域名）、抓取失败（网址当标题，编辑态给「重试」）、无元信息（网址当标题，不报错）、选中（与其他 void 块同一描边）。
- 打开：桌面单击整卡打开（编辑态也一样）；移动端阅读态单击打开，编辑态单击只选中。统一经 `IOpenerService`（`useOpenLink` 同一实现）。
- 插入：
  - 空段落粘贴单个网址时弹「粘贴为」菜单：链接（默认，↵）、网页书签、纯文本（Esc）。行内粘贴（段落里已有文字）不弹菜单，仍直接成链接。
  - 块面板「网页书签」：输入网址后插入。
  - 链接浮层「转为书签」、书签「⋯ → 转为链接」：后做。
- 编辑：编辑面板可改标题、描述、封面（网页封面 / 不显示）；改过的字段记入 `overrides`，「重新读取」只更新未改过的字段，「恢复为网页信息」清空 `overrides`。
- 移动端：横向卡改右侧 76px 方形缩略图、标题两行描述一行；编辑态选中后的操作走配件栏 / 块操作（沿用触屏 void 块的已有交互）。

## 方案

### 宿主能力

- 打开网页：已有 `IOpenerService`。
- 跨域请求：新增 `IFetchService { fetch }`（`@tau/shared/host-services`），只是把宿主已有的跨域 fetch 注册进编辑器：
  - 桌面：`commands/fetch.ts` 的 `desktopFetch`（主进程 `fetch` 模块）。
  - 移动：`plugin_fetch_*` 传输需要插件宿主 token，编辑器不在插件会话里；移动端注册改由插件宿主连接后提供（见进度）。
  - 未注册（官网文档站、博客）：插入时直接生成网址卡。
- 封面与图标存储：已有 `IResourceService.upload`，跟随「资源存储」设置——本地存 `~/.editor/resources`，选了上传插件就上传。

### 网页解析

`extensions/bookmark/src/preview.ts`，渲染进程 `DOMParser`，两端共用：

- 只读前 512KB，按 Content-Type / `<meta charset>` 解码（GBK 页面多）。
- 字段优先级：标题 og:title → twitter:title → `<title>`；描述 og:description → twitter:description → meta description；网站名 og:site_name → 域名；封面 og:image → twitter:image；图标 apple-touch-icon → icon → `/favicon.ico`。相对地址按最终地址转绝对。
- 8 秒超时；「安全验证」「登录」类拦截页按失败处理。

### 节点数据

```ts
interface BookmarkElement {
  type: "bookmark";
  url: string;
  meta?: {
    title?: string;
    description?: string;
    siteName?: string;
    image?: string; // 存储后的地址（本地路径或图床地址）
    sourceImage?: string; // 网站原始 og:image
    icon?: string;
    sourceIcon?: string;
    failed?: true; // 读取失败；读取成功但没有信息时不设
    fetchedAt: number;
  };
  overrides?: { title?: string; description?: string; image?: string | null };
  appearance?: "row" | "cover" | "compact";
  children: [{ type: "formatted"; text: "" }];
}
```

- 读取中只是本机内存状态（同媒体上传的忙态），不写进文档；没有 `meta` 且本机不在读取时按网址卡显示。
- `resources` 声明登记在 `@tau/db-schema` 的 `BUILTIN_CONTENT_RESOURCES.bookmark`（`meta.image`、`meta.icon`、`overrides.image`），导出、协作上传与博客发布都按这份声明处理。
- 发布到博客：桌面发布流程把正文里声明过的本地图片输出到 `_tau/media/` 并改写地址（与图片块同一机制，另一任务进行中），本地封面随之发布。渲染端兜底：图片先用存储后的地址，加载失败退回 `sourceImage`；网络图片加 `referrerpolicy="no-referrer"`，仍失败隐藏封面。
- Markdown：导出为独占一段的 `[标题](网址)`；导入不反向识别。

### 代码位置

- `packages/editor/src/extensions/bookmark/`：扩展本体（types / augmentations / markdown / preview / operations / components / menu / 粘贴菜单层）。
- `packages/shared/host-services.ts`：`IFetchService`。
- 装配：桌面 `services/editorKit.ts`、移动 `services/editorKit.ts`、博客 `packages/blog/src/kit.tsx`；Markdown codec 加入各端组合。
- 链接扩展：粘贴认领在空段落时改为打开「粘贴为」菜单（由书签扩展提供的层承载），行内不变。

## 决策

- 不新增主进程 / Rust 的「读取网页信息」模块，复用已有跨域 fetch，解析放渲染进程。
- 三种外观都做并可切换；桌面单击直接打开；粘贴菜单只在空段落出现。
- 封面与图标经 `IResourceService.upload`，跟随资源存储设置。
- 做成内置扩展：粘贴入口要改链接扩展的粘贴逻辑，插件开放字段没有 `ingest`。

## 进度

- [x] `IFetchService` 契约（`@tau/shared/host-services`）+ 桌面注册 `desktopFetch`；移动端经 `app/plugins/host-fetch.ts` 在插件网络连接期间提供（未连接时请求失败，书签记为读取失败，可重试）
- [x] 网页解析 `preview.ts` + 单测（字段优先级、相对地址、GBK 解码、拦截页、非 HTML）
- [x] 节点、渲染（三种外观、读取中 / 失败 / 无信息 / 选中）、菜单（打开 / 复制 / 编辑 / 重新读取 / 外观）、编辑面板（标题、描述、封面：网页 / 上传 / 不显示）
- [x] 插入：块面板「网页书签」输入网址；顶层空段落粘贴「粘贴为」菜单（链接 / 网页书签 / 纯文本），行内与触屏不弹
- [x] 封面 / 图标下载后经 `IResourceService.upload` 存储，失败保留原地址
- [x] Markdown codec、`BUILTIN_CONTENT_RESOURCES.bookmark`、HTML 导出、standard 预设（链接之前）、桌面 / 移动 / 文档站 codec 组合；void 行为夹具
- [ ] 移动端：编辑态选中后的配件栏操作（现在只有通用「块操作」菜单）；空段落粘贴后的「转为书签」入口
- [ ] 后做：链接浮层「转为书签」、书签「转为链接」
- [ ] 视觉验收（用户）

验证：

- `npx tsc --noEmit`：packages/editor、apps/desktop、apps/mobile、apps/website 通过（packages/blog、packages/shared 的既有报错在 whiteboard 与 CSS 声明，与本任务无关）。
- `npx vitest run`：packages/editor 全量 840 通过（含 bookmark 22 项）；desktop services / utils / editor-extensions、mobile services / cards / plugins transport、db-schema、collaboration 通过。desktop `portable-abc.test.ts` 在改动前已失败（客户端版本检查）。

## 收尾

完成后：交互约定与宿主服务表已在 `packages/editor/src/extensions/bookmark/README.md`（包级说明），`IFetchService` 的跨端注册方式沉淀进 `/docs/architecture/desktop.md`、`/docs/architecture/mobile.md` 的编辑器服务小节；删除本文件并更新 `docs/README.md`。
