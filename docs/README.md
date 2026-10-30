# Tau 文档地图

按文档生命周期分区，规则见根 [AGENTS.md](/AGENTS.md)「文档维护规则」。包级使用说明贴代码放（`packages/*/README.md`、`apps/mobile/docs/` 组件说明），本目录只放跨包系统知识。

## architecture/ — 架构事实

每个常设子系统一个文件或目录，替换式更新：只写「现在是什么」，改代码的同一提交里更新对应小节。

| 位置                                                          | 内容                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [desktop.md](./architecture/desktop.md)                       | 桌面端权威交接文档：Page 协议、三大协议、交互规范、数据接线、Markdown 会话、只读首屏、目录性能及扩展字数协议                   |
| [design-system.md](./architecture/design-system.md)           | UI 设计系统：token 三层体系、多主题机制、组件分层                                                                              |
| 包内文档                                                      | database / whiteboard / editor 架构手册在各包 `docs/architecture.md`；editor-collab / markdown 的投影与缓存边界见各包 README   |
| [storage-sync.md](./architecture/storage-sync.md)             | 数据库、资源与会话文件的宿主分块协议及内存边界                                                                                 |
| [collaboration.md](./architecture/collaboration.md)           | 实时协作、白板推送与在线状态、同步诊断、当前格式边界与提交协议                                                                 |
| [browser-companion.md](./architecture/browser-companion.md)   | 浏览器伴读扩展：/browser 连接与一次性授权、scope、标注与笔记数据、页内实现要点                                                 |
| [platform-rpc.md](./architecture/platform-rpc.md)             | 跨端架构：命令/能力分离与 Web 适配                                                                                             |
| [mobile.md](./architecture/mobile.md)                         | 移动端页面栈与返回策略、外部打开 Markdown、正文统计与空文档判断                                                                |
| [plugin-system.md](./architecture/plugin-system.md)           | 插件体系目标架构与能力                                                                                                         |
| [plugin-portability.md](./architecture/plugin-portability.md) | 桌面与移动插件宿主、AI 接线、私有包事务及正文适配；作者契约见 [SDK 包内文档](/plugins/tau-plugin-template/docs/portability.md) |
| [plugin-system/](./architecture/plugin-system/)               | 插件体系：安全模型、运行架构、API 闭环、边界约定与能力说明                                                                     |
| [knowledge-loop/](./architecture/knowledge-loop/)             | 知识闭环：产品方向与技术方案                                                                                                   |

## decisions.md — 裁决规则

跨任务长期有效的通用裁决：按主题分节，条目一两句话、无编号，规则变化原地改写，被推翻即删。任务方案与过程决策不进本清单——方案跟任务走，结束沉淀进 architecture。

## preferences.md — 个人偏好

用户偏好与工作方式：喜欢什么、讨厌什么、什么场景——页面设计的输入。

## guides/ — 操作指南

日常代码检查、格式化、提交钩子与性能验证见 [代码检查与格式化](./guides/development-quality.md)。

跨端 SDK、统一模板与官方格式 3 插件的候选验证、真实 npm 冻结验证、发行顺序与分发包摘要核验见 [plugin-portability-sdk.md](./guides/plugin-portability-sdk.md)，真实客户端接入校验见 [plugin-portability-hosts.md](./guides/plugin-portability-hosts.md)。

客户端依赖准备、构建、覆盖安装及插件检查从 [客户端构建与安装](./guides/ops-client-build-install.md)进入；iOS 签名、归档、TestFlight 分发与设备安装见 [iOS 手册](./guides/ops-ios-signing.md)。

| 指南                                                                | 内容                                     |
| ------------------------------------------------------------------- | ---------------------------------------- |
| [db-change-manual.md](./guides/db-change-manual.md)                 | 数据库变更开发手册                       |
| [db-schema-workflow.md](./guides/db-schema-workflow.md)             | 数据库 Schema 与建库流程                 |
| [ops-build-size.md](./guides/ops-build-size.md)                     | 安装包体积构成与产物一致性排查           |
| [ops-client-build-install.md](./guides/ops-client-build-install.md) | 客户端构建、覆盖安装与交付检查           |
| [ops-ios-signing.md](./guides/ops-ios-signing.md)                   | iOS 签名、图标同步、TestFlight 与安装    |
| [ops-collaboration-deploy.md](./guides/ops-collaboration-deploy.md) | 协作服务部署                             |
| [ops-whiteboard-release.md](./guides/ops-whiteboard-release.md)     | 白板协作发布前验证与放行判据，不执行发布 |
| [ops-mac-verification.md](./guides/ops-mac-verification.md)         | mac 实机验证 runbook                     |
| [ops-macos-code-signing.md](./guides/ops-macos-code-signing.md)     | macOS 代码签名与公证                     |
| [ops-taunote-domains.md](./guides/ops-taunote-domains.md)           | taunote.app 域名与服务器映射             |
| [ops-telemetry-umami.md](./guides/ops-telemetry-umami.md)           | 旧统计停用与历史数据恢复                 |
| [plugin-development.md](./guides/plugin-development.md)             | 插件开发规范与验收                       |

## tasks/ — 进行中任务

一个任务一个目录或单文件，收尾三步见 [tasks/README.md](./tasks/README.md)；期限 90 天。

