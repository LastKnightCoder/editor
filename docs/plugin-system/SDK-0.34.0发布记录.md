# SDK 0.34.0 发布记录

日期：2026-10-22。

## 范围

PS-046 问题管理插件化第一、二期的宿主能力（方案见 81）的对外发布：`@xiongtao.xt/tau-plugins@0.34.0`。`@tau/ui` 不发版，0.3.0 与已发布归档逐字节一致。客户端未发布，仍为 0.59.0。

不含第三期的 `shareOf` 正文输入与发布数据去掉 `quest`，这两项在 CHANGELOG「未发布」，随 0.35.0 发布。

## 变更

完整列表见 `packages/plugins/CHANGELOG.md` 的 0.34.0 小节，主要是：

- 正文输入 `PluginContentInput`（`markdown` / `nodes` / `copyOf`），`cards.create`、`articles.create`、`content.edit` 改用 `content`。
- 引用与宿主对象：新增引用类型、`app.describe`、`EntityRef`；白板、项目、项目文档、Notebook、划线等材料、对话的读写接口与权限。
- `app.run` 关闭后返回结果，新增 `card.create`、`project.insertDocument`、`notebook.create`、`chat.start`；`app.open` 支持打开位置与定位。
- 插件数据：`entities.query` 的 `where` / `orderBy` / `count`、`context.records`、`context.links`、`context.transaction`。
- 挂载：侧栏条目句柄与子项、首页面板、对象动作、详情页面板、`pageContext.isActive` / `registerDismiss`。

## 验证与回执

- 发布前：SDK 230 项测试；依赖列表与 0.33.0 相同；包内作者文档与维护源逐字节一致；`verify-editor-author.mjs` 以本地归档安装、测试、构建通过；`npm publish --dry-run` 通过。
- npm 回读，与本地归档一致：tau-plugins 0.34.0 `sha512-2MfTKvNi3mJuvhuvn7RC6OtNRkuIngOzUO6gm7hfyT1MsBKHPFoh/Fsp9OQNwPcNYx1G6QXRbesTSjIfrm6vtQ==`，267 个文件，`latest` 已指向 0.34.0。
- 插件作者模板：维护源 `scripts/plugins/template` 按公开 npm 重新解析锁文件（只有 SDK 版本变化），全新 store 冻结安装与构建通过；官方仓库 `tau-plugin-template` 本地提交 `b20ef2d`，`docs/` 取自 0.34.0 包内文档（维护源的 `user-data.md` 已含未发布的 `shareOf`，不同步），全新 store 冻结安装与构建通过。
- 微信读书 `tau-plugin-weread` 本地提交 `892010577`：依赖改为 0.34.0 / UI 0.3.0，版本 1.0.9，类型检查、29 项测试、构建通过。

## 过程记录

- 2026-10-22 上午与下午 npm 两次故障（发包降级），第一次发布中断。恢复后首次重发返回 `E404 PUT`：本机 npm 登录 token 已失效（`whoami` 为 401），npm 对未授权的发布返回 404。用户重新登录后发布成功；回读在发布后约一分钟才看到新版本。

## 未完成

- 推送官方作者模板 `b20ef2d`；推送微信读书并打 `v1.0.9`，由 CI 发布 Release 并提交插件中心，之后用 `pin-test-fixture.mjs` 把主仓库测试夹具固定为 1.0.9。均为对外动作，待用户确认。
