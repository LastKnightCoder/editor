# SDK、官方模板与可安装 APP 交付

目标：准备可从 npm 使用的同一 SDK 和官方模板，验证所选客户端构建能够从插件中心下载、启用并持久运行受支持的插件。

## 本轮范围与约束

- 接续已完成的 API 支持矩阵与本地作者契约修改，不覆盖当前 worktree 未提交内容。
- 用户提出发布 SDK、更新官方模板并使构建 APP 可安装插件；先核对发布身份、现有版本、模板和原生发行门禁。
- 用户已确认面向所有用户的正式版本：推进 SDK 稳定版、官方模板和 Android/iOS 正式构建的中心安装/启用，不开放普通用户任意 URL 安装。桌面格式 3 正式接入仍独立记录，不用移动可安装推断三端全部可发行。
- 保留一个 SDK/模板/插件 ID；不因入口跑通宣称未接线业务 API 可用。D 的真机、最低系统、性能、同步冲突和完整 IPA 验收如实保留。
- 用户明确裁决：平台适配与功能测试由作者负责，审核者不承担测试，也不要验证记录。取消审核页面和服务端相关门槛，不保留可选表单；本任务对 Android 安装链路的测试属于宿主交付验收。历史审计数据保留，新请求不再写平台验证记录。
- 用户进一步确认本人包应自动批准：删除格式 3 对 CI 自动批准的额外排除，沿用插件所有者本人、审核者身份、绑定公开仓库及 OIDC tag 校验；协作者/普通作者仍待审，系统能力审核、发布开关和平台分发开关不绕过。

## 任务列表

| 任务                                      | 状态        | 结果与下一步                                                                                                                      |
| ----------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE    | npm 登录已恢复；SDK 0.36.0/UI 0.4.0 未占用，官方模板 main 干净。原生安装与管理原先统一被 debug 门禁拦住，需要分离中心与开发来源。 |
| 稳定 SDK 与统一模板产物                   | COMPLETE    | SDK 0.36.0/UI 0.4.0 已发布 latest；官方模板 main 已推送 f3bab62，注册表冻结构建通过。                                             |
| 正式原生安装与回归                        | COMPLETE    | Android 0.2.1 release 已构建并签名；固定中心、开发来源隔离与启用意图回归通过。iOS 缺签名，用户决定延期。                          |
| 发布 Android 中心并验证 APP               | IN_PROGRESS | 计数器 Android 包已获明确发布批准；按新裁决移除审核者平台测试与记录后，部署 Worker、网页并验证正式下载安装。                      |

已读到 npm 最新插件 SDK 0.35.0、UI 0.3.0；官方模板 main 为 869c358，本地同仓库干净且有管理员权限。本机 npm 首次认证 401，用户已完成重新登录，发布前再次核验。新产物拟使用插件 SDK 0.36.0 和 UI 0.4.0，不覆盖已发布版本。

原生旧 dev_only 的消费者已替换为来源与操作各自的门禁，rg 确认无调用后删除；任意开发 URL 的 stage/commit 仍仅允许调试，中心 stage/commit 仍要求固定来源、兼容选版与提交前复验。正式构建读取旧调试包时也拒绝非固定中心来源；启用与恢复检查本机持久撤回记录，卸载不清业务数据。

初始签名核对只有 macOS Developer ID Application，尚未发现 iOS 开发/发行签名身份；继续实际 iOS 构建确认，不把模拟器 .app 当作可交付 IPA。

## 执行进度

