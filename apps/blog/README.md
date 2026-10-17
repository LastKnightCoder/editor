# 博客发布模板维护

此应用构建桌面客户端发布博客时使用的预编译模板，与 GitHub 插件作者模板分别发布。维护脚本为仓库根目录 `scripts/publish-blog.mjs`，入口为 `pnpm publish:blog`。

## 构建与上传

在仓库根目录先运行预检：

```sh
NODE_OPTIONS=--max-old-space-size=8092 pnpm publish:blog --dry-run
```

默认方式使用环境中的 R2 S3 凭据，具体变量见 `pnpm publish:blog --help`。也可以复用已登录的 Wrangler，无需另建 S3 密钥：

```sh
pnpm --dir apps/plugin-portal exec wrangler login
CLOUDFLARE_ACCOUNT_ID=ba54fcb8459b528b75991a4de5e5d023 \
  NODE_OPTIONS=--max-old-space-size=8092 \
  pnpm --dir apps/plugin-portal exec node ../../scripts/publish-blog.mjs --wrangler
```

Wrangler 模式需要当前登录身份拥有 `tau-release` 桶的写入权限。凭据不写入仓库。只有已构建并核验当前产物时才使用 `--skip-build`。

脚本默认递增 patch 版本，也支持 `--version` 指定版本。它先上传 ZIP，再更新 latest 清单，全部成功后才写回 apps/blog/package.json 版本；应将版本变更随源码提交。旧 ZIP 不删除。

## 公开文件与验收

- 桶：`tau-release`。
- 模板包：`https://dl.taunote.app/publish-template/blog-template-<版本>.zip`。
- 最新清单：[publish-template-latest.json](https://dl.taunote.app/publish-template-latest.json)。

发布后回读公开清单并下载其中的 ZIP，核对版本、URL、文件大小及 SHA-256；解压检查 home/card/article/doc/quest/list 页面入口和 `plugin-runtime.json`（协议版本 1）。仅 CLI 上传成功不能替代公开下载验收。

2026-10-17 发布 1.14.2，公开下载与上述检查通过。SHA-256 为 `bbf781c871b2b93e9a0ac8ffaed1d33fd84da06d9024d4cfbc6eee2ad533d2a5`，本地回执为 `output/blog-template-release/1.14.2.json`。

完整退出并重启桌面客户端，清除进程内模板缓存后再发布。已经发布的网站不会自动换模板，需要重新发布。包含插件节点的页面会携带固定版本的插件包；博客加载与桌面相同的入口，无需作者另写 render.js。
