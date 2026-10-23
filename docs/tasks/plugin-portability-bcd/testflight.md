# iOS 插件中心与 TestFlight

目标：先开放 iOS 正式插件分发，再上传已核验的 0.2.3 / Build 1 到 TestFlight，供用户拿到 iPhone 后安装测试。

## 范围与决策

- 用户授权上传现有 IPA 到 TestFlight；不提交 App Store 正式上架。
- 用户补充要求先开放 iOS 插件中心。客户端入口及原生安装能力已经接入，需开放生产 Worker 平台开关并验证真实目录、选版和下载。
- 沿用同一插件 ZIP、当前 SDK 与正式来源，不扩展 API，不重新打包已验证 IPA。
- 登录、协议或需要本人处理的系统确认交给用户；不新建不必要的 API 密钥。
- 生产接口检查与 TestFlight 可安装状态分别核验；iOS 真机及 D 专项不因此自动通过。

## 任务列表

当前环境没有任务列表工具，在本文件维护单一进行中任务。

| 任务                                      | 状态        | 结果与下一步                                                                                                                                 |
| ----------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE    | IPA 摘要未变；iOS 原生 browsingEnabled / installationEnabled 已打开，入口在“我的”；线上仅未开放 iOS 分发。Worker 基线 0c0b96b2，无待迁移项。 |
| 开放 iOS 分发与生产接口验收               | IN_PROGRESS | 只增加平台开关，备份 D1 后部署 Worker，核对七包 iOS 0.2.3 选版与下载摘要。                                                                   |
| TestFlight 上传与可安装状态               | PENDING     | 核对应用记录，上传已核验 IPA，等待处理并配置本人内部测试；不提交正式上架。                                                                   |
| 文档与交付                                | PENDING     | 更新中心状态与测试入口，保留 iOS 真机和 D 专项验收。                                                                                         |

## 客户端与部署边界

- PluginEntries 从原生 browsingEnabled 决定入口，iOS 正式构建的该值与 installationEnabled 均为 true；无需改 UI 或重新导出 IPA。
- 服务端 PORTABLE_PLATFORMS 决定格式 3 是否推荐/允许安装。本轮从 desktop,android 增加 ios，仍逐包检查平台声明、最低版本、能力、发布状态与摘要；不会让 17 个仅桌面业务插件在 iOS 安装。
- 本轮不修改数据库 schema、Secrets、网页或插件 ZIP。生产 Worker 与本分支部署代码基线一致，源代码差异仅为本次平台配置。

## 验证与退出条件

记录 Worker 版本、iOS 真实宿主选版与下载摘要、App Store Connect 应用和构建状态；确认用户能通过 TestFlight 获取构建，不把上传成功等同于可安装。任务随父任务 D 收尾。
