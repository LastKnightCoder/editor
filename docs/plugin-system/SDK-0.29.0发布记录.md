# SDK 0.29.0 发布记录

日期：2026-10-20。

## 范围

发布 `@xiongtao.xt/tau-plugins@0.29.0`，同步官方 `LastKnightCoder/tau-plugin-template` 和主仓库 GitHub。UI 包维持 0.1.1，客户端维持 0.59.0。

新能力为页面组件的 `pageContext.register(provider)`，经现有 `get_current_context` 的 `page.pluginContext` 返回作者自定义的任意有限 JSON。宿主不规定业务字段或形状，操作仍由作者自行注册 MCP。通知等 0.28.0 已发布能力完整保留。

## 发布任务

- COMPLETE：核对公开版本、账号与模板；拉取 master 的 02806c2f4，整合通知能力与页面上下文，保留其他任务的本地修改。
- COMPLETE：SDK 0.29.0 发布前检查。34 个文件 166 项 SDK 测试、桌面类型检查、47 项桌面相关测试、3 项模板构建测试与插件进程边界通过；独立全新依赖 store 安装本地归档，页面上下文和通知公开类型检查、ZIP 构建通过。
- COMPLETE：npm latest 回读为 0.29.0，公开归档与本地一致；官方模板 main 已推送，重新克隆后全新依赖安装与构建通过。

## 产物检查

- 本地归档：`output/plugin-sdk-029/xiongtao.xt-tau-plugins-0.29.0.tgz`。
- 共 243 个文件、214 个声明文件；17 份开发文档与维护源逐字节一致，更新日志与源码一致。
- 所有 exports 目标存在，无 workspace/file/link 依赖，公开类型同时包含 PluginPageContext 和 PluginNotifications。
- `npm publish --dry-run` 通过，实际发布由用户完成 npm 账号认证后接受；registry latest 与公开下载均已回读确认。
- 作者验证项目 `output/plugin-sdk-029-author` 从全新 store 安装本地归档，未链接仓库源码；类型检查和 ZIP 构建通过。

## 公开发布回执

- npm：[@xiongtao.xt/tau-plugins 0.29.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.29.0)。
- integrity：`sha512-TgIbI2PvhHeZBQ1ALaXe0/EXVQKqcTv+V8cgcjj9TASMLrj81Tcy1RBVmP52InHsAenmYy5qitee9mFOtK/Tqg==`，远端下载 SHA-512 与实际发布归档一致。
- 官方模板发布提交：[865dd23882441863788e39234f8bbc8ef306b7d3](https://github.com/LastKnightCoder/tau-plugin-template/commit/865dd23882441863788e39234f8bbc8ef306b7d3)；最终 main：[e3aa506047cf46983394aea88753c8ee46f06d54](https://github.com/LastKnightCoder/tau-plugin-template/commit/e3aa506047cf46983394aea88753c8ee46f06d54)，补齐提交钩子对开发指南表格的格式调整。依赖、锁文件、精确供应链例外、API/MCP、开发与 AI 指南均同步 0.29.0。
- 推送后重新克隆至 `output/plugin-sdk-029-template-public-check`，33 个维护文件在归一化 Git 换行后内容一致；使用全新 store 下载 29 个公共包，冻结安装和 ZIP 构建通过，Git 工作区干净。
- 同一个公开依赖候选还执行了作者契约夹具检查，页面上下文与通知类型通过；没有将夹具放入官方模板。
- renderer/main/preload 生产构建通过。发布回执见 `output/plugin-sdk-029/receipt.json`。

本次未发布桌面安装包或安装插件，视觉验收由用户完成。
