# Tau 官网

Tau 的产品介绍页。Vite 构建，部署到 Cloudflare Pages；下载信息由 Pages Functions 在访问首页时更新。

页面里的应用示意全部由 HTML/CSS 与少量 TypeScript 生成，不使用截图。颜色直接引用 `@tau/themes/tokens.css`，和桌面端是同一套主题。

站点有三个入口：首页 `/`（原生 TypeScript），使用文档 `/docs/` 与更新日志 `/changelog/`（React，正文用产品的 Editor 只读渲染）。顶部导航的「使用文档」「更新日志」「插件中心」与 GitHub 链接数据在 `src/lib/site.ts`，各页共用。

## 命令

在仓库根目录执行：

```sh
pnpm dev:website      # 本地开发，http://localhost:5180
pnpm build:website    # 类型检查 + 构建到 apps/website/dist
pnpm deploy:website   # 构建并上传到 Cloudflare Pages（项目 tau-website，生产分支 master）
```

在本目录可以单独执行 `pnpm test`（下载信息解析、芯片识别及 Workers 运行时回归）和 `pnpm preview`（预览构建快照）。

## 下载信息

版本号、发布日期、安装包地址和大小不写死在页面里。`build/release.ts` 读取 `https://dl.taunote.app/desktop/` 下的 `latest.yml`（Windows）和 `latest-mac.yml`（macOS），也就是 `pnpm publish:desktop` 发布的两个清单。构建时生成下载快照；访问线上首页时，`functions/_middleware.ts` 读取实时清单，更新版本、大小和两处下载按钮，发布清单最多缓存 60 秒。

- 某个平台没有发布（文件 404）时，按钮显示「即将推出」，其余平台照常展示。
- 一个平台都读不到，或发布源返回其他错误时，`build` 直接失败，避免把空的下载区部署上线。本地 `dev` 只打印警告并显示占位。
- 运行时发布源故障或超时，保留可用的构建快照；首页不使用浏览器缓存，避免旧页面阻止版本更新。
- macOS 按 Apple 芯片与 Intel 芯片分别展示下载入口。访客打开页面后，脚本根据系统和芯片推荐主按钮；无法识别芯片时说明如何查看。
- 下载按钮经 `https://analytics.taunote.app/v1/downloads/:filename?channel=website` 记录下载发起，校验 R2 对象后跳转到原 `dl.taunote.app/desktop/:filename`。安装包与自动更新仍由 R2 分发；先部署 Analytics，再部署官网。统计数据库故障不会阻断跳转，入口服务不可用时仍需先恢复入口服务。

发布新版本桌面端后，打开或刷新官网即可自动获取最新下载信息，无需重新部署官网。安装包仍须通过发布脚本上传到下载源。

## 使用文档

正文是 `content/docs/<slug>.md`（首篇为 `index.md`），目录、顺序、标题和描述在 `src/docs/manifest.ts`。新增一篇：写好 Markdown，再在 manifest 里登记；`manifest.test.ts` 会检查两边一一对应。

- Markdown 经 `@tau/markdown` 与产品同一套 codec 转成编辑器内容，再由 `<Editor readonly>` 渲染，效果与桌面端一致。除标准语法外可以用提示块 `:::tip{title="…"}`（另有 note / info / warning / danger）、折叠块 `:::detail{title="…"}`、`<kbd>`、`$公式$` 与代码块。
- 页面标题与描述来自 manifest，正文里从二级标题写起；右侧大纲取正文中的各级标题。
- 站内链接写 `/docs/<slug>/`，点击时在文档页内切换，不整页刷新。
- 构建时为每篇文档各生成一份 `docs/<slug>/index.html`（标题和描述已填好），静态托管直接命中；开发服务器把 `/docs/<slug>/` 改写到同一个模板。
- 文档页的样式只用 Tailwind 和 `@tau/themes` 的语义类，不引入首页的 `src/styles/*.css`：那里有不在 layer 里的通配规则，会压过 Tailwind 工具类。

## 更新日志

正文不在本目录维护，构建时直接读取 `apps/desktop/release-notes/<版本号>.md` 与 `apps/mobile/release-notes/<版本号>.md`（写法见两处 README），按版本号从新到旧排列。发布新版本后需要重新部署官网，更新日志才会出现新版本。

- 一页展示一端，顶部切换桌面端与手机端；右侧版本列表随滚动高亮，点击跳到对应版本。
- 版本号是页面上的二级标题，正文里的标题整体降一级渲染；每个版本一个只读编辑器，滚到底部再补下一批。
- 地址锚点 `#desktop-<版本号>` / `#mobile-<版本号>` 可直接分享某个版本，`#mobile` 打开手机端。
- 与使用文档共用顶部导航、编辑器 kit、Markdown 处理器和 `docs.css`。

GitHub 星标数由访客浏览器请求 GitHub 公开 API，本地缓存一小时；不足 100 星或请求失败时只显示 GitHub 入口。

## 部署

采用和插件中心相同的 Direct Upload 方式：本地构建后用 Wrangler 上传，不接 Git 自动构建。原因是仓库根目录的 `postinstall` 会重编 Electron 原生模块，放到 Pages 构建机上既慢又容易失败。

首次部署前：

1. `pnpm exec wrangler login` 登录 Cloudflare（或设置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`）。
2. 在本目录执行 `pnpm exec wrangler pages project create tau-website --production-branch master` 创建项目。
3. 执行 `pnpm deploy:website`。
4. 在 Cloudflare 控制台为项目绑定自定义域名。

`--force` 的作用是在当前 Wrangler 版本下选择经典 Pages 项目（见 `apps/plugin-portal/infra/README.md`）。`public/_headers` 设置了缓存策略：`/assets/*` 带内容哈希，长期缓存。

## 目录

```
index.html            首页结构（含 SVG 图标雪碧图）
docs/index.html       使用文档的页面模板
changelog/index.html  更新日志的页面模板
content/docs/         使用文档正文（Markdown）
src/main.ts           首页入口：引入样式，按顺序初始化各模块
src/modules/          首页各区块的行为：示意窗口外壳、首屏斜线、主题、所见即所得演示、白板手绘与数据库视图切换、闭环滚动、日常组件、GitHub 星标
src/styles/           首页按区块拆分的样式，最后是响应式
src/docs/             使用文档：目录、编辑器 kit 与 Markdown 处理器、页面组件
src/changelog/        更新日志：读取两端发布说明、页面组件
src/lib/              两个入口共用的工具：站点链接、GitHub 星标、平台识别
build/release.ts      构建与运行时共用的清单解析和下载信息渲染
build/siteNav.ts      首页导航与页脚的入口标记
functions/            首页请求时更新下载信息，异常时保留快照
public/               原样拷贝：图标、_headers、仅匹配首页的 _routes.json
```
