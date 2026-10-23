# Tau 文档地图

按文档生命周期分区，规则见根 [AGENTS.md](/AGENTS.md)「文档维护规则」。包级使用说明贴代码放（`packages/*/README.md`、`apps/mobile/docs/` 组件说明），本目录只放跨包系统知识。

## architecture/ — 架构事实

每个常设子系统一个文件或目录，替换式更新：只写「现在是什么」，改代码的同一提交里更新对应小节。

| 位置                                                          | 内容                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [desktop.md](./architecture/desktop.md)                       | 桌面端权威交接文档：Page 协议、三大协议、交互规范、数据接线                                                |
| [design-system.md](./architecture/design-system.md)           | UI 设计系统：token 三层体系、多主题机制、组件分层                                                          |
| 包内文档                                                      | database / whiteboard / editor 三包的架构手册在各包 `docs/architecture.md`；边界与公开入口见各包 README    |
| [collaboration.md](./architecture/collaboration.md)           | 实时协作功能与架构                                                                                         |
| [platform-rpc.md](./architecture/platform-rpc.md)             | 跨端架构：命令/能力分离与 Web 适配                                                                         |
| [mobile.md](./architecture/mobile.md)                         | 移动端页面栈与返回策略                                                                                     |
| [plugin-system.md](./architecture/plugin-system.md)           | 插件体系目标架构与能力                                                                                     |
| [plugin-portability.md](./architecture/plugin-portability.md) | 桌面与移动插件宿主、私有包事务及正文适配；作者契约见 [SDK 包内文档](/packages/plugins/docs/portability.md) |
| [plugin-system/](./architecture/plugin-system/)               | 插件体系：安全模型、运行架构、API 闭环、边界约定与能力说明                                                 |
| [knowledge-loop/](./architecture/knowledge-loop/)             | 知识闭环：产品方向与技术方案                                                                               |

## decisions.md — 裁决规则

跨任务长期有效的通用裁决：按主题分节，条目一两句话、无编号，规则变化原地改写，被推翻即删。任务方案与过程决策不进本清单——方案跟任务走，结束沉淀进 architecture。

## preferences.md — 个人偏好

用户偏好与工作方式：喜欢什么、讨厌什么、什么场景——页面设计的输入。

## guides/ — 操作指南

跨端 SDK 与统一模板本地验证见 [plugin-portability-sdk.md](./guides/plugin-portability-sdk.md)，真实客户端接入校验见 [plugin-portability-hosts.md](./guides/plugin-portability-hosts.md)。

| 指南                                                                | 内容                                 |
| ------------------------------------------------------------------- | ------------------------------------ |
| [db-change-manual.md](./guides/db-change-manual.md)                 | 数据库变更开发手册                   |
| [db-schema-workflow.md](./guides/db-schema-workflow.md)             | 数据库 Schema 与建库流程             |
| [ops-build-size.md](./guides/ops-build-size.md)                     | 安装包体积构成与产物一致性排查       |
| [ops-collaboration-deploy.md](./guides/ops-collaboration-deploy.md) | 协作服务部署                         |
| [ops-mac-verification.md](./guides/ops-mac-verification.md)         | mac 实机验证 runbook                 |
| [ops-macos-code-signing.md](./guides/ops-macos-code-signing.md)     | macOS 代码签名与公证                 |
| [ops-taunote-domains.md](./guides/ops-taunote-domains.md)           | taunote.app 域名与服务器映射         |
| [ops-telemetry-umami.md](./guides/ops-telemetry-umami.md)           | Umami 统计部署与埋点（旧版维护资料） |
| [plugin-development.md](./guides/plugin-development.md)             | 插件开发规范与验收                   |
| [plugin-portability-spike.md](./guides/plugin-portability-spike.md) | 桌面、Android、iOS 插件验证操作      |

## tasks/ — 进行中任务

一个任务一个目录或单文件，收尾三步见 [tasks/README.md](./tasks/README.md)；期限 90 天。

进行中的跨端接入见 [B–D 任务](./tasks/plugin-portability-bcd/README.md)；SDK、清单、移动与网页中心分发及旧插件兼容的后续设计见同任务的 [正式接入方案](./tasks/plugin-portability-bcd/distribution-plan.md)。D 的待验收项继续保留。

协议逻辑与网站/移动 UI 的并行协作见 [工作分工](./tasks/plugin-portability-bcd/work-split.md)，可转发任务见 [UI 专家 prompt](./tasks/plugin-portability-bcd/ui-expert-prompt.md)。

已交付的共享类型、数据入口与 PluginManager 控制器见 [逻辑实现与交接](./tasks/plugin-portability-bcd/logic-handoff.md)。

API 支持范围以 [SDK 支持矩阵](/packages/plugins/docs/api-support.md) 为准；当前的前向兼容、统一模板与作者文档收尾见 [API 契约任务](./tasks/plugin-portability-bcd/api-contract.md)。

本轮已确认的作者接口方案见 [作者契约](./tasks/plugin-portability-bcd/author-contract-draft.md)，实施与设备验证见 [编辑器移动适配](./tasks/plugin-portability-bcd/editor-mobile.md)。官方插件和模板在 [plugins/](/plugins/README.md) 以子模块维护；候选实现不代表已发布。

SDK 0.37.0 的正式 npm 发布、24 仓构建及 CI 结果见 [SDK 发行](./tasks/plugin-portability-bcd/sdk-037-release.md)。24 个官方包、Worker 与网页已上线，macOS / Android 正式包已交付，用户已确认两端功能测试通过；发行证据与专项边界见 [正式安装闭环](./tasks/plugin-portability-bcd/production-closeout.md)。APP 文件尚未上传更新服务器，iOS 签名与 D 的专项验收继续保留。

## notes/ — 一次性产物

文件名日期前缀，写完即冻结，随时可删，禁止被引用。