- [移动端 AI 基础能力](./tasks/mobile-ai-foundation/README.md)：公共会话 v3、移动无 UI 服务、原生网络存储、MCP/Skills 与聊天同步已接入，待实际存储插件往返及设备验收。

- [移动插件业务授权与数据访问](./tasks/mobile-plugin-data/README.md)：六批授权、业务读写恢复、引用交互、自有数据事务、实体检索/@/打开与公共正文组件已实现并通过自动检查；待设备及真实共享服务验收，暂不发布。

- [浏览器扩展重写：页内伴读](./tasks/browser-companion/README.md)：悬浮球 + 就地标注 / 笔记 / 提问，扩展经一次性授权连 Tau；已实现，待真实浏览器联调与视觉验收。
- [提供方表单两端渲染补全](./tasks/provider-form-hosts/README.md)：TTS / ASR / 图片 / 视频 / 发布的声明式表单由宿主渲染，入口统一在插件详情 › 设置，发布抽屉内嵌、语音输入设置接回；SDK 0.48.0 与九个插件已发布，待包含本任务的客户端发布与视觉验收。
- [长文档视口级挂载](./tasks/long-document-viewport.md)：暂缓、未排期，保留范围与业务验收边界。
- [移动端字号规范](./tasks/mobile-typography.md)：9 档字号阶梯；档位覆盖与卡片列表/详情同字号已落地，存量字面字号待分批迁移。
- [移动端语音输入入口](./tasks/mobile-voice-input.md)：配件栏与阅读态「按住说话」、正文流式预览、一次性写入及 Android/iOS 原生系统识别已实现；Android 厂商识别差异、iOS 识别行为待真机验收；AI 润色界面已备好、待 AI 配置接入；视觉验收待用户完成。
- [移动端源码块交互](./tasks/mobile-source-block.md)：TikZ / Typst / HTML 等源码块改为点选 + 配件栏 + 分屏源码页；方案已确认，未开工。
- [移动端正文字体](./tasks/mobile-reading-font.md)：可选霞鹜文楷 / 思源宋体，按需下载、全量字库；字体已上线，待真机验收。
- [桌面语音输入与统一 ASR](./tasks/desktop-asr/README.md)：Windows 验证完成，保留 NSIS、本轮不开放原生；产品入口仍撤回，其他设备与真实账号验收保留。当前只整理文档、不发布新 SDK，0.44.0 发布包与源码差异见任务发行记录。
- [白板 Yjs 协作与插件数据契约](./tasks/whiteboard-collaboration/README.md)：W9 容量与三端长会话验证通过，联合行为回归 4868 项通过；[正式版本核对](./tasks/whiteboard-collaboration/validation/w9-release-compatibility.md)仍未放行发行。[火柴人候选适配](./tasks/whiteboard-collaboration/validation/w9-stickman-compatibility.md)已完成本地 SDK、实际插件与服务构建联验，新增 15 项测试和 3665 项相关回归通过。UI 接线由独立会话负责。

- [桌面语音输入与统一 ASR](./tasks/desktop-asr/README.md)：Windows 验证完成，保留 NSIS、本轮不开放原生；产品入口仍撤回，其他设备与真实账号验收保留。当前只整理文档、不发布新 SDK，0.44.0 发布包与源码差异见任务发行记录。

进行中的跨端接入见 [B–D 任务](./tasks/plugin-portability-bcd/README.md)；SDK、清单、移动与网页中心分发及旧插件兼容的后续设计见同任务的 [正式接入方案](./tasks/plugin-portability-bcd/distribution-plan.md)。D 的待验收项继续保留。

协议逻辑与网站/移动 UI 的并行协作见 [工作分工](./tasks/plugin-portability-bcd/work-split.md)，可转发任务见 [UI 专家 prompt](./tasks/plugin-portability-bcd/ui-expert-prompt.md)。

已交付的共享类型、数据入口与 PluginManager 控制器见 [逻辑实现与交接](./tasks/plugin-portability-bcd/logic-handoff.md)。

当前作者清单、统一 API 与平台支持以 [SDK 跨端契约](/plugins/tau-plugin-template/docs/portability.md)、[SDK 支持矩阵](/plugins/tau-plugin-template/docs/portability.md#各平台可用的接口) 为准；宿主装配与必要校验边界见 [跨端插件架构](./architecture/plugin-portability.md)。

设备验证与待验收范围见 [编辑器移动适配](./tasks/plugin-portability-bcd/editor-mobile.md)。官方插件和模板在 [plugins/](/plugins/README.md) 以子模块维护；候选实现不代表已发布。

SDK 0.37.0 的正式 npm 发布、24 仓构建及 CI 结果见 [SDK 发行](./tasks/plugin-portability-bcd/sdk-037-release.md)。24 个官方包、Worker 与网页已上线，macOS / Android 正式包已交付，用户已确认两端功能测试通过；发行证据与专项边界见 [正式安装闭环](./tasks/plugin-portability-bcd/production-closeout.md)。[iOS 正式 IPA](./tasks/plugin-portability-bcd/ios-release.md) 已进入 [TestFlight 内部测试](./tasks/plugin-portability-bcd/testflight.md)，图标修复后的 0.2.3（2）可供本人测试，iOS 插件分发已开放；未提交 App Store 正式上架，真机与 D 专项继续保留。

## notes/ — 一次性产物

文件名日期前缀，写完即冻结，随时可删，禁止被引用。
