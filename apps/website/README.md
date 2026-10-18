# Tau 官网

Tau 的产品介绍页。静态站点，Vite 构建，部署到 Cloudflare Pages。

页面里的应用示意全部由 HTML/CSS 与少量 TypeScript 生成，不使用截图。颜色直接引用 `@tau/themes/tokens.css`，和桌面端是同一套主题。

## 命令

在仓库根目录执行：

```sh
pnpm dev:website      # 本地开发，http://localhost:5180
pnpm build:website    # 类型检查 + 构建到 apps/website/dist
pnpm deploy:website   # 构建并上传到 Cloudflare Pages（项目 tau-website，生产分支 master）
```

在本目录可以单独执行 `pnpm test`（下载信息解析的单测）和 `pnpm preview`（预览构建产物）。

## 下载信息

版本号、发布日期、安装包地址和大小不写死在页面里。构建时 `build/release.ts` 会读取 `https://dl.taunote.app/desktop/` 下的 `latest.yml`（Windows）和 `latest-mac.yml`（macOS），也就是 `pnpm publish:desktop` 发布的那两个文件，再替换 `index.html` 里的 `<!--tau:*-->` 占位。

- 某个平台没有发布（文件 404）时，按钮显示「即将推出」，其余平台照常展示。
- 一个平台都读不到，或发布源返回其他错误时，`build` 直接失败，避免把空的下载区部署上线。本地 `dev` 只打印警告并显示占位。
- 访客打开页面后，脚本会把对应其系统的平台换成主按钮。
- 下载按钮经 `https://analytics.taunote.app/v1/downloads/:filename?channel=website` 记录下载发起，校验 R2 对象后跳转到原 `dl.taunote.app/desktop/:filename`。安装包与自动更新仍由 R2 分发；先部署 Analytics，再部署官网。统计数据库故障不会阻断跳转，入口服务不可用时仍需先恢复入口服务。

因此每次发布新版本桌面端后，需要重新执行一次 `pnpm deploy:website`，页面上的版本号才会更新。

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
index.html            页面结构（含 SVG 图标雪碧图）
src/main.ts           入口：引入样式，按顺序初始化各模块
src/modules/          各区块的行为：示意窗口外壳、首屏斜线、主题、所见即所得演示、闭环滚动、日常组件
src/styles/           按区块拆分的样式，最后是响应式
build/release.ts      构建期读取发布源，生成下载按钮与版本信息
public/               原样拷贝：图标、_headers
```
