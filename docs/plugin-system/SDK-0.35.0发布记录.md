# SDK 0.35.0 发布记录

日期：2026-10-22。

## 范围

PS-046 问题管理插件化第三期需要的 SDK 变化（方案见 81）：`@xiongtao.xt/tau-plugins@0.35.0`。`@tau/ui` 不发版，0.3.0 与已发布归档逐字节一致。客户端未发布，仍为 0.59.0。

## 变更

完整列表见 `packages/plugins/CHANGELOG.md` 的 0.35.0 小节：

- 插件用 `cards.create`、`articles.create`、`documents.create`、`whiteboards.create`、`projects.create` 新建的内容，之后不需要读取权限也能显示与关联。
- 正文输入新增 `{ shareOf: contentRef }`：插件内容与新建的卡片、文章、项目文档共用同一份正文。
- 发布数据不再包含求索录：删除 `quest` 与 `QuestData` 等类型，`ListItem` 去掉问题专用字段与 `updateTime`。

## 验证与回执

- 发布前：版本提交 `269427e22`，在干净工作树中打包；SDK 231 项测试与类型检查；依赖、peer 依赖、导出与 0.34.0 相同，文件列表相同（267 个）；包内作者文档与维护源逐字节一致；`verify-editor-author.mjs` 以本地归档安装、测试、构建通过；问题插件与微信读书的副本换成本地归档后类型检查、测试、构建通过；`npm publish --dry-run` 通过。
- npm 回读，与本地归档一致：tau-plugins 0.35.0 `sha512-roezY7bKKSbYoj6SGjP46ad3rrHQZAn/avYvaoMFdQwn/gUyjenNwU0MgbY4CTEwUxwKLVUpKc/ujR7WZsBE3A==`，267 个文件，`latest` 指向 0.35.0。
- 插件作者模板：维护源锁文件按公开 npm 重新解析（只有 SDK 版本变化），全新 store 冻结安装与构建通过；官方仓库 [`tau-plugin-template`](https://github.com/LastKnightCoder/tau-plugin-template/commit/869c358) `869c358` 已推送，`docs/` 取自 0.35.0 包内文档，全新 store 冻结安装与构建通过。
- 问题插件 `tau-plugin-questions` 本地提交 `22174bd`：依赖改为公开的 0.35.0，删除 `vendor/` 开发归档；全新 store 冻结安装、类型检查、21 项测试、构建通过。

## 过程记录

- 发布返回成功后，npm 读取约四分钟才出现新版本（当天 npm 服务降级）。

## 问题插件 0.1.0（同日）

- `minAppVersion` 保持 0.59.0（用户裁决：客户端尚未对外发布，开发版 0.59.0 已含 `shareOf` 与宿主迁移）。
- 新建公开仓库 [tau-plugin-questions](https://github.com/LastKnightCoder/tau-plugin-questions)，先推 `main` 再推 tag。`b789ff9` / [v0.1.0](https://github.com/LastKnightCoder/tau-plugin-questions/releases/tag/v0.1.0) 的发布工作流在 GitHub 干净环境中冻结安装、测试、构建并创建 Release。正式 ZIP 46,823 字节，SHA-256 `0a00488522d51717ccbaf74c343253b5ba65b79c49e105d37d75b6c77821a04a`，与本地构建逐文件一致。
- 插件中心：自动提交返回「插件尚未在门户首次提交」，需用户在门户网页首次提交以绑定仓库，之后打 tag 即自动提交。

## tau-blog 0.6.0（准备中）

- 内容：内置的发布数据类型随 SDK 0.35.0 去掉求索录；另带上 0.5.0 之后编辑器的改动（行内输入规则、公式快捷输入、高亮导出 Markdown 修复等）。依赖、peer 依赖与导出与 0.5.0 相同，文件只多了 `inputRules.d.ts`。
- 版本提交 `fa3267704`；在干净工作树 `/tmp/tau-blog-060` 中用 `node scripts/blog/package-blog.mjs /tmp/tau-blog-060-out` 打出 `/tmp/tau-blog-060-out/xiongtao.xt-tau-blog-0.6.0.tgz`，692 个文件，integrity `sha512-tx+sZlCKaUoFRIjGSEY3v20H+rOc+qPhUaf78UmvF8ola0O6K2dQrSZOvlcT/7D2h6clsFbcvILVwKnoRfbp2g==`。
- 已验证：博客 12 项测试与类型检查；官方博客模板 `86ec3f0` 的副本换成本地归档后类型检查、34 项测试、构建通过，端到端验收协议 18 项与 Electron 浏览器 12 项通过；起步仓库副本类型检查、1 项测试与构建通过；`npm publish --dry-run` 通过。

## 未完成

- 用户在插件门户首次提交问题插件 0.1.0。
- `@tau/blog` 下一版（内置的发布数据类型去掉 quest）与博客模板 `86ec3f0` 的发布，需用户确认。
