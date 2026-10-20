# SDK 0.28.0 发布记录

日期：2026-10-20。

## 任务列表

- COMPLETE：Investigate/Triage/Understand the problem。源码版本为 0.28.0，npm latest 与公开模板为 0.27.0；npm 登录可用，发布包由 package-sdk.mjs 生成。
- COMPLETE：同步通知 API、模板版本与文档，验证发布包及独立作者构建。242 个文件、213 个声明文件；模板构建相关 3 项测试通过；独立全新依赖缓存安装本地归档，通知 API 类型检查与模板 ZIP 构建通过。
- COMPLETE：发布 npm、同步公开模板与锁文件，回读并记录发布结果。公共 registry latest 为 0.28.0，远端归档与本地逐字节一致；公开模板 main 已推送，重新克隆后全部 33 个文件与维护源一致。

范围：发布 `@xiongtao.xt/tau-plugins@0.28.0`，更新 `LastKnightCoder/tau-plugin-template`；客户端版本仍为 0.59.0，UI 包维持 0.1.1。

## 发布回执

- npm：[@xiongtao.xt/tau-plugins@0.28.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.28.0)，latest 已回读确认。
- 用户完成 npm 浏览器一次性账号认证后发布成功；registry 短暂传播延迟结束后重新安装与回读成功，没有重复发布。
- integrity：`sha512-xcicUTyYsaUehnAaoZitmsiYJLc0IBGLCPmWLwxK97XgqPtrdX9DjMwdU2hg0JQbFLkHKJYZ1ccuTJVAkDRswg==`。
- 产物：`output/plugin-sdk-028/xiongtao.xt-tau-plugins-0.28.0.tgz`；回执：`output/plugin-sdk-028/receipt.json`。
- 官方模板 main：[31ac6402c6d6b04ebb336cf51b915924ae26e3bd](https://github.com/LastKnightCoder/tau-plugin-template/commit/31ac6402c6d6b04ebb336cf51b915924ae26e3bd)。

## 同步内容与验证

- 模板依赖、公共锁文件、精确供应链例外均升级至 0.28.0，移除 0.27.0 例外；React 与 UI 版本保持不变。
- API.md 补充 notifications 上下文、三种模式、参数限制、按钮执行、撤销、生命周期与客户端能力边界；新增 NOTIFICATIONS.md，同步开发指南与 AGENTS.md。
- npm 包携带相同 API.md、DEVELOPMENT.md、NOTIFICATIONS.md；所有 exports 目标存在，无 workspace/file/link 依赖，公开通知类型完整。
- `/tmp/tau-sdk028-author` 使用全新依赖缓存安装本地归档：通知公开类型与非法模式检查通过，`pnpm build` 生成模板 ZIP。
- 模板构建测试：2 个文件、3 项测试通过。
- `/tmp/tau-template-sdk028-release` 从公共 npm 安装 0.28.0，`pnpm install --frozen-lockfile` 和 `pnpm build` 通过，之后提交并推送。
- 推送后重新克隆 `/tmp/tau-template-sdk028-public-check`，核对全部 33 个文件与主仓库维护源一致；没有重复运行相同内容的构建。

本轮未发布桌面安装包。通知运行行为仍依赖包含实现的客户端构建，视觉验收由用户完成。主仓库实现、测试与发布文档一并提交，公开模板已单独提交推送。
