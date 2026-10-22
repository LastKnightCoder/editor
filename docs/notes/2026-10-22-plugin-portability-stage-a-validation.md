# 跨端插件阶段 A 验证记录

任务开始日期：2026-10-22。工作分支：codex/mobile-plugin-spike。仅实现公共契约、统一模板和作者构建闭环，没有发布 npm、推送外部模板或修改生产插件中心。

## 完成内容

- 可订阅环境源：hook 与 context 取得同一最新不可变快照，布局/输入可更新，平台/能力在会话内固定。
- 页面注销回收功能入口，失效句柄拒绝打开。
- 版本化能力词表，独立格式 3 / portable / web-v1 校验及显式求值入口；旧默认校验仍拒绝新格式。
- 各目标声明最低版本、必需/可选能力、节点 none/render/edit，求值后核对节点归属。
- 同一模板提供页面和编辑器起点，并保留显式旧桌面构建路径；本地 SDK/UI tarball 与相对 file 锁文件可复用。

## 自动验证

- SDK 46 文件、238 项测试通过；SDK、桌面、移动端类型检查通过。
- 移动 spike 加载器与原编辑器边界/覆盖共 9 项测试通过；本轮没有重新执行三端原生 UI 验证。
- 相关 ESLint 0 错误/0 警告，格式、插件进程边界和文档检查通过。
- 作者源码 strict: true，保持模板既有 skipLibCheck: true；不声称对全部第三方声明完成严格类型检查。

## 仓库外验证

最终报告为 `output/plugin-phase-a/author-frozen-report.json`，status 为 passed，templateLockfileReused 为 true。作者目录为 `/var/folders/np/fm5y9kyj2b78fjytbyz8h5b4psthqs/T/tau-portable-author-ksismo/独立作者 project`。

已实际验证：

- 独立目录与依赖存储，无 workspace 链接，SDK/UI 不解析回仓库。
- 直接复用模板锁进行冻结安装；SDK/UI 的作者 tarball 不公开 host/environment-host/rendering/node 等入口。
- 页面示例、编辑器示例和旧桌面格式都能由同一构建器产出。
- 三端兼容声明、最低版本、必需/可选能力、包完整性检查通过。
- Node/宿主私有依赖与未知能力被拒绝，失败构建保留上一有效产物。
- 跨端包正式目录安装被阻止，旧默认校验器继续拒绝格式 3。

| 样本   | JS SHA-256                                                         | ZIP SHA-256                                                        |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 页面   | `1885aaa63f2956c1b0694d7f422c7b49ef27989bbf045c5eb86f815a1b06acc9` | `ea4eb5f976e2780bb0f33e4aa8fbf7584d59f4919e5291767ec9ab18b09325c5` |
| 编辑器 | `de4fb6fc79df06beb730022211c14aff8e00972b751c726a09d761397a741cc1` | `d0870a220ada5625eb04c9c8df04b7e89bd9aff09af95a5291216da7b66de981` |

安装版本：插件 SDK 0.36.0-dev.0、UI 0.3.0、React/React DOM 19.2.0、TypeScript 5.8.3、esbuild 0.25.12。页面最终 ZIP 与编辑器归档分别保留在作者目录 dist 下，路径见报告。

平台矩阵属于兼容契约测试，不是正式客户端运行结果；本轮没有调用生产安装或发布接口。

## 排障与边界

- 初版编辑器示例有语法错误，仓库外构建真实失败；修复后从干净目录重跑全部验证，没有将失败报告当成通过。
- 原模板锁引用已移除的旧 SDK，触发依赖年龄策略。核对切换到本地输入后清理旧锁并重新生成，没有放宽策略；最终原锁冻结安装通过。
- 动态环境的媒体查询接线、正式页面守卫、Dialog/Drawer 移动交互、节点等级的实际写入保护属于后续 B/D。阶段 A 提供协议和校验，没有增加假成功接口。
- 生产分发 API、审核、数据库和部署未改。格式 3 的正式目录安装和模板发布工作流有明确拒绝路径。
- 本轮运行 npm pack 生成本地包，没有执行 npm publish 或插件中心上传。

## 文档收尾

当前实现契约在 `packages/plugins/docs/portability.md`，作者用法在 `scripts/plugins/template/docs/portability.md`，复现流程在 `docs/guides/plugin-portability-sdk.md`。阶段 A 已按沉淀、退役、索引三步收尾。后续真实宿主接线不由本记录隐含启动。
