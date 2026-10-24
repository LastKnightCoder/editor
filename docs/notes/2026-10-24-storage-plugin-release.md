# 同步与上传插件发行记录

发行范围：SDK、UI、统一模板和七个同步/上传插件。客户端未发布；公网直链上传维持原有契约。

## npm 与模板

| 产物                                                                              | 版本与结果                                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [插件 SDK](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.38.0)       | 0.38.0，公开可下载                                                    |
| [UI 包](https://www.npmjs.com/package/@xiongtao.xt/tau-ui/v/0.5.0)                | 0.5.0，公开可下载                                                     |
| [统一模板](https://github.com/LastKnightCoder/tau-plugin-template/commit/93644c9) | main 更新至 93644c9；更新依赖、锁文件及作者文档，不另行上架计数器示例 |

两个 npm 包的注册表 dist.integrity 与本地发行包一致，公开下载字节也逐一相同。npm 接受上传后经历发布扫描，等待实际可下载后才执行正式作者验证。

模板与七个提供方均在仓库外的独立目录使用真实 npm 包完成冻结安装、构建及已有测试，报告 sdkSource 为 npm；模板还完成独立作者契约验证，templateLockfileReused 为 true。安装不注入本地 tarball。各仓 main 与待发标签使用同一批已验证提交。

## 插件发行

| 插件        | 正式版本                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------- |
| GitHub 同步 | [0.3.0](https://github.com/LastKnightCoder/tau-plugin-github/releases/tag/v0.3.0)        |
| OSS 同步    | [0.3.0](https://github.com/LastKnightCoder/tau-plugin-oss/releases/tag/v0.3.0)           |
| S3 同步     | [0.4.0](https://github.com/LastKnightCoder/tau-plugin-s3/releases/tag/v0.4.0)            |
| WebDAV 同步 | [0.3.0](https://github.com/LastKnightCoder/tau-plugin-webdav/releases/tag/v0.3.0)        |
| GitHub 上传 | [0.3.0](https://github.com/LastKnightCoder/tau-plugin-upload-github/releases/tag/v0.3.0) |
| OSS 上传    | [0.3.0](https://github.com/LastKnightCoder/tau-plugin-upload-oss/releases/tag/v0.3.0)    |
| S3 上传     | [0.3.0](https://github.com/LastKnightCoder/tau-plugin-upload-s3/releases/tag/v0.3.0)     |

七个版本均由既有 GitHub Actions 经 OIDC 提交至插件中心并自动批准发布，没有人工代审批。全部工作流成功；每个中心公开 ZIP 的 SHA-256 与 GitHub 发行资产及中心元数据一致。ZIP 内各文件摘要通过，格式 3 清单与真实 npm 验证构建完全一致，均声明 desktop/android/ios。

## 中心发行依赖

首次 CI 提交因线上中心不认识 fetch/sync/upload 被拒绝。补部署公共能力词表，并补齐网页类型检查所需的三个中文名称；没有修改平台开关、数据库结构或 Secrets，也没有发布中心网页。

部署源码为 062e63006，Worker 版本为 fce467c5-3dad-44bb-a1e0-ba78b667316a；原 Worker 为 6d504ef2-1faa-4515-951f-407df756a940。部署前完成仓库外 D1 备份；类型检查、102 项 API 和 96 项网页测试通过，正式预构建、部署及线上 smoke 通过。随后重试原 CI，保留插件版本与源码提交。

## 本地证据与边界

当前 worktree 的 output/storage-release/ 保留 npm 摘要、真实作者报告、模板报告、发行提交、CI 状态、中心发布元数据、下载 ZIP 与部署记录；这些本地产物不进入版本库。临时部署 worktree 已清理。

此次验证覆盖公开包安装、构建、已有行为测试与发行产物一致性；未新增手机真机、真实存储账号或视觉验收，未发布桌面、Android、iOS 客户端。
