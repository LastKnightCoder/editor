# 合并主线后的 Android 正式包

目标：交付包含移动主题与编辑器适配的 Android 正式签名包，并在专用模拟器验证中心安装、计数器和 ABC 编辑器。

## 范围

- 基于当前 worktree 的合并结果 7b0004087，沿用正式标识、签名与固定插件中心来源。
- 验证实际 release APK 的下载、校验、重启激活、计数持久化，以及 ABC 插入/源码编辑/保存/重启保真；不以调试包代替正式包结论。
- iOS 继续等待签名。D 的最低系统、真机与视觉等验收项保留。
- 用户明确扩展本轮范围：补齐桌面格式 3 的正式安装链路，ABC 坚持同一插件 ID、同一源码及同一 ZIP 支持桌面和 Android。不发布先前准备的 Android 专用候选包。

## 任务列表

| 任务                                      | 状态     | 结果与下一步                                                                                                    |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | Android 0.2.2 已构建并沿用原签名；ABC 0.1.5 仅桌面。桌面缺口覆盖 v2 目录、包读取/事务、延迟激活和正文启动快照。 |
| 桌面正式格式 3 与 ABC 统一包              | COMPLETE | 桌面 0.59.1 接入复用现有事务与内容进程；ABC 同一 ZIP 声明 desktop/android，Android 专用候选未发布。             |
| 回归与正式分发                            | COMPLETE | Worker 已开放 desktop/android；ABC 经原 CI 自动批准发布，两端选中相同 releaseId、ZIP 与摘要。                   |
| Android 正式包模拟器验收与交付            | COMPLETE | 最终 APK 在干净应用数据中完成两包生产下载安装、计数保存、ABC 快速输入/保存/取消及强停重启保真。                 |

## 接入方案

- 桌面保留旧格式读取；格式 3 保留原始清单，经统一宿主能力检查后复用现有 PluginUpdates、LocalPluginManager 和启动快照，不伪造为格式 1。
- 目录/详情/版本/下载改用 v2，主进程提供固定 desktop host；下载前后复查精确 releaseId，ZIP 摘要和清单对账，生产忽略调试中心覆盖。
- 浏览器渲染与独立内容进程复用同一跨端求值及 none/render/edit 投影；主进程不执行插件源码。旧后台/Skill/模板流程保持。
- ABC 保留 tau.abc 与 abc 节点身份，版本提高到 0.1.6；源码渲染与 codec 共用，平台入口交由宿主。桌面最低 0.59.1、Android 最低 0.2.2，iOS 不宣称支持。格式 3 的博客分发仍未接入，必须明确阻断，不能误报支持；旧桌面 0.1.5 的发布记录保留。

## 验证与退出条件

- 首个 Android 0.2.2 候选在真实键盘输入 ABC 时暴露宿主问题：源码浮层位于 Slate 正文内部，输入/按键冒泡触发外层编辑。该候选 8ec3d5… 不交付，保留为 output/android-refresh/candidate-before-input-fix.apk。新增回归确认旧实现失败；修复后移到自有 Portal 容器并隔离输入，同时验证 Activity 隐藏回收和草稿取消，源码组件 8 项通过，重新构建正式候选进行设备复验。ABC 包无需另发版本。
- 后续快速输入复测发现 CodeMirror 移动 contenteditable 的 DOM 回读延迟窗口会在紧接回车时漏末字，改用命令前同步读取的 textarea 通道；桌面默认原本也是该通道。第二候选 e820ad… 留作复现，最终候选 0f8a11b562cb94e881478ff3e6b3ae3f0f4b397432d0b50ceab43987f8c2ed0f 重新走干净模拟器安装与完整流程。仅清理本任务专用 AVD 的 com.txiong.tau_mobile 测试数据。

- 最终交付 Android 0.2.2 / versionCode 2002，61,949,731 字节、arm64、不可调试的 release APK；签名证书沿用 9fb5a0fb191e9a99b1d0badca9caf619e731c4b84be1cc52df8f129a320048fe。SHA-256 为 0f8a11b562cb94e881478ff3e6b3ae3f0f4b397432d0b50ceab43987f8c2ed0f，文件 output/android-refresh/Tau-0.2.2-android-arm64.apk。主实现提交 b173a5c89，源码输入修复提交 258b8ecb1。
- ABC 官方源码 cd8fb57 打 tag v0.1.6，经 run 39895307673 成功发布，回执 autoApproved=true；main 已同步，并在 8415cc8 修正文档适用版本。同一 ZIP 为 159559 字节、SHA-256 297b7b84e2e982195f4bdad3f1ed2e03f5ec25b8e837aeafbd48c66a4423ede0，releaseId 634aaccb-213d-4969-a02d-162ab7faf541。独立仓库 9 项测试、类型/构建和冻结安装通过；CI 包清单及 JS/CSS 摘要与本地验收输入完全一致，ZIP 时间戳差异仅改变归档摘要。最终设备与桌面求值均使用真实已发布包。
- 桌面相关整体 142 项回归通过；新增来源/事务与正常 IPC、真实统一 ABC 包的求值和 codec 另行通过。74 项安装/目录/页面回归通过；源码由 readDesktopPluginManifest 保留格式 3，未绕过旧解析器。完整桌面 Vite 构建及类型检查通过，未生成桌面原生安装包。
- Worker 10c6daaf-4e52-4a9c-94fb-d946e518780d 已发布，desktop/android 分发开放，Pages 保持 23d4145d。发布前 D1 备份 2026-10-23T03-23-25-437Z.sql，恢复/外键检查通过，无待迁移项目；API 101、网页 96 项及线上 smoke 通过。旧桌面 0.59.0 仍选中 ABC 0.1.5，新桌面 0.59.1 与 Android 0.2.2 都选中同一 0.1.6，Android 0.2.1 被最低版本拦截，iOS 返回分发未开放。
- 统一模板 main 已更新至 573b967，最低桌面版本 0.59.1；支持矩阵与作者指南同步。npm 0.36.0/0.4.0 不重发，iOS 分发继续关闭。
- 最终原生行为：从干净应用数据下载计数器 1.1.0 与 ABC 0.1.6，校验后重启激活；计数从 0 保存为 1；新插入面板搜索 abc 并插入乐谱；连续注入六行源码并逐行立即回车，末字 F 保留，外层正文 ABC final validation 不变；保存后另改草稿 NOT_SAVED 并取消，真正强停/重启后六行源码原样恢复且不含取消草稿，计数仍为 1。卡片默认阅读态、点击编辑后可再次进入源码。
- 最终移动全量 708 项、源码组件 8 项、移动/桌面类型与构建通过，ESLint 无错误（存量测试警告保留）。行为证据与最终文件核对在 output/android-refresh/android-final-result.json，相关 XML 与 published-abc.json 同目录。
- 单列限制：真机、最低系统/WebView、中文输入法和视觉未验收；模拟器打开卡片时出现 COLLAB_NETWORK（协作设备注册网络失败），本地编辑与持久化正常，云协作不计入通过项。iOS 等签名，桌面本轮只完成接入代码/集成/构建，未发行原生安装包；格式 3 Skill/博客分发仍未接入。D 不关闭。

本轮交付范围已完成；下一步为用户安装最终 APK 做真机与视觉验收，签名就绪后接续 iOS，云协作问题独立复验。任务记录随父任务 D 收尾。
