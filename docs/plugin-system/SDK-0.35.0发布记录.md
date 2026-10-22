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
- 插件作者模板：维护源锁文件按公开 npm 重新解析（只有 SDK 版本变化），全新 store 冻结安装与构建通过；官方仓库 `tau-plugin-template` 本地提交 `869c358`，`docs/` 取自 0.35.0 包内文档，全新 store 冻结安装与构建通过。
- 问题插件 `tau-plugin-questions` 本地提交 `22174bd`：依赖改为公开的 0.35.0，删除 `vendor/` 开发归档；全新 store 冻结安装、类型检查、21 项测试、构建通过。

## 过程记录

- 发布返回成功后，npm 读取约四分钟才出现新版本（当天 npm 服务降级）。

## 未完成

- 推送官方作者模板 `869c358`（需用户确认）。
- 问题插件：`minAppVersion` 由用户裁决；建远程仓库、推送、打 tag、提交插件中心均需用户确认。
- `@tau/blog` 下一版（内置的发布数据类型去掉 quest）与博客模板 `86ec3f0` 的发布，需用户确认。
