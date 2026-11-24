# Tau 文档地图

按文档生命周期分区，规则见根 [AGENTS.md](/AGENTS.md)「文档维护规则」。包级使用说明贴代码放（`packages/*/README.md`、`apps/mobile/docs/` 组件说明），本目录只放跨包系统知识。

## architecture/ — 架构事实

每个常设子系统一个文件或目录，替换式更新：只写「现在是什么」，改代码的同一提交里更新对应小节。

桌面可复用子 Agent 的会话、执行、权限与消息协议见 [子 Agent 架构](./architecture/subagents.md)。

桌面启动依赖与就绪信号见 [桌面架构](./architecture/desktop/main-process.md#构建与打包)，生产入口和 ASAR 核验步骤见 [客户端构建与安装](./guides/ops-client-build-install.md#桌面生产启动检查)。

| 位置                                                          | 内容                                                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [desktop/](./architecture/desktop/)                           | 桌面端权威交接文档目录：索引 README + 按域分篇（总览 / Page 协议 / UI 交互 / 数据基线 / 插件宿主 / 白板 / 主进程 / AI 会话 / 今日页数据）            |
| [AI 入口与能力](./architecture/ai-capabilities.md)            | 按产品场景查桌面、手机、浏览器伴读、插件和后台任务的提示词、模型分配、Skill、工具与审批范围                                                          |
| [design-system.md](./architecture/design-system.md)           | UI 设计系统：token 三层体系、多主题机制、组件分层                                                                                                    |
| 包内文档                                                      | database / whiteboard / editor 架构手册在各包 `docs/architecture.md`；editor-collab / markdown 的投影与缓存边界见各包 README                         |
| [storage-sync.md](./architecture/storage-sync.md)             | 数据库、资源与会话文件的宿主分块协议及内存边界                                                                                                       |
| [collaboration.md](./architecture/collaboration.md)           | 实时协作、白板推送与在线状态、同步诊断、当前格式边界与提交协议                                                                                       |
| [content-storage.md](./architecture/content-storage.md)       | 正文模型、身份与业务持有、会话接线、主库投影、跨端写入和耐久日志                                                                                     |
| [browser-companion.md](./architecture/browser-companion.md)   | 浏览器伴读扩展：/browser 连接与一次性授权、scope、标注与笔记数据、页内实现要点、官网分发                                                             |
| [platform-rpc.md](./architecture/platform-rpc.md)             | 跨端架构：命令/能力分离与 Web 适配                                                                                                                   |
| [mobile.md](./architecture/mobile.md)                         | 移动端页面栈与返回策略、AI 对话与图片生成、文档录音与转写、外部打开 Markdown、正文统计与空文档判断                                                   |
| [plugin-portability.md](./architecture/plugin-portability.md) | 桌面与移动插件宿主、应用生命周期、稳定材料引用与外链、AI 接线及正文适配；作者契约见 [SDK 包内文档](/plugins/tau-plugin-template/docs/portability.md) |
| [plugin-windows.html](./architecture/plugin-windows.html)     | 桌面插件窗口模块与时序图                                                                                                                             |

## decisions.md — 裁决规则

跨任务长期有效的通用裁决：按主题分节，条目一两句话、无编号，规则变化原地改写，被推翻即删。任务方案与过程决策不进本清单——方案跟任务走，结束沉淀进 architecture。

## preferences.md — 个人偏好

用户偏好与工作方式：喜欢什么、讨厌什么、什么场景——页面设计的输入。

## guides/ — 操作指南

未发布个人记忆的卡片知识摘要清理、预览和备份恢复见 [个人记忆清理](./guides/ops-personal-memory-cleanup.md)。

日常代码检查、格式化、代码行数统计、提交钩子与性能验证见 [代码检查与格式化](./guides/development-quality.md)；好代码的判据与正反例（类型纪律、拆分配方、注释与命名、错误处理、死代码、重构验证）见 [代码风格规范](./guides/dev-code-style.md)。

子 Agent 的批量、故障与本地 HTTP 测试步骤及判据见 [子 Agent 压测](./guides/dev-subagent-stress.md)。

跨端 SDK、统一模板与官方格式 3 插件的候选验证、真实 npm 冻结验证、发行顺序与分发包摘要核验见 [plugin-portability-sdk.md](./guides/plugin-portability-sdk.md)，真实客户端接入校验见 [plugin-portability-hosts.md](./guides/plugin-portability-hosts.md)。

客户端依赖准备、构建、覆盖安装及插件检查从 [客户端构建与安装](./guides/ops-client-build-install.md)进入；iOS 签名、归档、TestFlight 分发与设备安装见 [iOS 手册](./guides/ops-ios-signing.md)。

| 指南                                                                        | 内容                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------- |
| [db-change-manual.md](./guides/db-change-manual.md)                         | 数据库变更开发手册                                   |
| [db-schema-workflow.md](./guides/db-schema-workflow.md)                     | 数据库 Schema、建库与保留编号的结构升级              |
| [dev-domain-migration.md](./guides/dev-domain-migration.md)                 | 存量业务迁移步骤、端口与事务评审、行为对照及并行切片 |
| [dev-content-verification.md](./guides/dev-content-verification.md)         | 正文、白板与跨端回归入口，容量、硬杀和长稳判据       |
| [dev-mobile-recording.md](./guides/dev-mobile-recording.md)                 | 移动端录音、找回与转写验收                           |
| [ops-build-size.md](./guides/ops-build-size.md)                             | 安装包体积构成与产物一致性排查                       |
| [ops-client-build-install.md](./guides/ops-client-build-install.md)         | 客户端与浏览器扩展的发布、覆盖安装与交付检查         |
| [ops-ios-signing.md](./guides/ops-ios-signing.md)                           | iOS 签名、数据线一键安装、TestFlight                 |
| [ops-collaboration-deploy.md](./guides/ops-collaboration-deploy.md)         | 协作服务部署                                         |
| [ops-whiteboard-release.md](./guides/ops-whiteboard-release.md)             | 白板协作发布前验证与放行判据，不执行发布             |
| [ops-whiteboard-save-recovery.md](./guides/ops-whiteboard-save-recovery.md) | 工程排障用的白板证据保全、恢复与日志判读             |
| [ops-macos-code-signing.md](./guides/ops-macos-code-signing.md)             | macOS 代码签名与公证                                 |
| [ops-taunote-domains.md](./guides/ops-taunote-domains.md)                   | taunote.app 域名与服务器映射                         |
| [ops-telemetry-umami.md](./guides/ops-telemetry-umami.md)                   | 旧统计停用与历史数据恢复                             |
| [plugin-development.md](./guides/plugin-development.md)                     | 插件开发规范与验收                                   |
| [plugin-windows.md](./guides/plugin-windows.md)                             | 桌面插件窗口、自动外观、状态和消息                   |
| [writing-reader-docs.md](./guides/writing-reader-docs.md)                   | 使用文档、插件开发文档与插件 README 写法             |

## tasks/ — 进行中任务

一个任务一个目录或单文件，收尾三步见 [tasks/README.md](./tasks/README.md)；期限 90 天。

[Notebook 演示文稿按页生成与续改](./tasks/ppt-workspace/README.md) 记录 Agent 工作目录、页级正文、模型自检、旧稿处理及实物试跑结果。

[在当前白板与 Agent 共同编辑](./tasks/whiteboard-agent/README.md) 记录当前页 MCP 工具、协作身份、实时提交与压测验收计划。

[数据库关联数据源](./tasks/database-source.md) 记录新建数据库时关联卡片、文章、项目文档与日记的存储、写回与验证方案。

[功能开关与首次启动选用途](./tasks/feature-toggles.md) 记录设置 › 功能、侧栏就地隐藏、常用组合与新工作区首次启动的存储、接入点与验证方案。

当前作者清单、统一 API 与平台支持以 [SDK 跨端契约](/plugins/tau-plugin-template/docs/portability.md)、[SDK 支持矩阵](/plugins/tau-plugin-template/docs/portability.md#各平台可用的接口) 为准；宿主装配与必要校验边界见 [跨端插件架构](./architecture/plugin-portability.md)。官方插件和模板在 [plugins/](/plugins/README.md) 以子模块维护；豆包语音合成的协议与发行流程见其 [开发文档](/plugins/tau-plugin-tts-seed/DEVELOPMENT.md)。

## notes/ — 一次性产物

文件名日期前缀，写完即冻结，随时可删，禁止被引用。