- SDK 契约与作者文档源码已提交 943e4482d。npm 本机登录恢复后，发布要求额外浏览器验证；首次超时，用户完成新验证后 UI 0.4.0 与插件 SDK 0.36.0 均成功发布 latest。待发布 tarball 与仓库外验证输入摘要一致。
- 本地 SDK 260、UI 251、移动 404、Rust lib 96 项回归通过；正式中心安装/管理与开发 URL 安装已分离，中心首次安装默认启用，显式停用和损坏状态均不会被更新重置为启用。
- Android 0.2.1 release APK 已生成并通过签名校验，真实标识 com.txiong.tau_mobile，versionCode 2001；沿用原证书 SHA-256 9fb5a0fb191e9a99b1d0badca9caf619e731c4b84be1cc52df8f129a320048fe。已安装到本任务专用模拟器，继续生产中心行为验证。
- Android 生成工程原来是 spike 标识，已移到 output/plugin-release/android-spike-generated-backup 保留；正式工程重新用 pnpm exec tauri android init 生成，避免直接 node 初始化产生错误的 Gradle CLI 路径。没有更换签名证书。
- iOS 正式构建实际失败：Xcode No Accounts，缺 com.txiong.tau-mobile provisioning profile。用户已决定先交付 Android，iOS 等签名就绪；因此仅准备开放 Android 分发，不宣称 IPA 已交付。原 spike 工程保留于 output/plugin-release/apple-spike-generated-backup。
- 官方模板 main 已推送 b614971、f3bab62；旧锁中 0.35.0 被依赖年龄策略拒绝，按新依赖重建后注册表冻结构建通过，未关闭校验策略。报告 output/plugin-release/author-npm.json 的 sdkSource=npm、templateLockfileReused=true。
- Android 专用发行分支 codex/counter-android-1.1.0 已推送 ccab912；只收窄 manifest 平台并更新说明，main 保留三端作者模板。门户仓库快照取默认分支 f3bab62，不将其误记为发行构建提交。
- 用户明确批准 example.external-counter@1.1.0 的 Android 包：提交 41a230ea-3c99-44d7-8c11-cbb963fe353f，SHA-256 7f3b6f97a837c983071b7a1d5766c6ef6b0ac93ecdd4c1d3dab1c18bce765453；仅 Android ≥0.2.1、无业务权限。当前待审核，尚未公开发布。
- 取消审核者测试责任后，门户类型检查通过，API 98、网页 96、SDK 259 项通过；删除的是旧平台证据校验及组件测试，新增/替换为不填验证记录即可审批、修订变化仍阻止旧确认、新审核不写证据列的回归。SDK 类型、进程边界与文档检查通过。
- 移动全量回归在与原生构建并行时有 1 项 5 秒超时，单项复查通过；随后降低 worker 并行度重新执行完整 404 项，不放宽测试超时。Rust lib 96 项通过。
- 官方模板补充审核职责说明，提交 b62b1b3；更新后再次使用 npm 注册表冻结构建通过，报告 output/plugin-release/author-npm-final.json。不会覆盖已发布 SDK 版本或替换已批准的计数器 ZIP。
- 修正已安装空态旧文案后重新生成 Android release APK，SHA-256 2ae5398e0bda13928343787eae4e9b48d6a5e51dfb887e4ca2f52b6d56891249，签名证书未变。交付路径 output/plugin-release/Tau-0.2.1-android-arm64.apk。
- 集成源码已提交 74c8126ba，Worker c548b0d4-0b73-4341-afd2-08393474471d 已上线取消平台验证门槛、开放 android 分发；网页尚未发布。随后按用户新裁决追加本人 CI 自动批准，待回归后发布新的 Worker 与网页。

## 验证与交接

移除前核对 PlatformEvidence 的填写/只读消费者、readPlatformEvidence 的审批与发布重试消费者、共享校验器及模拟夹具，消费者清零后删除组件/共享类型/校验器。保留目标声明预览与差异、修订绑定、摘要和权限检查、人工审批及本人 CI 自动批准规则；不修改已发布 npm 版本。center 是仓库内宿主入口，不在作者 npm exports 中，本次审核逻辑变化无需作者升级 SDK。

部署前新增 D1 备份：~/.local/share/tau/plugin-portal/backups/2026-10-23T02-08-01-680Z.sql；无待迁移项目，不重复执行 0012。

调查后补充实际发布包版本、渠道、受支持能力、构建与安装证据。不把 npm 发布、模拟器、内测包与应用商店上线混为一项验收。

## 退出条件

所选交付范围的 SDK/模板与客户端安装链路验证完成，并记录无法完成的外部条件；总体 D 未结束前保留父任务目录。发布操作必须使用已核验产物与可追溯源码。
