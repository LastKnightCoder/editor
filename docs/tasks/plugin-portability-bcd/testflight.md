# iOS 插件中心与 TestFlight

目标：先开放 iOS 正式插件分发，再上传已核验的 0.2.3 / Build 1 到 TestFlight，供用户拿到 iPhone 后安装测试。

## 范围与决策

- 用户授权上传现有 IPA 到 TestFlight；不提交 App Store 正式上架。
- 用户补充要求先开放 iOS 插件中心。客户端入口及原生安装能力已经接入，需开放生产 Worker 平台开关并验证真实目录、选版和下载。
- 沿用同一插件 ZIP、当前 SDK 与正式来源，不扩展 API。保留原交付 IPA，使用其对应的已验签名归档上传；不重新编译业务代码。
- 登录、协议或需要本人处理的系统确认交给用户；不新建不必要的 API 密钥。
- 用户确认本轮仅本人内部测试，不在法国分发。出口合规回答按实际 Rustls 标准 TLS 使用与该分发范围填写；未来改变加密实现或法国分发范围时重新核对，不沿用为永久声明。
- 生产接口检查与 TestFlight 可安装状态分别核验；iOS 真机及 D 专项不因此自动通过。

## 任务列表

当前环境没有任务列表工具，在本文件维护单一进行中任务。

| 任务                                      | 状态     | 结果与下一步                                                                                                                                 |
| ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | IPA 摘要未变；iOS 原生 browsingEnabled / installationEnabled 已打开，入口在“我的”；线上仅未开放 iOS 分发。Worker 基线 0c0b96b2，无待迁移项。 |
| 开放 iOS 分发与生产接口验收               | COMPLETE | Worker 6d504ef2 已上线；iOS 0.2.3 七包可选版并下载，摘要与原统一包一致，0.2.2 仍受最低版本限制。                                             |
| TestFlight 上传与可安装状态               | COMPLETE | 0.2.3 / Build 1 已处理完成、合规信息已保存、状态“正在测试”；本人内部群组包含 1 名测试员和 1 个构建，账号显示“已邀请”。                       |
| 文档与交付                                | COMPLETE | 中心状态、内部测试入口、操作指南与索引同步；不提交正式上架，iOS 真机和 D 专项保留。                                                          |

## 客户端与部署边界

- PluginEntries 从原生 browsingEnabled 决定入口，iOS 正式构建的该值与 installationEnabled 均为 true；无需改 UI 或重新导出 IPA。
- 服务端 PORTABLE_PLATFORMS 决定格式 3 是否推荐/允许安装。本轮从 desktop,android 增加 ios，仍逐包检查平台声明、最低版本、能力、发布状态与摘要；不会让 17 个仅桌面业务插件在 iOS 安装。
- 本轮不修改数据库 schema、Secrets、网页或插件 ZIP。生产 Worker 与本分支部署代码基线一致，源代码差异仅为本次平台配置。

## 生产开放证据

- 配置提交 5c49d7fad；Worker 6d504ef2-1faa-4515-951f-407df756a940 已部署，PORTABLE_PLATFORMS=desktop,android,ios。没有数据库迁移或 Secrets、网页修改；D1 备份为私有目录中的 2026-10-23T12-28-50-623Z.sql。
- 部署前 API 102、网页 96 项、两端类型与 Worker dry-run 通过；部署后公网 smoke 通过。
- 使用当前原生能力集合和 ios / 0.2.3 请求生产目录、精确 resolve、status 与下载：计数器 1.2.0、ABC 0.1.7、HTML 0.1.6、自定义组件 1.0.9、TikZ 0.1.6、Typst 0.2.2、图册 0.1.2 全部 compatible，发布状态 available，实际 ZIP 大小与 SHA-256 和前批桌面/Android 同包一致。
- ios / 0.2.2 仍被 APP_VERSION_TOO_LOW 拒绝，未绕过最低版本限制。报告为 output/testflight/ios-center-after.json，开放前对照为 ios-center-before.json；这些是生产接口验证，不替代真机安装。

## TestFlight 处理

- 用户本人完成 App Store Connect 首次服务条款确认；创建 Tau 应用记录，Apple ID 6826237467、Bundle ID com.txiong.tau-mobile、主要语言简体中文、SKU com.txiong.tau-mobile。
- 当前机器没有 Transporter，使用已登录的 Xcode Organizer 上传已核验 IPA 对应的 Tau-0.2.3.xcarchive（0.2.3 / Build 1），选择 TestFlight Internal Only。Xcode 会为上传处理同一归档；原交付 IPA 保持不变，不将上传处理包摘要冒充原 IPA 摘要。
- 未重新编译业务代码，未点击“添加以供审核”。App Store 自动生成的 1.0 草稿保持未提交，与 TestFlight 构建 0.2.3 独立。
- Xcode 返回 Upload completed with warnings：上传完成，唯一警告为 Apple 提示从 2027 年 4 月起需将最低 iOS 从 14.0 提高至至少 15.0；本次未因此失败，不擅自更改已验收构建。TestFlight 后续处理已完成。
- TestFlight 已识别构建 0.2.3 / 1，构建 ID 60ffed8f-b72b-43cd-9863-d981c79ab184。处理后要求补充出口合规：根据 reqwest/rustls-tls 与 hyper-rustls 依赖选择标准加密算法；法国分发问题由用户明确确认“否”，未替用户推断。
- 创建 Tau 内部测试群组 ef3c96e3-7edc-4599-9b23-dd86da0445de，只加入当前账号持有人；关闭自动分发，后续新构建仍需主动添加，不自动扩大测试范围。
- 已保存出口合规回答，将 0.2.3 / Build 1 加入该群组；构建状态为“正在测试”，群组显示“1 个测试员 ∙ 1 个构建版本”，本人账号显示“已邀请”（2026-10-23 20:45）。未查看邮箱或声称设备已经安装。

## 用户安装与后续边界

1. iPhone 到手后从 App Store 安装 TestFlight，使用本次内部测试账号接受 Apple 测试邀请并安装 Tau 0.2.3（1）。如果收件箱没有邀请，先检查垃圾邮件；后台账号必须已加入群组。
2. 打开 Tau → 我的 → 插件中心，安装计数器和六个编辑器插件，完整退出重开后验收页面与正文交互。
3. 本次只做内部测试，不创建公开邀请链接、不邀请其他人、不点击正式“添加以供审核”。App Store 1.0 草稿保持未提交。
4. 真机、最低系统、平板、性能与云同步等 D 项继续保留；未来改变法国分发范围或加密实现时重新核对合规回答。

管理入口：[TestFlight 构建](https://appstoreconnect.apple.com/teams/1bb7a854-44c1-4859-a4ee-3eadd17458ee/apps/6826237467/testflight/ios)、[内部测试群组](https://appstoreconnect.apple.com/teams/1bb7a854-44c1-4859-a4ee-3eadd17458ee/apps/6826237467/testflight/groups/ef3c96e3-7edc-4599-9b23-dd86da0445de)。

## 验证与退出条件

本轮中心开放、TestFlight 处理、本人群组与邀请已完成；运行中的 Worker 和平台状态已核对，发布流程沉淀到操作指南、索引同步。设备实际安装尚待用户拿到手机，父任务 D 不退役，本记录随父任务收尾。
