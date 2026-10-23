# 跨端插件 B–D 实现与验证快照

验证位置：codex/mobile-plugin-spike worktree。本文件记录阶段 A 与 B/C/D 改动提交前的验证快照；验证时修改均留在工作区。未发布 npm，未改动或部署生产插件中心。

## 结论

B 与 C 的接线已经实现；D 的正文适配和自动回归已经完成，但完整设备验收仍未关闭。正式桌面使用 DesktopPluginRuntime、Page 与侧栏模型；移动使用正常 AppShell、“我的”、通用页面与正常卡片正文，未用独立 spike 壳代替产品宿主。

Android 16 / API 36.1、iOS 26.3.1 模拟器通过相同 ZIP 的安装与运行。当前没有连接 Android/iOS 真机，iOS 仅有 26.3.1 运行时，不能据此宣称最低系统或真机交互通过。

## 交付范围

- SDK：响应式环境源、语义入口计数、页面离开守卫、跨端清单和节点等级投影；作者仍从一个 SDK 消费。
- 模板：同一计数器与编辑器起点，仓库外 SDK/UI tarball、冻结锁文件与旧格式回归；不发布。
- 桌面：真实页面/入口/环境/浮层适配，显式开发目录只读校验，独立内容进程消费同一 codec；原有中心与旧包路径保留。
- 移动：工作区宿主、设置/管理、设备本地启用意图、Rust ZIP 校验/暂存/恢复、主库 plugin_kv；更新在下一会话生效，卸载保留数据，可单独确认清除当前工作区的私有数据。
- 编辑器/UI：正常正文与预览共用快照；触摸插入恢复选区，CodeMirror 草稿保存/取消、提交保护、撤销、块菜单；标准 Dialog/Drawer 返回与局部 Portal，不依赖应用路由。

## 原生产物与包身份

| 包                       | 版本  | ZIP SHA-256                                                      | 字节数 |
| ------------------------ | ----- | ---------------------------------------------------------------- | ------ |
| example.external-counter | 1.0.0 | 7148a904ca6386bed45c7faac3a9e6a2a6a02ca0ec5fa225f652425dc0da920f | 22162  |
| tau.abc                  | 0.1.0 | dae6fdfcee65b1ebdf8f9b2fb121912c3a5eeabbe8ed560ccf0aacce99c7fbfd | 156675 |

计数器来自统一模板的仓库外构建。ABC 使用固定测试版本的原始 JS/CSS，只补格式 3 与 targets 清单。桌面集成测试和两端原生验证读取同一份 artifacts/sources。

本机证据在 output/plugin-portability-validation：android-report.json、ios-report.json、android-system-back.json、android-block-menu.json、android-workspace.json、android-restart.json、ios-restart.json。原生主流程检查“我的”入口、SQLite 计数、Dialog 返回、正常卡片 ABC 源码编辑/保存和 codec 往返；Android 另有 adb 系统返回与跨库拒绝测试。

## 自动校验

| 范围                           | 结果                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| SDK                            | 46 文件，238 项通过                                                                          |
| 桌面插件 / Page / 安装事务相关 | 54 文件通过，333 项通过；1 项跳过                                                            |
| 移动端全量                     | 71 文件，355 项通过                                                                          |
| Editor 全量                    | 129 文件，773 项通过                                                                         |
| 公共 UI 全量                   | 31 文件，251 项通过                                                                          |
| 源码组件                       | 6 项通过，含取消、保存、撤销、上移、删除                                                     |
| 博客                           | 12 项通过                                                                                    |
| Rust lib 全量                  | 86 项通过                                                                                    |
| 类型                           | SDK、UI、Editor、博客、桌面、移动通过                                                        |
| 结构                           | 插件进程边界、普通移动产物验证代码隔离、文档链接通过                                         |
| 代码规范                       | ESLint 0 错误，保留存量 non-null / hooks / refresh 等警告；Prettier 与 git diff --check 通过 |

合计 2054 项通过，1 项跳过；不重复计算后续定向重跑。跳过项需要 TAU_UPLOAD_PLUGIN_ZIP 外部上传包，未提供该输入。桌面导出弹窗用例首轮并行运行遇到时序失败，单独与随后广泛回归均通过。全编辑器回归修正了四处旧服务桩：未注册的编辑策略必须返回 undefined，不能返回通知对象；媒体上传行为断言未放宽。

仓库外最终报告为 output/plugin-phase-bcd/author-frozen-complete.json，templateLockfileReused=true；最终 SDK/UI 重新打包与模板 .sdk 输入逐字节一致。报告覆盖作者 strict 检查（保留 skipLibCheck）、页面/编辑器构建、旧包拒绝、新格式校验、依赖边界与失败产物保护。

## 构建与限制

桌面前端/主进程/preload 与普通移动 Vite 构建通过；Android debug APK 通过。普通移动产物中未发现 spike 标识、固定 2430 来源或自动验证器，生产中心代码无 diff。

iOS simulator .app 出现 BUILD SUCCEEDED，已用 simctl 安装并完成实际行为验证。完整 tauri ios build 命令的后续归档报 Directory not empty（重命名 Tau Plugin Spike.app），重试仍存在；不把模拟器编译通过写成 IPA 归档/发行通过。

以下不列为已通过：最低系统/WebView、iOS 真机边缘手势、真实软键盘与中文输入、平板、长按拖拽、长文性能预算，以及实际云端同步冲突。移动 Rust 搜索/摘要只抽取 text/children，插件内部源码不进入索引；原文与前端 codec 保真。混合 render/edit 的单个 extension 会保守撤下整组命令/插入，作者可拆分 extension。

## 审查与收尾状态

按 code-review-expert 检查了生命周期、存储隔离、包路径/容量/摘要、并发取消、静态贡献与应用边界。已修复实际版本读取、切库失活和旧启动缓存、下载取消重置、未启用包管理崩溃、损坏页面参数的页内隔离、激活前导航副作用、节点写保护、嵌套模态返回顺序和入口命名冲突等问题。

当前架构事实已沉淀，复现步骤已进入指南。D 的设备矩阵仍待补，因此任务目录保留；没有将未完成验收的任务提前退役，也没有进行发布或生产中心写入。
