# 官方插件统一格式 3 发行记录

结果：24 个官方仓库（含模板）的线上最新发行均为格式 3。本次迁移的十个插件依赖桌面服务或业务接口，只声明 desktop；不增加未实现的移动目标。客户端未发布。

## 发行版本

| 插件            | 正式版本                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| Bilibili        | [0.2.2](https://github.com/LastKnightCoder/tau-plugin-bilibili/releases/tag/v0.2.2)       |
| YouTube         | [0.2.2](https://github.com/LastKnightCoder/tau-plugin-youtube/releases/tag/v0.2.2)        |
| 微信读书        | [1.0.11](https://github.com/LastKnightCoder/tau-plugin-weread/releases/tag/v1.0.11)       |
| 问题管理        | [0.1.3](https://github.com/LastKnightCoder/tau-plugin-questions/releases/tag/v0.1.3)      |
| 火柴人          | [0.1.8](https://github.com/LastKnightCoder/tau-plugin-stickman/releases/tag/v0.1.8)       |
| OpenAI 图片     | [0.2.5](https://github.com/LastKnightCoder/tau-plugin-images-openai/releases/tag/v0.2.5)  |
| MiniMax 语音    | [0.1.8](https://github.com/LastKnightCoder/tau-plugin-tts-minimax/releases/tag/v0.1.8)    |
| Qwen 语音       | [0.1.8](https://github.com/LastKnightCoder/tau-plugin-tts-qwen/releases/tag/v0.1.8)       |
| GitHub 博客发布 | [0.1.5](https://github.com/LastKnightCoder/tau-plugin-publish-github/releases/tag/v0.1.5) |
| S3 博客发布     | [0.1.5](https://github.com/LastKnightCoder/tau-plugin-publish-s3/releases/tag/v0.1.5)     |

SDK 最终发行 [0.40.0](https://www.npmjs.com/package/@xiongtao.xt/tau-plugins/v/0.40.0)，UI 沿用 0.5.0。统一模板 main 更新至 20bdde9。插件 ID、业务数据结构和配置归属保持不变；微信读书与问题管理保留各自的 Tailwind 编译，问题管理保留 Skill。十个插件的构建器只接受格式 3 作者清单。

## 白板边界修正

初版 SDK 0.39.0 和火柴人 0.1.7 沿用作者 whiteboard:true，并新增同名能力标签。用户明确要求同时收敛这两层；修正版使用更高版本，不覆盖已发布包。

最终作者只保留既有 whiteboardExtensions 和 targets，不重复填写白板类型，也不声明白板能力标签。构建器把 esbuild 的真实宿主模块依赖传给通用构建输入，SDK 自动生成内部装配信息；不执行作者插件来推导类型。宿主继续对账实际静态贡献。白板安装约束统一为 desktop 及最低版本 0.59.3，桌面源码版本相应准备，未构建或发布客户端安装包。

## 验证

- SDK 279 项测试、两端与中心类型检查通过，中心 API 102 项及网页 96 项测试通过。
- 十个插件及模板使用正式 npm 包完成独立目录冻结安装、构建与已有测试；火柴人与模板又使用正式 SDK 0.40.0 复验。模板专项契约验证复用源锁文件，通过全部检查。
- 实际 ZIP 经原生读取、摘要检查和桌面共享模块求值；白板静态贡献保持，十包在 Android/iOS 求值前被平台声明拒绝。现有白板偏好和内容目录回归通过。
- 十个插件均由原工作流经 OIDC 提交到中心，CI 成功并自动批准；火柴人修正版另行完成同一流程。所有公开 ZIP 与 GitHub 资产、中心 SHA-256 以及正式 npm 验证构建的清单一致。
- 对 24 个官方插件及模板逐一查询线上最新发行，包格式均为 3。历史已发布包不改写。

## 中心与客户端

中心 API 最终版本 8f231e49-e51c-4e03-837a-81b7405e4b81，Pages 1bf975a5，源码 7aab3c96d。发行前完成仓库外 D1 备份，无数据库迁移、Secrets 或平台开关变更；部署和线上 smoke 通过。一次备份请求失败后流程停止，重试成功后才部署。

本地原始证据保存在当前 worktree 的 output/remaining-format3/，含候选及正式 npm 报告、SDK 下载摘要、CI、中心元数据、公开 ZIP、24 包格式审计和部署记录；不进入版本库。临时部署 worktree 已清理。

本次没有新增真实存储账号、真机或视觉验收，没有发布桌面、Android 或 iOS 客户端。
